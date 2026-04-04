import React, { useState } from 'react';

function StatusBadge({ status }) {
  if (status === 'critical') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/40 text-red-300 border border-red-800/50 font-medium">Critical</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-800/50 font-medium">Poor</span>;
}

function timeAgo(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'Just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SeoAttentionTable({ posts, siteId, loading }) {
  const [triggering, setTriggering] = useState({});
  const [triggered, setTriggered] = useState({});

  const handleTrigger = async (post) => {
    setTriggering((p) => ({ ...p, [post.postId]: true }));
    try {
      await window.electronAPI.invoke('seo:trigger-job', {
        siteId,
        postId: post.postId,
        postType: 'post',
      });
      setTriggered((p) => ({ ...p, [post.postId]: true }));
    } catch {
      // silent fail
    } finally {
      setTriggering((p) => ({ ...p, [post.postId]: false }));
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700">
        <h3 className="text-white font-semibold text-sm">Posts Needing Attention</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-5 py-2.5 text-left font-medium">Post</th>
              <th className="px-4 py-2.5 text-center font-medium">Score</th>
              <th className="px-4 py-2.5 text-center font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Last Optimized</th>
              <th className="px-4 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-700/50">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-gray-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : posts && posts.length > 0
              ? posts.map((p) => (
                  <tr key={p.postId} className="border-t border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-5 py-3 text-gray-200 max-w-xs truncate">{p.postTitle || `Post #${p.postId}`}</td>
                    <td className="px-4 py-3 text-center text-white font-semibold">{p.currentScore}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-right text-gray-500">{timeAgo(p.lastOptimized)}</td>
                    <td className="px-4 py-3 text-right">
                      {triggered[p.postId] ? (
                        <span className="text-green-400 text-xs font-medium">Queued!</span>
                      ) : (
                        <button
                          onClick={() => handleTrigger(p)}
                          disabled={triggering[p.postId]}
                          className="text-xs px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
                        >
                          {triggering[p.postId] ? '...' : 'Optimize Now'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              : (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-green-400 text-sm">
                    All posts are healthy!
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
