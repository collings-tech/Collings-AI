'use strict';

const { Router } = require('express');
const chatController = require('../controllers/chat.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = Router();

router.use(authMiddleware);

// POST /v1/chat/message
router.post('/message', chatController.sendMessage);

// POST /v1/chat/detect-seo-plugin
router.post('/detect-seo-plugin', chatController.detectSeoPlugin);

// POST /v1/chat/test-wp-connection
router.post('/test-wp-connection', chatController.testWpConnection);

module.exports = router;
