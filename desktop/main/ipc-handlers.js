const { ipcMain } = require('electron');
const axios = require('axios');
const store = require('./store');
const { wpRequest, enforceDraftStatus, uploadMedia } = require('./wp-api');
const claudeApi = require('./claude-api');
const { detectSeoPlugin } = require('./seo-detector');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBackendUrl() {
  return store.get('BACKEND_API_URL') || 'http://localhost:5000/v1';
}

async function logError(source, err, context = {}) {
  try {
    const token = store.get('ACCESS_TOKEN');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    await axios.post(
      `${getBackendUrl()}/logs/error`,
      {
        source,
        message: err.message || String(err),
        stack: err.stack || null,
        context,
      },
      { headers, timeout: 5000 }
    );
  } catch {
    // logging must never throw
  }
}

function buildAxiosHeaders() {
  const token = store.get('ACCESS_TOKEN');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Async version — refreshes the access token automatically if it has expired or force=true
async function buildAuthHeaders(force = false) {
  let token = store.get('ACCESS_TOKEN');

  if (token || force) {
    const exp = token ? decodeJwtExpiry(token) : 0;
    const nowSec = Math.floor(Date.now() / 1000);

    // Refresh if: forced, token expired, or expiring within 30 seconds (clock-skew buffer)
    if (force || (exp && exp < nowSec + 30)) {
      const refreshToken = store.get('REFRESH_TOKEN');
      if (refreshToken) {
        try {
          const res = await axios.post(
            `${getBackendUrl()}/auth/refresh`,
            { refreshToken },
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
          );
          token = res.data.accessToken;
          if (token) store.set('ACCESS_TOKEN', token);
        } catch {
          store.delete('ACCESS_TOKEN');
          store.delete('REFRESH_TOKEN');
          token = null;
        }
      } else {
        store.delete('ACCESS_TOKEN');
        token = null;
      }
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Calls requestFn with fresh auth headers. If the server returns 401, force-refreshes
// the token once and retries. Returns the axios response object.
async function callWithAuthRetry(requestFn) {
  const headers = await buildAuthHeaders();
  try {
    return await requestFn(headers);
  } catch (err) {
    if (err.response?.status === 401) {
      const retryHeaders = await buildAuthHeaders(true);
      if (!retryHeaders['Authorization']) throw err; // No token after refresh — give up
      return await requestFn(retryHeaders);
    }
    throw err;
  }
}

function decodeJwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp || 0;
  } catch {
    return 0;
  }
}

function buildSystemPrompt({ siteUrl, wpUsername, wpAppPassword, detectedSeoPlugin }) {
  return `You are an AI assistant that manages a WordPress website on behalf of the user.

Site URL: ${siteUrl}
WordPress Username: ${wpUsername}
WordPress Application Password: ${wpAppPassword}
Active SEO Plugin: ${detectedSeoPlugin}

You have full access to this WordPress site via its REST API. When the user asks you to do something, determine the correct WordPress REST API action and execute it by embedding a wpAction JSON block in your reply (see format below).

## ACTION FORMAT (CRITICAL)
To execute any WordPress REST API call, you MUST include a JSON block in EXACTLY this format somewhere in your reply:

\`\`\`json
{ "wpAction": { "method": "POST", "endpoint": "/posts", "data": { "title": "...", "content": "...", "status": "draft" } } }
\`\`\`

- "method" must be GET, POST, PUT, PATCH, or DELETE.
- "endpoint" must be ONLY the final path segment(s), e.g. /posts, /pages, /posts/123, /posts/123/meta. Do NOT include /wp/v2 or /wp-json in the endpoint — those are added automatically.
- "data" contains the request body fields.
- You MUST include this block for every create or edit action. Without it, nothing will be saved to WordPress.
- After the block, describe what you did in plain text.

## DRAFT-ONLY RULE (CRITICAL)
All posts and pages you create or edit MUST be saved with status = "draft".
NEVER set status = "publish" unless the user explicitly requests it.
If the user provides a future date/time, use status = "future" with the correct date_gmt value.
Always confirm in your reply that the content was saved as a draft.

## SITE ISOLATION RULE (CRITICAL)
You only have access to the single site specified above (${siteUrl}).
All WordPress REST API calls must use ${siteUrl} as the base URL.

## SEO AUTO-OPTIMIZATION RULE
Every time you create or edit a post or page, you MUST also write and apply SEO metadata immediately after saving the content.
1. Derive a focus keyword from the post title and content.
2. Generate an SEO-optimized meta title (50-60 characters, includes focus keyword).
3. Generate an SEO-optimized meta description (140-160 characters, includes focus keyword).
4. Apply via a second wpAction block using the correct plugin meta fields based on ${detectedSeoPlugin}.

## IMAGE/MEDIA UPLOAD RULE
When the user attaches an image and wants to upload it to the WordPress media library, generate this wpAction:
\`\`\`json
{ "wpAction": { "method": "POST", "endpoint": "/media", "data": { "title": "...", "alt_text": "...", "caption": "..." } } }
\`\`\`
Do NOT include a "file" or "url" field in "data" — the system will automatically use the attached image binary. Only include title, alt_text, and caption metadata.

Always confirm what action was taken and provide relevant details.
If an action fails, explain the error clearly and suggest a fix.`;
}

// ---------------------------------------------------------------------------
// Auth handlers
// ---------------------------------------------------------------------------

ipcMain.handle('auth:login', async (_event, { email, password }) => {
  try {
    const res = await axios.post(
      `${getBackendUrl()}/auth/login`,
      { email, password },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const { accessToken, refreshToken, user } = res.data;
    if (accessToken) store.set('ACCESS_TOKEN', accessToken);
    if (refreshToken) store.set('REFRESH_TOKEN', refreshToken);
    return { user };
  } catch (err) {
    const msg = err.response?.data?.message || err.message || 'Login failed';
    await logError('auth:login', err, { email });
    return { error: msg };
  }
});

ipcMain.handle('auth:register', async (_event, { name, email, password }) => {
  try {
    const res = await axios.post(
      `${getBackendUrl()}/auth/register`,
      { name, email, password },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const { accessToken, refreshToken, user } = res.data;
    if (accessToken) store.set('ACCESS_TOKEN', accessToken);
    if (refreshToken) store.set('REFRESH_TOKEN', refreshToken);
    return { user };
  } catch (err) {
    const msg = err.response?.data?.message || err.message || 'Registration failed';
    await logError('auth:register', err, { email });
    return { error: msg };
  }
});

ipcMain.handle('auth:logout', async () => {
  try {
    const token = store.get('ACCESS_TOKEN');
    if (token) {
      await axios.post(
        `${getBackendUrl()}/auth/logout`,
        {},
        { headers: await buildAuthHeaders(), timeout: 10000 }
      ).catch(() => {});
    }
  } finally {
    store.delete('ACCESS_TOKEN');
    store.delete('REFRESH_TOKEN');
  }
  return { success: true };
});

ipcMain.handle('auth:check', async () => {
  try {
    const token = store.get('ACCESS_TOKEN');
    if (!token) return { user: null };

    const exp = decodeJwtExpiry(token);
    const nowSec = Math.floor(Date.now() / 1000);

    // If token expired, attempt refresh
    if (exp && exp < nowSec) {
      const refreshToken = store.get('REFRESH_TOKEN');
      if (!refreshToken) { store.delete('ACCESS_TOKEN'); return { user: null }; }

      try {
        const res = await axios.post(
          `${getBackendUrl()}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        const { accessToken, user } = res.data;
        if (accessToken) store.set('ACCESS_TOKEN', accessToken);
        return { user };
      } catch {
        store.delete('ACCESS_TOKEN');
        store.delete('REFRESH_TOKEN');
        return { user: null };
      }
    }

    // Token still valid — fetch user profile
    const res = await axios.get(
      `${getBackendUrl()}/auth/me`,
      { headers: await buildAuthHeaders(), timeout: 10000 }
    );
    return { user: res.data };
  } catch {
    return { user: null };
  }
});

ipcMain.handle('auth:get-token', () => {
  return store.get('ACCESS_TOKEN') || null;
});

ipcMain.handle('auth:update-profile', async (_event, { name }) => {
  try {
    const res = await axios.patch(
      `${getBackendUrl()}/auth/me`,
      { name },
      { headers: await buildAuthHeaders(), timeout: 10000 }
    );
    return { user: res.data };
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Failed to update profile.';
    return { error: msg };
  }
});

ipcMain.handle('auth:update-password', async (_event, { currentPassword, newPassword }) => {
  try {
    const res = await axios.patch(
      `${getBackendUrl()}/auth/me/password`,
      { currentPassword, newPassword },
      { headers: await buildAuthHeaders(), timeout: 10000 }
    );
    return { message: res.data.message };
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Failed to update password.';
    return { error: msg };
  }
});

// ---------------------------------------------------------------------------
// Sites handlers
// ---------------------------------------------------------------------------

ipcMain.handle('sites:get-all', async () => {
  try {
    const res = await callWithAuthRetry((headers) =>
      axios.get(`${getBackendUrl()}/sites`, { headers, timeout: 15000 })
    );
    return { sites: res.data };
  } catch (err) {
    await logError('sites:get-all', err);
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('sites:add', async (_event, { label, siteUrl, wpUsername, wpAppPassword, testOnly }) => {
  try {
    // Normalise URL — strip trailing slash to avoid double-slash paths
    const normalizedUrl = siteUrl.replace(/\/+$/, '');
    // Strip spaces from Application Password (WordPress accepts both, some setups don't)
    const normalizedPassword = wpAppPassword.replace(/\s+/g, '');

    // Test WP connection first
    const auth = Buffer.from(`${wpUsername}:${normalizedPassword}`).toString('base64');
    await axios.get(`${normalizedUrl}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 10000,
    });

    // If only testing, stop here
    if (testOnly) return { success: true };

    const res = await axios.post(
      `${getBackendUrl()}/sites`,
      { label, siteUrl: normalizedUrl, wpUsername, wpAppPassword: normalizedPassword },
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { site: res.data };
  } catch (err) {
    const status = err.response?.status;
    let msg = err.response?.data?.message || err.message || 'Failed to add site';
    if (status === 401) {
      msg = 'Authentication failed (401). Check that your WordPress username is correct and the Application Password was generated under Users → Profile → Application Passwords.';
    }
    await logError('sites:add', err, { siteUrl, wpUsername });
    return { error: msg };
  }
});

ipcMain.handle('sites:delete', async (_event, { id }) => {
  try {
    await axios.delete(
      `${getBackendUrl()}/sites/${id}`,
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { success: true };
  } catch (err) {
    await logError('sites:delete', err, { id });
    return { error: err.response?.data?.message || err.message };
  }
});

// ---------------------------------------------------------------------------
// Chat handler
// ---------------------------------------------------------------------------

ipcMain.handle('chat:send-message', async (_event, {
  siteId,
  siteUrl,
  wpUsername,
  wpAppPassword,
  messages,
  userMessage,
  attachments,
  detectedSeoPlugin,
}) => {
  try {
    const systemPrompt = buildSystemPrompt({ siteUrl, wpUsername, wpAppPassword, detectedSeoPlugin: detectedSeoPlugin || 'none' });

    const { reply, thinking } = await claudeApi.sendMessage(systemPrompt, messages || [], userMessage, attachments || []);

    // Attempt to parse and execute a WP action from the reply
    let actionResult = null;
    try {
      actionResult = await executeWpAction({ reply, siteUrl, wpUsername, wpAppPassword, attachments });
    } catch (actionErr) {
      actionResult = { error: actionErr.message };
      await logError('wp-action', actionErr, { siteUrl, userMessage });
    }

    // Persist to history backend
    try {
      await axios.post(
        `${getBackendUrl()}/history/${siteId}`,
        {
          userMessage,
          assistantReply: reply,
          actionResult,
        },
        { headers: await buildAuthHeaders(), timeout: 10000 }
      );
    } catch {
      // History persistence is best-effort
    }

    // Queue a priority-1 SEO Bot job when a post or page was created/edited
    if (actionResult && actionResult.id && siteId) {
      const createdType = actionResult.type || 'post';
      if (createdType === 'post' || createdType === 'page') {
        try {
          await axios.post(
            `${getBackendUrl()}/seo/jobs/${siteId}`,
            { postId: actionResult.id, postType: createdType, priority: 1, triggeredBy: 'new_post' },
            { headers: await buildAuthHeaders(), timeout: 5000 }
          );
        } catch {
          // Non-critical — bot will pick the post up on next nightly sweep if this fails
        }
      }
    }

    return { reply, thinking: thinking || null, actionResult };
  } catch (err) {
    await logError('chat', err, { siteId, siteUrl, userMessage });
    return { error: err.message || 'Failed to send message' };
  }
});

/**
 * Naive action extractor: looks for JSON blocks in the Claude reply that describe
 * a WP REST API call. Claude is instructed via the system prompt to structure actions.
 * Format expected: ```json\n{ "wpAction": { "method": "POST", "endpoint": "/posts", "data": {...} } }\n```
 */
async function executeWpAction({ reply, siteUrl, wpUsername, wpAppPassword, attachments }) {
  const jsonBlockRegex = /```(?:json)?\s*\{[\s\S]*?"wpAction"[\s\S]*?```/gi;
  const match = reply.match(jsonBlockRegex);
  if (!match) return null;

  const raw = match[0].replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  const action = parsed.wpAction;
  if (!action || !action.method || !action.endpoint) return null;

  // Handle media upload: use the actual attached image binary instead of JSON
  if (action.endpoint === '/media' && action.method.toUpperCase() === 'POST') {
    const imageAtt = (attachments || []).find((a) => a.type && a.type.startsWith('image/'));
    if (imageAtt && imageAtt.dataUrl) {
      const base64Data = imageAtt.dataUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const uploaded = await uploadMedia({
        siteUrl, wpUsername, wpAppPassword,
        buffer,
        mimeType: imageAtt.type,
        filename: imageAtt.name || `upload-${Date.now()}.png`,
      });
      // Apply Claude's metadata (title, alt_text, caption) if provided
      const meta = action.data || {};
      if (uploaded.id && (meta.title || meta.alt_text || meta.caption)) {
        return await wpRequest({
          siteUrl, wpUsername, wpAppPassword,
          method: 'POST',
          endpoint: `/media/${uploaded.id}`,
          data: {
            ...(meta.title && { title: meta.title }),
            ...(meta.alt_text && { alt_text: meta.alt_text }),
            ...(meta.caption && { caption: meta.caption }),
          },
        });
      }
      return uploaded;
    }
  }

  // Enforce draft-only on write operations
  if (action.data) {
    enforceDraftStatus(action.data);
  }

  const result = await wpRequest({
    siteUrl,
    wpUsername,
    wpAppPassword,
    method: action.method.toUpperCase(),
    endpoint: action.endpoint,
    data: action.data,
  });

  return result;
}

// ---------------------------------------------------------------------------
// History handlers
// ---------------------------------------------------------------------------

ipcMain.handle('history:get', async (_event, { siteId }) => {
  try {
    const res = await axios.get(
      `${getBackendUrl()}/history/${siteId}`,
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { history: res.data };
  } catch (err) {
    await logError('history:get', err, { siteId });
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('history:clear', async (_event, { siteId }) => {
  try {
    await axios.delete(
      `${getBackendUrl()}/history/${siteId}`,
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { success: true };
  } catch (err) {
    await logError('history:clear', err, { siteId });
    return { error: err.response?.data?.message || err.message };
  }
});

// ---------------------------------------------------------------------------
// Settings handlers
// ---------------------------------------------------------------------------

ipcMain.handle('settings:get-timezone', () => {
  return store.get('USER_TIMEZONE') || Intl.DateTimeFormat().resolvedOptions().timeZone;
});

ipcMain.handle('settings:set-anthropic-key', (_event, { key }) => {
  store.set('ANTHROPIC_API_KEY', key);
  return { success: true };
});

ipcMain.handle('settings:get-anthropic-key', () => {
  return store.get('ANTHROPIC_API_KEY') || null;
});

ipcMain.handle('settings:set-backend-url', (_event, { url }) => {
  store.set('BACKEND_API_URL', url);
  return { success: true };
});

// ---------------------------------------------------------------------------
// SEO detector handler
// ---------------------------------------------------------------------------

ipcMain.handle('seo:detect-plugin', async (_event, { siteUrl, wpUsername, wpAppPassword }) => {
  try {
    const plugin = await detectSeoPlugin({ siteUrl, wpUsername, wpAppPassword });
    return { plugin };
  } catch (err) {
    await logError('seo:detect-plugin', err, { siteUrl });
    return { plugin: 'none', error: err.message };
  }
});

// ---------------------------------------------------------------------------
// SEO Dashboard handlers
// ---------------------------------------------------------------------------

ipcMain.handle('seo:get-overview', async () => {
  try {
    const res = await axios.get(
      `${getBackendUrl()}/seo/dashboard/overview`,
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { overview: res.data.overview };
  } catch (err) {
    await logError('seo:get-overview', err);
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('seo:get-score-trend', async (_event, { siteId, days = 30 }) => {
  try {
    const res = await axios.get(
      `${getBackendUrl()}/seo/dashboard/${siteId}/score-trend`,
      { headers: await buildAuthHeaders(), params: { days }, timeout: 15000 }
    );
    return { trend: res.data.trend };
  } catch (err) {
    await logError('seo:get-score-trend', err, { siteId });
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('seo:get-distribution', async (_event, { siteId }) => {
  try {
    const res = await axios.get(
      `${getBackendUrl()}/seo/dashboard/${siteId}/distribution`,
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { distribution: res.data.distribution };
  } catch (err) {
    await logError('seo:get-distribution', err, { siteId });
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('seo:get-activity', async (_event, { siteId, days = 14 }) => {
  try {
    const res = await axios.get(
      `${getBackendUrl()}/seo/dashboard/${siteId}/activity`,
      { headers: await buildAuthHeaders(), params: { days }, timeout: 15000 }
    );
    return { activity: res.data.activity };
  } catch (err) {
    await logError('seo:get-activity', err, { siteId });
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('seo:get-top-improved', async (_event, { siteId }) => {
  try {
    const res = await axios.get(
      `${getBackendUrl()}/seo/dashboard/${siteId}/top-improved`,
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { posts: res.data.posts };
  } catch (err) {
    await logError('seo:get-top-improved', err, { siteId });
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('seo:get-attention', async (_event, { siteId }) => {
  try {
    const res = await axios.get(
      `${getBackendUrl()}/seo/dashboard/${siteId}/attention`,
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { posts: res.data.posts };
  } catch (err) {
    await logError('seo:get-attention', err, { siteId });
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('seo:trigger-job', async (_event, { siteId, postId, postType = 'post' }) => {
  try {
    const res = await axios.post(
      `${getBackendUrl()}/seo/jobs/${siteId}`,
      { postId, postType },
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { job: res.data.job };
  } catch (err) {
    await logError('seo:trigger-job', err, { siteId, postId });
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('seo:get-config', async (_event, { siteId }) => {
  try {
    const res = await axios.get(
      `${getBackendUrl()}/seo/config/${siteId}`,
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { config: res.data };
  } catch (err) {
    await logError('seo:get-config', err, { siteId });
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('seo:update-config', async (_event, { siteId, ...updates }) => {
  try {
    const res = await axios.put(
      `${getBackendUrl()}/seo/config/${siteId}`,
      updates,
      { headers: await buildAuthHeaders(), timeout: 15000 }
    );
    return { config: res.data };
  } catch (err) {
    await logError('seo:update-config', err, { siteId });
    return { error: err.response?.data?.message || err.message };
  }
});

ipcMain.handle('seo:get-activity-panel', async (_event, { siteId }) => {
  try {
    const [logsRes, jobsRes] = await Promise.all([
      axios.get(`${getBackendUrl()}/seo/logs/${siteId}`, {
        headers: await buildAuthHeaders(),
        params: { limit: 10 },
        timeout: 15000,
      }),
      axios.get(`${getBackendUrl()}/seo/jobs/${siteId}`, {
        headers: await buildAuthHeaders(),
        timeout: 15000,
      }),
    ]);
    return {
      logs: logsRes.data.logs || [],
      pendingCount: (jobsRes.data.pending || []).length,
    };
  } catch (err) {
    await logError('seo:get-activity-panel', err, { siteId });
    return { logs: [], pendingCount: 0, error: err.message };
  }
});
