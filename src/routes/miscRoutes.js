const express = require('express');
const router = express.Router();
const miscController = require('../controllers/miscController');
const { authenticate } = require('../middleware/auth');

router.get('/leaderboard', authenticate, miscController.getLeaderboard);
router.get('/leaderboard/kids', authenticate, miscController.getKidsLeaderboard);
router.get('/analytics/leaderboard', authenticate, miscController.getAnalyticsLeaderboard);

router.get('/history/:year/:month', authenticate, miscController.getHistory);

router.get('/achievements', authenticate, miscController.getAchievements);
router.post('/achievements/unlock', authenticate, miscController.unlockAchievement);

router.get('/profile', authenticate, miscController.getProfile);
router.put('/profile', authenticate, miscController.updateProfile);

router.post('/change-password', authenticate, miscController.changePassword);

module.exports = router;
