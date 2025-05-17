const express = require('express');
const router = express.Router();
const {getUsers, userId, userDelete, getRoles, userInfo, userUpdate, addUser, getShelters,
    getPets, getPetsInfo, getUsersList, addAdoption, addContent, getNetworks, getShelterFromNetwork,
    getAllShelterFromNetwork, getShelterInfo, getPetsContent, userAccount, getNotifications, deleteNotifications} = require('../controllers/userController');

router.get('/get-users', getUsers);
router.put('/users/:id', userId);
router.delete('/users/:id', userDelete);
router.get('/get-roles', getRoles);
router.post('/user-info', userInfo);
router.put('/user-update', userUpdate);
router.post('/add-user', addUser);
router.get('/get-shelters', getShelters);
router.get('/get-pets', getPets);
router.get('/get-pets-info/:id', getPetsInfo);
router.get('/get-users-list/:shelter', getUsersList);
router.post('/add-adoption', addAdoption);
router.post('/add-content', addContent);
router.get('/get-networks', getNetworks);
router.get('/get-shelter-from-network', getShelterFromNetwork);
router.get('/get-all-shelter-from-network', getAllShelterFromNetwork);
router.get('/get-shelter-info/:id', getShelterInfo);
router.get('/get-pets-content', getPetsContent);
router.put('/user-account', userAccount);
router.get('/get-notifications', getNotifications);
router.delete('/notifications/:id', deleteNotifications);

module.exports = router;