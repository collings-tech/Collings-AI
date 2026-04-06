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

      const trendResults = await Promise.allSettled(
        loadedSites.map((site) =>
          client.get(`/seo/dashboard/${site._id || site.id}/score-trend`, { params: { days: 7 } })
        )
      );

      const map = {};
      loadedSites.forEach((site, idx) => {
        const siteId = String(site._id || site.id);
        const ovItem = overview.find((o) => String(o.siteId) === siteId) || {};
        const trendRes = trendResults[idx];
        const trend = trendRes.status === 'fulfilled' ? trendRes.value.data.trend || [] : [];
        map[siteId] = {
          avgScore: ovItem.avgScore ?? null,
          postsOptimized: ovItem.postsOptimized ?? 0,
          attentionCount: ovItem.attentionCount ?? 0,
          lastBotRun: ovItem.lastBotRun || null,
          trend,
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
            onClick={handleLogout}
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
              onClick={() => setActiveTab(tab.id)}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// How It Works Tab
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

function HowItWorksTab() {
  return (
    <div className="max-w-3xl mx-auto space-y-10 pb-8">
      <Section title="1. How Collings AI Works">
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
      </Section>

      <Section title="3. How the SEO Bot Works">
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
