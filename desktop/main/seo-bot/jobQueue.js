'use strict';

/**
 * jobQueue.js — Interface between the SEO Bot and the backend API.
 *
 * Handles all job lifecycle calls (lock / complete / fail / reset-stale),
 * log creation, and site fetching. Includes a short-lived site cache so
 * the bot doesn't hammer the backend on every 5-minute cycle.
 */

const axios = require('axios');
const store = require('../store');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Site cache (TTL: 5 minutes)
// ---------------------------------------------------------------------------

let sitesCache = null;
let sitesCacheTime = 0;
const SITES_CACHE_TTL = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBackendUrl() {
  return store.get('BACKEND_API_URL') || 'http://localhost:5000/v1';
}

function getAuthHeaders() {
  const token = store.get('ACCESS_TOKEN');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function refreshTokenIfNeeded() {
  const token = store.get('ACCESS_TOKEN');
  if (!token) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      const refreshToken = store.get('REFRESH_TOKEN');
      if (!refreshToken) return false;
      const res = await axios.post(
        `${getBackendUrl()}/auth/refresh`,
        { refreshToken },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      if (res.data.accessToken) {
        store.set('ACCESS_TOKEN', res.data.accessToken);
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function apiRequest(method, url, data = null) {
  await refreshTokenIfNeeded();
  return axios({ method, url, data: data || undefined, headers: getAuthHeaders(), timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

function isAuthenticated() {
  return !!store.get('ACCESS_TOKEN');
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

async function getAllSites(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && sitesCache && now - sitesCacheTime < SITES_CACHE_TTL) {
    return sitesCache;
  }
  const res = await apiRequest('GET', `${getBackendUrl()}/sites`);
  sitesCache = res.data || [];
  sitesCacheTime = now;
  return sitesCache;
}

// ---------------------------------------------------------------------------
// SEO config
// ---------------------------------------------------------------------------

async function getSiteConfig(siteId) {
  const res = await apiRequest('GET', `${getBackendUrl()}/seo/config/${siteId}`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

async function getPendingJobs(siteId) {
  const res = await apiRequest('GET', `${getBackendUrl()}/seo/jobs/${siteId}`);
  return res.data.pending || [];
}

async function createJob(siteId, postId, postType, priority, triggeredBy) {
  const res = await apiRequest('POST', `${getBackendUrl()}/seo/jobs/${siteId}`, {
    postId,
    postType,
    priority,
    triggeredBy,
  });
  return res.data.job;
}

async function lockJob(siteId, jobId) {
  const res = await apiRequest('PATCH', `${getBackendUrl()}/seo/jobs/${siteId}/${jobId}/lock`);
  return res.data.job;
}

async function completeJob(siteId, jobId) {
  const res = await apiRequest('PATCH', `${getBackendUrl()}/seo/jobs/${siteId}/${jobId}/complete`);
  return res.data.job;
}

async function failJob(siteId, jobId, error) {
  const res = await apiRequest(
    'PATCH',
    `${getBackendUrl()}/seo/jobs/${siteId}/${jobId}/fail`,
    { error: String(error || 'Unknown error') }
  );
  return res.data.job;
}

async function resetStaleJobs(siteId) {
  const res = await apiRequest('POST', `${getBackendUrl()}/seo/jobs/${siteId}/reset-stale`);
  return res.data.reset || 0;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

async function createLog(siteId, logData) {
  const res = await apiRequest('POST', `${getBackendUrl()}/seo/logs/${siteId}`, logData);
  return res.data.log;
}

module.exports = {
  isAuthenticated,
  getAllSites,
  getSiteConfig,
  getPendingJobs,
  createJob,
  lockJob,
  completeJob,
  failJob,
  resetStaleJobs,
  createLog,
};
