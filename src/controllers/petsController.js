const { pool } = require('../config/db');
const { uploadToS3, deleteFromS3, upload } = require('../config/s3');
const { broadcast } = require('../services/websocket');

const getStatus = async (req, res) => {
    const result = await pool.query('SELECT * FROM "StatusPets"');
    return res.status(200).json({message: 'Данные успешно получены!', data: result.rows});
}

const getStatusVaccination = async (req, res) => {
    const result = await pool.query('SELECT * FROM "StatusVaccination"');
    return res.status(200).json({message: 'Данные успешно получены!', data: result.rows});
}

const getCategory = async (req, res) => {
    const result = await pool.query('SELECT * FROM "PetsCategory"');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const getShelters = async (req, res) => {
    const result = await pool.query('SELECT * FROM "Shelter"');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const getPets = async (req, res) => {
    const { text, shelter } = req.query;

    if (!shelter) {
        return res.status(400).json({ message: 'Не получен приют!' });
    }

    try {
        let baseQuery = `
            SELECT p.id_pets, p.nickname, p.age, st.id_status_pets, st.name_status as status, p.description, c.id_category, c.name_category as category,
                   s.id_shelter, s.name_shelter as shelter, p.sex, sv.id_status, sv.name_status as status_vac,
                   COALESCE(json_agg(pi.image_url) FILTER (WHERE pi.image_url IS NOT NULL),'[]') as images
            FROM "Pets" p
            LEFT JOIN "StatusPets" st ON p.status_id = st.id_status_pets 
            LEFT JOIN "PetsCategory" c ON p.category_id = c.id_category
            LEFT JOIN "Shelter" s ON p.shelter_id = s.id_shelter
            LEFT JOIN "StatusVaccination" sv ON p.vaccination_id = sv.id_status
            LEFT JOIN "PetsImages" pi ON p.id_pets = pi.pets_id
            WHERE p.shelter_id = $1`;

        let params = [shelter];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(p.id_pets AS TEXT) ILIKE $2 OR p.nickname ILIKE $2 OR CAST(p.age AS TEXT) ILIKE $2 OR st.name_status ILIKE $2
            OR p.description ILIKE $2 OR c.name_category ILIKE $2 OR s.name_shelter ILIKE $2 OR p.sex ILIKE $2 OR sv.name_status ILIKE $2)`;
            params.push( `%${text}%` );
        }

        baseQuery += ` 
        GROUP BY p.id_pets, st.id_status_pets, c.id_category, s.id_shelter, sv.id_status
        ORDER BY p.nickname ASC`;

        const result = await pool.query(baseQuery, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Данные отсутствуют!' });
        }
        return res.status(200).json({ message: 'Данные получены!', data: result.rows });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Не удалось вернуть данные!' });

    }
}

const addPets = async (req, res) => {
    const {nickname, age, status_id, description, category_id, shelter_id, sex, vaccination_id} = req.body;
    let files = req.files;

    if (!nickname || !age || !status_id || !description || !category_id || !shelter_id || !sex || !vaccination_id) {
        return res.status(400).json({ message: 'Все поля обязательны!' });
    }

    try {
        const petExists = await pool.query(
            'SELECT * FROM "Pets" WHERE nickname = $1 AND shelter_id = $2', [nickname, shelter_id]
        );

        if (petExists.rows.length > 0) {
            return res.status(401).json({message: 'Питомец с такой кличкой в приюте уже существует!'});
        }

        const petsResult = await pool.query(
            'INSERT INTO "Pets" (nickname, age, status_id, description, category_id, shelter_id, sex, vaccination_id)' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [nickname, age, status_id, description, category_id, shelter_id, sex, vaccination_id]
        );

        const imageUrls = await Promise.all(
            files.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "PetsImages" (pets_id, image_url) VALUES ($1, $2)',
                    [petsResult.rows[0].id_pets, url]
                );
                return url;
            })
        );

        broadcast({event:'pets-add', data: {...petsResult.rows[0], images: imageUrls}});
        return res.status(201).json({message: 'Регистрация выполнена!', pets: petsResult.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки'});
    }
}

const updatePets = async (req, res) => {
    const {id} = req.params;
    const {nickname, age, status_id, description, category_id, shelter_id, sex, vaccination_id, deletedImages} = req.body;
    let newFiles = req.files;

    if (!nickname || !age || !status_id || !description || !category_id || !shelter_id || !sex || !vaccination_id) {
        return res.status(400).json({ message: 'Все поля обязательны!' });
    }

    try {
        const petExists = await pool.query(
            'SELECT * FROM "Pets" WHERE id_pets = $1', [id]
        );

        if (petExists.rows.length === 0) {
            return res.status(403).json({message: 'Такой питомец не найден!'});
        }

        if (nickname && shelter_id) {
            const petExistsName = await pool.query(
                'SELECT * FROM "Pets" WHERE nickname = $1 AND shelter_id = $2 AND id_pets != $3',
                [nickname, shelter_id, id]
            );

            if (petExistsName.rows.length > 0) {
                return res.status(409).json({message: 'Питомец в приюте с такой кличкой уже существует!'});
            }
        }

        const petsResult = await pool.query('UPDATE "Pets" SET nickname = COALESCE($1, nickname),' +
            'age = COALESCE($2, age), status_id = COALESCE($3, status_id), description = COALESCE($4, description), ' +
            'category_id = COALESCE($5, category_id), shelter_id = COALESCE($6, shelter_id),' +
            'sex = COALESCE($7, sex), vaccination_id = COALESCE($8, vaccination_id) ' +
            'WHERE id_pets = $9 RETURNING *',
            [nickname, age, status_id, description, category_id, shelter_id, sex, vaccination_id, id]
        );

        if (deletedImages && deletedImages.length > 0) {
            await Promise.all(
                deletedImages.map(async (url) => {
                    await deleteFromS3(url);
                    await pool.query('DELETE FROM "PetsImages" WHERE image_url = $1', [url]);
                })
            )
        }

        const newImageUrls = await Promise.all(
            newFiles.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "PetsImages" (pets_id, image_url) VALUES ($1, $2)',
                    [id, url]
                );
                return url;
            })
        );

        broadcast({event: 'pets-update', data: {...petsResult.rows[0], images: newImageUrls}});
        return res.status(200).json({message: 'Данные успешно обновлены!', pets: petsResult.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const petDelete = async (req, res) => {
    const {id} = req.params;

    if (!id) {
        return res.status(400).json({ message: 'Не получен id!' });
    }

    try {
        await pool.query('BEGIN');
        const petExists = await pool.query(
            'SELECT * FROM "Pets" WHERE id_pets = $1', [id]
        );

        if (petExists.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({message: 'Такого питомца не существует!'});
        }

        const imageResult = await pool.query('SELECT image_url FROM "PetsImages" WHERE pets_id = $1', [id]);

        await pool.query('DELETE FROM "PetsImages" WHERE pets_id = $1', [id]);

        await pool.query('DELETE FROM "Pets" WHERE id_pets = $1', [id]);

        await pool.query('COMMIT');

        await Promise.all(
            imageResult.rows.map(async (img) => {
                await deleteFromS3(img.image_url)
            }));

        broadcast({event:'pets-delete'});
        return res.status(200).json({message: 'Удаление питомца выполнено успешно!'});
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении питомца!'});
    }
}


module.exports = {getStatus, getStatusVaccination, getCategory, getShelters,
    getPets, addPets: [upload.array('images'), addPets],
    updatePets: [upload.array('images'), updatePets], petDelete};