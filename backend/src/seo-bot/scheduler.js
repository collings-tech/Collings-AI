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
const { scorePost, simulateScore, stripHtml, wordCount } = require('./seoScorer');
const { optimizePost, generateImageAltText } = require('./seoOptimizer');
const { writeSeoMeta, wpRequest, fixImageAltText } = require('./pluginWriter');
const logger = require('./logger');
const gscService = require('./gscService');
const gaService = require('./gaService');

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
  if (status && [429, 500, 502, 503, 504, 529].includes(status)) return true;
  const code = err?.code;
  if (code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE'].includes(code)) return true;
  return false;
}

// Anthropic credit balance exhausted — non-retryable, must shut down the bot
function isCreditExhaustedError(err) {
  const msg = err?.message || '';
  if (msg.includes('credit balance is too low')) return true;
  // Also catch it when nested in the raw response body string
  const responseData = err?.response?.data;
  const bodyStr = typeof responseData === 'string' ? responseData : JSON.stringify(responseData || '');
  return bodyStr.includes('credit balance is too low');
}

async function handleCreditExhaustion(job, err) {
  // Mark the triggering job as failed
  await SeoJob.findByIdAndUpdate(job._id, {
    $set: { status: 'failed', completedAt: new Date(), error: err.message },
  });

  // Disable the SEO bot for all sites so no further jobs are processed
  try {
    await SeoSiteConfig.updateMany({}, { $set: { enabled: false } });
    logger.warn('scheduler: Anthropic credit exhausted — disabled SEO bot for all sites');
  } catch (dbErr) {
    logger.error('scheduler: failed to disable site configs after credit exhaustion', { err: dbErr.message });
  }

  // Stop the scheduler cron tasks immediately
  stop();

  // Signal index.js to stop its cron tasks (quickSweep, nightly, weekly)
  process.emit('seo:credit-exhausted');

  logger.error('scheduler: SEO bot shut down due to insufficient Anthropic credits. Recharge your balance and re-enable the bot.', {
    jobId: job._id, postId: job.postId, err: err.message,
  });
}

async function retryOrFail(job, err) {
  if (isCreditExhaustedError(err)) {
    await handleCreditExhaustion(job, err);
    return;
  }

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
    // Find all pending jobs at this priority that are due (scheduledAt <= now)
    const jobs = await SeoJob.find({ priority: priorityFilter, status: 'pending', scheduledAt: { $lte: new Date() } }) // paused jobs are excluded
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

        if (!config.enabled) {
          // Bot disabled — put all pending jobs for this site on hold (don't process, don't call Claude)
          await SeoJob.updateMany(
            { siteId: site._id, status: 'pending' },
            { $set: { status: 'paused' } }
          );
          logger.info('processQueue: bot disabled, paused pending jobs', { siteId });
          continue;
        }

        // Bot was re-enabled — resume any previously paused jobs
        await SeoJob.updateMany(
          { siteId: site._id, status: 'paused' },
          { $set: { status: 'pending', scheduledAt: new Date() } }
        );

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
          site,
        });
      }

      const siteCtx = sitesMap.get(siteId);
      if (!siteCtx) continue;

      try {
        await processJob(job, siteCtx);
      } catch (err) {
        // processJob handles its own retry/fail — just continue
      }

      // Small delay between jobs to avoid overwhelming the WordPress server and Claude API
      await new Promise((resolve) => setTimeout(resolve, 5000));
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
      await SeoJob.findByIdAndUpdate(job._id, {
        $set: {
          status: 'completed', completedAt: new Date(),
          result: { action: 'skipped', skippedReason: 'Alt text already present' },
        },
      });
      return;
    }

    const altText = await generateImageAltText(media);
    await fixImageAltText(creds, job.postId, altText);

    await SeoJob.findByIdAndUpdate(job._id, {
      $set: {
        status: 'completed', completedAt: new Date(),
        result: { action: 'alt_text', altText },
      },
    });
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

async function processJob(job, { creds, seoPlugin, rewriteThreshold, site }) {
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

    // 2. Score — use Rank Math's stored rank_math_seo_score when available (it's what the WP dashboard shows),
    // fall back to our simulator only if the meta field is absent or zero.
    const { score: simulatedScoreBefore, breakdown: breakdownBefore, seoMeta: currentSeoMeta } = scorePost(post, seoPlugin, creds.siteUrl);
    const rankMathStoredBefore = seoPlugin === 'rankmath'
      ? Number(post.rank_math_seo_score || post?.meta?.rank_math_seo_score || 0)
      : 0;
    const scoreBefore = rankMathStoredBefore > 0 ? rankMathStoredBefore : simulatedScoreBefore;
    logger.info('processJob: scored', { postId: job.postId, scoreBefore, rankMathStoredBefore, simulatedScoreBefore });

    // Determine if content needs a forced rewrite:
    //   (a) Thin content — under 600 words (Rank Math minimum)
    //   (b) Poor keyword coverage in content — keyword not in first para / subheadings / body
    //       These 4 checks are worth up to 20 pts; if we're scoring < 16 we're missing key points
    const contentHtmlRaw = typeof post.content === 'object' ? post.content.rendered || '' : String(post.content || '');
    const contentWords = wordCount(stripHtml(contentHtmlRaw));
    const contentKeywordPts = (breakdownBefore.keywordInFirstPara || 0) +
                               (breakdownBefore.keywordInContent || 0) +
                               (breakdownBefore.keywordInSubheading || 0) +
                               (breakdownBefore.keywordDensity || 0);

    const forceRewrite = contentWords < 600 || contentKeywordPts < 16;
    if (forceRewrite) {
      const reason = contentWords < 600
        ? `thin content (${contentWords} words)`
        : `poor keyword coverage in content (${contentKeywordPts}/20 pts)`;
      logger.info('processJob: will force rewrite', { postId: job.postId, reason });
    }

    // Only skip posts that are already at 80+ — the target average score.
    // Posts scoring 65–79 need further optimisation to reach the 80 target.
    if (scoreBefore >= 80 && job.priority > 1 && !forceRewrite) {
      logger.info('processJob: already at 80+, skipping', { postId: job.postId });
      await SeoJob.findByIdAndUpdate(job._id, {
        $set: {
          status: 'completed', completedAt: new Date(),
          result: { action: 'skipped', skippedReason: `Score already at target (${scoreBefore})` },
        },
      });
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

    // 4. Fetch GSC data for this specific page (non-critical, graceful degradation)
    let gscData = null;
    if (gscService.isGscConfigured()) {
      try {
        const pageUrl = post.link || `${creds.siteUrl}/?p=${job.postId}`;
        const gscResult = await gscService.getTopQueriesForPage(creds.siteUrl, pageUrl, site.gscProperty);
        if (gscResult.available && gscResult.queries.length > 0) {
          gscData = gscResult;
          logger.info('processJob: fetched GSC queries', { postId: job.postId, queryCount: gscResult.queries.length });
        }
      } catch (err) {
        logger.warn('processJob: GSC fetch failed (non-critical)', { postId: job.postId, err: err.message });
      }
    }

    // 5. Fetch GA4 data for this specific page (non-critical, graceful degradation)
    let gaData = null;
    if (gaService.isGaConfigured() && site.gaPropertyId) {
      try {
        const pageUrl = post.link || `${creds.siteUrl}/?p=${job.postId}`;
        const gaResult = await gaService.getPageMetrics(site.gaPropertyId, pageUrl, 28);
        if (gaResult.available) {
          gaData = gaResult;
          logger.info('processJob: fetched GA metrics', { postId: job.postId, sessions: gaResult.sessions });
        }
      } catch (err) {
        logger.warn('processJob: GA fetch failed (non-critical)', { postId: job.postId, err: err.message });
      }
    }

    // 6. Ask Claude (with optional GSC + GA data)
    const optimized = await optimizePost(post, currentSeoMeta, seoPlugin, otherPosts || [], scoreBefore, rewriteThreshold, gscData, gaData, forceRewrite);

    // 7. Simulate the score with the new values before touching WordPress.
    // If the optimized values would not improve the score, skip writing entirely.
    const { score: simulatedScore } = simulateScore(post, seoPlugin, optimized, creds.siteUrl);
    logger.info('processJob: simulated score', { postId: job.postId, scoreBefore, simulatedScore });

    if (simulatedScore <= scoreBefore) {
      logger.warn('processJob: optimized values would not improve score — skipping write', {
        postId: job.postId, scoreBefore, simulatedScore,
      });
      await SeoJob.findByIdAndUpdate(job._id, {
        $set: {
          status: 'completed', completedAt: new Date(),
          result: { action: 'skipped', skippedReason: 'Optimized values would not improve score' },
        },
      });
      return;
    }

    // 8. Write back to WordPress — throws if the write is rejected.
    // pluginWriter triggers save_post after the Rank Math meta update, which causes
    // Rank Math's PHP hook to recalculate and store rank_math_seo_score in post meta.
    await writeSeoMeta(creds, job.postId, job.postType, seoPlugin, optimized, post, simulatedScore);

    // 9. Re-fetch the post so we read the actual score Rank Math just stored.
    // Fall back to simulatedScore if the field is missing or zero.
    let scoreAfter = simulatedScore;
    if (seoPlugin === 'rankmath') {
      try {
        const updatedPost = await wpRequest({ ...creds, method: 'GET', endpoint: `${endpoint}?context=edit` });
        const actualScore = Number(updatedPost.rank_math_seo_score || updatedPost?.meta?.rank_math_seo_score || 0);
        if (actualScore > 0) {
          scoreAfter = actualScore;
          logger.info('processJob: actual Rank Math score fetched', { postId: job.postId, scoreBefore, scoreAfter });
        } else {
          logger.info('processJob: rank_math_seo_score not in response, using simulated', { postId: job.postId, simulatedScore });
        }
      } catch (err) {
        logger.warn('processJob: re-fetch for Rank Math score failed, using simulated', { postId: job.postId, err: err.message });
      }
    }
    logger.info('processJob: write complete', { postId: job.postId, scoreBefore, scoreAfter });

    // 10. Save log — and mirror to all other users who share this WordPress URL
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
        outboundLinksAdded: (optimized.outboundLinks || []).length,
        contentRewritten: !!optimized.rewrittenContent,
      },
    };

    // Find all site records for this WordPress URL (other users sharing the same site)
    const coSites = await Site.find({ siteUrl: creds.siteUrl }, '_id');
    await Promise.all(coSites.map((s) => SeoLog.create({ ...logEntry, siteId: s._id })));

    // 8. Mark complete
    await SeoJob.findByIdAndUpdate(job._id, {
      $set: {
        status: 'completed', completedAt: new Date(),
        result: {
          action: 'seo_optimization',
          postTitle,
          scoreBefore,
          scoreAfter,
          changes: logEntry.changes,
        },
      },
    });
    logger.info('processJob: complete', { jobId: job._id, postId: job.postId, scoreBefore, scoreAfter });

  } catch (err) {
    logger.error('processJob: error', { jobId: job._id, postId: job.postId, err: err.message });
    await retryOrFail(job, err);
    throw err;
  }
}

module.exports = { start, stop, processQueue };
