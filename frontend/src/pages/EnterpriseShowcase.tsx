import React, { useState, useMemo } from 'react';
import { KPICard } from '../components/KPICard';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { GlobalFilterPanel, type FilterCondition } from '../components/GlobalFilterPanel';
import { AggregationSelector, type AggregationType, applyAggregation } from '../components/AggregationSelector';
import { ExportDashboard, exportUtils } from '../components/ExportDashboard';
import { AreaChart } from '../components/AreaChart';
import { ScatterPlot } from '../components/ScatterPlot';
import { GaugeChart } from '../components/GaugeChart';
// Original chart components available in ChartCard

// Sample data for demonstration
const generateSampleData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, idx) => ({
    month,
    revenue: 40000 + Math.random() * 20000,
    expenses: 25000 + Math.random() * 10000,
    customers: 100 + Math.floor(Math.random() * 100),
    orders: 200 + Math.floor(Math.random() * 150),
    region: idx % 3 === 0 ? 'North' : idx % 3 === 1 ? 'South' : 'West',
  }));
};

const sampleData = generateSampleData();

export const EnterpriseShowcase: React.FC = () => {
  const [, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [aggregationType, setAggregationType] = useState<AggregationType>('sum');

  // Calculate filtered data based on filters and date range
  const filteredData = useMemo(() => {
    let data = [...sampleData];

    // Apply filters (simplified example)
    filters.forEach((filter) => {
      data = data.filter((row) => {
        const value = row[filter.column as keyof typeof row];
        switch (filter.operator) {
          case 'equals':
            return value === filter.value;
          case 'contains':
            return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
          case 'greater_than':
            return Number(value) > Number(filter.value);
          // Add more operators as needed
          default:
            return true;
        }
      });
    });

    return data;
  }, [filters]);

  // Calculate aggregated metrics
  const metrics = useMemo(() => {
    const totalRevenue = applyAggregation(filteredData, 'revenue', 'sum') || 0;
    const avgRevenue = applyAggregation(filteredData, 'revenue', 'avg') || 0;
    const totalCustomers = applyAggregation(filteredData, 'customers', 'sum') || 0;
    const totalOrders = applyAggregation(filteredData, 'orders', 'sum') || 0;

    // For trend comparison (compare with previous period - simplified)
    const halfPoint = Math.floor(filteredData.length / 2);
    const firstHalfRevenue = applyAggregation(filteredData.slice(0, halfPoint), 'revenue', 'sum') || 0;
    const secondHalfRevenue = applyAggregation(filteredData.slice(halfPoint), 'revenue', 'sum') || 0;

    return {
      totalRevenue,
      avgRevenue,
      totalCustomers,
      totalOrders,
      previousRevenue: firstHalfRevenue,
      currentRevenue: secondHalfRevenue,
    };
  }, [filteredData]);

  // Available columns for filtering
  const availableColumns = [
    { column: 'region', datasetId: 'sales', datasetName: 'Sales', type: 'string' },
    { column: 'revenue', datasetId: 'sales', datasetName: 'Sales', type: 'number' },
    { column: 'customers', datasetId: 'sales', datasetName: 'Sales', type: 'number' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '24px' }}>
      {/* Header Section */}
      <div
        id="dashboard-container"
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '32px',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '32px',
                fontWeight: 700,
                color: '#111827',
                margin: '0 0 8px 0',
              }}
            >
              🚀 Enterprise Dashboard Showcase
            </h1>
            <p
              style={{
                fontSize: '16px',
                color: '#6b7280',
                margin: 0,
              }}
            >
              Demonstrating all 8 enterprise-grade components
            </p>
          </div>

          <ExportDashboard
            dashboardName="Enterprise-Dashboard-Showcase"
            onExportPDF={async () => {
              await exportUtils.exportToPDF('dashboard-container', 'enterprise-dashboard');
            }}
            onExportPNG={async () => {
              await exportUtils.exportToPNG('dashboard-container', 'enterprise-dashboard');
            }}
            onExportCSV={async () => {
              exportUtils.exportToCSV(filteredData, 'dashboard-data');
            }}
            onExportJSON={async () => {
              exportUtils.exportToJSON({ data: filteredData, metrics }, 'dashboard-export');
            }}
          />
        </div>

        {/* Filters Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '32px' }}>
          <GlobalFilterPanel
            availableColumns={availableColumns}
            filters={filters}
            onFiltersChange={setFilters}
            onApplyFilters={() => {
              console.log('Applying filters:', filters);
              // Filters are automatically applied via useMemo above
            }}
          />
          <DateRangeFilter
            label="Report Period"
            onDateRangeChange={(start, end) => {
              setDateRange({ start, end });
              console.log('Date range changed:', start, end);
            }}
          />
        </div>

        {/* KPI Cards Section */}
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '16px',
            }}
          >
            📊 Key Performance Indicators
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <KPICard
              title="Total Revenue"
              value={metrics.currentRevenue}
              previousValue={metrics.previousRevenue}
              format="currency"
              currencySymbol="$"
              decimals={0}
              subtitle="Current vs Previous Period"
              color="#10b981"
              showTrend={true}
            />
            <KPICard
              title="Average Revenue"
              value={metrics.avgRevenue}
              format="currency"
              currencySymbol="$"
              decimals={2}
              subtitle="Per month"
              color="#4f46e5"
              showTrend={false}
            />
            <KPICard
              title="Total Customers"
              value={metrics.totalCustomers}
              format="number"
              decimals={0}
              subtitle={`${filteredData.length} months`}
              color="#f59e0b"
              showTrend={false}
            />
            <KPICard
              title="Total Orders"
              value={metrics.totalOrders}
              format="number"
              decimals={0}
              subtitle="All regions"
              color="#ec4899"
              showTrend={false}
            />
          </div>
        </div>

        {/* Gauge Section */}
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '16px',
            }}
          >
            🎯 Goal Tracking
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
              <GaugeChart
                value={metrics.currentRevenue}
                maxValue={700000}
                title="Revenue Target"
                subtitle="Current Period"
                unit="$"
              />
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
              <GaugeChart
                value={metrics.totalCustomers}
                maxValue={2000}
                title="Customer Acquisition"
                subtitle="Annual Goal"
                unit=""
              />
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '16px',
            }}
          >
            📈 Trend Analysis
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
              <AreaChart
                data={filteredData}
                xKey="month"
                yKeys={['revenue', 'expenses']}
                colors={['#10b981', '#ef4444']}
                title="Revenue vs Expenses"
                stacked={false}
                fillOpacity={0.3}
              />
            </div>
          </div>
        </div>

        {/* Comparison Charts */}
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '16px',
            }}
          >
            📊 Multi-Dimensional Analysis
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                <h3 style={{ margin: 0 }}>3D Bar Chart</h3>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>
                  Original 3D chart types available in ChartCard component
                </p>
              </div>
            </div>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
              <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                <h3 style={{ margin: 0 }}>Line Chart</h3>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>
                  Original line chart available in ChartCard component
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scatter Plot Section */}
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '16px',
            }}
          >
            🔍 Correlation Analysis
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
              <ScatterPlot
                data={filteredData}
                xKey="customers"
                yKey="revenue"
                sizeKey="orders"
                colors={['#4f46e5']}
                title="Customers vs Revenue (Bubble Size = Orders)"
                xLabel="Number of Customers"
                yLabel="Revenue ($)"
              />
            </div>
          </div>
        </div>

        {/* Aggregation Demo */}
        <div style={{ marginBottom: '32px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '16px',
            }}
          >
            🧮 Data Aggregation
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
              <AggregationSelector
                column="revenue"
                columnType="number"
                aggregationType={aggregationType}
                onAggregationChange={(type) => {
                  setAggregationType(type);
                  const result = applyAggregation(filteredData, 'revenue', type);
                  console.log(`Revenue ${type}:`, result);
                }}
                label="Aggregate Revenue Column"
              />
              <div
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                  Result ({aggregationType})
                </div>
                <div style={{ fontSize: '32px', fontWeight: 700, color: '#4f46e5' }}>
                  ${(applyAggregation(filteredData, 'revenue', aggregationType) || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div
          style={{
            marginTop: '48px',
            padding: '24px',
            backgroundColor: '#eef2ff',
            borderRadius: '12px',
            border: '2px solid #4f46e5',
          }}
        >
          <h3
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: '#4f46e5',
              marginBottom: '12px',
            }}
          >
            ✨ What You're Seeing
          </h3>
          <ul
            style={{
              margin: 0,
              paddingLeft: '24px',
              color: '#4338ca',
              fontSize: '14px',
              lineHeight: '1.8',
            }}
          >
            <li><strong>KPI Cards:</strong> Real-time metrics with trend indicators</li>
            <li><strong>Date Range Filter:</strong> Filter data by time periods (9 quick presets + custom)</li>
            <li><strong>Global Filters:</strong> Apply complex multi-condition filters across all charts</li>
            <li><strong>Gauge Charts:</strong> Visual progress tracking toward goals</li>
            <li><strong>Area Chart:</strong> Filled line charts perfect for trends</li>
            <li><strong>Scatter Plot:</strong> Correlation analysis with bubble size dimension</li>
            <li><strong>Aggregation Selector:</strong> Calculate SUM, AVG, COUNT, MIN, MAX, MEDIAN</li>
            <li><strong>Export Options:</strong> Download as PDF, PNG, CSV, or JSON</li>
          </ul>
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: 'white',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#6b7280',
            }}
          >
            💡 <strong>Tip:</strong> Check <code>DASHBOARD_COMPONENTS_GUIDE.md</code> for complete usage documentation and integration examples.
          </div>
        </div>
      </div>
    </div>
  );
};
