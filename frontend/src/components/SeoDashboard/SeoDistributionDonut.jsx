import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = {
  Good: '#22c55e',
  'Needs Improvement': '#f59e0b',
  Poor: '#f97316',
  Critical: '#ef4444',
};

const LABELS = {
  Good: 'Good (80+)',
  'Needs Improvement': 'Fair (60–79)',
  Poor: 'Poor (40–59)',
  Critical: 'Critical (<40)',
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-xl">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.payload.fill || COLORS[d.name] }} />
        <span className="text-gray-300 text-xs font-medium">{d.name}</span>
      </div>
      <p className="text-white font-bold text-sm mt-1">
        {d.value} <span className="text-gray-500 font-normal">posts</span>
      </p>
    </div>
  );
}

export default function SeoDistributionDonut({ data, loading }) {
  const chartData = data
    ? [
        { name: 'Good', value: data.good || 0 },
        { name: 'Needs Improvement', value: data.needsImprovement || 0 },
        { name: 'Poor', value: data.poor || 0 },
        { name: 'Critical', value: data.critical || 0 },
      ].filter((d) => d.value > 0)
    : [];
  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-5 flex flex-col">
      <h3 className="text-white font-semibold text-sm">Score Distribution</h3>
      <p className="text-gray-500 text-xs mt-0.5 mb-4">Posts by health status</p>

      {loading ? (
        <div className="flex-1 min-h-[200px] bg-gray-700/30 rounded-xl animate-pulse" />
      ) : total === 0 ? (
        <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center text-center">
          <svg className="w-8 h-8 text-gray-700 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
          </svg>
          <p className="text-gray-500 text-sm">No data yet</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="relative flex-1 min-h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%" cy="50%"
                  innerRadius="60%"
                  outerRadius="85%"
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[entry.name]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-white leading-none">{total}</span>
              <span className="text-xs text-gray-500 mt-0.5">posts</span>
            </div>
          </div>

          {/* Custom legend */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
            {chartData.map((d) => (
              <div key={d.name} className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[d.name] }} />
                <span className="text-gray-400 text-xs truncate">{LABELS[d.name] || d.name}</span>
                <span className="text-gray-500 text-xs ml-auto font-medium">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
