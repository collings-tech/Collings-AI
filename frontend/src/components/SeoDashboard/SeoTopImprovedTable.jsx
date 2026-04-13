import React from 'react';

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SeoTopImprovedTable({ posts, loading }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-gray-700/50">
        <h3 className="text-white font-semibold text-sm">Top Improved Posts</h3>
        <p className="text-gray-600 text-xs mt-0.5">Biggest score gains this month</p>
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-[11px] uppercase tracking-wider">
              <th className="px-5 py-3 text-left font-medium">Post</th>
              <th className="px-4 py-3 text-center font-medium">Before</th>
              <th className="px-4 py-3 text-center font-medium">After</th>
              <th className="px-4 py-3 text-center font-medium">Gain</th>
              <th className="px-4 py-3 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-gray-700/30">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 bg-gray-700/50 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              : posts && posts.length > 0
              ? posts.map((p) => (
                  <tr key={`${p.postId}-${p.createdAt}`} className="border-t border-gray-700/30 hover:bg-gray-700/15 transition-colors">
                    <td className="px-5 py-3 text-gray-200 max-w-xs truncate">{p.postTitle || `Post #${p.postId}`}</td>
                    <td className="px-4 py-3 text-center text-gray-500 font-mono text-xs">{p.scoreBefore}</td>
                    <td className="px-4 py-3 text-center text-gray-200 font-mono text-xs">{p.scoreAfter}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-0.5 text-green-400 font-semibold text-xs bg-green-500/10 px-2 py-0.5 rounded-md">
                        +{p.improvement}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 text-xs">{formatDate(p.createdAt)}</td>
                  </tr>
                ))
              : (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-600 text-sm">
                    No improvements recorded this month
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
