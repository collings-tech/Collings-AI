'use strict';

const ChatSession = require('../models/ChatSession');

async function list(req, res, next) {
  try {
    const { siteId } = req.params;
    const userId = req.user._id || req.user.id;
    const sessions = await ChatSession.find({ userId, siteId })
      .sort({ lastActivityAt: -1 })
      .select('_id title lastActivityAt createdAt')
      .limit(100);
    return res.json({ sessions });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { siteId } = req.params;
    const userId = req.user._id || req.user.id;
    const session = await ChatSession.create({ userId, siteId });
    return res.json({ session });
  } catch (err) {
    next(err);
  }
}

async function getMessages(req, res, next) {
  try {
    const { siteId, sessionId } = req.params;
    const userId = req.user._id || req.user.id;
    const session = await ChatSession.findOne({ _id: sessionId, userId, siteId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json({ messages: session.messages, title: session.title });
  } catch (err) {
    next(err);
  }
}

async function appendMessages(req, res, next) {
  try {
    const { siteId, sessionId } = req.params;
    const { messages } = req.body;
    const userId = req.user._id || req.user.id;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array.' });
    }

    const session = await ChatSession.findOne({ _id: sessionId, userId, siteId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Auto-title from first user message
    if (session.messages.length === 0 && session.title === 'New conversation') {
      const firstUser = messages.find((m) => m.role === 'user');
      if (firstUser) {
        session.title = firstUser.content.slice(0, 60).trim() || 'New conversation';
      }
    }

    session.messages.push(...messages);
    session.lastActivityAt = new Date();
    await session.save();

    return res.json({ session: { _id: session._id, title: session.title } });
  } catch (err) {
    next(err);
  }
}

async function deleteSession(req, res, next) {
  try {
    const { siteId, sessionId } = req.params;
    const userId = req.user._id || req.user.id;
    await ChatSession.findOneAndDelete({ _id: sessionId, userId, siteId });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, getMessages, appendMessages, deleteSession };
