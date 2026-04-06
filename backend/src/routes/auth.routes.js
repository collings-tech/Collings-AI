'use strict';

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = Router();

// POST /v1/auth/register
router.post('/register', authController.register);

// POST /v1/auth/verify-otp
router.post('/verify-otp', authController.verifyOtp);

// POST /v1/auth/resend-otp
router.post('/resend-otp', authController.resendOtp);

// POST /v1/auth/login
router.post('/login', authController.login);

// POST /v1/auth/refresh
router.post('/refresh', authController.refresh);

// POST /v1/auth/logout
router.post('/logout', authController.logout);

// GET /v1/auth/me
router.get('/me', authMiddleware, authController.me);

// PATCH /v1/auth/me  (update name)
router.patch('/me', authMiddleware, authController.updateProfile);

// PATCH /v1/auth/me/password  (change password)
router.patch('/me/password', authMiddleware, authController.updatePassword);

module.exports = router;
