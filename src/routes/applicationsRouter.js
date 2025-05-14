const express = require('express');
const router = express.Router();
const {getContent, acceptContent, cancelContent, deleteContent} = require('../controllers/applicationsController');

router.get('/get-content', getContent);
router.post('/accept-content', acceptContent);
router.post('/cancel-content', cancelContent);
router.delete('/delete-content/:id', deleteContent);

module.exports = router;