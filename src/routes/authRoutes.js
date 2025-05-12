const express = require('express');
const router = express.Router();
const { login, register, changePass, resetMailLog, resetPassLog} = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/change-password', changePass);
router.post('/reset-mail-log', resetMailLog);
router.post('/reset-pass-log', resetPassLog);

module.exports = router;