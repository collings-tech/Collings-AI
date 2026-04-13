'use strict';

/**
 * gaService.js — Google Analytics 4 Data API wrapper.
 * Reuses the same GOOGLE_SERVICE_ACCOUNT_JSON service account as gscService.
 * The service account must be added as a Viewer in GA4 → Admin → Property Access Management.
 * Per-site GA4 property ID (e.g. "properties/123456789") is stored in site.gaPropertyId.
 * All functions return { available: false } on error or when not configured.
 */

const { BetaAnalyticsDataClient } = require('@google-analytics/data');

function isGaConfigured() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

/**
 * Build an authenticated GA4 Data API client.
 */
function getAnalyticsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
  });
}

/**
 * Format a date as YYYY-MM-DD for the GA4 API.
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Build start/end date strings for a lookback window.
 */
function dateRange(days) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  return { startDate: formatDate(startDate), endDate: formatDate(endDate) };
}

/**
 * Parse a GA4 metric value from the response row.
 */
function metricValue(row, index) {
  return row.metricValues?.[index]?.value ?? '0';
}

/**
 * Get site-level summary: sessions, users, pageviews, bounce rate, avg session duration.
 *
 * @param {string} gaPropertyId  e.g. "properties/123456789"
 * @param {number} days  lookback window (default 28)
 * @returns {Promise<{available, sessions, users, pageviews, bounceRate, avgSessionDuration}|{available:false}>}
 */
async function getSiteSummary(gaPropertyId, days = 28) {
  if (!isGaConfigured()) {
    console.warn('[GA] GOOGLE_SERVICE_ACCOUNT_JSON is not set');
    return { available: false };
  }
  if (!gaPropertyId) return { available: false };

  try {
    const client = getAnalyticsClient();
    const { startDate, endDate } = dateRange(days);

    const [response] = await client.runReport({
      property: gaPropertyId,
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
    });

    const row = response.rows?.[0];
    if (!row) {
      return { available: true, sessions: 0, users: 0, pageviews: 0, bounceRate: 0, avgSessionDuration: 0 };
    }

    return {
      available: true,
      sessions: parseInt(metricValue(row, 0), 10),
      users: parseInt(metricValue(row, 1), 10),
      pageviews: parseInt(metricValue(row, 2), 10),
      bounceRate: parseFloat((parseFloat(metricValue(row, 3)) * 100).toFixed(1)),
      avgSessionDuration: parseFloat(parseFloat(metricValue(row, 4)).toFixed(1)),
    };
  } catch (err) {
    console.error('[GA] getSiteSummary error:', err.message);
    return { available: false, error: err.message };
  }
}

/**
 * Get top pages by sessions.
 *
 * @param {string} gaPropertyId
 * @param {number} days
 * @param {number} limit
 * @returns {Promise<{available, pages: Array}>}
 */
async function getTopPages(gaPropertyId, days = 28, limit = 20) {
  if (!isGaConfigured()) return { available: false, pages: [] };
  if (!gaPropertyId) return { available: false, pages: [] };

  try {
    const client = getAnalyticsClient();
    const { startDate, endDate } = dateRange(days);

    const [response] = await client.runReport({
      property: gaPropertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      limit,
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    });

    const pages = (response.rows || []).map((row) => ({
      page: row.dimensionValues?.[0]?.value || '/',
      sessions: parseInt(metricValue(row, 0), 10),
      pageviews: parseInt(metricValue(row, 1), 10),
      bounceRate: parseFloat((parseFloat(metricValue(row, 2)) * 100).toFixed(1)),
      avgDuration: parseFloat(parseFloat(metricValue(row, 3)).toFixed(1)),
    }));

    return { available: true, pages };
  } catch (err) {
    console.error('[GA] getTopPages error:', err.message);
    return { available: false, pages: [], error: err.message };
  }
}

/**
 * Get sessions by traffic source/medium.
 *
 * @param {string} gaPropertyId
 * @param {number} days
 * @returns {Promise<{available, sources: Array}>}
 */
async function getTrafficSources(gaPropertyId, days = 28) {
  if (!isGaConfigured()) return { available: false, sources: [] };
  if (!gaPropertyId) return { available: false, sources: [] };

  try {
    const client = getAnalyticsClient();
    const { startDate, endDate } = dateRange(days);

    const [response] = await client.runReport({
      property: gaPropertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
      metrics: [{ name: 'sessions' }],
      limit: 10,
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    });

    const totalSessions = (response.rows || []).reduce(
      (sum, row) => sum + parseInt(metricValue(row, 0), 10),
      0
    );

    const sources = (response.rows || []).map((row) => {
      const sessions = parseInt(metricValue(row, 0), 10);
      return {
        source: row.dimensionValues?.[0]?.value || 'Unknown',
        sessions,
        pct: totalSessions > 0 ? parseFloat(((sessions / totalSessions) * 100).toFixed(1)) : 0,
      };
    });

    return { available: true, sources };
  } catch (err) {
    console.error('[GA] getTrafficSources error:', err.message);
    return { available: false, sources: [], error: err.message };
  }
}

/**
 * Get engagement metrics for a specific page path.
 * Used by the SEO bot to enrich Claude's context during optimization.
 *
 * @param {string} gaPropertyId
 * @param {string} pageUrl  full URL — the path portion is extracted for the filter
 * @param {number} days
 * @returns {Promise<{available, sessions, pageviews, bounceRate, avgDuration}>}
 */
async function getPageMetrics(gaPropertyId, pageUrl, days = 28) {
  if (!isGaConfigured()) return { available: false };
  if (!gaPropertyId) return { available: false };

  let pagePath = pageUrl;
  try {
    pagePath = new URL(pageUrl).pathname;
  } catch { /* use raw value */ }

  try {
    const client = getAnalyticsClient();
    const { startDate, endDate } = dateRange(days);

    const [response] = await client.runReport({
      property: gaPropertyId,
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { matchType: 'EXACT', value: pagePath },
        },
      },
      metrics: [
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
    });

    const row = response.rows?.[0];
    if (!row) return { available: true, sessions: 0, pageviews: 0, bounceRate: 0, avgDuration: 0 };

    return {
      available: true,
      pagePath,
      sessions: parseInt(metricValue(row, 0), 10),
      pageviews: parseInt(metricValue(row, 1), 10),
      bounceRate: parseFloat((parseFloat(metricValue(row, 2)) * 100).toFixed(1)),
      avgDuration: parseFloat(parseFloat(metricValue(row, 3)).toFixed(1)),
    };
  } catch (err) {
    console.error('[GA] getPageMetrics error:', err.message);
    return { available: false, error: err.message };
  }
}

module.exports = {
  isGaConfigured,
  getSiteSummary,
  getTopPages,
  getTrafficSources,
  getPageMetrics,
};
