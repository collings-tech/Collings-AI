import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-gray-500 text-xs mb-1">{formatDate(label)}</p>
      <p className="text-white font-bold text-sm">
        {payload[0].value} <span className="text-gray-500 font-normal text-xs">posts</span>
      </p>
    </div>
  );
}

export default function SeoActivityBarChart({ data, loading }) {
  const hasData = data && data.some((d) => d.count > 0);
  const totalPosts = hasData ? data.reduce((s, d) => s + (d.count || 0), 0) : 0;

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold text-sm">Posts Optimized Per Day</h3>
          <p className="text-gray-500 text-xs mt-0.5">Daily optimization activity</p>
        </div>
        {hasData && (
          <div className="text-right">
            <p className="text-lg font-bold text-brand-400 leading-none">{totalPosts}</p>
            <p className="text-gray-600 text-xs mt-0.5">total</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-48 bg-gray-700/20 rounded-xl animate-pulse" />
      ) : !hasData ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-center">
          <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
          </svg>
          <p className="text-gray-500 text-sm">No activity yet</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={192}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity={1} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.7} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: '#4b5563', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#4b5563', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(107, 114, 128, 0.08)' }} />
            <Bar dataKey="count" fill="url(#barGrad)" radius={[6, 6, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
