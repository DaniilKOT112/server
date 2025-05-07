const express = require('express');
const router = express.Router();
const {getUsers, userId, userDelete, getRoles, userInfo, userUpdate, addUser, getShelters, getPets} = require('../controllers/userController');

router.get('/get-users', getUsers);
router.put('/users/:id', userId);
router.delete('/users/:id', userDelete);
router.get('/get-roles', getRoles);
router.post('/user-info', userInfo);
router.put('/user-update', userUpdate);
router.post('/add-user', addUser);
router.get('/get-shelters', getShelters);
router.get('/get-pets', getPets);

module.exports = router;