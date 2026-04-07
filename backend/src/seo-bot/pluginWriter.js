'use strict';

const axios = require('axios');

function buildAuthHeader(wpUsername, wpAppPassword) {
  return 'Basic ' + Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');
}

async function wpRequest({ siteUrl, wpUsername, wpAppPassword, method, endpoint, data, _rawUrl }) {
  const url = _rawUrl || `${siteUrl}/wp-json/wp/v2${endpoint}`;
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

// currentPost is the already-fetched post object (passed from scheduler to avoid a duplicate GET)
async function writeSeoMeta(creds, postId, postType, seoPlugin, seoData, currentPost) {
  const { focusKeyword, metaTitle, metaDescription, internalLinks, rewrittenContent } = seoData;
  const endpoint = `/${postType === 'page' ? 'pages' : 'posts'}/${postId}`;
  const updateData = {};

  if (seoPlugin === 'rankmath') {
    // RankMath meta fields are NOT reliably writable via the standard WP REST API.
    // Use RankMath's own REST endpoint instead.
    try {
      await wpRequest({
        ...creds,
        method: 'POST',
        _rawUrl: `${creds.siteUrl}/wp-json/rankmath/v1/updateMeta`,
        data: {
          objectID: postId,
          objectType: 'post',
          rank_math_focus_keyword: focusKeyword,
          rank_math_title: metaTitle,
          rank_math_description: metaDescription,
        },
      });
    } catch (err) {
      // Surface this clearly — if the endpoint doesn't exist, scores will never improve
      throw new Error(`RankMath updateMeta failed for post ${postId}: ${err.response?.status} ${err.response?.data?.message || err.message}`);
    }
  } else if (seoPlugin === 'yoast') {
    updateData.meta = {
      _yoast_wpseo_focuskw: focusKeyword,
      _yoast_wpseo_title: metaTitle,
      _yoast_wpseo_metadesc: metaDescription,
    };
  } else {
    updateData.excerpt = metaDescription;
  }

  if (rewrittenContent || (internalLinks && internalLinks.length > 0)) {
    // Pages are always published after SEO optimization; posts preserve their existing status
    const originalStatus = currentPost?.status || 'draft';
    const preservedStatus = postType === 'page' ? 'publish' : (originalStatus === 'publish' ? 'publish' : 'draft');

    if (rewrittenContent) {
      // Always append related posts section after a rewrite so we don't lose link points
      let finalContent = rewrittenContent;
      if (internalLinks && internalLinks.length > 0 && !finalContent.includes('<!-- seo-bot-related-posts -->')) {
        const relatedSection = buildRelatedPostsSection(internalLinks);
        if (relatedSection) finalContent += relatedSection;
      }
      updateData.content = finalContent;
      updateData.status = preservedStatus;
    } else if (currentPost) {
      const currentContent = typeof currentPost.content === 'object'
        ? currentPost.content.raw || currentPost.content.rendered || ''
        : String(currentPost.content || '');

      if (!currentContent.includes('<!-- seo-bot-related-posts -->')) {
        const relatedSection = buildRelatedPostsSection(internalLinks);
        if (relatedSection) {
          updateData.content = currentContent + relatedSection;
          updateData.status = preservedStatus;
        }
      }
    }
  }

  if (Object.keys(updateData).length === 0) return;

  await wpRequest({ ...creds, method: 'POST', endpoint, data: updateData });
}

function buildRelatedPostsSection(internalLinks) {
  const valid = internalLinks.filter((l) => l && l.url && l.anchorText);
  if (!valid.length) return '';
  const items = valid.map((l) =>
    `<li><a href="${l.url.replace(/"/g, '&quot;')}">${String(l.anchorText).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></li>`
  ).join('\n');
  return `\n<!-- seo-bot-related-posts -->\n<h3>Related Posts</h3>\n<ul>\n${items}\n</ul>\n`;
}

async function fixImageAltText(creds, mediaId, altText) {
  return wpRequest({
    ...creds,
    method: 'POST',
    endpoint: `/media/${mediaId}`,
    data: { alt_text: altText },
  });
}

module.exports = { writeSeoMeta, wpRequest, fixImageAltText };
