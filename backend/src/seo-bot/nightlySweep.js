'use strict';

/**
 * nightlySweep.js (backend) — Runs at 2am daily.
 * Uses Mongoose models directly — no HTTP API round-trips.
 */

const Site = require('../models/Site');
const SeoJob = require('../models/SeoJob');
const SeoSiteConfig = require('../models/SeoSiteConfig');
const axios = require('axios');
const { decrypt } = require('../utils/crypto');
const { scorePost } = require('./seoScorer');
const { wpRequest } = require('./pluginWriter');
const logger = require('./logger');
const gscService = require('./gscService');

async function detectSeoPlugin(siteUrl) {
  try {
    const res = await axios.get(`${siteUrl}/wp-json`, { timeout: 8000 });
    const namespaces = res.data?.namespaces || [];
    if (namespaces.some((n) => n.startsWith('rankmath'))) return 'rankmath';
    if (namespaces.some((n) => n.startsWith('yoast'))) return 'yoast';
  } catch { /* non-critical */ }
  return 'none';
}

const MAX_POSTS_PER_TYPE = 200;

async function runNightlySweep() {
  logger.info('Nightly SEO sweep started');

  const allSites = await Site.find({});
  const sites = deduplicateBySiteUrl(allSites);

  for (const site of sites) {
    try {
      await sweepSite(site);
    } catch (err) {
      logger.error('Nightly sweep: error on site', { siteId: site._id, err: err.message });
    }
  }

  logger.info('Nightly SEO sweep complete');
}

// Only process one site record per unique WordPress URL.
// Other users sharing the same URL get their logs mirrored by the scheduler.
function deduplicateBySiteUrl(sites) {
  const seen = new Set();
  return sites.filter((s) => {
    if (seen.has(s.siteUrl)) return false;
    seen.add(s.siteUrl);
    return true;
  });
}

async function sweepSite(site) {
  let config = await SeoSiteConfig.findOne({ siteId: site._id });
  if (!config) config = await SeoSiteConfig.create({ siteId: site._id });
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

  // Auto-detect SEO plugin if not yet configured
  if (!config.seoPlugin || config.seoPlugin === 'none') {
    const detected = await detectSeoPlugin(site.siteUrl);
    if (detected !== 'none') {
      await SeoSiteConfig.findByIdAndUpdate(config._id, { $set: { seoPlugin: detected } });
      config.seoPlugin = detected;
      logger.info('Nightly sweep: auto-detected SEO plugin', { siteId: site._id, plugin: detected });
    }
  }

  const seoPlugin = config.seoPlugin || 'none';

  const [posts, pages] = await Promise.all([
    fetchAllContent(creds, 'posts'),
    fetchAllContent(creds, 'pages'),
  ]);

  logger.info('Nightly sweep: fetched content', { siteId: site._id, posts: posts.length, pages: pages.length });

  // All site IDs for this WordPress URL (multiple users may share it)
  const coSiteIds = (await Site.find({ siteUrl: site.siteUrl }, '_id')).map((s) => s._id);

  let queued = 0;
  for (const post of [...posts, ...pages]) {
    const { score } = scorePost(post, seoPlugin);
    if (score >= 65) continue;

    const priority = score < 60 ? 2 : 3;
    const triggeredBy = score < 40 ? 'low_score' : 'nightly_sweep';
    const postType = post.type === 'page' ? 'page' : 'post';

    try {
      // Check across ALL site records sharing this URL to avoid duplicates
      const existing = await SeoJob.findOne({ siteId: { $in: coSiteIds }, postId: post.id, status: 'pending' });
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

  // GSC priority enrichment — bump priority for pages losing traffic or with poor CTR
  if (gscService.isGscConfigured()) {
    try {
      const { pages: gscPages } = await gscService.getTopPages(site.siteUrl, site.gscProperty);
      if (Array.isArray(gscPages) && gscPages.length > 0) {
        let bumped = 0;
        for (const gscPage of gscPages) {
          // Build a consistent page URL pattern for matching WP post links
          const pageUrl = gscPage.page;

          // Low CTR on a page with decent impressions → priority 2 (bad title/desc)
          const lowCtr = gscPage.impressions >= 100 && gscPage.ctr < 3.0;

          // Check for declining impressions trend
          let declining = false;
          try {
            const trend = await gscService.getPagePerformanceTrend(site.siteUrl, pageUrl, site.gscProperty);
            if (trend.available && trend.impressionDelta < -20) declining = true;
          } catch { /* non-critical */ }

          if (!lowCtr && !declining) continue;

          const newPriority = declining ? 1 : 2;

          // Find a pending job for a post whose link matches this GSC page URL
          const pendingJob = await SeoJob.findOne({
            siteId: { $in: coSiteIds },
            status: 'pending',
            priority: { $gt: newPriority },
          });

          // Try to match by URL substring — find the post from WP posts/pages list
          const matchedPost = [...posts, ...pages].find((p) => {
            const link = typeof p.link === 'string' ? p.link : '';
            return link === pageUrl || link === pageUrl.replace(/\/$/, '') || pageUrl.startsWith(link.replace(/\/$/, ''));
          });

          if (matchedPost) {
            const updated = await SeoJob.findOneAndUpdate(
              { siteId: { $in: coSiteIds }, postId: matchedPost.id, status: 'pending', priority: { $gt: newPriority } },
              { $set: { priority: newPriority, triggeredBy: declining ? 'gsc_traffic_drop' : 'gsc_low_ctr' } }
            );
            if (updated) bumped++;
          }
        }
        if (bumped > 0) {
          logger.info('Nightly sweep: GSC bumped job priorities', { siteId: site._id, bumped });
        }
      }
    } catch (err) {
      logger.warn('Nightly sweep: GSC enrichment failed (non-critical)', { siteId: site._id, err: err.message });
    }
  }
}

async function fetchAllContent(creds, type) {
  const results = [];
  let page = 1;
  while (results.length < MAX_POSTS_PER_TYPE) {
    let batch;
    try {
      batch = await wpRequest({
        ...creds, method: 'GET', endpoint: `/${type}`,
        data: { status: 'publish', per_page: 100, page, context: 'edit', _fields: 'id,type,title,content,excerpt,meta,link,rank_math_focus_keyword,rank_math_title,rank_math_description,rank_math_seo_score' },
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

// ---------------------------------------------------------------------------
// 5-minute quick sweep
// ---------------------------------------------------------------------------

let isSweeping = false;

async function runQuickSweep() {
  if (isSweeping) {
    logger.info('Quick sweep: already in progress, skipping');
    return;
  }

  // Don't start if every site has the bot disabled
  const enabledCount = await SeoSiteConfig.countDocuments({ enabled: true });
  if (enabledCount === 0) {
    logger.info('Quick sweep: skipped — SEO bot is disabled for all sites');
    return;
  }

  isSweeping = true;
  logger.info('Quick sweep: started');

  try {
    const allSites = await Site.find({});
    const sites = deduplicateBySiteUrl(allSites);
    for (const site of sites) {
      try {
        await quickSweepSite(site);
      } catch (err) {
        logger.error('Quick sweep: error on site', { siteId: site._id, err: err.message });
      }
    }
  } finally {
    isSweeping = false;
    logger.info('Quick sweep: complete');
  }
}

async function quickSweepSite(site) {
  let config = await SeoSiteConfig.findOne({ siteId: site._id });
  if (!config) config = await SeoSiteConfig.create({ siteId: site._id });
  if (!config.enabled) return;

  // Respect the per-site quick sweep interval (default 5 min, max 180 min)
  const intervalMs = (config.quickSweepIntervalMinutes || 5) * 60 * 1000;
  if (config.lastSweptAt && (Date.now() - config.lastSweptAt.getTime()) < intervalMs) {
    return; // not due yet
  }

  let wpAppPassword;
  try {
    wpAppPassword = decrypt(site.wpAppPassword);
  } catch (err) {
    logger.error('Quick sweep: decrypt failed', { siteId: site._id, err: err.message });
    return;
  }

  const creds = { siteUrl: site.siteUrl, wpUsername: site.wpUsername, wpAppPassword };

  // Auto-detect SEO plugin if not yet configured
  if (!config.seoPlugin || config.seoPlugin === 'none') {
    const detected = await detectSeoPlugin(site.siteUrl);
    if (detected !== 'none') {
      await SeoSiteConfig.findByIdAndUpdate(config._id, { $set: { seoPlugin: detected } });
      config.seoPlugin = detected;
      logger.info('Quick sweep: auto-detected SEO plugin', { siteId: site._id, plugin: detected });
    }
  }

  const seoPlugin = config.seoPlugin || 'none';

  // Scan posts and pages
  const [posts, pages] = await Promise.all([
    fetchAllContent(creds, 'posts').catch(() => []),
    fetchAllContent(creds, 'pages').catch(() => []),
  ]);

  // All site IDs for this WordPress URL (multiple users may share it)
  const coSiteIds = (await Site.find({ siteUrl: site.siteUrl }, '_id')).map((s) => s._id);

  const SWEEP_JOB_LIMIT = 10;
  let contentQueued = 0;
  for (const item of [...posts, ...pages]) {
    if (contentQueued >= SWEEP_JOB_LIMIT) break;
    const { score } = scorePost(item, seoPlugin);
    if (score >= 65) continue;

    const postType = item.type === 'page' ? 'page' : 'post';

    const existing = await SeoJob.findOne({
      siteId: { $in: coSiteIds }, postId: item.id,
      status: { $in: ['pending', 'processing'] },
    });

    if (existing) {
      if (existing.priority > 1) {
        await SeoJob.findByIdAndUpdate(existing._id, { $set: { priority: 1 } });
      }
    } else {
      await SeoJob.create({
        siteId: site._id, postId: item.id, postType,
        priority: 1, triggeredBy: 'quick_sweep', scheduledAt: new Date(),
      });
      contentQueued++;
    }
  }

  // Scan media for missing alt text
  let imageQueued = 0;
  try {
    const media = await fetchAllMedia(creds);
    for (const item of media) {
      if (contentQueued + imageQueued >= SWEEP_JOB_LIMIT) break;
      if (item.alt_text && item.alt_text.trim() !== '') continue;

      const existing = await SeoJob.findOne({
        siteId: { $in: coSiteIds }, postId: item.id,
        postType: 'image', status: { $in: ['pending', 'processing'] },
      });

      if (!existing) {
        await SeoJob.create({
          siteId: site._id, postId: item.id, postType: 'image',
          priority: 1, triggeredBy: 'image_check', scheduledAt: new Date(),
        });
        imageQueued++;
      }
    }
  } catch (err) {
    logger.warn('Quick sweep: media check failed', { siteId: site._id, err: err.message });
  }

  // Record sweep time
  await SeoSiteConfig.findOneAndUpdate(
    { siteId: site._id },
    { $set: { lastSweptAt: new Date() } },
    { upsert: true }
  );

  if (contentQueued > 0 || imageQueued > 0) {
    logger.info('Quick sweep: jobs queued', {
      siteId: site._id, label: site.label, contentQueued, imageQueued,
    });
  }
}

async function fetchAllMedia(creds) {
  const results = [];
  let page = 1;
  const MAX_MEDIA = 500;
  while (results.length < MAX_MEDIA) {
    let batch;
    try {
      batch = await wpRequest({
        ...creds, method: 'GET', endpoint: '/media',
        data: { per_page: 100, page, media_type: 'image', _fields: 'id,alt_text,title,caption,source_url,media_type' },
      });
    } catch (err) {
      logger.warn('fetchAllMedia: batch failed', { page, err: err.message });
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    results.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return results;
}

module.exports = { runNightlySweep, runQuickSweep, fetchAllContent };
