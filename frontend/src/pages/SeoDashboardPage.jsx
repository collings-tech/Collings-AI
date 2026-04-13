import React, { useEffect, useState, useCallback } from 'react';
import SeoSiteOverviewCard from '../components/SeoDashboard/SeoSiteOverviewCard';
import SeoScoreLineChart from '../components/SeoDashboard/SeoScoreLineChart';
import SeoDistributionDonut from '../components/SeoDashboard/SeoDistributionDonut';
import SeoActivityBarChart from '../components/SeoDashboard/SeoActivityBarChart';
import SeoTopImprovedTable from '../components/SeoDashboard/SeoTopImprovedTable';
import SeoAttentionTable from '../components/SeoDashboard/SeoAttentionTable';
import SeoActivityFeed from '../components/SeoDashboard/SeoActivityFeed';
import GscPanel from '../components/SeoDashboard/GscPanel';
import GaPanel from '../components/SeoDashboard/GaPanel';
import client from '../api/client';

const DATE_RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

const DETAIL_TABS = [
  { key: 'performance', label: 'Performance', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
  { key: 'search-console', label: 'Search Console', icon: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z' },
  { key: 'analytics', label: 'Analytics', icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941' },
];

function scoreAccent(score) {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl px-5 py-4">
      <p className="text-gray-500 text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className={`text-2xl font-bold mt-1 leading-tight ${accent || 'text-white'}`}>
        {value ?? '—'}
      </p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function SeoDashboardPage({ onBack }) {
  const [activeView, setActiveView] = useState('overview');
  const [detailTab, setDetailTab] = useState('performance');
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
    setDetailTab('performance');
    setActiveView('site-detail');
  };

  const handleRefresh = () => {
    if (activeView === 'overview') loadOverview();
    else if (selectedSite) loadSiteData(selectedSite.siteId, dateRange);
  };

  const attentionCount = attention.length || selectedSite?.attentionCount || 0;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900/80 backdrop-blur-xl border-b border-gray-800/80 px-6 py-3.5 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={activeView === 'overview' ? onBack : () => setActiveView('overview')}
              className="flex items-center justify-center w-8 h-8 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
              title={activeView === 'overview' ? 'Back to Dashboard' : 'All Sites'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="h-5 w-px bg-gray-800" />
            <div>
              <h1 className="text-white font-semibold text-base leading-tight">
                {activeView === 'overview' ? 'SEO Reports' : selectedSite?.siteLabel || 'Site Detail'}
              </h1>
              {activeView === 'site-detail' && selectedSite?.siteUrl && (
                <p className="text-gray-600 text-xs">{selectedSite.siteUrl}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeView === 'site-detail' && detailTab === 'performance' && (
              <div className="flex bg-gray-800/80 rounded-lg border border-gray-700/50 p-0.5">
                {DATE_RANGES.map(({ label, days }) => (
                  <button
                    key={days}
                    onClick={() => setDateRange(days)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      dateRange === days
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-all text-sm border border-gray-700/50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">
        {activeView === 'overview' ? (
          /* ——— OVERVIEW ——— */
          <div>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-tight">SEO Overview</h2>
              <p className="text-gray-500 text-sm mt-1">
                {overview.length} {overview.length === 1 ? 'site' : 'sites'} monitored
              </p>
            </div>

            {loading.overview ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-2xl animate-pulse h-44" />
                ))}
              </div>
            ) : overview.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700/50 flex items-center justify-center mb-5">
                  <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                  </svg>
                </div>
                <p className="text-gray-300 font-medium mb-1">No SEO data yet</p>
                <p className="text-gray-600 text-sm max-w-sm">
                  Reports will appear here once your first posts have been processed by the SEO bot.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {overview.map((site) => (
                  <SeoSiteOverviewCard key={site.siteId} site={site} onClick={() => handleSelectSite(site)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ——— SITE DETAIL ——— */
          <div className="flex flex-col gap-6">
            {/* Tab navigation */}
            <div className="flex items-center gap-1 bg-gray-800/50 rounded-xl border border-gray-700/40 p-1 w-fit">
              {DETAIL_TABS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setDetailTab(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    detailTab === key
                      ? 'bg-gray-700/80 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                  </svg>
                  {label}
                </button>
              ))}
            </div>

            {/* ——— PERFORMANCE TAB ——— */}
            {detailTab === 'performance' && (
              <div className="flex flex-col gap-6 animate-fadeIn">
                {/* KPI summary */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard
                    label="Avg Score"
                    value={selectedSite?.avgScore != null ? Math.round(selectedSite.avgScore) : null}
                    sub="out of 100"
                    accent={scoreAccent(selectedSite?.avgScore)}
                  />
                  <KpiCard
                    label="Optimized"
                    value={selectedSite?.postsOptimized ?? 0}
                    sub="total posts"
                    accent="text-brand-400"
                  />
                  <KpiCard
                    label="Attention"
                    value={attentionCount}
                    sub={attentionCount === 0 ? 'All healthy' : 'posts flagged'}
                    accent={attentionCount > 0 ? 'text-amber-400' : 'text-green-400'}
                  />
                  <KpiCard
                    label="Activity"
                    value={feedLogs.length}
                    sub="recent entries"
                    accent="text-gray-200"
                  />
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-2">
                    <SeoScoreLineChart data={trend} loading={loading.trend} />
                  </div>
                  <SeoDistributionDonut data={distribution} loading={loading.distribution} />
                </div>

                <SeoActivityBarChart data={activity} loading={loading.activity} />

                {/* Tables */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  <SeoTopImprovedTable posts={topImproved} loading={loading.topImproved} />
                  <SeoAttentionTable posts={attention} siteId={selectedSite?.siteId} loading={loading.attention} />
                </div>

                <SeoActivityFeed logs={feedLogs} loading={loading.feed} />
              </div>
            )}

            {/* ——— SEARCH CONSOLE TAB ——— */}
            {detailTab === 'search-console' && (
              <div className="animate-fadeIn">
                <GscPanel siteId={selectedSite?.siteId} />
              </div>
            )}

            {/* ——— ANALYTICS TAB ——— */}
            {detailTab === 'analytics' && (
              <div className="animate-fadeIn">
                <GaPanel siteId={selectedSite?.siteId} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
