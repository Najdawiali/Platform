import React from 'react';
import { BarChart3D } from './BarChart3D';
import { Pie3DChart } from './Pie3DChart';
import { LineChart } from './LineChart';
import { Table } from './Table';
import { AreaChart } from './AreaChart';
import { ScatterPlot } from './ScatterPlot';
import { GaugeChart } from './GaugeChart';
import { KPICard } from './KPICard';
import { TreemapChart } from './TreemapChart';
import { FunnelChart } from './FunnelChart';
import { HeatmapChart } from './HeatmapChart';

interface ColumnMetadata {
  name: string;
  displayName?: string;
  type?: string;
  nullable?: boolean;
  unique_count?: number;
  null_count?: number;
}

interface ColumnSelection {
  datasetId: string;
  columnName: string;
  displayName: string;
  datasetName: string;
}

interface GaugeConfig {
  target: number;
  level1: number;
  level2: number;
  level3: number;
  overTarget: number;
  colors: {
    low: string;
    medium: string;
    high: string;
    overTarget: string;
  };
}

interface ScatterConfig {
  markType: 'circle' | 'square' | 'diamond' | 'triangle';
  showLabels: boolean;
  showTrendLine: boolean;
  pointSize: number;
  pointOpacity: number;
  colorByColumn?: string;
  sizeByColumn?: string;
  colors: string[];
}

interface ChartConfig {
  id: string;
  type: 'bar' | 'pie' | 'line' | 'table' | 'area' | 'scatter' | 'gauge' | 'kpi' | 'treemap' | 'funnel' | 'heatmap' | 'histogram' | 'boxplot';
  title: string;
  columnSelections: ColumnSelection[];
  rowColumns?: ColumnSelection[];
  colColumns?: ColumnSelection[];
  gaugeConfig?: GaugeConfig;
  scatterConfig?: ScatterConfig;
}

interface Dataset {
  id: string;
  name: string;
}

interface DatasetDetails {
  id: string;
  name: string;
  columns?: ColumnMetadata[];
  schema_info?: {
    columns: ColumnMetadata[];
    row_count: number;
    column_count: number;
  };
}

interface ChartCardProps {
  chart: ChartConfig;
  chartIndex: number;
  isEditing: boolean;
  selectedDatasets: Dataset[];
  allDatasetDetails: DatasetDetails[];
  datasetDetailsLoading: boolean;
  datasetDetailsError: boolean;
  chartData: any;
  isChartDataLoading: boolean;
  hasChartDataError: boolean;
  colors: string[];
  onEdit: () => void;
  onRemove: () => void;
  onUpdateTitle: (newTitle: string) => void;
  onAddColumn: (datasetId: string, columnName: string) => void;
  onRemoveColumn: (index: number) => void;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  chart,
  // chartIndex,
  isEditing,
  // selectedDatasets,
  // allDatasetDetails,
  // datasetDetailsLoading,
  // datasetDetailsError,
  chartData,
  isChartDataLoading,
  hasChartDataError,
  colors,
  onEdit,
  onRemove,
  onUpdateTitle,
  // onAddColumn,
  // onRemoveColumn,
}) => {
  const rowColumns = chart.rowColumns || [];
  const colColumns = chart.colColumns || [];

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: isEditing ? '2px solid #4f46e5' : '1px solid #e5e7eb',
        padding: '24px',
        boxShadow: isEditing ? '0 4px 6px rgba(79, 70, 229, 0.1)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s'
      }}
      onClick={onEdit}
    >
      {/* Chart Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ flex: 1, marginRight: '16px' }}>
          <input
            type="text"
            value={chart.title}
            onChange={(e) => {
              e.stopPropagation();
              onUpdateTitle(e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Enter chart title..."
            style={{
              width: '100%',
              fontSize: '20px',
              fontWeight: 600,
              color: '#111827',
              border: 'none',
              outline: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: isEditing ? '#f9fafb' : 'transparent'
            }}
          />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            padding: '8px 12px',
            backgroundColor: '#fef2f2',
            color: '#ef4444',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fee2e2';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fef2f2';
          }}
        >
          🗑️ Remove
        </button>
      </div>

      {/* Chart Display */}
      <div style={{ minHeight: '500px' }}>
        {chart.type === 'bar' ? (
          <BarChart3D
            data={chartData}
            columnSelections={(colColumns.length > 0) ? colColumns : chart.columnSelections}
            colors={colors}
            isLoading={isChartDataLoading}
            hasError={hasChartDataError}
            height={500}
          />
        ) : chart.type === 'pie' ? (
          <>
            {isChartDataLoading ? (
              <div style={{
                height: '500px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4f46e5',
                fontSize: '14px',
                gap: '8px'
              }}>
                <span style={{ fontSize: '32px' }}>🔄</span>
                <div>Loading chart data...</div>
              </div>
            ) : hasChartDataError ? (
              <div style={{
                height: '500px',
                backgroundColor: '#fef2f2',
                border: '2px dashed #fecaca',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                fontSize: '14px'
              }}>
                Error loading data
              </div>
            ) : (rowColumns.length === 0 && colColumns.length === 0) || chartData.length === 0 ? (
              <div style={{
                height: '500px',
                backgroundColor: '#f9fafb',
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7280',
                fontSize: '14px',
                gap: '12px'
              }}>
                <div style={{ fontSize: '48px' }}>🍰</div>
                <div style={{ fontWeight: 600, fontSize: '16px' }}>
                  {(rowColumns.length === 0 && colColumns.length === 0) ? 'Drag columns to visualize data' : 'No data available'}
                </div>
                {(rowColumns.length === 0 && colColumns.length === 0) && (
                  <div style={{ fontSize: '14px', color: '#9ca3af' }}>
                    Drag columns from the data panel to Rows (labels) and Columns (values)
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                <Pie3DChart
                  data={chartData}
                  width={600}
                  height={400}
                  thickness={0.3}
                  radius={2}
                  angle={0.3}
                  tilt={0.5}
                />
              </div>
            )}
          </>
        ) : chart.type === 'line' ? (
          <LineChart
            data={chartData}
            columnSelections={(colColumns.length > 0) ? colColumns : chart.columnSelections}
            colors={colors}
            isLoading={isChartDataLoading}
            hasError={hasChartDataError}
            height={400}
            chartId={chart.id}
          />
        ) : chart.type === 'table' ? (
          <Table
           data={chartData}
           columnSelections={[...rowColumns, ...colColumns, ...chart.columnSelections]}
           colors={colors}
           isLoading={isChartDataLoading}
           hasError={hasChartDataError}
           height={600}
          />
        ) : chart.type === 'area' ? (
          isChartDataLoading ? (
            <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <span style={{ fontSize: '32px' }}>🔄</span> Loading...
            </div>
          ) : hasChartDataError || !chartData || chartData.length === 0 ? (
            <div style={{ height: '500px', backgroundColor: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', gap: '12px' }}>
              <div style={{ fontSize: '48px' }}>📈</div>
              <div style={{ fontWeight: 600 }}>{(rowColumns.length === 0 && colColumns.length === 0) ? 'Drag columns to visualize data' : 'No data available'}</div>
              {(rowColumns.length === 0 && colColumns.length === 0) && (
                <div style={{ fontSize: '14px', color: '#9ca3af' }}>Drag columns from the data panel to Rows (X-axis) and Columns (Y-axis)</div>
              )}
            </div>
          ) : (
            <AreaChart
              data={chartData}
              xKey={(rowColumns[0] || chart.columnSelections[0])?.displayName || 'category'}
              yKeys={(colColumns.length > 0 ? colColumns : (chart.columnSelections.length > 0 ? chart.columnSelections.slice(1) : rowColumns.slice(1))).map(s => s.displayName)}
              colors={colors}
              height={500}
            />
          )
        ) : chart.type === 'scatter' ? (
          isChartDataLoading ? (
            <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <span style={{ fontSize: '32px' }}>🔄</span> Loading...
            </div>
          ) : hasChartDataError || !chartData || chartData.length === 0 ? (
            <div style={{ height: '500px', backgroundColor: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', gap: '12px' }}>
              <div style={{ fontSize: '48px' }}>🟣</div>
              <div style={{ fontWeight: 600 }}>{(rowColumns.length === 0 && colColumns.length === 0) ? 'Drag columns to visualize data' : 'No data available'}</div>
              {(rowColumns.length === 0 && colColumns.length === 0) && (
                <div style={{ fontSize: '14px', color: '#9ca3af' }}>Drag columns from the data panel to Rows (X-axis) and Columns (Y-axis)</div>
              )}
            </div>
          ) : (
            <ScatterPlot
              data={chartData}
              xKey={(rowColumns[0] || chart.columnSelections[0])?.displayName || 'x'}
              yKey={(colColumns[0] || chart.columnSelections[1] || rowColumns[1])?.displayName || 'y'}
              sizeKey={chart.scatterConfig?.sizeByColumn || chart.columnSelections[2]?.displayName}
              colors={chart.scatterConfig?.colors || colors}
              height={400}
              xLabel={(rowColumns[0] || chart.columnSelections[0])?.displayName}
              yLabel={(colColumns[0] || chart.columnSelections[1] || rowColumns[1])?.displayName}
              pointSize={chart.scatterConfig?.pointSize}
              pointOpacity={chart.scatterConfig?.pointOpacity}
              showLabels={chart.scatterConfig?.showLabels}
              showTrendLine={chart.scatterConfig?.showTrendLine}
            />
          )
        ) : chart.type === 'gauge' ? (
          isChartDataLoading ? (
            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <span style={{ fontSize: '32px' }}>🔄</span> Loading...
            </div>
          ) : hasChartDataError || !chartData || chartData.length === 0 ? (
            <div style={{ height: '300px', backgroundColor: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', gap: '12px' }}>
              <div style={{ fontSize: '48px' }}>🎯</div>
              <div style={{ fontWeight: 600 }}>{(rowColumns.length === 0 && colColumns.length === 0) ? 'Drag a numeric column to visualize' : 'No data available'}</div>
              {(rowColumns.length === 0 && colColumns.length === 0) && (
                <div style={{ fontSize: '14px', color: '#9ca3af' }}>Drag a numeric column from the data panel to Columns</div>
              )}
            </div>
          ) : (
            <GaugeChart
              value={chartData[0]?.[(colColumns[0] || chart.columnSelections[0] || rowColumns[0])?.displayName] || 0}
              maxValue={chart.gaugeConfig?.target || 100}
              title={chart.title}
              subtitle={(colColumns[0] || chart.columnSelections[0] || rowColumns[0])?.displayName}
              height={300}
              colors={chart.gaugeConfig?.colors}
              thresholds={{
                low: chart.gaugeConfig?.level1 || 33,
                medium: chart.gaugeConfig?.level2 || 66
              }}
            />
          )
        ) : chart.type === 'kpi' ? (
          isChartDataLoading ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <span style={{ fontSize: '32px' }}>🔄</span> Loading...
            </div>
          ) : hasChartDataError || !chartData || chartData.length === 0 ? (
            <div style={{ height: '200px', backgroundColor: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', gap: '12px' }}>
              <div style={{ fontSize: '48px' }}>📊</div>
              <div style={{ fontWeight: 600 }}>{(rowColumns.length === 0 && colColumns.length === 0) ? 'Drag a numeric column to visualize' : 'No data available'}</div>
              {(rowColumns.length === 0 && colColumns.length === 0) && (
                <div style={{ fontSize: '14px', color: '#9ca3af' }}>Drag a numeric column from the data panel to Columns</div>
              )}
            </div>
          ) : (
            <KPICard
              title={(colColumns[0] || chart.columnSelections[0] || rowColumns[0])?.displayName || 'Metric'}
              value={chartData[0]?.[(colColumns[0] || chart.columnSelections[0] || rowColumns[0])?.displayName] || 0}
              previousValue={chartData[1]?.[(colColumns[0] || chart.columnSelections[0] || rowColumns[0])?.displayName]}
              format="number"
              subtitle={(colColumns[0] || chart.columnSelections[0] || rowColumns[0])?.datasetName}
              showTrend={chartData.length > 1}
            />
          )
        ) : chart.type === 'treemap' ? (
          isChartDataLoading ? (
            <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <span style={{ fontSize: '32px' }}>🔄</span> Loading...
            </div>
          ) : hasChartDataError || !chartData || chartData.length === 0 ? (
            <div style={{ height: '400px', backgroundColor: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', gap: '12px' }}>
              <div style={{ fontSize: '48px' }}>🔲</div>
              <div style={{ fontWeight: 600 }}>{(rowColumns.length === 0 && colColumns.length === 0) ? 'Drag columns to visualize data' : 'No data available'}</div>
              {(rowColumns.length === 0 && colColumns.length === 0) && (
                <div style={{ fontSize: '14px', color: '#9ca3af' }}>Drag a category to Rows and a value to Columns</div>
              )}
            </div>
          ) : (
            <TreemapChart
              data={chartData}
              nameKey={(rowColumns[0] || chart.columnSelections[0])?.displayName || 'name'}
              dataKey={(colColumns[0] || chart.columnSelections[1])?.displayName || 'value'}
              colors={colors}
              height={400}
            />
          )
        ) : chart.type === 'funnel' ? (
          isChartDataLoading ? (
            <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <span style={{ fontSize: '32px' }}>🔄</span> Loading...
            </div>
          ) : hasChartDataError || !chartData || chartData.length === 0 ? (
            <div style={{ height: '400px', backgroundColor: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', gap: '12px' }}>
              <div style={{ fontSize: '48px' }}>🔻</div>
              <div style={{ fontWeight: 600 }}>{(rowColumns.length === 0 && colColumns.length === 0) ? 'Drag columns to visualize data' : 'No data available'}</div>
              {(rowColumns.length === 0 && colColumns.length === 0) && (
                <div style={{ fontSize: '14px', color: '#9ca3af' }}>Drag a stage to Rows and a value to Columns</div>
              )}
            </div>
          ) : (
            <FunnelChart
              data={chartData}
              nameKey={(rowColumns[0] || chart.columnSelections[0])?.displayName || 'name'}
              dataKey={(colColumns[0] || chart.columnSelections[1])?.displayName || 'value'}
              colors={colors}
              height={400}
            />
          )
        ) : chart.type === 'heatmap' ? (
          isChartDataLoading ? (
            <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', gap: '8px' }}>
              <span style={{ fontSize: '32px' }}>🔄</span> Loading...
            </div>
          ) : hasChartDataError || !chartData || chartData.length === 0 ? (
            <div style={{ height: '400px', backgroundColor: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6b7280', gap: '12px' }}>
              <div style={{ fontSize: '48px' }}>🔥</div>
              <div style={{ fontWeight: 600 }}>{(rowColumns.length < 2 || colColumns.length === 0) ? 'Drag columns to visualize data' : 'No data available'}</div>
              {(rowColumns.length < 2 || colColumns.length === 0) && (
                <div style={{ fontSize: '14px', color: '#9ca3af' }}>Drag 2 categorical columns to Rows (X & Y axis) and 1 numeric to Columns (value)</div>
              )}
            </div>
          ) : (
            <HeatmapChart
              data={chartData}
              xColumn={(rowColumns[0])?.displayName || 'x'}
              yColumn={(rowColumns[1])?.displayName || 'y'}
              valueColumn={(colColumns[0])?.displayName || 'value'}
              aggregation={chart.heatmapConfig?.aggregation || 'sum'}
              colorScheme={chart.heatmapConfig?.colorScheme}
              showValues={chart.heatmapConfig?.showValues}
              showGrid={chart.heatmapConfig?.showGrid}
              cellBorderWidth={chart.heatmapConfig?.cellBorderWidth}
              height={400}
              isLoading={isChartDataLoading}
              hasError={hasChartDataError}
            />
          )
        ) : null}
      </div>
      
      {/* Chart Description */}
      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', fontSize: '13px', color: '#64748b', border: '1px solid #e2e8f0' }}>
        <strong>💡 Info: </strong>
        {chart.type === 'bar' && "Bar charts are the standard for looking at a specific value across different categories."}
        {chart.type === 'pie' && "Pie charts show the relationship of parts to a whole."}
        {chart.type === 'line' && "Line charts emphasize the overall shape of an entire series of values, usually over time."}
        {chart.type === 'area' && "Area charts emphasize the magnitude of change over time."}
        {chart.type === 'scatter' && "Scatter charts show the relationship between two numerical values."}
        {chart.type === 'gauge' && "Gauge charts show progress toward a goal."}
        {chart.type === 'kpi' && "KPIs communicate the amount of progress made toward a measurable goal."}
        {chart.type === 'table' && "Tables work well with quantitative comparisons where you're looking at many values for a single category."}
        {chart.type === 'heatmap' && "Heatmaps show the relationship between two categorical dimensions using color intensity. Perfect for correlation analysis and pattern detection."}
        {chart.type === 'treemap' && "Treemaps display hierarchical data as a set of nested rectangles."}
        {chart.type === 'funnel' && "Funnel charts help visualize a process that has stages."}
      </div>
    </div>
  );
};