import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface HistogramChartProps {
  data: any[];
  valueColumn: string;
  binCount?: number;
  color?: string;
  showGrid?: boolean;
  showValues?: boolean;
  height?: number;
  isLoading?: boolean;
  hasError?: boolean;
}

export const HistogramChart: React.FC<HistogramChartProps> = ({
  data,
  valueColumn,
  binCount = 10,
  color = '#3b82f6',
  showGrid = true,
  showValues = false,
  height = 400,
  isLoading = false,
  hasError = false,
}) => {
  const histogramData = useMemo(() => {
    if (!data || data.length === 0 || !valueColumn) {
      return [];
    }

    // Extract numeric values
    const values = data
      .map((row) => {
        const val = row[valueColumn];
        return typeof val === 'number' ? val : parseFloat(val);
      })
      .filter((val) => !isNaN(val) && isFinite(val));

    if (values.length === 0) return [];

    // Calculate min and max
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // Handle edge case where all values are the same
    if (range === 0) {
      return [{
        bin: `${min.toFixed(2)}`,
        range: `${min.toFixed(2)}`,
        count: values.length,
        frequency: 100
      }];
    }

    // Create bins
    const binSize = range / binCount;
    const bins: { min: number; max: number; count: number }[] = [];

    for (let i = 0; i < binCount; i++) {
      bins.push({
        min: min + i * binSize,
        max: min + (i + 1) * binSize,
        count: 0
      });
    }

    // Count values in each bin
    values.forEach((value) => {
      // Find the appropriate bin (handle edge case for max value)
      let binIndex = Math.floor((value - min) / binSize);
      if (binIndex >= binCount) binIndex = binCount - 1;
      bins[binIndex].count++;
    });

    // Convert to chart format
    return bins.map((bin, index) => ({
      bin: `${bin.min.toFixed(2)} - ${bin.max.toFixed(2)}`,
      range: index === 0 ? `${bin.min.toFixed(2)}` : `${bin.min.toFixed(2)}`,
      count: bin.count,
      frequency: (bin.count / values.length) * 100
    }));
  }, [data, valueColumn, binCount]);

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
          <div>Loading histogram...</div>
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
          <div>Error loading histogram</div>
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
        <div>No data available for histogram</div>
      </div>
    );
  }

  if (histogramData.length === 0) {
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
        <div>Select a numeric column for histogram</div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={histogramData}
        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
        <XAxis
          dataKey="bin"
          angle={-45}
          textAnchor="end"
          height={80}
          tick={{ fontSize: 11, fill: '#64748b' }}
          stroke="#94a3b8"
        />
        <YAxis
          label={{ value: 'Frequency', angle: -90, position: 'insideLeft', style: { fill: '#64748b' } }}
          tick={{ fontSize: 12, fill: '#64748b' }}
          stroke="#94a3b8"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            fontSize: '12px'
          }}
          formatter={(value: any, name: string) => {
            if (name === 'count') return [value, 'Count'];
            return [value, name];
          }}
        />
        <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
        <Bar
          dataKey="count"
          fill={color}
          radius={[4, 4, 0, 0]}
          label={showValues ? { position: 'top', fontSize: 10, fill: '#64748b' } : false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};
