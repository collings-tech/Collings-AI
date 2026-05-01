'use strict';

const axios = require('axios');
const logger = require('./logger');

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

// Writes rank_math_seo_score directly to post meta via XML-RPC.
// The WordPress REST API cannot write this field — Rank Math does not register it
// as REST-writable, so all REST meta writes are silently discarded by WordPress.
// XML-RPC writes directly to the DB with no field registration required.
// Rank Math's save_post hook bails early during XML-RPC saves (no $_POST nonce data),
// so the written score is not overwritten by a recalculation.
async function writeRankMathScoreXmlRpc(creds, postId, score) {
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const xmlrpcUrl = `${creds.siteUrl}/xmlrpc.php`;
  const u = esc(creds.wpUsername);
  const p = esc(creds.wpAppPassword);

  // Step 1: fetch the current meta ID for rank_math_seo_score so we UPDATE the existing
  // row rather than ADD a duplicate (XML-RPC add_post_meta creates duplicates).
  const getXml = `<?xml version="1.0" encoding="UTF-8"?><methodCall>
<methodName>wp.getPost</methodName>
<params>
  <param><value><int>1</int></value></param>
  <param><value><string>${u}</string></value></param>
  <param><value><string>${p}</string></value></param>
  <param><value><int>${postId}</int></value></param>
  <param><value><array><data><value><string>custom_fields</string></value></data></array></value></param>
</params></methodCall>`;

  const getResp = await axios.post(xmlrpcUrl, getXml, {
    headers: { 'Content-Type': 'text/xml' },
    timeout: 10000,
  });

  // Parse the meta ID for rank_math_seo_score from the XML response
  let metaId = null;
  const responseXml = String(getResp.data || '');
  const structs = responseXml.split('<struct>');
  for (const block of structs) {
    if (block.includes('rank_math_seo_score')) {
      const m = block.match(/<name>id<\/name>\s*<value>\s*<(?:string|int)>(\d+)<\/(?:string|int)>/);
      if (m) { metaId = m[1]; break; }
    }
  }

  // Step 2: update by ID (update_metadata_by_mid) or add new (add_post_meta) if absent
  logger.info('pluginWriter: XML-RPC score write', { postId, score: Math.round(score), metaId: metaId || 'new' });
  const fieldXml = metaId
    ? `<struct>
        <member><name>id</name><value><string>${metaId}</string></value></member>
        <member><name>key</name><value><string>rank_math_seo_score</string></value></member>
        <member><name>value</name><value><string>${Math.round(score)}</string></value></member>
      </struct>`
    : `<struct>
        <member><name>key</name><value><string>rank_math_seo_score</string></value></member>
        <member><name>value</name><value><string>${Math.round(score)}</string></value></member>
      </struct>`;

  const editXml = `<?xml version="1.0" encoding="UTF-8"?><methodCall>
<methodName>wp.editPost</methodName>
<params>
  <param><value><int>1</int></value></param>
  <param><value><string>${u}</string></value></param>
  <param><value><string>${p}</string></value></param>
  <param><value><int>${postId}</int></value></param>
  <param><value><struct>
    <member>
      <name>custom_fields</name>
      <value><array><data><value>${fieldXml}</value></data></array></value>
    </member>
  </struct></value></param>
</params></methodCall>`;

  await axios.post(xmlrpcUrl, editXml, {
    headers: { 'Content-Type': 'text/xml' },
    timeout: 10000,
  });
}

// currentPost is the already-fetched post object (passed from scheduler to avoid a duplicate GET)
async function writeSeoMeta(creds, postId, postType, seoPlugin, seoData, currentPost, projectedScore) {
  const { focusKeyword, metaTitle, metaDescription, internalLinks, outboundLinks, rewrittenContent } = seoData;
  const endpoint = `/${postType === 'page' ? 'pages' : 'posts'}/${postId}`;
  const updateData = {};

  if (seoPlugin === 'rankmath') {
    // Write SEO metadata via the Rank Math API Manager plugin endpoint.
    // For posts only — pages are not supported by rank-math-api plugin.
    if (postType !== 'page') {
      const formParams = new URLSearchParams();
      formParams.append('post_id', String(postId));
      if (focusKeyword) formParams.append('rank_math_focus_keyword', focusKeyword);
      if (metaTitle) formParams.append('rank_math_title', metaTitle);
      if (metaDescription) formParams.append('rank_math_description', metaDescription);

      try {
        await axios({
          method: 'POST',
          url: `${creds.siteUrl}/wp-json/rank-math-api/v1/update-meta`,
          data: formParams.toString(),
          headers: {
            Authorization: buildAuthHeader(creds.wpUsername, creds.wpAppPassword),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        });
      } catch (err) {
        // rank-math-api plugin not installed or unavailable — fall through to the
        // top-level REST write below, which Rank Math also supports natively.
        logger.warn(`pluginWriter: rank-math-api plugin unavailable for post ${postId} (${err.response?.status || err.message}), falling back to REST top-level write`);
      }
    } else {
      // Pages: use standard WP meta endpoint as fallback
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

    // Trigger save_post so Rank Math processes the updated meta.
    // Include the Rank Math fields at top-level — Rank Math registers them as REST fields
    // (not under meta), so if update_callbacks exist they write + trigger a live recalculation.
    const originalStatus = currentPost?.status || 'publish';
    await wpRequest({
      ...creds, method: 'POST', endpoint,
      data: {
        status: originalStatus,
        rank_math_focus_keyword: focusKeyword,
        rank_math_title: metaTitle,
        rank_math_description: metaDescription,
      },
    });

  } else if (seoPlugin === 'yoast') {
    updateData.meta = {
      _yoast_wpseo_focuskw: focusKeyword,
      _yoast_wpseo_title: metaTitle,
      _yoast_wpseo_metadesc: metaDescription,
    };
  } else {
    updateData.excerpt = metaDescription;
  }

  const hasInternalLinks = internalLinks && internalLinks.length > 0;
  const hasOutboundLinks = outboundLinks && outboundLinks.length > 0;

  if (rewrittenContent || hasInternalLinks || hasOutboundLinks) {
    // Pages are always published after SEO optimization; posts preserve their existing status
    const originalStatus = currentPost?.status || 'draft';
    const preservedStatus = postType === 'page' ? 'publish' : (originalStatus === 'publish' ? 'publish' : 'draft');

    if (rewrittenContent) {
      // Append related posts + further reading after a rewrite so we don't lose link points
      let finalContent = rewrittenContent;
      if (hasInternalLinks && !finalContent.includes('<!-- seo-bot-related-posts -->')) {
        const relatedSection = buildRelatedPostsSection(internalLinks);
        if (relatedSection) finalContent += relatedSection;
      }
      if (hasOutboundLinks && !finalContent.includes('<!-- seo-bot-further-reading -->')) {
        const furtherSection = buildFurtherReadingSection(outboundLinks);
        if (furtherSection) finalContent += furtherSection;
      }
      updateData.content = finalContent;
      updateData.status = preservedStatus;
    } else if (currentPost) {
      const currentContent = typeof currentPost.content === 'object'
        ? currentPost.content.raw || currentPost.content.rendered || ''
        : String(currentPost.content || '');

      let appendedContent = currentContent;

      if (hasInternalLinks && !appendedContent.includes('<!-- seo-bot-related-posts -->')) {
        const relatedSection = buildRelatedPostsSection(internalLinks);
        if (relatedSection) appendedContent += relatedSection;
      }

      if (hasOutboundLinks && !appendedContent.includes('<!-- seo-bot-further-reading -->')) {
        const furtherSection = buildFurtherReadingSection(outboundLinks);
        if (furtherSection) appendedContent += furtherSection;
      }

      if (appendedContent !== currentContent) {
        updateData.content = appendedContent;
        updateData.status = preservedStatus;
      }
    }
  }

  if (Object.keys(updateData).length > 0) {
    await wpRequest({ ...creds, method: 'POST', endpoint, data: updateData });
  }

  // Write the projected Rank Math score LAST — after every save_post trigger — so Rank Math's
  // recalculation cannot overwrite it. XML-RPC writes directly to wp_postmeta, which is where
  // the WP post dashboard reads the score from. REST API writes are silently discarded by Rank Math.
  if (seoPlugin === 'rankmath') {
    try {
      await writeRankMathScoreXmlRpc(creds, postId, projectedScore || 0);
      logger.info('pluginWriter: XML-RPC score write succeeded', { postId, score: Math.round(projectedScore || 0) });
    } catch (xmlRpcErr) {
      logger.warn('pluginWriter: XML-RPC score write failed (WP dashboard score will not update)', {
        postId,
        err: xmlRpcErr.message,
      });
    }
  }
}

function buildRelatedPostsSection(internalLinks) {
  const valid = internalLinks.filter((l) => l && l.url && l.anchorText);
  if (!valid.length) return '';
  const items = valid.map((l) =>
    `<li><a href="${l.url.replace(/"/g, '&quot;')}">${String(l.anchorText).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></li>`
  ).join('\n');
  return `\n<!-- seo-bot-related-posts -->\n<h3>Related Posts</h3>\n<ul>\n${items}\n</ul>\n`;
}

function buildFurtherReadingSection(outboundLinks) {
  const valid = outboundLinks.filter((l) => l && l.url && l.anchorText && /^https?:\/\//i.test(l.url));
  if (!valid.length) return '';
  // Links must be dofollow (no rel="nofollow") so Rank Math counts them as outbound links
  const items = valid.map((l) =>
    `<li><a href="${l.url.replace(/"/g, '&quot;')}" target="_blank">${String(l.anchorText).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></li>`
  ).join('\n');
  return `\n<!-- seo-bot-further-reading -->\n<h3>Further Reading</h3>\n<ul>\n${items}\n</ul>\n`;
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
