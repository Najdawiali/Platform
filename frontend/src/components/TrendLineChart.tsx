import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export type TrendLineType = 'linear' | 'polynomial' | 'exponential' | 'moving_average';

interface TrendLineChartProps {
  data: any[];
  xKey: string;
  yKey: string;
  showTrendLine?: boolean;
  trendLineType?: TrendLineType;
  forecastPeriods?: number;
  movingAveragePeriod?: number;
  color?: string;
  height?: number;
}

// Linear regression calculation
const calculateLinearRegression = (data: { x: number; y: number }[]): { slope: number; intercept: number } => {
  const n = data.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;

  data.forEach(point => {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
};

// Moving average calculation
const calculateMovingAverage = (data: number[], period: number): number[] => {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
};

// Exponential smoothing
const calculateExponentialSmoothing = (data: number[], alpha: number = 0.3): number[] => {
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
};

// Polynomial regression (degree 2)
const calculatePolynomialRegression = (
  data: { x: number; y: number }[]
): { a: number; b: number; c: number } => {
  const n = data.length;
  let sumX = 0,
    sumY = 0,
    sumX2 = 0,
    sumX3 = 0,
    sumX4 = 0,
    sumXY = 0,
    sumX2Y = 0;

  data.forEach(point => {
    sumX += point.x;
    sumY += point.y;
    sumX2 += point.x ** 2;
    sumX3 += point.x ** 3;
    sumX4 += point.x ** 4;
    sumXY += point.x * point.y;
    sumX2Y += point.x ** 2 * point.y;
  });

  // Simplified polynomial calculation (using matrix approach would be more accurate)
  const a =
    ((sumX2Y * (sumX2 * n - sumX * sumX) - sumXY * (sumX3 * n - sumX * sumX2)) /
      (sumX4 * (sumX2 * n - sumX * sumX) - sumX3 * (sumX3 * n - sumX * sumX2))) ||
    0;
  const b =
    ((sumXY - a * sumX3) / (sumX2 - a * sumX2 * n)) || 0;
  const c = (sumY - b * sumX - a * sumX2) / n;

  return { a, b, c };
};

export const TrendLineChart: React.FC<TrendLineChartProps> = ({
  data,
  xKey,
  yKey,
  showTrendLine = true,
  trendLineType = 'linear',
  forecastPeriods = 3,
  movingAveragePeriod = 3,
  color = '#4f46e5',
  height = 400,
}) => {
  // Prepare data points
  const numericData = data
    .map((item, index) => ({
      x: index,
      y: parseFloat(item[yKey]) || 0,
      label: item[xKey],
    }))
    .filter(item => !isNaN(item.y));

  // Calculate trend line
  let trendData: any[] = [];
  let forecastData: any[] = [];

  if (showTrendLine && numericData.length > 0) {
    const xyPoints = numericData.map(d => ({ x: d.x, y: d.y }));

    if (trendLineType === 'linear') {
      const { slope, intercept } = calculateLinearRegression(xyPoints);

      // Historical trend line
      trendData = numericData.map((point, index) => ({
        label: point.label,
        actual: point.y,
        trend: slope * index + intercept,
      }));

      // Forecast
      for (let i = 1; i <= forecastPeriods; i++) {
        const futureX = numericData.length + i - 1;
        forecastData.push({
          label: `Forecast ${i}`,
          forecast: slope * futureX + intercept,
        });
      }
    } else if (trendLineType === 'polynomial') {
      const { a, b, c } = calculatePolynomialRegression(xyPoints);

      trendData = numericData.map((point, index) => ({
        label: point.label,
        actual: point.y,
        trend: a * index ** 2 + b * index + c,
      }));

      // Forecast
      for (let i = 1; i <= forecastPeriods; i++) {
        const futureX = numericData.length + i - 1;
        forecastData.push({
          label: `Forecast ${i}`,
          forecast: a * futureX ** 2 + b * futureX + c,
        });
      }
    } else if (trendLineType === 'exponential') {
      const smoothed = calculateExponentialSmoothing(numericData.map(d => d.y));

      trendData = numericData.map((point, index) => ({
        label: point.label,
        actual: point.y,
        trend: smoothed[index],
      }));

      // Simple forecast (extend last smoothed value)
      const lastValue = smoothed[smoothed.length - 1];
      for (let i = 1; i <= forecastPeriods; i++) {
        forecastData.push({
          label: `Forecast ${i}`,
          forecast: lastValue,
        });
      }
    } else if (trendLineType === 'moving_average') {
      const ma = calculateMovingAverage(numericData.map(d => d.y), movingAveragePeriod);

      trendData = numericData.map((point, index) => ({
        label: point.label,
        actual: point.y,
        trend: ma[index],
      }));

      // Forecast using average of last N values
      const lastValues = numericData.slice(-movingAveragePeriod).map(d => d.y);
      const avgForecast = lastValues.reduce((a, b) => a + b, 0) / lastValues.length;
      for (let i = 1; i <= forecastPeriods; i++) {
        forecastData.push({
          label: `Forecast ${i}`,
          forecast: avgForecast,
        });
      }
    }
  }

  // Combine all data
  const combinedData = [...trendData, ...forecastData];

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart data={combinedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Legend />
          
          {/* Actual Data */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, r: 4 }}
            name="Actual"
            connectNulls
          />
          
          {/* Trend Line */}
          {showTrendLine && (
            <Line
              type="monotone"
              dataKey="trend"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name={`Trend (${trendLineType})`}
              connectNulls
            />
          )}
          
          {/* Forecast */}
          {forecastData.length > 0 && (
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="8 4"
              dot={{ fill: '#f59e0b', r: 5 }}
              name="Forecast"
              connectNulls
            />
          )}
        </RechartsLineChart>
      </ResponsiveContainer>

      {/* Legend Info */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5" style={{ backgroundColor: color }}></div>
          <span className="text-gray-700">Actual Data</span>
        </div>
        {showTrendLine && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-500" style={{ backgroundImage: 'linear-gradient(to right, #10b981 50%, transparent 50%)', backgroundSize: '8px 2px' }}></div>
            <span className="text-gray-700">Trend Line ({trendLineType})</span>
          </div>
        )}
        {forecastData.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-yellow-500" style={{ backgroundImage: 'linear-gradient(to right, #f59e0b 50%, transparent 50%)', backgroundSize: '10px 2px' }}></div>
            <span className="text-gray-700">Forecast ({forecastPeriods} periods)</span>
          </div>
        )}
      </div>
    </div>
  );
};
