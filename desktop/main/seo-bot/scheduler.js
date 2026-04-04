'use strict';

/**
 * scheduler.js — Job processing engine for the SEO Bot.
 *
 * Exports start() / stop() which manage three node-cron schedules:
 *   • Every 5 min  → priority-1 (high) jobs
 *   • Every 30 min → priority-2 (medium) jobs
 *   • Every hour   → priority-3 (low) jobs
 *
 * Each cycle pulls pending jobs from the backend, locks each one, calls
 * Claude for optimisation, writes the results back to WordPress, and logs
 * the before/after snapshot.
 */

const cron = require('node-cron');
const store = require('../store');
const { wpRequest } = require('../wp-api');
const { scorePost } = require('./seoScorer');
const { optimizePost } = require('./seoOptimizer');
const { writeSeoMeta } = require('./pluginWriter');
const jobQueue = require('./jobQueue');
const logger = require('./logger');

let tasks = [];
let isProcessing = false; // mutex — only one cycle runs at a time

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function start() {
  const highTask = cron.schedule('*/5 * * * *', () => {
    processQueue(1).catch((err) =>
      logger.error('scheduler: high-priority cycle error', { err: err.message })
    );
  }, { scheduled: false });

  const medTask = cron.schedule('*/30 * * * *', () => {
    processQueue(2).catch((err) =>
      logger.error('scheduler: medium-priority cycle error', { err: err.message })
    );
  }, { scheduled: false });

  const lowTask = cron.schedule('0 * * * *', () => {
    processQueue(3).catch((err) =>
      logger.error('scheduler: low-priority cycle error', { err: err.message })
    );
  }, { scheduled: false });

  highTask.start();
  medTask.start();
  lowTask.start();

  tasks = [highTask, medTask, lowTask];
  logger.info('scheduler: started (high=5m, medium=30m, low=1h)');
}

function stop() {
  for (const task of tasks) {
    try { task.stop(); } catch { /* ignore */ }
  }
  tasks = [];
  logger.info('scheduler: stopped');
}

// ---------------------------------------------------------------------------
// Queue processing
// ---------------------------------------------------------------------------

async function processQueue(priorityFilter) {
  if (!jobQueue.isAuthenticated()) return;
  if (isProcessing) return; // skip if already in a cycle

  isProcessing = true;
  try {
    let sites;
    try {
      sites = await jobQueue.getAllSites();
    } catch (err) {
      logger.error('processQueue: could not fetch sites', { err: err.message });
      return;
    }

    const maxJobsPerCycle = parseInt(store.get('MAX_JOBS_PER_CYCLE') || '10', 10);
    let processed = 0;

    for (const site of sites) {
      if (processed >= maxJobsPerCycle) break;

      let config;
      try {
        config = await jobQueue.getSiteConfig(site._id);
      } catch {
        config = { enabled: true, seoPlugin: 'none', scoreThresholdRewrite: 40 };
      }

      if (!config.enabled) continue;

      let pending;
      try {
        pending = await jobQueue.getPendingJobs(site._id);
      } catch (err) {
        logger.warn('processQueue: could not fetch jobs', { siteId: site._id, err: err.message });
        continue;
      }

      // Filter by requested priority, then sort: priority asc, createdAt asc
      const jobs = pending
        .filter((j) => j.priority === priorityFilter)
        .sort((a, b) => a.priority - b.priority || new Date(a.createdAt) - new Date(b.createdAt));

      const creds = {
        siteUrl: site.siteUrl,
        wpUsername: site.wpUsername,
        wpAppPassword: site.wpAppPassword,
      };

      for (const job of jobs) {
        if (processed >= maxJobsPerCycle) break;
        try {
          await processJob(job, site._id, creds, config);
          processed++;
        } catch (err) {
          // processJob already logs and calls failJob — just continue
        }
      }
    }

    if (processed > 0) {
      logger.info('processQueue: cycle complete', { priority: priorityFilter, processed });
    }
  } finally {
    isProcessing = false;
  }
}

// ---------------------------------------------------------------------------
// Single job processing
// ---------------------------------------------------------------------------

async function processJob(job, siteId, creds, config) {
  const { _id: jobId, postId, postType } = job;

  // Lock the job — if it fails (already locked by a concurrent instance), skip
  try {
    await jobQueue.lockJob(siteId, jobId);
  } catch (err) {
    logger.debug('processJob: could not lock job (may already be taken)', {
      jobId,
      err: err.message,
    });
    return;
  }

  logger.info('processJob: started', { jobId, postId, postType, siteId });

  try {
    const seoPlugin = config.seoPlugin || 'none';
    const rewriteThreshold = parseInt(
      store.get('SEO_REWRITE_THRESHOLD') || String(config.scoreThresholdRewrite || 40),
      10
    );
    const endpoint = `/${postType === 'page' ? 'pages' : 'posts'}/${postId}`;

    // 1. Fetch post
    const post = await wpRequest({
      ...creds,
      method: 'GET',
      endpoint: `${endpoint}?context=edit`,
    });

    // 2. Score current state
    const { score: scoreBefore, seoMeta: currentSeoMeta } = scorePost(post, seoPlugin);
    logger.info('processJob: scored', { postId, scoreBefore });

    // Skip if already "Good" and not a high-priority job
    if (scoreBefore >= 80 && job.priority > 1) {
      logger.info('processJob: score is Good, skipping', { postId, scoreBefore });
      await jobQueue.completeJob(siteId, jobId);
      return;
    }

    // 3. Fetch a sample of other published posts for internal link suggestions
    let otherPosts = [];
    try {
      otherPosts = await wpRequest({
        ...creds,
        method: 'GET',
        endpoint: '/posts',
        data: { status: 'publish', per_page: 20, _fields: 'id,title,link', exclude: postId },
      });
    } catch {
      // Non-critical — continue without suggestions
    }

    // 4. Ask Claude to optimise
    const optimized = await optimizePost(
      post,
      currentSeoMeta,
      seoPlugin,
      otherPosts || [],
      scoreBefore,
      rewriteThreshold
    );

    // 5. Write back to WordPress
    await writeSeoMeta(creds, postId, postType, seoPlugin, optimized);

    // 6. Re-fetch and re-score to get the "after" number
    const updatedPost = await wpRequest({
      ...creds,
      method: 'GET',
      endpoint: `${endpoint}?context=edit`,
    });
    const { score: scoreAfter } = scorePost(updatedPost, seoPlugin);

    // 7. Persist log to backend
    const postTitle =
      typeof post.title === 'object' ? post.title.rendered || '' : String(post.title || '');

    try {
      await jobQueue.createLog(siteId, {
        postId,
        postTitle,
        scoreBefore,
        scoreAfter,
        changes: {
          focusKeyword: { before: currentSeoMeta.focusKeyword, after: optimized.focusKeyword },
          metaTitle: { before: currentSeoMeta.metaTitle, after: optimized.metaTitle },
          metaDescription: {
            before: currentSeoMeta.metaDescription,
            after: optimized.metaDescription,
          },
          internalLinksAdded: optimized.internalLinks.length,
          contentRewritten: !!optimized.rewrittenContent,
        },
      });
    } catch (logErr) {
      logger.warn('processJob: failed to create log', { postId, err: logErr.message });
    }

    // 8. Mark complete
    await jobQueue.completeJob(siteId, jobId);

    logger.info('processJob: complete', { jobId, postId, scoreBefore, scoreAfter });
  } catch (err) {
    logger.error('processJob: error', { jobId, postId, err: err.message });
    try {
      await jobQueue.failJob(siteId, jobId, err.message);
    } catch {
      // best-effort
    }
    throw err;
  }
}

module.exports = { start, stop, processQueue };
