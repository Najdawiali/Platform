import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface GaugeChartProps {
  value: number;
  maxValue: number;
  title?: string;
  subtitle?: string;
  colors?: {
    low: string;
    medium: string;
    high: string;
  };
  thresholds?: {
    low: number;
    medium: number;
  };
  width?: number;
  height?: number;
  unit?: string;
}

export const GaugeChart: React.FC<GaugeChartProps> = ({
  value,
  maxValue,
  title,
  subtitle,
  colors = {
    low: '#ef4444',
    medium: '#f59e0b',
    high: '#10b981',
  },
  thresholds = {
    low: 33,
    medium: 66,
  },
  width: _width = 100,
  height = 300,
  unit = '',
}) => {
  // Calculate percentage
  const percentage = Math.min((value / maxValue) * 100, 100);

  // Determine color based on percentage
  const getColor = () => {
    if (percentage < thresholds.low) return colors.low;
    if (percentage < thresholds.medium) return colors.medium;
    return colors.high;
  };

  const color = getColor();

  // Create gauge data (180 degrees semicircle)
  const gaugeData = [
    { name: 'value', value: percentage },
    { name: 'empty', value: 100 - percentage },
  ];

  const cx = 50; // Center X percentage
  const cy = 70; // Center Y percentage (lower to accommodate semicircle)

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      {title && (
        <h3
          style={{
            margin: '0 0 8px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          {title}
        </h3>
      )}
      {subtitle && (
        <p
          style={{
            margin: '0 0 16px 0',
            fontSize: '14px',
            color: '#6b7280',
          }}
        >
          {subtitle}
        </p>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={gaugeData}
            cx={`${cx}%`}
            cy={`${cy}%`}
            startAngle={180}
            endAngle={0}
            innerRadius="70%"
            outerRadius="100%"
            dataKey="value"
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill="#e5e7eb" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Value Display */}
      <div
        style={{
          marginTop: '-80px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontSize: '48px',
            fontWeight: 700,
            color: color,
            lineHeight: '1',
            marginBottom: '8px',
          }}
        >
          {value.toLocaleString()}{unit}
        </div>
        <div
          style={{
            fontSize: '14px',
            color: '#6b7280',
          }}
        >
          of {maxValue.toLocaleString()}{unit}
        </div>
        <div
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color: color,
            marginTop: '4px',
          }}
        >
          {percentage.toFixed(1)}%
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '24px',
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: colors.low,
            }}
          />
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            Low (&lt; {thresholds.low}%)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: colors.medium,
            }}
          />
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            Medium ({thresholds.low}-{thresholds.medium}%)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: colors.high,
            }}
          />
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            High (&gt; {thresholds.medium}%)
          </span>
        </div>
      </div>
    </div>
  );
};
