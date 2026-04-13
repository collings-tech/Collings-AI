import React from 'react';

function scoreColor(score) {
  if (score === null || score === undefined) return { text: 'text-gray-500', ring: '#6b7280', border: 'border-gray-700', bg: 'bg-gray-500/10' };
  if (score >= 80) return { text: 'text-green-400', ring: '#22c55e', border: 'border-green-500/30', bg: 'bg-green-500/5' };
  if (score >= 60) return { text: 'text-amber-400', ring: '#f59e0b', border: 'border-amber-500/30', bg: 'bg-amber-500/5' };
  if (score >= 40) return { text: 'text-orange-400', ring: '#f97316', border: 'border-orange-500/30', bg: 'bg-orange-500/5' };
  return { text: 'text-red-400', ring: '#ef4444', border: 'border-red-500/30', bg: 'bg-red-500/5' };
}

function ScoreRing({ score }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? Math.min(100, Math.max(0, score)) / 100 : 0;
  const dash = pct * circ;
  const colors = scoreColor(score);

  return (
    <div className="relative w-20 h-20 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#1f2937" strokeWidth="4" />
        <circle
          cx="34" cy="34" r={r} fill="none"
          stroke={colors.ring}
          strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-bold leading-none ${colors.text}`}>{score ?? '—'}</span>
        <span className="text-[10px] text-gray-600 mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

function TrendBadge({ trend }) {
  if (trend === '+') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
      Up
    </span>
  );
  if (trend === '-') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
      Down
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-500/10 border border-gray-700/50 px-2.5 py-1 rounded-full">
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
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
      className={`group relative bg-gray-800/50 border ${colors.border} hover:border-gray-500 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 text-left w-full hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5`}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-6 right-6 h-px rounded-full"
        style={{ background: `linear-gradient(90deg, transparent, ${colors.ring}40, transparent)` }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold truncate leading-tight">{site.siteLabel}</p>
          <p className="text-gray-600 text-xs truncate mt-1">{site.siteUrl}</p>
        </div>
        <TrendBadge trend={site.trend} />
      </div>

      <div className="flex items-center gap-4">
        <ScoreRing score={site.avgScore} />
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm text-gray-300 font-medium">{site.postsOptimized ?? 0}</span>
            <span className="text-xs text-gray-600">optimized</span>
          </div>
          {site.attentionCount > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-xs font-medium text-amber-400">{site.attentionCount} need attention</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs font-medium text-green-400">All healthy</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-700/40">
        <span className="text-xs text-gray-600">Last run: {timeAgo(site.lastBotRun)}</span>
        <span className="text-xs text-gray-600 group-hover:text-gray-300 transition-colors flex items-center gap-1">
          View details
          <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </button>
  );
}
