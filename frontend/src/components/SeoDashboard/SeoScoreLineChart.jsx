import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function lineColor(data) {
  if (!data || !data.length) return '#6366f1';
  const last = data[data.length - 1]?.avgScore ?? 0;
  if (last >= 80) return '#22c55e';
  if (last >= 60) return '#f59e0b';
  return '#ef4444';
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SeoScoreLineChart({ data, loading }) {
  const color = lineColor(data);
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4">Average SEO Score Over Time</h3>
      {loading ? (
        <div className="h-48 bg-gray-700/50 rounded-xl animate-pulse" />
      ) : !data || data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={192}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#e5e7eb', fontSize: 12 }}
              itemStyle={{ color }}
              formatter={(v) => [`${Math.round(v)}`, 'Avg Score']}
              labelFormatter={formatDate}
            />
            <Line type="monotone" dataKey="avgScore" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
