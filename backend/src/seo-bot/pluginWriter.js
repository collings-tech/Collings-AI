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
async function writeSeoMeta(creds, postId, postType, seoPlugin, seoData, currentPost, projectedScore) {
  const { focusKeyword, metaTitle, metaDescription, internalLinks, rewrittenContent } = seoData;
  const endpoint = `/${postType === 'page' ? 'pages' : 'posts'}/${postId}`;
  const updateData = {};

  if (seoPlugin === 'rankmath') {
    // Use the Rank Math API Manager plugin endpoint (rank-math-api/v2/update-meta).
    // This plugin requires form-encoded body with post_id (flat params, not nested meta object).
    // IMPORTANT: This endpoint only supports posts and products — NOT pages.
    if (postType !== 'page') {
      const formParams = new URLSearchParams();
      formParams.append('post_id', String(postId));
      if (focusKeyword) formParams.append('rank_math_focus_keyword', focusKeyword);
      if (metaTitle) formParams.append('rank_math_title', metaTitle);
      if (metaDescription) formParams.append('rank_math_description', metaDescription);

      try {
        await axios({
          method: 'POST',
          url: `${creds.siteUrl}/wp-json/rank-math-api/v2/update-meta`,
          data: formParams.toString(),
          headers: {
            Authorization: buildAuthHeader(creds.wpUsername, creds.wpAppPassword),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        });
      } catch (err) {
        // Surface clearly — if this endpoint is missing, the plugin may not be installed
        throw new Error(`Rank Math API update failed for post ${postId}: ${err.response?.status} ${err.response?.data?.message || err.message}`);
      }
    } else {
      // Pages are not supported by rank-math-api plugin — fall back to standard WP meta endpoint
      try {
        await wpRequest({
          ...creds,
          method: 'POST',
          endpoint: `/pages/${postId}`,
          data: {
            meta: {
              rank_math_focus_keyword: focusKeyword,
              rank_math_title: metaTitle,
              rank_math_description: metaDescription,
            },
          },
        });
      } catch { /* non-critical for pages */ }
    }

    // Trigger save_post so RankMath recalculates and stores the SEO score.
    // Without this, rank_math_seo_score stays stale until someone manually saves in the editor.
    const originalStatus = currentPost?.status || 'publish';
    await wpRequest({ ...creds, method: 'POST', endpoint, data: { status: originalStatus } });

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
