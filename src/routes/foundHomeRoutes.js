const express = require('express');
const router = express.Router();
const {getStatus, getFoundHome, getShelters, addFoundHome, updateFoundHome,
    foundHomeDelete, getFoundHomeUser} = require('../controllers/foundHomeController');

router.get('/get-status', getStatus);
router.get('/get-shelters', getShelters);
router.get('/get-found-home', getFoundHome);
router.post('/add-found-home', addFoundHome);
router.put('/update-found-home/:id', updateFoundHome);
router.delete('/delete-found-home/:id', foundHomeDelete);
router.get('/get-found-home-user', getFoundHomeUser);

module.exports = router;