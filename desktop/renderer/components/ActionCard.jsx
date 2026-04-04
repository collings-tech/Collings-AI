import React, { useState } from 'react';

export default function ActionCard({ actionResult }) {
  const [expanded, setExpanded] = useState(false);

  if (!actionResult) return null;
  if (actionResult.error) {
    return (
      <div className="mx-4 mb-3 bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 flex items-start gap-3">
        <div className="flex-shrink-0 w-7 h-7 bg-red-800/60 rounded-lg flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-red-300 text-sm font-medium">Action Failed</p>
          <p className="text-red-400 text-xs mt-0.5">{actionResult.error}</p>
        </div>
      </div>
    );
  }

  const title = actionResult.title?.rendered || actionResult.title || 'Action completed';
  const id = actionResult.id;
  const status = actionResult.status;
  const type = actionResult.type || 'post';
  const link = actionResult.link || actionResult.guid?.rendered;

  return (
    <div className="mx-4 mb-3 bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-7 h-7 bg-emerald-800/50 rounded-lg flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-emerald-300 text-sm font-medium">WordPress Action Executed</p>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-emerald-600 hover:text-emerald-400 text-xs transition-colors"
            >
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          </div>
          <p className="text-emerald-200 text-xs mt-0.5 truncate">
            {type.charAt(0).toUpperCase() + type.slice(1)} saved as <span className="font-semibold">{status}</span>
            {id && <span> — ID: {id}</span>}
          </p>
          {title && (
            <p className="text-white text-xs mt-1 font-medium truncate" title={title}>
              "{title}"
            </p>
          )}
          {expanded && (
            <div className="mt-2 pt-2 border-t border-emerald-800/40 space-y-1">
              {id && <p className="text-emerald-400 text-xs">ID: {id}</p>}
              {status && <p className="text-emerald-400 text-xs">Status: {status}</p>}
              {link && (
                <p className="text-emerald-400 text-xs truncate">
                  URL: <span className="font-mono">{link}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
