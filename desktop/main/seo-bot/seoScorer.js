'use strict';

/**
 * seoScorer.js — Calculates an SEO score (0–100) for a WordPress post.
 *
 * Scoring rubric (matches §20.5 of the spec):
 *   Focus keyword in meta title        → 15 pts
 *   Focus keyword in meta description  → 15 pts
 *   Focus keyword in first paragraph   → 10 pts
 *   Meta title 50–60 characters        → 10 pts
 *   Meta description 140–160 chars     → 10 pts
 *   Keyword density 0.5–2.5%           → 10 pts
 *   At least one internal link         → 10 pts
 *   At least one H2 heading            → 10 pts
 *   Post length > 300 words            → 10 pts
 */

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SEO meta extraction
// ---------------------------------------------------------------------------

/**
 * Pull focus keyword, meta title, and meta description from a WP post object
 * based on whichever SEO plugin is active.
 */
function extractSeoMeta(post, seoPlugin) {
  const meta = post.meta || {};

  if (seoPlugin === 'rankmath') {
    return {
      focusKeyword: String(meta.rank_math_focus_keyword || ''),
      metaTitle: String(meta.rank_math_title || ''),
      metaDescription: String(meta.rank_math_description || ''),
    };
  }

  if (seoPlugin === 'yoast') {
    return {
      focusKeyword: String(meta._yoast_wpseo_focuskw || ''),
      metaTitle: String(meta._yoast_wpseo_title || ''),
      metaDescription: String(meta._yoast_wpseo_metadesc || ''),
    };
  }

  // No plugin — fall back to native title/excerpt
  const title = typeof post.title === 'object' ? post.title.rendered || '' : String(post.title || '');
  const excerpt = typeof post.excerpt === 'object' ? post.excerpt.rendered || '' : String(post.excerpt || '');
  return {
    focusKeyword: '',
    metaTitle: stripHtml(title),
    metaDescription: stripHtml(excerpt),
  };
}

// ---------------------------------------------------------------------------
// Main scorer
// ---------------------------------------------------------------------------

/**
 * Score a WordPress post for SEO quality.
 *
 * @param {object} post       WordPress REST API post object (context=edit)
 * @param {string} seoPlugin  'rankmath' | 'yoast' | 'none'
 * @returns {{ score: number, breakdown: object, seoMeta: object }}
 */
function scorePost(post, seoPlugin) {
  const seoMeta = extractSeoMeta(post, seoPlugin);
  const { focusKeyword, metaTitle, metaDescription } = seoMeta;

  const contentHtml =
    typeof post.content === 'object' ? post.content.rendered || '' : String(post.content || '');
  const contentText = stripHtml(contentHtml);
  const firstParagraph = contentText.slice(0, 300);

  const breakdown = {
    keywordInTitle: 0,        // 15
    keywordInDescription: 0,  // 15
    keywordInFirstPara: 0,    // 10
    titleLength: 0,           // 10
    descriptionLength: 0,     // 10
    keywordDensity: 0,        // 10
    hasInternalLink: 0,       // 10
    hasH2: 0,                 // 10
    postLength: 0,            // 10
  };

  // Keyword checks (only scored when a keyword exists)
  if (focusKeyword) {
    if (containsKeyword(metaTitle, focusKeyword)) breakdown.keywordInTitle = 15;
    if (containsKeyword(metaDescription, focusKeyword)) breakdown.keywordInDescription = 15;
    if (containsKeyword(firstParagraph, focusKeyword)) breakdown.keywordInFirstPara = 10;

    const density = calcKeywordDensity(contentText, focusKeyword);
    if (density >= 0.005 && density <= 0.025) breakdown.keywordDensity = 10;
    else if (density > 0) breakdown.keywordDensity = 5; // some presence, wrong range
  }

  // Title length
  const titleLen = metaTitle.length;
  if (titleLen >= 50 && titleLen <= 60) breakdown.titleLength = 10;
  else if (titleLen >= 40 && titleLen <= 70) breakdown.titleLength = 5;

  // Description length
  const descLen = metaDescription.length;
  if (descLen >= 140 && descLen <= 160) breakdown.descriptionLength = 10;
  else if (descLen >= 100 && descLen <= 180) breakdown.descriptionLength = 5;

  // Internal link check — any <a href> present in content
  if (/<a\s[^>]*href=["'][^"']+["'][^>]*>/i.test(contentHtml)) breakdown.hasInternalLink = 10;

  // H2 heading check
  if (/<h2[\s>]/i.test(contentHtml)) breakdown.hasH2 = 10;

  // Word count
  const words = wordCount(contentText);
  if (words > 300) breakdown.postLength = 10;
  else if (words > 150) breakdown.postLength = 5;

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return { score, breakdown, seoMeta };
}

module.exports = { scorePost, extractSeoMeta, stripHtml };
