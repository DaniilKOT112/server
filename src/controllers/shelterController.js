const { pool } = require('../config/db')
const { uploadToS3, deleteFromS3, upload } = require('../config/s3')
const { broadcast } = require('../services/websocket')

const getStatus = async (req, res) => {
    const result = await pool.query('SELECT * FROM "StatusShelter"');
    return res.status(200).json({message: 'Данные успешно получены!', data: result.rows});
}

const getNetwork = async (req, res) => {
    const {creator} = req.query;
    const result = await pool.query('SELECT * FROM "Network" WHERE creator = $1', [creator]);
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const getShelters = async (req, res) => {
    const { text, creator } = req.query;

    try {
        let baseQuery = `
            SELECT s.id_shelter, s.name_shelter, n.id_network, n.name_network as network, s.opf, s.ogrn, s.inn_kpp, s.address, s.telephone, sh.id_status, sh.name_status as status,
                   COALESCE(json_agg(si.image_url) FILTER (WHERE si.image_url IS NOT NULL),'[]') as images
            FROM "Shelter" s
            LEFT JOIN "Network" n ON s.network_id = n.id_network 
            LEFT JOIN "StatusShelter" sh ON s.status_id = sh.id_status
            LEFT JOIN "ShelterImages" si ON s.id_shelter = si.shelter_id
            WHERE s.creator = $1`;

        let params = [creator];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(s.id_shelter AS TEXT) ILIKE $2 OR s.name_shelter ILIKE $2 OR n.name_network ILIKE $2 OR s.opf ILIKE $2
            OR s.ogrn ILIKE $2 OR s.inn_kpp ILIKE $2 OR s.address ILIKE $2 OR s.telephone ILIKE $2)`;
            params.push( `%${text}%` );
        }

        baseQuery += ` 
        GROUP BY s.id_shelter, n.id_network, sh.id_status
        ORDER BY s.name_shelter ASC`;

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

const addShelter = async (req, res) => {
    const {name_shelter, network_id, opf, ogrn, inn_kpp, address, telephone, creator, status } = req.body;
    let files = req.files;
    const normalizedAddress = addressToOSM(address);
    try {
        const shelterExists = await pool.query(
            'SELECT * FROM "Shelter" WHERE name_shelter = $1', [name_shelter]
        );

        if (shelterExists.rows.length > 0) {
            return res.status(401).json({message: 'Приют с таким наименованием уже существует! '});
        }

        const shelterResult = await pool.query(
            'INSERT INTO "Shelter" (name_shelter, network_id, opf, ogrn, inn_kpp, address, telephone, creator, status_id)' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [name_shelter, network_id, opf, ogrn, inn_kpp, normalizedAddress, telephone, creator, status]
        );

        const imageUrls = await Promise.all(
            files.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "ShelterImages" (shelter_id, image_url) VALUES ($1, $2)',
                    [shelterResult.rows[0].id_shelter, url]
                );
                return url;
            })
        );

        broadcast({event:'shelter-add', data: {...shelterResult.rows[0]}, images: imageUrls});
        return res.status(201).json({message: 'Регистрация выполнена!', shelter: shelterResult.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки'});
    }
}

const updateShelter = async (req, res) => {
    const {id} = req.params;
    const { name_shelter, network_id, opf, ogrn, inn_kpp, address, telephone, creator, status, deletedImages} = req.body;
    let newFiles = req.files;
    const normalizedAddress = addressToOSM(address);
    try {
        const shelterExists = await pool.query(
            'SELECT * FROM "Shelter" WHERE id_shelter = $1', [id]
        );

        if (shelterExists.rows.length === 0) {
            return res.status(403).json({message: 'Такой приют не найдена!'});
        }


        if (name_shelter) {
            const shelterExistsName = await pool.query(
                'SELECT * FROM "Shelter" WHERE name_shelter = $1 AND id_shelter != $2',
                [name_shelter, id]
            );

            if (shelterExistsName.rows.length > 0) {
                return res.status(409).json({message: 'Приют с таким наименованием уже существует!'});
            }
        }

        const shelterResult = await pool.query('UPDATE "Shelter" SET name_shelter = COALESCE($1, name_shelter),' +
            'network_id = COALESCE($2, network_id), opf = COALESCE($3, opf), ogrn = COALESCE($4, ogrn), ' +
            'inn_kpp = COALESCE($5, inn_kpp), address = COALESCE($6, address),' +
            'telephone = COALESCE($7, telephone), creator = COALESCE($8, creator), ' +
            'status_id = COALESCE($9, status_id) WHERE id_shelter = $10 RETURNING *',
            [name_shelter, network_id, opf, ogrn, inn_kpp, normalizedAddress, telephone, creator, status, id]
        );

        if (deletedImages && deletedImages.length > 0) {
            await Promise.all(
                deletedImages.map(async (url) => {
                    await deleteFromS3(url);
                    await pool.query('DELETE FROM "ShelterImages" WHERE image_url = $1', [url]);
                })
            )
        }

        const newImageUrls = await Promise.all(
            newFiles.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "ShelterImages" (shelter_id, image_url) VALUES ($1, $2)',
                    [id, url]
                );
                return url;
            })
        );

        broadcast({event:'shelter-update', data: {...shelterResult.rows[0]}, images: newImageUrls});
        return res.status(200).json({message: 'Данные успешно обновлены!', shelter: shelterResult.rows[0]});
    }catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const shelterDelete = async (req, res) => {
    const {id} = req.params;
    try {
        await pool.query('BEGIN');
        const shelterExists = await pool.query(
            'SELECT * FROM "Shelter" WHERE id_shelter = $1', [id]
        );

        if (shelterExists.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({message: 'Такого приюта не существует!'});
        }

        const imageResult = await pool.query('SELECT image_url FROM "ShelterImages" WHERE shelter_id = $1', [id]);

        await pool.query('DELETE FROM "ShelterImages" WHERE shelter_id = $1', [id]);

        await pool.query('DELETE FROM "Shelter" WHERE id_shelter = $1', [id]);

        await pool.query('COMMIT');

        await Promise.all(
            imageResult.rows.map(async (img) => {
                await deleteFromS3(img.image_url)
            }))

        broadcast({event:'shelter-delete'});
        return res.status(200).json({message: 'Удаление приюта выполнено успешно!'});
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении приюта!'});
    }
}

function addressToOSM(address) {
    return address
        .replace(/(^|,\s*)г\.?\s*/gi, '$1')
        .replace(/улица\s/gi, 'ул. ')
        .replace(/ул\s/gi, 'ул. ')
        .replace(/,\s*(д\.?|дом)\s*/gi, ', ')
        .replace(/,\s*(д\.?|дом)\s*$/gi, '')
        .replace(/,\s*,/g, ',')
        .replace(/,\s*$/, '')
        .replace(/^\s*,\s*/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

module.exports = {getNetwork, getShelters, addShelter: [upload.array('images'), addShelter], updateShelter:[upload.array('images'), updateShelter], shelterDelete, getStatus};