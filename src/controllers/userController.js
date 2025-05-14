const bcrypt = require('bcryptjs');
const {pool} = require('../config/db');
const { broadcast } = require('../services/websocket');
const jwt = require('jsonwebtoken');

const JWT_KEY = process.env.JWT_KEY;

const addUser = async (req, res) => {
    console.log("Полученные данные:", req.body);
    const {mail, password, role_id, first_name, last_name, middle_name, series, number, telephone, shelter_id, login} = req.body;

    try {
        const userExists = await pool.query(
            'SELECT * FROM "User" WHERE mail = $1', [mail]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({message: 'Такой пользователь уже существует! '});
        }

        const logExists = await pool.query(
            'SELECT * FROM "User" WHERE login = $1', [login]
        );

        if (logExists.rows.length > 0) {
            return res.status(401).json({message: 'Такой логин уже существует! '});
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO "User" (password, role_id, mail, first_name, last_name, middle_name, series, number, telephone, shelter_id, login) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 ) RETURNING *',
            [
                hashedPassword, role_id, mail, first_name, last_name, middle_name, series,
                number, telephone, shelter_id, login
            ]
        );
        broadcast({event:'user-add', data:result.rows[0]});
        return res.status(201).json({message: 'Регистрация выполнена!', user: result.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки'});
    }
}

const getUsers = async (req, res) => {
    const { text, shelter } = req.query;

    try {
        let baseQuery = `
                SELECT u.login, u.id_user, r.id_role, r.name as role_name, u.mail, u.first_name, u.last_name, u.middle_name, u.series, u.number, u.telephone, s.id_shelter, s.name_shelter as shelter
                FROM "User" u
                JOIN "Role" r ON u.role_id = r.id_role
                LEFT JOIN "Shelter" s ON u.shelter_id = s.id_shelter
                WHERE role_id != 2 AND role_id != 6 AND role_id != 1 AND u.shelter_id = $1`;

        let params = [shelter];

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
        console.error('Ошибка в getUsers:', err);
        return res.status(500).json({ message: 'Не удалось вернуть данные!' });
    }
}

const userId = async (req, res) => {
    const {id} = req.params;
    const {mail, password, role_id, first_name, last_name, middle_name, series, number, telephone, shelter_id, login} = req.body;

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
                return res.status(402).json({message: 'Почта уже используется!'});
            }
        }

        if (login) {
            const logExists = await pool.query('SELECT * FROM "User" WHERE login = $1 AND id_user != $2', [login, id]);
            if (logExists.rows.length > 0) {
                return res.status(403).json({message: 'Логин уже используется!'});
            }
        }

        const result = await pool.query('UPDATE "User" SET mail = COALESCE($1, mail), password = $2, ' +
            'role_id = COALESCE($3, role_id), first_name = COALESCE($4, first_name), last_name = COALESCE($5, last_name), ' +
            'middle_name = COALESCE($6, middle_name), series = COALESCE($7, series), number = COALESCE($8, number), ' +
            'telephone = COALESCE($9, telephone), shelter_id = COALESCE($10, shelter_id), login = COALESCE($11, login) WHERE id_user = $12 RETURNING *',
            [
                mail, hashedPassword, role_id, first_name, last_name, middle_name,
                series, number, telephone, shelter_id, login,  id
            ]
        );
        broadcast({event:'user-update', data:result.rows[0]});
        return res.status(200).json({message: 'Данные успешно обновлены!', user: result.rows[0]});
    }catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const userDelete = async (req, res) => {
    const {id} = req.params;
    try {
        const userExists = await pool.query(
            'SELECT * FROM "User" WHERE id_user = $1', [id]
        );

        if (userExists.rows.length === 0) {
            return res.status(404).json({message: 'Такой пользователь не найден!'});
        }

        await pool.query('DELETE FROM "User" WHERE id_user = $1', [id]);
        broadcast({event:'user-delete'});
        return res.status(200).json({message: 'Удаление пользователя выполнено успешно!'});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Возникла ошибка при удалении пользователя!'});
    }
}

const getRoles = async (req, res) => {
    const result = await pool.query('SELECT * FROM "Role" WHERE id_role != 2 AND id_role != 6 AND id_role != 1');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const getShelters = async (req, res) => {
    const result = await pool.query('SELECT * FROM "Shelter"');
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}


const userInfo = async (req, res) => {
    const {mail} = req.body;
    try {
        const userExists = await pool.query(
            'SELECT * FROM "User" WHERE mail = $1', [mail]
        );

        if (userExists.rows.length === 0) {
            return res.status(404).json({message: 'Такой email не найден!'});
        }

        const result = await pool.query('SELECT id_user, first_name, last_name, middle_name, series, number, telephone ' +
            'FROM "User" WHERE mail = $1', [mail]);
        return res.status(200).json({message: 'Данные получены успешно!', data: result.rows[0]});
    } catch (err) {
        console.log(err);
        return res.status(500).json({message: 'Ошибка при получении данных со стороны сервера!'});
    }
}

const userUpdate = async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({message: 'Токен не найден!'});
    }

    try {
        const decoded = jwt.verify(token, JWT_KEY);
        const userMail = decoded.mail;

        const {first_name, last_name, middle_name, series, number, telephone} = req.body;
        const result = await pool.query('UPDATE "User" SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), middle_name = COALESCE($3, middle_name), ' +
            'series = COALESCE($4, series) , number = COALESCE($5, number), telephone = COALESCE($6, telephone)' +
            ' WHERE mail = $7 RETURNING *', [first_name, last_name, middle_name, series, number, telephone, userMail]);

        return res.status(200).json({message: 'Данные обновлены успешно!', data: result.rows[0]});
    } catch (err) {
        console.log(err);
        return res.status(500).json({message: 'Ошибка при обновлении данных!'});
    }
}

const getPets = async (req, res) => {
    const { text, shelter, category, sex, vaccination, sort, limit, offset} = req.query;

    try {
        let baseQuery = `
            SELECT p.id_pets, p.nickname, p.age, st.id_status_pets, st.name_status as status, p.description, c.id_category, c.name_category as category,
                   s.id_shelter, s.name_shelter as shelter, p.sex, sv.id_status, sv.name_status as status_vac,
                   COALESCE(json_agg(pi.image_url ORDER BY pi.id_image) FILTER (WHERE pi.image_url IS NOT NULL),'[]') as images
            FROM "Pets" p
            LEFT JOIN "StatusPets" st ON p.status_id = st.id_status_pets 
            LEFT JOIN "PetsCategory" c ON p.category_id = c.id_category
            LEFT JOIN "Shelter" s ON p.shelter_id = s.id_shelter
            LEFT JOIN "StatusVaccination" sv ON p.vaccination_id = sv.id_status
            LEFT JOIN "PetsImages" pi ON p.id_pets = pi.pets_id`;

        const params = [];
        const condition = [];
        let ind = 1;

        if (text && text.trim() !== '') {
            params.push( `%${text}%` );
            condition.push(`p.nickname ILIKE $${ind}`);
            ind++;
        }

        if (shelter) {
            params.push(shelter);
            condition.push(`p.shelter_id = $${ind}`);
            ind++;
        }

        if (category) {
            params.push(category);
            condition.push(`p.category_id = $${ind}`);
            ind++;
        }

        if (sex) {
            params.push(sex);
            condition.push(`p.sex = $${ind}`);
            ind++;
        }

        if (vaccination) {
            params.push(vaccination);
            condition.push(`p.vaccination_id = $${ind}`);
            ind++;
        }

        if (condition.length > 0) {
            baseQuery += ` WHERE ` + condition.join(' AND ');
        }

        baseQuery += ` GROUP BY p.id_pets, st.id_status_pets, c.id_category, s.id_shelter, sv.id_status`;

        if (sort === 'age_asc') {
            baseQuery += ` ORDER BY p.age ASC`;
        } else if (sort === 'age_desc') {
            baseQuery += ` ORDER BY p.age DESC`;
        } else if (sort === 'name_asc'){
            baseQuery += ` ORDER BY p.nickname ASC`;
        }

        if (limit) {
            params.push(parseInt(limit));
            baseQuery += ` LIMIT $${ind}`;
            ind++;
        }

        if (offset) {
            params.push(parseInt(offset));
            baseQuery += ` OFFSET $${ind}`;
            ind++;
        }

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

const getPetsInfo = async (req, res) => {
    const {id} = req.params;
    try {
        const result = await pool.query(
            `SELECT p.id_pets, p.nickname, p.age, st.id_status_pets, st.name_status as status, p.description, c.id_category, c.name_category as category,
                   s.id_shelter, s.name_shelter as shelter, p.sex, sv.id_status, sv.name_status as status_vac, s.address, 
                   COALESCE(json_agg(pi.image_url ORDER BY pi.id_image) FILTER (WHERE pi.image_url IS NOT NULL),'[]') as images
            FROM "Pets" p
            LEFT JOIN "StatusPets" st ON p.status_id = st.id_status_pets 
            LEFT JOIN "PetsCategory" c ON p.category_id = c.id_category
            LEFT JOIN "Shelter" s ON p.shelter_id = s.id_shelter
            LEFT JOIN "StatusVaccination" sv ON p.vaccination_id = sv.id_status
            LEFT JOIN "PetsImages" pi ON p.id_pets = pi.pets_id
            WHERE p.id_pets = $1
            GROUP BY p.id_pets, p.nickname, p.age, st.id_status_pets, st.name_status, p.description, c.id_category, c.name_category,
            s.id_shelter, s.name_shelter, p.sex, sv.id_status, sv.name_status`, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Данные отсутствуют!' });
        }
        return res.status(200).json({ message: 'Данные получены!', data: result.rows });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Не удалось вернуть данные!' });

    }
}

const getUsersList = async (req, res) => {
    const {shelter} = req.params;
    const result = await pool.query('SELECT * FROM "User" WHERE shelter_id = $1 AND role_id = 5', [shelter]);
    return res.status(200).json({message: 'Данные получены успешно!', data: result.rows});
}

const addAdoption = async (req, res) => {
    console.log("Полученные данные:", req.body);
    const {first_name, last_name, telephone, user_id, pets_id, date, creator} = req.body;

    try {
        const result = await pool.query(
            'INSERT INTO "AdoptionApp" (first_name, last_name, telephone, user_id, pets_id, date, creator, status_adoption_id) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [
                first_name, last_name, telephone, user_id, pets_id, date, creator, 1
            ]
        );
        broadcast({event:'add-adoption', data:result.rows[0]});
        return res.status(201).json({message: 'Заявка добавлена', user: result.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки!'});
    }
}

const addContent = async (req, res) => {
    console.log("Полученные данные:", req.body);
    const {first_name, last_name, telephone, user_id, description, pets_id, date, creator} = req.body;

    try {
        const result = await pool.query(
            'INSERT INTO "ContentRequest" (first_name, last_name, telephone, user_id, description, pets_id, date, creator, status_adoption_id) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [
                first_name, last_name, telephone, user_id, description, pets_id, date, creator, 1
            ]
        );
        broadcast({event:'add-content', data:result.rows[0]});
        return res.status(201).json({message: 'Заявка добавлена', user: result.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки!'});
    }
}

module.exports = {getUsers, userId, userDelete, getRoles, userInfo, userUpdate, addUser, getShelters, getPets, getPetsInfo, getUsersList, addAdoption, addContent};