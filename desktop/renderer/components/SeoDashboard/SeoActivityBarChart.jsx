import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SeoActivityBarChart({ data, loading }) {
  const hasData = data && data.some((d) => d.count > 0);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4">Posts Optimized Per Day</h3>
      {loading ? (
        <div className="h-48 bg-gray-700/50 rounded-xl animate-pulse" />
      ) : !hasData ? (
        <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No activity yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={192}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#e5e7eb', fontSize: 12 }}
              itemStyle={{ color: '#6366f1' }}
              formatter={(v) => [v, 'Posts optimized']}
              labelFormatter={formatDate}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
