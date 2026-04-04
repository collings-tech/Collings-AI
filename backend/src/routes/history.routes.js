'use strict';

const { Router } = require('express');
const historyController = require('../controllers/history.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = Router();

// All history routes require authentication
router.use(authMiddleware);

// GET /v1/history/:siteId
router.get('/:siteId', historyController.get);

// POST /v1/history/:siteId
router.post('/:siteId', historyController.append);

// DELETE /v1/history/:siteId
router.delete('/:siteId', historyController.clear);

module.exports = router;
