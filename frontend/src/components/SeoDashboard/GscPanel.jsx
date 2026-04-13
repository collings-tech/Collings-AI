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

function positionColor(pos) {
  if (pos <= 3) return 'text-green-400';
  if (pos <= 10) return 'text-brand-400';
  if (pos <= 20) return 'text-amber-400';
  return 'text-gray-400';
}

function truncatePage(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '') || '/';
    return path.length > 50 ? '...' + path.slice(-47) : path;
  } catch {
    return url.length > 50 ? url.slice(0, 47) + '...' : url;
  }
}

export default function GscPanel({ siteId }) {
  const [summary, setSummary] = useState(null);
  const [queries, setQueries] = useState([]);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState(null);
  const [days, setDays] = useState(28);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, qRes, pRes] = await Promise.allSettled([
        apiClient.get(`/seo/gsc/${siteId}/summary?days=${days}`),
        apiClient.get(`/seo/gsc/${siteId}/top-queries?days=${days}&limit=20`),
        apiClient.get(`/seo/gsc/${siteId}/top-pages?days=${days}`),
      ]);

      const sumData = sumRes.status === 'fulfilled' ? sumRes.value.data : null;
      const qData = qRes.status === 'fulfilled' ? qRes.value.data : null;
      const pData = pRes.status === 'fulfilled' ? pRes.value.data : null;

      if (!sumData?.available) {
        setAvailable(false);
        setUnavailableReason(sumData?.error || null);
        return;
      }

      setAvailable(true);
      setSummary(sumData);
      setQueries(qData?.queries || []);
      setPages(pData?.pages || []);
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
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <h3 className="text-white font-semibold text-sm">Google Search Console</h3>
        </div>
        <p className="text-gray-500 text-sm">
          Search Console is not connected for this site. Add the service account email as a verified user in your GSC property, then add{' '}
          <code className="text-gray-300 bg-gray-700/60 px-1.5 py-0.5 rounded text-xs">GOOGLE_SERVICE_ACCOUNT_JSON</code> to your backend environment.
        </p>
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
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <h3 className="text-white font-semibold text-sm">Google Search Console</h3>
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
              <StatCard label="Clicks" value={summary?.clicks?.toLocaleString()} />
              <StatCard label="Impressions" value={summary?.impressions?.toLocaleString()} />
              <StatCard label="Avg CTR" value={summary?.ctr != null ? `${summary.ctr}%` : '—'} />
              <StatCard
                label="Avg Position"
                value={summary?.position != null ? `#${summary.position}` : '—'}
                sub={summary?.position <= 10 ? 'Page 1' : summary?.position <= 20 ? 'Page 2' : null}
              />
            </>
          )}
        </div>

        <div>
          <h4 className="text-gray-400 text-[11px] font-semibold uppercase tracking-wider mb-2">
            Top Search Queries
          </h4>
          <div className="bg-gray-900/30 rounded-xl overflow-hidden border border-gray-700/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-[11px] uppercase tracking-wider border-b border-gray-700/30">
                    <th className="px-4 py-2.5 text-left font-medium">Query</th>
                    <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                    <th className="px-4 py-2.5 text-right font-medium">Impressions</th>
                    <th className="px-4 py-2.5 text-right font-medium">CTR</th>
                    <th className="px-4 py-2.5 text-right font-medium">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                    : queries.length > 0
                    ? queries.map((q, i) => (
                        <tr key={i} className="border-t border-gray-700/20 hover:bg-gray-700/15 transition-colors">
                          <td className="px-4 py-2.5 text-gray-200 max-w-xs truncate font-mono text-xs">{q.query}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{q.clicks.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{q.impressions.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{q.ctr}%</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${positionColor(q.position)}`}>#{q.position}</td>
                        </tr>
                      ))
                    : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-600 text-sm">
                          No search query data found for this site
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
            Top Pages by Impressions
          </h4>
          <div className="bg-gray-900/30 rounded-xl overflow-hidden border border-gray-700/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-[11px] uppercase tracking-wider border-b border-gray-700/30">
                    <th className="px-4 py-2.5 text-left font-medium">Page</th>
                    <th className="px-4 py-2.5 text-right font-medium">Impressions</th>
                    <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                    <th className="px-4 py-2.5 text-right font-medium">CTR</th>
                    <th className="px-4 py-2.5 text-right font-medium">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                    : pages.length > 0
                    ? pages.slice(0, 20).map((p, i) => (
                        <tr key={i} className="border-t border-gray-700/20 hover:bg-gray-700/15 transition-colors">
                          <td className="px-4 py-2.5 text-gray-200 font-mono text-xs max-w-xs truncate" title={p.page}>
                            {truncatePage(p.page)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{p.impressions.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{p.clicks.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{p.ctr}%</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${positionColor(p.position)}`}>#{p.position}</td>
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
      </div>
    </div>
  );
}
