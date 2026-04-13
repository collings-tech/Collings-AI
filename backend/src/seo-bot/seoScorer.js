'use strict';

// Identical scoring logic to the desktop version — pure functions, no deps.

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function containsKeyword(text, keyword) {
  if (!keyword || !text) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function calcKeywordDensity(text, keyword) {
  if (!keyword || !text) return 0;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const kwWords = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || !kwWords.length) return 0;
  let occurrences = 0;
  for (let i = 0; i <= words.length - kwWords.length; i++) {
    if (kwWords.every((w, j) => words[i + j] === w)) occurrences++;
  }
  return occurrences / words.length;
}

function extractSeoMeta(post, seoPlugin) {
  const meta = post.meta || {};
  if (seoPlugin === 'rankmath') {
    // RankMath may expose fields via register_rest_field (top-level on the post object)
    // or via register_meta (nested inside post.meta). Check both.
    return {
      focusKeyword: String(post.rank_math_focus_keyword || meta.rank_math_focus_keyword || ''),
      metaTitle: String(post.rank_math_title || meta.rank_math_title || ''),
      metaDescription: String(post.rank_math_description || meta.rank_math_description || ''),
    };
  }
  if (seoPlugin === 'yoast') {
    return {
      focusKeyword: String(meta._yoast_wpseo_focuskw || ''),
      metaTitle: String(meta._yoast_wpseo_title || ''),
      metaDescription: String(meta._yoast_wpseo_metadesc || ''),
    };
  }
  const title = typeof post.title === 'object' ? post.title.rendered || '' : String(post.title || '');
  const excerpt = typeof post.excerpt === 'object' ? post.excerpt.rendered || '' : String(post.excerpt || '');
  return { focusKeyword: '', metaTitle: stripHtml(title), metaDescription: stripHtml(excerpt) };
}

// Words Rank Math considers "positive sentiment" or "power words" for title scoring
const SENTIMENT_WORDS = ['best', 'top', 'proven', 'ultimate', 'expert', 'essential', 'powerful', 'effective', 'reliable', 'trusted', 'leading', 'premier', 'exceptional', 'outstanding', 'superior', 'perfect', 'complete', 'comprehensive', 'definitive', 'authoritative'];
const POWER_WORDS = ['guide', 'secrets', 'tips', 'strategies', 'blueprint', 'mastery', 'insider', 'revealed', 'discover', 'learn', 'steps', 'ways', 'mistakes', 'facts', 'reasons', 'benefits', 'solutions', 'answers', 'results', 'success'];

function escapeRegexDomain(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scorePost(post, seoPlugin, siteUrl = '') {
  const seoMeta = extractSeoMeta(post, seoPlugin);

  const { focusKeyword, metaTitle, metaDescription } = seoMeta;
  const contentHtml = typeof post.content === 'object' ? post.content.rendered || '' : String(post.content || '');
  const contentText = stripHtml(contentHtml);
  // First 10% of content (Rank Math checks first 10%, not just first 300 chars)
  const first10pct = contentText.slice(0, Math.max(300, Math.floor(contentText.length * 0.1)));

  const breakdown = {
    // Basic SEO (~40 pts)
    keywordInTitle: 0,        // 8
    keywordInDescription: 0,  // 4
    keywordInUrl: 0,          // 4 — we can't control URL, assume 0
    keywordInFirstPara: 0,    // 8
    keywordInContent: 0,      // 4
    contentLength: 0,         // 6
    // Additional (~26 pts)
    keywordInSubheading: 0,   // 4
    keywordDensity: 0,        // 4
    hasInternalLink: 0,       // 4
    outboundLinks: 0,         // 4
    titleLength: 0,           // 5
    descriptionLength: 0,     // 5
    // Title readability (~15 pts)
    titleSentimentWord: 0,    // 5
    titlePowerWord: 0,        // 5
    titleHasNumber: 0,        // 5
    // Content readability (~10 pts — partial, we can't check all)
    hasShortParagraphs: 0,    // 5 (assume OK if rewritten)
    hasSubheadings: 0,        // 5
  };

  if (focusKeyword) {
    if (containsKeyword(metaTitle, focusKeyword)) breakdown.keywordInTitle = 8;
    if (containsKeyword(metaDescription, focusKeyword)) breakdown.keywordInDescription = 4;
    if (containsKeyword(first10pct, focusKeyword)) breakdown.keywordInFirstPara = 8;
    if (containsKeyword(contentText, focusKeyword)) breakdown.keywordInContent = 4;
    // Keyword in subheadings (h2/h3/h4 text — Rank Math checks all heading levels)
    const subheadingText = (contentHtml.match(/<h[234][^>]*>(.*?)<\/h[234]>/gi) || [])
      .map((h) => stripHtml(h)).join(' ');
    if (containsKeyword(subheadingText, focusKeyword)) breakdown.keywordInSubheading = 4;
    const density = calcKeywordDensity(contentText, focusKeyword);
    if (density >= 0.005 && density <= 0.025) breakdown.keywordDensity = 4;
    else if (density > 0) breakdown.keywordDensity = 2;
  }

  const titleLower = metaTitle.toLowerCase();
  const titleLen = metaTitle.length;
  if (titleLen >= 50 && titleLen <= 60) breakdown.titleLength = 5;
  else if (titleLen >= 40 && titleLen <= 70) breakdown.titleLength = 3;

  const descLen = metaDescription.length;
  if (descLen >= 140 && descLen <= 160) breakdown.descriptionLength = 5;
  else if (descLen >= 100 && descLen <= 180) breakdown.descriptionLength = 3;

  if (/<a\s[^>]*href=["'][^"']+["'][^>]*>/i.test(contentHtml)) breakdown.hasInternalLink = 4;
  if (/<h[2-4][\s>]/i.test(contentHtml)) breakdown.hasSubheadings = 5;
  if (/<p[\s>]/i.test(contentHtml)) breakdown.hasShortParagraphs = 5; // assume OK if has paragraphs

  // Detect outbound (external) links — links to domains other than this site
  if (siteUrl) {
    const domain = siteUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    const externalLinkRe = new RegExp(
      `href=["']https?://(?!(?:www\\.)?${escapeRegexDomain(domain)})[^"']+["']`, 'i'
    );
    if (externalLinkRe.test(contentHtml)) breakdown.outboundLinks = 4;
  }

  // Title readability
  if (SENTIMENT_WORDS.some((w) => titleLower.includes(w))) breakdown.titleSentimentWord = 5;
  if (POWER_WORDS.some((w) => titleLower.includes(w))) breakdown.titlePowerWord = 5;
  if (/\d/.test(metaTitle)) breakdown.titleHasNumber = 5;

  const words = wordCount(contentText);
  if (words >= 600) breakdown.contentLength = 6;
  else if (words >= 300) breakdown.contentLength = 4;
  else if (words >= 150) breakdown.contentLength = 2;

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, breakdown, seoMeta };
}

/**
 * Build a fake post object that reflects the optimized meta values, then score it.
 * Used to verify the new values will actually increase the score before writing to WP.
 */
function simulateScore(currentPost, seoPlugin, optimized, siteUrl = '') {
  const simulatedPost = { ...currentPost };

  if (seoPlugin === 'rankmath') {
    // Set in both locations to match whichever way extractSeoMeta finds them
    simulatedPost.rank_math_focus_keyword = optimized.focusKeyword;
    simulatedPost.rank_math_title = optimized.metaTitle;
    simulatedPost.rank_math_description = optimized.metaDescription;
    simulatedPost.meta = {
      ...(currentPost.meta || {}),
      rank_math_focus_keyword: optimized.focusKeyword,
      rank_math_title: optimized.metaTitle,
      rank_math_description: optimized.metaDescription,
      rank_math_seo_score: 0, // clear so we fall through to custom calculation
    };
  } else if (seoPlugin === 'yoast') {
    simulatedPost.meta = {
      ...(currentPost.meta || {}),
      _yoast_wpseo_focuskw: optimized.focusKeyword,
      _yoast_wpseo_title: optimized.metaTitle,
      _yoast_wpseo_metadesc: optimized.metaDescription,
    };
  } else {
    simulatedPost.excerpt = { rendered: optimized.metaDescription };
  }

  // Simulate the final content state — exactly what will be written to WordPress
  const currentContent = typeof currentPost.content === 'object'
    ? currentPost.content.raw || currentPost.content.rendered || ''
    : String(currentPost.content || '');

  if (optimized.rewrittenContent) {
    // Unescape JSON-encoded content so the scorer sees clean HTML
    const cleanHtml = optimized.rewrittenContent
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    // Mirror pluginWriter: append related posts + further reading after a rewrite
    let finalHtml = cleanHtml;
    if (optimized.internalLinks && optimized.internalLinks.length > 0 && !finalHtml.includes('<!-- seo-bot-related-posts -->')) {
      const valid = optimized.internalLinks.filter((l) => l && l.url && l.anchorText);
      if (valid.length > 0) {
        const items = valid.map((l) => `<li><a href="${l.url}">${l.anchorText}</a></li>`).join('\n');
        finalHtml += `\n<!-- seo-bot-related-posts -->\n<h3>Related Posts</h3>\n<ul>\n${items}\n</ul>\n`;
      }
    }
    if (optimized.outboundLinks && optimized.outboundLinks.length > 0 && !finalHtml.includes('<!-- seo-bot-further-reading -->')) {
      const valid = optimized.outboundLinks.filter((l) => l && l.url && l.anchorText);
      if (valid.length > 0) {
        const items = valid.map((l) => `<li><a href="${l.url}">${l.anchorText}</a></li>`).join('\n');
        finalHtml += `\n<!-- seo-bot-further-reading -->\n<h3>Further Reading</h3>\n<ul>\n${items}\n</ul>\n`;
      }
    }
    simulatedPost.content = { rendered: finalHtml, raw: finalHtml };
  } else {
    let appendedContent = currentContent;
    if (optimized.internalLinks && optimized.internalLinks.length > 0) {
      const valid = optimized.internalLinks.filter((l) => l && l.url && l.anchorText);
      if (valid.length > 0 && !appendedContent.includes('<!-- seo-bot-related-posts -->')) {
        const items = valid.map((l) => `<li><a href="${l.url}">${l.anchorText}</a></li>`).join('\n');
        appendedContent += `\n<!-- seo-bot-related-posts -->\n<h3>Related Posts</h3>\n<ul>\n${items}\n</ul>\n`;
      }
    }
    if (optimized.outboundLinks && optimized.outboundLinks.length > 0) {
      const valid = optimized.outboundLinks.filter((l) => l && l.url && l.anchorText);
      if (valid.length > 0 && !appendedContent.includes('<!-- seo-bot-further-reading -->')) {
        const items = valid.map((l) => `<li><a href="${l.url}">${l.anchorText}</a></li>`).join('\n');
        appendedContent += `\n<!-- seo-bot-further-reading -->\n<h3>Further Reading</h3>\n<ul>\n${items}\n</ul>\n`;
      }
    }
    if (appendedContent !== currentContent) {
      simulatedPost.content = { rendered: appendedContent, raw: appendedContent };
    }
  }

  return scorePost(simulatedPost, seoPlugin, siteUrl);
}

module.exports = { scorePost, simulateScore, extractSeoMeta, stripHtml, wordCount };
