import React, { useState } from 'react';

export default function AddSiteModal({ onClose, onSave }) {
  const [label, setLabel] = useState('');
  const [siteUrl, setSiteUrl] = useState('https://');
  const [wpUsername, setWpUsername] = useState('');
  const [wpAppPassword, setWpAppPassword] = useState('');
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
  const [testError, setTestError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const result = await window.electronAPI.invoke('sites:add', {
        label: label || 'Test',
        siteUrl,
        wpUsername,
        wpAppPassword,
        testOnly: true,
      });
      if (result.error) {
        setTestStatus('error');
        setTestError(result.error);
      } else {
        setTestStatus('ok');
      }
    } catch (err) {
      setTestStatus('error');
      setTestError(err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const result = await window.electronAPI.invoke('sites:add', {
        label,
        siteUrl,
        wpUsername,
        wpAppPassword,
      });
      if (result.error) {
        setError(result.error);
      } else {
        onSave(result.site);
      }
    } catch (err) {
      setError(err.message || 'Failed to add site.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Add WordPress Site</h2>
            <p className="text-gray-400 text-sm mt-0.5">Connect a site using application passwords</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1.5 rounded-lg hover:bg-gray-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Site Label</label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My Blog"
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">WordPress URL</label>
            <input
              type="url"
              required
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://yoursite.com"
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">WordPress Username</label>
            <input
              type="text"
              required
              value={wpUsername}
              onChange={(e) => setWpUsername(e.target.value)}
              placeholder="admin"
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          {/* App Password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Application Password
              <span className="ml-2 text-xs text-gray-500">(Users &rarr; Profile &rarr; Application Passwords)</span>
            </label>
            <input
              type="password"
              required
              value={wpAppPassword}
              onChange={(e) => setWpAppPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
              className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all font-mono"
            />
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'testing' || !siteUrl || !wpUsername || !wpAppPassword}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 text-sm font-medium rounded-xl transition-all border border-gray-600"
            >
              {testStatus === 'testing' ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Testing...
                </>
              ) : 'Test Connection'}
            </button>

            {testStatus === 'ok' && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Connection successful
              </span>
            )}
            {testStatus === 'error' && (
              <span className="text-red-400 text-sm truncate max-w-xs" title={testError}>
                {testError || 'Connection failed'}
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-xl transition-all border border-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 px-4 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand-900/40 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving...
                </>
              ) : 'Save Site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
