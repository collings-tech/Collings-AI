import React, { useState, useEffect } from 'react';

function formatDate(dateStr) {
  if (!dateStr) return 'Never';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dateStr));
  } catch {
    return 'Unknown';
  }
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return null;
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return null;
  }
}

function getDomainLabel(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function minsUntilNextScan() {
  const now = new Date();
  const currentMin = now.getMinutes();
  const currentSec = now.getSeconds();
  const nextBoundary = Math.ceil((currentMin + currentSec / 60) / 15) * 15;
  return Math.max(0, Math.round(nextBoundary - currentMin - currentSec / 60));
}

function scoreColor(score) {
  if (score === null || score === undefined) return { ring: '#4b5563', text: 'text-gray-500', label: 'No data', bg: 'bg-gray-700' };
  if (score >= 80) return { ring: '#22c55e', text: 'text-emerald-400', label: 'Good', bg: 'bg-emerald-900/40' };
  if (score >= 60) return { ring: '#f59e0b', text: 'text-amber-400', label: 'Fair', bg: 'bg-amber-900/30' };
  if (score >= 40) return { ring: '#f97316', text: 'text-orange-400', label: 'Poor', bg: 'bg-orange-900/30' };
  return { ring: '#ef4444', text: 'text-red-400', label: 'Critical', bg: 'bg-red-900/30' };
}

function ScoreRing({ score }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = score !== null && score !== undefined ? Math.min(100, Math.max(0, score)) : 0;
  const dash = (pct / 100) * circ;
  const { ring, text } = scoreColor(score);

  return (
    <div className="relative w-14 h-14 flex items-center justify-center flex-shrink-0">
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#374151" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={score !== null && score !== undefined ? ring : '#374151'} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <span className={`absolute text-sm font-bold ${text}`}>{score !== null && score !== undefined ? score : '–'}</span>
    </div>
  );
}

function Sparkline({ trend, color }) {
  if (!trend || trend.length < 2) {
    return <div className="flex items-center justify-center h-10 w-full"><span className="text-gray-600 text-xs">No trend data yet</span></div>;
  }
  const W = 180, H = 40, PAD = 4;
  const values = trend.map((t) => t.avgScore || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const areaPoints = [`${PAD},${H - PAD}`, ...pts, `${W - PAD},${H - PAD}`].join(' ');
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.length > 0 && (() => { const last = pts[pts.length - 1].split(','); return <circle cx={last[0]} cy={last[1]} r="3" fill={color} />; })()}
    </svg>
  );
}

function TrendArrow({ trend }) {
  if (!trend || trend.length < 2) return null;
  const first = trend[0]?.avgScore || 0;
  const last = trend[trend.length - 1]?.avgScore || 0;
  const diff = last - first;
  if (Math.abs(diff) < 1) return <span className="text-gray-500 text-xs">→ stable</span>;
  if (diff > 0) return <span className="text-emerald-400 text-xs">↑ +{diff.toFixed(1)}</span>;
  return <span className="text-red-400 text-xs">↓ {diff.toFixed(1)}</span>;
}

function JobStatusBar({ pendingJobs, failedJobs, failedJobError, botEnabled }) {
  const [scanIn, setScanIn] = useState(minsUntilNextScan());

  useEffect(() => {
    const id = setInterval(() => setScanIn(minsUntilNextScan()), 30000);
    return () => clearInterval(id);
  }, []);

  if (!botEnabled) {
    return (
      <div className="bg-gray-700/30 border border-gray-700/40 rounded-xl px-3 py-2 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-gray-500 text-xs">SEO Bot paused</span>
        <span className="ml-auto text-gray-600 text-xs">Jobs on hold</span>
      </div>
    );
  }

  if (pendingJobs > 0) {
    return (
      <div className="bg-brand-950/50 border border-brand-700/30 rounded-xl px-3 py-2 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-brand-400 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-gray-400 text-xs">Optimizing</span>
        <span className="ml-auto text-brand-300 text-xs font-semibold">{pendingJobs} job{pendingJobs !== 1 ? 's' : ''} queued</span>
      </div>
    );
  }

  if (failedJobs > 0) {
    return (
      <div className="bg-red-950/40 border border-red-700/30 rounded-xl px-3 py-2 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span className="text-red-400 text-xs">{failedJobs} job{failedJobs !== 1 ? 's' : ''} failed</span>
        <span className="ml-auto text-gray-500 text-xs truncate max-w-[180px]" title={failedJobError || 'WordPress access issue'}>
          {failedJobError ? failedJobError.slice(0, 40) + (failedJobError.length > 40 ? '…' : '') : 'WordPress access issue'}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-brand-950/50 border border-brand-700/20 rounded-xl px-3 py-2 flex items-center gap-2">
      <svg className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-gray-400 text-xs">Next scan</span>
      <span className="ml-auto text-brand-300 text-xs font-semibold">{scanIn <= 1 ? 'in < 1 min' : `in ${scanIn} min`}</span>
    </div>
  );
}

function AttentionDropdown({ posts, siteId, onClose }) {
  const [triggering, setTriggering] = useState({});
  const [triggered, setTriggered] = useState({});

  const handleOptimize = async (e, post) => {
    e.stopPropagation();
    setTriggering((p) => ({ ...p, [post.postId]: true }));
    try {
      const client = (await import('../api/client')).default;
      await client.post(`/seo/jobs/${siteId}`, { postId: post.postId, postType: 'post' });
      setTriggered((p) => ({ ...p, [post.postId]: true }));
    } catch { /* silent */ }
    finally { setTriggering((p) => ({ ...p, [post.postId]: false })); }
  };

  return (
    <div className="mt-2 bg-gray-900 border border-amber-700/30 rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="px-3 py-2 border-b border-gray-700/60 flex items-center justify-between">
        <span className="text-amber-400 text-xs font-semibold">Posts needing attention</span>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
      </div>
      {posts.map((p) => (
        <div key={p.postId} className="px-3 py-2.5 border-b border-gray-700/40 last:border-0 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-gray-200 text-xs truncate">{p.postTitle || `Post #${p.postId}`}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-xs font-bold ${p.currentScore < 40 ? 'text-red-400' : 'text-amber-400'}`}>{p.currentScore}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${p.status === 'critical' ? 'bg-red-900/40 text-red-300' : 'bg-amber-900/30 text-amber-300'}`}>{p.status}</span>
            </div>
          </div>
          {triggered[p.postId] ? (
            <span className="text-emerald-400 text-xs font-medium flex-shrink-0">Queued!</span>
          ) : (
            <button
              onClick={(e) => handleOptimize(e, p)}
              disabled={triggering[p.postId]}
              className="text-xs px-2.5 py-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium flex-shrink-0"
            >
              {triggering[p.postId] ? '…' : 'Fix'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ReprocessAllButton({ siteId }) {
  const [state, setState] = useState('idle'); // idle | loading | done

  const handleClick = async (e) => {
    e.stopPropagation();
    if (state !== 'idle') return;
    setState('loading');
    try {
      const c = (await import('../api/client')).default;
      await c.post(`/seo/jobs/${siteId}/clear-completed`);
      setState('done');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('idle');
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={state !== 'idle'}
      className="w-full py-1.5 mt-1 border border-brand-700/40 hover:border-brand-500 hover:bg-brand-900/20 disabled:opacity-50 text-brand-400 rounded-lg text-xs font-semibold transition-colors"
    >
      {state === 'loading' ? 'Clearing…' : state === 'done' ? 'Done! Re-queuing on next scan…' : 'Re-process All Posts'}
    </button>
  );
}

function SeoBotConfigPanel({ siteId, onClose }) {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const c = (await import('../api/client')).default;
        const res = await c.get(`/seo/config/${siteId}`);
        setConfig(res.data);
      } catch { setConfig({ seoPlugin: 'none', scoreThresholdRewrite: 60 }); }
    })();
  }, [siteId]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const c = (await import('../api/client')).default;
      const res = await c.put(`/seo/config/${siteId}`, {
        seoPlugin: config.seoPlugin,
        scoreThresholdRewrite: config.scoreThresholdRewrite,
      });
      setConfig(res.data);
      setMsg({ type: 'ok', text: 'Saved!' });
      setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      setMsg({ type: 'err', text: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 bg-gray-900 border border-brand-700/30 rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="px-3 py-2 border-b border-gray-700/60 flex items-center justify-between">
        <span className="text-brand-400 text-xs font-semibold">SEO Bot Settings</span>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
      </div>
      {!config ? (
        <div className="px-3 py-4 text-gray-500 text-xs">Loading…</div>
      ) : (
        <div className="p-3 space-y-3">
          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1 uppercase tracking-wide">SEO Plugin</label>
            <select
              value={config.seoPlugin}
              onChange={(e) => setConfig({ ...config, seoPlugin: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 focus:border-brand-500 text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
            >
              <option value="none">None (no plugin)</option>
              <option value="rankmath">Rank Math</option>
              <option value="yoast">Yoast SEO</option>
            </select>
            <p className="text-gray-600 text-xs mt-1">Must match the plugin installed on your WordPress site. Unlocks up to 40 extra points.</p>
          </div>
          <div>
            <label className="block text-gray-400 text-xs font-semibold mb-1 uppercase tracking-wide">
              Rewrite Threshold: <span className="text-brand-400">{config.scoreThresholdRewrite}</span>
            </label>
            <input
              type="range"
              min={20} max={80} step={5}
              value={config.scoreThresholdRewrite}
              onChange={(e) => setConfig({ ...config, scoreThresholdRewrite: Number(e.target.value) })}
              className="w-full accent-brand-500"
            />
            <p className="text-gray-600 text-xs mt-1">Posts scoring below this get their content fully rewritten. Set to 60–70 to reach 80+.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {msg && <span className={`text-xs ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</span>}
          </div>
          <ReprocessAllButton siteId={siteId} />
        </div>
      )}
    </div>
  );
}

export default function SiteCard({ site, seoStats, onSelect, onDelete, siteId }) {

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm(`Remove "${site.label}"? This will not affect your WordPress site.`)) {
      onDelete(site.id || site._id);
    }
  };

  const [showAttention, setShowAttention] = useState(false);
  const [showBotConfig, setShowBotConfig] = useState(false);
  const [botEnabled, setBotEnabled] = useState(true);
  const [togglingBot, setTogglingBot] = useState(false);
  const [gscSummary, setGscSummary] = useState(null);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      try {
        const c = (await import('../api/client')).default;
        const res = await c.get(`/seo/config/${siteId}`);
        setBotEnabled(res.data.enabled !== false);
      } catch { /* keep default true */ }
    })();
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    (async () => {
      try {
        const c = (await import('../api/client')).default;
        const res = await c.get(`/seo/gsc/${siteId}/summary?days=28`);
        if (res.data?.available) setGscSummary(res.data);
      } catch { /* GSC not configured — stay null */ }
    })();
  }, [siteId]);

  const handleToggleBot = async (e) => {
    e.stopPropagation();
    setTogglingBot(true);
    try {
      const c = (await import('../api/client')).default;
      const res = await c.put(`/seo/config/${siteId}`, { enabled: !botEnabled });
      setBotEnabled(res.data.enabled);
    } catch { /* silent */ }
    finally { setTogglingBot(false); }
  };

  const { avgScore, postsOptimized, attentionCount, lastBotRun, pendingJobs, failedJobs, failedJobError, trend, attentionPosts } = seoStats || {};
  const hasSeoData = seoStats !== null && seoStats !== undefined;
  const colors = scoreColor(avgScore ?? null);

  return (
    <div
      onClick={() => onSelect(site)}
      className="group relative bg-gray-800/50 border border-gray-700/50 hover:border-gray-500 rounded-2xl cursor-pointer transition-all duration-200 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5 overflow-hidden flex flex-col"
    >
      <div className="p-5 pb-3 flex items-start gap-3">
        <div className="w-10 h-10 bg-brand-900/40 rounded-xl flex items-center justify-center border border-brand-700/30 flex-shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <h3 className="text-white font-semibold text-base truncate">{site.label}</h3>
          </div>
          <p className="text-brand-400 text-xs font-mono truncate">{getDomainLabel(site.siteUrl || site.site_url)}</p>
          <p className="text-gray-600 text-xs mt-0.5">Last used: {formatDate(site.lastUsed || site.last_used || site.updatedAt)}</p>
        </div>

        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all duration-150 p-1 rounded-lg hover:bg-red-900/20 flex-shrink-0"
          title="Remove site"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {hasSeoData ? (
        <>
          <div className="mx-5 border-t border-gray-700/40" />
          <div className="px-5 py-3 flex items-center gap-4">
            <ScoreRing score={avgScore ?? null} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold ${colors.text}`}>{colors.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${colors.bg} ${colors.text}`}>SEO Health</span>
              </div>
              <div className="text-xs text-gray-400">
                <TrendArrow trend={trend} />
                <span className="text-gray-600 ml-1">· 7-day trend</span>
              </div>
            </div>
          </div>

          <div className="px-5 pb-3">
            <Sparkline trend={trend} color={colors.ring} />
          </div>

          <div className="px-5 pb-3 grid grid-cols-3 gap-2">
            <div className="bg-gray-700/30 rounded-xl px-2 py-2 text-center">
              <div className="text-white font-bold text-base leading-none mb-1">{postsOptimized ?? 0}</div>
              <div className="text-gray-500 text-xs leading-tight">Optimized</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); if (attentionCount > 0) setShowAttention((v) => !v); }}
              className={`rounded-xl px-2 py-2 text-center transition-all ${attentionCount > 0 ? 'bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 cursor-pointer' : 'bg-gray-700/30 cursor-default'}`}
            >
              <div className={`font-bold text-base leading-none mb-1 ${attentionCount > 0 ? 'text-amber-400' : 'text-white'}`}>{attentionCount ?? 0}</div>
              <div className={`text-xs leading-tight ${attentionCount > 0 ? 'text-amber-500' : 'text-gray-500'}`}>
                Attention {attentionCount > 0 && <span>{showAttention ? '▲' : '▼'}</span>}
              </div>
            </button>
            <div className="bg-gray-700/30 rounded-xl px-2 py-2 text-center">
              <div className="text-gray-300 font-bold text-xs leading-none mb-1 truncate">{formatTimeAgo(lastBotRun) || '—'}</div>
              <div className="text-gray-500 text-xs leading-tight">Last ran</div>
            </div>
          </div>

          {gscSummary && (
            <div className="px-5 pb-2">
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs">
                <svg className="w-3 h-3 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="text-gray-500">GSC:</span>
                <span className="text-gray-300 font-medium">{(gscSummary.clicks || 0).toLocaleString()} clicks</span>
                <span className="text-gray-700">·</span>
                <span className="text-gray-400">pos #{gscSummary.position}</span>
                <span className="text-gray-600 ml-auto">28d</span>
              </div>
            </div>
          )}

          {showAttention && attentionPosts && attentionPosts.length > 0 && (
            <div className="px-5 pb-3">
              <AttentionDropdown posts={attentionPosts} siteId={siteId} onClose={() => setShowAttention(false)} />
            </div>
          )}

          <div className="px-5 pb-3">
            <JobStatusBar pendingJobs={pendingJobs ?? 0} failedJobs={failedJobs ?? 0} failedJobError={failedJobError ?? null} botEnabled={botEnabled} />
          </div>

          <div className="px-5 pb-3 flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${botEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-gray-500 text-xs">SEO Bot</span>
            <span className={`text-xs font-medium ${botEnabled ? 'text-emerald-400' : 'text-gray-500'}`}>
              {botEnabled ? 'Active' : 'Inactive'}
            </span>
            <div className="flex-1" />
            {/* Toggle switch */}
            <button
              onClick={handleToggleBot}
              disabled={togglingBot}
              className={`relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none ${botEnabled ? 'bg-emerald-500' : 'bg-gray-600'} disabled:opacity-50`}
              title={botEnabled ? 'Disable SEO Bot' : 'Enable SEO Bot'}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${botEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowBotConfig((v) => !v); }}
              className="p-1 rounded-lg text-gray-600 hover:text-brand-400 hover:bg-gray-700/50 transition-colors"
              title="SEO Bot settings"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <svg className="w-3.5 h-3.5 text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>

          {showBotConfig && (
            <div className="px-5 pb-3">
              <SeoBotConfigPanel siteId={siteId} onClose={() => setShowBotConfig(false)} />
            </div>
          )}
        </>
      ) : (
        <div className="px-5 pb-5 flex items-center justify-between mt-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
            <span className="text-gray-600 text-xs">SEO data loading…</span>
          </div>
          <svg className="w-4 h-4 text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </div>
  );
}
