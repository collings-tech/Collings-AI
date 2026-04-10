const axios = require('axios');

function enforceDraftStatus(params) {
  if (params && params.status === 'publish') {
    params.status = 'draft';
  }
  return params;
}

async function wpRequest({ siteUrl, wpUsername, wpAppPassword, method, endpoint, data }) {
  const auth = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');

  // Route custom plugin namespaces directly under /wp-json (skip /wp/v2 prefix)
  const isCustomNamespace = endpoint.startsWith('/rankmath/') || endpoint.startsWith('/rank-math-api/');
  const url = isCustomNamespace
    ? `${siteUrl}/wp-json${endpoint}`
    : `${siteUrl}/wp-json/wp/v2${endpoint}`;

  // Rank Math API Manager requires form-encoded body
  const isRankMathApi = endpoint.startsWith('/rank-math-api/');
  let requestData = method !== 'GET' ? data : undefined;
  let contentType = 'application/json';
  if (isRankMathApi && method !== 'GET' && data) {
    requestData = new URLSearchParams(data).toString();
    contentType = 'application/x-www-form-urlencoded';
  }

  const response = await axios({
    method,
    url,
    data: requestData,
    params: method === 'GET' ? data : undefined,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': contentType,
    },
    timeout: 30000,
  });

  return response.data;
}

async function uploadMedia({ siteUrl, wpUsername, wpAppPassword, buffer, mimeType, filename }) {
  const auth = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');
  const url = `${siteUrl}/wp-json/wp/v2/media`;

  const response = await axios({
    method: 'POST',
    url,
    data: buffer,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    timeout: 30000,
  });

  return response.data;
}

module.exports = { wpRequest, enforceDraftStatus, uploadMedia };
