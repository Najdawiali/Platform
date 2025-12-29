import React from 'react';

export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct' | 'median';

interface AggregationSelectorProps {
  column: string;
  columnType: string;
  aggregationType: AggregationType;
  onAggregationChange: (type: AggregationType) => void;
  label?: string;
  style?: React.CSSProperties;
}

export const AggregationSelector: React.FC<AggregationSelectorProps> = ({ 
  column, 
  columnType, 
  aggregationType, 
  onAggregationChange, 
  label,
  style 
}) => {
  // Filter options based on column type if needed, but for now show all relevant ones
  const options: { value: AggregationType; label: string }[] = [
    { value: 'sum', label: 'Sum' },
    { value: 'avg', label: 'Average' },
    { value: 'min', label: 'Minimum' },
    { value: 'max', label: 'Maximum' },
    { value: 'count', label: 'Count' },
    { value: 'count_distinct', label: 'Count Distinct' },
    { value: 'median', label: 'Median' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', ...style }}>
      {label && (
        <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
          {label}
        </label>
      )}
      <select
        value={aggregationType}
        onChange={(e) => onAggregationChange(e.target.value as AggregationType)}
        style={{
          padding: '8px 12px',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          backgroundColor: 'white',
          fontSize: '14px',
          color: '#1e293b',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        Column: <strong>{column}</strong> ({columnType})
      </div>
    </div>
  );
};

export const applyAggregation = (data: any[], column: string, type: AggregationType): number | null => {
  if (!data || data.length === 0) return null;

  const values = data.map((row) => Number(row[column])).filter((val) => !isNaN(val));

  if (values.length === 0 && type !== 'count') return 0;

  switch (type) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'count':
      return data.length;
    case 'count_distinct':
      return new Set(data.map((row) => row[column])).size;
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    default:
      return 0;
  }
};
