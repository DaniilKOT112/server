const {pool} = require('../config/db');
const { broadcast } = require('../services/websocket');

const getExamination = async (req, res) => {
    const { text, shelter } = req.query;

    try {
        let baseQuery = `
            SELECT e.name, e.id_examination, e.description, e.treatment, p.id_pets, p.nickname as pets, TO_CHAR(e.date, 'YYYY-MM-DD') as date, s.id_shelter, s.name_shelter as shelter  
            FROM "Examination" e
            LEFT JOIN "Pets" p ON e.pets_id = p.id_pets 
            LEFT JOIN "Shelter" s ON e.shelter_id = s.id_shelter
            WHERE e.shelter_id = $1`;

        let params = [shelter];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(e.id_examination AS TEXT) ILIKE $2 OR e.name ILIKE $2 OR e.description ILIKE $2 OR e.treatment ILIKE $2 OR p.nickname ILIKE $2
                OR TO_CHAR(e.date, 'YYYY-MM-DD') ILIKE $2 OR s.name_shelter ILIKE $2)`
            params.push(`%${text}%`);
        }

        baseQuery += ` ORDER BY e.name ASC`;

        const result = await pool.query(baseQuery, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Данные отсутствуют!' });
        }
        return res.status(200).json({ message: 'Данные получены!', data: result.rows });
    } catch (err) {
        return res.status(500).json({ message: 'Не удалось вернуть данные!' });
    }
}

const getPets = async (req, res) => {
    const { shelter } = req.query;
    const result = await pool.query('SELECT * FROM "Pets" WHERE shelter_id = $1', [shelter]);
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const addExamination = async (req, res) => {
    console.log('Полученные данные:', req.body);
    const {description, treatment, pets_id, shelter_id, date, name } = req.body;

    try {
        const examExists = await pool.query(
            'SELECT * FROM "Examination" WHERE name = $1', [name]
        );

        if (examExists.rows.length > 0) {
            return res.status(401).json({message: 'Осмотр с таким наименованием уже существует!'});
        }

        const result = await pool.query(
            'INSERT INTO "Examination" (description, treatment, pets_id, shelter_id, date, name)' +
            'VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [description, treatment, pets_id, shelter_id, date, name]
        );
        broadcast({event:'examination-add', data: result.rows[0]});
        return res.status(201).json({message: 'Добавление выполнено!', network: result.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка добавления!'});
    }
}

const updateExamination = async (req, res) => {
    const {id} = req.params;
    const {description, treatment, pets_id, shelter_id, date, name} = req.body;

    try {
        const examExists = await pool.query(
            'SELECT * FROM "Examination" WHERE id_examination = $1', [id]
        );

        if (examExists.rows.length === 0) {
            return res.status(403).json({message: 'Такая запись не найдена!'});
        }

        if (name) {
            const examExistsName = await pool.query(
                'SELECT * FROM "Examination" WHERE name = $1 AND id_examination != $2',
                [name, id]
            );

            if (examExistsName.rows.length > 0) {
                return res.status(409).json({message: 'Запись с таким наименованием уже существует!'});
            }
        }

        const result = await pool.query('UPDATE "Examination" SET description = COALESCE($1, description),' +
            'treatment = COALESCE($2, treatment), pets_id = COALESCE($3, pets_id), shelter_id = COALESCE($4, shelter_id), date = COALESCE($5, date),' +
            'name = COALESCE($6, name) WHERE id_examination = $7 RETURNING *',
            [description, treatment, pets_id, shelter_id, date, name, id]
        );
        broadcast({event:'examination-update', data: result.rows[0]});
        return res.status(200).json({message: 'Данные успешно обновлены!', network: result.rows[0]});
    }catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const deleteExamination = async (req, res) => {
    const {id} = req.params;
    try {
        const examExists = await pool.query(
            'SELECT * FROM "Examination" WHERE id_examination = $1', [id]
        );

        if (examExists.rows.length === 0) {
            return res.status(404).json({message: 'Такой записи не существует!'});
        }

        await pool.query('DELETE FROM "Examination" WHERE id_examination = $1', [id]);
        broadcast({event:'examination-delete'});
        return res.status(200).json({message: 'Удаление записи выполнено успешно!'});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении записи!'});
    }
}

module.exports = {getExamination, getPets, addExamination, updateExamination, deleteExamination};