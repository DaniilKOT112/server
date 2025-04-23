const { pool } = require('../config/db');
const { uploadToS3, deleteFromS3, upload } = require('../config/s3');
const { broadcast } = require('../services/websocket');

const getShelters = async (req, res) => {
    const result = await pool.query('SELECT * FROM "Shelter"');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const getFeed = async (req, res) => {
    const { text, shelter } = req.query;
    try {
        let baseQuery = `
            SELECT f.id_feed, f.heading, f.text, f.author, s.id_shelter, s.name_shelter as shelter,
                   COALESCE(json_agg(fi.image_url) FILTER (WHERE fi.image_url IS NOT NULL),'[]') as images
            FROM "Feed" f
            LEFT JOIN "Shelter" s ON f.shelter_id = s.id_shelter
            LEFT JOIN "FeedImages" fi ON f.id_feed = fi.feed_id
            WHERE f.shelter_id = $1`;

        let params = [shelter];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(f.id_feed AS TEXT) ILIKE $2 OR f.heading ILIKE $2 OR f.text ILIKE $2 OR f.author ILIKE $2
            OR s.name_shelter ILIKE $2)`;
            params.push( `%${text}%` );
        }

        baseQuery += `
        GROUP BY f.id_feed, s.id_shelter 
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

const addFeed = async (req, res) => {
    console.log(req.body);
    const { heading, text, author, shelter_id } = req.body;
    let files = req.files;

    try {
        const feedExists = await pool.query(
            'SELECT * FROM "Feed" WHERE heading = $1', [heading]
        );

        if (feedExists.rows.length > 0) {
            return res.status(401).json({message: 'Пост с таким заголовком уже существует!'});
        }

        const feedResult = await pool.query(
            'INSERT INTO "Feed" (heading, text, author, shelter_id)' +
            'VALUES ($1, $2, $3, $4) RETURNING *',
            [heading, text, author, shelter_id]
        );

        const imageUrls = await Promise.all(
            files.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "FeedImages" (feed_id, image_url) VALUES ($1, $2)',
                    [feedResult.rows[0].id_feed, url]
                );
                return url;
            })
        );

        broadcast({event:'feed-add', data: {...feedResult.rows[0], images: imageUrls}});
        return res.status(201).json({message: 'Пост добавлен!', feed: feedResult.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка загрузки!'});
    }
}

const updateFeed = async (req, res) => {
    const {id} = req.params;
    const {heading, text, author, shelter_id, deletedImages} = req.body;
    let newFiles = req.files;

    try {
        const feedExists = await pool.query(
            'SELECT * FROM "Feed" WHERE id_feed = $1', [id]
        );

        if (feedExists.rows.length === 0) {
            return res.status(403).json({message: 'Такой пост не найдена!'});
        }

        if (heading) {
            const feedExistsName = await pool.query(
                'SELECT * FROM "Feed" WHERE heading = $1 AND id_feed != $2',
                [heading, id]
            );

            if (feedExistsName.rows.length > 0) {
                return res.status(409).json({message: 'Пост с таким наименованием уже существует!'});
            }
        }

        const feedResult = await pool.query('UPDATE "Feed" SET heading = COALESCE($1, heading),' +
            'text = COALESCE($2, text), author = COALESCE($3, author), shelter_id = COALESCE($4, shelter_id)' +
            ' WHERE id_feed = $5 RETURNING *',
            [heading, text, author, shelter_id, id]
        );

        if (deletedImages && deletedImages.length > 0) {
            await Promise.all(
                deletedImages.map(async (url) => {
                    await deleteFromS3(url);
                    await pool.query('DELETE FROM "FeedImages" WHERE image_url = $1', [url]);
                })
            )
        }

        const newImageUrls = await Promise.all(
            newFiles.map(async (file) => {
                const url = await uploadToS3(file);
                await pool.query(
                    'INSERT INTO "FeedImages" (feed_id, image_url) VALUES ($1, $2)',
                    [id, url]
                );
                return url;
            })
        );

        broadcast({event:'feed-update', data: {...feedResult.rows[0], images: newImageUrls}});
        return res.status(200).json({message: 'Данные успешно обновлены!', feed: feedResult.rows[0]});
    }catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const feedDelete = async (req, res) => {
    const {id} = req.params;
    try {
        await pool.query('BEGIN');
        const feedExists = await pool.query(
            'SELECT * FROM "Feed" WHERE id_feed = $1', [id]
        );

        if (feedExists.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({message: 'Такого поста не существует!'});
        }

        const imageResult = await pool.query('SELECT image_url FROM "FeedImages" WHERE feed_id = $1', [id]);

        await pool.query('DELETE FROM "FeedImages" WHERE feed_id = $1', [id]);

        await pool.query('DELETE FROM "Feed" WHERE id_feed = $1', [id]);

        await pool.query('COMMIT');

        await Promise.all(
            imageResult.rows.map(async (img) => {
                await deleteFromS3(img.image_url)
            }))

        broadcast({event:'feed-delete'});
        return res.status(200).json({message: 'Удаление поста выполнено успешно!'});
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении поста!'});
    }
}

module.exports = {getShelters, getFeed, addFeed: [upload.array('images'), addFeed], updateFeed: [upload.array('images'), updateFeed], feedDelete};