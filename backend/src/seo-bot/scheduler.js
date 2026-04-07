'use strict';

/**
 * scheduler.js (backend) — processes SEO jobs using Mongoose models directly.
 * Runs as long as the backend server is running — independent of the desktop app.
 */

const cron = require('node-cron');
const axios = require('axios');
const Site = require('../models/Site');
const SeoJob = require('../models/SeoJob');
const SeoLog = require('../models/SeoLog');
const SeoSiteConfig = require('../models/SeoSiteConfig');
const { decrypt } = require('../utils/crypto');
const { scorePost, simulateScore } = require('./seoScorer');
const { optimizePost, generateImageAltText } = require('./seoOptimizer');
const { writeSeoMeta, wpRequest, fixImageAltText } = require('./pluginWriter');
const logger = require('./logger');

const MAX_JOBS_PER_CYCLE = parseInt(process.env.MAX_JOBS_PER_CYCLE || '10', 10);
const SEO_REWRITE_THRESHOLD = parseInt(process.env.SEO_REWRITE_THRESHOLD || '60', 10);

// ---------------------------------------------------------------------------
// Auto-detect SEO plugin by probing WP REST API namespaces
// ---------------------------------------------------------------------------

async function detectSeoPlugin(creds) {
  try {
    const url = `${creds.siteUrl}/wp-json`;
    const res = await axios.get(url, { timeout: 8000 });
    const namespaces = res.data?.namespaces || [];
    if (namespaces.some((n) => n.startsWith('rankmath'))) return 'rankmath';
    if (namespaces.some((n) => n.startsWith('yoast'))) return 'yoast';
  } catch { /* non-critical */ }
  return 'none';
}
const MAX_RETRIES = 3;

// Transient HTTP/network errors that warrant a retry
function isTransientError(err) {
  const status = err?.response?.status;
  if (status && [429, 500, 502, 503, 504].includes(status)) return true;
  const code = err?.code;
  if (code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE'].includes(code)) return true;
  return false;
}

async function retryOrFail(job, err) {
  if (isTransientError(err) && (job.retryCount || 0) < MAX_RETRIES) {
    const retryCount = (job.retryCount || 0) + 1;
    // Exponential back-off: 5m, 15m, 45m
    const delayMs = Math.pow(3, retryCount - 1) * 5 * 60 * 1000;
    const scheduledAt = new Date(Date.now() + delayMs);
    await SeoJob.findByIdAndUpdate(job._id, {
      $set: { status: 'pending', startedAt: null, completedAt: null, error: err.message, retryCount, scheduledAt },
    });
    logger.warn('scheduler: transient error, will retry', {
      jobId: job._id, postId: job.postId, retryCount, delayMin: Math.round(delayMs / 60000), err: err.message,
    });
  } else {
    await SeoJob.findByIdAndUpdate(job._id, {
      $set: { status: 'failed', completedAt: new Date(), error: err.message },
    });
    logger.error('scheduler: job permanently failed', { jobId: job._id, postId: job.postId, err: err.message });
  }
}

let tasks = [];
let isProcessing = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function start() {
  const highTask = cron.schedule('*/15 * * * *', () => {
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
  logger.info('scheduler: started (high=15m, medium=30m, low=1h)');
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
    // Find all pending jobs at this priority that are due (scheduledAt <= now)
    const jobs = await SeoJob.find({ priority: priorityFilter, status: 'pending', scheduledAt: { $lte: new Date() } })
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
        if (!config) config = await SeoSiteConfig.create({ siteId: site._id, seoPlugin: 'none', scoreThresholdRewrite: SEO_REWRITE_THRESHOLD });
        if (!config.enabled) continue;

        let wpAppPassword;
        try { wpAppPassword = decrypt(site.wpAppPassword); }
        catch (err) { logger.error('processQueue: decrypt failed', { siteId, err: err.message }); continue; }

        const creds = { siteUrl: site.siteUrl, wpUsername: site.wpUsername, wpAppPassword };

        // Auto-detect SEO plugin if not yet configured
        if (!config.seoPlugin || config.seoPlugin === 'none') {
          const detected = await detectSeoPlugin(creds);
          if (detected !== 'none') {
            await SeoSiteConfig.findByIdAndUpdate(config._id, { $set: { seoPlugin: detected } });
            config.seoPlugin = detected;
            logger.info('scheduler: auto-detected SEO plugin', { siteId, plugin: detected });
          }
        }

        sitesMap.set(siteId, {
          creds,
          seoPlugin: config.seoPlugin || 'none',
          rewriteThreshold: config.scoreThresholdRewrite || SEO_REWRITE_THRESHOLD,
        });
      }

      const siteCtx = sitesMap.get(siteId);
      if (!siteCtx) continue;

      try {
        await processJob(job, siteCtx);
      } catch (err) {
        // processJob handles its own retry/fail — just continue
      }

      // Small delay between jobs to avoid overwhelming the WordPress server
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    logger.info('processQueue: cycle complete', { priority: priorityFilter, processed: jobs.length });
  } finally {
    isProcessing = false;
  }
}

// ---------------------------------------------------------------------------
// Single job
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Image job
// ---------------------------------------------------------------------------

async function processImageJob(job, { creds }) {
  const locked = await SeoJob.findOneAndUpdate(
    { _id: job._id, status: 'pending' },
    { $set: { status: 'processing', startedAt: new Date() } },
    { new: true }
  );
  if (!locked) return;

  logger.info('processImageJob: started', { jobId: job._id, mediaId: job.postId });

  try {
    const media = await wpRequest({ ...creds, method: 'GET', endpoint: `/media/${job.postId}` });

    // Already has alt text (may have been set manually since job was queued)
    if (media.alt_text && media.alt_text.trim() !== '') {
      logger.info('processImageJob: alt text already present, skipping', { mediaId: job.postId });
      await SeoJob.findByIdAndUpdate(job._id, { $set: { status: 'completed', completedAt: new Date() } });
      return;
    }

    const altText = await generateImageAltText(media);
    await fixImageAltText(creds, job.postId, altText);

    await SeoJob.findByIdAndUpdate(job._id, { $set: { status: 'completed', completedAt: new Date() } });
    logger.info('processImageJob: complete', { jobId: job._id, mediaId: job.postId, altText });

  } catch (err) {
    logger.error('processImageJob: error', { jobId: job._id, mediaId: job.postId, err: err.message });
    await retryOrFail(job, err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Post / page job
// ---------------------------------------------------------------------------

async function processJob(job, { creds, seoPlugin, rewriteThreshold }) {
  // Dispatch image jobs to separate handler
  if (job.postType === 'image') {
    return processImageJob(job, { creds });
  }

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

    // 4b. Simulate the score with the new values before touching WordPress.
    // If the optimized values would not improve the score, skip writing entirely.
    const { score: simulatedScore } = simulateScore(post, seoPlugin, optimized);
    logger.info('processJob: simulated score', { postId: job.postId, scoreBefore, simulatedScore });

    if (simulatedScore <= scoreBefore) {
      logger.warn('processJob: optimized values would not improve score — skipping write', {
        postId: job.postId, scoreBefore, simulatedScore,
      });
      await SeoJob.findByIdAndUpdate(job._id, { $set: { status: 'completed', completedAt: new Date() } });
      return;
    }

    // 5. Write back to WordPress — throws if the write is rejected or verified to have failed
    await writeSeoMeta(creds, job.postId, job.postType, seoPlugin, optimized, post);

    // 6. Re-fetch from WordPress and score from the actual saved data — this is the ground truth.
    // If the write silently failed, the real score will be lower and expose the problem.
    const savedPost = await wpRequest({ ...creds, method: 'GET', endpoint: `${endpoint}?context=edit` });
    const { score: scoreAfter } = scorePost(savedPost, seoPlugin);
    logger.info('processJob: verified score after write', { postId: job.postId, scoreBefore, simulatedScore, scoreAfter });

    // 7. Save log — and mirror to all other users who share this WordPress URL
    const postTitle = typeof post.title === 'object' ? post.title.rendered || '' : String(post.title || '');
    const logEntry = {
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
    };

    // Find all site records for this WordPress URL (other users sharing the same site)
    const coSites = await Site.find({ siteUrl: creds.siteUrl }, '_id');
    await Promise.all(coSites.map((s) => SeoLog.create({ ...logEntry, siteId: s._id })));

    // 8. Mark complete
    await SeoJob.findByIdAndUpdate(job._id, { $set: { status: 'completed', completedAt: new Date() } });
    logger.info('processJob: complete', { jobId: job._id, postId: job.postId, scoreBefore, scoreAfter });

  } catch (err) {
    logger.error('processJob: error', { jobId: job._id, postId: job.postId, err: err.message });
    await retryOrFail(job, err);
    throw err;
  }
}

module.exports = { start, stop, processQueue };
