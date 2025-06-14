const bcrypt = require('bcryptjs');
const {pool} = require('../config/db');
const { broadcast } = require('../services/websocket');

const getAdmins = async (req, res) => {
    const { text, creator } = req.query;

    try {
        let baseQuery = `
            SELECT u.id_user, r.id_role, r.name as role_name, u.mail, u.first_name, u.last_name, u.middle_name, u.series, u.number, u.telephone, s.id_shelter, s.name_shelter as shelter, u.login 
            FROM "User" u  
            JOIN "Role" r ON u.role_id = r.id_role 
            LEFT JOIN "Shelter" s ON u.shelter_id = s.id_shelter
            WHERE role_id = 2 AND u.creator = $1`;

        let params = [creator];

        if (text && text.trim() !== '') {
            baseQuery += ` AND (CAST(u.id_user AS TEXT) ILIKE $2 OR r.name ILIKE $2 OR u.mail ILIKE $2 OR u.first_name ILIKE $2
                OR u.last_name ILIKE $2 OR u.middle_name ILIKE $2 OR u.series ILIKE $2 OR u.number ILIKE $2 OR u.telephone ILIKE $2
                OR s.name_shelter ILIKE $2 OR u.login ILIKE $2)`;
            params.push(`%${text}%`);
        }

        baseQuery += ` ORDER BY u.login ASC`;

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
    const {creator} = req.query;
    const result = await pool.query('SELECT * FROM "Shelter" WHERE creator = $1', [creator]);
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const adminsId = async (req, res) => {
    console.log(req.body);
    const {id} = req.params;
    const {mail, password, role_id, first_name, last_name, middle_name, series, number, telephone, shelter_id, creator, login} = req.body;

    try {
        const userExists = await pool.query(
            'SELECT * FROM "User" WHERE id_user = $1', [id]
        );

        if (userExists.rows.length === 0) {
            return res.status(404).json({message: 'Такой пользователь не найден!'});
        }

        let hashedPassword = userExists.rows[0].password;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        if (mail) {
            const mailExists = await pool.query('SELECT * FROM "User" WHERE mail = $1 AND id_user != $2', [mail, id]);
            if (mailExists.rows.length > 0) {
                return res.status(400).json({message: 'Почта уже используется!'});
            }
        }
        if (login) {
            const logExists = await pool.query('SELECT * FROM "User" WHERE login = $1 AND id_user != $2', [login, id]);
            if (logExists.rows.length > 0) {
                return res.status(401).json({message: 'Логин уже используется!'});
            }
        }

        const result = await pool.query('UPDATE "User" SET mail = COALESCE($1, mail), password = $2, ' +
            'role_id = COALESCE($3, role_id), first_name = COALESCE($4, first_name), last_name = COALESCE($5, last_name), ' +
            'middle_name = COALESCE($6, middle_name), series = COALESCE($7, series), number = COALESCE($8, number), ' +
            'telephone = COALESCE($9, telephone), shelter_id = COALESCE($10, shelter_id), creator = COALESCE($11, creator)' +
            ', login = COALESCE($12, login) WHERE id_user = $13 RETURNING *',
            [
                mail, hashedPassword, role_id, first_name, last_name, middle_name,
                series, number, telephone, shelter_id, creator, login, id
            ]
        );
        broadcast({event:'admin-update', data:result.rows[0]});
        return res.status(200).json({message: 'Данные успешно обновлены!', user: result.rows[0]});
    }catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const addAdmins = async (req, res) => {
    console.log('Тело запроса:', req.body);
    const {mail, password, role_id, first_name, last_name, middle_name, series, number, telephone, shelter_id, creator, login} = req.body;

    try {
        const userExists = await pool.query(
            'SELECT * FROM "User" WHERE mail = $1', [mail]
        );

        if (userExists.rows.length > 0) {
            return res.status(402).json({message: 'Такая почта уже существует! '});
        }

        const logExists = await pool.query(
            'SELECT * FROM "User" WHERE login = $1', [login]
        );

        if (logExists.rows.length > 0) {
            return res.status(403).json({message: 'Такой логин уже существует! '})
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO "User" (password, role_id, mail, first_name, last_name, middle_name, series, number, telephone, shelter_id, creator, login) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12 ) RETURNING *',
            [
                hashedPassword, role_id, mail, first_name, last_name, middle_name, series,
                number, telephone, shelter_id, creator, login
            ]
        )
        broadcast({event:'admin-reg', data:result.rows[0]});
        return res.status(201).json({message: 'Регистрация выполнена!', user: result.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки'});
    }
}

const adminsDelete = async (req, res) => {
    const {id} = req.params;
    try {
        const userExists = await pool.query(
            'SELECT * FROM "User" WHERE id_user = $1', [id]
        );

        if (userExists.rows.length === 0) {
            return res.status(404).json({message: 'Такой пользователь не найден!'});
        }

        await pool.query('DELETE FROM "User" WHERE id_user = $1', [id]);
        broadcast({event:'admin-delete'});
        return res.status(200).json({message: 'Удаление пользователя выполнено успешно!'});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении пользователя!'});
    }
}

module.exports = {getAdmins, getShelters, adminsId, addAdmins, adminsDelete};