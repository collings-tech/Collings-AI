import React, { useEffect, useState, useCallback } from 'react';
import SeoSiteOverviewCard from '../components/SeoDashboard/SeoSiteOverviewCard';
import SeoScoreLineChart from '../components/SeoDashboard/SeoScoreLineChart';
import SeoDistributionDonut from '../components/SeoDashboard/SeoDistributionDonut';
import SeoActivityBarChart from '../components/SeoDashboard/SeoActivityBarChart';
import SeoTopImprovedTable from '../components/SeoDashboard/SeoTopImprovedTable';
import SeoAttentionTable from '../components/SeoDashboard/SeoAttentionTable';
import SeoActivityFeed from '../components/SeoDashboard/SeoActivityFeed';
import GscPanel from '../components/SeoDashboard/GscPanel';
import client from '../api/client';

const DATE_RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export default function SeoDashboardPage({ onBack }) {
  const [activeView, setActiveView] = useState('overview');
  const [selectedSite, setSelectedSite] = useState(null);
  const [dateRange, setDateRange] = useState(30);
  const [overview, setOverview] = useState([]);
  const [trend, setTrend] = useState([]);
  const [distribution, setDistribution] = useState(null);
  const [activity, setActivity] = useState([]);
  const [topImproved, setTopImproved] = useState([]);
  const [attention, setAttention] = useState([]);
  const [feedLogs, setFeedLogs] = useState([]);

  const [loading, setLoading] = useState({
    overview: false, trend: false, distribution: false,
    activity: false, topImproved: false, attention: false, feed: false,
  });
  const setL = (key, val) => setLoading((p) => ({ ...p, [key]: val }));

  const loadOverview = useCallback(async () => {
    setL('overview', true);
    try {
      const res = await client.get('/seo/dashboard/overview');
      setOverview(res.data.overview || []);
    } catch { /* non-critical */ } finally {
      setL('overview', false);
    }
  }, []);

  const loadSiteData = useCallback(async (siteId, days) => {
    setL('trend', true); setL('distribution', true); setL('activity', true);
    setL('topImproved', true); setL('attention', true); setL('feed', true);

    const [trendRes, distRes, actRes, topRes, attRes, feedRes] = await Promise.allSettled([
      client.get(`/seo/dashboard/${siteId}/score-trend`, { params: { days } }),
      client.get(`/seo/dashboard/${siteId}/distribution`),
      client.get(`/seo/dashboard/${siteId}/activity`, { params: { days } }),
      client.get(`/seo/dashboard/${siteId}/top-improved`),
      client.get(`/seo/dashboard/${siteId}/attention`),
      client.get(`/seo/logs/${siteId}`, { params: { limit: 10 } }),
    ]);

    if (trendRes.status === 'fulfilled') setTrend(trendRes.value.data.trend || []);
    if (distRes.status === 'fulfilled') setDistribution(distRes.value.data.distribution || null);
    if (actRes.status === 'fulfilled') setActivity(actRes.value.data.activity || []);
    if (topRes.status === 'fulfilled') setTopImproved(topRes.value.data.posts || []);
    if (attRes.status === 'fulfilled') setAttention(attRes.value.data.posts || []);
    if (feedRes.status === 'fulfilled') setFeedLogs(feedRes.value.data.logs || feedRes.value.data || []);

    setL('trend', false); setL('distribution', false); setL('activity', false);
    setL('topImproved', false); setL('attention', false); setL('feed', false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (selectedSite) loadSiteData(selectedSite.siteId, dateRange);
  }, [selectedSite, dateRange, loadSiteData]);

  const handleSelectSite = (site) => {
    setSelectedSite(site);
    setActiveView('site-detail');
  };

  const handleRefresh = () => {
    if (activeView === 'overview') loadOverview();
    else if (selectedSite) loadSiteData(selectedSite.siteId, dateRange);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800/80 backdrop-blur-md border-b border-gray-700 px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={activeView === 'overview' ? onBack : () => setActiveView('overview')}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {activeView === 'overview' ? 'Dashboard' : 'All Sites'}
          </button>
          <span className="text-gray-600">/</span>
          <h1 className="text-white font-bold text-lg">
            {activeView === 'overview' ? 'SEO Reports' : selectedSite?.siteLabel || 'Site Detail'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {activeView === 'site-detail' && (
            <div className="flex bg-gray-900 rounded-xl border border-gray-700 p-0.5 gap-0.5">
              {DATE_RANGES.map(({ label, days }) => (
                <button
                  key={label}
                  onClick={() => setDateRange(days)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dateRange === days ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-all text-sm border border-transparent hover:border-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {activeView === 'overview' ? (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">SEO Overview</h2>
              <p className="text-gray-400 text-sm mt-0.5">{overview.length} {overview.length === 1 ? 'site' : 'sites'} monitored</p>
            </div>

            {loading.overview ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => <div key={i} className="bg-gray-800 border border-gray-700 rounded-2xl p-5 animate-pulse h-40" />)}
              </div>
            ) : overview.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <p className="text-gray-500 text-sm max-w-sm">No SEO data yet. The bot will start generating reports once it has processed your first posts.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {overview.map((site) => (
                  <SeoSiteOverviewCard key={site.siteId} site={site} onClick={() => handleSelectSite(site)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold text-white">{selectedSite?.siteLabel}</h2>
              <p className="text-gray-500 text-sm">{selectedSite?.siteUrl}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <SeoScoreLineChart data={trend} loading={loading.trend} />
              </div>
              <SeoDistributionDonut data={distribution} loading={loading.distribution} />
            </div>

            <SeoActivityBarChart data={activity} loading={loading.activity} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <SeoTopImprovedTable posts={topImproved} loading={loading.topImproved} />
              <SeoAttentionTable posts={attention} siteId={selectedSite?.siteId} loading={loading.attention} />
            </div>

            <SeoActivityFeed logs={feedLogs} loading={loading.feed} />

            <GscPanel siteId={selectedSite?.siteId} />
          </div>
        )}
      </main>
    </div>
  );
}
