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
  const nextBoundary = Math.ceil((currentMin + currentSec / 60) / 5) * 5;
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

function JobStatusBar({ pendingJobs, failedJobs }) {
  const [scanIn, setScanIn] = useState(minsUntilNextScan());

  useEffect(() => {
    const id = setInterval(() => setScanIn(minsUntilNextScan()), 30000);
    return () => clearInterval(id);
  }, []);

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
        <span className="ml-auto text-gray-500 text-xs">WordPress access issue</span>
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

export default function SiteCard({ site, seoStats, onSelect, onDelete, siteId }) {

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm(`Remove "${site.label}"? This will not affect your WordPress site.`)) {
      onDelete(site.id || site._id);
    }
  };

  const [showAttention, setShowAttention] = useState(false);
  const { avgScore, postsOptimized, attentionCount, lastBotRun, pendingJobs, failedJobs, trend, attentionPosts } = seoStats || {};
  const hasSeoData = seoStats !== null && seoStats !== undefined;
  const colors = scoreColor(avgScore ?? null);

  return (
    <div
      onClick={() => onSelect(site)}
      className="group relative bg-gray-800 border border-gray-700 hover:border-brand-500 rounded-2xl cursor-pointer transition-all duration-200 hover:shadow-xl hover:shadow-brand-900/20 hover:-translate-y-0.5 overflow-hidden flex flex-col"
    >
      <div className="p-5 pb-3 flex items-start gap-3">
        <div className="w-10 h-10 bg-brand-900/60 rounded-xl flex items-center justify-center border border-brand-700/40 flex-shrink-0 mt-0.5">
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
          <div className="mx-5 border-t border-gray-700/60" />
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
            <div className="bg-gray-700/40 rounded-xl px-2 py-2 text-center">
              <div className="text-white font-bold text-base leading-none mb-1">{postsOptimized ?? 0}</div>
              <div className="text-gray-500 text-xs leading-tight">Optimized</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); if (attentionCount > 0) setShowAttention((v) => !v); }}
              className={`rounded-xl px-2 py-2 text-center transition-all ${attentionCount > 0 ? 'bg-amber-900/30 hover:bg-amber-900/50 cursor-pointer' : 'bg-gray-700/40 cursor-default'}`}
            >
              <div className={`font-bold text-base leading-none mb-1 ${attentionCount > 0 ? 'text-amber-400' : 'text-white'}`}>{attentionCount ?? 0}</div>
              <div className={`text-xs leading-tight ${attentionCount > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                Attention {attentionCount > 0 && <span>{showAttention ? '▲' : '▼'}</span>}
              </div>
            </button>
            <div className="bg-gray-700/40 rounded-xl px-2 py-2 text-center">
              <div className="text-gray-300 font-bold text-xs leading-none mb-1 truncate">{formatTimeAgo(lastBotRun) || '—'}</div>
              <div className="text-gray-500 text-xs leading-tight">Last ran</div>
            </div>
          </div>

          {showAttention && attentionPosts && attentionPosts.length > 0 && (
            <div className="px-5 pb-3">
              <AttentionDropdown posts={attentionPosts} siteId={siteId} onClose={() => setShowAttention(false)} />
            </div>
          )}

          <div className="px-5 pb-3">
            <JobStatusBar pendingJobs={pendingJobs ?? 0} failedJobs={failedJobs ?? 0} />
          </div>

          <div className="px-5 pb-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-gray-500 text-xs">SEO Bot active</span>
            <div className="flex-1" />
            <svg className="w-3.5 h-3.5 text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
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
