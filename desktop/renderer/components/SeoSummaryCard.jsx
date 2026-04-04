import React, { useState } from 'react';

function extractSeoData(content) {
  // Try to find SEO-related data mentioned in the AI reply
  const data = {};

  const stripMd = (s) => s.replace(/\*\*/g, '').replace(/^["']|["']$/g, '').trim();

  // Focus keyword
  const kwMatch = content.match(/focus keyword[:\s]+([^\n,\.]+)/i);
  if (kwMatch) data.focusKeyword = stripMd(kwMatch[1]);

  // Meta title
  const titleMatch = content.match(/(?:meta title|seo title)[:\s]+"?([^"\n]+)"?/i);
  if (titleMatch) data.metaTitle = stripMd(titleMatch[1]);

  // Meta description
  const descMatch = content.match(/meta description[:\s]+"?([^"\n]+)"?/i);
  if (descMatch) data.metaDescription = stripMd(descMatch[1]);

  // SEO plugin
  const pluginMatch = content.match(/(?:using|via|through|applied via)\s+(yoast|rank math|rankmath)/i);
  if (pluginMatch) data.plugin = pluginMatch[1];

  return data;
}

function CharCount({ text, min, max }) {
  if (!text) return null;
  const len = text.length;
  const ok = len >= min && len <= max;
  const color = ok ? 'text-emerald-400' : 'text-amber-400';
  return (
    <span className={`text-xs ml-1 ${color}`}>({len} chars)</span>
  );
}

export default function SeoSummaryCard({ content, detectedSeoPlugin }) {
  const [expanded, setExpanded] = useState(true);

  // Only show if message mentions SEO actions
  const hasSeo = /(?:seo|meta title|meta description|focus keyword|yoast|rank math|rankmath)/i.test(content);
  if (!hasSeo) return null;

  const data = extractSeoData(content);
  const hasData = data.focusKeyword || data.metaTitle || data.metaDescription;
  if (!hasData) return null;

  const pluginLabel = detectedSeoPlugin === 'yoast'
    ? 'Yoast SEO'
    : detectedSeoPlugin === 'rankmath'
    ? 'Rank Math'
    : data.plugin || 'SEO Plugin';

  return (
    <div className="mx-4 mb-3 bg-brand-900/20 border border-brand-700/40 rounded-xl px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-7 h-7 bg-brand-800/50 rounded-lg flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-brand-300 text-sm font-medium">SEO Metadata Applied</p>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-brand-900/60 border border-brand-700/40 text-brand-300 px-2 py-0.5 rounded-full">
                {pluginLabel}
              </span>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-brand-600 hover:text-brand-400 text-xs transition-colors"
              >
                {expanded ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Draft confirmation */}
          <div className="flex items-center gap-1.5 mt-1">
            <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-emerald-400 text-xs">Saved as Draft</span>
          </div>

          {expanded && (
            <div className="mt-3 space-y-2 pt-2 border-t border-brand-800/40">
              {data.focusKeyword && (
                <div>
                  <span className="text-brand-400 text-xs font-medium uppercase tracking-wide">Focus Keyword</span>
                  <p className="text-gray-200 text-sm mt-0.5">{data.focusKeyword}</p>
                </div>
              )}
              {data.metaTitle && (
                <div>
                  <span className="text-brand-400 text-xs font-medium uppercase tracking-wide">
                    Meta Title <CharCount text={data.metaTitle} min={50} max={60} />
                  </span>
                  <p className="text-gray-200 text-sm mt-0.5">{data.metaTitle}</p>
                </div>
              )}
              {data.metaDescription && (
                <div>
                  <span className="text-brand-400 text-xs font-medium uppercase tracking-wide">
                    Meta Description <CharCount text={data.metaDescription} min={140} max={160} />
                  </span>
                  <p className="text-gray-200 text-sm mt-0.5">{data.metaDescription}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
