import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BarChartData {
  category: string;
  [key: string]: string | number;
}

interface ColumnSelection {
  datasetId: string;
  columnName: string;
  displayName: string;
  datasetName: string;
}

interface BarChart3DProps {
  data: BarChartData[];
  columnSelections: ColumnSelection[];
  colors: string[];
  isLoading?: boolean;
  hasError?: boolean;
  width?: number | string;
  height?: number;
}

export const BarChart3D: React.FC<BarChart3DProps> = ({
  data,
  columnSelections,
  colors,
  isLoading = false,
  hasError = false,
  width = '100%',
  height = 500,
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

  if (data.length === 0) {
    return (
      <div style={{
        height: `${height}px`,
        backgroundColor: '#f9fafb',
        border: '2px dashed #d1d5db',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        fontSize: '16px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
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
      <div style={{ width: '100%', height: `${height}px`, minHeight: `${height}px` }}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="category"
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fill: '#6b7280', fontSize: 12 }}
            />
            <YAxis
              label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { fill: '#6b7280' } }}
              tick={{ fill: '#6b7280', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
            />
            {columnSelections.map((sel, idx) => (
              <Bar
                key={idx}
                dataKey={sel.displayName}
                fill={colors[idx % colors.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.length > 0 && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#6b7280'
        }}>
          <strong style={{ color: '#374151' }}>Chart Info:</strong> Displaying top {data.length} categories
          across {columnSelections.length} column{columnSelections.length !== 1 ? 's' : ''}.
          Values represent frequency counts of each category.
        </div>
      )}
    </>
  );
};