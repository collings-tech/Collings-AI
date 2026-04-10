'use strict';

/**
 * backend/src/seo-bot/index.js
 *
 * Started once in backend/src/index.js after the DB connects.
 * Runs 24/7 regardless of whether the desktop app is open.
 */

const cron = require('node-cron');
const SeoJob = require('../models/SeoJob');
const scheduler = require('./scheduler');
const { runNightlySweep, runQuickSweep } = require('./nightlySweep');
const { runWeeklyPostGeneration } = require('./weeklyPostGenerator');
const logger = require('./logger');

let nightlyTask = null;
let quickSweepTask = null;
let weeklyPostTask = null;

// ---------------------------------------------------------------------------
// Crash recovery — reset any jobs stuck in "processing" from a prior crash
// ---------------------------------------------------------------------------

async function recoverStaleJobs() {
  try {
    const result = await SeoJob.updateMany(
      { status: 'processing' },
      { $set: { status: 'pending', startedAt: null } }
    );
    if (result.modifiedCount > 0) {
      logger.info('seo-bot: crash recovery — reset stale jobs', { count: result.modifiedCount });
    }
  } catch (err) {
    logger.warn('seo-bot: crash recovery failed', { err: err.message });
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function start() {
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn('seo-bot: ANTHROPIC_API_KEY not set — SEO Bot will not start');
    return;
  }

  logger.info('seo-bot: starting');

  await recoverStaleJobs();

  // Per-priority job processing (5 min / 30 min / hourly)
  scheduler.start();

  // 5-minute sweep: scan all sites for content/images below score 80, queue priority-1 jobs.
  // Offset by 2 minutes so it doesn't fire at the same time as the scheduler and flood WordPress.
  quickSweepTask = cron.schedule('2-59/5 * * * *', () => {
    runQuickSweep().catch((err) =>
      logger.error('seo-bot: quick sweep error', { err: err.message })
    );
  });

  // Weekly post generation — every Monday at 9am
  weeklyPostTask = cron.schedule('0 9 * * 1', () => {
    runWeeklyPostGeneration().catch((err) =>
      logger.error('seo-bot: weekly post generation error', { err: err.message })
    );
  });

  // Nightly full re-score sweep at 2am
  nightlyTask = cron.schedule('0 2 * * *', () => {
    runNightlySweep().catch((err) =>
      logger.error('seo-bot: nightly sweep error', { err: err.message })
    );
  });

  // Auto-shutdown if Anthropic credits run out mid-run
  process.once('seo:credit-exhausted', () => {
    logger.warn('seo-bot: received credit-exhausted signal — stopping all cron tasks');
    if (quickSweepTask) { try { quickSweepTask.stop(); } catch { /* ignore */ } quickSweepTask = null; }
    if (weeklyPostTask) { try { weeklyPostTask.stop(); } catch { /* ignore */ } weeklyPostTask = null; }
    if (nightlyTask) { try { nightlyTask.stop(); } catch { /* ignore */ } nightlyTask = null; }
  });

  logger.info('seo-bot: started — running 24/7 on backend');
}

function stop() {
  process.removeAllListeners('seo:credit-exhausted');
  scheduler.stop();
  if (quickSweepTask) { try { quickSweepTask.stop(); } catch { /* ignore */ } quickSweepTask = null; }
  if (weeklyPostTask) { try { weeklyPostTask.stop(); } catch { /* ignore */ } weeklyPostTask = null; }
  if (nightlyTask) { try { nightlyTask.stop(); } catch { /* ignore */ } nightlyTask = null; }
  logger.info('seo-bot: stopped');
}

module.exports = { start, stop };
