const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const studentProfileController = require('../controllers/studentProfileController');
const bulkController = require('../controllers/bulkController');
const { authenticate } = require('../middleware/auth');

// === Stats & Pending ===
router.get('/stats', authenticate, adminController.getStats);
router.get('/pending', authenticate, adminController.getPending);

// === Admin Direct Add ===
router.post('/gatha/add', authenticate, adminController.addGathaForStudent);
router.post('/attendance/add', authenticate, adminController.addAttendanceForStudent);

// === Single Approve / Reject ===
router.post('/attendance/approve/:id', authenticate, adminController.approveAttendance);
router.post('/attendance/reject/:id', authenticate, adminController.rejectAttendance);
router.post('/gatha/approve/:id', authenticate, adminController.approveGatha);
router.post('/gatha/reject/:id', authenticate, adminController.rejectGatha);
router.post('/approve-all', authenticate, adminController.approveAll);

// === Students List ===
router.get('/students', authenticate, adminController.getStudents);
router.get('/top-students', authenticate, adminController.getTopStudents);
router.get('/export-report', authenticate, adminController.exportReport);
router.post('/seed-students', authenticate, adminController.seedStudents);

// === Student Profile ===
router.get('/student/:username/profile', authenticate, studentProfileController.getStudentProfile);
router.get('/student/:username/notes', authenticate, studentProfileController.getStudentNotes);
router.post('/student/:username/notes', authenticate, studentProfileController.addStudentNote);

// === Bulk Operations ===
router.post('/bulk/attendance', authenticate, bulkController.bulkAttendance);
router.post('/bulk/gatha', authenticate, bulkController.bulkGatha);
router.post('/bulk/approve', authenticate, bulkController.bulkApprove);
router.post('/bulk/reject', authenticate, bulkController.bulkReject);

// === Register & Analytics ===
router.get('/attendance-register', authenticate, bulkController.getAttendanceRegister);
router.get('/dashboard-analytics', authenticate, bulkController.getDashboardAnalytics);
router.get('/group/:groupId/analytics', authenticate, bulkController.getGroupAnalytics);
router.get('/audit-log', authenticate, bulkController.getAuditLog);

// === User Management ===
router.get('/users', authenticate, adminController.getUsers);
router.post('/users', authenticate, adminController.createUser);
router.put('/users/:id', authenticate, adminController.updateUser);
router.delete('/users/:id', authenticate, adminController.deleteUser);

// === Family Group Management ===
router.get('/family-groups', authenticate, adminController.getFamilyGroups);
router.post('/family-groups', authenticate, adminController.createFamilyGroup);
router.delete('/family-groups/:id', authenticate, adminController.deleteFamilyGroup);

module.exports = router;
