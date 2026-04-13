import React, { useState } from 'react';
import client from '../../api/client';

function StatusBadge({ status }) {
  if (status === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Critical
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      Poor
    </span>
  );
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
      await client.post(`/seo/jobs/${siteId}`, { postId: post.postId, postType: 'post' });
      setTriggered((p) => ({ ...p, [post.postId]: true }));
    } catch {
      // silent fail
    } finally {
      setTriggering((p) => ({ ...p, [post.postId]: false }));
    }
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-gray-700/50">
        <h3 className="text-white font-semibold text-sm">Needs Attention</h3>
        <p className="text-gray-600 text-xs mt-0.5">Posts with low SEO scores</p>
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-[11px] uppercase tracking-wider">
              <th className="px-5 py-3 text-left font-medium">Post</th>
              <th className="px-4 py-3 text-center font-medium">Score</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Last Run</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-700/30">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 bg-gray-700/50 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              : posts && posts.length > 0
              ? posts.map((p) => (
                  <tr key={p.postId} className="border-t border-gray-700/30 hover:bg-gray-700/15 transition-colors">
                    <td className="px-5 py-3 text-gray-200 max-w-xs truncate">{p.postTitle || `Post #${p.postId}`}</td>
                    <td className="px-4 py-3 text-center text-white font-semibold font-mono text-xs">{p.currentScore}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-right text-gray-600 text-xs">{timeAgo(p.lastOptimized)}</td>
                    <td className="px-4 py-3 text-right">
                      {triggered[p.postId] ? (
                        <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          Queued
                        </span>
                      ) : (
                        <button
                          onClick={() => handleTrigger(p)}
                          disabled={triggering[p.postId]}
                          className="text-xs px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium shadow-sm shadow-brand-600/20"
                        >
                          {triggering[p.postId] ? (
                            <span className="inline-flex items-center gap-1">
                              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              ...
                            </span>
                          ) : 'Optimize'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              : (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center">
                    <span className="inline-flex items-center gap-1.5 text-green-400 text-sm font-medium">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      All posts are healthy
                    </span>
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
