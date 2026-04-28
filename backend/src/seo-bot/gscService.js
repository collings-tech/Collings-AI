'use strict';

/**
 * gscService.js — Google Search Console API wrapper.
 * Uses a Service Account (GOOGLE_SERVICE_ACCOUNT_JSON env var).
 * All functions return null / gracefully degrade if GSC is not configured.
 */

const { google } = require('googleapis');

function isGscConfigured() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

/**
 * Build an authenticated Search Console API client.
 */
function getSearchClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/webmasters',
    ],
  });

  return google.searchconsole({ version: 'v1', auth });
}

/**
 * Derive all candidate GSC property URLs to try for a given site URL.
 * Order: sc-domain (domain property) → exact URL with trailing slash → www variant → non-www variant
 *
 * @param {string} siteUrl  e.g. "https://www.example.com"
 * @param {string|null} gscProperty  optional override stored on Site model
 * @returns {string[]}  ordered list of candidates to try
 */
function deriveGscPropertyCandidates(siteUrl, gscProperty = null) {
  if (gscProperty) return [gscProperty];

  try {
    const url = new URL(siteUrl);
    const apex = url.hostname.replace(/^www\./, '');
    const withWww = `https://www.${apex}/`;
    const withoutWww = `https://${apex}/`;
    const exact = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;

    return [
      `sc-domain:${apex}`,
      exact,
      withWww,
      withoutWww,
    ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate
  } catch {
    const exact = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
    return [exact];
  }
}

// Keep for backwards compatibility with non-retrying callers
function deriveGscProperty(siteUrl, gscProperty = null) {
  return deriveGscPropertyCandidates(siteUrl, gscProperty)[0];
}

/**
 * Try each candidate property until one succeeds.
 * Returns { client, property } for the first working property, or throws if all fail.
 */
async function findWorkingProperty(siteUrl, gscProperty, queryFn) {
  const candidates = deriveGscPropertyCandidates(siteUrl, gscProperty);
  let lastErr;
  for (const property of candidates) {
    try {
      const result = await queryFn(property);
      console.log('[GSC] Connected via property:', property);
      return result;
    } catch (err) {
      const msg = err.message || '';
      // Only keep trying on permission/not-found errors
      if (msg.includes('does not have sufficient permission') || msg.includes('403') || msg.includes('404')) {
        console.warn(`[GSC] Property "${property}" failed (${msg.split('.')[0]}), trying next...`);
        lastErr = err;
        continue;
      }
      throw err; // non-permission error — surface immediately
    }
  }
  throw lastErr;
}

/**
 * Format a date as YYYY-MM-DD for the GSC API.
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get site-level summary: totals for clicks, impressions, avg CTR, avg position.
 *
 * @param {string} siteUrl
 * @param {string|null} gscProperty
 * @param {number} days  lookback window (default 28)
 * @returns {Promise<{clicks,impressions,ctr,position,available}|{available:false}>}
 */
async function getSiteSummary(siteUrl, gscProperty = null, days = 28) {
  if (!isGscConfigured()) {
    console.warn('[GSC] GOOGLE_SERVICE_ACCOUNT_JSON is not set');
    return { available: false };
  }

  try {
    const gsc = getSearchClient();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const result = await findWorkingProperty(siteUrl, gscProperty, async (property) => {
      const res = await gsc.searchanalytics.query({
        siteUrl: property,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: [],
          rowLimit: 1,
        },
      });
      return res.data.rows?.[0] || null;
    });

    if (!result) return { available: true, clicks: 0, impressions: 0, ctr: 0, position: 0 };

    return {
      available: true,
      clicks: result.clicks || 0,
      impressions: result.impressions || 0,
      ctr: parseFloat(((result.ctr || 0) * 100).toFixed(2)),
      position: parseFloat((result.position || 0).toFixed(1)),
    };
  } catch (err) {
    console.error('[GSC] getSiteSummary error:', err.message);
    return { available: false, error: err.message };
  }
}

/**
 * Get top queries for the whole site.
 *
 * @param {string} siteUrl
 * @param {string|null} gscProperty
 * @param {number} days
 * @param {number} limit
 * @returns {Promise<{available, queries: Array}>}
 */
async function getTopQueriesSite(siteUrl, gscProperty = null, days = 28, limit = 20) {
  if (!isGscConfigured()) return { available: false, queries: [] };

  try {
    const gsc = getSearchClient();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const rows = await findWorkingProperty(siteUrl, gscProperty, async (property) => {
      const res = await gsc.searchanalytics.query({
        siteUrl: property,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['query'],
          rowLimit: limit,
          orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
        },
      });
      return res.data.rows || [];
    });

    const queries = rows.map((row) => ({
      query: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: parseFloat(((row.ctr || 0) * 100).toFixed(2)),
      position: parseFloat((row.position || 0).toFixed(1)),
    }));

    return { available: true, queries };
  } catch (err) {
    return { available: false, queries: [], error: err.message };
  }
}

/**
 * Get top queries for a specific page URL.
 *
 * @param {string} siteUrl
 * @param {string} pageUrl  full URL of the page, e.g. "https://example.com/my-post/"
 * @param {string|null} gscProperty
 * @param {number} days
 * @returns {Promise<{available, queries: Array}>}
 */
async function getTopQueriesForPage(siteUrl, pageUrl, gscProperty = null, days = 28) {
  if (!isGscConfigured()) return { available: false, queries: [] };

  try {
    const gsc = getSearchClient();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const rows = await findWorkingProperty(siteUrl, gscProperty, async (property) => {
      const res = await gsc.searchanalytics.query({
        siteUrl: property,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['query'],
          dimensionFilterGroups: [
            { filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }] },
          ],
          rowLimit: 10,
          orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
        },
      });
      return res.data.rows || [];
    });

    const queries = rows.map((row) => ({
      query: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: parseFloat(((row.ctr || 0) * 100).toFixed(2)),
      position: parseFloat((row.position || 0).toFixed(1)),
    }));

    return { available: true, queries };
  } catch (err) {
    return { available: false, queries: [], error: err.message };
  }
}

/**
 * Get top pages by impressions for the whole site.
 *
 * @param {string} siteUrl
 * @param {string|null} gscProperty
 * @param {number} days
 * @param {number} limit
 * @returns {Promise<{available, pages: Array}>}
 */
async function getTopPages(siteUrl, gscProperty = null, days = 28, limit = 50) {
  if (!isGscConfigured()) return { available: false, pages: [] };

  try {
    const gsc = getSearchClient();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const rows = await findWorkingProperty(siteUrl, gscProperty, async (property) => {
      const res = await gsc.searchanalytics.query({
        siteUrl: property,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['page'],
          rowLimit: limit,
          orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
        },
      });
      return res.data.rows || [];
    });

    const pages = rows.map((row) => ({
      page: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: parseFloat(((row.ctr || 0) * 100).toFixed(2)),
      position: parseFloat((row.position || 0).toFixed(1)),
    }));

    return { available: true, pages };
  } catch (err) {
    return { available: false, pages: [], error: err.message };
  }
}

/**
 * Compare performance for a specific page: last 7 days vs prior 7 days.
 * Used to detect pages losing traffic.
 *
 * @param {string} siteUrl
 * @param {string} pageUrl
 * @param {string|null} gscProperty
 * @returns {Promise<{available, current, previous, impressionDelta, clickDelta}>}
 */
async function getPagePerformanceTrend(siteUrl, pageUrl, gscProperty = null) {
  if (!isGscConfigured()) return { available: false };

  try {
    const client = getSearchClient();
    const property = deriveGscProperty(siteUrl, gscProperty);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(now.getDate() - 1); // yesterday

    const currentStart = new Date(periodEnd);
    currentStart.setDate(periodEnd.getDate() - 6); // last 7 days

    const previousEnd = new Date(currentStart);
    previousEnd.setDate(currentStart.getDate() - 1);

    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousEnd.getDate() - 6); // prior 7 days

    const pageFilter = {
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: 'page', operator: 'equals', expression: pageUrl },
          ],
        },
      ],
    };

    const [currentRes, previousRes] = await Promise.all([
      client.searchanalytics.query({
        siteUrl: property,
        requestBody: {
          startDate: formatDate(currentStart),
          endDate: formatDate(periodEnd),
          dimensions: [],
          ...pageFilter,
        },
      }),
      client.searchanalytics.query({
        siteUrl: property,
        requestBody: {
          startDate: formatDate(previousStart),
          endDate: formatDate(previousEnd),
          dimensions: [],
          ...pageFilter,
        },
      }),
    ]);

    const current = currentRes.data.rows?.[0] || { clicks: 0, impressions: 0 };
    const previous = previousRes.data.rows?.[0] || { clicks: 0, impressions: 0 };

    const impressionDelta =
      previous.impressions > 0
        ? ((current.impressions - previous.impressions) / previous.impressions) * 100
        : 0;
    const clickDelta =
      previous.clicks > 0
        ? ((current.clicks - previous.clicks) / previous.clicks) * 100
        : 0;

    return {
      available: true,
      current: { clicks: current.clicks || 0, impressions: current.impressions || 0 },
      previous: { clicks: previous.clicks || 0, impressions: previous.impressions || 0 },
      impressionDelta: parseFloat(impressionDelta.toFixed(1)),
      clickDelta: parseFloat(clickDelta.toFixed(1)),
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

/**
 * Compare site-wide keyword positions and clicks: current period vs previous period.
 * Used to answer "have we improved this week?" questions.
 *
 * Returns each keyword with its position/clicks in both periods plus the delta.
 * Keywords that only appear in one period are included with null for the missing side.
 *
 * @param {string} siteUrl
 * @param {string|null} gscProperty
 * @param {number} days  period length in days (default 7 = week-over-week)
 * @param {number} limit  max keywords to return
 */
async function getKeywordsTrend(siteUrl, gscProperty = null, days = 7, limit = 25) {
  if (!isGscConfigured()) return { available: false, keywords: [] };

  try {
    const gsc = getSearchClient();

    const now = new Date();
    const currentEnd = new Date(now);
    currentEnd.setDate(now.getDate() - 1); // yesterday

    const currentStart = new Date(currentEnd);
    currentStart.setDate(currentEnd.getDate() - (days - 1));

    const previousEnd = new Date(currentStart);
    previousEnd.setDate(currentStart.getDate() - 1);

    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousEnd.getDate() - (days - 1));

    const [currentRows, previousRows] = await Promise.all([
      findWorkingProperty(siteUrl, gscProperty, async (property) => {
        const res = await gsc.searchanalytics.query({
          siteUrl: property,
          requestBody: {
            startDate: formatDate(currentStart),
            endDate: formatDate(currentEnd),
            dimensions: ['query'],
            rowLimit: limit,
            orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
          },
        });
        return res.data.rows || [];
      }),
      findWorkingProperty(siteUrl, gscProperty, async (property) => {
        const res = await gsc.searchanalytics.query({
          siteUrl: property,
          requestBody: {
            startDate: formatDate(previousStart),
            endDate: formatDate(previousEnd),
            dimensions: ['query'],
            rowLimit: limit,
            orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
          },
        });
        return res.data.rows || [];
      }),
    ]);

    // Index previous period by query keyword
    const prevMap = new Map();
    for (const row of previousRows) {
      prevMap.set(row.keys[0], {
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        position: parseFloat((row.position || 0).toFixed(1)),
      });
    }

    const keywords = currentRows.map((row) => {
      const kw = row.keys[0];
      const curr = {
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        position: parseFloat((row.position || 0).toFixed(1)),
      };
      const prev = prevMap.get(kw) || null;
      const positionDelta = prev ? parseFloat((prev.position - curr.position).toFixed(1)) : null; // positive = improved (lower number = higher rank)
      const clicksDelta = prev ? curr.clicks - prev.clicks : null;
      return { query: kw, current: curr, previous: prev, positionDelta, clicksDelta };
    });

    return {
      available: true,
      currentPeriod: `${formatDate(currentStart)} to ${formatDate(currentEnd)}`,
      previousPeriod: `${formatDate(previousStart)} to ${formatDate(previousEnd)}`,
      keywords,
    };
  } catch (err) {
    return { available: false, keywords: [], error: err.message };
  }
}

module.exports = {
  isGscConfigured,
  deriveGscProperty,
  getSiteSummary,
  getTopQueriesSite,
  getTopQueriesForPage,
  getTopPages,
  getPagePerformanceTrend,
  getKeywordsTrend,
};
