import React, { useMemo } from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';

interface HeatmapChartProps {
  data: any[];
  xColumn: string;
  yColumn: string;
  valueColumn: string;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  colorScheme?: string[];
  showValues?: boolean;
  showGrid?: boolean;
  cellBorderWidth?: number;
  height?: number;
  isLoading?: boolean;
  hasError?: boolean;
}

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
  data,
  xColumn,
  yColumn,
  valueColumn,
  aggregation = 'sum',
  colorScheme = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'],
  showValues = true,
  showGrid = true,
  cellBorderWidth = 1,
  height = 400,
  isLoading = false,
  hasError = false,
}) => {
  const { matrix, xLabels, yLabels, min, max } = useMemo(() => {
    if (!data || data.length === 0 || !xColumn || !yColumn || !valueColumn) {
      return { matrix: [], xLabels: [], yLabels: [], min: 0, max: 0 };
    }

    // Collect unique x and y values
    const xSet = new Set<string>();
    const ySet = new Set<string>();
    
    data.forEach(row => {
      const xVal = String(row[xColumn] ?? '').trim();
      const yVal = String(row[yColumn] ?? '').trim();
      if (xVal) xSet.add(xVal);
      if (yVal) ySet.add(yVal);
    });

    const xLabels = Array.from(xSet).sort();
    const yLabels = Array.from(ySet).sort();

    // Build aggregation map
    const cellMap = new Map<string, { sum: number; count: number; min: number; max: number }>();
    
    data.forEach(row => {
      const xVal = String(row[xColumn] ?? '').trim();
      const yVal = String(row[yColumn] ?? '').trim();
      if (!xVal || !yVal) return;

      const key = `${xVal}|||${yVal}`;
      const value = parseFloat(String(row[valueColumn] ?? '0'));
      
      if (!isFinite(value)) return;

      if (!cellMap.has(key)) {
        cellMap.set(key, { sum: 0, count: 0, min: value, max: value });
      }
      
      const cell = cellMap.get(key)!;
      cell.sum += value;
      cell.count += 1;
      cell.min = Math.min(cell.min, value);
      cell.max = Math.max(cell.max, value);
    });

    // Build matrix
    const matrix: number[][] = [];
    let globalMin = Infinity;
    let globalMax = -Infinity;

    yLabels.forEach(yVal => {
      const row: number[] = [];
      xLabels.forEach(xVal => {
        const key = `${xVal}|||${yVal}`;
        const cell = cellMap.get(key);
        
        let value = 0;
        if (cell) {
          switch (aggregation) {
            case 'sum': value = cell.sum; break;
            case 'avg': value = cell.count > 0 ? cell.sum / cell.count : 0; break;
            case 'count': value = cell.count; break;
            case 'min': value = cell.min; break;
            case 'max': value = cell.max; break;
            default: value = cell.sum;
          }
        }
        
        row.push(value);
        if (value !== 0) {
          globalMin = Math.min(globalMin, value);
          globalMax = Math.max(globalMax, value);
        }
      });
      matrix.push(row);
    });

    return {
      matrix,
      xLabels,
      yLabels,
      min: globalMin === Infinity ? 0 : globalMin,
      max: globalMax === -Infinity ? 0 : globalMax,
    };
  }, [data, xColumn, yColumn, valueColumn, aggregation]);

  const getColor = (value: number): string => {
    if (!isFinite(value) || value === 0 || max === min) {
      return '#f1f5f9'; // Gray for no data
    }

    const normalized = (value - min) / (max - min);
    const index = Math.floor(normalized * (colorScheme.length - 1));
    const clampedIndex = Math.max(0, Math.min(colorScheme.length - 1, index));
    
    return colorScheme[clampedIndex];
  };

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
        <div>Loading heatmap...</div>
      </div>
    );
  }

  if (hasError || !data || data.length === 0) {
    return (
      <div style={{
        height: `${height}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#dc2626',
        fontSize: '16px',
        gap: '12px'
      }}>
        <span style={{ fontSize: '32px' }}>⚠️</span>
        <div>No data available for heatmap</div>
      </div>
    );
  }

  if (xLabels.length === 0 || yLabels.length === 0) {
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
        <div>Drag columns to Rows (X-axis) and Columns (Y-axis)</div>
        <div style={{ fontSize: '12px' }}>Value column will determine cell intensity</div>
      </div>
    );
  }

  const cellWidth = Math.min(100, Math.max(30, 600 / xLabels.length));
  const cellHeight = Math.min(60, Math.max(25, 400 / yLabels.length));
  const leftMargin = Math.max(...yLabels.map(l => l.length)) * 6 + 10;
  const bottomMargin = 60;

  return (
    <div style={{ width: '100%', height, overflowX: 'auto', overflowY: 'auto' }}>
      <ResponsiveContainer width="100%" height="100%">
        <svg
          width={leftMargin + xLabels.length * cellWidth + 40}
          height={yLabels.length * cellHeight + bottomMargin + 40}
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          {/* Y-axis labels */}
          {yLabels.map((label, yIndex) => (
            <text
              key={`y-${yIndex}`}
              x={leftMargin - 8}
              y={20 + yIndex * cellHeight + cellHeight / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="11px"
              fill="#64748b"
            >
              {label}
            </text>
          ))}

          {/* X-axis labels */}
          {xLabels.map((label, xIndex) => (
            <text
              key={`x-${xIndex}`}
              x={leftMargin + xIndex * cellWidth + cellWidth / 2}
              y={20 + yLabels.length * cellHeight + 20}
              textAnchor="middle"
              transform={`rotate(-45, ${leftMargin + xIndex * cellWidth + cellWidth / 2}, ${20 + yLabels.length * cellHeight + 20})`}
              fontSize="11px"
              fill="#64748b"
            >
              {label}
            </text>
          ))}

          {/* Heatmap cells */}
          {matrix.map((row, yIndex) =>
            row.map((value, xIndex) => {
              const x = leftMargin + xIndex * cellWidth;
              const y = 20 + yIndex * cellHeight;
              const color = getColor(value);

              return (
                <g key={`cell-${xIndex}-${yIndex}`}>
                  <rect
                    x={x}
                    y={y}
                    width={cellWidth}
                    height={cellHeight}
                    fill={color}
                    stroke={showGrid ? '#e2e8f0' : 'none'}
                    strokeWidth={cellBorderWidth}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>
                      {`${xLabels[xIndex]} × ${yLabels[yIndex]}: ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                    </title>
                  </rect>
                  {showValues && cellWidth > 40 && cellHeight > 30 && (
                    <text
                      x={x + cellWidth / 2}
                      y={y + cellHeight / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.min(11, cellWidth / 4)}
                      fill={value > (min + max) / 2 ? '#ffffff' : '#0f172a'}
                      fontWeight="500"
                    >
                      {value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* Legend */}
          <g transform={`translate(${leftMargin}, ${20 + yLabels.length * cellHeight + 45})`}>
            <text x={0} y={0} fontSize="10px" fill="#64748b" fontWeight="600">
              {min.toLocaleString()}
            </text>
            {colorScheme.map((color, i) => (
              <rect
                key={`legend-${i}`}
                x={60 + i * 30}
                y={-8}
                width={30}
                height={12}
                fill={color}
                stroke="#e2e8f0"
              />
            ))}
            <text
              x={60 + colorScheme.length * 30 + 10}
              y={0}
              fontSize="10px"
              fill="#64748b"
              fontWeight="600"
            >
              {max.toLocaleString()}
            </text>
          </g>
        </svg>
      </ResponsiveContainer>
    </div>
  );
};
