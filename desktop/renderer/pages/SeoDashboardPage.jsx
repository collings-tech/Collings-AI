import React, { useEffect, useState, useCallback } from 'react';
import SeoSiteOverviewCard from '../components/SeoDashboard/SeoSiteOverviewCard';
import SeoScoreLineChart from '../components/SeoDashboard/SeoScoreLineChart';
import SeoDistributionDonut from '../components/SeoDashboard/SeoDistributionDonut';
import SeoActivityBarChart from '../components/SeoDashboard/SeoActivityBarChart';
import SeoTopImprovedTable from '../components/SeoDashboard/SeoTopImprovedTable';
import SeoAttentionTable from '../components/SeoDashboard/SeoAttentionTable';
import SeoActivityFeed from '../components/SeoDashboard/SeoActivityFeed';

const DATE_RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

export default function SeoDashboardPage({ onBack }) {
  const [activeView, setActiveView] = useState('overview');
  const [siteTab, setSiteTab] = useState('analytics');
  const [selectedSite, setSelectedSite] = useState(null);
  const [dateRange, setDateRange] = useState(30);
  const [overview, setOverview] = useState([]);
  const [trend, setTrend] = useState([]);
  const [distribution, setDistribution] = useState(null);
  const [activity, setActivity] = useState([]);
  const [topImproved, setTopImproved] = useState([]);
  const [attention, setAttention] = useState([]);
  const [feedLogs, setFeedLogs] = useState([]);

  // Settings tab state
  const [config, setConfig] = useState(null);
  const [sweepInterval, setSweepInterval] = useState(5);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState(null);

  const [loading, setLoading] = useState({
    overview: false,
    trend: false,
    distribution: false,
    activity: false,
    topImproved: false,
    attention: false,
    feed: false,
  });

  const setL = (key, val) => setLoading((p) => ({ ...p, [key]: val }));

  const invoke = (channel, args) => window.electronAPI.invoke(channel, args);

  const loadOverview = useCallback(async () => {
    setL('overview', true);
    try {
      const res = await invoke('seo:get-overview');
      if (!res.error) setOverview(res.overview || []);
    } finally {
      setL('overview', false);
    }
  }, []);

  const loadSiteData = useCallback(async (siteId, days) => {
    setL('trend', true);
    setL('distribution', true);
    setL('activity', true);
    setL('topImproved', true);
    setL('attention', true);
    setL('feed', true);

    const [trendRes, distRes, actRes, topRes, attRes, feedRes] = await Promise.allSettled([
      invoke('seo:get-score-trend', { siteId, days }),
      invoke('seo:get-distribution', { siteId }),
      invoke('seo:get-activity', { siteId, days }),
      invoke('seo:get-top-improved', { siteId }),
      invoke('seo:get-attention', { siteId }),
      invoke('seo:get-activity-panel', { siteId }),
    ]);

    if (trendRes.status === 'fulfilled' && !trendRes.value.error) setTrend(trendRes.value.trend || []);
    if (distRes.status === 'fulfilled' && !distRes.value.error) setDistribution(distRes.value.distribution || null);
    if (actRes.status === 'fulfilled' && !actRes.value.error) setActivity(actRes.value.activity || []);
    if (topRes.status === 'fulfilled' && !topRes.value.error) setTopImproved(topRes.value.posts || []);
    if (attRes.status === 'fulfilled' && !attRes.value.error) setAttention(attRes.value.posts || []);
    if (feedRes.status === 'fulfilled' && !feedRes.value.error) setFeedLogs(feedRes.value.logs || []);

    setL('trend', false);
    setL('distribution', false);
    setL('activity', false);
    setL('topImproved', false);
    setL('attention', false);
    setL('feed', false);
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (selectedSite) {
      loadSiteData(selectedSite.siteId, dateRange);
    }
  }, [selectedSite, dateRange, loadSiteData]);

  const loadConfig = useCallback(async (siteId) => {
    const res = await invoke('seo:get-config', { siteId });
    if (!res.error) {
      setConfig(res.config);
      setSweepInterval(res.config.quickSweepIntervalMinutes ?? 5);
    }
  }, []);

  const handleSaveConfig = async () => {
    if (!selectedSite) return;
    setConfigSaving(true);
    setConfigMsg(null);
    const res = await invoke('seo:update-config', { siteId: selectedSite.siteId, quickSweepIntervalMinutes: sweepInterval });
    setConfigSaving(false);
    if (res.error) {
      setConfigMsg({ type: 'error', text: res.error });
    } else {
      setConfig(res.config);
      setConfigMsg({ type: 'success', text: 'Settings saved.' });
      setTimeout(() => setConfigMsg(null), 3000);
    }
  };

  const handleSelectSite = (site) => {
    setSelectedSite(site);
    setSiteTab('analytics');
    setActiveView('site-detail');
    loadConfig(site.siteId);
  };

  const handleRefresh = () => {
    if (activeView === 'overview') {
      loadOverview();
    } else if (selectedSite) {
      loadSiteData(selectedSite.siteId, dateRange);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Top bar */}
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
          {/* Date range selector (only in site detail) */}
          {activeView === 'site-detail' && (
            <div className="flex bg-gray-900 rounded-xl border border-gray-700 p-0.5 gap-0.5">
              {DATE_RANGES.map(({ label, days }) => (
                <button
                  key={label}
                  onClick={() => setDateRange(days)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    dateRange === days
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Refresh */}
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
          /* All Sites Overview */
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">SEO Overview</h2>
              <p className="text-gray-400 text-sm mt-0.5">
                {overview.length} {overview.length === 1 ? 'site' : 'sites'} monitored
              </p>
            </div>

            {loading.overview ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-gray-800 border border-gray-700 rounded-2xl p-5 animate-pulse h-40" />
                ))}
              </div>
            ) : overview.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <p className="text-gray-500 text-sm max-w-sm">
                  No SEO data yet. The bot will start generating reports once it has processed your first posts.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {overview.map((site) => (
                  <SeoSiteOverviewCard
                    key={site.siteId}
                    site={site}
                    onClick={() => handleSelectSite(site)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Per-site Detail */
          <div className="flex flex-col gap-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedSite?.siteLabel}</h2>
                <p className="text-gray-500 text-sm">{selectedSite?.siteUrl}</p>
              </div>
              {/* Tab bar */}
              <div className="flex bg-gray-800 rounded-xl border border-gray-700 p-0.5 gap-0.5">
                {['analytics', 'settings'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSiteTab(tab)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                      siteTab === tab ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {siteTab === 'settings' ? (
              /* ── Settings panel ── */
              <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-lg">
                <h3 className="text-white font-semibold text-sm mb-1">Quick Sweep Interval</h3>
                <p className="text-gray-400 text-xs mb-5">
                  How often the bot scans this site for posts that need SEO work. Min 5 min · Max 3 hrs.
                </p>

                <div className="flex items-center gap-4 mb-2">
                  <input
                    type="range"
                    min={5}
                    max={180}
                    step={5}
                    value={sweepInterval}
                    onChange={(e) => setSweepInterval(Number(e.target.value))}
                    className="flex-1 accent-brand-500"
                  />
                  <div className="flex items-center gap-1 w-28">
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={sweepInterval}
                      onChange={(e) => {
                        const v = Math.max(5, Math.min(180, Number(e.target.value)));
                        setSweepInterval(v);
                      }}
                      className="w-16 bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-brand-500"
                    />
                    <span className="text-gray-400 text-xs">min</span>
                  </div>
                </div>

                <p className="text-gray-500 text-xs mb-5">
                  {sweepInterval < 60
                    ? `Every ${sweepInterval} minutes`
                    : sweepInterval === 60
                    ? 'Every hour'
                    : `Every ${(sweepInterval / 60).toFixed(1).replace('.0', '')} hours`}
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveConfig}
                    disabled={configSaving}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {configSaving ? 'Saving…' : 'Save'}
                  </button>
                  {configMsg && (
                    <span className={`text-xs ${configMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                      {configMsg.text}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <>
            {/* Top row: line chart + donut */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <SeoScoreLineChart data={trend} loading={loading.trend} />
              </div>
              <SeoDistributionDonut data={distribution} loading={loading.distribution} />
            </div>

            {/* Activity bar chart */}
            <SeoActivityBarChart data={activity} loading={loading.activity} />

            {/* Top improved + attention */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <SeoTopImprovedTable posts={topImproved} loading={loading.topImproved} />
              <SeoAttentionTable
                posts={attention}
                siteId={selectedSite?.siteId}
                loading={loading.attention}
              />
            </div>

            {/* Activity feed */}
            <SeoActivityFeed logs={feedLogs} loading={loading.feed} />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
