import React from 'react';

function scoreColor(score) {
  if (score === null || score === undefined) return { text: 'text-gray-500', ring: '#6b7280', bg: 'bg-gray-700/40' };
  if (score >= 80) return { text: 'text-green-400', ring: '#22c55e', bg: 'bg-green-900/20' };
  if (score >= 60) return { text: 'text-amber-400', ring: '#f59e0b', bg: 'bg-amber-900/20' };
  if (score >= 40) return { text: 'text-orange-400', ring: '#f97316', bg: 'bg-orange-900/20' };
  return { text: 'text-red-400', ring: '#ef4444', bg: 'bg-red-900/20' };
}

function ScoreRing({ score }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? Math.min(100, Math.max(0, score)) / 100 : 0;
  const dash = pct * circ;
  const colors = scoreColor(score);

  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#374151" strokeWidth="5" />
        <circle
          cx="32" cy="32" r={r} fill="none"
          stroke={colors.ring}
          strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-bold ${colors.text}`}>{score ?? '—'}</span>
      </div>
    </div>
  );
}

function TrendBadge({ trend }) {
  if (trend === '+') return (
    <span className="flex items-center gap-0.5 text-xs font-semibold text-green-400 bg-green-900/30 border border-green-800/40 px-2 py-0.5 rounded-full">
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
      Up
    </span>
  );
  if (trend === '-') return (
    <span className="flex items-center gap-0.5 text-xs font-semibold text-red-400 bg-red-900/30 border border-red-800/40 px-2 py-0.5 rounded-full">
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
      Down
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-xs font-semibold text-gray-500 bg-gray-700/50 border border-gray-700 px-2 py-0.5 rounded-full">
      Stable
    </span>
  );
}

function timeAgo(date) {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'Just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SeoSiteOverviewCard({ site, onClick }) {
  const colors = scoreColor(site.avgScore);

  return (
    <button
      onClick={onClick}
      className="group bg-gradient-to-br from-gray-800 to-gray-850 border border-gray-700 hover:border-gray-500 rounded-2xl p-5 flex flex-col gap-4 transition-all text-left w-full hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5"
    >
      {/* Site name + trend */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold truncate leading-tight">{site.siteLabel}</p>
          <p className="text-gray-500 text-xs truncate mt-0.5">{site.siteUrl}</p>
        </div>
        <TrendBadge trend={site.trend} />
      </div>

      {/* Score ring + stats */}
      <div className="flex items-center gap-4">
        <ScoreRing score={site.avgScore} />
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="text-gray-400 text-xs">Average score</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-300 font-medium">{site.postsOptimized ?? 0} optimized</span>
            <span className="text-gray-700 text-xs">·</span>
            {site.attentionCount > 0 ? (
              <span className="text-xs font-medium text-amber-400">{site.attentionCount} need attention</span>
            ) : (
              <span className="text-xs font-medium text-green-400">All healthy</span>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-700/60">
        <span className="text-xs text-gray-600">Last run: {timeAgo(site.lastBotRun)}</span>
        <span className="text-xs text-gray-500 group-hover:text-gray-300 transition-colors flex items-center gap-1">
          View details
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </button>
  );
}
