const { wpRequest } = require('./wp-api');

async function detectSeoPlugin({ siteUrl, wpUsername, wpAppPassword }) {
  try {
    const plugins = await wpRequest({
      siteUrl,
      wpUsername,
      wpAppPassword,
      method: 'GET',
      endpoint: '/plugins',
    });

    const pluginSlugs = plugins.map((p) => p.plugin || '');

    if (pluginSlugs.some((s) => s.includes('rank-math'))) return 'rankmath';
    if (pluginSlugs.some((s) => s.includes('wordpress-seo'))) return 'yoast';

    return 'none';
  } catch {
    return 'none';
  }
}

module.exports = { detectSeoPlugin };
