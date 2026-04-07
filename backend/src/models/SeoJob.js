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
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    triggeredBy: {
      type: String,
      enum: ['new_post', 'nightly_sweep', 'manual', 'low_score', '5min_sweep', 'image_check'],
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
  },
  { timestamps: true }
);

seoJobSchema.index({ siteId: 1, status: 1, priority: 1 });
seoJobSchema.index({ siteId: 1, postId: 1, status: 1 });

module.exports = mongoose.model('SeoJob', seoJobSchema, 'seo_jobs');
