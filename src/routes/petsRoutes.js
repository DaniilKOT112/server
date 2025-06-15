const express = require('express');
const router = express.Router();
const {getStatus, getStatusVaccination, getCategory, getShelters, getPets,
    addPets, updatePets,
    petDelete } = require('../controllers/petsController');

router.get('/get-status', getStatus);
router.get('/get-status-vaccination', getStatusVaccination);
router.get('/get-category', getCategory);
router.get('/get-shelters', getShelters);
router.get('/get-pets', getPets);
router.post('/add-pets', addPets);
router.put('/update-pets/:id', updatePets);
router.delete('/delete-pet/:id', petDelete);

module.exports = router;