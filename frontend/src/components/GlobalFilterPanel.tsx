import React, { useState, useMemo } from 'react';
import { Filter, Plus, Trash2 } from 'lucide-react';

export interface FilterCondition {
  id: string;
  column: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'between' | 'in';
  value: string | number | string[];
  datasetId: string;
}

interface GlobalFilterPanelProps {
  availableColumns: Array<{
    column: string;
    datasetId: string;
    datasetName: string;
    type?: string;
  }>;
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => void;
  onApplyFilters: () => void;
}

export const GlobalFilterPanel: React.FC<GlobalFilterPanelProps> = ({
  availableColumns,
  filters,
  onFiltersChange,
  onApplyFilters,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const addFilter = () => {
    const newFilter: FilterCondition = {
      id: `filter-${Date.now()}`,
      column: availableColumns[0]?.column || '',
      operator: 'equals',
      value: '',
      datasetId: availableColumns[0]?.datasetId || '',
    };
    onFiltersChange([...filters, newFilter]);
  };

  const removeFilter = (filterId: string) => {
    onFiltersChange(filters.filter((f) => f.id !== filterId));
  };

  const updateFilter = (
    filterId: string,
    updates: Partial<FilterCondition>
  ) => {
    onFiltersChange(
      filters.map((f) => (f.id === filterId ? { ...f, ...updates } : f))
    );
  };

  const clearAllFilters = () => {
    onFiltersChange([]);
    onApplyFilters();
  };

  // Get column info for a filter
  const getColumnInfo = (filter: FilterCondition) => {
    return availableColumns.find(
      (col) => col.column === filter.column && col.datasetId === filter.datasetId
    );
  };

  const operatorOptions = useMemo(() => {
    return [
      { value: 'equals', label: 'Equals (=)' },
      { value: 'not_equals', label: 'Not Equals (≠)' },
      { value: 'contains', label: 'Contains' },
      { value: 'not_contains', label: 'Does Not Contain' },
      { value: 'greater_than', label: 'Greater Than (>)' },
      { value: 'less_than', label: 'Less Than (<)' },
      { value: 'between', label: 'Between' },
      { value: 'in', label: 'In List' },
    ];
  }, []);

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Filter size={20} color="#4f46e5" />
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#111827',
              margin: 0,
            }}
          >
            Global Filters
          </h3>
          {filters.length > 0 && (
            <span
              style={{
                backgroundColor: '#4f46e5',
                color: 'white',
                fontSize: '12px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
              }}
            >
              {filters.length}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {filters.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearAllFilters();
              }}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid #ef4444',
                backgroundColor: 'white',
                color: '#ef4444',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fef2f2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              Clear All
            </button>
          )}
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '18px', color: '#6b7280' }}>
              {isExpanded ? '−' : '+'}
            </span>
          </button>
        </div>
      </div>

      {/* Filter List */}
      {isExpanded && (
        <div style={{ padding: '20px' }}>
          {filters.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '24px',
                color: '#9ca3af',
                fontSize: '14px',
              }}
            >
              No filters applied. Click "Add Filter" to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filters.map((filter, index) => {
                const columnInfo = getColumnInfo(filter);
                return (
                  <div
                    key={filter.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    {/* Filter Number */}
                    <div
                      style={{
                        backgroundColor: '#4f46e5',
                        color: 'white',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>

                    {/* Column Selector */}
                    <select
                      value={`${filter.datasetId}::${filter.column}`}
                      onChange={(e) => {
                        const [datasetId, column] = e.target.value.split('::');
                        updateFilter(filter.id, { column, datasetId });
                      }}
                      style={{
                        flex: 1,
                        minWidth: '150px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        backgroundColor: 'white',
                        outline: 'none',
                      }}
                    >
                      {availableColumns.map((col) => (
                        <option
                          key={`${col.datasetId}-${col.column}`}
                          value={`${col.datasetId}::${col.column}`}
                        >
                          {col.datasetName} → {col.column}
                        </option>
                      ))}
                    </select>

                    {/* Operator Selector */}
                    <select
                      value={filter.operator}
                      onChange={(e) =>
                        updateFilter(filter.id, {
                          operator: e.target.value as FilterCondition['operator'],
                        })
                      }
                      style={{
                        flex: 0.8,
                        minWidth: '140px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        backgroundColor: 'white',
                        outline: 'none',
                      }}
                    >
                      {operatorOptions.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>

                    {/* Value Input */}
                    {filter.operator === 'in' ? (
                      <input
                        type="text"
                        value={Array.isArray(filter.value) ? filter.value.join(', ') : filter.value}
                        onChange={(e) => {
                          const values = e.target.value.split(',').map((v) => v.trim());
                          updateFilter(filter.id, { value: values });
                        }}
                        placeholder="value1, value2, value3"
                        style={{
                          flex: 1,
                          minWidth: '150px',
                          padding: '8px 12px',
                          fontSize: '14px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          outline: 'none',
                        }}
                      />
                    ) : filter.operator === 'between' ? (
                      <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                        <input
                          type="text"
                          placeholder="Min"
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '14px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            outline: 'none',
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Max"
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '14px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            outline: 'none',
                          }}
                        />
                      </div>
                    ) : (
                      <input
                        type={columnInfo?.type === 'number' ? 'number' : 'text'}
                        value={filter.value}
                        onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                        placeholder="Enter value..."
                        style={{
                          flex: 1,
                          minWidth: '150px',
                          padding: '8px 12px',
                          fontSize: '14px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          outline: 'none',
                        }}
                      />
                    )}

                    {/* Remove Button */}
                    <button
                      onClick={() => removeFilter(filter.id)}
                      style={{
                        padding: '8px',
                        backgroundColor: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fecaca';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#fee2e2';
                      }}
                    >
                      <Trash2 size={16} color="#ef4444" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <button
              onClick={addFilter}
              disabled={availableColumns.length === 0}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: 'white',
                color: '#4f46e5',
                cursor: availableColumns.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: availableColumns.length === 0 ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (availableColumns.length > 0) {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              <Plus size={16} />
              Add Filter
            </button>

            <button
              onClick={onApplyFilters}
              disabled={filters.length === 0}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                backgroundColor: filters.length === 0 ? '#d1d5db' : '#4f46e5',
                color: 'white',
                cursor: filters.length === 0 ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (filters.length > 0) {
                  e.currentTarget.style.backgroundColor = '#4338ca';
                }
              }}
              onMouseLeave={(e) => {
                if (filters.length > 0) {
                  e.currentTarget.style.backgroundColor = '#4f46e5';
                }
              }}
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
