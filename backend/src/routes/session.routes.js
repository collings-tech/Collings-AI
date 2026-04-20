'use strict';

const { Router } = require('express');
const sessionController = require('../controllers/session.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = Router();
router.use(authMiddleware);

router.get('/:siteId', sessionController.list);
router.post('/:siteId', sessionController.create);
router.get('/:siteId/:sessionId', sessionController.getMessages);
router.post('/:siteId/:sessionId/messages', sessionController.appendMessages);
router.delete('/:siteId/:sessionId', sessionController.deleteSession);

module.exports = router;
