import React, { useEffect, useState, useCallback } from 'react';
import useAppStore from '../store/appStore';
import SiteCard from '../components/SiteCard';
import AddSiteModal from '../components/AddSiteModal';
import ThemeToggle from '../components/ThemeToggle';
import AuditTrailTab from '../components/AuditTrailTab';
import client from '../api/client';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )},
  { id: 'seo-reports', label: 'SEO Reports', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )},
  { id: 'how-it-works', label: 'How It Works', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )},
  { id: 'settings', label: 'Settings', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )},
  { id: 'audit-trail', label: 'Audit Trail', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )},
];

export default function DashboardPage({ onSelectSite, onLogout, onSeoReports }) {
  const { user, setUser, sites, setSites, setActiveSite, logout, theme } = useAppStore();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seoData, setSeoData] = useState({});

  useEffect(() => { loadSites(); }, []);

  const loadSites = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/sites');
      const loaded = Array.isArray(res.data) ? res.data : [];
      setSites(loaded);
      loadSeoData(loaded);
    } catch (err) {
      setError(err.message || 'Failed to load sites.');
    } finally {
      setLoading(false);
    }
  };

  const loadSeoData = useCallback(async (loadedSites) => {
    if (!loadedSites || loadedSites.length === 0) return;
    try {
      const overviewRes = await client.get('/seo/dashboard/overview');
      const overview = overviewRes.data.overview || [];

      const [trendResults, attentionResults] = await Promise.all([
        Promise.allSettled(
          loadedSites.map((site) =>
            client.get(`/seo/dashboard/${site._id || site.id}/score-trend`, { params: { days: 7 } })
          )
        ),
        Promise.allSettled(
          loadedSites.map((site) =>
            client.get(`/seo/dashboard/${site._id || site.id}/attention`)
          )
        ),
      ]);

      const map = {};
      loadedSites.forEach((site, idx) => {
        const siteId = String(site._id || site.id);
        const ovItem = overview.find((o) => String(o.siteId) === siteId) || {};
        const trend = trendResults[idx].status === 'fulfilled' ? trendResults[idx].value.data.trend || [] : [];
        const attentionPosts = attentionResults[idx].status === 'fulfilled' ? attentionResults[idx].value.data.posts || [] : [];
        map[siteId] = {
          avgScore: ovItem.avgScore ?? null,
          postsOptimized: ovItem.postsOptimized ?? 0,
          attentionCount: ovItem.attentionCount ?? 0,
          lastBotRun: ovItem.lastBotRun || null,
          pendingJobs: ovItem.pendingJobs ?? 0,
          failedJobs: ovItem.failedJobs ?? 0,
          trend,
          attentionPosts,
        };
      });
      setSeoData(map);
    } catch { /* non-critical */ }
  }, []);

  const handleSelectSite = (site) => { setActiveSite(site); onSelectSite(site); };

  const handleSiteAdded = (newSite) => {
    const updated = [...sites, newSite];
    setSites(updated);
    setShowAddModal(false);
    loadSeoData(updated);
  };

  const handleDeleteSite = async (id) => {
    try {
      await client.delete(`/sites/${id}`);
      setSites(sites.filter((s) => (s.id || s._id) !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete site.');
    }
  };

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = async () => {
    try { await client.post('/auth/logout', {}); } catch { /* ignore */ }
    logout();
    onLogout();
  };

  const displayName = user?.name || user?.email || 'User';
  const initials = displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const totalOptimized = Object.values(seoData).reduce((s, d) => s + (d.postsOptimized || 0), 0);
  const totalAttention = Object.values(seoData).reduce((s, d) => s + (d.attentionCount || 0), 0);
  const hasSeoData = Object.keys(seoData).length > 0;

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>

      {/* Top bar */}
      <header className={`backdrop-blur-md border-b px-6 py-3.5 flex items-center justify-between sticky top-0 z-10 ${isDark ? 'bg-gray-800/80 border-gray-700' : 'bg-white/90 border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <img src={isDark ? '/collings-logo-white.png' : '/collings-logo-1.png'} alt="Collings AI" className="h-7 w-auto" />
        </div>

        <div className="flex items-center gap-3">
          {hasSeoData && (
            <button
              onClick={onSeoReports}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-700/60 rounded-xl border border-gray-600/50 text-xs hover:border-brand-500/50 transition-all cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-gray-300">SEO Bot active</span>
              {totalAttention > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-md font-semibold">
                  {totalAttention} need attention
                </span>
              )}
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
              {initials}
            </div>
            <span className={`text-sm hidden sm:block ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{displayName}</span>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all text-sm border border-transparent ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700 hover:border-gray-600' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100 hover:border-gray-300'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:block">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className={`border-b px-6 ${isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex gap-1 max-w-6xl mx-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => tab.id === 'seo-reports' ? onSeoReports() : setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-all duration-150 ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-500'
                  : isDark
                  ? 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-500'
                  : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-400'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Your Sites</h2>
                <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {sites.length} {sites.length === 1 ? 'site' : 'sites'} connected
                  {hasSeoData && totalOptimized > 0 && (
                    <span className="ml-2 text-emerald-400">· {totalOptimized} posts optimized this month</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand-900/40 text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add New Site
              </button>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-xl px-4 py-3 text-sm mb-6">
                {error}
                <button onClick={loadSites} className="ml-3 underline hover:no-underline">Retry</button>
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-gray-800 border border-gray-700 rounded-2xl p-5 animate-pulse">
                    <div className="w-10 h-10 bg-gray-700 rounded-xl mb-3" />
                    <div className="h-4 bg-gray-700 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-700 rounded w-1/2 mb-4" />
                    <div className="h-16 bg-gray-700 rounded mb-3" />
                    <div className="h-3 bg-gray-700 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : sites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 bg-gray-800 border border-gray-700 rounded-3xl flex items-center justify-center mb-5 shadow-xl">
                  <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-300 mb-2">No sites yet</h3>
                <p className="text-gray-500 text-sm max-w-sm mb-6">Connect your first WordPress site to start managing it with AI.</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand-900/40"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Your First Site
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sites.map((site) => {
                  const siteId = String(site._id || site.id);
                  return (
                    <SiteCard
                      key={siteId}
                      site={site}
                      seoStats={seoData[siteId] || null}
                      onSelect={handleSelectSite}
                      onDelete={handleDeleteSite}
                      siteId={siteId}
                    />
                  );
                })}
                <button
                  onClick={() => setShowAddModal(true)}
                  className="group bg-gray-800/50 border-2 border-dashed border-gray-700 hover:border-brand-500 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 transition-all duration-200 cursor-pointer min-h-[160px] hover:bg-gray-800"
                >
                  <div className="w-10 h-10 bg-gray-700 group-hover:bg-brand-900/60 rounded-xl flex items-center justify-center transition-colors">
                    <svg className="w-5 h-5 text-gray-500 group-hover:text-brand-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-gray-500 group-hover:text-brand-400 text-sm font-medium transition-colors">Add New Site</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* HOW IT WORKS TAB */}
        {activeTab === 'how-it-works' && <HowItWorksTab />}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && <SettingsTab user={user} setUser={setUser} />}

        {/* AUDIT TRAIL TAB */}
        {activeTab === 'audit-trail' && <AuditTrailTab />}
      </main>

      {showAddModal && (
        <AddSiteModal onClose={() => setShowAddModal(false)} onSave={handleSiteAdded} />
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-sm mx-4 rounded-2xl border p-6 shadow-2xl ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h3 className={`text-base font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Sign out?</h3>
            <p className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>You'll need to sign in again to access your account.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// How It Works Tab — helpers
// ---------------------------------------------------------------------------

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-white font-bold text-base mb-4">{title}</h3>
      {children}
    </section>
  );
}

function InfoCard({ number, title, children }) {
  return (
    <div className="flex gap-4 py-5 border-b border-gray-700 last:border-0">
      <div className="flex-shrink-0 w-8 h-8 bg-brand-900/70 border border-brand-700/40 rounded-xl flex items-center justify-center text-brand-400 font-bold text-sm">
        {number}
      </div>
      <div>
        <h4 className="text-white font-semibold text-sm mb-1">{title}</h4>
        <div className="text-gray-400 text-sm leading-relaxed space-y-1">{children}</div>
      </div>
    </div>
  );
}

function CollingAIFlowAnim() {
  const [active, setActive] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % 4), 2400);
    return () => clearInterval(id);
  }, []);
  const STEPS = [
    { color: '#6366f1', label: 'Your Message', sub: 'Plain English', desc: 'Type any instruction — write a post, edit a page, update a meta description.', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> },
    { color: '#a855f7', label: 'Claude AI', sub: 'Thinks & plans', desc: 'Claude reads your message, reasons through the best approach, and decides which WordPress REST API calls to make.', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
    { color: '#3b82f6', label: 'WordPress API', sub: 'Action executed', desc: 'The WordPress REST API receives the call and creates, updates, or retrieves your content instantly.', icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg> },
    { color: '#22c55e', label: 'Draft Saved', sub: 'Safe & ready', desc: "Content lands as a draft in WordPress. Review it in your dashboard and publish whenever you're ready.", icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  ];
  return (
    <div className="rounded-2xl border border-gray-700/50 overflow-hidden mb-4" style={{ background: 'rgba(17,24,39,0.6)' }}>
      <style>{`@keyframes packetMove{from{left:0%}to{left:100%}}@keyframes nodePulse{0%,100%{box-shadow:0 0 0 0 var(--nc)}50%{box-shadow:0 0 18px 4px var(--nc)}}`}</style>
      <div className="flex items-start p-5 gap-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-2 flex-1" style={{ opacity: active === i ? 1 : 0.32, transition: 'opacity 0.5s' }}>
              <div style={{ width:52,height:52,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',background:active===i?`${s.color}20`:'#1f2937',border:`1.5px solid ${active===i?s.color:'#374151'}`,color:active===i?s.color:'#4b5563',transform:active===i?'scale(1.12)':'scale(1)',transition:'all 0.45s ease','--nc':`${s.color}55`,animation:active===i?'nodePulse 1.6s ease-in-out infinite':'none' }}>{s.icon}</div>
              <p style={{ fontSize:11,fontWeight:700,color:active===i?'#f9fafb':'#6b7280',textAlign:'center',transition:'color 0.4s' }}>{s.label}</p>
              <p style={{ fontSize:10,color:'#4b5563',textAlign:'center' }}>{s.sub}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ display:'flex',alignItems:'center',marginTop:16,flexShrink:0,width:28,position:'relative' }}>
                <div style={{ flex:1,height:2,background:'#1f2937',borderRadius:4,overflow:'hidden',position:'relative' }}>
                  <div style={{ position:'absolute',inset:0,borderRadius:4,background:s.color,transform:`scaleX(${active>i?1:0})`,transformOrigin:'left',transition:'transform 0.5s ease' }} />
                  {active===i && <div style={{ position:'absolute',top:'50%',transform:'translateY(-50%)',width:6,height:6,borderRadius:'50%',background:s.color,animation:'packetMove 2.4s linear forwards' }} />}
                </div>
                <svg width="6" height="10" viewBox="0 0 6 10" style={{ flexShrink:0,marginLeft:1 }}><path d="M0 0 L6 5 L0 10 Z" fill={active>i?s.color:'#374151'} style={{ transition:'fill 0.5s' }} /></svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div style={{ padding:'8px 20px 12px',borderTop:'1px solid #1f293766',background:'#0f172a66' }}>
        <p style={{ fontSize:11.5,color:'#9ca3af',textAlign:'center',minHeight:16 }}>{STEPS[active].desc}</p>
      </div>
    </div>
  );
}

function SEOBotFlowAnim() {
  const [active, setActive] = React.useState(0);
  const [displayScore, setDisplayScore] = React.useState(28);
  const BEFORE_SCORE = 28, AFTER_SCORE = 86;
  React.useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % 5), 2200);
    return () => clearInterval(id);
  }, []);
  React.useEffect(() => {
    if (active === 4) {
      let v = BEFORE_SCORE;
      const t = setInterval(() => { v += 4; if (v >= AFTER_SCORE) { setDisplayScore(AFTER_SCORE); clearInterval(t); } else setDisplayScore(v); }, 40);
      return () => clearInterval(t);
    }
    if (active === 0) setDisplayScore(BEFORE_SCORE);
  }, [active]);
  const STEPS = [
    { color:'#6366f1', label:'Nightly Sweep', sub:'2:00 AM daily', desc:'The SEO Bot scans every published post and page across all your connected sites.', icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
    { color:'#ef4444', label:'Score: 28', sub:'Critical', desc:"A post is found with a critical SEO score of 28. It's missing a focus keyword, meta title, and internal links.", icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> },
    { color:'#f59e0b', label:'Job Queued', sub:'Priority 2 — medium', desc:'The post is added to the SEO job queue at medium priority. It will be processed in the next 30-minute cycle.', icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
    { color:'#a855f7', label:'Claude Optimizes', sub:'AI writes metadata', desc:'Claude generates a focus keyword, meta title (50–60 chars), meta description (140–160 chars), and suggests internal links.', icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
    { color:'#22c55e', label:'Score: 86 ✓', sub:'Good — complete', desc:'The post is re-scored after optimisation. Score jumped from 28 → 86. The job is marked complete.', icon:<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  ];
  const r = 18, circ = 2 * Math.PI * r;
  const ringColor = displayScore >= 80 ? '#22c55e' : displayScore >= 60 ? '#f59e0b' : displayScore >= 40 ? '#f97316' : '#ef4444';
  const dash = (Math.min(displayScore, 100) / 100) * circ;
  return (
    <div className="rounded-2xl border border-gray-700/50 overflow-hidden mb-4" style={{ background:'rgba(17,24,39,0.6)' }}>
      <style>{`@keyframes seoPacket{from{left:0%}to{left:100%}}@keyframes seoNodePulse{0%,100%{box-shadow:0 0 0 0 var(--sc)}50%{box-shadow:0 0 18px 4px var(--sc)}}`}</style>
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <p style={{ fontSize:11,color:'#6b7280',fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase' }}>Live SEO Score</p>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform:'rotate(-90deg)' }}>
            <circle cx="22" cy="22" r={r} fill="none" stroke="#1f2937" strokeWidth="4" />
            <circle cx="22" cy="22" r={r} fill="none" stroke={ringColor} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} style={{ transition:'stroke-dasharray 0.2s,stroke 0.4s' }} />
          </svg>
          <div><p style={{ fontSize:20,fontWeight:800,color:ringColor,lineHeight:1,transition:'color 0.4s' }}>{displayScore}</p><p style={{ fontSize:10,color:'#4b5563' }}>/ 100</p></div>
        </div>
      </div>
      <div className="flex items-start px-5 pb-4 gap-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-2 flex-1" style={{ opacity:active===i?1:0.3,transition:'opacity 0.5s' }}>
              <div style={{ width:46,height:46,borderRadius:13,display:'flex',alignItems:'center',justifyContent:'center',background:active===i?`${s.color}20`:'#1f2937',border:`1.5px solid ${active===i?s.color:'#374151'}`,color:active===i?s.color:'#4b5563',transform:active===i?'scale(1.1)':'scale(1)',transition:'all 0.4s ease','--sc':`${s.color}55`,animation:active===i?'seoNodePulse 1.6s ease-in-out infinite':'none' }}>{s.icon}</div>
              <p style={{ fontSize:10,fontWeight:700,color:active===i?'#f9fafb':'#6b7280',textAlign:'center',transition:'color 0.4s',lineHeight:1.3 }}>{s.label}</p>
              <p style={{ fontSize:9.5,color:active===i?s.color:'#374151',textAlign:'center',lineHeight:1.3,transition:'color 0.4s' }}>{s.sub}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ display:'flex',alignItems:'center',marginTop:14,flexShrink:0,width:20,position:'relative' }}>
                <div style={{ flex:1,height:2,background:'#1f2937',borderRadius:4,overflow:'hidden',position:'relative' }}>
                  <div style={{ position:'absolute',inset:0,borderRadius:4,background:s.color,transform:`scaleX(${active>i?1:0})`,transformOrigin:'left',transition:'transform 0.5s ease' }} />
                  {active===i && <div style={{ position:'absolute',top:'50%',transform:'translateY(-50%)',width:6,height:6,borderRadius:'50%',background:s.color,animation:'seoPacket 2.2s linear forwards' }} />}
                </div>
                <svg width="5" height="9" viewBox="0 0 5 9" style={{ flexShrink:0,marginLeft:1 }}><path d="M0 0 L5 4.5 L0 9 Z" fill={active>i?s.color:'#374151'} style={{ transition:'fill 0.5s' }} /></svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div style={{ padding:'8px 20px 12px',borderTop:'1px solid #1f293766',background:'#0f172a66' }}>
        <p style={{ fontSize:11.5,color:'#9ca3af',textAlign:'center',minHeight:16 }}>{STEPS[active].desc}</p>
      </div>
    </div>
  );
}

function HowItWorksTab() {
  return (
    <div className="max-w-3xl mx-auto space-y-10 pb-8">

      <Section title="1. How Collings AI Works">
        <CollingAIFlowAnim />
        <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-6 space-y-1">
          <InfoCard number="1" title="You type a plain-English instruction">
            <p>No buttons or forms — just type what you want: <em className="text-gray-300">"Write a 500-word post about kitchen renovation tips"</em> or <em className="text-gray-300">"Update the homepage meta description"</em>.</p>
          </InfoCard>
          <InfoCard number="2" title="Claude AI interprets and plans the action">
            <p>The Claude AI model reads your message, decides which WordPress REST API calls are needed, and executes them — creating, editing, or retrieving content on your site.</p>
          </InfoCard>
          <InfoCard number="3" title="Everything is saved as a draft">
            <p>Any post or page Claude creates or edits is saved as a <strong className="text-white">draft</strong>. Nothing publishes automatically — you stay in full control from your WordPress dashboard.</p>
          </InfoCard>
          <InfoCard number="4" title="Deletions are blocked in chat">
            <p>For safety, Collings AI will never delete posts, pages, or any content from the chat interface. All deletions must be done from your WordPress dashboard directly.</p>
          </InfoCard>
        </div>
      </Section>

      <Section title="2. How to Add a Site">
        <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-6 space-y-1">
          <InfoCard number="1" title='Click "Add New Site" on the Dashboard'>
            <p>You'll find the button in the top-right corner of the Dashboard tab.</p>
          </InfoCard>
          <InfoCard number="2" title="Enter your WordPress site details">
            <p>You need three things:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-gray-400">
              <li><strong className="text-gray-300">Site URL</strong> — e.g. <code className="text-brand-300 bg-gray-700 px-1 rounded text-xs">https://yoursite.com</code></li>
              <li><strong className="text-gray-300">Username</strong> — your WordPress admin username</li>
              <li><strong className="text-gray-300">Application Password</strong> — generated in WordPress under <em>Users → Profile → Application Passwords</em></li>
            </ul>
          </InfoCard>
          <InfoCard number="3" title="Collings AI tests the connection instantly">
            <p>It makes a test call to your WordPress REST API. If successful, the site card appears on your Dashboard and you can start chatting immediately.</p>
          </InfoCard>
        </div>

        <div className="mt-4 bg-red-900/10 border border-red-700/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div>
              <p className="text-red-300 font-semibold text-sm mb-1">Each WordPress site can only be connected to one account</p>
              <p className="text-gray-400 text-sm leading-relaxed">Once a site URL is added to a Collings AI account, no other user can add the same site. This is enforced at the database level and cannot be bypassed.</p>
            </div>
          </div>
          <div className="border-t border-red-700/20" />
          <div>
            <p className="text-gray-300 text-xs font-semibold uppercase tracking-wide mb-2">Why this rule exists</p>
            <ul className="space-y-1.5">
              {[
                'Two users managing the same site would queue duplicate SEO jobs — the same post gets optimised twice per cycle, wasting API credits.',
                "If both users have different SEO plugin settings (e.g. one uses Rank Math, the other Yoast), the bots would overwrite each other's metadata every cycle.",
                'Simultaneous chat actions from two users could issue conflicting WordPress API calls to the same post at the same time.',
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-2.5 text-gray-400 text-xs leading-relaxed">
                  <span className="text-amber-400 flex-shrink-0 mt-0.5">—</span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-red-700/20" />
          <p className="text-gray-400 text-xs leading-relaxed">
            <strong className="text-gray-300">Team access:</strong> Share a single Collings AI account with your team rather than creating separate accounts for the same site. One account, one site, one SEO Bot — everything stays in sync.
          </p>
        </div>
      </Section>

      <Section title="3. Tutorial: Using the Full System">
        <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-6 space-y-1">
          <InfoCard number="1" title="Create content by chatting">
            <p>Select a site card, then type your instruction. Examples:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-gray-400">
              <li><em className="text-gray-300">"Write a blog post about 5 tips for faster WordPress sites"</em></li>
              <li><em className="text-gray-300">"Create a new page called About Us with a short intro"</em></li>
              <li><em className="text-gray-300">"Edit post 42 and add a call-to-action at the end"</em></li>
            </ul>
          </InfoCard>
          <InfoCard number="2" title="Schedule posts naturally">
            <p>Include scheduling in your message: <em className="text-gray-300">"Publish this next Monday at 9am"</em>. Claude converts your local time to UTC and sets the WordPress scheduled status.</p>
          </InfoCard>
          <InfoCard number="3" title="Upload images in chat">
            <p>Drag and drop or paste an image into the chat input. Claude uploads it to your WordPress media library and can attach it to any post you specify.</p>
          </InfoCard>
          <InfoCard number="4" title="Review and publish from WordPress">
            <p>All content Claude creates lands as a draft. Log into your WordPress dashboard, review the post, make any final edits, and hit Publish when you're happy.</p>
          </InfoCard>
          <InfoCard number="5" title="Monitor SEO progress on the Dashboard">
            <p>Each site card shows the average SEO score, a 7-day trend sparkline, how many posts have been optimised, and how many need attention. The SEO Bot handles improvements automatically in the background.</p>
          </InfoCard>
        </div>
      </Section>

      <Section title="4. How the SEO AI Works">
        <SEOBotFlowAnim />
        <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-6 space-y-1">
          <InfoCard number="1" title="Every post gets an SEO score (0–100)">
            <p>The SEO Bot scores each post across 9 checks: keyword in title, meta description, first paragraph, title length, description length, keyword density, internal links, H2 headings, and word count.</p>
          </InfoCard>
          <InfoCard number="2" title="Low-scoring posts are queued for optimisation">
            <p>Posts scoring below 80 are added to a job queue. Posts under 60 are treated as high priority and processed first.</p>
          </InfoCard>
          <InfoCard number="3" title="Claude writes and injects the SEO metadata">
            <p>Claude generates a focus keyword, meta title (50–60 chars), meta description (140–160 chars), and internal link suggestions. These are written directly to Rank Math or Yoast SEO fields via the WordPress REST API.</p>
          </InfoCard>
          <InfoCard number="4" title="Runs 24/7 on the backend server">
            <p>The SEO Bot runs on the backend even when the app is closed — every 5 minutes for urgent jobs, every 30 minutes for medium-priority, and a full nightly sweep at 2 AM.</p>
          </InfoCard>
        </div>
      </Section>

      <Section title="5. SEO Bot Schedule">
        <div className="bg-gray-800/60 border border-gray-700 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[auto_auto_1fr] gap-x-4 px-5 py-2.5 border-b border-gray-700 bg-gray-800/50">
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Cycle</span>
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Frequency</span>
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">What it processes</span>
          </div>
          {[
            { cycle: 'High priority',   freq: 'Every 5 min',   dot: 'bg-red-500',     desc: 'Posts you just created or edited via chat — processed almost immediately.' },
            { cycle: 'Medium priority', freq: 'Every 30 min',  dot: 'bg-amber-400',   desc: 'Posts scoring below 60 (Poor) — picked up from the nightly sweep queue.' },
            { cycle: 'Low priority',    freq: 'Every hour',    dot: 'bg-emerald-500', desc: 'Posts scoring 60–79 (Needs work) — optimised gradually over time.' },
            { cycle: 'Nightly sweep',   freq: '2:00 AM daily', dot: 'bg-brand-400',   desc: 'Scans every published post & page (up to 200 each), scores them all, and queues anything below 80.' },
          ].map((row, i) => (
            <div key={i} className="grid grid-cols-[auto_auto_1fr] gap-x-4 items-start px-5 py-3.5 border-b border-gray-700/50 last:border-0 hover:bg-gray-700/20 transition-colors">
              <div className="flex items-center gap-2 whitespace-nowrap self-center">
                <span className={`w-2.5 h-2.5 rounded-full ${row.dot} flex-shrink-0`} />
                <span className="text-white text-sm font-medium">{row.cycle}</span>
              </div>
              <span className="text-brand-300 text-sm font-semibold whitespace-nowrap self-center">{row.freq}</span>
              <span className="text-gray-400 text-xs leading-relaxed self-center">{row.desc}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 bg-amber-900/20 border border-amber-700/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p className="text-amber-300 text-xs font-semibold mb-1">10-job cap per cycle (shared across all sites)</p>
              <p className="text-gray-400 text-xs leading-relaxed">Each cycle processes a maximum of 10 posts total across all your connected sites combined — not 10 per site. If you have 3 sites, those 10 slots are shared between them.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <svg className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-gray-400 text-xs leading-relaxed">Once a post scores <strong className="text-white">80 or above</strong>, the bot skips it. It re-enters the queue only if you edit it again via chat, which creates a new high-priority job processed within 5 minutes.</p>
          </div>
        </div>
      </Section>

      <Section title="6. SEO Improvement Guide">
        <div className="bg-gray-800/60 border border-gray-700 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-5 px-5 py-3 border-b border-gray-700 bg-gray-800/80">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Impact</span>
            <span className="flex items-center gap-1.5 text-xs text-gray-300"><span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" /> High</span>
            <span className="flex items-center gap-1.5 text-xs text-gray-300"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" /> Medium</span>
            <span className="flex items-center gap-1.5 text-xs text-gray-300"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" /> Low</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-5 py-2.5 border-b border-gray-700 bg-gray-800/50">
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Action</span>
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide text-center">Category</span>
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide text-center">Impact</span>
            <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide text-right">Time to See</span>
          </div>
          {[
            { action:'Keyword research',          category:'Content',   how:'Targets what users actually search for',              impact:'high',   time:'1–3 months' },
            { action:'Quality content',            category:'On-page',   how:'Google rewards helpful, in-depth pages',              impact:'high',   time:'2–6 months' },
            { action:'Backlinks',                  category:'Off-page',  how:'Signals authority and trust to Google',               impact:'high',   time:'3–6 months' },
            { action:'Page speed',                 category:'Technical', how:'Fast sites rank higher; Core Web Vitals metric',      impact:'high',   time:'2–4 weeks'  },
            { action:'Mobile optimisation',        category:'Technical', how:'Google uses mobile-first indexing',                   impact:'high',   time:'2–4 weeks'  },
            { action:'Meta titles & descriptions', category:'On-page',   how:'Improves click-through rate (CTR) in search results', impact:'medium', time:'1–2 weeks'  },
            { action:'Internal linking',           category:'On-page',   how:'Distributes page authority across site',              impact:'medium', time:'1–3 months' },
            { action:'XML sitemap',                category:'Technical', how:'Helps Google find and index all pages',               impact:'medium', time:'Days–weeks'  },
            { action:'Image alt text',             category:'On-page',   how:'Helps Google understand image content',               impact:'medium', time:'2–4 weeks'  },
            { action:'Schema markup',              category:'Technical', how:'Adds rich results (stars, FAQs) in search',           impact:'medium', time:'2–6 weeks'  },
            { action:'SSL / HTTPS',                category:'Technical', how:'Google uses HTTPS as a ranking signal',               impact:'low',    time:'Immediate'  },
            { action:'Clean URLs / permalinks',    category:'Technical', how:'Keyword-rich URLs help Google understand pages',      impact:'low',    time:'2–4 weeks'  },
          ].map((row, i) => {
            const dot = row.impact === 'high' ? 'bg-red-500' : row.impact === 'medium' ? 'bg-amber-400' : 'bg-emerald-500';
            const catColor = row.category === 'Content' ? 'text-brand-300' : row.category === 'On-page' ? 'text-brand-400' : row.category === 'Off-page' ? 'text-sky-400' : 'text-teal-400';
            return (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-start px-5 py-3.5 border-b border-gray-700/50 last:border-0 hover:bg-gray-700/20 transition-colors">
                <div>
                  <p className="text-white text-sm font-medium">{row.action}</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{row.how}</p>
                </div>
                <span className={`text-xs font-semibold ${catColor} self-center`}>{row.category}</span>
                <div className="flex items-center justify-center self-center"><span className={`w-2.5 h-2.5 rounded-full ${dot} flex-shrink-0`} /></div>
                <span className="text-gray-400 text-xs self-center text-right whitespace-nowrap">{row.time}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 bg-brand-950/40 border border-brand-700/20 rounded-2xl p-5">
          <p className="text-brand-300 text-xs font-semibold uppercase tracking-wide mb-3">Key Takeaways</p>
          <ul className="space-y-2">
            {[
              'Quality over quantity — one in-depth post beats ten shallow ones.',
              'Backlinks matter most — they are the strongest off-page ranking signal.',
              'Speed is critical — Core Web Vitals directly affect your Google ranking.',
              'SEO takes time — most improvements take weeks to months to show results.',
              'Be consistent — regular, well-researched content compounds over time.',
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-400 text-xs leading-relaxed">
                <span className="w-4 h-4 bg-brand-900/60 border border-brand-700/30 rounded-full flex items-center justify-center text-brand-400 font-bold text-[10px] flex-shrink-0 mt-0.5">{i + 1}</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </Section>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

function SettingsTab({ user, setUser }) {
  const { theme } = useAppStore();
  const initials = (user?.name || user?.email || 'U').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const [name, setName] = useState(user?.name || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  // SEO Bot — quick sweep interval
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [sweepInterval, setSweepInterval] = useState(5);
  const [sweepLoading, setSweepLoading] = useState(false);
  const [sweepSaving, setSweepSaving] = useState(false);
  const [sweepMsg, setSweepMsg] = useState(null);

  const loadSweepConfig = async (siteId) => {
    if (!siteId) return;
    setSweepLoading(true);
    try {
      const res = await client.get(`/seo/config/${siteId}`);
      setSweepInterval(res.data.quickSweepIntervalMinutes ?? 5);
    } catch (err) {
      setSweepMsg({ type: 'err', text: `Could not load config: ${err.message}` });
    } finally {
      setSweepLoading(false);
    }
  };

  useEffect(() => {
    client.get('/sites').then((res) => {
      const list = Array.isArray(res.data) ? res.data : [];
      setSites(list);
      if (list.length > 0) {
        const id = String(list[0]._id);
        setSelectedSiteId(id);
        loadSweepConfig(id);
      }
    }).catch((err) => setSweepMsg({ type: 'err', text: `Could not load sites: ${err.message}` }));
  }, []);

  const handleSaveSweep = async () => {
    if (!selectedSiteId) return;
    setSweepSaving(true);
    setSweepMsg(null);
    try {
      const res = await client.put(`/seo/config/${selectedSiteId}`, { quickSweepIntervalMinutes: sweepInterval });
      // Re-read from the response to confirm what was saved
      setSweepInterval(res.data.quickSweepIntervalMinutes ?? sweepInterval);
      setSweepMsg({ type: 'ok', text: 'Saved.' });
      setTimeout(() => setSweepMsg(null), 3000);
    } catch (err) {
      setSweepMsg({ type: 'err', text: err.message });
    } finally {
      setSweepSaving(false);
    }
  };

  const sweepLabel = sweepInterval < 60
    ? `Every ${sweepInterval} min`
    : sweepInterval === 60 ? 'Every hour'
    : `Every ${(sweepInterval / 60).toFixed(1).replace('.0', '')} hrs`;

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setNameSaving(true);
    setNameMsg(null);
    try {
      const res = await client.patch('/auth/me', { name: name.trim() });
      setUser({ ...user, name: res.data.name });
      setNameMsg({ type: 'ok', text: 'Name updated successfully.' });
      setTimeout(() => setNameMsg(null), 3000);
    } catch (err) {
      setNameMsg({ type: 'err', text: err.message });
    } finally {
      setNameSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) return;
    if (newPw !== confirmPw) { setPwMsg({ type: 'err', text: 'New passwords do not match.' }); return; }
    if (newPw.length < 8) { setPwMsg({ type: 'err', text: 'Password must be at least 8 characters.' }); return; }
    setPwSaving(true);
    setPwMsg(null);
    try {
      await client.patch('/auth/me/password', { currentPassword: currentPw, newPassword: newPw });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwMsg({ type: 'ok', text: 'Password changed successfully.' });
      setTimeout(() => setPwMsg(null), 3000);
    } catch (err) {
      setPwMsg({ type: 'err', text: err.message });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-8">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-gray-400 text-sm mt-0.5">Manage your profile.</p>
      </div>

      <div className="flex items-center gap-4 bg-gray-800/60 border border-gray-700 rounded-2xl p-5">
        <div className="w-14 h-14 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-md flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-white font-semibold">{user?.name || 'User'}</p>
          <p className="text-gray-400 text-sm">{user?.email || ''}</p>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-700">
          <h3 className="text-white font-semibold text-sm">Appearance</h3>
        </div>
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">Theme</p>
            <p className="text-gray-400 text-xs mt-0.5">{theme === 'dark' ? 'Dark mode is on' : 'Light mode is on'}</p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-700">
          <h3 className="text-white font-semibold text-sm">Change Name</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-gray-700 border border-gray-600 focus:border-brand-500 text-white placeholder-gray-500 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors"
            />
          </div>
          {nameMsg && <p className={`text-xs ${nameMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{nameMsg.text}</p>}
          <button
            onClick={handleSaveName}
            disabled={nameSaving || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-sm"
          >
            {nameSaving && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>}
            {nameSaving ? 'Saving…' : 'Save Name'}
          </button>
        </div>
      </div>

      {/* SEO Bot */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-700">
          <h3 className="text-white font-semibold text-sm">SEO Bot</h3>
        </div>
        <div className="p-5 space-y-4">
          {sites.length === 0 ? (
            <p className="text-gray-500 text-xs">No sites connected yet.</p>
          ) : (
            <>
              {sites.length > 1 && (
                <div>
                  <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">Site</label>
                  <select
                    value={selectedSiteId}
                    onChange={(e) => { setSelectedSiteId(e.target.value); loadSweepConfig(e.target.value); }}
                    className="w-full bg-gray-700 border border-gray-600 focus:border-brand-500 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors"
                  >
                    {sites.map((s) => (
                      <option key={s._id} value={s._id}>{s.label || s.siteUrl}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">Quick Sweep Interval</label>
                <p className="text-gray-500 text-xs mb-3">How often the bot scans for posts that need SEO work. Min 5 min · Max 3 hrs.</p>
                <div className={`flex items-center gap-3 ${sweepLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    type="range"
                    min={5}
                    max={180}
                    step={5}
                    value={sweepInterval}
                    onChange={(e) => setSweepInterval(Number(e.target.value))}
                    className="flex-1 accent-brand-500"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={sweepInterval}
                      onChange={(e) => setSweepInterval(Math.max(5, Math.min(180, Number(e.target.value))))}
                      className="w-16 bg-gray-700 border border-gray-600 focus:border-brand-500 rounded-xl px-2 py-2 text-white text-sm text-center focus:outline-none transition-colors"
                    />
                    <span className="text-gray-400 text-xs">min</span>
                  </div>
                </div>
                <p className="text-brand-400 text-xs mt-1.5">{sweepLabel}</p>
              </div>
              {sweepMsg && (
                <p className={`text-xs ${sweepMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{sweepMsg.text}</p>
              )}
              <button
                onClick={handleSaveSweep}
                disabled={sweepSaving}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-sm"
              >
                {sweepSaving && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>}
                {sweepSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-700">
          <h3 className="text-white font-semibold text-sm">Change Password</h3>
        </div>
        <div className="p-5 space-y-4">
          {(['Current Password', 'New Password', 'Confirm New Password']).map((label, i) => {
            const val = i === 0 ? currentPw : i === 1 ? newPw : confirmPw;
            const setter = i === 0 ? setCurrentPw : i === 1 ? setNewPw : setConfirmPw;
            return (
              <div key={label}>
                <label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">{label}</label>
                <input
                  type="password"
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-700 border border-gray-600 focus:border-brand-500 text-white placeholder-gray-500 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors"
                />
              </div>
            );
          })}
          {pwMsg && <p className={`text-xs ${pwMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{pwMsg.text}</p>}
          <button
            onClick={handleSavePassword}
            disabled={pwSaving || !currentPw || !newPw || !confirmPw}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-sm"
          >
            {pwSaving && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>}
            {pwSaving ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
