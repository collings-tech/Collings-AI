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
const { runNightlySweep } = require('./nightlySweep');
const logger = require('./logger');

let nightlyTask = null;

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

  // Nightly full sweep at 2am
  nightlyTask = cron.schedule('0 2 * * *', () => {
    runNightlySweep().catch((err) =>
      logger.error('seo-bot: nightly sweep error', { err: err.message })
    );
  });

  logger.info('seo-bot: started — running 24/7 on backend');
}

function stop() {
  scheduler.stop();
  if (nightlyTask) { try { nightlyTask.stop(); } catch { /* ignore */ } nightlyTask = null; }
  logger.info('seo-bot: stopped');
}

module.exports = { start, stop };
