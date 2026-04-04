'use strict';

const ErrorLog = require('../models/ErrorLog');

async function logError(req, res, next) {
  try {
    const { source, message, stack, context } = req.body;

    if (!source || !message) {
      return res.status(400).json({ error: 'source and message are required.' });
    }

    await ErrorLog.create({
      userId: req.user?.id || null,
      source,
      message: String(message).slice(0, 2000),
      stack: stack ? String(stack).slice(0, 5000) : null,
      context: context || null,
    });

    return res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const logs = await ErrorLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ logs });
  } catch (err) {
    next(err);
  }
}

module.exports = { logError, list };
