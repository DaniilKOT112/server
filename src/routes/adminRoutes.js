const express = require('express');
const router = express.Router();
const {getAdmins, getShelters, adminsId, addAdmins, adminsDelete} = require('../controllers/adminController');

router.get('/get-admins', getAdmins);
router.get('/get-shelters', getShelters);
router.put('/admins/:id', adminsId);
router.post('/add-admins', addAdmins);
router.delete('/admin-delete/:id', adminsDelete);

module.exports = router;