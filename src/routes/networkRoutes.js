const express = require('express');
const router = express.Router();
const {getNetworks, deleteNetworks, addNetworks, updateNetworks} = require('../controllers/networkController');

router.get('/get-networks', getNetworks);
router.delete('/networks/:id', deleteNetworks);
router.post('/add-network', addNetworks);
router.put('/networks/:id', updateNetworks);

module.exports = router;