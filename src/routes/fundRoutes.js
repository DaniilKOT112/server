const express = require('express');
const router = express.Router();
const {addFund, updateFund, getFund, deleteFund, getShelters} = require('../controllers/fundController');

router.get('/get-fund', getFund);
router.post('/add-fund', addFund);
router.put('/fund/:id', updateFund);
router.delete('/fund/:id', deleteFund);
router.get('/get-shelters', getShelters);

module.exports = router;