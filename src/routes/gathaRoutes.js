const express = require('express');
const router = express.Router();
const gathaController = require('../controllers/gathaController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, gathaController.getGatha);
router.post('/', authenticate, gathaController.addGatha);
router.post('/for', authenticate, gathaController.addGathaFor);
router.put('/pending/:id', authenticate, gathaController.editPendingGatha);
router.delete('/pending/:id', authenticate, gathaController.deletePendingGatha);
router.put('/:id', authenticate, gathaController.editGatha);
router.delete('/:id', authenticate, gathaController.deleteGatha);

module.exports = router;
