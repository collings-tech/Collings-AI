'use strict';

const mongoose = require('mongoose');

const seoLogSchema = new mongoose.Schema(
  {
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      required: true,
      index: true,
    },
    postId: { type: Number, required: true },
    postTitle: { type: String, default: '' },
    scoreBefore: { type: Number, required: true },
    scoreAfter: { type: Number, required: true },
    changes: {
      focusKeyword: {
        before: { type: String, default: '' },
        after: { type: String, default: '' },
      },
      metaTitle: {
        before: { type: String, default: '' },
        after: { type: String, default: '' },
      },
      metaDescription: {
        before: { type: String, default: '' },
        after: { type: String, default: '' },
      },
      internalLinksAdded: { type: Number, default: 0 },
      contentRewritten: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

seoLogSchema.index({ siteId: 1, createdAt: -1 });
seoLogSchema.index({ siteId: 1, postId: 1 });

module.exports = mongoose.model('SeoLog', seoLogSchema, 'seo_logs');
