import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function lineColor(data) {
  if (!data || !data.length) return { stroke: '#6366f1', id: 'grad-indigo' };
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
      <p className="text-gray-500 text-xs mb-1">{formatDate(label)}</p>
      <p className="text-white font-bold text-base">
        {Math.round(v)}
        <span className="text-gray-500 text-xs font-normal ml-0.5">/ 100</span>
      </p>
    </div>
  );
}

export default function SeoScoreLineChart({ data, loading }) {
  const { stroke, id: gradId } = lineColor(data);
  const currentScore = data?.length ? Math.round(data[data.length - 1]?.avgScore ?? 0) : null;
  const firstScore = data?.length > 1 ? Math.round(data[0]?.avgScore ?? 0) : null;
  const delta = currentScore != null && firstScore != null ? currentScore - firstScore : null;

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold text-sm">SEO Score Trend</h3>
          <p className="text-gray-500 text-xs mt-0.5">Average score over time</p>
        </div>
        {currentScore != null && (
          <div className="text-right">
            <p className="text-2xl font-bold leading-none" style={{ color: stroke }}>
              {currentScore}
            </p>
            {delta != null && delta !== 0 && (
              <p className={`text-xs font-medium mt-1 ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {delta > 0 ? '+' : ''}{delta} pts
              </p>
            )}
            {delta === 0 && <p className="text-xs text-gray-600 mt-1">no change</p>}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-52 bg-gray-700/20 rounded-xl animate-pulse" />
        ) : !data || data.length === 0 ? (
          <div className="h-52 flex flex-col items-center justify-center gap-2 text-center">
            <svg className="w-8 h-8 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22" />
            </svg>
            <p className="text-gray-500 text-sm">No trend data yet</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fill: '#4b5563', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#4b5563', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke, strokeWidth: 1, strokeDasharray: '4 4' }}
              />
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
    </div>
  );
}
