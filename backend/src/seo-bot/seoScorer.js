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
  const title = typeof post.title === 'object' ? post.title.rendered || '' : String(post.title || '');
  const excerpt = typeof post.excerpt === 'object' ? post.excerpt.rendered || '' : String(post.excerpt || '');
  return { focusKeyword: '', metaTitle: stripHtml(title), metaDescription: stripHtml(excerpt) };
}

function scorePost(post, seoPlugin) {
  const seoMeta = extractSeoMeta(post, seoPlugin);
  const { focusKeyword, metaTitle, metaDescription } = seoMeta;
  const contentHtml = typeof post.content === 'object' ? post.content.rendered || '' : String(post.content || '');
  const contentText = stripHtml(contentHtml);
  const firstParagraph = contentText.slice(0, 300);

  const breakdown = {
    keywordInTitle: 0, keywordInDescription: 0, keywordInFirstPara: 0,
    titleLength: 0, descriptionLength: 0, keywordDensity: 0,
    hasInternalLink: 0, hasH2: 0, postLength: 0,
  };

  if (focusKeyword) {
    if (containsKeyword(metaTitle, focusKeyword)) breakdown.keywordInTitle = 15;
    if (containsKeyword(metaDescription, focusKeyword)) breakdown.keywordInDescription = 15;
    if (containsKeyword(firstParagraph, focusKeyword)) breakdown.keywordInFirstPara = 10;
    const density = calcKeywordDensity(contentText, focusKeyword);
    if (density >= 0.005 && density <= 0.025) breakdown.keywordDensity = 10;
    else if (density > 0) breakdown.keywordDensity = 5;
  }

  const titleLen = metaTitle.length;
  if (titleLen >= 50 && titleLen <= 60) breakdown.titleLength = 10;
  else if (titleLen >= 40 && titleLen <= 70) breakdown.titleLength = 5;

  const descLen = metaDescription.length;
  if (descLen >= 140 && descLen <= 160) breakdown.descriptionLength = 10;
  else if (descLen >= 100 && descLen <= 180) breakdown.descriptionLength = 5;

  if (/<a\s[^>]*href=["'][^"']+["'][^>]*>/i.test(contentHtml)) breakdown.hasInternalLink = 10;
  if (/<h2[\s>]/i.test(contentHtml)) breakdown.hasH2 = 10;

  const words = wordCount(contentText);
  if (words > 300) breakdown.postLength = 10;
  else if (words > 150) breakdown.postLength = 5;

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, breakdown, seoMeta };
}

/**
 * Build a fake post object that reflects the optimized meta values, then score it.
 * Used to verify the new values will actually increase the score before writing to WP.
 */
function simulateScore(currentPost, seoPlugin, optimized) {
  const simulatedPost = { ...currentPost };

  if (seoPlugin === 'rankmath') {
    simulatedPost.meta = {
      ...(currentPost.meta || {}),
      rank_math_focus_keyword: optimized.focusKeyword,
      rank_math_title: optimized.metaTitle,
      rank_math_description: optimized.metaDescription,
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
  if (optimized.rewrittenContent) {
    // Unescape JSON-encoded content so the scorer sees clean HTML
    const cleanHtml = optimized.rewrittenContent
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    // Mirror pluginWriter: always append related posts section after a rewrite
    let finalHtml = cleanHtml;
    if (optimized.internalLinks && optimized.internalLinks.length > 0 && !finalHtml.includes('<!-- seo-bot-related-posts -->')) {
      const valid = optimized.internalLinks.filter((l) => l && l.url && l.anchorText);
      if (valid.length > 0) {
        const items = valid.map((l) => `<li><a href="${l.url}">${l.anchorText}</a></li>`).join('\n');
        finalHtml += `\n<!-- seo-bot-related-posts -->\n<h3>Related Posts</h3>\n<ul>\n${items}\n</ul>\n`;
      }
    }
    simulatedPost.content = { rendered: finalHtml, raw: finalHtml };
  } else if (optimized.internalLinks && optimized.internalLinks.length > 0) {
    // Simulate the related posts section that writeSeoMeta appends
    const currentContent = typeof currentPost.content === 'object'
      ? currentPost.content.raw || currentPost.content.rendered || ''
      : String(currentPost.content || '');
    const valid = optimized.internalLinks.filter((l) => l && l.url && l.anchorText);
    if (valid.length > 0 && !currentContent.includes('<!-- seo-bot-related-posts -->')) {
      const items = valid.map((l) =>
        `<li><a href="${l.url}">${l.anchorText}</a></li>`
      ).join('\n');
      const relatedSection = `\n<!-- seo-bot-related-posts -->\n<h3>Related Posts</h3>\n<ul>\n${items}\n</ul>\n`;
      simulatedPost.content = { rendered: currentContent + relatedSection, raw: currentContent + relatedSection };
    }
  }

  return scorePost(simulatedPost, seoPlugin);
}

module.exports = { scorePost, simulateScore, extractSeoMeta, stripHtml };
