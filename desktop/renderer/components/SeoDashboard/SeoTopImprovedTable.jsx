import React from 'react';

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SeoTopImprovedTable({ posts, loading }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700">
        <h3 className="text-white font-semibold text-sm">Top Improved Posts (This Month)</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-5 py-2.5 text-left font-medium">Post</th>
              <th className="px-4 py-2.5 text-center font-medium">Before</th>
              <th className="px-4 py-2.5 text-center font-medium">After</th>
              <th className="px-4 py-2.5 text-center font-medium">Gain</th>
              <th className="px-4 py-2.5 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
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
                  <tr key={`${p.postId}-${p.createdAt}`} className="border-t border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-5 py-3 text-gray-200 max-w-xs truncate">{p.postTitle || `Post #${p.postId}`}</td>
                    <td className="px-4 py-3 text-center text-gray-400">{p.scoreBefore}</td>
                    <td className="px-4 py-3 text-center text-gray-200">{p.scoreAfter}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-green-400 font-semibold">+{p.improvement}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatDate(p.createdAt)}</td>
                  </tr>
                ))
              : (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-500 text-sm">
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
