import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, defs, linearGradient, stop,
} from 'recharts';

function lineColor(data) {
  if (!data || !data.length) return { stroke: '#6366f1', fill: 'url(#scoreGrad)' };
  const last = data[data.length - 1]?.avgScore ?? 0;
  if (last >= 80) return { stroke: '#22c55e', id: 'grad-green' };
  if (last >= 60) return { stroke: '#f59e0b', id: 'grad-amber' };
  return { stroke: '#ef4444', id: 'grad-red' };
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-gray-400 text-xs mb-1">{formatDate(label)}</p>
      <p className="text-white font-bold text-base">{Math.round(v)}<span className="text-gray-500 text-xs font-normal ml-0.5">/ 100</span></p>
    </div>
  );
}

export default function SeoScoreLineChart({ data, loading }) {
  const { stroke, id } = lineColor(data);
  const gradId = id || 'grad-indigo';

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold text-sm">SEO Score Trend</h3>
          <p className="text-gray-500 text-xs mt-0.5">Average score over time</p>
        </div>
        {data && data.length > 0 && (
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: stroke }}>
              {Math.round(data[data.length - 1]?.avgScore ?? 0)}
            </p>
            <p className="text-gray-500 text-xs">current</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-52 bg-gray-700/30 rounded-xl animate-pulse" />
      ) : !data || data.length === 0 ? (
        <div className="h-52 flex flex-col items-center justify-center gap-2 text-center">
          <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4" />
          </svg>
          <p className="text-gray-500 text-sm">No trend data yet</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={208}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              dy={6}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: stroke, strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="avgScore"
              stroke={stroke}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 5, fill: stroke, strokeWidth: 2, stroke: '#111827' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
