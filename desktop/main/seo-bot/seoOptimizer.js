'use strict';

/**
 * seoOptimizer.js — Calls Claude to produce optimised SEO metadata and,
 * when the post score is critically low, a full content rewrite.
 *
 * Returns a plain object:
 *   { focusKeyword, metaTitle, metaDescription, internalLinks, rewrittenContent }
 */

const { sendMessage } = require('../claude-api');

const SEO_SYSTEM_PROMPT = `You are an SEO optimization expert analyzing WordPress posts.

CRITICAL: Your entire response must be ONE valid JSON object — no markdown fences, no explanatory text, nothing else.

Return exactly this structure:
{
  "focusKeyword": "1-3 word primary keyword",
  "metaTitle": "SEO-optimized title 50-60 characters",
  "metaDescription": "Compelling description 140-160 characters with keyword",
  "internalLinks": [
    { "anchorText": "descriptive anchor text", "postId": 123, "url": "https://example.com/post" }
  ],
  "rewrittenContent": null
}

Rules:
- focusKeyword: 1–3 words, primary search intent, no brand names
- metaTitle: 50–60 characters, keyword near the start, compelling and click-worthy
- metaDescription: 140–160 characters, includes keyword, summarises the post value, ends with a call to action or strong close
- internalLinks: up to 3 relevant links from the provided list; empty array [] if none are relevant
- rewrittenContent: rewritten HTML ONLY when told to rewrite; otherwise exactly null
  - When rewriting: include focus keyword in first paragraph, add at least one <h2>, improve keyword density to 0.5–2.5%, keep same topic
  - Use clean HTML: <p> <h2> <h3> <ul> <li> <strong> only — no inline styles`;

/**
 * Ask Claude to optimise SEO for a single WordPress post.
 *
 * @param {object} post             WordPress post object (content.rendered available)
 * @param {object} currentSeoMeta   { focusKeyword, metaTitle, metaDescription }
 * @param {string} seoPlugin        'rankmath' | 'yoast' | 'none'
 * @param {Array}  otherPosts       Published posts for internal link suggestions [{ id, title, link }]
 * @param {number} currentScore     Current SEO score (0–100)
 * @param {number} rewriteThreshold Score below which content is fully rewritten (default 40)
 * @returns {Promise<{focusKeyword, metaTitle, metaDescription, internalLinks, rewrittenContent}>}
 */
async function optimizePost(post, currentSeoMeta, seoPlugin, otherPosts = [], currentScore, rewriteThreshold = 40) {
  const postTitle =
    typeof post.title === 'object' ? post.title.rendered || '' : String(post.title || '');
  const contentHtml =
    typeof post.content === 'object' ? post.content.rendered || '' : String(post.content || '');

  const shouldRewrite = currentScore < rewriteThreshold;

  const otherPostsText =
    otherPosts.length > 0
      ? otherPosts
          .slice(0, 20)
          .map((p) => {
            const title = typeof p.title === 'object' ? p.title.rendered : p.title;
            return `  - ID: ${p.id} | Title: ${title} | URL: ${p.link}`;
          })
          .join('\n')
      : '  (none)';

  const userMessage = `Analyze and optimize this WordPress post:

Post ID: ${post.id}
Title: ${postTitle}
Current SEO score: ${currentScore}/100
Active SEO plugin: ${seoPlugin}

Current SEO metadata:
  Focus keyword: ${currentSeoMeta.focusKeyword || '(none)'}
  Meta title: ${currentSeoMeta.metaTitle || '(none)'}
  Meta description: ${currentSeoMeta.metaDescription || '(none)'}

Post content (may be truncated):
${contentHtml.slice(0, 3000)}${contentHtml.length > 3000 ? '\n<!-- content truncated -->' : ''}

Other published posts available for internal linking:
${otherPostsText}

Task:
1. Generate improved focusKeyword, metaTitle, metaDescription.
2. Suggest up to 3 internal links from the list above that are topically relevant.${shouldRewrite
    ? `\n3. REWRITE the full post content to improve SEO — score ${currentScore} is below the rewrite threshold of ${rewriteThreshold}. Return clean HTML in rewrittenContent.`
    : `\n3. Do NOT rewrite content (score ${currentScore} is above rewrite threshold ${rewriteThreshold}). Set rewrittenContent to null.`}

Return ONLY the JSON object described in the system prompt.`;

  const rawResponse = await sendMessage(SEO_SYSTEM_PROMPT, [], userMessage);

  let parsed;
  try {
    parsed = JSON.parse(rawResponse.trim());
  } catch {
    // Claude may have wrapped the JSON in markdown fences despite instructions
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Claude did not return valid JSON for SEO optimization');
    }
    parsed = JSON.parse(jsonMatch[0]);
  }

  return {
    focusKeyword: String(parsed.focusKeyword || '').slice(0, 60),
    metaTitle: String(parsed.metaTitle || '').slice(0, 70),
    metaDescription: String(parsed.metaDescription || '').slice(0, 200),
    internalLinks: Array.isArray(parsed.internalLinks) ? parsed.internalLinks.slice(0, 3) : [],
    rewrittenContent: shouldRewrite && parsed.rewrittenContent
      ? String(parsed.rewrittenContent)
      : null,
  };
}

module.exports = { optimizePost };
