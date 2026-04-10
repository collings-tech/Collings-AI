import React, { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import useAppStore from '../store/appStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(d));
}

function timeAgo(d) {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

function scoreDiff(before, after) {
  const diff = after - before;
  if (diff > 0) return { label: `+${diff}`, cls: 'text-emerald-400 bg-emerald-900/30' };
  if (diff < 0) return { label: `${diff}`, cls: 'text-red-400 bg-red-900/30' };
  return { label: '±0', cls: 'text-gray-400 bg-gray-700/50' };
}

function scoreColor(score) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function jobStatusBadge(status) {
  switch (status) {
    case 'completed': return 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/50';
    case 'failed': return 'bg-red-900/40 text-red-300 border border-red-800/50';
    case 'processing': return 'bg-brand-900/40 text-brand-300 border border-brand-800/50';
    case 'pending': return 'bg-gray-700/50 text-gray-400 border border-gray-600/50';
    default: return 'bg-gray-700/50 text-gray-400 border border-gray-600/50';
  }
}

function triggeredByLabel(t) {
  switch (t) {
    case 'new_post': return 'New post';
    case 'nightly_sweep': return 'Nightly sweep';
    case 'manual': return 'Manual';
    case 'low_score': return 'Low score';
    case 'quick_sweep':
    case '5min_sweep': return 'Quick sweep';
    case 'image_check': return 'Image check';
    default: return t || '—';
  }
}

function jobActionLabel(result) {
  if (!result) return null;
  switch (result.action) {
    case 'seo_optimization': return { label: 'SEO Optimization', cls: 'bg-brand-900/30 text-brand-300 border-brand-800/40' };
    case 'alt_text': return { label: 'Alt Text Added', cls: 'bg-purple-900/30 text-purple-300 border-purple-800/40' };
    case 'skipped': return { label: 'Skipped', cls: 'bg-gray-700/50 text-gray-400 border-gray-600/50' };
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// LogEntry — expandable SEO optimization record
// ---------------------------------------------------------------------------

function LogEntry({ log }) {
  const [expanded, setExpanded] = useState(false);
  const diff = scoreDiff(log.scoreBefore, log.scoreAfter);
  const hasChanges = log.changes && (
    log.changes.focusKeyword?.after ||
    log.changes.metaTitle?.after ||
    log.changes.metaDescription?.after ||
    log.changes.internalLinksAdded > 0 ||
    log.changes.contentRewritten
  );

  return (
    <div className="border-b border-gray-700/40 last:border-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-5 py-4 hover:bg-gray-700/20 transition-colors"
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 w-8 h-8 bg-emerald-900/40 border border-emerald-800/50 rounded-xl flex items-center justify-center mt-0.5">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800/40">
                SEO Optimized
              </span>
              <span className="text-gray-500 text-xs">{timeAgo(log.createdAt)}</span>
            </div>
            <p className="text-white text-sm font-medium mt-1 truncate">
              {log.postTitle || `Post #${log.postId}`}
            </p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span>Score:</span>
                <span className={`font-semibold ${scoreColor(log.scoreBefore)}`}>{log.scoreBefore}</span>
                <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className={`font-semibold ${scoreColor(log.scoreAfter)}`}>{log.scoreAfter}</span>
                <span className={`ml-1 px-1.5 py-0.5 rounded-md text-xs font-bold ${diff.cls}`}>{diff.label}</span>
              </div>
              {hasChanges && (
                <div className="flex items-center gap-1 flex-wrap">
                  {log.changes.focusKeyword?.after && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">Keyword</span>}
                  {log.changes.metaTitle?.after && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">Meta title</span>}
                  {log.changes.metaDescription?.after && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">Meta desc</span>}
                  {log.changes.internalLinksAdded > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{log.changes.internalLinksAdded} links</span>}
                  {log.changes.contentRewritten && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">Rewritten</span>}
                </div>
              )}
            </div>
          </div>

          {/* Expand chevron */}
          <svg
            className={`w-4 h-4 text-gray-600 flex-shrink-0 transition-transform duration-200 mt-1 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-4 ml-11">
          <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Changes Applied</p>

            {/* Score bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Before</span>
                <span>After</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${log.scoreBefore}%`, backgroundColor: log.scoreBefore >= 80 ? '#22c55e' : log.scoreBefore >= 60 ? '#f59e0b' : '#ef4444' }}
                  />
                </div>
                <span className={`text-xs font-bold w-6 text-center ${scoreColor(log.scoreBefore)}`}>{log.scoreBefore}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${log.scoreAfter}%`, backgroundColor: log.scoreAfter >= 80 ? '#22c55e' : log.scoreAfter >= 60 ? '#f59e0b' : '#ef4444' }}
                  />
                </div>
                <span className={`text-xs font-bold w-6 text-center ${scoreColor(log.scoreAfter)}`}>{log.scoreAfter}</span>
              </div>
            </div>

            {log.changes.focusKeyword?.after && (
              <div>
                <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-1">Focus Keyword</p>
                <p className="text-xs text-gray-500 line-through">
                  {log.changes.focusKeyword.before || <span className="italic">Not set</span>}
                </p>
                <p className="text-xs text-gray-200">{log.changes.focusKeyword.after}</p>
              </div>
            )}

            {log.changes.metaTitle?.after && (
              <div>
                <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-1">Meta Title</p>
                <p className="text-xs text-gray-500 line-through leading-relaxed">
                  {log.changes.metaTitle.before || <span className="italic">Not set</span>}
                </p>
                <p className="text-xs text-gray-200 leading-relaxed">{log.changes.metaTitle.after}</p>
              </div>
            )}

            {log.changes.metaDescription?.after && (
              <div>
                <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-1">Meta Description</p>
                <p className="text-xs text-gray-500 line-through leading-relaxed">
                  {log.changes.metaDescription.before || <span className="italic">Not set</span>}
                </p>
                <p className="text-xs text-gray-200 leading-relaxed">{log.changes.metaDescription.after}</p>
              </div>
            )}

            {log.changes.internalLinksAdded > 0 && (
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <span className="text-xs text-brand-300">{log.changes.internalLinksAdded} internal link{log.changes.internalLinksAdded > 1 ? 's' : ''} added</span>
              </div>
            )}

            {log.changes.contentRewritten && (
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="text-xs text-amber-300">Full content rewrite applied</span>
              </div>
            )}

            <p className="text-xs text-gray-600 pt-1 border-t border-gray-700/50">
              Post ID: {log.postId} · {formatDate(log.createdAt)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JobEntry — expandable job queue record
// ---------------------------------------------------------------------------

function JobEntry({ job }) {
  const [expanded, setExpanded] = useState(false);
  const actionInfo = jobActionLabel(job.result);
  const r = job.result;

  return (
    <div className="border-b border-gray-700/40 last:border-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-5 py-4 hover:bg-gray-700/20 transition-colors"
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 border ${
            job.status === 'completed' ? 'bg-emerald-900/40 border-emerald-800/50' :
            job.status === 'failed' ? 'bg-red-900/40 border-red-800/50' :
            job.status === 'processing' ? 'bg-brand-900/40 border-brand-800/50' :
            'bg-gray-700/50 border-gray-600/50'
          }`}>
            {job.status === 'completed' ? (
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : job.status === 'failed' ? (
              <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${jobStatusBadge(job.status)}`}>
                Job {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </span>
              {actionInfo && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${actionInfo.cls}`}>
                  {actionInfo.label}
                </span>
              )}
              <span className="text-gray-500 text-xs">
                {timeAgo(job.completedAt || job.startedAt || job.scheduledAt)}
              </span>
            </div>
            <p className="text-white text-sm font-medium mt-1">
              {r?.postTitle || `${job.postType.charAt(0).toUpperCase() + job.postType.slice(1)} #${job.postId}`}
            </p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-xs text-gray-500">
                Triggered by: <span className="text-gray-300">{triggeredByLabel(job.triggeredBy)}</span>
              </span>
              <span className="text-xs text-gray-500">
                Priority: <span className={`font-semibold ${job.priority === 1 ? 'text-red-400' : job.priority === 2 ? 'text-amber-400' : 'text-gray-300'}`}>
                  {job.priority === 1 ? 'High' : job.priority === 2 ? 'Medium' : 'Low'}
                </span>
              </span>
              {r?.action === 'seo_optimization' && r.scoreBefore != null && r.scoreAfter != null && (
                <span className="text-xs text-gray-500">
                  Score: <span className={scoreColor(r.scoreBefore)}>{r.scoreBefore}</span>
                  <span className="text-gray-600 mx-1">→</span>
                  <span className={scoreColor(r.scoreAfter)}>{r.scoreAfter}</span>
                  <span className={`ml-1 px-1 rounded font-bold text-xs ${scoreDiff(r.scoreBefore, r.scoreAfter).cls}`}>
                    {scoreDiff(r.scoreBefore, r.scoreAfter).label}
                  </span>
                </span>
              )}
              {r?.action === 'skipped' && r.skippedReason && (
                <span className="text-xs text-gray-500 italic">{r.skippedReason}</span>
              )}
              {job.error && <span className="text-xs text-red-400 truncate max-w-xs">{job.error}</span>}
            </div>
          </div>

          <svg
            className={`w-4 h-4 text-gray-600 flex-shrink-0 transition-transform duration-200 mt-1 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 ml-11">
          <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Job Details</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              <div><span className="text-gray-500">Post ID</span><p className="text-gray-200 font-mono">{job.postId}</p></div>
              <div><span className="text-gray-500">Type</span><p className="text-gray-200">{job.postType}</p></div>
              <div><span className="text-gray-500">Triggered by</span><p className="text-gray-200">{triggeredByLabel(job.triggeredBy)}</p></div>
              <div><span className="text-gray-500">Priority</span>
                <p className={`font-semibold ${job.priority === 1 ? 'text-red-400' : job.priority === 2 ? 'text-amber-400' : 'text-gray-300'}`}>
                  {job.priority === 1 ? 'High (P1)' : job.priority === 2 ? 'Medium (P2)' : 'Low (P3)'}
                </p>
              </div>
              <div><span className="text-gray-500">Scheduled</span><p className="text-gray-400">{formatDate(job.scheduledAt)}</p></div>
              {job.startedAt && <div><span className="text-gray-500">Started</span><p className="text-gray-400">{formatDate(job.startedAt)}</p></div>}
              {job.completedAt && <div><span className="text-gray-500">Completed</span><p className="text-gray-400">{formatDate(job.completedAt)}</p></div>}
            </div>

            {/* Result: SEO Optimization changes */}
            {r?.action === 'seo_optimization' && r.changes && (
              <div className="pt-2 border-t border-gray-700/50 space-y-2">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Changes Applied</p>
                {r.scoreBefore != null && r.scoreAfter != null && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Score</span>
                    <span className={`font-bold ${scoreColor(r.scoreBefore)}`}>{r.scoreBefore}</span>
                    <span className="text-gray-600">→</span>
                    <span className={`font-bold ${scoreColor(r.scoreAfter)}`}>{r.scoreAfter}</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${scoreDiff(r.scoreBefore, r.scoreAfter).cls}`}>
                      {scoreDiff(r.scoreBefore, r.scoreAfter).label}
                    </span>
                  </div>
                )}
                {r.changes.focusKeyword?.after && (
                  <div>
                    <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-0.5">Focus Keyword</p>
                    {r.changes.focusKeyword.before && <p className="text-xs text-gray-500 line-through">{r.changes.focusKeyword.before}</p>}
                    <p className="text-xs text-gray-200">{r.changes.focusKeyword.after}</p>
                  </div>
                )}
                {r.changes.metaTitle?.after && (
                  <div>
                    <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-0.5">Meta Title</p>
                    {r.changes.metaTitle.before && <p className="text-xs text-gray-500 line-through leading-relaxed">{r.changes.metaTitle.before}</p>}
                    <p className="text-xs text-gray-200 leading-relaxed">{r.changes.metaTitle.after}</p>
                  </div>
                )}
                {r.changes.metaDescription?.after && (
                  <div>
                    <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-0.5">Meta Description</p>
                    {r.changes.metaDescription.before && <p className="text-xs text-gray-500 line-through leading-relaxed">{r.changes.metaDescription.before}</p>}
                    <p className="text-xs text-gray-200 leading-relaxed">{r.changes.metaDescription.after}</p>
                  </div>
                )}
                {r.changes.internalLinksAdded > 0 && (
                  <p className="text-xs text-brand-300">{r.changes.internalLinksAdded} internal link{r.changes.internalLinksAdded > 1 ? 's' : ''} added</p>
                )}
                {r.changes.contentRewritten && (
                  <p className="text-xs text-amber-300">Full content rewrite applied</p>
                )}
              </div>
            )}

            {/* Result: Alt text */}
            {r?.action === 'alt_text' && r.altText && (
              <div className="pt-2 border-t border-gray-700/50">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Alt Text Written</p>
                <p className="text-xs text-gray-200 leading-relaxed">{r.altText}</p>
              </div>
            )}

            {/* Result: Skipped */}
            {r?.action === 'skipped' && (
              <div className="pt-2 border-t border-gray-700/50">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Skipped</p>
                <p className="text-xs text-gray-400">{r.skippedReason}</p>
              </div>
            )}

            {job.error && (
              <div className="pt-2 border-t border-gray-700/50">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Error</p>
                <p className="text-xs text-red-300 leading-relaxed">{job.error}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AuditTrailTab
// ---------------------------------------------------------------------------

const FILTER_OPTIONS = [
  { id: 'all', label: 'All Events' },
  { id: 'optimizations', label: 'Optimizations' },
  { id: 'jobs', label: 'Job History' },
];

export default function AuditTrailTab() {
  const { sites } = useAppStore();
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [filter, setFilter] = useState('all');
  const [logs, setLogs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [error, setError] = useState('');

  // Auto-select the first site when sites load
  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(String(sites[0]._id || sites[0].id));
    }
  }, [sites]);

  // Reload when site or page changes
  useEffect(() => {
    if (!selectedSiteId) return;
    fetchLogs(selectedSiteId, logsPage);
    if (logsPage === 1) fetchJobs(selectedSiteId);
  }, [selectedSiteId, logsPage]);

  const fetchLogs = useCallback(async (siteId, page) => {
    setLoadingLogs(true);
    setError('');
    try {
      const res = await client.get(`/seo/logs/${siteId}`, { params: { page, limit: 20 } });
      setLogs(res.data.logs || []);
      setLogsTotal(res.data.total || 0);
      setLogsTotalPages(res.data.pages || 1);
    } catch (err) {
      setError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const fetchJobs = useCallback(async (siteId) => {
    setLoadingJobs(true);
    try {
      const res = await client.get(`/seo/jobs/${siteId}`);
      const allJobs = [...(res.data.recent || []), ...(res.data.pending || [])];
      // Sort by most recent first
      allJobs.sort((a, b) => new Date(b.completedAt || b.scheduledAt) - new Date(a.completedAt || a.scheduledAt));
      setJobs(allJobs);
    } catch {
      // non-critical
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const handleSiteChange = (siteId) => {
    setSelectedSiteId(siteId);
    setLogsPage(1);
    setLogs([]);
    setJobs([]);
  };

  const handleRefresh = () => {
    if (!selectedSiteId) return;
    fetchLogs(selectedSiteId, logsPage);
    fetchJobs(selectedSiteId);
  };

  const selectedSite = sites.find((s) => String(s._id || s.id) === selectedSiteId);
  const isLoading = loadingLogs || loadingJobs;

  // Merge & sort for "all" view
  const mergedEntries = (() => {
    if (filter === 'optimizations') return logs.map((l) => ({ type: 'log', data: l, date: l.createdAt }));
    if (filter === 'jobs') return jobs.map((j) => ({ type: 'job', data: j, date: j.completedAt || j.scheduledAt }));
    const merged = [
      ...logs.map((l) => ({ type: 'log', data: l, date: l.createdAt })),
      ...jobs.map((j) => ({ type: 'job', data: j, date: j.completedAt || j.scheduledAt })),
    ];
    merged.sort((a, b) => new Date(b.date) - new Date(a.date));
    return merged;
  })();

  const totalEvents = filter === 'all' ? logsTotal + jobs.length : filter === 'optimizations' ? logsTotal : jobs.length;

  return (
    <div className="max-w-4xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Audit Trail</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Full log of every action the SEO Bot took on your sites
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading || !selectedSiteId}
          className="flex items-center gap-1.5 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-40 rounded-xl transition-all text-sm border border-gray-700 hover:border-gray-600"
        >
          <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Site selector */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <select
            value={selectedSiteId}
            onChange={(e) => handleSiteChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            {sites.length === 0 && <option value="">No sites connected</option>}
            {sites.map((s) => (
              <option key={s._id || s.id} value={String(s._id || s.id)}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Filter pills */}
        <div className="flex bg-gray-900 rounded-xl border border-gray-700 p-0.5 gap-0.5">
          {FILTER_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === id ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Event count */}
        {selectedSiteId && !isLoading && (
          <span className="text-xs text-gray-500 ml-auto">
            {filter === 'all' ? `${logsTotal} optimization${logsTotal !== 1 ? 's' : ''} · ${jobs.length} job${jobs.length !== 1 ? 's' : ''}` :
             filter === 'optimizations' ? `${logsTotal} total` : `${jobs.length} jobs`}
          </span>
        )}
      </div>

      {/* No sites */}
      {sites.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-10 text-center">
          <p className="text-gray-500 text-sm">No sites connected yet. Add a site to start seeing audit logs.</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-xl px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Main log panel */}
      {selectedSiteId && (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
          {/* Panel header */}
          <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-white font-semibold text-sm">
                {selectedSite?.label || 'Site'} — Activity Log
              </h3>
              <p className="text-gray-500 text-xs mt-0.5">
                Click any entry to expand full details
              </p>
            </div>
            {selectedSite && (
              <span className="text-xs text-gray-600 font-mono">
                {selectedSite.siteUrl?.replace(/^https?:\/\//, '') || ''}
              </span>
            )}
          </div>

          {/* Loading skeleton */}
          {isLoading && mergedEntries.length === 0 && (
            <div className="divide-y divide-gray-700/40">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-5 py-4 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-gray-700 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-700 rounded w-1/4" />
                      <div className="h-3.5 bg-gray-700 rounded w-2/3" />
                      <div className="h-3 bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && mergedEntries.length === 0 && (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-gray-700/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-400 font-medium text-sm">No audit events yet</p>
              <p className="text-gray-600 text-xs mt-1 max-w-xs mx-auto">
                The SEO Bot will start logging actions once it processes posts on this site.
              </p>
            </div>
          )}

          {/* Entries */}
          {!isLoading && mergedEntries.length > 0 && (
            <div>
              {mergedEntries.map((entry, idx) =>
                entry.type === 'log'
                  ? <LogEntry key={`log-${entry.data._id || idx}`} log={entry.data} />
                  : <JobEntry key={`job-${entry.data._id || idx}`} job={entry.data} />
              )}
            </div>
          )}

          {/* Pagination — only for optimizations / all */}
          {filter !== 'jobs' && logsTotalPages > 1 && (
            <div className="px-5 py-4 border-t border-gray-700 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {logsPage} of {logsTotalPages} · {logsTotal} optimization{logsTotal !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  disabled={logsPage <= 1 || loadingLogs}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 text-xs rounded-lg transition-all border border-gray-600"
                >
                  Previous
                </button>
                <button
                  onClick={() => setLogsPage((p) => Math.min(logsTotalPages, p + 1))}
                  disabled={logsPage >= logsTotalPages || loadingLogs}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 text-xs rounded-lg transition-all border border-gray-600"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats summary cards */}
      {selectedSiteId && !isLoading && (logs.length > 0 || jobs.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <StatCard
            label="Total Optimizations"
            value={logsTotal}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            color="text-emerald-400"
          />
          <StatCard
            label="Avg Score Gain"
            value={logs.length > 0 ? `+${(logs.reduce((s, l) => s + (l.scoreAfter - l.scoreBefore), 0) / logs.length).toFixed(1)}` : '—'}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
            color="text-brand-400"
          />
          <StatCard
            label="Jobs Completed"
            value={jobs.filter((j) => j.status === 'completed').length}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            color="text-emerald-400"
          />
          <StatCard
            label="Jobs Failed"
            value={jobs.filter((j) => j.status === 'failed').length}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            color="text-red-400"
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3.5 flex items-center gap-3">
      <div className={`${color} opacity-70`}>{icon}</div>
      <div>
        <p className={`text-lg font-bold ${color}`}>{value}</p>
        <p className="text-gray-500 text-xs leading-tight">{label}</p>
      </div>
    </div>
  );
}
