'use strict';

const mongoose = require('mongoose');

const errorLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    source: {
      type: String,
      required: true, // e.g. 'chat', 'wp-action', 'sites', 'auth', 'server'
    },
    message: {
      type: String,
      required: true,
    },
    stack: {
      type: String,
      default: null,
    },
    context: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ErrorLog', errorLogSchema);
