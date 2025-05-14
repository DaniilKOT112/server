const { pool } = require('../config/db');
const { broadcast } = require('../services/websocket');

const getContent = async (req, res) => {
    const { text, user_id } = req.query;

    try {
        let baseQuery = `
            SELECT cr.id_request, cr.first_name, cr.last_name, cr.telephone, cr.user_id, cr.creator, p.id_pets, p.nickname as pets, 
                   TO_CHAR(cr.date, 'YYYY-MM-DD') AS date, sa.id_status_adoption, sa.name_status as status, cr.description  
            FROM "ContentRequest" cr
            LEFT JOIN "Pets" p ON cr.pets_id = p.id_pets
            LEFT JOIN "StatusAdoption" sa ON cr.status_adoption_id = sa.id_status_adoption
            WHERE cr.user_id = $1`;

        let params = [user_id];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(cr.id_request AS TEXT) ILIKE $2 OR cr.first_name ILIKE $2 OR cr.last_name ILIKE $2 OR cr.telephone ILIKE $2 
            OR p.nickname ILIKE $2 OR TO_CHAR(cr.date, 'YYYY-MM-DD') ILIKE $2 OR sa.name_status ILIKE $2 OR cr.description ILIKE $2)`;
            params.push( `%${text}%` );
        }

        baseQuery += ` ORDER BY cr.first_name ASC`;

        const result = await pool.query(baseQuery, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Данные отсутствуют!' });
        }
        return res.status(200).json({ message: 'Данные получены!', data: result.rows });
    } catch (err) {
        console.error('Ошибка при выполнении запроса:', err);
        return res.status(500).json({ message: 'Не удалось вернуть данные!' });
    }
}

const acceptContent = async (req, res) => {
    const { creator, message, user_id, status, id_request } = req.body;

    try {
        await pool.query('BEGIN');
        const result = await pool.query(
            'INSERT INTO "Messages" (creator, message, user_id, status)' +
            'VALUES ($1, $2, $3, $4) RETURNING *',
            [creator, message, user_id, status]
        );

        await pool.query('UPDATE "ContentRequest" SET status_adoption_id = 2 WHERE id_request = $1', [id_request])
        await pool.query('COMMIT');

        broadcast({event:'message-accept', data: result.rows[0]});
        return res.status(201).json({message: 'Сообщение отправлено!', network: result.rows[0]});
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({message: 'Ошибка отправки сообщения!'});
    }
}

const cancelContent = async (req, res) => {
    const { creator, message, user_id, status, id_request } = req.body;

    try {
        await pool.query('BEGIN');
        const result = await pool.query(
            'INSERT INTO "Messages" (creator, message, user_id, status)' +
            'VALUES ($1, $2, $3, $4) RETURNING *',
            [creator, message, user_id, status]
        );

        await pool.query('UPDATE "ContentRequest" SET status_adoption_id = 0 WHERE id_request = $1', [id_request])
        await pool.query('COMMIT');

        broadcast({event:'message-cancel', data: result.rows[0]});
        return res.status(201).json({message: 'Сообщение отправлено!', network: result.rows[0]});
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({message: 'Ошибка отправки сообщения!'});
    }
}

const deleteContent = async (req, res) => {
    const {id} = req.params;
    try {
        const contentExists = await pool.query(
            'SELECT * FROM "ContentRequest" WHERE id_request = $1', [id]
        );

        if (contentExists.rows.length === 0) {
            return res.status(404).json({message: 'Такой заявки не существует!'});
        }

        await pool.query('DELETE FROM "ContentRequest" WHERE id_request = $1', [id]);
        return res.status(200).json({message: 'Удаление заявки выполнено успешно!'});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении заявки!'});
    }
}


module.exports = {getContent, acceptContent, cancelContent, deleteContent};