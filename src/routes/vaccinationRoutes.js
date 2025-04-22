const express = require('express');
const router = express.Router();
const {getVaccine, getPets, addVaccination, getVaccination, updateVaccination, deleteVaccination} = require('../controllers/vaccinationController');

router.get('/get-vaccine', getVaccine);
router.get('/get-pets', getPets);
router.get('/get-vaccination', getVaccination);
router.post('/add-vaccination', addVaccination);
router.put('/update-vaccination/:id', updateVaccination);
router.delete('/delete-vaccination/:id', deleteVaccination);

module.exports = router;