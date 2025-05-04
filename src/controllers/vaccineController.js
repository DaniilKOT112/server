const { pool } = require('../config/db');
const { broadcast } = require('../services/websocket');

const getShelters = async (req, res) => {
    const result = await pool.query('SELECT * FROM "Shelter"');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const getVaccines = async (req, res) => {
    const result = await pool.query('SELECT * FROM "Vaccine"');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}


const getVaccine = async (req, res) => {
    const { text, shelter } = req.query;

    try {
        let baseQuery = `
            SELECT sv.id_shelter_vaccine, v.id_vaccine, v.name_vaccine as vaccine, s.id_shelter, s.name_shelter as shelter, TO_CHAR(sv.date, 'YYYY-MM-DD') AS date, sv.quantity   
            FROM "ShelterVaccine" sv
            LEFT JOIN "Vaccine" v ON sv.vaccine_id = v.id_vaccine
            LEFT JOIN "Shelter" s ON sv.shelter_id = s.id_shelter
            WHERE sv.shelter_id = $1`;

        let params = [shelter];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(sv.id_shelter_vaccine AS TEXT) ILIKE $2 OR v.name_vaccine ILIKE $2 OR s.name_shelter ILIKE $2 OR TO_CHAR(sv.date, 'YYYY-MM-DD') ILIKE $2 
                OR CAST(sv.quantity AS TEXT) ILIKE $2)`;
            params.push( `%${text}%` );
        }

        baseQuery += ` ORDER BY v.name_vaccine ASC`;

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

const addVaccine = async (req, res) => {
    const { vaccine_id, shelter_id, date, quantity } = req.body;

    try {
        const vaccineExists = await pool.query(
            'SELECT * FROM "ShelterVaccine" WHERE vaccine_id = $1 AND shelter_id = $2', [vaccine_id, shelter_id]
        );

        if (vaccineExists.rows.length > 0) {
            return res.status(401).json({message: 'Такая запись уже существует!'});
        }

        const result = await pool.query(
            'INSERT INTO "ShelterVaccine" (vaccine_id, shelter_id, date, quantity)' +
            'VALUES ($1, $2, $3, $4) RETURNING *',
            [vaccine_id, shelter_id, date, quantity]
        );
        broadcast({event:'vaccine-add', data: result.rows[0]});
        return res.status(201).json({message: 'Регистрация выполнена!', network: result.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки'});
    }
}

const updateVaccine = async (req, res) => {
    const {id} = req.params;
    const {vaccine_id, shelter_id, date, quantity} = req.body;

    try {
        const vaccineExists = await pool.query(
            'SELECT * FROM "ShelterVaccine" WHERE id_shelter_vaccine = $1', [id]
        );

        if (vaccineExists.rows.length === 0) {
            return res.status(404).json({message: 'Такая вакцина не найдена!'});
        }

        if (vaccine_id && shelter_id) {
            const vaccineExists = await pool.query(
                'SELECT * FROM "ShelterVaccine" WHERE vaccine_id = $1 AND shelter_id = $2 AND id_shelter_vaccine != $3',
                [vaccine_id, shelter_id, id]
            );
            if (vaccineExists.rows.length > 0) {
                return res.status(400).json({message: 'Такая вакцина уже существует!'});
            }
        }

        const result = await pool.query(
            'UPDATE "ShelterVaccine" SET vaccine_id = COALESCE($1, vaccine_id), shelter_id = COALESCE($2, shelter_id), ' +
            'date = COALESCE($3, date), quantity = COALESCE($4, quantity) WHERE id_shelter_vaccine = $5 RETURNING *',
            [vaccine_id, shelter_id, date, quantity, id]
        );
        broadcast({event:'vaccine-update', data:result.rows[0]});
        return res.status(200).json({message: 'Данные успешно обновлены!', user: result.rows[0]});
    }catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const deleteVaccine = async (req, res) => {
    const {id} = req.params;
    try {
        const vaccineExists = await pool.query(
            'SELECT * FROM "ShelterVaccine" WHERE id_shelter_vaccine = $1', [id]
        );

        if (vaccineExists.rows.length === 0) {
            return res.status(404).json({message: 'Такой записи вакцины не существует!'});
        }

        await pool.query('DELETE FROM "ShelterVaccine" WHERE id_shelter_vaccine = $1', [id]);
        broadcast({event:'vaccine-delete'});
        return res.status(200).json({message: 'Удаление записи вакцины выполнено успешно!'});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении записи вакцины!'});
    }
}

module.exports = {getVaccines, getShelters, getVaccine, addVaccine, updateVaccine, deleteVaccine};