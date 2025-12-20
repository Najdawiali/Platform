import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: number | string;
  previousValue?: number;
  format?: 'number' | 'currency' | 'percentage';
  currencySymbol?: string;
  decimals?: number;
  subtitle?: string;
  color?: string;
  showTrend?: boolean;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  previousValue,
  format = 'number',
  currencySymbol = '$',
  decimals = 0,
  subtitle,
  color = '#4f46e5',
  showTrend = true,
}) => {
  // Format the value based on type
  const formatValue = (val: number | string): string => {
    if (typeof val === 'string') return val;
    
    switch (format) {
      case 'currency':
        return `${currencySymbol}${val.toLocaleString(undefined, { 
          minimumFractionDigits: decimals, 
          maximumFractionDigits: decimals 
        })}`;
      case 'percentage':
        return `${val.toFixed(decimals)}%`;
      default:
        return val.toLocaleString(undefined, { 
          minimumFractionDigits: decimals, 
          maximumFractionDigits: decimals 
        });
    }
  };

  // Calculate trend
  const getTrend = () => {
    if (!showTrend || previousValue === undefined || typeof value !== 'number') {
      return null;
    }

    const change = value - previousValue;
    const percentChange = previousValue !== 0 ? (change / previousValue) * 100 : 0;
    
    let Icon = Minus;
    let trendColor = '#6b7280';
    
    if (change > 0) {
      Icon = TrendingUp;
      trendColor = '#10b981';
    } else if (change < 0) {
      Icon = TrendingDown;
      trendColor = '#ef4444';
    }

    return {
      Icon,
      color: trendColor,
      percentChange: Math.abs(percentChange).toFixed(1),
      isPositive: change > 0,
      isNeutral: change === 0,
    };
  };

  const trend = getTrend();
  const formattedValue = formatValue(value);

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s',
        cursor: 'pointer',
        minHeight: '150px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Title */}
      <div style={{ marginBottom: '12px' }}>
        <h3
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            margin: 0,
          }}
        >
          {title}
        </h3>
      </div>

      {/* Value */}
      <div style={{ marginBottom: '8px' }}>
        <div
          style={{
            fontSize: '36px',
            fontWeight: 700,
            color: color,
            lineHeight: '1',
          }}
        >
          {formattedValue}
        </div>
      </div>

      {/* Trend & Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {trend && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              backgroundColor: trend.isNeutral ? '#f3f4f6' : trend.isPositive ? '#d1fae5' : '#fee2e2',
              borderRadius: '6px',
            }}
          >
            <trend.Icon size={16} color={trend.color} />
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: trend.color,
              }}
            >
              {trend.percentChange}%
            </span>
          </div>
        )}
        
        {subtitle && (
          <span
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginLeft: trend ? '8px' : '0',
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};
