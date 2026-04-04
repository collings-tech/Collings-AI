'use strict';

const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    siteUrl: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    wpUsername: {
      type: String,
      required: true,
      trim: true,
    },
    wpAppPassword: {
      type: String,
      required: true,
    },
    lastUsedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Site', siteSchema);
