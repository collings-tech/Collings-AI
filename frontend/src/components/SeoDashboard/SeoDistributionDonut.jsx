import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = {
  Good: '#22c55e',
  'Needs Improvement': '#f59e0b',
  Poor: '#f97316',
  Critical: '#ef4444',
};

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
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4">Score Distribution</h3>
      {loading ? (
        <div className="h-48 bg-gray-700/50 rounded-xl animate-pulse" />
      ) : total === 0 ? (
        <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={192}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={COLORS[entry.name]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} itemStyle={{ color: '#e5e7eb', fontSize: 12 }} />
            <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ color: '#9ca3af', fontSize: 12 }}>{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
