import React from 'react';

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ScoreBadge({ before, after }) {
  const diff = after - before;
  let cls = 'text-gray-400 bg-gray-700';
  if (diff >= 20) cls = 'text-green-300 bg-green-900/40';
  else if (diff >= 5) cls = 'text-amber-300 bg-amber-900/40';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {before} → {after} {diff > 0 && `(+${diff})`}
    </span>
  );
}

export default function SeoJobCard({ log }) {
  const { postTitle, scoreBefore, scoreAfter, changes, createdAt } = log;
  const tags = [];
  if (changes?.focusKeyword?.after) tags.push('Keyword');
  if (changes?.metaTitle?.after) tags.push('Meta title');
  if (changes?.metaDescription?.after) tags.push('Meta desc');
  if (changes?.internalLinksAdded > 0) tags.push(`${changes.internalLinksAdded} link${changes.internalLinksAdded > 1 ? 's' : ''}`);
  if (changes?.contentRewritten) tags.push('Rewritten');

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-white font-medium truncate flex-1">{postTitle || `Post #${log.postId}`}</span>
        <span className="text-xs text-gray-500 shrink-0">{timeAgo(createdAt)}</span>
      </div>
      <ScoreBadge before={scoreBefore} after={scoreAfter} />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-brand-900/40 text-brand-300 border border-brand-800/50">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
