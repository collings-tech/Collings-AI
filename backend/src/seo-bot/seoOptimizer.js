'use strict';

/**
 * seoOptimizer.js (backend) — Calls Claude API directly using ANTHROPIC_API_KEY from env.
 * No electron-store dependency — pure Node.js.
 */

const Anthropic = require('@anthropic-ai/sdk');

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

SCORING RULES — your output is scored by an automated system using these exact rules:
1. focusKeyword: MUST be 1–3 words only (e.g. "real estate agents"). Shorter keywords score more reliably.
2. metaTitle: MUST be 50–60 characters (count carefully). MUST contain the focusKeyword as an exact substring (same words, same order). Put the keyword near the start.
3. metaDescription: MUST be 140–160 characters (count carefully). MUST contain the focusKeyword as an exact substring.
4. internalLinks: up to 3 relevant links from the provided list; empty array [] if none relevant.
5. rewrittenContent: rewritten HTML ONLY when told to rewrite; otherwise exactly null.
   - When rewriting: focusKeyword must appear in the first paragraph as an exact phrase, at least one <h2>, keyword density 0.5–2.5% (occurrences / total words).
   - Use clean HTML only: <p> <h2> <h3> <ul> <li> <strong>
   - CRITICAL: rewrittenContent must be a valid JSON string. Escape all double-quotes as \" and all backslashes as \\. Use \n for newlines. No raw newlines or unescaped quotes inside the string.

IMPORTANT: If metaTitle does not contain the exact focusKeyword phrase, the score will DROP. Always verify before returning.`;

async function optimizePost(post, currentSeoMeta, seoPlugin, otherPosts = [], currentScore, rewriteThreshold = 40) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in backend environment');

  const client = new Anthropic({ apiKey });

  const postTitle = typeof post.title === 'object' ? post.title.rendered || '' : String(post.title || '');
  const contentHtml = typeof post.content === 'object' ? post.content.rendered || '' : String(post.content || '');
  const shouldRewrite = currentScore < rewriteThreshold;

  const otherPostsText = otherPosts.length > 0
    ? otherPosts.slice(0, 20).map((p) => {
        const t = typeof p.title === 'object' ? p.title.rendered : p.title;
        return `  - ID: ${p.id} | Title: ${t} | URL: ${p.link}`;
      }).join('\n')
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
1. Choose a focusKeyword of 1–3 words that best represents this post's search intent.
2. Write a metaTitle that is EXACTLY 50–60 characters and contains the focusKeyword as an exact substring.
3. Write a metaDescription that is EXACTLY 140–160 characters and contains the focusKeyword as an exact substring.
4. Suggest up to 3 internal links from the list above that are topically relevant.${shouldRewrite
    ? `\n5. REWRITE the full post content — score ${currentScore} is below rewrite threshold ${rewriteThreshold}. Return clean HTML in rewrittenContent. The focusKeyword must appear as an exact phrase in the first paragraph.`
    : `\n5. Do NOT rewrite content (score ${currentScore} is above rewrite threshold). Set rewrittenContent to null.`}

Before returning, verify: does metaTitle contain the focusKeyword exactly? Is metaTitle 50–60 chars? Is metaDescription 140–160 chars?
Return ONLY the JSON object.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: SEO_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const rawResponse = response.content[0].text;

  let parsed = null;

  // Attempt 1: clean JSON parse
  try {
    parsed = JSON.parse(rawResponse.trim());
  } catch { /* fall through */ }

  // Attempt 2: extract outermost JSON object and parse
  if (!parsed) {
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch { /* fall through */ }
  }

  // Attempt 3: rewrittenContent may contain unescaped HTML that breaks JSON.
  // Strip it out, parse the rest of the fields safely via regex.
  let focusKeyword = '';
  let metaTitle = '';
  let metaDescription = '';
  let internalLinks = [];
  let rewrittenContent = null;

  if (parsed) {
    focusKeyword = String(parsed.focusKeyword || '');
    metaTitle = String(parsed.metaTitle || '');
    metaDescription = String(parsed.metaDescription || '');
    internalLinks = Array.isArray(parsed.internalLinks) ? parsed.internalLinks : [];
    rewrittenContent = parsed.rewrittenContent || null;
  } else {
    // Regex fallback — extract scalar fields individually
    const kwMatch = rawResponse.match(/"focusKeyword"\s*:\s*"([^"]+)"/);
    const titleMatch = rawResponse.match(/"metaTitle"\s*:\s*"([^"]+)"/);
    const descMatch = rawResponse.match(/"metaDescription"\s*:\s*"([^"]+)"/);
    focusKeyword = kwMatch ? kwMatch[1] : '';
    metaTitle = titleMatch ? titleMatch[1] : '';
    metaDescription = descMatch ? descMatch[1] : '';

    // Try to parse internalLinks array
    try {
      const linksMatch = rawResponse.match(/"internalLinks"\s*:\s*(\[[\s\S]*?\])/);
      if (linksMatch) internalLinks = JSON.parse(linksMatch[1]);
    } catch { /* leave as [] */ }

    // Extract rewrittenContent between its key and the closing brace — handles unescaped HTML
    if (shouldRewrite) {
      try {
        const rcMatch = rawResponse.match(/"rewrittenContent"\s*:\s*"([\s\S]*?)"\s*[,}]/);
        if (rcMatch) rewrittenContent = rcMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      } catch { /* leave as null */ }
    }

    if (!focusKeyword && !metaTitle) {
      throw new Error('Claude did not return parseable SEO fields');
    }
  }

  return {
    focusKeyword: focusKeyword.slice(0, 60),
    metaTitle: metaTitle.slice(0, 70),
    metaDescription: metaDescription.slice(0, 200),
    internalLinks: internalLinks.slice(0, 3),
    rewrittenContent: shouldRewrite && rewrittenContent ? String(rewrittenContent) : null,
  };
}

// ---------------------------------------------------------------------------
// Image alt text generator
// ---------------------------------------------------------------------------

async function generateImageAltText(mediaItem) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in backend environment');

  const client = new Anthropic({ apiKey });

  const title = typeof mediaItem.title === 'object'
    ? mediaItem.title.rendered || ''
    : String(mediaItem.title || '');
  const caption = typeof mediaItem.caption === 'object'
    ? mediaItem.caption.rendered || ''
    : String(mediaItem.caption || '');
  const sourceUrl = mediaItem.source_url || '';
  const filename = sourceUrl.split('/').pop().replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '') || '';

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: 'You are an SEO expert. Generate concise, descriptive alt text for an image based on available metadata. Return ONLY the alt text string — no quotes, no explanation, max 125 characters. Do not start with "Image of" or "Photo of".',
    messages: [{
      role: 'user',
      content: `Generate alt text for this image:\nTitle: ${title || '(none)'}\nCaption: ${caption || '(none)'}\nFilename hint: ${filename || '(none)'}`,
    }],
  });

  return response.content[0].text.trim().slice(0, 125);
}

module.exports = { optimizePost, generateImageAltText };
