const express = require('express');
const router = express.Router();
const {getNetwork, getShelters, addShelter, updateShelter, shelterDelete, getStatus} = require('../controllers/shelterController');

router.get('/get-network', getNetwork);
router.get('/get-shelters', getShelters);
router.post('/add-shelter', addShelter);
router.put('/shelter/:id', updateShelter);
router.delete('/shelter/:id', shelterDelete);
router.get('/get-status', getStatus);

module.exports = router;