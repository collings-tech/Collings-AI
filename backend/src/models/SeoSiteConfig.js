'use strict';

const mongoose = require('mongoose');

const seoSiteConfigSchema = new mongoose.Schema(
  {
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      required: true,
      unique: true,
      index: true,
    },
    enabled: { type: Boolean, default: true },
    seoPlugin: {
      type: String,
      enum: ['rankmath', 'yoast', 'none'],
      default: 'none',
    },
    scoreThresholdRewrite: { type: Number, default: 60 },
    sweepSchedule: { type: String, default: '0 2 * * *' },
    maxJobsPerCycle: { type: Number, default: 10 },
    lastSweptAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SeoSiteConfig', seoSiteConfigSchema, 'seo_site_configs');
