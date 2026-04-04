'use strict';

const { Router } = require('express');
const logsController = require('../controllers/logs.controller');
const authMiddleware = require('../middleware/auth.middleware');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

const router = Router();

// Optional auth — attaches req.user if a valid token is present, but never blocks
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
      req.user = { id: payload.id, email: payload.email };
    } catch {
      // invalid token — proceed without user
    }
  }
  next();
}

// POST /v1/logs/error — desktop app posts errors here (auth optional)
router.post('/error', optionalAuth, logsController.logError);

// GET /v1/logs/error — retrieve logs (requires auth)
router.get('/error', authMiddleware, logsController.list);

module.exports = router;
