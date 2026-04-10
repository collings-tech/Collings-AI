'use strict';

/**
 * weeklyPostGenerator.js
 *
 * Runs once per week for every enabled site:
 *  1. Analyses existing posts to understand the site niche.
 *  2. Picks a fresh, non-duplicate topic with strong search demand.
 *  3. Generates a comprehensive 800-1500+ word post with:
 *       - Proper H2/H3 structure
 *       - Focus keyword in first paragraph
 *       - Internal links to existing posts
 *       - JSON-LD Article schema markup
 *       - Full SEO meta (focus keyword, meta title, meta description)
 *  4. Saves the post as a DRAFT on WordPress.
 *  5. Flags old posts (>6 months, score < 70) as priority-1 refresh jobs.
 */

const Anthropic = require('@anthropic-ai/sdk');
const Site = require('../models/Site');
const SeoJob = require('../models/SeoJob');
const SeoSiteConfig = require('../models/SeoSiteConfig');
const { decrypt } = require('../utils/crypto');
const { scorePost } = require('./seoScorer');
const { wpRequest } = require('./pluginWriter');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// System prompt — content generation
// ---------------------------------------------------------------------------

const CONTENT_SYSTEM_PROMPT = `You are an expert SEO content writer who creates comprehensive, authoritative blog posts.

CRITICAL: Your entire response must be ONE valid JSON object — no markdown fences, no extra text.

Return exactly this structure:
{
  "title": "The post title (plain text)",
  "focusKeyword": "1-3 word primary keyword",
  "metaTitle": "SEO meta title 50-60 characters",
  "metaDescription": "Compelling meta description 140-160 characters with keyword",
  "content": "<full HTML post content including schema script tag>"
}

Content quality rules (ALL required):
- Minimum 900 words of body text
- Start with a compelling introduction paragraph that includes the focus keyword naturally
- Use at least 4 <h2> sections — each covering a distinct subtopic thoroughly
- Use <h3> subsections where it adds clarity
- Include <ul> or <ol> lists where appropriate — they improve readability and can earn featured snippets
- Add <strong> emphasis on key terms and stats
- Weave in 2-3 internal links naturally in the body using the provided URLs — use descriptive anchor text, NOT "click here"
- End with a concise conclusion paragraph
- Keyword density: 0.5–2% — natural, never forced
- Write for humans first, search engines second — no keyword stuffing, no filler sentences
- Use clean HTML only: <p> <h2> <h3> <ul> <ol> <li> <strong> <a href="...">

Schema markup rule (REQUIRED):
Append a JSON-LD Article schema block at the very end of the content field:
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "TITLE_HERE",
  "description": "META_DESCRIPTION_HERE",
  "keywords": "FOCUS_KEYWORD_HERE",
  "author": { "@type": "Organization", "name": "SITE_NAME_HERE" },
  "publisher": { "@type": "Organization", "name": "SITE_NAME_HERE" },
  "datePublished": "DATE_HERE",
  "dateModified": "DATE_HERE",
  "mainEntityOfPage": { "@type": "WebPage", "@id": "SITE_URL_HERE" }
}
</script>`;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

let isGenerating = false;

async function runWeeklyPostGeneration() {
  if (isGenerating) {
    logger.info('Weekly post generation: already in progress, skipping');
    return;
  }
  isGenerating = true;
  logger.info('Weekly post generation: started');

  try {
    const sites = await Site.find({});
    for (const site of sites) {
      try {
        await processWeeklySite(site);
      } catch (err) {
        logger.error('Weekly post generation: error on site', { siteId: site._id, label: site.label, err: err.message });
      }
    }
  } finally {
    isGenerating = false;
    logger.info('Weekly post generation: complete');
  }
}

// ---------------------------------------------------------------------------
// Per-site logic
// ---------------------------------------------------------------------------

async function processWeeklySite(site) {
  const config = await SeoSiteConfig.findOne({ siteId: site._id });
  if (config && !config.enabled) return;

  const seoPlugin = config?.seoPlugin || 'none';

  let wpAppPassword;
  try {
    wpAppPassword = decrypt(site.wpAppPassword);
  } catch (err) {
    logger.error('Weekly post: decrypt failed', { siteId: site._id, err: err.message });
    return;
  }

  const creds = { siteUrl: site.siteUrl, wpUsername: site.wpUsername, wpAppPassword };

  // Run both tasks in parallel — generating a new post + flagging old posts for refresh
  await Promise.all([
    generateAndPublishPost(site, creds, seoPlugin),
    flagStalePostsForRefresh(site, creds, seoPlugin),
  ]);
}

// ---------------------------------------------------------------------------
// 1. Generate a new weekly post
// ---------------------------------------------------------------------------

async function generateAndPublishPost(site, creds, seoPlugin) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });

  // Fetch recent posts to understand niche and provide internal link candidates
  let recentPosts = [];
  try {
    recentPosts = await wpRequest({
      ...creds, method: 'GET', endpoint: '/posts',
      data: { status: 'publish', per_page: 30, _fields: 'id,title,link,excerpt', orderby: 'date', order: 'desc' },
    });
  } catch (err) {
    logger.warn('Weekly post: could not fetch existing posts', { siteId: site._id, err: err.message });
  }

  // Build existing titles list for topic selection
  const existingTitles = recentPosts.map((p) => {
    const t = typeof p.title === 'object' ? p.title.rendered || '' : String(p.title || '');
    return `- ${t}`;
  }).join('\n') || '  (no existing posts)';

  // Build internal link list for content generation
  const internalLinksText = recentPosts.slice(0, 12).map((p) => {
    const t = typeof p.title === 'object' ? p.title.rendered || '' : String(p.title || '');
    return `  - "${t}": ${p.link}`;
  }).join('\n') || '  (none)';

  // ---- Step 1: Pick a topic ----
  logger.info('Weekly post: selecting topic', { siteId: site._id, label: site.label });

  const topicResponse = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: 'You are an SEO content strategist. Respond with ONE valid JSON object only — no extra text.\n\nReturn: {"topic": "topic description", "focusKeyword": "1-3 word keyword", "suggestedTitle": "50-60 char SEO title", "angle": "brief content angle description"}',
    messages: [{
      role: 'user',
      content: `Site URL: ${site.siteUrl}

Existing post titles (avoid duplicating these topics):
${existingTitles}

Pick ONE new blog post topic that:
1. Complements existing content without duplicating any topic
2. Has clear search demand and fits the site niche
3. Can be covered comprehensively in a single post

Return only the JSON.`,
    }],
  });

  let topicData;
  try {
    const raw = topicResponse.content[0].text.trim();
    topicData = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
  } catch {
    throw new Error('Claude returned invalid JSON for topic selection');
  }

  logger.info('Weekly post: topic selected', {
    siteId: site._id, topic: topicData.topic, keyword: topicData.focusKeyword,
  });

  // ---- Step 2: Generate full post ----
  const today = new Date().toISOString().split('T')[0];
  const siteName = site.label || new URL(site.siteUrl).hostname;

  const contentResponse = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: CONTENT_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Write a comprehensive blog post for this site.

Site URL: ${site.siteUrl}
Site name: ${siteName}
Topic: ${topicData.topic}
Focus keyword: ${topicData.focusKeyword}
Suggested title: ${topicData.suggestedTitle}
Content angle: ${topicData.angle}
Today's date (for schema): ${today}

Internal links to weave in naturally (use 2-3):
${internalLinksText}

SEO plugin active: ${seoPlugin}

Requirements:
- 900+ words of body text
- At least 4 <h2> sections
- Include the focus keyword in the first paragraph
- Weave in 2-3 internal links with descriptive anchor text
- End with a JSON-LD Article schema block

Return ONLY the JSON object.`,
    }],
  });

  let postData;
  try {
    const raw = contentResponse.content[0].text.trim();
    postData = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
  } catch {
    throw new Error('Claude returned invalid JSON for post content');
  }

  // ---- Step 3: Build WordPress payload ----
  const wpPayload = {
    title: postData.title,
    content: postData.content,
    status: 'draft',
    excerpt: postData.metaDescription,
  };

  if (seoPlugin === 'rankmath') {
    wpPayload.meta = {
      rank_math_focus_keyword: postData.focusKeyword,
      rank_math_title: postData.metaTitle,
      rank_math_description: postData.metaDescription,
    };
  } else if (seoPlugin === 'yoast') {
    wpPayload.meta = {
      _yoast_wpseo_focuskw: postData.focusKeyword,
      _yoast_wpseo_title: postData.metaTitle,
      _yoast_wpseo_metadesc: postData.metaDescription,
    };
  }

  // ---- Step 4: POST to WordPress as draft ----
  const created = await wpRequest({ ...creds, method: 'POST', endpoint: '/posts', data: wpPayload });

  logger.info('Weekly post: draft created', {
    siteId: site._id,
    label: site.label,
    postId: created.id,
    title: postData.title,
    keyword: postData.focusKeyword,
    postUrl: created.link,
  });
}

// ---------------------------------------------------------------------------
// 2. Flag stale posts (>6 months old, score <70) as priority-1 refresh jobs
// ---------------------------------------------------------------------------

async function flagStalePostsForRefresh(site, creds, seoPlugin) {
  let stalePosts = [];
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    stalePosts = await wpRequest({
      ...creds, method: 'GET', endpoint: '/posts',
      data: {
        status: 'publish', per_page: 100,
        before: sixMonthsAgo.toISOString(),
        _fields: 'id,type,title,content,excerpt,meta',
        context: 'edit',
      },
    });
  } catch (err) {
    logger.warn('Weekly post: could not fetch stale posts', { siteId: site._id, err: err.message });
    return;
  }

  let flagged = 0;
  for (const post of stalePosts) {
    const { score } = scorePost(post, seoPlugin);
    if (score >= 70) continue;

    const existing = await SeoJob.findOne({
      siteId: site._id, postId: post.id,
      status: { $in: ['pending', 'processing'] },
    });

    if (existing) {
      if (existing.priority > 1) {
        await SeoJob.findByIdAndUpdate(existing._id, { $set: { priority: 1 } });
        flagged++;
      }
    } else {
      await SeoJob.create({
        siteId: site._id, postId: post.id, postType: 'post',
        priority: 1, triggeredBy: 'quick_sweep', scheduledAt: new Date(),
      });
      flagged++;
    }
  }

  if (flagged > 0) {
    logger.info('Weekly post: stale posts flagged for refresh', {
      siteId: site._id, label: site.label, flagged,
    });
  }
}

module.exports = { runWeeklyPostGeneration };
