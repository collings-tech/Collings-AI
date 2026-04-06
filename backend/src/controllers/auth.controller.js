'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const { JWT_SECRET, JWT_REFRESH_SECRET } = require('../config/env');
const { sendOtpEmail } = require('../utils/email');

const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function generateAccessToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
    expiresIn: '15m',
  });
}

function generateRefreshToken(user) {
  return jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
    expiresIn: '30d',
  });
}

// Step 1: Validate details, store in PendingRegistration, send OTP
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Block if email already has a fully registered account
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);

    // Upsert: replace any previous pending registration for this email
    await PendingRegistration.findOneAndUpdate(
      { email: normalizedEmail },
      { name: name.trim(), passwordHash, otpCode: otp, otpExpiry },
      { upsert: true, new: true }
    );

    await sendOtpEmail(normalizedEmail, otp);

    return res.status(200).json({
      message: 'OTP sent to your email. Please verify to complete registration.',
      email: normalizedEmail,
    });
  } catch (err) {
    next(err);
  }
}

// Step 2: Verify OTP → create real User, delete pending record
async function verifyOtp(req, res, next) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'email and otp are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const pending = await PendingRegistration.findOne({ email: normalizedEmail });
    if (!pending) {
      return res.status(404).json({ error: 'No pending registration for this email. Please register again.' });
    }

    if (new Date() > pending.otpExpiry) {
      await PendingRegistration.deleteOne({ email: normalizedEmail });
      return res.status(400).json({ error: 'OTP has expired. Please register again.' });
    }

    if (pending.otpCode !== otp) {
      return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    // OTP is valid — create the real user account
    const user = await User.create({
      name: pending.name,
      email: pending.email,
      passwordHash: pending.passwordHash,
    });

    // Remove the pending record
    await PendingRegistration.deleteOne({ email: normalizedEmail });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return res.status(201).json({
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
}

// Resend a fresh OTP for an existing pending registration
async function resendOtp(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const pending = await PendingRegistration.findOne({ email: normalizedEmail });
    if (!pending) {
      return res.status(404).json({ error: 'No pending registration for this email. Please register again.' });
    }

    const otp = generateOtp();
    pending.otpCode = otp;
    pending.otpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
    await pending.save();

    await sendOtpEmail(normalizedEmail, otp);

    return res.status(200).json({ message: 'A new OTP has been sent to your email.' });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required.' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }

    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const accessToken = generateAccessToken(user);

    return res.json({ accessToken });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  return res.status(200).json({ message: 'Logged out successfully.' });
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ id: user._id, name: user.name, email: user.email });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name: name.trim() },
      { new: true }
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json({ id: user._id, name: user.name, email: user.email });
  } catch (err) {
    next(err);
  }
}

async function updatePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();
    return res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, verifyOtp, resendOtp, login, refresh, logout, me, updateProfile, updatePassword };
