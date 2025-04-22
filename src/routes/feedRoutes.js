const express = require('express');
const router = express.Router();
const { getShelters, getFeed, addFeed, updateFeed, feedDelete } = require('../controllers/feedController');

router.get('/get-shelters', getShelters);
router.get('/get-feed', getFeed);
router.post('/add-feed', addFeed);
router.put('/update-feed/:id', updateFeed);
router.delete('/delete-feed/:id', feedDelete);

module.exports = router;