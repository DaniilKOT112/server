const express = require('express');
const router = express.Router();
const {getContent, acceptContent, cancelContent, deleteContent, getAdoption,
    deleteAdoption, acceptAdoption, cancelAdoption} = require('../controllers/applicationsController');

router.get('/get-content', getContent);
router.post('/accept-content', acceptContent);
router.post('/cancel-content', cancelContent);
router.delete('/delete-content/:id', deleteContent);
router.get('/get-adoption', getAdoption);
router.post('/accept-adoption', acceptAdoption);
router.post('/cancel-adoption', cancelAdoption);
router.delete('/delete-adoption/:id', deleteAdoption);

module.exports = router;