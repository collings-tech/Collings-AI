'use strict';

/**
 * nightlySweep.js (backend) — Runs at 2am daily.
 * Uses Mongoose models directly — no HTTP API round-trips.
 */

const Site = require('../models/Site');
const SeoJob = require('../models/SeoJob');
const SeoSiteConfig = require('../models/SeoSiteConfig');
const { decrypt } = require('../utils/crypto');
const { scorePost } = require('./seoScorer');
const { wpRequest } = require('./pluginWriter');
const logger = require('./logger');

const MAX_POSTS_PER_TYPE = 200;

async function runNightlySweep() {
  logger.info('Nightly SEO sweep started');

  const sites = await Site.find({});

  for (const site of sites) {
    try {
      await sweepSite(site);
    } catch (err) {
      logger.error('Nightly sweep: error on site', { siteId: site._id, err: err.message });
    }
  }

  logger.info('Nightly SEO sweep complete');
}

async function sweepSite(site) {
  let config = await SeoSiteConfig.findOne({ siteId: site._id });
  if (!config) config = { enabled: true, seoPlugin: 'none', scoreThresholdRewrite: 40 };
  if (!config.enabled) {
    logger.info('Nightly sweep: bot disabled for site', { siteId: site._id, label: site.label });
    return;
  }

  let wpAppPassword;
  try {
    wpAppPassword = decrypt(site.wpAppPassword);
  } catch (err) {
    logger.error('Nightly sweep: could not decrypt credentials', { siteId: site._id, err: err.message });
    return;
  }

  const creds = { siteUrl: site.siteUrl, wpUsername: site.wpUsername, wpAppPassword };
  const seoPlugin = config.seoPlugin || 'none';

  const [posts, pages] = await Promise.all([
    fetchAllContent(creds, 'posts'),
    fetchAllContent(creds, 'pages'),
  ]);

  logger.info('Nightly sweep: fetched content', { siteId: site._id, posts: posts.length, pages: pages.length });

  let queued = 0;
  for (const post of [...posts, ...pages]) {
    const { score } = scorePost(post, seoPlugin);
    if (score >= 80) continue;

    const priority = score < 60 ? 2 : 3;
    const triggeredBy = score < 40 ? 'low_score' : 'nightly_sweep';
    const postType = post.type === 'page' ? 'page' : 'post';

    try {
      const existing = await SeoJob.findOne({ siteId: site._id, postId: post.id, status: 'pending' });
      if (existing) {
        if (existing.priority > priority) {
          await SeoJob.findByIdAndUpdate(existing._id, { $set: { priority } });
        }
      } else {
        await SeoJob.create({ siteId: site._id, postId: post.id, postType, priority, triggeredBy, scheduledAt: new Date() });
        queued++;
      }
    } catch (err) {
      logger.debug('Nightly sweep: could not queue job', { postId: post.id, err: err.message });
    }
  }

  logger.info('Nightly sweep: queued jobs', { siteId: site._id, label: site.label, queued });
}

async function fetchAllContent(creds, type) {
  const results = [];
  let page = 1;
  while (results.length < MAX_POSTS_PER_TYPE) {
    let batch;
    try {
      batch = await wpRequest({
        ...creds, method: 'GET', endpoint: `/${type}`,
        data: { status: 'publish', per_page: 100, page, context: 'edit', _fields: 'id,type,title,content,excerpt,meta' },
      });
    } catch (err) {
      logger.warn('fetchAllContent: batch failed', { type, page, err: err.message });
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    results.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return results;
}

module.exports = { runNightlySweep, fetchAllContent };
