'use strict';

const Site = require('../models/Site');
const SeoJob = require('../models/SeoJob');
const SeoLog = require('../models/SeoLog');
const SeoSiteConfig = require('../models/SeoSiteConfig');
const gscService = require('../seo-bot/gscService');
const gaService = require('../seo-bot/gaService');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifySiteOwnership(siteId, userId) {
  const site = await Site.findOne({ _id: siteId, userId });
  if (!site) return null;
  return site;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

exports.getLogs = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      SeoLog.find({ siteId: site._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      SeoLog.countDocuments({ siteId: site._id }),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

exports.getJobs = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const [pending, recent] = await Promise.all([
      SeoJob.find({ siteId: site._id, status: 'pending' }).sort({ priority: 1, createdAt: 1 }),
      SeoJob.find({ siteId: site._id, status: { $in: ['completed', 'failed'] } })
        .sort({ completedAt: -1 })
        .limit(20),
    ]);

    res.json({ pending, recent });
  } catch (err) {
    next(err);
  }
};

exports.triggerJob = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const { postId, postType = 'post', priority = 1, triggeredBy = 'manual' } = req.body;
    if (!postId) return res.status(400).json({ message: 'postId is required' });

    const existing = await SeoJob.findOne({ siteId: site._id, postId, status: 'pending' });
    if (existing) {
      if (existing.priority > priority) {
        await SeoJob.findByIdAndUpdate(existing._id, { $set: { priority } });
      }
      return res.status(200).json({ job: existing, upgraded: true });
    }

    const job = await SeoJob.create({
      siteId: site._id,
      postId,
      postType,
      priority,
      triggeredBy,
      scheduledAt: new Date(),
    });

    res.status(201).json({ job });
  } catch (err) {
    next(err);
  }
};

exports.lockJob = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const job = await SeoJob.findOneAndUpdate(
      { _id: req.params.jobId, siteId: site._id, status: 'pending' },
      { $set: { status: 'processing', startedAt: new Date() } },
      { new: true }
    );

    if (!job) return res.status(404).json({ message: 'Job not found or not pending' });
    res.json({ job });
  } catch (err) {
    next(err);
  }
};

exports.completeJob = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const job = await SeoJob.findOneAndUpdate(
      { _id: req.params.jobId, siteId: site._id, status: 'processing' },
      { $set: { status: 'completed', completedAt: new Date() } },
      { new: true }
    );

    if (!job) return res.status(404).json({ message: 'Job not found or not processing' });
    res.json({ job });
  } catch (err) {
    next(err);
  }
};

exports.failJob = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const job = await SeoJob.findOneAndUpdate(
      { _id: req.params.jobId, siteId: site._id, status: 'processing' },
      {
        $set: {
          status: 'failed',
          completedAt: new Date(),
          error: req.body.error || 'Unknown error',
        },
      },
      { new: true }
    );

    if (!job) return res.status(404).json({ message: 'Job not found or not processing' });
    res.json({ job });
  } catch (err) {
    next(err);
  }
};

exports.resetStaleJobs = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const result = await SeoJob.updateMany(
      { siteId: site._id, status: 'processing' },
      { $set: { status: 'pending', startedAt: null } }
    );

    res.json({ reset: result.modifiedCount });
  } catch (err) {
    next(err);
  }
};

// Delete all completed/failed jobs so the next sweep re-queues and re-processes every post
exports.clearCompletedJobs = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const result = await SeoJob.deleteMany({ siteId: site._id, status: { $in: ['completed', 'failed'] } });
    res.json({ cleared: result.deletedCount });
  } catch (err) {
    next(err);
  }
};

exports.createLog = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const { postId, postTitle, scoreBefore, scoreAfter, changes } = req.body;
    if (postId === undefined || scoreBefore === undefined || scoreAfter === undefined) {
      return res.status(400).json({ message: 'postId, scoreBefore, and scoreAfter are required' });
    }

    const log = await SeoLog.create({
      siteId: site._id,
      postId,
      postTitle: postTitle || '',
      scoreBefore,
      scoreAfter,
      changes: changes || {},
    });

    res.status(201).json({ log });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

exports.getConfig = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    let config = await SeoSiteConfig.findOne({ siteId: site._id });
    if (!config) {
      config = await SeoSiteConfig.create({ siteId: site._id });
    }

    res.json(config);
  } catch (err) {
    next(err);
  }
};

exports.updateConfig = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const { enabled, seoPlugin, scoreThresholdRewrite, maxJobsPerCycle, quickSweepIntervalMinutes } = req.body;
    const update = {};
    if (enabled !== undefined) update.enabled = enabled;
    if (seoPlugin !== undefined) update.seoPlugin = seoPlugin;
    if (scoreThresholdRewrite !== undefined) update.scoreThresholdRewrite = scoreThresholdRewrite;
    if (maxJobsPerCycle !== undefined) update.maxJobsPerCycle = maxJobsPerCycle;
    if (quickSweepIntervalMinutes !== undefined) {
      const mins = parseInt(quickSweepIntervalMinutes, 10);
      if (isNaN(mins) || mins < 5 || mins > 180) {
        return res.status(400).json({ message: 'quickSweepIntervalMinutes must be between 5 and 180' });
      }
      update.quickSweepIntervalMinutes = mins;
    }

    const config = await SeoSiteConfig.findOneAndUpdate(
      { siteId: site._id },
      { $set: update },
      { new: true, upsert: true }
    );

    res.json(config);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Dashboard — Overview
// ---------------------------------------------------------------------------

exports.getDashboardOverview = async (req, res, next) => {
  try {
    const userSites = await Site.find({ userId: req.user.id }, '_id label siteUrl');
    const siteIds = userSites.map((s) => s._id);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const overview = await Promise.all(
      userSites.map(async (site) => {
        const [avgResult, postsOptimized, lastJob, pendingJobs, failedJobs] = await Promise.all([
          // Average the most recent scoreAfter per post (not all-time avg which double-counts).
          // This still only covers posts the bot has touched — posts never reached are excluded.
          SeoLog.aggregate([
            { $match: { siteId: site._id } },
            { $sort: { postId: 1, createdAt: -1 } },
            { $group: { _id: '$postId', scoreAfter: { $first: '$scoreAfter' } } },
            { $group: { _id: null, avg: { $avg: '$scoreAfter' } } },
          ]),
          SeoLog.countDocuments({ siteId: site._id, createdAt: { $gte: startOfMonth } }),
          SeoLog.findOne({ siteId: site._id }).sort({ createdAt: -1 }),
          SeoJob.countDocuments({ siteId: site._id, status: { $in: ['pending', 'processing'] } }),
          SeoJob.countDocuments({ siteId: site._id, status: 'failed', completedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        ]);

        const attentionCount = await SeoLog.aggregate([
          { $match: { siteId: site._id } },
          { $sort: { postId: 1, createdAt: -1 } },
          { $group: { _id: '$postId', scoreAfter: { $first: '$scoreAfter' } } },
          { $match: { scoreAfter: { $lt: 60 } } },
          { $count: 'count' },
        ]).then((r) => r[0]?.count || 0);

        return {
          siteId: site._id,
          siteLabel: site.label,
          siteUrl: site.siteUrl,
          avgScore: avgResult[0]?.avg ? Math.round(avgResult[0].avg) : null,
          postsOptimized,
          attentionCount,
          lastBotRun: lastJob?.createdAt || null,
          pendingJobs,
          failedJobs,
        };
      })
    );

    res.json({ overview });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Dashboard — Per-site analytics
// ---------------------------------------------------------------------------

exports.getScoreTrend = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '30', 10)));
    const since = new Date(Date.now() - days * 86400000);

    const trend = await SeoLog.aggregate([
      { $match: { siteId: site._id, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          avgScore: { $avg: '$scoreAfter' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', avgScore: { $round: ['$avgScore', 1] }, _id: 0 } },
    ]);

    res.json({ trend });
  } catch (err) {
    next(err);
  }
};

exports.getDistribution = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const latestPerPost = await SeoLog.aggregate([
      { $match: { siteId: site._id } },
      { $sort: { postId: 1, createdAt: -1 } },
      { $group: { _id: '$postId', scoreAfter: { $first: '$scoreAfter' } } },
    ]);

    const distribution = { good: 0, needsImprovement: 0, poor: 0, critical: 0 };
    for (const { scoreAfter } of latestPerPost) {
      if (scoreAfter >= 80) distribution.good++;
      else if (scoreAfter >= 60) distribution.needsImprovement++;
      else if (scoreAfter >= 40) distribution.poor++;
      else distribution.critical++;
    }

    res.json({ distribution });
  } catch (err) {
    next(err);
  }
};

exports.getActivityData = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '14', 10)));
    const since = new Date(Date.now() - days * 86400000);

    const activity = await SeoLog.aggregate([
      { $match: { siteId: site._id, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', count: 1, _id: 0 } },
    ]);

    res.json({ activity });
  } catch (err) {
    next(err);
  }
};

exports.getTopImproved = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const posts = await SeoLog.aggregate([
      { $match: { siteId: site._id, createdAt: { $gte: startOfMonth } } },
      {
        $project: {
          postId: 1,
          postTitle: 1,
          scoreBefore: 1,
          scoreAfter: 1,
          improvement: { $subtract: ['$scoreAfter', '$scoreBefore'] },
          createdAt: 1,
        },
      },
      { $sort: { improvement: -1 } },
      { $limit: 10 },
    ]);

    res.json({ posts });
  } catch (err) {
    next(err);
  }
};

exports.getAttention = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const latestPerPost = await SeoLog.aggregate([
      { $match: { siteId: site._id } },
      { $sort: { postId: 1, createdAt: -1 } },
      {
        $group: {
          _id: '$postId',
          postTitle: { $first: '$postTitle' },
          scoreAfter: { $first: '$scoreAfter' },
          lastOptimized: { $first: '$createdAt' },
        },
      },
      { $match: { scoreAfter: { $lt: 60 } } },
      { $sort: { scoreAfter: 1 } },
    ]);

    const posts = latestPerPost.map((p) => ({
      postId: p._id,
      postTitle: p.postTitle,
      currentScore: p.scoreAfter,
      status: p.scoreAfter < 40 ? 'critical' : 'poor',
      lastOptimized: p.lastOptimized,
    }));

    res.json({ posts });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Google Search Console
// ---------------------------------------------------------------------------

exports.gscSummary = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '28', 10)));
    const data = await gscService.getSiteSummary(site.siteUrl, site.gscProperty, days);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.gscTopQueries = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '28', 10)));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const data = await gscService.getTopQueriesSite(site.siteUrl, site.gscProperty, days, limit);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.gscTopPages = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '28', 10)));
    const data = await gscService.getTopPages(site.siteUrl, site.gscProperty, days);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Google Analytics 4
// ---------------------------------------------------------------------------

exports.gaSummary = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '28', 10)));
    const data = await gaService.getSiteSummary(site.gaPropertyId, days);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.gaTopPages = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '28', 10)));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const data = await gaService.getTopPages(site.gaPropertyId, days, limit);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.gaTrafficSources = async (req, res, next) => {
  try {
    const site = await verifySiteOwnership(req.params.siteId, req.user.id);
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '28', 10)));
    const data = await gaService.getTrafficSources(site.gaPropertyId, days);
    res.json(data);
  } catch (err) {
    next(err);
  }
};
