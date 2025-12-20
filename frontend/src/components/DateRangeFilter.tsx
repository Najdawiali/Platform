import React, { useState } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangeFilterProps {
  onDateRangeChange: (startDate: Date | null, endDate: Date | null) => void;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
  label?: string;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  onDateRangeChange,
  initialStartDate = null,
  initialEndDate = null,
  label = 'Date Range',
}) => {
  const [startDate, setStartDate] = useState<string>(
    initialStartDate ? formatDateForInput(initialStartDate) : ''
  );
  const [endDate, setEndDate] = useState<string>(
    initialEndDate ? formatDateForInput(initialEndDate) : ''
  );
  const [quickSelect, setQuickSelect] = useState<string>('custom');

  function formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  const handleQuickSelect = (period: string) => {
    setQuickSelect(period);
    let end = new Date();
    let start = new Date();

    switch (period) {
      case 'today':
        start = new Date();
        break;
      case 'yesterday':
        start = new Date();
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case 'last7days':
        start.setDate(start.getDate() - 7);
        break;
      case 'last30days':
        start.setDate(start.getDate() - 30);
        break;
      case 'last90days':
        start.setDate(start.getDate() - 90);
        break;
      case 'thisMonth':
        start = new Date(end.getFullYear(), end.getMonth(), 1);
        break;
      case 'lastMonth':
        start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
        end = new Date(end.getFullYear(), end.getMonth(), 0);
        break;
      case 'thisYear':
        start = new Date(end.getFullYear(), 0, 1);
        break;
      case 'lastYear':
        start = new Date(end.getFullYear() - 1, 0, 1);
        end = new Date(end.getFullYear() - 1, 11, 31);
        break;
      case 'all':
        onDateRangeChange(null, null);
        setStartDate('');
        setEndDate('');
        return;
      case 'custom':
        return;
      default:
        return;
    }

    const startStr = formatDateForInput(start);
    const endStr = formatDateForInput(end);
    setStartDate(startStr);
    setEndDate(endStr);
    onDateRangeChange(start, end);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setStartDate(value);
    setQuickSelect('custom');
    const start = value ? new Date(value) : null;
    const end = endDate ? new Date(endDate) : null;
    onDateRangeChange(start, end);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEndDate(value);
    setQuickSelect('custom');
    const start = startDate ? new Date(startDate) : null;
    const end = value ? new Date(value) : null;
    onDateRangeChange(start, end);
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    setQuickSelect('all');
    onDateRangeChange(null, null);
  };

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        padding: '16px',
      }}
    >
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Calendar size={20} color="#4f46e5" />
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: '#111827',
            margin: 0,
          }}
        >
          {label}
        </h3>
      </div>

      {/* Quick Select Buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        {[
          { value: 'today', label: 'Today' },
          { value: 'yesterday', label: 'Yesterday' },
          { value: 'last7days', label: 'Last 7 Days' },
          { value: 'last30days', label: 'Last 30 Days' },
          { value: 'last90days', label: 'Last 90 Days' },
          { value: 'thisMonth', label: 'This Month' },
          { value: 'lastMonth', label: 'Last Month' },
          { value: 'thisYear', label: 'This Year' },
          { value: 'all', label: 'All Time' },
        ].map((option) => (
          <button
            key={option.value}
            onClick={() => handleQuickSelect(option.value)}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '6px',
              border: quickSelect === option.value ? '2px solid #4f46e5' : '1px solid #d1d5db',
              backgroundColor: quickSelect === option.value ? '#eef2ff' : 'white',
              color: quickSelect === option.value ? '#4f46e5' : '#6b7280',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (quickSelect !== option.value) {
                e.currentTarget.style.borderColor = '#9ca3af';
              }
            }}
            onMouseLeave={(e) => {
              if (quickSelect !== option.value) {
                e.currentTarget.style.borderColor = '#d1d5db';
              }
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Custom Date Inputs */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#6b7280',
              marginBottom: '4px',
            }}
          >
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={handleStartDateChange}
            max={endDate || undefined}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#4f46e5';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#6b7280',
              marginBottom: '4px',
            }}
          >
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={handleEndDateChange}
            min={startDate || undefined}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#4f46e5';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      {/* Clear Button */}
      {(startDate || endDate) && (
        <button
          onClick={handleClear}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: 'white',
            color: '#6b7280',
            cursor: 'pointer',
            width: '100%',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f9fafb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
          }}
        >
          Clear Dates
        </button>
      )}
    </div>
  );
};
