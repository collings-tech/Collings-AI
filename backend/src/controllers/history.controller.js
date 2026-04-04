'use strict';

const ChatHistory = require('../models/ChatHistory');

async function get(req, res, next) {
  try {
    const { siteId } = req.params;

    const history = await ChatHistory.findOne({
      userId: req.user.id,
      siteId,
    });

    return res.json({ messages: history ? history.messages : [] });
  } catch (err) {
    next(err);
  }
}

async function append(req, res, next) {
  try {
    const { siteId } = req.params;
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ error: 'messages must be a non-empty array.' });
    }

    for (const msg of messages) {
      if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
        return res
          .status(400)
          .json({ error: 'Each message must have a valid role (user or assistant).' });
      }
      if (typeof msg.content !== 'string' || msg.content.trim() === '') {
        return res
          .status(400)
          .json({ error: 'Each message must have non-empty string content.' });
      }
    }

    let history = await ChatHistory.findOne({ userId: req.user.id, siteId });

    if (!history) {
      history = new ChatHistory({ userId: req.user.id, siteId, messages: [] });
    }

    history.messages.push(...messages);
    await history.save();

    return res.json({ messages: history.messages });
  } catch (err) {
    next(err);
  }
}

async function clear(req, res, next) {
  try {
    const { siteId } = req.params;

    const history = await ChatHistory.findOne({ userId: req.user.id, siteId });

    if (!history) {
      return res.json({ messages: [] });
    }

    history.messages = [];
    await history.save();

    return res.json({ messages: [] });
  } catch (err) {
    next(err);
  }
}

module.exports = { get, append, clear };
