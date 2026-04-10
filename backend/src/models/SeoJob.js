'use strict';

const mongoose = require('mongoose');

const seoJobSchema = new mongoose.Schema(
  {
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      required: true,
      index: true,
    },
    postId: {
      type: Number,
      required: true,
    },
    postType: {
      type: String,
      enum: ['post', 'page', 'image'],
      default: 'post',
    },
    priority: {
      type: Number,
      enum: [1, 2, 3],
      default: 2,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'paused'],
      default: 'pending',
      index: true,
    },
    triggeredBy: {
      type: String,
      enum: ['new_post', 'nightly_sweep', 'manual', 'low_score', 'quick_sweep', 'image_check'],
      required: true,
    },
    scheduledAt: {
      type: Date,
      default: () => new Date(),
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error: { type: String, default: null },
    retryCount: { type: Number, default: 0 },
    result: {
      type: {
        action: { type: String }, // 'seo_optimization' | 'alt_text' | 'skipped'
        skippedReason: { type: String, default: null },
        scoreBefore: { type: Number, default: null },
        scoreAfter: { type: Number, default: null },
        postTitle: { type: String, default: null },
        altText: { type: String, default: null },
        changes: {
          focusKeyword: { before: String, after: String },
          metaTitle: { before: String, after: String },
          metaDescription: { before: String, after: String },
          internalLinksAdded: { type: Number, default: 0 },
          contentRewritten: { type: Boolean, default: false },
        },
      },
      default: null,
    },
  },
  { timestamps: true }
);

seoJobSchema.index({ siteId: 1, status: 1, priority: 1 });
seoJobSchema.index({ siteId: 1, postId: 1, status: 1 });

module.exports = mongoose.model('SeoJob', seoJobSchema, 'seo_jobs');
