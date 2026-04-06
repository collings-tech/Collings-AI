import React from 'react';

function scoreColor(score) {
  if (score === null) return 'text-gray-500';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function TrendArrow({ trend }) {
  if (trend === '+') return <span className="text-green-400 text-lg">↑</span>;
  if (trend === '-') return <span className="text-red-400 text-lg">↓</span>;
  return <span className="text-gray-500 text-lg">→</span>;
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
  return (
    <button
      onClick={onClick}
      className="bg-gray-800 border border-gray-700 hover:border-brand-500/50 rounded-2xl p-5 flex flex-col gap-3 transition-all text-left w-full"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold truncate">{site.siteLabel}</p>
          <p className="text-gray-500 text-xs truncate mt-0.5">{site.siteUrl}</p>
        </div>
        <TrendArrow trend={site.trend} />
      </div>

      <div className="flex items-end gap-2">
        <span className={`text-4xl font-bold ${scoreColor(site.avgScore)}`}>
          {site.avgScore ?? '–'}
        </span>
        <span className="text-gray-500 text-sm mb-1">avg score</span>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>{site.postsOptimized ?? 0} optimized</span>
        <span className="text-gray-700">·</span>
        {site.attentionCount > 0 ? (
          <span className="text-amber-400">{site.attentionCount} need attention</span>
        ) : (
          <span className="text-green-400">All healthy</span>
        )}
      </div>

      <p className="text-xs text-gray-600">Last run: {timeAgo(site.lastBotRun)}</p>
    </button>
  );
}
