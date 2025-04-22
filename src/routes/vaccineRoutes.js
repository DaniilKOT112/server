const express = require('express');
const router = express.Router();
const {getVaccines, getVaccine, getShelters, addVaccine, updateVaccine, deleteVaccine} = require('../controllers/vaccineController');

router.get('/get-vaccines', getVaccines);
router.get('/get-shelters', getShelters);
router.get('/get-vaccine', getVaccine);
router.post('/add-vaccine', addVaccine);
router.put('/vaccine/:id', updateVaccine);
router.delete('/vaccine/:id', deleteVaccine);

module.exports = router;