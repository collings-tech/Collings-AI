'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { ANTHROPIC_API_KEY } = require('../config/env');
const ChatHistory = require('../models/ChatHistory');
const SeoJob = require('../models/SeoJob');

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
Every time you create or edit a post or page, you MUST also write and apply SEO metadata immediately after saving the content.
1. Derive a focus keyword from the post title and content.
2. Generate an SEO-optimized meta title (50-60 characters, includes focus keyword).
3. Generate an SEO-optimized meta description (140-160 characters, includes focus keyword).
4. Apply via a second wpAction block using the correct plugin meta fields based on ${detectedSeoPlugin}.

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
  const url = `${siteUrl}/wp-json/wp/v2${endpoint}`;

  const response = await axios({
    method,
    url,
    data: method !== 'GET' ? data : undefined,
    params: method === 'GET' ? data : undefined,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
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

async function executeWpAction({ reply, siteUrl, wpUsername, wpAppPassword, attachments }) {
  const jsonBlockRegex = /```(?:json)?\s*\{[\s\S]*?"wpAction"[\s\S]*?```/gi;
  const match = reply.match(jsonBlockRegex);
  if (!match) return null;

  const raw = match[0].replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  const action = parsed.wpAction;
  if (!action || !action.method || !action.endpoint) return null;

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

  const result = await wpRequest({
    siteUrl, wpUsername, wpAppPassword,
    method: action.method.toUpperCase(),
    endpoint: action.endpoint,
    data: action.data,
  });

  return result;
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
    if (userMessage) userContent.push({ type: 'text', text: userMessage });

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
