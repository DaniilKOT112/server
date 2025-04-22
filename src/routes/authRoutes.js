const express = require('express');
const router = express.Router();
const { login, register, changePass} = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/change-password', changePass);

module.exports = router;