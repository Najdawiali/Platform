import React, { useMemo } from 'react';

interface BoxPlotChartProps {
  data: any[];
  valueColumn: string;
  categoryColumn?: string;
  showOutliers?: boolean;
  boxColor?: string;
  showGrid?: boolean;
  height?: number;
  isLoading?: boolean;
  hasError?: boolean;
}

interface BoxStats {
  category: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
  count: number;
}

export const BoxPlotChart: React.FC<BoxPlotChartProps> = ({
  data,
  valueColumn,
  categoryColumn,
  showOutliers = true,
  boxColor = '#3b82f6',
  showGrid = true,
  height = 400,
  isLoading = false,
  hasError = false,
}) => {
  const boxStats = useMemo(() => {
    if (!data || data.length === 0 || !valueColumn) {
      return [];
    }

    // Calculate box plot statistics
    const calculateStats = (values: number[]): Omit<BoxStats, 'category'> => {
      const sorted = values.sort((a, b) => a - b);
      const n = sorted.length;

      if (n === 0) {
        return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [], count: 0 };
      }

      const q1Index = Math.floor(n * 0.25);
      const medianIndex = Math.floor(n * 0.5);
      const q3Index = Math.floor(n * 0.75);

      const q1 = sorted[q1Index];
      const median = sorted[medianIndex];
      const q3 = sorted[q3Index];
      const iqr = q3 - q1;

      const lowerFence = q1 - 1.5 * iqr;
      const upperFence = q3 + 1.5 * iqr;

      const outliers = sorted.filter(v => v < lowerFence || v > upperFence);
      const nonOutliers = sorted.filter(v => v >= lowerFence && v <= upperFence);

      const min = nonOutliers.length > 0 ? nonOutliers[0] : sorted[0];
      const max = nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : sorted[n - 1];

      return { min, q1, median, q3, max, outliers, count: n };
    };

    // Extract numeric values
    const values = data
      .map((row) => {
        const val = row[valueColumn];
        return typeof val === 'number' ? val : parseFloat(val);
      })
      .filter((val) => !isNaN(val) && isFinite(val));

    if (values.length === 0) return [];

    // Group by category if provided
    if (categoryColumn) {
      const groups = new Map<string, number[]>();
      
      data.forEach((row) => {
        const val = row[valueColumn];
        const numVal = typeof val === 'number' ? val : parseFloat(val);
        if (isNaN(numVal) || !isFinite(numVal)) return;

        const category = String(row[categoryColumn] || 'Unknown');
        if (!groups.has(category)) {
          groups.set(category, []);
        }
        groups.get(category)!.push(numVal);
      });

      return Array.from(groups.entries()).map(([category, vals]) => ({
        category,
        ...calculateStats(vals),
      }));
    } else {
      // Single box plot
      return [{
        category: valueColumn,
        ...calculateStats(values),
      }];
    }
  }, [data, valueColumn, categoryColumn]);

  if (isLoading) {
    return (
      <div style={{
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
        fontSize: '14px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <div>Loading box plot...</div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div style={{
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ef4444',
        fontSize: '14px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
          <div>Error loading box plot</div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{
        height: `${height}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
        fontSize: '14px',
        gap: '12px'
      }}>
        <span style={{ fontSize: '32px' }}>⚠️</span>
        <div>No data available for box plot</div>
      </div>
    );
  }

  if (boxStats.length === 0) {
    return (
      <div style={{
        height: `${height}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
        fontSize: '14px',
        gap: '12px'
      }}>
        <span style={{ fontSize: '32px' }}>📊</span>
        <div>Select a numeric column for box plot</div>
      </div>
    );
  }

  const allValues = boxStats.flatMap(s => [s.min, s.q1, s.median, s.q3, s.max, ...s.outliers]);
  const globalMin = Math.min(...allValues);
  const globalMax = Math.max(...allValues);
  const range = globalMax - globalMin;
  const padding = range * 0.1;

  const boxWidth = Math.min(80, Math.max(50, 600 / Math.min(boxStats.length, 6))); // Better box width calculation
  const spacing = 40; // Space between boxes
  const chartWidth = boxStats.length * (boxWidth + spacing) + 100; // Add extra padding

  return (
    <div style={{ width: '100%', height: `${height}px`, overflowX: 'auto', overflowY: 'hidden' }}>
      <svg width={Math.max(chartWidth, 600)} height={height}>
        {/* Grid lines */}
        {showGrid && (
          <g>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = height - 60 - ratio * (height - 120);
              const value = (globalMin - padding + ratio * (range + 2 * padding)).toFixed(2);
              return (
                <g key={ratio}>
                  <line
                    x1={60}
                    y1={y}
                    x2={chartWidth - 20}
                    y2={y}
                    stroke="#e5e7eb"
                    strokeDasharray="3 3"
                  />
                  <text x={50} y={y + 4} fontSize={11} fill="#64748b" textAnchor="end">
                    {value}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Box plots */}
        {boxStats.map((stats, index) => {
          const x = 100 + index * (boxWidth + spacing);
          const scale = (val: number) =>
            height - 60 - ((val - (globalMin - padding)) / (range + 2 * padding)) * (height - 120);

          const minY = scale(stats.min);
          const q1Y = scale(stats.q1);
          const medianY = scale(stats.median);
          const q3Y = scale(stats.q3);
          const maxY = scale(stats.max);

          return (
            <g key={index}>
              {/* Whisker lines */}
              <line x1={x + boxWidth / 2} y1={maxY} x2={x + boxWidth / 2} y2={q3Y} stroke="#64748b" strokeWidth={1.5} />
              <line x1={x + boxWidth / 2} y1={minY} x2={x + boxWidth / 2} y2={q1Y} stroke="#64748b" strokeWidth={1.5} />
              
              {/* Whisker caps */}
              <line x1={x + boxWidth * 0.3} y1={maxY} x2={x + boxWidth * 0.7} y2={maxY} stroke="#64748b" strokeWidth={1.5} />
              <line x1={x + boxWidth * 0.3} y1={minY} x2={x + boxWidth * 0.7} y2={minY} stroke="#64748b" strokeWidth={1.5} />

              {/* Box */}
              <rect
                x={x}
                y={q3Y}
                width={boxWidth}
                height={q1Y - q3Y}
                fill={boxColor}
                fillOpacity={0.6}
                stroke={boxColor}
                strokeWidth={2}
                rx={3}
              />

              {/* Median line */}
              <line
                x1={x}
                y1={medianY}
                x2={x + boxWidth}
                y2={medianY}
                stroke="#1f2937"
                strokeWidth={2.5}
              />

              {/* Outliers */}
              {showOutliers && stats.outliers.map((outlier, i) => (
                <circle
                  key={i}
                  cx={x + boxWidth / 2}
                  cy={scale(outlier)}
                  r={3}
                  fill="#ef4444"
                  stroke="#dc2626"
                  strokeWidth={1}
                />
              ))}

              {/* Category label */}
              <text
                x={x + boxWidth / 2}
                y={height - 35}
                fontSize={12}
                fill="#64748b"
                textAnchor="middle"
              >
                {stats.category.length > 12 ? stats.category.substring(0, 10) + '...' : stats.category}
              </text>

              {/* Count */}
              <text
                x={x + boxWidth / 2}
                y={height - 20}
                fontSize={10}
                fill="#94a3b8"
                textAnchor="middle"
              >
                n={stats.count}
              </text>
            </g>
          );
        })}

        {/* Tooltip trigger areas */}
        {boxStats.map((stats, index) => {
          const x = 100 + index * (boxWidth + 40);
          return (
            <rect
              key={`trigger-${index}`}
              x={x - 10}
              y={20}
              width={boxWidth + 20}
              height={height - 80}
              fill="transparent"
              style={{ cursor: 'pointer' }}
            >
              <title>
                {`${stats.category}\nMin: ${stats.min.toFixed(2)}\nQ1: ${stats.q1.toFixed(2)}\nMedian: ${stats.median.toFixed(2)}\nQ3: ${stats.q3.toFixed(2)}\nMax: ${stats.max.toFixed(2)}\nCount: ${stats.count}${stats.outliers.length > 0 ? `\nOutliers: ${stats.outliers.length}` : ''}`}
              </title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
};
