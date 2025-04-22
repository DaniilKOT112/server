const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {pool} = require('../config/db');

const JWT_KEY = process.env.JWT_KEY;

const register = async (req, res) => {
    const {mail, password, role_id, login} = req.body;
    try {
        const mailExists = await pool.query(
            'SELECT * FROM "User" WHERE mail = $1', [mail]
        );

        if (mailExists.rows.length > 0) {
            return res.status(401).json({message: 'Такой mail уже существует!'});
        }

        const logExists = await pool.query(
            'SELECT * FROM "User" WHERE login = $1', [login]
        );

        if (logExists.rows.length > 0) {
            return res.status(402).json({message: 'Такой login уже существует!'});
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO "User" (password, role_id, mail, login) ' +
            'VALUES ($1, $2, $3, $4) RETURNING *',
            [hashedPassword, role_id, mail, login]
        );

        return res.status(201).json({message: 'Регистрация выполнена!', user: result.rows[0]});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message: 'Ошибка времени загрузки'});
    }
}

const login = async (req, res) => {
    const {mailOrLog, password} = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM "User" WHERE mail = $1 OR login = $1', [mailOrLog]);

        if (result.rows.length === 0) {
            return res.status(401).json({message: 'Такого пользователя не существует!'});
        }

        const user = result.rows[0];
        const passValid = await bcrypt.compare(password, user.password);

        if (!passValid) {
            return res.status(402).json({message: 'Пароль не верный!'});
        }

        const token = jwt.sign(
            {id_user: user.id_user, mail: user.mail, role_id: user.role_id, shelter_id: user.shelter_id, login: user.login},
            JWT_KEY,
            {expiresIn: '1h'}
        );
        return res.status(200).json({message: 'Авторизация прошла успешно!', token});
    } catch (err) {
        console.log(err);
        return res.status(500).json({message: 'Не удалось вернуть данные!'});
    }
}

const changePass = async (req, res) => {
    const {mail, oldPassword, newPassword} = req.body;

    if (!mail || !oldPassword || !newPassword) {
        return res.status(400).json({message: 'Вы заполнили не все поля!'});
    }

    try {
        const userResult = await pool.query('SELECT * FROM "User" WHERE mail=$1', [mail]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({message: 'Пользователь не найден!'});
        }

        const user = userResult.rows[0];

        const isValidPassword = await bcrypt.compare(oldPassword, user.password);
        if (!isValidPassword) {
            return res.status(401).json({message: 'Не верный текущий пароль!'});
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query('UPDATE "User" SET password = $1 WHERE mail = $2',
            [hashedPassword, mail]
        );

        return res.status(200).json({message: 'Пароль успешно изменен!'});
    } catch (err) {
        console.log(err);
        return res.status(500).json({message: 'Ошибка со стороны сервера'});
    }
}

module.exports = {login, register, changePass};