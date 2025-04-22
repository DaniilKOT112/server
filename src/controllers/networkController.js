const { pool } = require('../config/db');
const { uploadToS3, deleteFromS3 } = require('../config/s3');
const { broadcast } = require('../services/websocket');
const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

const getNetworks = async (req, res) => {
    const { text, creator } = req.query;
    try {
        let baseQuery = `
            SELECT id_network, name_network, telephone,
                   COALESCE(json_agg(ni.image_url) FILTER (WHERE ni.image_url IS NOT NULL),'[]') as images  
            FROM "Network" n
            LEFT JOIN "NetworkImages" ni ON n.id_network = ni.network_id 
            WHERE creator = $1`;

        let params = [creator];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(id_network AS TEXT) ILIKE $2 OR name_network ILIKE $2 OR telephone ILIKE $2)`;
            params.push(`%${text}%`);
        }

        baseQuery += `
        GROUP BY n.id_network 
        ORDER BY name_network ASC`;

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

const addNetworks = async (req, res) => {
    const {name_network, telephone, creator } = req.body;
    let files = req.files;

    try {
        const networkExists = await pool.query(
            'SELECT * FROM "Network" WHERE name_network = $1', [name_network]
        );

        if (networkExists.rows.length > 0) {
            return res.status(401).json({message: 'Сеть с таким наименованием уже существует! '});
        }

        const networkResult = await pool.query(
            'INSERT INTO "Network" (name_network, telephone, creator)' +
            'VALUES ($1, $2, $3) RETURNING *', [name_network, telephone, creator]
        );

        const imageUrls = await Promise.all(
            files.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "NetworkImages" (network_id, image_url) VALUES ($1, $2)',
                    [networkResult.rows[0].id_network, url]
                );
                return url;
            })
        );

        broadcast({event:'network-add', data: {...networkResult.rows[0]}, images: imageUrls});
        return res.status(201).json({message: 'Регистрация выполнена!', network: networkResult.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки'});
    }
}

const updateNetworks = async (req, res) => {
    const {id} = req.params;
    const {name_network, telephone, creator,  deletedImages} = req.body;
    let newFiles = req.files;

    try {
        const networkExists = await pool.query(
            'SELECT * FROM "Network" WHERE id_network = $1', [id]
        );

        if (networkExists.rows.length === 0) {
            return res.status(403).json({message: 'Такая сеть не найдена!'});
        }

        if (name_network) {
            const networkExistsName = await pool.query(
                'SELECT * FROM "Network" WHERE name_network = $1 AND id_network != $2',
                [name_network, id]
            );

            if (networkExistsName.rows.length > 0) {
                return res.status(409).json({message: 'Сеть с таким именем уже существует!'});
            }
        }

        const networkResult = await pool.query('UPDATE "Network" SET name_network = COALESCE($1, name_network), ' +
            'telephone = COALESCE($2, telephone), creator = COALESCE($3, creator) WHERE id_network = $4 RETURNING *',
            [name_network, telephone, creator, id]
        );

        if (deletedImages && deletedImages.length > 0) {
            await Promise.all(
                deletedImages.map(async (url) => {
                    await deleteFromS3(url);
                    await pool.query('DELETE FROM "NetworkImages" WHERE image_url = $1', [url]);
                })
            )
        }

        const newImageUrls = await Promise.all(
            newFiles.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "NetworkImages" (network_id, image_url) VALUES ($1, $2)',
                    [id, url]
                );
                return url;
            })
        );

        broadcast({event:'network-update', data: {...networkResult.rows[0]}, images: newImageUrls});
        return res.status(200).json({message: 'Данные успешно обновлены!', network: networkResult.rows[0]});
    }catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const deleteNetworks = async (req, res) => {
    const {id} = req.params;
    try {
        await pool.query('BEGIN');
        const networkExists = await pool.query(
            'SELECT * FROM "Network" WHERE id_network = $1', [id]
        );

        if (networkExists.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({message: 'Такой сети не существует!'});
        }

        const imageResult = await pool.query('SELECT image_url FROM "NetworkImages" WHERE network_id = $1', [id]);

        await pool.query('DELETE FROM "NetworkImages" WHERE network_id = $1', [id]);

        await pool.query('DELETE FROM "Network" WHERE id_network = $1', [id]);

        await pool.query('COMMIT');

        await Promise.all(
            imageResult.rows.map(async (img) => {
                await deleteFromS3(img.image_url)
            }))

        broadcast({event:'network-delete'});
        return res.status(200).json({message: 'Удаление сети выполнено успешно!'});
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении сети!'});
    }
}

module.exports = {getNetworks, deleteNetworks, addNetworks: [upload.array('images'), addNetworks], updateNetworks: [upload.array('images'), updateNetworks]};