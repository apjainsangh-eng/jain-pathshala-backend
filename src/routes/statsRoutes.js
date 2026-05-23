const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { authenticate } = require('../middleware/auth');

router.get('/yearly', authenticate, statsController.getYearlyStats);
router.get('/comprehensive', authenticate, statsController.getComprehensiveStats);

module.exports = router;
