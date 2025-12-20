import React from 'react';
import { Calculator } from 'lucide-react';

export type AggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'distinct_count';

interface AggregationSelectorProps {
  column: string;
  columnType?: string;
  aggregationType: AggregationType;
  onAggregationChange: (type: AggregationType) => void;
  label?: string;
}

export const AggregationSelector: React.FC<AggregationSelectorProps> = ({
  column,
  columnType = 'number',
  aggregationType,
  onAggregationChange,
  label,
}) => {
  // Determine available aggregations based on column type
  const getAvailableAggregations = (): Array<{
    value: AggregationType;
    label: string;
    description: string;
  }> => {
    const isNumeric = columnType === 'number' || columnType === 'integer' || columnType === 'float';

    const allAggregations = [
      { value: 'count' as AggregationType, label: 'Count', description: 'Count all rows' },
      { value: 'distinct_count' as AggregationType, label: 'Distinct Count', description: 'Count unique values' },
    ];

    if (isNumeric) {
      allAggregations.push(
        { value: 'sum' as AggregationType, label: 'Sum', description: 'Total of all values' },
        { value: 'avg' as AggregationType, label: 'Average', description: 'Mean value' },
        { value: 'min' as AggregationType, label: 'Minimum', description: 'Smallest value' },
        { value: 'max' as AggregationType, label: 'Maximum', description: 'Largest value' },
        { value: 'median' as AggregationType, label: 'Median', description: 'Middle value' }
      );
    }

    return allAggregations;
  };

  const availableAggregations = getAvailableAggregations();

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        padding: '12px',
      }}
    >
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Calculator size={16} color="#4f46e5" />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#6b7280',
          }}
        >
          {label || `Aggregate: ${column}`}
        </span>
      </div>

      {/* Aggregation Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {availableAggregations.map((agg) => (
          <label
            key={agg.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: '6px',
              border: `2px solid ${aggregationType === agg.value ? '#4f46e5' : '#e5e7eb'}`,
              backgroundColor: aggregationType === agg.value ? '#eef2ff' : 'white',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (aggregationType !== agg.value) {
                e.currentTarget.style.borderColor = '#d1d5db';
              }
            }}
            onMouseLeave={(e) => {
              if (aggregationType !== agg.value) {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }
            }}
          >
            <input
              type="radio"
              name={`aggregation-${column}`}
              value={agg.value}
              checked={aggregationType === agg.value}
              onChange={() => onAggregationChange(agg.value)}
              style={{
                marginRight: '12px',
                width: '16px',
                height: '16px',
                accentColor: '#4f46e5',
                cursor: 'pointer',
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: aggregationType === agg.value ? '#4f46e5' : '#111827',
                  marginBottom: '2px',
                }}
              >
                {agg.label}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                }}
              >
                {agg.description}
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Info Message */}
      {columnType !== 'number' && columnType !== 'integer' && columnType !== 'float' && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            backgroundColor: '#fef3c7',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#92400e',
          }}
        >
          ℹ️ Limited aggregations available for non-numeric columns
        </div>
      )}
    </div>
  );
};

// Utility function to apply aggregation to data
export const applyAggregation = (
  data: any[],
  column: string,
  aggregationType: AggregationType
): number | null => {
  if (!data || data.length === 0) return null;

  const values = data.map((row) => row[column]).filter((v) => v != null);

  if (values.length === 0) return null;

  switch (aggregationType) {
    case 'count':
      return data.length;

    case 'distinct_count':
      return new Set(values).size;

    case 'sum':
      return values.reduce((sum, val) => sum + Number(val), 0);

    case 'avg':
      const sum = values.reduce((s, val) => s + Number(val), 0);
      return sum / values.length;

    case 'min':
      return Math.min(...values.map(Number));

    case 'max':
      return Math.max(...values.map(Number));

    case 'median':
      const sorted = [...values].map(Number).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];

    default:
      return null;
  }
};
