import React, { useEffect, useState } from 'react';
import SeoJobCard from './SeoJobCard';

export default function SeoActivityPanel({ siteId, isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !siteId) return;
    setLoading(true);
    window.electronAPI
      .invoke('seo:get-activity-panel', { siteId })
      .then((result) => {
        if (!result.error) {
          setLogs(result.logs || []);
          setPendingCount(result.pendingCount || 0);
        }
      })
      .finally(() => setLoading(false));
  }, [isOpen, siteId]);

  return (
    <>
      {/* Tab when closed */}
      {!isOpen && (
        <button
          onClick={() => {}}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-gray-800 border border-gray-700 border-r-0 rounded-l-xl px-2 py-4 text-gray-400 hover:text-white transition-colors z-20"
          style={{ writingMode: 'vertical-rl' }}
        >
          SEO
        </button>
      )}

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl z-30 flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h3 className="text-white font-semibold text-sm">SEO Bot Activity</h3>
            {pendingCount > 0 && (
              <p className="text-xs text-amber-400 mt-0.5">{pendingCount} job{pendingCount !== 1 ? 's' : ''} pending</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4 animate-pulse">
                <div className="h-3 bg-gray-700 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-700 rounded w-1/2" />
              </div>
            ))
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
              <p className="text-gray-500 text-sm">No SEO activity yet for this site.</p>
            </div>
          ) : (
            logs.map((log) => <SeoJobCard key={log._id} log={log} />)
          )}
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-20" onClick={onClose} />
      )}
    </>
  );
}
