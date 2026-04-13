'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { ANTHROPIC_API_KEY } = require('../config/env');
const ChatHistory = require('../models/ChatHistory');
const SeoJob = require('../models/SeoJob');
const gscService = require('../seo-bot/gscService');
const gaService = require('../seo-bot/gaService');
const Site = require('../models/Site');

// ---------------------------------------------------------------------------
// GSC question detector
// ---------------------------------------------------------------------------

const GSC_KEYWORDS = [
  'traffic', 'clicks', 'impressions', 'ctr', 'click through',
  'ranking', 'rankings', 'rank', 'position', 'positions',
  'search queries', 'keywords ranking', 'top queries', 'top keywords',
  'search console', 'google search', 'organic', 'organic traffic',
  'top pages', 'best performing', 'most visited', 'pageviews',
  'how many visitors', 'how many clicks', 'how is the site performing',
  'site performance', 'search performance', 'seo performance',
];

function isGscQuestion(message) {
  const lower = message.toLowerCase();
  return GSC_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// GA question detector
// ---------------------------------------------------------------------------

const GA_KEYWORDS = [
  'pageviews', 'page views', 'sessions', 'bounce rate', 'bounce',
  'time on page', 'average session', 'avg session', 'session duration',
  'traffic source', 'traffic sources', 'referral', 'referral traffic',
  'direct traffic', 'google analytics', 'analytics data',
  'users', 'new users', 'returning users', 'engagement rate',
  'conversion', 'conversions', 'goals', 'events', 'channel grouping',
  'organic sessions', 'how many visitors', 'visitor count',
];

function isGaQuestion(message) {
  const lower = message.toLowerCase();
  return GA_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

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
- "endpoint" must be ONLY the final path segment(s), e.g. /posts, /pages, /posts/123. Do NOT include /wp/v2 or /wp-json.
- "data" contains the request body fields.
- You MUST include this block for every create or edit action.

## DRAFT-ONLY RULE (CRITICAL)
All posts and pages you create or edit MUST be saved with status = "draft".
NEVER set status = "publish" unless the user explicitly requests it.
Always confirm in your reply that the content was saved as a draft.

## SITE ISOLATION RULE (CRITICAL)
You only have access to the single site specified above (${siteUrl}).

## SEO AUTO-OPTIMIZATION RULE
Every time you create or edit a post or page, you MUST emit TWO wpAction blocks:

Block 1 — save the post/page content:
\`\`\`json
{ "wpAction": { "method": "POST", "endpoint": "/posts/123", "data": { "title": "...", "content": "...", "status": "draft" } } }
\`\`\`

Block 2 — write SEO metadata using the correct method for ${detectedSeoPlugin}:
${detectedSeoPlugin === 'rankmath' ? `For Rank Math, use the Rank Math API Manager plugin endpoint (flat form-encoded params, NOT nested meta object):
\`\`\`json
{ "wpAction": { "method": "POST", "endpoint": "/rank-math-api/v1/update-meta", "data": { "post_id": 123, "rank_math_focus_keyword": "focus keyword", "rank_math_title": "SEO Title 50-60 chars", "rank_math_description": "Meta description 140-160 chars" } } }
\`\`\`
IMPORTANT: This endpoint only works for posts and products — NOT pages. For pages, omit Block 2.` : detectedSeoPlugin === 'yoast' ? `For Yoast, include meta in the post update:
\`\`\`json
{ "wpAction": { "method": "POST", "endpoint": "/posts/123", "data": { "meta": { "_yoast_wpseo_focuskw": "focus keyword", "_yoast_wpseo_title": "SEO Title", "_yoast_wpseo_metadesc": "Meta description" } } } }
\`\`\`` : `Include an excerpt for the meta description.`}

Both blocks MUST be emitted in the same reply. The system executes all of them automatically.

## SEO METADATA LOOKUP RULE (CRITICAL)
For ANY question about SEO data — focus keywords, meta titles, meta descriptions, SEO scores, or any Rank Math fields — you MUST retrieve the data using the WordPress REST API with context=edit, which returns all registered Rank Math meta fields.

For a SINGLE post or page:
\`\`\`json
{ "wpAction": { "method": "GET", "endpoint": "/posts/{post_id}", "data": { "context": "edit" } } }
\`\`\`

For ALL posts (bulk / "list all keywords across all posts"):
Use the special internal endpoint that paginates through ALL posts automatically using GET /wp-json/wp/v2/posts?context=edit under the hood:
\`\`\`json
{ "wpAction": { "method": "GET", "endpoint": "/__list_focus_keywords", "data": {} } }
\`\`\`
The system will return: totalPostsScanned, totalWithKeywords, uniqueKeywords (array), and posts (array with id, title, link, focusKeyword, metaTitle, metaDescription, type).
Use this data to give a complete answer. Do NOT emit any further wpAction blocks after this.
Note: Rank Math's Rank Tracker (Google search ranking history) is a separate cloud feature not available via REST API.

## GOOGLE SEARCH CONSOLE DATA
When the user asks about traffic, clicks, impressions, search rankings, keyword positions, CTR, top pages, top queries, or anything related to how the site performs in Google Search — the system will automatically inject real Google Search Console data into the conversation as a "GSC DATA" block BEFORE your response. When you see this block, use it to answer the question directly and accurately. Do NOT say you cannot access traffic data — the data is provided to you in the message.

Always confirm what action was taken and provide relevant details.
If an action fails, explain the error clearly and suggest a fix.`;
}

// ---------------------------------------------------------------------------
// WordPress API helpers
// ---------------------------------------------------------------------------

function enforceDraftStatus(params) {
  if (params && params.status === 'publish') {
    params.status = 'draft';
  }
  return params;
}

async function wpRequest({ siteUrl, wpUsername, wpAppPassword, method, endpoint, data }) {
  const auth = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');
  // Route non-standard namespaces directly under /wp-json (skip /wp/v2 prefix)
  const isCustomNamespace = endpoint.startsWith('/rankmath/') || endpoint.startsWith('/rank-math-api/');
  const url = isCustomNamespace
    ? `${siteUrl}/wp-json${endpoint}`
    : `${siteUrl}/wp-json/wp/v2${endpoint}`;

  // Rank Math API Manager requires form-encoded body (not JSON)
  const isRankMathApi = endpoint.startsWith('/rank-math-api/');
  let requestData = method !== 'GET' ? data : undefined;
  let contentType = 'application/json';
  if (isRankMathApi && method !== 'GET' && data) {
    requestData = new URLSearchParams(data).toString();
    contentType = 'application/x-www-form-urlencoded';
  }

  const response = await axios({
    method,
    url,
    data: requestData,
    params: method === 'GET' ? data : undefined,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': contentType,
    },
    timeout: 30000,
  });

  return response.data;
}

async function uploadMedia({ siteUrl, wpUsername, wpAppPassword, buffer, mimeType, filename }) {
  const auth = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');
  const url = `${siteUrl}/wp-json/wp/v2/media`;

  const response = await axios({
    method: 'POST',
    url,
    data: buffer,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    timeout: 30000,
  });

  return response.data;
}

function isGetAction(reply) {
  const jsonBlockRegex = /```(?:json)?\s*\{[\s\S]*?"wpAction"[\s\S]*?```/gi;
  const match = reply.match(jsonBlockRegex);
  if (!match) return false;
  try {
    const raw = match[0].replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    return parsed.wpAction && parsed.wpAction.method && parsed.wpAction.method.toUpperCase() === 'GET';
  } catch {
    return false;
  }
}

async function fetchAllPostsWithKeywords({ siteUrl, wpUsername, wpAppPassword }) {
  const results = [];
  for (const type of ['posts', 'pages']) {
    let page = 1;
    while (true) {
      let batch;
      try {
        batch = await wpRequest({
          siteUrl, wpUsername, wpAppPassword,
          method: 'GET',
          endpoint: `/${type}`,
          data: {
            status: 'publish', per_page: 100, page, context: 'edit',
            _fields: 'id,type,title,link,meta,rank_math_focus_keyword,rank_math_title,rank_math_description',
          },
        });
      } catch { break; }
      if (!Array.isArray(batch) || batch.length === 0) break;
      results.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
  }

  const withKeywords = [];
  const allKeywords = new Set();

  for (const post of results) {
    const kw =
      (post.rank_math_focus_keyword && post.rank_math_focus_keyword.trim()) ||
      (post.meta && post.meta.rank_math_focus_keyword && post.meta.rank_math_focus_keyword.trim()) ||
      '';
    const metaTitle =
      (post.rank_math_title && post.rank_math_title.trim()) ||
      (post.meta && post.meta.rank_math_title && post.meta.rank_math_title.trim()) ||
      '';
    const metaDescription =
      (post.rank_math_description && post.rank_math_description.trim()) ||
      (post.meta && post.meta.rank_math_description && post.meta.rank_math_description.trim()) ||
      '';
    if (kw || metaTitle || metaDescription) {
      withKeywords.push({
        id: post.id,
        title: post.title?.rendered || post.title || '',
        link: post.link || '',
        focusKeyword: kw,
        metaTitle,
        metaDescription,
        type: post.type || 'post',
      });
      kw.split(',').forEach((k) => { if (k.trim()) allKeywords.add(k.trim()); });
    }
  }

  return {
    totalPostsScanned: results.length,
    totalWithKeywords: withKeywords.length,
    uniqueKeywords: [...allKeywords].sort(),
    posts: withKeywords,
  };
}

async function executeSingleAction({ action, siteUrl, wpUsername, wpAppPassword, attachments }) {
  if (!action || !action.method || !action.endpoint) return null;

  // Special internal endpoint: fetch ALL posts/pages and extract focus keywords with pagination
  if (action.endpoint === '/__list_focus_keywords') {
    return await fetchAllPostsWithKeywords({ siteUrl, wpUsername, wpAppPassword });
  }

  // Handle media upload
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

  if (action.data) enforceDraftStatus(action.data);

  return await wpRequest({
    siteUrl, wpUsername, wpAppPassword,
    method: action.method.toUpperCase(),
    endpoint: action.endpoint,
    data: action.data,
  });
}

async function executeWpAction({ reply, siteUrl, wpUsername, wpAppPassword, attachments }) {
  const jsonBlockRegex = /```(?:json)?\s*\{[\s\S]*?"wpAction"[\s\S]*?```/gi;
  const matches = reply.match(jsonBlockRegex);
  if (!matches) return null;

  // Execute ALL wpAction blocks in sequence; return the last meaningful result
  let lastResult = null;
  for (const block of matches) {
    const raw = block.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    const action = parsed.wpAction;
    if (!action) continue;
    const result = await executeSingleAction({ action, siteUrl, wpUsername, wpAppPassword, attachments });
    if (result) lastResult = result;
  }
  return lastResult;
}

// ---------------------------------------------------------------------------
// testWpConnection — POST /v1/chat/test-wp-connection
// ---------------------------------------------------------------------------

exports.testWpConnection = async (req, res) => {
  const { siteUrl, wpUsername, wpAppPassword } = req.body;
  try {
    const auth = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');
    await axios.get(`${siteUrl.replace(/\/+$/, '')}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 10000,
    });
    res.json({ success: true });
  } catch (err) {
    const status = err.response?.status;
    let msg = err.message || 'Connection failed';
    if (status === 401) {
      msg = 'Authentication failed (401). Check that your WordPress username is correct and the Application Password was generated under Users → Profile → Application Passwords.';
    } else if (status === 403) {
      msg = 'Access forbidden (403). The WordPress REST API is being blocked — check if a security plugin (e.g. Wordfence, iThemes) is restricting REST API access, or confirm the user account has Administrator role.';
    }
    res.status(400).json({ error: msg });
  }
};

// ---------------------------------------------------------------------------
// detectSeoPlugin — POST /v1/chat/detect-seo-plugin
// ---------------------------------------------------------------------------

exports.detectSeoPlugin = async (req, res) => {
  const { siteUrl, wpUsername, wpAppPassword } = req.body;
  try {
    const plugins = await wpRequest({
      siteUrl, wpUsername, wpAppPassword,
      method: 'GET', endpoint: '/plugins',
    });
    const slugs = plugins.map((p) => p.plugin || '');
    let plugin = 'none';
    if (slugs.some((s) => s.includes('rank-math'))) plugin = 'rankmath';
    else if (slugs.some((s) => s.includes('wordpress-seo'))) plugin = 'yoast';
    res.json({ plugin });
  } catch {
    res.json({ plugin: 'none' });
  }
};

// ---------------------------------------------------------------------------
// sendMessage — POST /v1/chat/message
// ---------------------------------------------------------------------------

exports.sendMessage = async (req, res) => {
  const {
    siteId,
    siteUrl,
    wpUsername,
    wpAppPassword,
    messages,
    userMessage,
    attachments,
    detectedSeoPlugin,
  } = req.body;

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const systemPrompt = buildSystemPrompt({ siteUrl, wpUsername, wpAppPassword, detectedSeoPlugin: detectedSeoPlugin || 'none' });

    // Pre-fetch GSC data if the question is about traffic/rankings
    let gscContext = null;
    if (userMessage && gscService.isGscConfigured() && isGscQuestion(userMessage)) {
      try {
        // Look up the site record to get gscProperty override if set
        let gscProperty = null;
        if (siteId) {
          const siteDoc = await Site.findById(siteId).select('gscProperty').lean();
          gscProperty = siteDoc?.gscProperty || null;
        }

        const [summaryRes, queriesRes, pagesRes] = await Promise.allSettled([
          gscService.getSiteSummary(siteUrl, gscProperty, 28),
          gscService.getTopQueriesSite(siteUrl, gscProperty, 28, 20),
          gscService.getTopPages(siteUrl, gscProperty, 28, 20),
        ]);

        const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null;
        const queries = queriesRes.status === 'fulfilled' ? queriesRes.value : null;
        const pages = pagesRes.status === 'fulfilled' ? pagesRes.value : null;

        if (summary?.available) {
          const queryLines = queries?.queries?.length
            ? queries.queries.slice(0, 15).map((q, i) =>
                `  ${i + 1}. "${q.query}" — ${q.clicks} clicks, ${q.impressions} impressions, pos #${q.position}, CTR ${q.ctr}%`
              ).join('\n')
            : '  (no query data)';

          const pageLines = pages?.pages?.length
            ? pages.pages.slice(0, 10).map((p, i) => {
                let path = p.page;
                try { path = new URL(p.page).pathname; } catch {}
                return `  ${i + 1}. ${path} — ${p.impressions} impressions, ${p.clicks} clicks, pos #${p.position}, CTR ${p.ctr}%`;
              }).join('\n')
            : '  (no page data)';

          gscContext = `\n\n--- GSC DATA (Google Search Console — last 28 days) ---\nSite: ${siteUrl}\nTotal Clicks: ${summary.clicks.toLocaleString()}\nTotal Impressions: ${summary.impressions.toLocaleString()}\nAvg CTR: ${summary.ctr}%\nAvg Position: #${summary.position}\n\nTop Search Queries:\n${queryLines}\n\nTop Pages by Impressions:\n${pageLines}\n--- END GSC DATA ---\n\nUse the above real data to answer the user's question.`;
        }
      } catch { /* non-critical — proceed without GSC */ }
    }

    // Pre-fetch GA4 data if the question is about sessions/engagement/traffic sources
    let gaContext = null;
    if (userMessage && gaService.isGaConfigured() && isGaQuestion(userMessage)) {
      try {
        let gaPropertyId = null;
        if (siteId) {
          const siteDoc = await Site.findById(siteId).select('gaPropertyId').lean();
          gaPropertyId = siteDoc?.gaPropertyId || null;
        }

        if (gaPropertyId) {
          const [summaryRes, pagesRes, sourcesRes] = await Promise.allSettled([
            gaService.getSiteSummary(gaPropertyId, 28),
            gaService.getTopPages(gaPropertyId, 28, 15),
            gaService.getTrafficSources(gaPropertyId, 28),
          ]);

          const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null;
          const pages = pagesRes.status === 'fulfilled' ? pagesRes.value : null;
          const sources = sourcesRes.status === 'fulfilled' ? sourcesRes.value : null;

          if (summary?.available) {
            const avgDurMin = Math.floor((summary.avgSessionDuration || 0) / 60);
            const avgDurSec = Math.round((summary.avgSessionDuration || 0) % 60);

            const pageLines = pages?.pages?.length
              ? pages.pages.slice(0, 10).map((p, i) =>
                  `  ${i + 1}. ${p.page} — ${p.sessions} sessions, ${p.pageviews} pageviews, ${p.bounceRate}% bounce, avg ${Math.floor(p.avgDuration / 60)}m ${Math.round(p.avgDuration % 60)}s`
                ).join('\n')
              : '  (no page data)';

            const sourceLines = sources?.sources?.length
              ? sources.sources.map((s, i) =>
                  `  ${i + 1}. ${s.source} — ${s.sessions} sessions (${s.pct}%)`
                ).join('\n')
              : '  (no source data)';

            gaContext = `\n\n--- GA4 DATA (Google Analytics 4 — last 28 days) ---\nSite: ${siteUrl}\nSessions: ${summary.sessions.toLocaleString()}\nUsers: ${summary.users.toLocaleString()}\nPageviews: ${summary.pageviews.toLocaleString()}\nBounce Rate: ${summary.bounceRate}%\nAvg Session Duration: ${avgDurMin}m ${avgDurSec}s\n\nTop Pages by Sessions:\n${pageLines}\n\nTraffic Sources:\n${sourceLines}\n--- END GA4 DATA ---\n\nUse the above real data to answer the user's question.`;
          }
        }
      } catch { /* non-critical — proceed without GA */ }
    }

    // Build user content
    const userContent = [];
    for (const att of (attachments || [])) {
      if (att.type && att.type.startsWith('image/') && att.dataUrl) {
        const base64Data = att.dataUrl.split(',')[1];
        userContent.push({ type: 'image', source: { type: 'base64', media_type: att.type, data: base64Data } });
      } else if (att.name) {
        userContent.push({ type: 'text', text: `[Attached file: ${att.name}]` });
      }
    }
    if (userMessage) userContent.push({ type: 'text', text: userMessage + (gscContext || '') + (gaContext || '') });

    const claudeMessages = [
      ...(messages || []).map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: userContent.length === 1 && userContent[0].type === 'text'
          ? userContent[0].text
          : userContent,
      },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const thinking = null;
    let reply = '';
    for (const block of response.content) {
      if (block.type === 'text') reply += block.text;
    }
    reply = reply.trim();

    // Execute WP action
    let actionResult = null;
    try {
      actionResult = await executeWpAction({ reply, siteUrl, wpUsername, wpAppPassword, attachments });
    } catch (actionErr) {
      actionResult = { error: actionErr.message };
    }

    // If this was a GET action that returned data, feed the result back to Claude
    // so it can produce a real answer instead of "please allow me a moment..."
    if (actionResult && !actionResult.error && isGetAction(reply)) {
      try {
        const followUp = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [
            ...claudeMessages,
            { role: 'assistant', content: reply },
            {
              role: 'user',
              content: `Here is the WordPress API response data:\n\n${JSON.stringify(actionResult, null, 2)}\n\nNow use this data to fully answer my original question. Do not emit any more wpAction blocks.`,
            },
          ],
        });
        let followUpReply = '';
        for (const block of followUp.content) {
          if (block.type === 'text') followUpReply += block.text;
        }
        if (followUpReply.trim()) reply = followUpReply.trim();
      } catch { /* fall back to original reply */ }
    }

    // Persist to history
    if (siteId && req.user) {
      try {
        const userId = req.user._id || req.user.id;
        let history = await ChatHistory.findOne({ userId, siteId });
        if (!history) history = new ChatHistory({ userId, siteId, messages: [] });
        if (userMessage) history.messages.push({ role: 'user', content: userMessage });
        if (reply) history.messages.push({ role: 'assistant', content: reply });
        await history.save();
      } catch { /* non-critical */ }
    }

    // Queue SEO job if a post was created/edited
    if (actionResult && actionResult.id && siteId) {
      const createdType = actionResult.type || 'post';
      if (createdType === 'post' || createdType === 'page') {
        try {
          await SeoJob.create({
            siteId,
            postId: actionResult.id,
            postType: createdType,
            priority: 1,
            triggeredBy: 'new_post',
            status: 'pending',
          });
        } catch { /* non-critical */ }
      }
    }

    res.json({ reply, thinking: thinking || null, actionResult });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to process message' });
  }
};
