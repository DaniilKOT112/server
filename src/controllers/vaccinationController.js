const {pool} = require('../config/db');
const { broadcast } = require('../services/websocket');

const getPets = async (req, res) => {
    const { shelter } = req.query;
    const result = await pool.query('SELECT * FROM "Pets" WHERE shelter_id = $1', [shelter]);
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const getVaccination = async (req, res) => {
    const { text, shelter } = req.query;

    try {
        let baseQuery = `
            SELECT vp.id_vaccination, p.id_pets, p.nickname as pets, s.id_shelter, s.name_shelter as shelter, v.id_vaccine, v.name_vaccine as vaccine, vp.quantity, TO_CHAR(vp.date, 'YYYY-MM-DD') as date  
            FROM "VaccinationPet" vp
            LEFT JOIN "Pets" p ON vp.pets_id = p.id_pets 
            LEFT JOIN "Shelter" s ON vp.shelter_id = s.id_shelter
            LEFT JOIN "Vaccine" v ON vp.vaccine_id = v.id_vaccine
            WHERE vp.shelter_id = $1
            `;

        let params = [shelter];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(vp.id_vaccination AS TEXT) ILIKE $2 OR p.nickname ILIKE $2 OR s.name_shelter ILIKE $2 OR v.name_vaccine ILIKE $2 OR CAST(vp.quantity AS TEXT) ILIKE $2
                OR TO_CHAR(vp.date, 'YYYY-MM-DD') ILIKE $2)`;
            params.push(`%${text}%`);
        }

        baseQuery += ` ORDER BY p.nickname ASC`;

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

const getVaccine = async (req, res) => {
    const { shelter } = req.query;
    const result = await pool.query(
        'SELECT sv.shelter_id, sv.quantity, v.id_vaccine, v.name_vaccine ' +
        'FROM "ShelterVaccine" sv ' +
        'JOIN "Vaccine" v ON sv.vaccine_id = v.id_vaccine ' +
        'WHERE sv.shelter_id = $1 ' +
        'ORDER BY v.name_vaccine', [shelter]);
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const addVaccination = async (req, res) => {
    console.log('Полученные данные:', req.body);
    const {pets_id, shelter_id, vaccine_id, quantity, date } = req.body;

    try {
        const expiration = await pool.query ('' +
            'SELECT sv.date ' +
            'FROM "ShelterVaccine" sv ' +
            'WHERE vaccine_id = $1 ' +
            'AND shelter_id = $2',
                [vaccine_id, shelter_id]);

        const expirationDate = new Date(expiration.rows[0].date);
        const today = new Date();

        if (expirationDate < today) {
            return res.status(400).json({ message: 'Срок годности вакцины истёк!' });
        }

        const vaccinationUpdate = await pool.query(
            'UPDATE "ShelterVaccine" ' +
            'SET quantity = quantity - $1 ' +
            'WHERE vaccine_id = $2 ' +
            'AND shelter_id = $3 ' +
            'AND quantity >= $1 ' +
            'RETURNING *',
            [quantity, vaccine_id, shelter_id]
        );

        if (vaccinationUpdate.rowCount === 0) {
            return res.status(401).json({message: 'Недостаточно вакцин в приюте!'});
        }

        const result = await pool.query(
            'INSERT INTO "VaccinationPet" (pets_id, shelter_id, vaccine_id, quantity, date)' +
            'VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [pets_id, shelter_id, vaccine_id, quantity, date]
        );
        broadcast({event:'vaccination-add', data: result.rows[0]});
        return res.status(201).json({message: 'Добавление выполнено!', vaccination: result.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка добавления!'});
    }
}

const updateVaccination = async (req, res) => {
    console.log('Полученные данные:', req.body);
    const {id} = req.params;
    const {pets_id, shelter_id, vaccine_id, quantity, date} = req.body;

    try {
        await pool.query('BEGIN');
        const oldData = await pool.query(
            'SELECT vaccine_id, quantity FROM "VaccinationPet" WHERE id_vaccination = $1',
            [id]
        );

        if (oldData.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({message: 'Запись не найдена!'});
        }

        const {vaccine_id: oldVaccineId, quantity: oldQuantity} = oldData.rows[0];

        // Возвращение старого количества, если вакцина изменилась или количество изменилось
        if (oldVaccineId !== vaccine_id || oldQuantity !== quantity) {
            await pool.query(
                'UPDATE "ShelterVaccine" SET quantity = quantity + $1 WHERE vaccine_id = $2 AND shelter_id = $3',
                [oldQuantity, oldVaccineId, shelter_id]
            );

            // Проверка, достаточно ли новой вакцины
            const checkNewVaccine = await pool.query(
                'SELECT sv.quantity, sv.date FROM "ShelterVaccine" sv WHERE vaccine_id = $1 AND shelter_id = $2',
                [vaccine_id, shelter_id]
            );

            if (checkNewVaccine.rowCount === 0 || checkNewVaccine.rows[0].quantity < quantity) {
                await pool.query('ROLLBACK');
                return res.status(401).json({message: 'Недостаточно вакцин в приюте!'});
            }

            const expirationDate = new Date(checkNewVaccine.rows[0].date);
            const today = new Date();

            if (expirationDate < today) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ message: 'Срок годности вакцины истёк!' });
            }

            // Вычитание нового количества
            await pool.query(
                'UPDATE "ShelterVaccine" SET quantity = quantity - $1 WHERE vaccine_id = $2 AND shelter_id = $3',
                [quantity, vaccine_id, shelter_id]
            );
        }

        const result = await pool.query(
            'UPDATE "VaccinationPet" SET pets_id = $1, vaccine_id = $2, quantity = $3, date = $4 WHERE id_vaccination = $5 RETURNING *',
            [pets_id, vaccine_id, quantity, date, id]
        );
        await pool.query('COMMIT');
        broadcast({event: 'vaccination-update', data: result.rows[0]});
        return res.status(201).json({message: 'Обновление выполнено!', vaccination: result.rows[0]});
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({message: 'Ошибка обновления!'});
    }
}

const deleteVaccination = async (req, res) => {
    const {id} = req.params;
    try {
        const vaccinationExists = await pool.query(
            'SELECT * FROM "VaccinationPet" WHERE id_vaccination = $1', [id]
        );

        if (vaccinationExists.rows.length === 0) {
            return res.status(404).json({message: 'Такой записи не существует!'});
        }

        await pool.query('DELETE FROM "VaccinationPet" WHERE id_vaccination = $1', [id]);
        broadcast({event:'vaccination-delete'});
        return res.status(200).json({message: 'Удаление записи выполнено успешно!'});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении записи!'});
    }
}

module.exports = {getPets, getVaccine, addVaccination, getVaccination, updateVaccination, deleteVaccination};