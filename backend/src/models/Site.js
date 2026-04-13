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
      index: true,
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
    // Optional: override the GSC property URL for this site
    // e.g. "sc-domain:example.com" or "https://www.example.com/"
    // If null, gscService.js auto-derives it from siteUrl
    gscProperty: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// One record per user per WordPress URL — multiple users CAN share the same siteUrl
siteSchema.index({ userId: 1, siteUrl: 1 }, { unique: true });

module.exports = mongoose.model('Site', siteSchema);
