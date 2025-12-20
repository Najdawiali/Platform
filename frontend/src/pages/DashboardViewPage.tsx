import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { dashboardService } from '../services/dashboardService';
import { datasetService } from '../services/datasetService';
import { BarChart, Bar, LineChart as RechartsLine, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DashboardViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Fetch dashboard
  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => dashboardService.getDashboard(id!),
    enabled: !!id,
  });

  // Fetch data for all charts
  const chartQueries = useQuery({
    queryKey: ['dashboard-charts-data', id],
    queryFn: async () => {
      if (!dashboard?.charts) return [];
      
      const dataPromises = dashboard.charts.map(async (chart) => {
        try {
          const data = await datasetService.getFullDatasetData(chart.dataset_id);
          return {
            chartId: chart.id,
            data: data.data,
            columns: data.columns,
          };
        } catch (error) {
          console.error(`Failed to load data for chart ${chart.id}:`, error);
          return {
            chartId: chart.id,
            data: [],
            columns: [],
            error: true,
          };
        }
      });

      return Promise.all(dataPromises);
    },
    enabled: !!dashboard?.charts && dashboard.charts.length > 0,
  });

  const renderChart = (chart: any, chartData: any) => {
    if (!chartData || chartData.error || chartData.data.length === 0) {
      return (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '32px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
          <div style={{ color: '#dc2626', fontSize: '14px' }}>Failed to load chart data</div>
        </div>
      );
    }

    const colors = ['#4f46e5', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    const data = chartData.data || [];
    
    // Debug logging
    console.log('Chart config:', { 
      type: chart.chart_type, 
      x_column: chart.x_column, 
      y_column: chart.y_column,
      title: chart.title,
      config: chart.config 
    });
    console.log('Data sample:', data.slice(0, 2));
    console.log('Available columns:', chartData.columns);
    
    // Handle table charts separately - no aggregation needed
    if (chart.chart_type === 'table') {
      const tableData = data.slice(0, 50);
      const savedColumns = chart.config?.columns || chartData.columns || Object.keys(tableData[0] || {});
      
      // Map saved column names to actual column names in the data
      const actualColumns = savedColumns.map((savedCol: string) => {
        if (tableData.length === 0) return savedCol;
        const dataKeys = Object.keys(tableData[0]);
        
        // Try exact match
        if (dataKeys.includes(savedCol)) return savedCol;
        
        // Try with underscores
        const underscoreVersion = savedCol.replace(/ /g, '_');
        if (dataKeys.includes(underscoreVersion)) return underscoreVersion;
        
        // Try case-insensitive
        const lowerSaved = savedCol.toLowerCase();
        const match = dataKeys.find(key => key.toLowerCase() === lowerSaved);
        return match || savedCol;
      });
      
      const tableColumns = actualColumns;
      
      if (tableData.length === 0) {
        return (
          <div style={{
            backgroundColor: '#fef9e7',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            padding: '32px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
            <div style={{ color: '#92400e', fontSize: '14px' }}>No data available for this chart</div>
          </div>
        );
      }
      
      return (
        <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
                {tableColumns.map((col: string, idx: number) => (
                  <th key={idx} style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '2px solid #e2e8f0',
                    fontWeight: 600,
                    color: '#0f172a'
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row: any, rowIdx: number) => (
                <tr key={rowIdx} style={{
                  borderBottom: '1px solid #f1f5f9',
                  backgroundColor: rowIdx % 2 === 0 ? 'white' : '#f8fafc'
                }}>
                  {tableColumns.map((col: string, colIdx: number) => (
                    <td key={colIdx} style={{
                      padding: '10px 12px',
                      color: '#475569'
                    }}>
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {tableData.length === 50 && (
            <div style={{
              padding: '12px',
              textAlign: 'center',
              fontSize: '12px',
              color: '#64748b',
              backgroundColor: '#f8fafc'
            }}>
              Showing first 50 rows
            </div>
          )}
        </div>
      );
    }
    
    // For non-table charts, validate x column (y column is optional for bar charts - they can count)
    if (!chart.x_column) {
      return (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '32px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
          <div style={{ color: '#dc2626', fontSize: '14px' }}>Invalid chart configuration - missing x column</div>
          <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '8px' }}>
            x_column: {chart.x_column || 'none'}, y_column: {chart.y_column || 'none'}
          </div>
        </div>
      );
    }
    
    // Aggregate data for bar, line, pie charts
    const aggregated: Record<string, any> = {};
    const hasYColumn = chart.y_column && chart.y_column !== '';
    
    console.log('Processing chart:', {
      type: chart.chart_type,
      x_column: chart.x_column,
      y_column: chart.y_column,
      hasYColumn,
      dataLength: data.length,
      sampleRow: data[0],
      sampleRowType: typeof data[0],
      xValueInSample: data[0]?.[chart.x_column],
      xValueType: typeof data[0]?.[chart.x_column],
      yValueInSample: data[0]?.[chart.y_column],
      yValueType: typeof data[0]?.[chart.y_column],
      allKeys: data[0] ? Object.keys(data[0]) : []
    });
    
    // Try to find the actual column name in the data
    // The saved chart might have display name (e.g., "Item Code")
    // But actual data has underscore version (e.g., "Item_Code")
    const findActualColumnName = (savedColumnName: string): string => {
      if (data.length === 0) return savedColumnName;
      const dataKeys = Object.keys(data[0]);
      
      // First try exact match
      if (dataKeys.includes(savedColumnName)) return savedColumnName;
      
      // Try with underscores instead of spaces
      const underscoreVersion = savedColumnName.replace(/ /g, '_');
      if (dataKeys.includes(underscoreVersion)) return underscoreVersion;
      
      // Try case-insensitive match
      const lowerSaved = savedColumnName.toLowerCase();
      const match = dataKeys.find(key => key.toLowerCase() === lowerSaved);
      if (match) return match;
      
      // Return original if no match found
      return savedColumnName;
    };
    
    const actualXColumn = findActualColumnName(chart.x_column);
    const actualYColumn = hasYColumn ? findActualColumnName(chart.y_column) : '';
    
    console.log('Column name mapping:', {
      savedXColumn: chart.x_column,
      actualXColumn,
      savedYColumn: chart.y_column,
      actualYColumn,
      availableKeys: data.length > 0 ? Object.keys(data[0]) : []
    });
    
    let skippedRows = 0;
    data.forEach((row: any) => {
      const xValue = row[actualXColumn];
      // Skip rows where x_column is null/undefined/empty
      if (xValue === null || xValue === undefined || xValue === '') {
        skippedRows++;
        return;
      }
      
      const key = String(xValue);
      if (!aggregated[key]) {
        aggregated[key] = { name: key, value: 0, count: 0 };
      }
      
      if (hasYColumn) {
        // Try to convert y_column value to a number
        const yValue = Number(row[actualYColumn]);
        if (!isNaN(yValue)) {
          // If it's numeric, sum the values
          aggregated[key].value += yValue;
          aggregated[key].count += 1;
        } else {
          // If it's not numeric (text, date, etc.), just count occurrences
          aggregated[key].value += 1;
          aggregated[key].count += 1;
        }
      } else {
        // If no y_column, count occurrences
        aggregated[key].value += 1;
        aggregated[key].count += 1;
      }
    });

    console.log('Aggregation results:', {
      totalRows: data.length,
      skippedRows,
      processedRows: data.length - skippedRows,
      uniqueKeys: Object.keys(aggregated).length,
      aggregatedSample: Object.values(aggregated).slice(0, 3)
    });

    let processedData = Object.values(aggregated)
      .filter((item: any) => item.name && item.count > 0)
      .sort((a: any, b: any) => b.value - a.value); // Sort by value descending
    
    // For better readability, limit to top 10 items and group rest as "Others"
    if (processedData.length > 10) {
      const top10 = processedData.slice(0, 10);
      const others = processedData.slice(10);
      const othersSum = others.reduce((sum: number, item: any) => sum + item.value, 0);
      const othersCount = others.reduce((sum: number, item: any) => sum + item.count, 0);
      
      if (othersSum > 0) {
        processedData = [
          ...top10,
          { name: 'Others', value: othersSum, count: othersCount }
        ];
      } else {
        processedData = top10;
      }
    }
    
    console.log('Final processed data length:', processedData.length);
    
    // If no data after processing, show empty state with more details
    if (processedData.length === 0) {
      return (
        <div style={{
          backgroundColor: '#fef9e7',
          border: '1px solid #fde68a',
          borderRadius: '8px',
          padding: '32px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
          <div style={{ color: '#92400e', fontSize: '14px' }}>No data available for this chart</div>
          <div style={{ color: '#92400e', fontSize: '11px', marginTop: '8px' }}>
            Data rows: {data.length}, After filtering: 0
          </div>
        </div>
      );
    }

    switch (chart.chart_type) {
      case 'bar':
        // Truncate long labels for better display
        const barData = processedData.map((item: any) => ({
          ...item,
          name: item.name.length > 20 ? item.name.substring(0, 17) + '...' : item.name,
          fullName: item.name
        }));
        
        return (
          <ResponsiveContainer width="100%" height={450}>
            <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                angle={-35}
                textAnchor="end"
                height={100}
                interval={0}
                style={{ fontSize: '11px', fill: '#64748b' }}
              />
              <YAxis 
                style={{ fontSize: '12px', fill: '#64748b' }}
                label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { fill: '#64748b' } }}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div style={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px', color: '#0f172a' }}>
                          {data.fullName || data.name}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '13px' }}>
                          Value: <span style={{ fontWeight: '600', color: colors[0] }}>{data.value}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" fill={colors[0]} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        const lineData = processedData.map((item: any) => ({
          ...item,
          name: item.name.length > 20 ? item.name.substring(0, 17) + '...' : item.name,
          fullName: item.name
        }));
        
        return (
          <ResponsiveContainer width="100%" height={450}>
            <RechartsLine data={lineData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="name" 
                angle={-35}
                textAnchor="end"
                height={100}
                interval={0}
                style={{ fontSize: '11px', fill: '#64748b' }}
              />
              <YAxis 
                style={{ fontSize: '12px', fill: '#64748b' }}
                label={{ value: 'Value', angle: -90, position: 'insideLeft', style: { fill: '#64748b' } }}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div style={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px', color: '#0f172a' }}>
                          {data.fullName || data.name}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '13px' }}>
                          Value: <span style={{ fontWeight: '600', color: colors[0] }}>{data.value}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={colors[0]} 
                strokeWidth={3}
                dot={{ fill: colors[0], r: 6 }}
                activeDot={{ r: 8, strokeWidth: 2, stroke: 'white' }}
              />
            </RechartsLine>
          </ResponsiveContainer>
        );
      case 'pie':
        // Calculate total and percentages
        const pieTotal = processedData.reduce((sum: number, item: any) => sum + item.value, 0);
        const pieData = processedData.map((item: any) => ({
          ...item,
          percentage: ((item.value / pieTotal) * 100).toFixed(1)
        }));
        
        return (
          <ResponsiveContainer width="100%" height={500}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="45%"
                labelLine={false}
                label={({ name, percent }: any) => {
                  // Only show label if percentage > 3% to avoid clutter
                  const percentage = (percent * 100).toFixed(0);
                  if (parseFloat(percentage) > 3 && name) {
                    const shortName = name.length > 15 ? name.substring(0, 12) + '...' : name;
                    return `${shortName}: ${percentage}%`;
                  }
                  return '';
                }}
                outerRadius={130}
                innerRadius={0}
                fill="#8884d8"
                dataKey="value"
                paddingAngle={1}
              >
                {pieData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div style={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '12px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px', color: '#0f172a' }}>
                          {data.name}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '13px' }}>
                          Value: <span style={{ fontWeight: '600' }}>{data.value}</span>
                        </div>
                        <div style={{ color: '#64748b', fontSize: '13px' }}>
                          Percentage: <span style={{ fontWeight: '600' }}>{data.percentage}%</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={80}
                wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
                formatter={(value: string) => value.length > 20 ? value.substring(0, 17) + '...' : value}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      default:
        return (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
            Unsupported chart type: {chart.chart_type}
          </div>
        );
    }
  };

  if (dashboardLoading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading dashboard...</div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
        <div style={{ fontSize: '18px', color: '#6b7280', marginBottom: '24px' }}>Dashboard not found</div>
        <button
          onClick={() => navigate('/dashboards')}
          style={{
            padding: '12px 24px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Back to Dashboards
        </button>
      </div>
    );
  }

  const chartsData = chartQueries.data || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
      {/* Top Bar */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '20px 32px',
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={() => navigate('/dashboards')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f8fafc',
                  color: '#475569',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
              >
                ← Back
              </button>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', marginBottom: '4px' }}>
                  {dashboard.name}
                </h1>
                {dashboard.description && (
                  <p style={{ color: '#64748b', fontSize: '14px' }}>
                    {dashboard.description}
                  </p>
                )}
              </div>
            </div>
            
            {/* Edit Button */}
            <button
              onClick={() => {
                // Navigate to visualize page with dashboard data for editing
                const datasetIds = [...new Set(dashboard.charts.map(c => c.dataset_id))];
                navigate(`/visualize?datasets=${datasetIds.join(',')}&edit=${dashboard.id}`);
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
            >
              <span>✏️</span>
              <span>Edit Dashboard</span>
            </button>
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '13px',
            color: '#64748b'
          }}>
            <span>📊 {dashboard.charts.length} chart{dashboard.charts.length !== 1 ? 's' : ''}</span>
            <span>•</span>
            <span>📅 Created {new Date(dashboard.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>

          {/* Charts Grid */}
          {dashboard.charts.length === 0 ? (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              border: '2px dashed #e2e8f0',
              padding: '80px 32px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.5 }}>📊</div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                No charts in this dashboard
              </h3>
              <p style={{ color: '#64748b', marginBottom: '24px' }}>
                This dashboard is empty. Click "Edit Dashboard" to add charts.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
              gap: '24px',
            }}>
              {dashboard.charts.map((chart) => {
                const chartData = chartsData.find(d => d.chartId === chart.id);
                
                return (
                  <div
                    key={chart.id}
                    style={{
                      backgroundColor: 'white',
                      borderRadius: '16px',
                      border: '1px solid #e2e8f0',
                      overflow: 'hidden',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.06)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Chart Header */}
                    <div style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: '#f8fafc'
                    }}>
                      <h3 style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#0f172a',
                        margin: 0
                      }}>
                        {chart.title || `${chart.chart_type.charAt(0).toUpperCase() + chart.chart_type.slice(1)} Chart`}
                      </h3>
                    </div>
                    
                    {/* Chart Content */}
                    <div style={{ padding: '20px' }}>
                      {chartQueries.isLoading ? (
                        <div style={{ padding: '64px', textAlign: 'center', color: '#64748b' }}>
                          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                          Loading chart data...
                        </div>
                      ) : (
                        renderChart(chart, chartData)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { DashboardViewPage };
