const express = require('express');
const router = express.Router();
const {getExamination, getPets, addExamination, updateExamination, deleteExamination} = require('../controllers/examController');

router.get('/get-exam', getExamination);
router.get('/get-pets', getPets);
router.post('/add-examination', addExamination);
router.put('/update-examination/:id', updateExamination);
router.delete('/delete-examination/:id', deleteExamination);

module.exports = router;

