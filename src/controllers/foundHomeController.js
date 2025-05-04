const { pool } = require('../config/db')
const { uploadToS3, deleteFromS3, upload } = require('../config/s3')
const { broadcast } = require('../services/websocket')

const getShelters = async (req, res) => {
    const result = await pool.query('SELECT * FROM "Shelter"');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const getStatus = async (req, res) => {
    const result = await pool.query('SELECT * FROM "StatusFoundHome"');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const getFoundHome = async (req, res) => {
    const { text, shelter } = req.query;

    try {
        let baseQuery = `
            SELECT f.id_found_home, f.heading, f.text, f.author, s.id_shelter, s.name_shelter as shelter, st.id_status, st.name_status as status,
                   COALESCE(json_agg(fi.image_url) FILTER (WHERE fi.image_url IS NOT NULL),'[]') as images
            FROM "FoundHome" f
            LEFT JOIN "Shelter" s ON f.shelter_id = s.id_shelter
            LEFT JOIN "StatusFoundHome" st ON f.status_id = st.id_status
            LEFT JOIN "FoundImages" fi ON f.id_found_home = fi.found_home_id
            WHERE f.shelter_id = $1`;

        let params = [shelter];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(f.id_found_home AS TEXT) ILIKE $2 OR f.heading ILIKE $2 OR f.text ILIKE $2 OR f.author ILIKE $2
            OR s.name_shelter ILIKE $2 OR st.name_status ILIKE $2)`;
            params.push( `%${text}%` );
        }

        baseQuery += ` 
        GROUP BY f.id_found_home, s.id_shelter, st.id_status
        ORDER BY f.heading ASC`;

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

const addFoundHome = async (req, res) => {
    console.log(req.body);
    const { heading, text, author, shelter_id, status_id } = req.body;
    let files = req.files;

    try {
        const foundExists = await pool.query(
            'SELECT * FROM "FoundHome" WHERE heading = $1 AND shelter_id = $2', [heading, shelter_id]
        );

        if (foundExists.rows.length > 0) {
            return res.status(401).json({message: 'Пост с таким заголовком уже существует!'});
        }

        const foundResult = await pool.query(
            'INSERT INTO "FoundHome" (heading, text, author, shelter_id, status_id)' +
            'VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [heading, text, author, shelter_id, status_id]
        );

        const imageUrls = await Promise.all(
            files.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "FoundImages" (found_home_id, image_url) VALUES ($1, $2)',
                    [foundResult.rows[0].id_found_home, url]
                );
                return url;
            })
        );

        broadcast({event:'found-home-add', data: {...foundResult.rows[0]}, images: imageUrls});
        return res.status(201).json({message: 'Пост добавлен!', found: foundResult.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка загрузки!'});
    }
}

const updateFoundHome = async (req, res) => {
    console.log(req.body, req.params);
    const {id} = req.params;
    const {heading, text, author, shelter_id, status_id, deletedImages} = req.body;
    let newFiles = req.files;

    try {
        const foundExists = await pool.query(
            'SELECT * FROM "FoundHome" WHERE id_found_home = $1', [id]
        );

        if (foundExists.rows.length === 0) {
            return res.status(403).json({message: 'Такой пост не найден!'})
        }

        if (heading) {
            const foundExistsName = await pool.query(
                'SELECT * FROM "FoundHome" WHERE heading = $1 AND shelter_id = $2 AND id_found_home != $3',
                [heading, shelter_id, id]
            );

            if (foundExistsName.rows.length > 0) {
                return res.status(409).json({message: 'Пост с таким наименованием уже существует!'});
            }
        }

        const foundResult = await pool.query('UPDATE "FoundHome" SET heading = COALESCE($1, heading),' +
            'text = COALESCE($2, text), author = COALESCE($3, author), shelter_id = COALESCE($4, shelter_id),' +
            'status_id = COALESCE($5, status_id) WHERE id_found_home = $6 RETURNING *',
            [heading, text, author, shelter_id, status_id, id]
        );

        if (deletedImages && deletedImages.length > 0) {
            await Promise.all(
                deletedImages.map(async (url) => {
                    await deleteFromS3(url);
                    await pool.query('DELETE FROM "FoundImages" WHERE image_url = $1', [url]);
                })
            )
        }

        const newImageUrls = await Promise.all(
            newFiles.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "FoundImages" (found_home_id, image_url) VALUES ($1, $2)',
                    [id, url]
                );
                return url;
            })
        );

        broadcast({event:'found-home-update', data: {...foundResult.rows[0]}, images: newImageUrls});
        return res.status(200).json({message: 'Данные успешно обновлены!', found: foundResult.rows[0]});
    }catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const foundHomeDelete = async (req, res) => {
    const {id} = req.params;
    try {
        await pool.query('BEGIN')
        const foundExists = await pool.query(
            'SELECT * FROM "FoundHome" WHERE id_found_home = $1', [id]
        );

        if (foundExists.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({message: 'Такого поста не существует!'});
        }

        const imageResult = await pool.query('SELECT image_url FROM "FoundImages" WHERE found_home_id = $1', [id]);

        await pool.query('DELETE FROM "FoundImages" WHERE found_home_id = $1', [id]);

        await pool.query('DELETE FROM "FoundHome" WHERE id_found_home = $1', [id]);

        await pool.query('COMMIT');

        await Promise.all(
            imageResult.rows.map(async (img) => {
                await deleteFromS3(img.image_url)
            }))

        broadcast({event:'found-home-delete'});
        return res.status(200).json({message: 'Удаление поста выполнено успешно!'});
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении поста!'});
    }
}

module.exports = {getShelters, getStatus, getFoundHome, addFoundHome: [upload.array('images'), addFoundHome], updateFoundHome: [upload.array('images'), updateFoundHome], foundHomeDelete };