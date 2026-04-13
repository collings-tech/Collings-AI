import React, { useEffect, useState, useCallback } from 'react';
import apiClient from '../../api/client';

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-700/50 rounded-xl px-4 py-3 text-center">
      <div className="text-white font-bold text-xl leading-tight">{value ?? '—'}</div>
      <div className="text-gray-400 text-xs mt-0.5">{label}</div>
      {sub && <div className="text-gray-500 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

function SkeletonRow({ cols }) {
  return (
    <tr className="border-t border-gray-700/50">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-gray-700 rounded animate-pulse" />
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
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">📊</span>
          <h3 className="text-white font-semibold text-sm">Google Analytics 4</h3>
        </div>
        <p className="text-gray-500 text-sm mt-3">
          Google Analytics is not connected for this site. To connect:
        </p>
        <ol className="text-gray-500 text-sm mt-2 space-y-1 list-decimal list-inside">
          <li>
            Add the service account email from{' '}
            <code className="text-gray-300 bg-gray-700 px-1 rounded text-xs">GOOGLE_SERVICE_ACCOUNT_JSON</code>{' '}
            as a <strong className="text-gray-300">Viewer</strong> in GA4 → Admin → Property Access Management.
          </li>
          <li>
            Set <code className="text-gray-300 bg-gray-700 px-1 rounded text-xs">gaPropertyId</code> on this site
            to your GA4 property ID (e.g.{' '}
            <code className="text-gray-300 bg-gray-700 px-1 rounded text-xs">properties/123456789</code>{' '}
            — found in GA4 Admin → Property Settings).
          </li>
        </ol>
        {unavailableReason && (
          <p className="text-red-400/70 text-xs mt-3 font-mono bg-gray-900/50 px-3 py-2 rounded-lg">
            Error: {unavailableReason}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <h3 className="text-white font-semibold text-sm">Google Analytics 4</h3>
        </div>
        <div className="flex gap-1">
          {[7, 28, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                days === d
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Summary stat cards */}
        <div className="grid grid-cols-4 gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-700/50 rounded-xl px-4 py-3">
                <div className="h-6 bg-gray-600 rounded animate-pulse mb-1" />
                <div className="h-3 bg-gray-700 rounded animate-pulse w-2/3 mx-auto" />
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
                    ? summary.bounceRate <= 40
                      ? 'Low'
                      : summary.bounceRate <= 65
                      ? 'Average'
                      : 'High'
                    : null
                }
              />
            </>
          )}
        </div>

        {/* Top Pages */}
        <div>
          <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
            Top Pages by Sessions
          </h4>
          <div className="bg-gray-900/40 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-700/50">
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
                        <tr
                          key={i}
                          className="border-t border-gray-700/30 hover:bg-gray-700/20 transition-colors"
                        >
                          <td
                            className="px-4 py-2.5 text-gray-200 font-mono text-xs max-w-xs truncate"
                            title={p.page}
                          >
                            {p.page.length > 55 ? '...' + p.page.slice(-52) : p.page}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{p.sessions.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">{p.pageviews.toLocaleString()}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${bounceColor(p.bounceRate)}`}>
                            {p.bounceRate}%
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-400">{fmtDuration(p.avgDuration)}</td>
                        </tr>
                      ))
                    : (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-gray-500 text-sm">
                          No page data found for this site
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Traffic Sources */}
        <div>
          <h4 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
            Traffic Sources
          </h4>
          <div className="bg-gray-900/40 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-700/50">
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
                        <tr
                          key={i}
                          className="border-t border-gray-700/30 hover:bg-gray-700/20 transition-colors"
                        >
                          <td className="px-4 py-2.5 text-gray-200 text-xs">{s.source}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{s.sessions.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">{s.pct}%</td>
                          <td className="px-4 py-2.5 pl-6">
                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden w-24">
                              <div
                                className="h-full bg-brand-500 rounded-full"
                                style={{ width: `${Math.min(100, s.pct)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    : (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500 text-sm">
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
