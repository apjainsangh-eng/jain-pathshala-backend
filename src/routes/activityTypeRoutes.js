const express = require('express');
const router = express.Router();
const activityTypeController = require('../controllers/activityTypeController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, activityTypeController.getActivityTypes);
router.post('/', authenticate, activityTypeController.createActivityType);
router.put('/:id', authenticate, activityTypeController.updateActivityType);
router.delete('/:id', authenticate, activityTypeController.deleteActivityType);

module.exports = router;
