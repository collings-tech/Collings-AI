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
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((t) => (
        <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{t}</span>
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
    <div className="mt-3 pl-3 border-l-2 border-gray-700 flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label}>
          <p className="text-xs text-gray-500 mb-0.5">{r.label}</p>
          <p className="text-xs text-gray-500 line-through truncate">{r.before}</p>
          <p className="text-xs text-gray-300 truncate">{r.after}</p>
        </div>
      ))}
      {changes?.contentRewritten && <p className="text-xs text-amber-400">Full content rewrite applied</p>}
      {changes?.internalLinksAdded > 0 && <p className="text-xs text-brand-400">{changes.internalLinksAdded} internal link{changes.internalLinksAdded > 1 ? 's' : ''} added</p>}
    </div>
  );
}

function FeedEntry({ log }) {
  const [expanded, setExpanded] = useState(false);
  const diff = log.scoreAfter - log.scoreBefore;
  const diffColor = diff >= 10 ? 'text-green-400' : diff >= 0 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="border-b border-gray-700/50 py-3 px-4 cursor-pointer hover:bg-gray-700/20 transition-colors" onClick={() => setExpanded((e) => !e)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-gray-200 truncate flex-1">{log.postTitle || `Post #${log.postId}`}</p>
        <span className="text-xs text-gray-500 shrink-0">{timeAgo(log.createdAt)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-500">{log.scoreBefore} → {log.scoreAfter}</span>
        <span className={`text-xs font-semibold ${diffColor}`}>{diff >= 0 ? '+' : ''}{diff}</span>
      </div>
      <ChangeTags changes={log.changes} />
      {expanded && <ExpandedDetails changes={log.changes} />}
    </div>
  );
}

export default function SeoActivityFeed({ logs, loading }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700">
        <h3 className="text-white font-semibold text-sm">Recent Bot Activity</h3>
        <p className="text-xs text-gray-500 mt-0.5">Click an entry to expand details</p>
      </div>
      {loading ? (
        <div className="divide-y divide-gray-700/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 animate-pulse">
              <div className="h-3 bg-gray-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="px-5 py-10 text-center text-gray-500 text-sm">No activity recorded yet</div>
      ) : (
        <div>{logs.map((log) => <FeedEntry key={log._id} log={log} />)}</div>
      )}
    </div>
  );
}
