'use strict';

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const chatSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
    title: { type: String, default: 'New conversation' },
    messages: { type: [messageSchema], default: [] },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

chatSessionSchema.index({ userId: 1, siteId: 1, lastActivityAt: -1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
