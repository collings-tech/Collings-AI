const axios = require('axios');

function enforceDraftStatus(params) {
  if (params && params.status === 'publish') {
    params.status = 'draft';
  }
  return params;
}

async function wpRequest({ siteUrl, wpUsername, wpAppPassword, method, endpoint, data }) {
  const auth = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString('base64');
  const url = `${siteUrl}/wp-json/wp/v2${endpoint}`;

  const response = await axios({
    method,
    url,
    data: method !== 'GET' ? data : undefined,
    params: method === 'GET' ? data : undefined,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
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
