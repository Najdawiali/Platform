import React from 'react';
import { ScatterChart as RechartsScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ZAxis } from 'recharts';

interface ScatterPlotProps {
  data: any[];
  xKey: string;
  yKey: string;
  sizeKey?: string; // Optional: for bubble chart effect
  colors?: string[];
  title?: string;
  width?: number;
  height?: number;
  showGrid?: boolean;
  xLabel?: string;
  yLabel?: string;
  pointSize?: number;
  pointOpacity?: number;
  showLabels?: boolean;
  showTrendLine?: boolean;
}

export const ScatterPlot: React.FC<ScatterPlotProps> = ({
  data,
  xKey,
  yKey,
  sizeKey,
  colors = ['#4f46e5'],
  title,
  width: _width = 100,
  height = 400,
  showGrid = true,
  xLabel,
  yLabel,
  pointSize = 8,
  pointOpacity = 0.7,
  showLabels = false,
  showTrendLine = false,
}) => {
  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          style={{
            backgroundColor: 'white',
            padding: '12px 16px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#6b7280',
              marginBottom: '8px',
              paddingBottom: '4px',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            Data Point
          </div>
          <p
            style={{
              margin: '4px 0',
              fontSize: '13px',
              color: '#111827',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <span style={{ color: '#6b7280' }}>{xLabel || xKey}:</span>
            <span style={{ fontWeight: 600 }}>{data[xKey]?.toLocaleString()}</span>
          </p>
          <p
            style={{
              margin: '4px 0',
              fontSize: '13px',
              color: '#111827',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <span style={{ color: '#6b7280' }}>{yLabel || yKey}:</span>
            <span style={{ fontWeight: 600 }}>{data[yKey]?.toLocaleString()}</span>
          </p>
          {sizeKey && (
            <p
              style={{
                margin: '4px 0',
                fontSize: '13px',
                color: '#111827',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <span style={{ color: '#6b7280' }}>{sizeKey}:</span>
              <span style={{ fontWeight: 600 }}>{data[sizeKey]?.toLocaleString()}</span>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Calculate size range for bubble effect
  const getSizeRange = (): [number, number] => {
    if (!sizeKey) return [64, 64]; // Fixed size if no sizeKey

    const values = data.map((d) => d[sizeKey]).filter((v) => v != null);
    if (values.length === 0) return [64, 64];
    
    // Map to reasonable bubble sizes (min 20, max 400)
    return [20, 400];
  };

  const sizeRange: [number, number] = getSizeRange();

  return (
    <div style={{ width: '100%' }}>
      {title && (
        <h3
          style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <RechartsScatterChart
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
          <XAxis
            type="number"
            dataKey={xKey}
            name={xLabel || xKey}
            tick={{ fill: '#6b7280', fontSize: 12 }}
            tickLine={{ stroke: '#d1d5db' }}
            axisLine={{ stroke: '#d1d5db' }}
            label={{
              value: xLabel || xKey,
              position: 'insideBottom',
              offset: -10,
              style: { fill: '#6b7280', fontSize: 14, fontWeight: 600 },
            }}
            tickFormatter={(value) => value.toLocaleString()}
          />
          <YAxis
            type="number"
            dataKey={yKey}
            name={yLabel || yKey}
            tick={{ fill: '#6b7280', fontSize: 12 }}
            tickLine={{ stroke: '#d1d5db' }}
            axisLine={{ stroke: '#d1d5db' }}
            label={{
              value: yLabel || yKey,
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#6b7280', fontSize: 14, fontWeight: 600 },
            }}
            tickFormatter={(value) => value.toLocaleString()}
          />
          {sizeKey && (
            <ZAxis
              type="number"
              dataKey={sizeKey}
              range={sizeRange}
              name={sizeKey}
            />
          )}
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Legend
            wrapperStyle={{
              paddingTop: '20px',
              fontSize: '14px',
            }}
            iconType="circle"
          />
          <Scatter
            name={sizeKey ? `${xKey} vs ${yKey} (size: ${sizeKey})` : `${xKey} vs ${yKey}`}
            data={data}
            fill={colors[0]}
            fillOpacity={pointOpacity}
            stroke="white"
            strokeWidth={2}
            shape={pointSize && pointSize !== 8 ? (props: any) => {
              const { cx, cy } = props;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={pointSize / 2}
                  fill={colors[0]}
                  fillOpacity={pointOpacity}
                  stroke="white"
                  strokeWidth={2}
                />
              );
            } : undefined}
            label={showLabels ? {
              position: 'top',
              fill: '#111827',
              fontSize: 11,
              fontWeight: 600
            } : false}
          />
          
          {/* Trend Line */}
          {showTrendLine && data.length > 1 && (() => {
            // Calculate linear regression
            const n = data.length;
            const sumX = data.reduce((sum, point) => sum + (point[xKey] || 0), 0);
            const sumY = data.reduce((sum, point) => sum + (point[yKey] || 0), 0);
            const sumXY = data.reduce((sum, point) => sum + (point[xKey] || 0) * (point[yKey] || 0), 0);
            const sumX2 = data.reduce((sum, point) => sum + Math.pow(point[xKey] || 0, 2), 0);
            
            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;
            
            // Get min and max X values
            const xValues = data.map(d => d[xKey] || 0);
            const minX = Math.min(...xValues);
            const maxX = Math.max(...xValues);
            
            // Create trend line points
            const trendData = [
              { [xKey]: minX, [yKey]: slope * minX + intercept },
              { [xKey]: maxX, [yKey]: slope * maxX + intercept }
            ];
            
            return (
              <Scatter
                name="Trend Line"
                data={trendData}
                fill="none"
                stroke={colors[0]}
                strokeWidth={2}
                strokeDasharray="5 5"
                shape="line"
                line={{ stroke: colors[0], strokeWidth: 2, strokeDasharray: '5 5' }}
                legendType="line"
              />
            );
          })()}
        </RechartsScatterChart>
      </ResponsiveContainer>

      {/* Info about bubble size */}
      {sizeKey && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          ℹ️ Bubble size represents: <strong style={{ color: '#111827' }}>{sizeKey}</strong>
        </div>
      )}
      
      {/* Trend Line Info */}
      {showTrendLine && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#eff6ff',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#1e40af',
            textAlign: 'center',
            border: '1px solid #93c5fd'
          }}
        >
          📈 Trend line shows linear correlation between {xLabel || xKey} and {yLabel || yKey}
        </div>
      )}
    </div>
  );
};
