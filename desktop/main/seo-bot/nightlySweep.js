'use strict';

/**
 * nightlySweep.js — Runs at 2 am daily.
 *
 * For every enabled site:
 *   1. Fetches all published posts + pages (paginated, up to 200 each).
 *   2. Scores each one locally.
 *   3. Queues a SEO job for any post below 80, using priority 2 (score < 60)
 *      or priority 3 (score 60–79). Already-pending jobs are upgraded if the
 *      new priority is higher (the backend handles deduplication).
 */

const { wpRequest } = require('../wp-api');
const { scorePost } = require('./seoScorer');
const jobQueue = require('./jobQueue');
const logger = require('./logger');

const MAX_POSTS_PER_TYPE = 200;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

async function runNightlySweep() {
  if (!jobQueue.isAuthenticated()) {
    logger.info('Nightly sweep skipped: user not authenticated');
    return;
  }

  logger.info('Nightly SEO sweep started');

  let sites;
  try {
    sites = await jobQueue.getAllSites(true); // force-refresh site cache
  } catch (err) {
    logger.error('Nightly sweep: failed to fetch sites', { err: err.message });
    return;
  }

  for (const site of sites) {
    try {
      await sweepSite(site);
    } catch (err) {
      logger.error('Nightly sweep: error on site', { siteId: site._id, err: err.message });
    }
  }

  logger.info('Nightly SEO sweep complete');
}

// ---------------------------------------------------------------------------
// Per-site sweep
// ---------------------------------------------------------------------------

async function sweepSite(site) {
  const siteId = site._id;

  let config;
  try {
    config = await jobQueue.getSiteConfig(siteId);
  } catch {
    config = { enabled: true, seoPlugin: 'none', scoreThresholdRewrite: 40 };
  }

  if (!config.enabled) {
    logger.info('Nightly sweep: bot disabled for site', { siteId, label: site.label });
    return;
  }

  const creds = {
    siteUrl: site.siteUrl,
    wpUsername: site.wpUsername,
    wpAppPassword: site.wpAppPassword,
  };
  const seoPlugin = config.seoPlugin || 'none';

  const [posts, pages] = await Promise.all([
    fetchAllContent(creds, 'posts'),
    fetchAllContent(creds, 'pages'),
  ]);

  logger.info('Nightly sweep: fetched content', {
    siteId,
    posts: posts.length,
    pages: pages.length,
  });

  let queued = 0;

  for (const post of [...posts, ...pages]) {
    const { score } = scorePost(post, seoPlugin);

    // Only queue if below 80 — "Good" posts are skipped
    if (score >= 80) continue;

    const priority = score < 60 ? 2 : 3;
    const triggeredBy = score < 40 ? 'low_score' : 'nightly_sweep';
    const postType = post.type === 'page' ? 'page' : 'post';

    try {
      await jobQueue.createJob(siteId, post.id, postType, priority, triggeredBy);
      queued++;
    } catch (err) {
      // 200 responses (duplicate upgraded) are not errors — only log real failures
      if (err.response?.status !== 200) {
        logger.debug('Nightly sweep: could not queue job', { postId: post.id, err: err.message });
      }
    }
  }

  logger.info('Nightly sweep: queued jobs', { siteId, label: site.label, queued });
}

// ---------------------------------------------------------------------------
// WordPress post fetcher (paginated)
// ---------------------------------------------------------------------------

async function fetchAllContent(creds, type) {
  const results = [];
  let page = 1;

  while (results.length < MAX_POSTS_PER_TYPE) {
    let batch;
    try {
      batch = await wpRequest({
        ...creds,
        method: 'GET',
        endpoint: `/${type}`,
        data: {
          status: 'publish',
          per_page: 100,
          page,
          context: 'edit',
          _fields: 'id,type,title,content,excerpt,meta',
        },
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
