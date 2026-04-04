'use strict';

/**
 * pluginWriter.js — Writes SEO metadata back to WordPress.
 *
 * Handles three cases:
 *   rankmath  → writes rank_math_* meta fields
 *   yoast     → writes _yoast_wpseo_* meta fields
 *   none      → writes to the native excerpt field
 *
 * Also handles:
 *   - Full content rewrite (saved as draft)
 *   - Appending an internal-links "Related Posts" section
 */

const { wpRequest } = require('../wp-api');
const logger = require('./logger');

/**
 * Write SEO metadata (and optionally rewritten content) to a WordPress post or page.
 *
 * @param {object} creds     { siteUrl, wpUsername, wpAppPassword }
 * @param {number} postId    WordPress post / page ID
 * @param {string} postType  'post' | 'page'
 * @param {string} seoPlugin 'rankmath' | 'yoast' | 'none'
 * @param {object} seoData   { focusKeyword, metaTitle, metaDescription, internalLinks, rewrittenContent }
 * @returns {Promise<object|null>}
 */
async function writeSeoMeta(creds, postId, postType, seoPlugin, seoData) {
  const { focusKeyword, metaTitle, metaDescription, internalLinks, rewrittenContent } = seoData;
  const endpoint = `/${postType === 'page' ? 'pages' : 'posts'}/${postId}`;

  const updateData = {};

  // --- SEO plugin meta fields ---
  if (seoPlugin === 'rankmath') {
    updateData.meta = {
      rank_math_focus_keyword: focusKeyword,
      rank_math_title: metaTitle,
      rank_math_description: metaDescription,
    };
  } else if (seoPlugin === 'yoast') {
    updateData.meta = {
      _yoast_wpseo_focuskw: focusKeyword,
      _yoast_wpseo_title: metaTitle,
      _yoast_wpseo_metadesc: metaDescription,
    };
  } else {
    // No SEO plugin — write to native excerpt
    updateData.excerpt = metaDescription;
  }

  // --- Rewritten content ---
  if (rewrittenContent) {
    updateData.content = rewrittenContent;
    updateData.status = 'draft';
  } else if (internalLinks && internalLinks.length > 0) {
    // Append a Related Posts section to existing content (once only)
    try {
      const currentPost = await wpRequest({
        ...creds,
        method: 'GET',
        endpoint: `${endpoint}?context=edit`,
      });

      const currentContent =
        typeof currentPost.content === 'object'
          ? currentPost.content.raw || currentPost.content.rendered || ''
          : String(currentPost.content || '');

      if (!currentContent.includes('<!-- seo-bot-related-posts -->')) {
        const relatedSection = buildRelatedPostsSection(internalLinks);
        if (relatedSection) {
          updateData.content = currentContent + relatedSection;
          updateData.status = 'draft';
        }
      }
    } catch (err) {
      logger.warn('pluginWriter: could not fetch post content for internal links', {
        postId,
        err: err.message,
      });
    }
  }

  if (Object.keys(updateData).length === 0) {
    logger.info('pluginWriter: nothing to update', { postId });
    return null;
  }

  return wpRequest({
    ...creds,
    method: 'POST',
    endpoint,
    data: updateData,
  });
}

function buildRelatedPostsSection(internalLinks) {
  const validLinks = internalLinks.filter((l) => l && l.url && l.anchorText);
  if (!validLinks.length) return '';

  const items = validLinks
    .map((l) => `<li><a href="${escapeAttr(l.url)}">${escapeHtml(l.anchorText)}</a></li>`)
    .join('\n');

  return `\n<!-- seo-bot-related-posts -->\n<h3>Related Posts</h3>\n<ul>\n${items}\n</ul>\n`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

module.exports = { writeSeoMeta };
