const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authenticate } = require('../middleware/auth');

router.get('/family-members', authenticate, studentController.getFamilyMembers);
router.get('/family-member/:username/data', authenticate, studentController.getFamilyMemberData);
router.get('/family-member/:username/stats', authenticate, studentController.getFamilyMemberStats);

module.exports = router;
