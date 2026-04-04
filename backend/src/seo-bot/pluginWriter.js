'use strict';

const axios = require('axios');
const logger = require('./logger');

function buildAuthHeader(wpUsername, wpAppPassword) {
  return 'Basic ' + Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');
}

async function wpRequest({ siteUrl, wpUsername, wpAppPassword, method, endpoint, data }) {
  const url = `${siteUrl}/wp-json/wp/v2${endpoint}`;
  const response = await axios({
    method,
    url,
    data: method !== 'GET' ? data : undefined,
    params: method === 'GET' ? data : undefined,
    headers: {
      Authorization: buildAuthHeader(wpUsername, wpAppPassword),
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  return response.data;
}

async function writeSeoMeta(creds, postId, postType, seoPlugin, seoData) {
  const { focusKeyword, metaTitle, metaDescription, internalLinks, rewrittenContent } = seoData;
  const endpoint = `/${postType === 'page' ? 'pages' : 'posts'}/${postId}`;
  const updateData = {};

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
    updateData.excerpt = metaDescription;
  }

  if (rewrittenContent) {
    updateData.content = rewrittenContent;
    updateData.status = 'draft';
  } else if (internalLinks && internalLinks.length > 0) {
    try {
      const currentPost = await wpRequest({ ...creds, method: 'GET', endpoint: `${endpoint}?context=edit` });
      const currentContent = typeof currentPost.content === 'object'
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
      logger.warn('pluginWriter: could not fetch post for internal links', { postId, err: err.message });
    }
  }

  if (Object.keys(updateData).length === 0) return null;

  return wpRequest({ ...creds, method: 'POST', endpoint, data: updateData });
}

function buildRelatedPostsSection(internalLinks) {
  const valid = internalLinks.filter((l) => l && l.url && l.anchorText);
  if (!valid.length) return '';
  const items = valid.map((l) =>
    `<li><a href="${l.url.replace(/"/g, '&quot;')}">${String(l.anchorText).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></li>`
  ).join('\n');
  return `\n<!-- seo-bot-related-posts -->\n<h3>Related Posts</h3>\n<ul>\n${items}\n</ul>\n`;
}

module.exports = { writeSeoMeta, wpRequest };
