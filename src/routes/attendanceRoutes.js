const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, attendanceController.getAttendance);
router.post('/mark', authenticate, attendanceController.markAttendance);
router.post('/mark-for', authenticate, attendanceController.markAttendanceFor);
router.post('/unmark', authenticate, attendanceController.unmarkAttendance);
router.delete('/pending/:id', authenticate, attendanceController.deletePendingAttendance);

module.exports = router;
