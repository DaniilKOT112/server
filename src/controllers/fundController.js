const { pool } = require('../config/db');
const { uploadToS3, deleteFromS3, upload } = require('../config/s3');
const { broadcast } = require('../services/websocket');

const getFund = async (req, res) => {
    const { text, shelter } = req.query;

    try {
        let baseQuery = `
            SELECT f.id_fund, f.name_fund, f.description, f.url, s.id_shelter, s.name_shelter as shelter,
                   COALESCE(json_agg(fi.image_url) FILTER (WHERE fi.image_url IS NOT NULL),'[]') as images
            FROM "Fund" f
            LEFT JOIN "Shelter" s ON f.shelter_id = s.id_shelter
            LEFT JOIN "FundImages" fi ON f.id_fund = fi.fund_id
            WHERE f.shelter_id = $1`;

        let params = [shelter];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(id_fund AS TEXT) ILIKE $2 OR name_fund ILIKE $2 OR description ILIKE $2 OR url ILIKE $2)`;
            params.push( `%${text}%` );
        }

        baseQuery += ` 
        GROUP BY f.id_fund, s.id_shelter 
        ORDER BY f.name_fund ASC`;

        const result = await pool.query(baseQuery, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Данные отсутствуют!' });
        }
        return res.status(200).json({ message: 'Данные получены!', data: result.rows });
    } catch (err) {
        return res.status(500).json({ message: 'Не удалось вернуть данные!' });
    }
}

const getShelters = async (req, res) => {
    const result = await pool.query('SELECT * FROM "Shelter"');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const addFund = async (req, res) => {
    console.log('Полученные данные:', req.body);
    const {name_fund, description, url, shelter_id } = req.body;
    let files = req.files;

    try {
        const fundExists = await pool.query(
            'SELECT * FROM "Fund" WHERE name_fund = $1 AND shelter_id', [name_fund, shelter_id]
        );

        if (fundExists.rows.length > 0) {
            return res.status(401).json({message: 'Фонд с таким наименованием уже существует! '});
        }

        const fundResult = await pool.query(
            'INSERT INTO "Fund" (name_fund, description, url, shelter_id)' +
            'VALUES ($1, $2, $3, $4) RETURNING *',
            [name_fund, description, url, shelter_id]
        );

        const imageUrls = await Promise.all(
            files.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "FundImages" (fund_id, image_url) VALUES ($1, $2)',
                    [fundResult.rows[0].id_fund, url]
                );
                return url;
            })
        );

        broadcast({event:'fund-add', data: {...fundResult.rows[0]}, images: imageUrls});
        return res.status(201).json({message: 'Регистрация выполнена!', fund: fundResult.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки'});
    }
}

const updateFund = async (req, res) => {
    const {id} = req.params;
    const {name_fund, description, url, shelter_id, deletedImages} = req.body;
    let newFiles = req.files;

    try {
        const fundExists = await pool.query(
            'SELECT * FROM "Fund" WHERE id_fund = $1', [id]
        );

        if (fundExists.rows.length === 0) {
            return res.status(403).json({message: 'Такой фонд не найдена!'});
        }

        if (name_fund) {
            const fundExistsName = await pool.query(
                'SELECT * FROM "Fund" WHERE name_fund = $1 AND shelter_id = $2 AND id_fund != $3',
                [name_fund, shelter_id, id]
            );

            if (fundExistsName.rows.length > 0) {
                return res.status(409).json({message: 'Фонд с таким наименованием уже существует!'});
            }
        }

        const fundResult = await pool.query('UPDATE "Fund" SET name_fund = COALESCE($1, name_fund),' +
            'description = COALESCE($2, description), url = COALESCE($3, url), shelter_id = COALESCE($4, shelter_id)' +
            'WHERE id_fund = $5 RETURNING *',
            [name_fund, description, url, shelter_id, id]
        );

        if (deletedImages && deletedImages.length > 0) {
            await Promise.all(
                deletedImages.map(async (url) => {
                    await deleteFromS3(url);
                    await pool.query('DELETE FROM "FundImages" WHERE image_url = $1', [url]);
                })
            )
        }

        const newImageUrls = await Promise.all(
            newFiles.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "FundImages" (fund_id, image_url) VALUES ($1, $2)',
                    [id, url]
                );
                return url;
            })
        );

        broadcast({event:'fund-update', data: {...fundResult.rows[0]}, images: newImageUrls});
        return res.status(200).json({message: 'Данные успешно обновлены!', fund: fundResult.rows[0]});
    }catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const deleteFund = async (req, res) => {
    const {id} = req.params;
    try {
        await pool.query('BEGIN');
        const fundExists = await pool.query(
            'SELECT * FROM "Fund" WHERE id_fund = $1', [id]
        );

        if (fundExists.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({message: 'Такого фонда не существует!'});
        }

        const imageResult = await pool.query('SELECT image_url FROM "FundImages" WHERE fund_id = $1', [id]);

        await pool.query('DELETE FROM "FundImages" WHERE fund_id = $1', [id]);

        await pool.query('DELETE FROM "Fund" WHERE id_fund = $1', [id]);

        await pool.query('COMMIT');

        await Promise.all(
            imageResult.rows.map(async (img) => {
                await deleteFromS3(img.image_url)
            }))

        broadcast({event:'fund-delete'});
        return res.status(200).json({message: 'Удаление фонда выполнено успешно!'});
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении фонда!'});
    }
}

const getFundUser = async (req, res) => {
    const { limit, offset } = req.query;
    try {
        let result = await pool.query(`
            SELECT f.id_fund, f.name_fund, f.description, f.url, s.id_shelter, s.name_shelter as shelter,
                   COALESCE(json_agg(fi.image_url ORDER BY fi.id_image) FILTER (WHERE fi.image_url IS NOT NULL),'[]') as images
            FROM "Fund" f
            LEFT JOIN "Shelter" s ON f.shelter_id = s.id_shelter
            LEFT JOIN "FundImages" fi ON f.id_fund = fi.fund_id
            GROUP BY f.id_fund, s.id_shelter
            ORDER BY f.name_fund ASC
            LIMIT $1 OFFSET $2`, [limit, offset]);

        return res.status(200).json({ message: 'Данные получены!', data: result.rows });
    } catch (err) {
        console.log(err)
        return res.status(500).json({ message: 'Не удалось вернуть данные!' });
    }
}

const getFundInfo = async (req, res) => {
    const { id } = req.params;
    try {
        let result = await pool.query(`
            SELECT f.id_fund, f.name_fund, f.description, f.url, s.id_shelter, s.name_shelter as shelter,
                   COALESCE(json_agg(fi.image_url ORDER BY fi.id_image) FILTER (WHERE fi.image_url IS NOT NULL),'[]') as images
            FROM "Fund" f
            LEFT JOIN "Shelter" s ON f.shelter_id = s.id_shelter
            LEFT JOIN "FundImages" fi ON f.id_fund = fi.fund_id
            WHERE f.id_fund = $1
            GROUP BY f.id_fund, s.id_shelter
            ORDER BY f.name_fund ASC`, [id]);

        return res.status(200).json({ message: 'Данные получены!', data: result.rows });
    } catch (err) {
        console.log(err)
        return res.status(500).json({ message: 'Не удалось вернуть данные!' });
    }
}

module.exports = {getFund, addFund: [upload.array('images'), addFund], updateFund: [upload.array('images'), updateFund], deleteFund, getShelters, getFundUser, getFundInfo};