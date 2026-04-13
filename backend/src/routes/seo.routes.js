'use strict';

const { Router } = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const seo = require('../controllers/seo.controller');

const router = Router();

router.use(authMiddleware);

// Logs
router.get('/logs/:siteId', seo.getLogs);
router.post('/logs/:siteId', seo.createLog);

// Jobs
router.get('/jobs/:siteId', seo.getJobs);
router.post('/jobs/:siteId', seo.triggerJob);
router.post('/jobs/:siteId/reset-stale', seo.resetStaleJobs);
router.post('/jobs/:siteId/clear-completed', seo.clearCompletedJobs);
router.patch('/jobs/:siteId/:jobId/lock', seo.lockJob);
router.patch('/jobs/:siteId/:jobId/complete', seo.completeJob);
router.patch('/jobs/:siteId/:jobId/fail', seo.failJob);

// Config
router.get('/config/:siteId', seo.getConfig);
router.put('/config/:siteId', seo.updateConfig);

// Dashboard — must come before /:siteId routes to avoid param conflicts
router.get('/dashboard/overview', seo.getDashboardOverview);
router.get('/dashboard/:siteId/score-trend', seo.getScoreTrend);
router.get('/dashboard/:siteId/distribution', seo.getDistribution);
router.get('/dashboard/:siteId/activity', seo.getActivityData);
router.get('/dashboard/:siteId/top-improved', seo.getTopImproved);
router.get('/dashboard/:siteId/attention', seo.getAttention);

// Google Search Console
router.get('/gsc/:siteId/summary', seo.gscSummary);
router.get('/gsc/:siteId/top-queries', seo.gscTopQueries);
router.get('/gsc/:siteId/top-pages', seo.gscTopPages);

// Google Analytics 4
router.get('/ga/:siteId/summary', seo.gaSummary);
router.get('/ga/:siteId/top-pages', seo.gaTopPages);
router.get('/ga/:siteId/traffic-sources', seo.gaTrafficSources);

module.exports = router;
