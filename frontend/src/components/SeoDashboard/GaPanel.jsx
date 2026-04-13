import React, { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-700/30 rounded-xl px-4 py-3 text-center">
      <div className="text-white font-bold text-xl leading-tight">{value ?? '—'}</div>
      <div className="text-gray-500 text-xs mt-0.5">{label}</div>
      {sub && <div className="text-gray-600 text-[11px] mt-0.5">{sub}</div>}
    </div>
  );
}

function SkeletonRow({ cols }) {
  return (
    <tr className="border-t border-gray-700/30">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-gray-700/50 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function bounceColor(rate) {
  if (rate <= 40) return 'text-green-400';
  if (rate <= 65) return 'text-amber-400';
  return 'text-red-400';
}

function fmtDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function GaPanel({ siteId }) {
  const [summary, setSummary] = useState(null);
  const [pages, setPages] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState(null);
  const [days, setDays] = useState(28);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, pagesRes, sourcesRes] = await Promise.allSettled([
        apiClient.get(`/seo/ga/${siteId}/summary?days=${days}`),
        apiClient.get(`/seo/ga/${siteId}/top-pages?days=${days}&limit=20`),
        apiClient.get(`/seo/ga/${siteId}/traffic-sources?days=${days}`),
      ]);

      const sumData = sumRes.status === 'fulfilled' ? sumRes.value.data : null;
      const pagesData = pagesRes.status === 'fulfilled' ? pagesRes.value.data : null;
      const sourcesData = sourcesRes.status === 'fulfilled' ? sourcesRes.value.data : null;

      if (!sumData?.available) {
        setAvailable(false);
        setUnavailableReason(sumData?.error || null);
        return;
      }

      setAvailable(true);
      setSummary(sumData);
      setPages(pagesData?.pages || []);
      setSources(sourcesData?.sources || []);
    } catch (err) {
      setAvailable(false);
      setUnavailableReason(err?.response?.data?.error || err?.message || null);
    } finally {
      setLoading(false);
    }
  }, [siteId, days]);

  useEffect(() => { load(); }, [load]);

  if (!loading && !available) {
    return (
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <h3 className="text-white font-semibold text-sm">Google Analytics 4</h3>
        </div>
        <p className="text-gray-500 text-sm">
          Google Analytics is not connected for this site. To connect:
        </p>
        <ol className="text-gray-500 text-sm mt-2 space-y-1.5 list-decimal list-inside">
          <li>
            Add the service account email from{' '}
            <code className="text-gray-300 bg-gray-700/60 px-1.5 py-0.5 rounded text-xs">GOOGLE_SERVICE_ACCOUNT_JSON</code>{' '}
            as a <strong className="text-gray-300">Viewer</strong> in GA4 Admin &rarr; Property Access Management.
          </li>
          <li>
            Set <code className="text-gray-300 bg-gray-700/60 px-1.5 py-0.5 rounded text-xs">gaPropertyId</code> on this site
            to your GA4 property ID (e.g.{' '}
            <code className="text-gray-300 bg-gray-700/60 px-1.5 py-0.5 rounded text-xs">properties/123456789</code>).
          </li>
        </ol>
        {unavailableReason && (
          <p className="text-red-400/70 text-xs mt-3 font-mono bg-gray-900/40 px-3 py-2 rounded-lg border border-red-500/10">
            Error: {unavailableReason}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <h3 className="text-white font-semibold text-sm">Google Analytics 4</h3>
        </div>
        <div className="flex bg-gray-800/80 rounded-lg border border-gray-700/50 p-0.5">
          {[7, 28, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                days === d
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-700/30 rounded-xl px-4 py-3">
                <div className="h-6 bg-gray-600/40 rounded animate-pulse mb-1" />
                <div className="h-3 bg-gray-700/50 rounded animate-pulse w-2/3 mx-auto" />
              </div>
            ))
          ) : (
            <>
              <StatCard label="Sessions" value={summary?.sessions?.toLocaleString()} />
              <StatCard label="Users" value={summary?.users?.toLocaleString()} />
              <StatCard label="Pageviews" value={summary?.pageviews?.toLocaleString()} />
              <StatCard
                label="Bounce Rate"
                value={summary?.bounceRate != null ? `${summary.bounceRate}%` : '—'}
                sub={
                  summary?.bounceRate != null
                    ? summary.bounceRate <= 40 ? 'Low' : summary.bounceRate <= 65 ? 'Average' : 'High'
                    : null
                }
              />
            </>
          )}
        </div>

        <div>
          <h4 className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider mb-2">
            Top Pages by Sessions
          </h4>
          <div className="bg-gray-900/30 rounded-xl overflow-hidden border border-gray-700/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-[11px] uppercase tracking-wider border-b border-gray-700/30">
                    <th className="px-4 py-2.5 text-left font-medium">Page</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sessions</th>
                    <th className="px-4 py-2.5 text-right font-medium">Pageviews</th>
                    <th className="px-4 py-2.5 text-right font-medium">Bounce Rate</th>
                    <th className="px-4 py-2.5 text-right font-medium">Avg Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                    : pages.length > 0
                    ? pages.map((p, i) => (
                        <tr key={i} className="border-t border-gray-700/20 hover:bg-gray-700/15 transition-colors">
                          <td className="px-4 py-2.5 text-gray-200 font-mono text-xs max-w-xs truncate" title={p.page}>
                            {p.page.length > 55 ? '...' + p.page.slice(-52) : p.page}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{p.sessions.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{p.pageviews.toLocaleString()}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${bounceColor(p.bounceRate)}`}>
                            {p.bounceRate}%
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{fmtDuration(p.avgDuration)}</td>
                        </tr>
                      ))
                    : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-600 text-sm">
                          No page data found for this site
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider mb-2">
            Traffic Sources
          </h4>
          <div className="bg-gray-900/30 rounded-xl overflow-hidden border border-gray-700/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-[11px] uppercase tracking-wider border-b border-gray-700/30">
                    <th className="px-4 py-2.5 text-left font-medium">Channel</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sessions</th>
                    <th className="px-4 py-2.5 text-right font-medium">% of Total</th>
                    <th className="px-4 py-2.5 text-left font-medium pl-6">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
                    : sources.length > 0
                    ? sources.map((s, i) => (
                        <tr key={i} className="border-t border-gray-700/20 hover:bg-gray-700/15 transition-colors">
                          <td className="px-4 py-2.5 text-gray-200 text-xs">{s.source}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{s.sessions.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{s.pct}%</td>
                          <td className="px-4 py-2.5 pl-6">
                            <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden w-24">
                              <div
                                className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, s.pct)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-600 text-sm">
                          No traffic source data found for this site
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
