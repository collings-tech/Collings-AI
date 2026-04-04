'use strict';

/**
 * scheduler.js (backend) — processes SEO jobs using Mongoose models directly.
 * Runs as long as the backend server is running — independent of the desktop app.
 */

const cron = require('node-cron');
const Site = require('../models/Site');
const SeoJob = require('../models/SeoJob');
const SeoLog = require('../models/SeoLog');
const SeoSiteConfig = require('../models/SeoSiteConfig');
const { decrypt } = require('../utils/crypto');
const { scorePost } = require('./seoScorer');
const { optimizePost } = require('./seoOptimizer');
const { writeSeoMeta, wpRequest } = require('./pluginWriter');
const logger = require('./logger');

const MAX_JOBS_PER_CYCLE = parseInt(process.env.MAX_JOBS_PER_CYCLE || '10', 10);
const SEO_REWRITE_THRESHOLD = parseInt(process.env.SEO_REWRITE_THRESHOLD || '40', 10);

let tasks = [];
let isProcessing = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function start() {
  const highTask = cron.schedule('*/5 * * * *', () => {
    processQueue(1).catch((err) => logger.error('scheduler: high-priority error', { err: err.message }));
  }, { scheduled: false });

  const medTask = cron.schedule('*/30 * * * *', () => {
    processQueue(2).catch((err) => logger.error('scheduler: medium-priority error', { err: err.message }));
  }, { scheduled: false });

  const lowTask = cron.schedule('0 * * * *', () => {
    processQueue(3).catch((err) => logger.error('scheduler: low-priority error', { err: err.message }));
  }, { scheduled: false });

  highTask.start();
  medTask.start();
  lowTask.start();
  tasks = [highTask, medTask, lowTask];
  logger.info('scheduler: started (high=5m, medium=30m, low=1h)');
}

function stop() {
  for (const t of tasks) { try { t.stop(); } catch { /* ignore */ } }
  tasks = [];
  logger.info('scheduler: stopped');
}

// ---------------------------------------------------------------------------
// Queue processing
// ---------------------------------------------------------------------------

async function processQueue(priorityFilter) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    // Find all pending jobs at this priority, sorted by priority asc then age asc
    const jobs = await SeoJob.find({ priority: priorityFilter, status: 'pending' })
      .sort({ priority: 1, createdAt: 1 })
      .limit(MAX_JOBS_PER_CYCLE);

    if (jobs.length === 0) return;

    // Group by siteId so we only decrypt credentials once per site per cycle
    const sitesMap = new Map();

    for (const job of jobs) {
      const siteId = String(job.siteId);
      if (!sitesMap.has(siteId)) {
        const site = await Site.findById(job.siteId);
        if (!site) continue;

        let config = await SeoSiteConfig.findOne({ siteId: site._id });
        if (!config) config = { enabled: true, seoPlugin: 'none', scoreThresholdRewrite: SEO_REWRITE_THRESHOLD };
        if (!config.enabled) continue;

        let wpAppPassword;
        try { wpAppPassword = decrypt(site.wpAppPassword); }
        catch (err) { logger.error('processQueue: decrypt failed', { siteId, err: err.message }); continue; }

        sitesMap.set(siteId, {
          creds: { siteUrl: site.siteUrl, wpUsername: site.wpUsername, wpAppPassword },
          seoPlugin: config.seoPlugin || 'none',
          rewriteThreshold: config.scoreThresholdRewrite || SEO_REWRITE_THRESHOLD,
        });
      }

      const siteCtx = sitesMap.get(siteId);
      if (!siteCtx) continue;

      try {
        await processJob(job, siteCtx);
      } catch (err) {
        // processJob handles its own failJob — just continue
      }
    }

    logger.info('processQueue: cycle complete', { priority: priorityFilter, processed: jobs.length });
  } finally {
    isProcessing = false;
  }
}

// ---------------------------------------------------------------------------
// Single job
// ---------------------------------------------------------------------------

async function processJob(job, { creds, seoPlugin, rewriteThreshold }) {
  // Atomically lock: only one worker picks a job
  const locked = await SeoJob.findOneAndUpdate(
    { _id: job._id, status: 'pending' },
    { $set: { status: 'processing', startedAt: new Date() } },
    { new: true }
  );
  if (!locked) return; // already taken

  logger.info('processJob: started', { jobId: job._id, postId: job.postId, postType: job.postType });

  try {
    const endpoint = `/${job.postType === 'page' ? 'pages' : 'posts'}/${job.postId}`;

    // 1. Fetch post
    const post = await wpRequest({ ...creds, method: 'GET', endpoint: `${endpoint}?context=edit` });

    // 2. Score
    const { score: scoreBefore, seoMeta: currentSeoMeta } = scorePost(post, seoPlugin);
    logger.info('processJob: scored', { postId: job.postId, scoreBefore });

    if (scoreBefore >= 80 && job.priority > 1) {
      logger.info('processJob: already Good, skipping', { postId: job.postId });
      await SeoJob.findByIdAndUpdate(job._id, { $set: { status: 'completed', completedAt: new Date() } });
      return;
    }

    // 3. Fetch other posts for internal link suggestions
    let otherPosts = [];
    try {
      otherPosts = await wpRequest({
        ...creds, method: 'GET', endpoint: '/posts',
        data: { status: 'publish', per_page: 20, _fields: 'id,title,link', exclude: job.postId },
      });
    } catch { /* non-critical */ }

    // 4. Ask Claude
    const optimized = await optimizePost(post, currentSeoMeta, seoPlugin, otherPosts || [], scoreBefore, rewriteThreshold);

    // 5. Write back to WordPress
    await writeSeoMeta(creds, job.postId, job.postType, seoPlugin, optimized);

    // 6. Re-score
    const updatedPost = await wpRequest({ ...creds, method: 'GET', endpoint: `${endpoint}?context=edit` });
    const { score: scoreAfter } = scorePost(updatedPost, seoPlugin);

    // 7. Save log
    const postTitle = typeof post.title === 'object' ? post.title.rendered || '' : String(post.title || '');
    await SeoLog.create({
      siteId: job.siteId,
      postId: job.postId,
      postTitle,
      scoreBefore,
      scoreAfter,
      changes: {
        focusKeyword: { before: currentSeoMeta.focusKeyword, after: optimized.focusKeyword },
        metaTitle: { before: currentSeoMeta.metaTitle, after: optimized.metaTitle },
        metaDescription: { before: currentSeoMeta.metaDescription, after: optimized.metaDescription },
        internalLinksAdded: optimized.internalLinks.length,
        contentRewritten: !!optimized.rewrittenContent,
      },
    });

    // 8. Mark complete
    await SeoJob.findByIdAndUpdate(job._id, { $set: { status: 'completed', completedAt: new Date() } });
    logger.info('processJob: complete', { jobId: job._id, postId: job.postId, scoreBefore, scoreAfter });

  } catch (err) {
    logger.error('processJob: error', { jobId: job._id, postId: job.postId, err: err.message });
    await SeoJob.findByIdAndUpdate(job._id, {
      $set: { status: 'failed', completedAt: new Date(), error: err.message },
    });
    throw err;
  }
}

module.exports = { start, stop, processQueue };
