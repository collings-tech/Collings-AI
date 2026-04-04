import React, { useState } from 'react';

/**
 * ThinkingBlock — displays Claude's extended thinking content in a
 * collapsible panel, styled like Claude.ai's "thinking" disclosure.
 *
 * Props:
 *   thinking {string}  — raw text from the thinking block
 */
export default function ThinkingBlock({ thinking }) {
  const [open, setOpen] = useState(false);

  if (!thinking) return null;

  // Estimate a rough word count for the summary line
  const wordCount = thinking.split(/\s+/).filter(Boolean).length;
  const summary = wordCount < 50
    ? `Thought for a moment`
    : wordCount < 150
    ? `Thought for a few seconds`
    : wordCount < 400
    ? `Thought through the approach`
    : `Thought carefully about this`;

  return (
    <div className="flex justify-start mb-1 gap-3 pl-11">
      {/* Collapsible thinking panel */}
      <div className="flex-1 max-w-lg">
        {/* Toggle button */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="group flex items-center gap-2 text-xs text-gray-500 hover:text-brand-300 transition-colors duration-150 py-1"
        >
          {/* Brain icon */}
          <svg
            className="w-3.5 h-3.5 text-brand-500/70 group-hover:text-brand-400 flex-shrink-0"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>

          <span className="italic">{summary}</span>

          {/* Chevron */}
          <svg
            className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded content */}
        {open && (
          <div className="mt-1 bg-gray-800/60 border border-brand-700/20 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-brand-700/20 bg-brand-950/30">
              <svg className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-brand-300 text-xs font-semibold tracking-wide">Internal reasoning</span>
              <span className="ml-auto text-gray-600 text-xs">{wordCount} words</span>
            </div>

            {/* Thinking text — scrollable, monospace-ish */}
            <div className="px-3 py-3 max-h-72 overflow-y-auto">
              <p className="text-gray-400 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                {thinking}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
