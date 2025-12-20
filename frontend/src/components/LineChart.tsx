import React from 'react';

interface LineChartDataPoint {
  label: string;
  value: number;
}

interface LineChartSeries {
  name: string;
  data: LineChartDataPoint[];
}

interface LineChartData {
  series: LineChartSeries[];
  categories: string[];
}

interface ColumnSelection {
  datasetId: string;
  columnName: string;
  displayName: string;
  datasetName: string;
}

interface LineChartProps {
  data: LineChartData;
  columnSelections: ColumnSelection[];
  colors: string[];
  isLoading?: boolean;
  hasError?: boolean;
  width?: number | string;
  height?: number;
  chartId?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  columnSelections,
  colors,
  isLoading = false,
  hasError = false,
  width = '100%',
  height = 400,
  chartId = 'default',
}) => {
  if (isLoading) {
    return (
      <div style={{
        height: `${height}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#4f46e5',
        fontSize: '16px',
        gap: '12px'
      }}>
        <span style={{ fontSize: '32px' }}>🔄</span>
        <div>Loading chart data...</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>
          Fetching {columnSelections.length} column{columnSelections.length !== 1 ? 's' : ''}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div style={{
        height: `${height}px`,
        backgroundColor: '#fef2f2',
        border: '2px dashed #fecaca',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ef4444',
        fontSize: '16px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
          <div>Error loading data from service</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
            Check the browser console for details
          </div>
        </div>
      </div>
    );
  }

  if (!data.series || data.series.length === 0) {
    return (
      <div style={{
        height: `${height}px`,
        backgroundColor: '#fef2f2',
        border: '2px dashed #fecaca',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        fontSize: '16px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📈</div>
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>Drag columns to visualize data</div>
          <div style={{ fontSize: '14px', color: '#9ca3af' }}>
            Drag columns from the data panel to Rows (X-axis) and Columns (Y-axis)
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ width: '100%', height: `${height}px`, minHeight: `${height}px`, padding: '20px', overflow: 'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 800 400" style={{ overflow: 'visible' }}>
          {/* Grid lines */}
          <defs>
            <pattern id={`grid-${chartId}`} width="80" height="40" patternUnits="userSpaceOnUse">
              <path d="M 80 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="800" height="400" fill={`url(#grid-${chartId})`} />

          {/* Y-axis */}
          <line x1="50" y1="350" x2="50" y2="50" stroke="#6b7280" strokeWidth="2" />

          {/* X-axis */}
          <line x1="50" y1="350" x2="750" y2="350" stroke="#6b7280" strokeWidth="2" />

          {/* Draw lines for each column */}
          {data.series.map((series, idx) => {
            const points = series.data;
            if (!points || points.length === 0) return null;

            const xScale = 700 / Math.max(points.length - 1, 1);
            const maxY = Math.max(
              ...data.series.flatMap(s => s.data.map(p => p.value)),
              1
            );
            const yScale = 280 / maxY;

            const pathData = points.map((point, i) => {
              const x = 50 + (i * xScale);
              const y = 350 - (point.value * yScale);
              return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
            }).join(' ');

            return (
              <g key={idx}>
                {/* Line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={colors[idx % colors.length]}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Points */}
                {points.map((point, i) => {
                  const x = 50 + (i * xScale);
                  const y = 350 - (point.value * yScale);
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="5"
                      fill={colors[idx % colors.length]}
                      stroke="white"
                      strokeWidth="2"
                    >
                      <title>{`${series.name}: ${point.label} = ${point.value}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}

          {/* Y-axis labels */}
          {(() => {
            const maxY = Math.max(
              ...data.series.flatMap(s => s.data.map(p => p.value)),
              1
            );
            const yTicks = 5;
            return Array.from({ length: yTicks + 1 }).map((_, i) => {
              const value = Math.round((maxY / yTicks) * i);
              const y = 350 - (value * (280 / maxY));
              return (
                <g key={i}>
                  <line
                    x1="45"
                    y1={y}
                    x2="50"
                    y2={y}
                    stroke="#6b7280"
                    strokeWidth="2"
                  />
                  <text
                    x="40"
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="#6b7280"
                  >
                    {value}
                  </text>
                </g>
              );
            });
          })()}

          {/* X-axis labels */}
          {data.categories && data.categories.slice(0, 10).map((label, i) => {
            const totalPoints = Math.min(data.categories.length, 10);
            const x = 50 + (i * (700 / Math.max(totalPoints - 1, 1)));
            return (
              <text
                key={i}
                x={x}
                y="370"
                textAnchor="middle"
                fontSize="11"
                fill="#6b7280"
              >
                {label.length > 8 ? label.substring(0, 8) + '...' : label}
              </text>
            );
          })}

          {/* Legend */}
          {data.series.map((series, idx) => (
            <g key={idx} transform={`translate(60, ${20 + idx * 25})`}>
              <line
                x1="0"
                y1="0"
                x2="30"
                y2="0"
                stroke={colors[idx % colors.length]}
                strokeWidth="3"
              />
              <circle
                cx="15"
                cy="0"
                r="4"
                fill={colors[idx % colors.length]}
                stroke="white"
                strokeWidth="2"
              />
              <text
                x="40"
                y="4"
                fontSize="13"
                fill="#374151"
                fontWeight="500"
              >
                {series.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {data.series.length > 0 && data.categories.length > 0 && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#6b7280'
        }}>
          <strong style={{ color: '#374151' }}>Chart Info:</strong> Displaying {data.categories.length} categories
          across {data.series.length} column{data.series.length !== 1 ? 's' : ''}.
          Values represent frequency counts for each category.
        </div>
      )}
    </>
  );
};