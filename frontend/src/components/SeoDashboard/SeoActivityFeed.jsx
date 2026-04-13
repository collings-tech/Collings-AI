import React, { useState } from 'react';

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ChangeTags({ changes }) {
  const tags = [];
  if (changes?.focusKeyword?.after) tags.push('Keyword');
  if (changes?.metaTitle?.after) tags.push('Meta title');
  if (changes?.metaDescription?.after) tags.push('Meta desc');
  if (changes?.internalLinksAdded > 0) tags.push(`${changes.internalLinksAdded} link${changes.internalLinksAdded > 1 ? 's' : ''}`);
  if (changes?.contentRewritten) tags.push('Rewritten');
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tags.map((t) => (
        <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-gray-700/60 text-gray-400 border border-gray-700/50">{t}</span>
      ))}
    </div>
  );
}

function ExpandedDetails({ changes }) {
  const rows = [];
  if (changes?.focusKeyword?.after) rows.push({ label: 'Keyword', before: changes.focusKeyword.before || '—', after: changes.focusKeyword.after });
  if (changes?.metaTitle?.after) rows.push({ label: 'Meta Title', before: changes.metaTitle.before || '—', after: changes.metaTitle.after });
  if (changes?.metaDescription?.after) rows.push({ label: 'Meta Desc', before: changes.metaDescription.before || '—', after: changes.metaDescription.after });
  return (
    <div className="mt-3 pl-4 border-l-2 border-gray-700/80 flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider mb-0.5">{r.label}</p>
          <p className="text-xs text-gray-600 line-through truncate">{r.before}</p>
          <p className="text-xs text-gray-300 truncate">{r.after}</p>
        </div>
      ))}
      {changes?.contentRewritten && <p className="text-xs text-amber-400/80">Full content rewrite applied</p>}
      {changes?.internalLinksAdded > 0 && <p className="text-xs text-brand-400">{changes.internalLinksAdded} internal link{changes.internalLinksAdded > 1 ? 's' : ''} added</p>}
    </div>
  );
}

function diffColor(diff) {
  if (diff >= 10) return 'text-green-400';
  if (diff >= 0) return 'text-amber-400';
  return 'text-red-400';
}

function dotColor(diff) {
  if (diff >= 10) return 'bg-green-400';
  if (diff >= 0) return 'bg-amber-400';
  return 'bg-red-400';
}

function FeedEntry({ log, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const diff = log.scoreAfter - log.scoreBefore;

  return (
    <div
      className="flex gap-4 cursor-pointer group"
      onClick={() => setExpanded((e) => !e)}
    >
      {/* Timeline track */}
      <div className="flex flex-col items-center pt-1">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ring-4 ring-gray-800 ${dotColor(diff)}`} />
        {!isLast && <div className="w-px flex-1 bg-gray-700/50 mt-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-5 ${!isLast ? '' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-gray-200 truncate flex-1 group-hover:text-white transition-colors">
            {log.postTitle || `Post #${log.postId}`}
          </p>
          <span className="text-[11px] text-gray-600 shrink-0">{timeAgo(log.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500 font-mono">{log.scoreBefore}</span>
          <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="text-xs text-gray-300 font-mono">{log.scoreAfter}</span>
          <span className={`text-xs font-semibold ${diffColor(diff)}`}>
            {diff >= 0 ? '+' : ''}{diff}
          </span>
        </div>
        <ChangeTags changes={log.changes} />
        {expanded && <ExpandedDetails changes={log.changes} />}
      </div>
    </div>
  );
}

export default function SeoActivityFeed({ logs, loading }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700/50">
        <h3 className="text-white font-semibold text-sm">Recent Bot Activity</h3>
        <p className="text-xs text-gray-600 mt-0.5">Click an entry to expand details</p>
      </div>
      {loading ? (
        <div className="p-5 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-700 mt-1 shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-700/60 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <svg className="w-8 h-8 text-gray-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500 text-sm">No activity recorded yet</p>
        </div>
      ) : (
        <div className="p-5">
          {logs.map((log, i) => (
            <FeedEntry key={log._id} log={log} isLast={i === logs.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
