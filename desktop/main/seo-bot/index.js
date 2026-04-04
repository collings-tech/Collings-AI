'use strict';

/**
 * seo-bot/index.js — Entry point for the SEO Bot.
 *
 * Called from desktop/main/index.js:
 *
 *   const seoBot = require('./seo-bot/index');
 *   app.whenReady().then(() => { createWindow(); seoBot.start(); });
 *   app.on('before-quit', () => seoBot.stop());
 *
 * On start:
 *   1. Seeds default electron-store keys (MAX_JOBS_PER_CYCLE, SEO_REWRITE_THRESHOLD).
 *   2. Resets any "processing" jobs left over from a previous crash.
 *   3. Starts the job-processing scheduler (§20.7).
 *   4. Starts the nightly sweep cron (2 am daily).
 *
 * On stop:
 *   Gracefully stops all cron tasks.
 */

const cron = require('node-cron');
const store = require('../store');
const scheduler = require('./scheduler');
const jobQueue = require('./jobQueue');
const { runNightlySweep } = require('./nightlySweep');
const logger = require('./logger');

// Seed defaults
if (store.get('MAX_JOBS_PER_CYCLE') === undefined) store.set('MAX_JOBS_PER_CYCLE', 10);
if (store.get('SEO_REWRITE_THRESHOLD') === undefined) store.set('SEO_REWRITE_THRESHOLD', 40);

let nightlyTask = null;

// ---------------------------------------------------------------------------
// Crash recovery
// ---------------------------------------------------------------------------

async function recoverStaleJobs() {
  if (!jobQueue.isAuthenticated()) return;

  let sites;
  try {
    sites = await jobQueue.getAllSites();
  } catch (err) {
    logger.warn('seo-bot: crash recovery — could not fetch sites', { err: err.message });
    return;
  }

  let totalReset = 0;
  for (const site of sites) {
    try {
      const count = await jobQueue.resetStaleJobs(site._id);
      totalReset += count || 0;
    } catch (err) {
      logger.warn('seo-bot: crash recovery — could not reset stale jobs for site', {
        siteId: site._id,
        err: err.message,
      });
    }
  }

  if (totalReset > 0) {
    logger.info('seo-bot: crash recovery — reset stale jobs', { totalReset });
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function start() {
  logger.info('seo-bot: starting');

  // Crash recovery — must complete before scheduler starts
  await recoverStaleJobs();

  // Start per-priority job-processing schedules
  scheduler.start();

  // Nightly full sweep — 2 am daily
  nightlyTask = cron.schedule(
    '0 2 * * *',
    () => {
      runNightlySweep().catch((err) =>
        logger.error('seo-bot: nightly sweep error', { err: err.message })
      );
    },
    { scheduled: true }
  );

  logger.info('seo-bot: started');
}

async function stop() {
  logger.info('seo-bot: stopping');

  scheduler.stop();

  if (nightlyTask) {
    try { nightlyTask.stop(); } catch { /* ignore */ }
    nightlyTask = null;
  }

  logger.info('seo-bot: stopped');
}

module.exports = { start, stop };
