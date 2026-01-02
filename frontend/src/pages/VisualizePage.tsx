import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { datasetService } from '../services/datasetService';
import { connectionService } from '../services/connectionService';
import { dashboardService } from '../services/dashboardService';
import { ChartCard } from '../components/ChartCard';
// AggregationSelector available for future use
import { GlobalFilterPanel, type FilterCondition } from '../components/GlobalFilterPanel';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { CalculatedFieldsEditor, type CalculatedFieldDefinition } from '../components/CalculatedFieldsEditor';
import { DatasetJoinEditor, type JoinConfig } from '../components/DatasetJoinEditor';
// import { DataQualityPanel } from '../components/DataQualityPanel';
import type { Dataset, DashboardCreate, DashboardChartCreate } from '../types';

interface ColumnSelection {
  datasetId: string;
  columnName: string;
  displayName: string;
  datasetName: string;
  type?: string;
}

interface GaugeConfig {
  target: number;
  level1: number;  // percentage
  level2: number;  // percentage
  level3: number;  // percentage
  overTarget: number;  // percentage
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

interface BarConfig {
  orientation: 'vertical' | 'horizontal';
  showLabels: boolean;
  showGrid: boolean;
  barWidth: number;
  sortBy: 'none' | 'ascending' | 'descending';
  colorByColumn?: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  colors: string[];
}

interface PieConfig {
  showLabels: boolean;
  showPercentages: boolean;
  showLegend: boolean;
  innerRadius: number; // 0 = pie, >0 = donut
  sortSlices: boolean;
  colors: string[];
}

interface LineConfig {
  showPoints: boolean;
  showLabels: boolean;
  showGrid: boolean;
  lineWidth: number;
  curveType: 'linear' | 'smooth';
  showArea: boolean;
  colors: string[];
}

interface AreaConfig {
  stacked: boolean;
  showPoints: boolean;
  showLabels: boolean;
  showGrid: boolean;
  fillOpacity: number;
  colors: string[];
}

interface HeatmapConfig {
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  colorScheme: string[];
  showValues: boolean;
  showGrid: boolean;
  cellBorderWidth: number;
}

interface ChartConfig {
  id: string;
  type: 'bar' | 'pie' | 'line' | 'table' | 'area' | 'scatter' | 'gauge' | 'kpi' | 'treemap' | 'funnel' | 'heatmap';
  title: string;
  columnSelections: ColumnSelection[];
  rowColumns: ColumnSelection[];  // X-axis (rows in Tableau)
  colColumns: ColumnSelection[];  // Y-axis (columns in Tableau)
  gaugeConfig?: GaugeConfig;
  scatterConfig?: ScatterConfig;
  barConfig?: BarConfig;
  pieConfig?: PieConfig;
  lineConfig?: LineConfig;
  areaConfig?: AreaConfig;
  heatmapConfig?: HeatmapConfig;
}

// Helper function to detect column type based on data
// (Function removed as it was unused)
// const detectColumnType = ...

// Helper function to intelligently order columns for chart types
// (Function removed as it was unused and causing build errors)

const COLORS = ['#4f46e5', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

type WorkspaceTab = 'design' | 'analytics' | 'export';

// MongoDB Collection Component (to use hooks properly)
const MongoDBCollectionItem: React.FC<{
  connectionId: string;
  collectionName: string;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  connectionName: string;
  setDraggedColumn: (col: ColumnSelection | null) => void;
}> = ({ connectionId, collectionName, isExpanded, onToggleExpand, connectionName, setDraggedColumn }) => {
  const datasetId = `conn:${connectionId}:collection:${collectionName}`;
  const [collColumns, setCollColumns] = React.useState<any[]>([]);
  
  React.useEffect(() => {
    if (isExpanded && collColumns.length === 0) {
      connectionService.queryData(connectionId, collectionName, 1, 0)
        .then(data => {
          setCollColumns(data.columns || []);
        })
        .catch(err => console.error('Failed to load columns:', err));
    }
  }, [isExpanded, connectionId, collectionName, collColumns.length]);

  return (
    <div key={datasetId} style={{ marginBottom: '8px' }}>
      {/* Collection header */}
      <button
        onClick={() => onToggleExpand(datasetId)}
        style={{
          width: '100%',
          padding: '10px 12px',
          backgroundColor: isExpanded ? '#eff6ff' : 'white',
          border: '1px solid #93c5fd',
          borderRadius: '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.2s',
          fontSize: '13px',
          fontWeight: 500,
          color: '#1e40af',
          textAlign: 'left'
        }}
        onMouseEnter={(e) => {
          if (!isExpanded) e.currentTarget.style.backgroundColor = '#f0f9ff';
        }}
        onMouseLeave={(e) => {
          if (!isExpanded) e.currentTarget.style.backgroundColor = 'white';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
          <span style={{ fontSize: '16px' }}>🍃</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {collectionName}
          </span>
        </div>
        <span style={{ fontSize: '10px', color: '#60a5fa', marginLeft: '8px' }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Columns list */}
      {isExpanded && (
        <div style={{ marginTop: '4px', marginLeft: '12px', paddingLeft: '12px', borderLeft: '2px solid #93c5fd' }}>
          {collColumns.length === 0 ? (
            <div style={{ padding: '8px', fontSize: '12px', color: '#60a5fa', fontStyle: 'italic' }}>
              Loading columns...
            </div>
          ) : (
            collColumns.map((column: any) => {
              const columnType = column.type?.toLowerCase() || 'text';
              const icon = columnType.includes('int') || columnType.includes('float') || columnType.includes('numeric') ? '#️⃣' :
                          columnType.includes('date') || columnType.includes('time') ? '📅' :
                          columnType.includes('bool') ? '✓' : 'Abc';

              return (
                <div
                  key={column.name}
                  draggable
                  onDragStart={(e) => {
                    const columnSelection: ColumnSelection = {
                      datasetId: datasetId,
                      columnName: column.name,
                      displayName: column.name,
                      datasetName: `${connectionName} - ${collectionName}`,
                      type: columnType
                    };
                    setDraggedColumn(columnSelection);
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/json', JSON.stringify(columnSelection));
                  }}
                  onDragEnd={() => setDraggedColumn(null)}
                  style={{
                    padding: '8px 10px',
                    marginBottom: '4px',
                    backgroundColor: 'white',
                    border: '1px solid #93c5fd',
                    borderRadius: '4px',
                    cursor: 'grab',
                    fontSize: '12px',
                    color: '#1e40af',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#eff6ff';
                    e.currentTarget.style.borderColor = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#93c5fd';
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{icon}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {column.name}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export const VisualizePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const datasetIds = searchParams.get('datasets')?.split(',').filter(Boolean) || [];
  const connectionIds = searchParams.get('connections')?.split(',').filter(Boolean) || [];

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('design');
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [selectedChartType, setSelectedChartType] = useState<'bar' | 'pie' | 'line' | 'table' | 'area' | 'scatter' | 'gauge' | 'kpi' | 'treemap' | 'funnel' | 'heatmap'>('bar');
  const [hoveredChartType, setHoveredChartType] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [editingChartId, setEditingChartId] = useState<string | null>(null);
  const [showGaugeConfig, setShowGaugeConfig] = useState<string | null>(null);
  const [showScatterConfig, setShowScatterConfig] = useState<string | null>(null);
  const [showBarConfig, setShowBarConfig] = useState<string | null>(null);
  const [showPieConfig, setShowPieConfig] = useState<string | null>(null);
  const [showLineConfig, setShowLineConfig] = useState<string | null>(null);
  const [showAreaConfig, setShowAreaConfig] = useState<string | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<ColumnSelection | null>(null);
  const [expandedDatasets, setExpandedDatasets] = useState<Set<string>>(new Set());
  // const [dragTargetChart, setDragTargetChart] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const toggleDatasetExpansion = (datasetId: string) => {
    const newExpanded = new Set(expandedDatasets);
    if (newExpanded.has(datasetId)) {
      newExpanded.delete(datasetId);
    } else {
      newExpanded.add(datasetId);
    }
    setExpandedDatasets(newExpanded);
  };
  const [dashboardName, setDashboardName] = useState('');
  const [dashboardDescription, setDashboardDescription] = useState('');
  
  // Enterprise features state
  const [globalFilters, setGlobalFilters] = useState<FilterCondition[]>([]);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [calculatedFields, setCalculatedFields] = useState<CalculatedFieldDefinition[]>([]);
  const [datasetJoins, setDatasetJoins] = useState<JoinConfig[]>([]);
  // const [showQualityPanel, setShowQualityPanel] = useState(false);
  // const [showAdvancedFeatures, setShowAdvancedFeatures] = useState(false);
  
  // MongoDB connection state
  const [selectedCollections, setSelectedCollections] = useState<Record<string, string[]>>({});
  const [connectionCollections, setConnectionCollections] = useState<Record<string, string[]>>({});

  // Catch any rendering errors
  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Render error caught:', event.error);
      setRenderError(event.error?.message || 'An error occurred');
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  // Fetch all datasets first
  const { data: allDatasets = [], isLoading: isDatasetsLoading } = useQuery<Dataset[]>({
    queryKey: ['datasets'],
    queryFn: () => datasetService.getDatasets(),
  });

  // Fetch all connections
  const { data: allConnections = [], isLoading: isConnectionsLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => connectionService.getConnections(),
  });

  // Filter to only selected connections (MongoDB, MySQL, and PostgreSQL)
  const selectedConnections = useMemo(() => {
    return allConnections.filter((conn: any) => 
      connectionIds.includes(conn.id) && (conn.source_type === 'mongodb' || conn.source_type === 'mysql' || conn.source_type === 'postgresql')
    );
  }, [allConnections, connectionIds]);

  // Load collections/tables for each database connection (MongoDB, MySQL, PostgreSQL, etc.)
  React.useEffect(() => {
    const loadCollections = async () => {
      for (const conn of selectedConnections) {
        if (!connectionCollections[conn.id]) {
          try {
            const collections = await connectionService.getCollections(conn.id);
            setConnectionCollections(prev => ({ ...prev, [conn.id]: collections }));
            // Auto-select first collection/table if none selected
            setSelectedCollections(prev => {
              if (!prev[conn.id] && collections.length > 0) {
                return { ...prev, [conn.id]: [collections[0]] };
              }
              return prev;
            });
          } catch (error) {
            console.error(`Failed to load collections/tables for connection ${conn.id}:`, error);
          }
        }
      }
    };
    
    if (selectedConnections.length > 0) {
      loadCollections();
    }
  }, [selectedConnections, connectionCollections]);

  // Filter to only selected datasets
  const selectedDatasets = useMemo(() => {
    return allDatasets.filter((ds: Dataset) => datasetIds.includes(ds.id));
  }, [allDatasets, datasetIds]);

  // Fetch details for ONLY the selected datasets
  const datasetDetailsQueries = useQuery({
    queryKey: ['datasetDetails', datasetIds],
    queryFn: async () => {
      const promises = selectedDatasets.map((ds: Dataset) =>
        datasetService.getDatasetById(ds.id)
      );
      return Promise.all(promises);
    },
    enabled: selectedDatasets.length > 0,
  });

  const allDatasetDetails = datasetDetailsQueries.data || [];
  
  // Check for datasets with issues
  const problematicDatasets = useMemo(() => {
    return selectedDatasets.filter((ds: Dataset) => {
      const detail = allDatasetDetails.find((d: any) => d.id === ds.id);
      // Check if dataset is missing critical metadata or has errors
      return ds.status === 'error' || 
             ds.status === 'processing' ||
             (detail && !detail.schema_info);
    });
  }, [selectedDatasets, allDatasetDetails]);

  console.log('All dataset details:', allDatasetDetails);
  console.log('Selected datasets:', selectedDatasets);
  if (problematicDatasets.length > 0) {
    console.warn('⚠️ Problematic datasets found:', problematicDatasets.map((d: Dataset) => ({ id: d.id, name: d.name, status: d.status })));
  }
  allDatasetDetails.forEach((detail: any, idx: number) => {
    console.log(`Dataset ${idx}:`, detail);
    console.log(`  - schema_info:`, detail?.schema_info);
    console.log(`  - columns direct:`, detail?.columns);
    console.log(`  - schema columns:`, detail?.schema_info?.columns);
    console.log('Schema object:', detail?.schema_info?.schema);
  });

  // Fetch chart data for all charts
  const chartDataQueries = useQuery({
    queryKey: ['chartData', charts],
    queryFn: async () => {
      if (charts.length === 0) return [];

      // Include columnSelections, rowColumns, and colColumns
      const allSelections = charts.flatMap(chart => [
        ...chart.columnSelections,
        ...chart.rowColumns,
        ...chart.colColumns
      ]);
      console.log('📊 Fetching data for selections:', allSelections);
      if (allSelections.length === 0) {
        console.log('⚠️ No selections to fetch');
        return [];
      }

      // Group by dataset/connection
      const datasetGroups = allSelections.reduce((acc, sel) => {
        if (!acc[sel.datasetId]) acc[sel.datasetId] = [];
        if (!acc[sel.datasetId].some(s => s.columnName === sel.columnName)) {
          acc[sel.datasetId].push(sel);
        }
        return acc;
      }, {} as Record<string, typeof allSelections>);

      const results: Array<{ selection: ColumnSelection; data: any[] }> = [];

      // Fetch data for each dataset or database connection (MongoDB, MySQL, PostgreSQL)
      for (const [datasetId, selections] of Object.entries(datasetGroups)) {
        try {
          // Check if this is a database connection (format: "conn:{connectionId}:collection:{collectionName}")
          if (datasetId.startsWith('conn:')) {
            const [, connId, , collectionName] = datasetId.split(':');
            console.log(`📊 Querying database: ${collectionName} from connection ${connId}`);
            
            const dbData = await connectionService.queryData(connId, collectionName, 1000, 0);
            const rows = dbData?.data ?? [];
            // const availableColumns = dbData?.columns?.map((col: any) => typeof col === 'string' ? col : col.name) ?? dbData?.columns ?? [];
            
            console.log(`✅ Fetched ${rows.length} rows from collection/table ${collectionName}`);
            
            // Extract data for each selected column
            for (const sel of selections) {
              const columnData = rows
                .map((row: any) => row[sel.columnName])
                .filter((val: any) => val !== undefined && val !== null);
              
              console.log(`  ✓ Column "${sel.displayName}": ${columnData.length} values`);
              results.push({ selection: sel, data: columnData });
            }
          } else {
            // Regular dataset
            const previewData = await datasetService.getDatasetPreview(datasetId);
            const rows = previewData?.rows ?? [];
            const availableColumns = previewData?.columns ?? [];

            console.log(`✅ Fetched ${rows.length} rows for dataset ${datasetId}`);
            
            // Extract data for each selected column
            for (const sel of selections) {
              // Try exact match first
              let columnKey = sel.columnName;
            
            // If exact match fails, try cleaned name (backend preprocessing converts names)
            if (!availableColumns.includes(columnKey)) {
              const cleaned = sel.columnName
                .trim()
                .replace(/[^\w\s-]/g, '_')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '');
              
              if (availableColumns.includes(cleaned)) {
                columnKey = cleaned;
              } else {
                // Try case-insensitive
                const match = availableColumns.find(col => 
                  col.toLowerCase() === sel.columnName.toLowerCase()
                );
                if (match) columnKey = match;
              }
            }

            const columnData = rows
              .map(row => row[columnKey])
              .filter(val => val !== undefined && val !== null);
            
            console.log(`  ✓ Column "${sel.displayName}" (${columnKey}): ${columnData.length} values`);
            results.push({ selection: sel, data: columnData });
            }
          }
        } catch (error) {
          console.error(`Error loading dataset ${datasetId}:`, error);
          // Add empty data for failed selections
          selections.forEach(sel => {
            results.push({ selection: sel, data: [] });
          });
        }
      }

      console.log(`📦 Total query results: ${results.length}`, results.map(r => ({ col: r.selection.displayName, rows: r.data.length })));
      return results;
    },
    enabled: charts.length > 0,
  });

  // Mutation for saving dashboard
  const saveDashboardMutation = useMutation({
    mutationFn: (dashboard: DashboardCreate) => dashboardService.createDashboard(dashboard),
    onSuccess: (data: any) => {
      setShowSaveModal(false);
      setDashboardName('');
      setDashboardDescription('');
      alert('Dashboard saved successfully!');
      navigate(`/dashboards/${data.id}`);
    },
    onError: (error: any) => {
      alert(`Failed to save dashboard: ${error.response?.data?.detail || error.message}`);
    }
  });

  const handleSaveDashboard = () => {
    if (!dashboardName.trim()) {
      alert('Please enter a dashboard name');
      return;
    }

    if (charts.length === 0) {
      alert('Please add at least one chart before saving');
      return;
    }

    // Transform charts to dashboard chart format
    const dashboardCharts: DashboardChartCreate[] = charts.map((chart, index) => {
      console.log('Saving chart:', {
        title: chart.title,
        type: chart.type,
        columnSelections: chart.columnSelections
      });
      
      const firstSelection = chart.columnSelections[0];
      const datasetId = firstSelection?.datasetId || '';
      
      // For table charts, store all columns in config
      if (chart.type === 'table') {
        const tableChart = {
          dataset_id: datasetId,
          chart_type: chart.type,
          x_column: '', // Not used for tables
          y_column: '', // Not used for tables
          title: chart.title,
          config: {
            columnSelections: chart.columnSelections,
            columns: chart.columnSelections.map(cs => cs.columnName)
          },
          position_x: 0,
          position_y: index * 2,
          width: 12,
          height: 2
        };
        console.log('Table chart config:', tableChart);
        return tableChart;
      }
      
      // For other chart types (bar, line, pie, gauge, etc.), use x and y columns
      const xColumn = chart.columnSelections[0]?.columnName || '';
      const yColumn = chart.columnSelections[1]?.columnName || '';
      
      const regularChart = {
        dataset_id: datasetId,
        chart_type: chart.type,
        x_column: xColumn,
        y_column: yColumn,
        title: chart.title,
        config: {
          columnSelections: chart.columnSelections,
          rowColumns: chart.rowColumns,
          colColumns: chart.colColumns,
          ...(chart.gaugeConfig && { gaugeConfig: chart.gaugeConfig }),
          ...(chart.scatterConfig && { scatterConfig: chart.scatterConfig }),
          ...(chart.barConfig && { barConfig: chart.barConfig }),
          ...(chart.pieConfig && { pieConfig: chart.pieConfig }),
          ...(chart.lineConfig && { lineConfig: chart.lineConfig }),
          ...(chart.areaConfig && { areaConfig: chart.areaConfig })
        },
        position_x: 0,
        position_y: index * 2,
        width: 12,
        height: 2
      };
      
      console.log('Regular chart config:', regularChart);
      return regularChart;
    });

    const dashboardData: DashboardCreate = {
      name: dashboardName,
      description: dashboardDescription || undefined,
      charts: dashboardCharts
    };

    saveDashboardMutation.mutate(dashboardData);
  };

  const handleAddChart = () => {
    const chartTypeNames: Record<typeof selectedChartType, string> = {
      bar: 'Bar',
      pie: 'Pie',
      line: 'Line',
      table: 'Table',
      area: 'Area',
      scatter: 'Scatter',
      gauge: 'Gauge',
      kpi: 'KPI',
      funnel: 'Funnel',
      treemap: 'Treemap',
      heatmap: 'Heatmap'
    };

    const newChart: ChartConfig = {
      id: `chart-${Date.now()}`,
      type: selectedChartType,
      title: `New ${chartTypeNames[selectedChartType]} Chart`,
      columnSelections: [],
      rowColumns: [],
      colColumns: [],
      ...(selectedChartType === 'gauge' && {
        gaugeConfig: {
          target: 2500000,
          level1: 40,
          level2: 60,
          level3: 80,
          overTarget: 110,
          colors: {
            low: '#ef4444',
            medium: '#f59e0b',
            high: '#10b981',
            overTarget: '#3b82f6'
          }
        }
      }),
      ...(selectedChartType === 'scatter' && {
        scatterConfig: {
          markType: 'circle',
          showLabels: false,
          showTrendLine: false,
          pointSize: 8,
          pointOpacity: 0.7,
          colors: COLORS
        }
      }),
      ...(selectedChartType === 'bar' && {
        barConfig: {
          orientation: 'vertical',
          showLabels: false,
          showGrid: true,
          barWidth: 60,
          sortBy: 'none',
          aggregation: 'sum',
          colors: COLORS
        }
      }),
      ...(selectedChartType === 'pie' && {
        pieConfig: {
          showLabels: true,
          showPercentages: true,
          showLegend: true,
          innerRadius: 0,
          sortSlices: true,
          colors: COLORS
        }
      }),
      ...(selectedChartType === 'line' && {
        lineConfig: {
          showPoints: true,
          showLabels: false,
          showGrid: true,
          lineWidth: 2,
          curveType: 'linear',
          showArea: false,
          colors: COLORS
        }
      }),
      ...(selectedChartType === 'area' && {
        areaConfig: {
          stacked: false,
          showPoints: false,
          showLabels: false,
          showGrid: true,
          fillOpacity: 0.6,
          colors: COLORS
        }
      }),
      ...(selectedChartType === 'heatmap' && {
        heatmapConfig: {
          aggregation: 'sum',
          colorScheme: ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'],
          showValues: true,
          showGrid: true,
          cellBorderWidth: 1
        }
      })
    };
    setCharts([...charts, newChart]);
    setEditingChartId(newChart.id);
    
    // Auto-open config panel for charts
    if (selectedChartType === 'gauge') setShowGaugeConfig(newChart.id);
    else if (selectedChartType === 'scatter') setShowScatterConfig(newChart.id);
    else if (selectedChartType === 'bar') setShowBarConfig(newChart.id);
    else if (selectedChartType === 'pie') setShowPieConfig(newChart.id);
    else if (selectedChartType === 'line') setShowLineConfig(newChart.id);
    else if (selectedChartType === 'area') setShowAreaConfig(newChart.id);
  };

  const handleRemoveChart = (chartId: string) => {
    setCharts(charts.filter(c => c.id !== chartId));
    if (editingChartId === chartId) {
      setEditingChartId(null);
    }
  };

  const handleUpdateChartTitle = (chartId: string, newTitle: string) => {
    setCharts(charts.map(chart =>
      chart.id === chartId ? { ...chart, title: newTitle } : chart
    ));
  };

  const handleUpdateGaugeConfig = (chartId: string, config: Partial<GaugeConfig>) => {
    setCharts(charts.map(chart =>
      chart.id === chartId
        ? {
            ...chart,
            gaugeConfig: {
              ...chart.gaugeConfig!,
              ...config
            }
          }
        : chart
    ));
  };

  const handleUpdateScatterConfig = (chartId: string, config: Partial<ScatterConfig>) => {
    setCharts(charts.map(chart =>
      chart.id === chartId
        ? {
            ...chart,
            scatterConfig: {
              ...chart.scatterConfig!,
              ...config
            }
          }
        : chart
    ));
  };

  const handleUpdateBarConfig = (chartId: string, config: Partial<BarConfig>) => {
    setCharts(charts.map(chart =>
      chart.id === chartId
        ? {
            ...chart,
            barConfig: {
              ...chart.barConfig!,
              ...config
            }
          }
        : chart
    ));
  };

  const handleUpdatePieConfig = (chartId: string, config: Partial<PieConfig>) => {
    setCharts(charts.map(chart =>
      chart.id === chartId
        ? {
            ...chart,
            pieConfig: {
              ...chart.pieConfig!,
              ...config
            }
          }
        : chart
    ));
  };

  const handleUpdateLineConfig = (chartId: string, config: Partial<LineConfig>) => {
    setCharts(charts.map(chart =>
      chart.id === chartId
        ? {
            ...chart,
            lineConfig: {
              ...chart.lineConfig!,
              ...config
            }
          }
        : chart
    ));
  };

  const handleUpdateAreaConfig = (chartId: string, config: Partial<AreaConfig>) => {
    setCharts(charts.map(chart =>
      chart.id === chartId
        ? {
            ...chart,
            areaConfig: {
              ...chart.areaConfig!,
              ...config
            }
          }
        : chart
    ));
  };

  const validateColumnForChart = (chartType: string, section: 'rows' | 'columns', columnType?: string): boolean => {
    if (!columnType) return true;
    
    const isNumeric = columnType.includes('int') || columnType.includes('float') || columnType.includes('numeric') || columnType.includes('number') || columnType.includes('double') || columnType.includes('decimal');
    const isDate = columnType.includes('date') || columnType.includes('time') || columnType.includes('timestamp');
    const isString = !isNumeric && !isDate;

    let warningMessage: string | null = null;

    // KPI Chart
    if (chartType === 'kpi') {
      if (section === 'columns' && !isNumeric) { // Value
        warningMessage = "KPI charts typically use numeric fields for values. Are you sure you want to use a non-numeric field?";
      }
    }

    // Bar/Line/Area Charts
    else if (['bar', 'line', 'area'].includes(chartType)) {
      if (section === 'rows' && isNumeric) { // X-axis
        warningMessage = `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} charts usually use categorical or date fields for the X-axis (Rows). Using a numeric field might result in too many bars/points.`;
      }
      else if (section === 'columns' && !isNumeric) { // Y-axis
        warningMessage = `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} charts usually use numeric fields for the Y-axis (Columns).`;
      }
    }

    // Scatter Plot
    else if (chartType === 'scatter') {
      if (!isNumeric) {
        warningMessage = "Scatter plots require numeric fields for both axes to show correlations.";
      }
    }

    // Pie Chart
    else if (chartType === 'pie') {
      if (section === 'rows' && !isString && !isDate) { // Category
        warningMessage = "Pie charts usually use categorical fields for slices (Rows).";
      }
      else if (section === 'columns' && !isNumeric) { // Value
        warningMessage = "Pie charts require numeric fields for slice sizes (Columns).";
      }
    }

    // Gauge Chart
    else if (chartType === 'gauge') {
      if (section === 'columns' && !isNumeric) {
        warningMessage = "Gauge charts require a numeric field to show the value.";
      }
    }

    // Treemap & Funnel
    else if (['treemap', 'funnel'].includes(chartType)) {
      if (section === 'rows' && !isString) { // Category
        warningMessage = `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} charts usually use categorical fields for grouping (Rows).`;
      }
      else if (section === 'columns' && !isNumeric) { // Value
        warningMessage = `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} charts require numeric fields for sizing (Columns).`;
      }
    }

    if (warningMessage) {
      return window.confirm(`${warningMessage}\n\nDo you want to continue?`);
    }

    return true;
  };

  const handleAddToRows = (chartId: string, column: ColumnSelection) => {
    const chart = charts.find(c => c.id === chartId);
    if (chart && !validateColumnForChart(chart.type, 'rows', column.type)) {
      return;
    }

    setCharts(charts.map(chart =>
      chart.id === chartId
        ? { ...chart, rowColumns: [...chart.rowColumns, column] }
        : chart
    ));
  };

  const handleAddToColumns = (chartId: string, column: ColumnSelection) => {
    const chart = charts.find(c => c.id === chartId);
    if (chart && !validateColumnForChart(chart.type, 'columns', column.type)) {
      return;
    }

    setCharts(charts.map(chart =>
      chart.id === chartId
        ? { ...chart, colColumns: [...chart.colColumns, column] }
        : chart
    ));
  };

  const handleRemoveFromRows = (chartId: string, index: number) => {
    setCharts(charts.map(chart =>
      chart.id === chartId
        ? { ...chart, rowColumns: chart.rowColumns.filter((_, i) => i !== index) }
        : chart
    ));
  };

  const handleRemoveFromColumns = (chartId: string, index: number) => {
    setCharts(charts.map(chart =>
      chart.id === chartId
        ? { ...chart, colColumns: chart.colColumns.filter((_, i) => i !== index) }
        : chart
    ));
  };


 const handleAddColumnToChart = (chartId: string, datasetId: string, columnName: string) => {
  if (!datasetId || !columnName) return;

  // Use functional update to ensure we always have the latest state
  setCharts(prevCharts => {
    const chart = prevCharts.find(c => c.id === chartId);
    if (!chart) return prevCharts;

    // 1. Check if this specific column is already in the chart
    const exists = chart.columnSelections.some(
      sel => sel.datasetId === datasetId && sel.columnName === columnName
    );
    if (exists) return prevCharts;

    // 2. Find the dataset details by ID (more reliable than index)
    const detailsData = allDatasetDetails.find((detail: any) => detail.id === datasetId);

    // 3. Robust column extraction (checking all possible backend paths)
    // We check .schema_info.columns first, then .columns, then .schema_info.schema.columns
    const columns =
      detailsData?.schema_info?.columns ||
      (detailsData?.schema_info as any)?.schema?.columns ||
      (detailsData as any)?.columns ||
      [];

    // 4. Find the specific column metadata
    const column = columns.find((col: any) => col.name === columnName);

    if (column) {
      const dataset = selectedDatasets.find((ds: Dataset) => ds.id === datasetId);

      return prevCharts.map(c =>
        c.id === chartId
          ? {
              ...c,
              columnSelections: [
                ...c.columnSelections,
                {
                  datasetId,
                  columnName,
                  displayName: column.displayName || column.name,
                  datasetName: dataset?.name || 'Unknown Dataset',
                  type: column.type
                }
              ]
            }
          : c
      );
    } else {
      console.error(`Metadata Mismatch for ${columnName}:`, {
        detailsFound: !!detailsData,
        availableColumns: columns.map((c: any) => c.name),
        fullObject: detailsData
      });
      return prevCharts;
    }
  });
};

  const handleRemoveColumnFromChart = (chartId: string, index: number) => {
    setCharts(charts.map(chart =>
      chart.id === chartId
        ? { ...chart, columnSelections: chart.columnSelections.filter((_, i) => i !== index) }
        : chart
    ));
  };

  const handleBack = () => {
    navigate('/');
  };

  // Get chart data for a specific chart
  const getChartData = (chart: ChartConfig) => {
    const chartDataResults = chartDataQueries.data || [];

    // Combine all column selections from columnSelections, rowColumns, and colColumns
    const allSelections = [
      ...chart.columnSelections,
      ...chart.rowColumns,
      ...chart.colColumns
    ];

    const filtered = chartDataResults.filter(result =>
      allSelections.some(
        sel => sel.datasetId === result.selection.datasetId &&
               sel.columnName === result.selection.columnName
      )
    );
    
    console.log(`📈 Chart "${chart.title}" data:`, {
      allSelections: allSelections.length,
      availableResults: chartDataResults.length,
      filtered: filtered.length,
      rowColumns: chart.rowColumns,
      colColumns: chart.colColumns
    });
    
    return filtered;
  };

  // Transform data for bar chart
  const getBarChartData = (chart: ChartConfig) => {
    // Use rowColumns (X-axis) and colColumns (Y-axis) if available
    const hasRowsCols = chart.rowColumns.length > 0 || chart.colColumns.length > 0;
    const columnsToUse = hasRowsCols ? [...chart.rowColumns, ...chart.colColumns] : chart.columnSelections;
    
    console.log('📊 Bar chart transformation:', {
      hasRowsCols,
      rowColumns: chart.rowColumns,
      colColumns: chart.colColumns,
      columnsToUse
    });
    
    if (columnsToUse.length === 0) {
      console.log('⚠️ No columns to use for bar chart');
      return [];
    }

    try {
      // Get X-axis (categorical) and Y-axis (numeric) columns
      const xAxisCol = chart.rowColumns[0] || columnsToUse[0];
      const yAxisCol = chart.colColumns[0] || columnsToUse[1];
      
      if (!xAxisCol || !yAxisCol) {
        // Fallback to old behavior if no rows/columns assigned
        if (!hasRowsCols) {
          const chartData = getChartData(chart);
          if (chartData.length === 0) return [];
          
          const columnsData = chartData.map(result => {
            const data = result.data || [];
            const counts = data.reduce((acc: Record<string, number>, val: any) => {
              const key = String(val);
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {});
            return { selection: result.selection, counts };
          });

          const allCategories = new Set<string>();
          columnsData.forEach(({ counts }) => {
            Object.keys(counts).forEach(cat => allCategories.add(cat));
          });

          const data = Array.from(allCategories).map(category => {
            const point: any = { category };
            columnsData.forEach(({ selection, counts }) => {
              point[selection.displayName] = counts[category] || 0;
            });
            return point;
          });

          return data.slice(0, 20);
        }
        return [];
      }
      
      // Create temp chart configs to fetch data for specific columns
      const tempChartX = { ...chart, columnSelections: [xAxisCol], rowColumns: [], colColumns: [] };
      const tempChartY = { ...chart, columnSelections: [yAxisCol], rowColumns: [], colColumns: [] };
      
      const xChartData = getChartData(tempChartX);
      const yChartData = getChartData(tempChartY);
      
      const xData = xChartData[0]?.data || [];
      const yData = yChartData[0]?.data || [];
      
      console.log('  X-axis data:', { col: xAxisCol.displayName, length: xData.length, sample: xData.slice(0, 3) });
      console.log('  Y-axis data:', { col: yAxisCol.displayName, length: yData.length, sample: yData.slice(0, 3) });
      
      // Check if Y-axis data is numeric or categorical
      const sampleY = yData.slice(0, 10);
      const isNumeric = sampleY.every((val: any) => {
        if (typeof val === 'number') return true;
        const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        return !isNaN(parsed) && String(val).trim() !== '';
      });
      
      console.log('  Y-axis is numeric:', isNumeric);
      
      const minLength = Math.min(xData.length, yData.length);
      let data: any[];
      
      if (isNumeric) {
        // Y-axis is numeric: aggregate values by category
        const aggregated: Record<string, number[]> = {};
        
        for (let i = 0; i < minLength; i++) {
          const category = String(xData[i]);
          const value = typeof yData[i] === 'number' ? yData[i] : parseFloat(String(yData[i]).replace(/[^0-9.-]/g, ''));
          
          if (!isNaN(value)) {
            if (!aggregated[category]) {
              aggregated[category] = [];
            }
            aggregated[category].push(value);
          }
        }
        
        // Calculate aggregation based on config
        const aggregation = chart.barConfig?.aggregation || 'sum';
        data = Object.entries(aggregated).map(([category, values]) => {
          let aggregatedValue: number;
          switch (aggregation) {
            case 'avg':
              aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
              break;
            case 'count':
              aggregatedValue = values.length;
              break;
            case 'min':
              aggregatedValue = Math.min(...values);
              break;
            case 'max':
              aggregatedValue = Math.max(...values);
              break;
            case 'sum':
            default:
              aggregatedValue = values.reduce((a, b) => a + b, 0);
          }
          
          return {
            category,
            [yAxisCol.displayName]: aggregatedValue
          };
        });
      } else {
        // Y-axis is categorical: count occurrences by X category
        const counts: Record<string, Record<string, number>> = {};
        
        for (let i = 0; i < minLength; i++) {
          const xCategory = String(xData[i]);
          const yCategory = String(yData[i]);
          
          if (!counts[xCategory]) {
            counts[xCategory] = {};
          }
          counts[xCategory][yCategory] = (counts[xCategory][yCategory] || 0) + 1;
        }
        
        // For each X category, find the most common Y category and its count
        data = Object.entries(counts).map(([xCategory, yCounts]) => {
          const total = Object.values(yCounts).reduce((sum, count) => sum + count, 0);
          return {
            category: xCategory,
            [yAxisCol.displayName]: total
          };
        });
      }
      
      // Apply sorting
      const sortBy = chart.barConfig?.sortBy || 'none';
      const yKey = yAxisCol.displayName;
      if (sortBy === 'ascending') {
        data.sort((a, b) => (a[yKey] as number) - (b[yKey] as number));
      } else if (sortBy === 'descending') {
        data.sort((a, b) => (b[yKey] as number) - (a[yKey] as number));
      }
      
      const finalData = data.slice(0, 20);
      console.log('  ✅ Final bar chart data:', finalData.length, 'points', finalData.slice(0, 2));
      return finalData;
    } catch (error) {
      console.error('❌ Error transforming chart data:', error);
      return [];
    }
  };

  // Transform data for pie chart
  const getPieChartData = (chart: ChartConfig) => {
    const hasRowsCols = chart.rowColumns.length > 0 || chart.colColumns.length > 0;
    const columnsToUse = hasRowsCols ? [...chart.rowColumns, ...chart.colColumns] : chart.columnSelections;
    
    if (columnsToUse.length === 0) return [];

    try {
      // Use rowColumns for labels, colColumns for values
      const labelCol = chart.rowColumns[0] || columnsToUse[0];
      const valueCol = chart.colColumns[0] || columnsToUse[1];
      
      if (!labelCol || !valueCol) {
        // Fallback to old behavior
        if (!hasRowsCols) {
          const chartData = getChartData(chart);
          if (chartData.length === 0) return [];
          
          const aggregatedCounts: Record<string, number> = {};
          chartData.forEach(result => {
            const data = result.data || [];
            data.forEach((val: any) => {
              const key = String(val);
              aggregatedCounts[key] = (aggregatedCounts[key] || 0) + 1;
            });
          });

          return Object.entries(aggregatedCounts)
            .map(([label, value], idx) => ({
              label,
              value,
              color: COLORS[idx % COLORS.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
        }
        return [];
      }
      
      // Create temp chart configs to fetch data for specific columns
      const tempChartLabel = { ...chart, columnSelections: [labelCol], rowColumns: [], colColumns: [] };
      const tempChartValue = { ...chart, columnSelections: [valueCol], rowColumns: [], colColumns: [] };
      
      const labelChartData = getChartData(tempChartLabel);
      const valueChartData = getChartData(tempChartValue);
      
      const labels = labelChartData[0]?.data || [];
      const values = valueChartData[0]?.data || [];
      
      // Check if values are numeric
      const sampleValues = values.slice(0, 10);
      const isNumeric = sampleValues.every((val: any) => {
        if (typeof val === 'number') return true;
        const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        return !isNaN(parsed) && String(val).trim() !== '';
      });
      
      const minLength = Math.min(labels.length, values.length);
      let pieData: any[];
      
      if (isNumeric) {
        // Aggregate numeric values by label
        const aggregated: Record<string, number[]> = {};
        
        for (let i = 0; i < minLength; i++) {
          const label = String(labels[i]);
          const value = typeof values[i] === 'number' ? values[i] : parseFloat(String(values[i]).replace(/[^0-9.-]/g, ''));
          
          if (!isNaN(value)) {
            if (!aggregated[label]) {
              aggregated[label] = [];
            }
            aggregated[label].push(value);
          }
        }
        
        // Sum values for each label
        pieData = Object.entries(aggregated)
          .map(([label, vals], idx) => ({
            label,
            value: vals.reduce((a, b) => a + b, 0),
            color: COLORS[idx % COLORS.length]
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);
      } else {
        // Count categorical occurrences
        const counts: Record<string, number> = {};
        
        for (let i = 0; i < minLength; i++) {
          const label = String(labels[i]);
          counts[label] = (counts[label] || 0) + 1;
        }
        
        pieData = Object.entries(counts)
          .map(([label, value], idx) => ({
            label,
            value,
            color: COLORS[idx % COLORS.length]
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);
      }

      return pieData;
    } catch (error) {
      console.error('Error transforming pie chart data:', error);
      return [];
    }
  };

  // Transform data for line chart using rows (X-axis) and columns (Y-axis)
  const getLineChartData = (chart: ChartConfig) => {
    const hasRowsCols = chart.rowColumns.length > 0 || chart.colColumns.length > 0;
    const columnsToUse = hasRowsCols ? [...chart.rowColumns, ...chart.colColumns] : chart.columnSelections;
    
    if (columnsToUse.length === 0) return { series: [], categories: [] };

    try {
      // Use rowColumns for X-axis (categories), colColumns for Y-axis (values)
      const xAxisCol = chart.rowColumns[0] || columnsToUse[0];
      const yAxisCols = chart.colColumns.length > 0 ? chart.colColumns : [columnsToUse[1]];
      
      if (!xAxisCol || yAxisCols.length === 0) {
        // Fallback to old behavior
        if (!hasRowsCols) {
          const chartData = getChartData(chart);
          if (chartData.length === 0) return { series: [], categories: [] };
          
          const allCategories = new Set<string>();
          chartData.forEach(result => {
            const data = result.data || [];
            data.forEach(val => allCategories.add(String(val)));
          });

          const categories = Array.from(allCategories).sort().slice(0, 20);

          const series = chartData.map(result => {
            const data = result.data || [];
            const counts: Record<string, number> = {};
            data.forEach(val => {
              const key = String(val);
              counts[key] = (counts[key] || 0) + 1;
            });

            const seriesData = categories.map(category => ({
              label: category,
              value: counts[category] || 0
            }));

            return {
              name: result.selection.displayName,
              data: seriesData
            };
          });

          return { series, categories };
        }
        return { series: [], categories: [] };
      }
      
      // Create temp chart config to fetch X-axis data
      const tempChartX = { ...chart, columnSelections: [xAxisCol], rowColumns: [], colColumns: [] };
      const xChartData = getChartData(tempChartX);
      const xData = xChartData[0]?.data || [];
      
      // Get unique categories from X-axis
      const categoriesSet = new Set<string>();
      xData.forEach((val: any) => categoriesSet.add(String(val)));
      const categories = Array.from(categoriesSet).sort().slice(0, 20);
      
      // Build series for each Y-axis column
      const series = yAxisCols.map((yCol) => {
        // Fetch data for this Y-axis column
        const tempChartY = { ...chart, columnSelections: [yCol], rowColumns: [], colColumns: [] };
        const yChartData = getChartData(tempChartY);
        const yData = yChartData[0]?.data || [];
        
        // Check if Y data is numeric
        const sampleY = yData.slice(0, 10);
        const isNumeric = sampleY.every((val: any) => {
          if (typeof val === 'number') return true;
          const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
          return !isNaN(parsed) && String(val).trim() !== '';
        });
        
        const minLength = Math.min(xData.length, yData.length);
        let seriesData: any[];
        
        if (isNumeric) {
          // Aggregate numeric values by category
          const aggregated: Record<string, number[]> = {};
          
          for (let i = 0; i < minLength; i++) {
            const category = String(xData[i]);
            const value = typeof yData[i] === 'number' ? yData[i] : parseFloat(String(yData[i]).replace(/[^0-9.-]/g, ''));
            
            if (!isNaN(value)) {
              if (!aggregated[category]) {
                aggregated[category] = [];
              }
              aggregated[category].push(value);
            }
          }
          
          // Average values for each category
          seriesData = categories.map(category => ({
            label: category,
            value: aggregated[category] ? aggregated[category].reduce((a, b) => a + b, 0) / aggregated[category].length : 0
          }));
        } else {
          // Count categorical occurrences
          const counts: Record<string, number> = {};
          
          for (let i = 0; i < minLength; i++) {
            const category = String(xData[i]);
            counts[category] = (counts[category] || 0) + 1;
          }
          
          seriesData = categories.map(category => ({
            label: category,
            value: counts[category] || 0
          }));
        }
        
        return {
          name: yCol.displayName,
          data: seriesData
        };
      });

      return { series, categories };
    } catch (error) {
      console.error('Error transforming line chart data:', error);
      return { series: [], categories: [] };
    }
  };

  const getTableData = (chart: ChartConfig) => {
    // Check if we have any columns to display (from drag-drop or legacy columnSelections)
    const hasColumns = chart.rowColumns.length > 0 || chart.colColumns.length > 0 || chart.columnSelections.length > 0;
    if (!hasColumns) {
      console.log('📋 No columns to display in table');
      return {};
    }

    const chartData = getChartData(chart);
    console.log('📋 Table data from getChartData:', chartData.length, 'columns');
    
    if (chartData.length === 0) return {};

    const tableData: Record<string, any[]> = {};

    chartData.forEach(result => {
      tableData[result.selection.displayName] = result.data || [];
    });

    console.log('📋 Final table data:', Object.keys(tableData).length, 'columns', 
      Object.values(tableData)[0]?.length || 0, 'rows');

    return tableData;
  };

  // Transform data for gauge/KPI charts - returns aggregated numeric values
  const getGaugeKpiData = (chart: ChartConfig) => {
    const hasColumns = chart.rowColumns.length > 0 || chart.colColumns.length > 0 || chart.columnSelections.length > 0;
    if (!hasColumns) {
      console.log('🎯 No columns for gauge/KPI');
      return [];
    }

    const chartData = getChartData(chart);
    console.log('🎯 Gauge/KPI data:', chartData.length, 'columns');
    if (chartData.length === 0) return [];

    try {
      // For gauge/KPI, we want to aggregate numeric values
      const result: any = {};
      
      chartData.forEach(({ selection, data }) => {
        if (!data || data.length === 0) return;
        
        // Try to convert values to numbers and calculate sum/average
        const numericValues = data
          .map((val: any) => {
            const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
            return isNaN(num) ? null : num;
          })
          .filter((val: number | null) => val !== null) as number[];
        
        if (numericValues.length > 0) {
          // Calculate sum
          const sum = numericValues.reduce((acc, val) => acc + val, 0);
          result[selection.displayName] = sum;
        } else {
          // If not numeric, count occurrences
          result[selection.displayName] = data.length;
        }
      });
      
      return [result];
    } catch (error) {
      console.error('Error transforming gauge/KPI data:', error);
      return [];
    }
  };

  // Transform data for area/scatter charts - returns actual coordinate values
  const getAreaScatterData = (chart: ChartConfig) => {
    const allColumns = [...chart.rowColumns, ...chart.colColumns, ...chart.columnSelections];
    if (allColumns.length < 2) {
      console.log('📈 Area/Scatter needs at least 2 columns, has:', allColumns.length);
      return [];
    }

    // Deterministic mapping: Rows => X, Columns => Y (fallback to first two selections)
    const sameCol = (a: any, b: any) =>
      !!a && !!b && a.datasetId === b.datasetId && a.columnName === b.columnName;

    const xCol = chart.rowColumns[0] ?? allColumns[0];
    const yCol =
      chart.colColumns[0] ??
      allColumns.find((c) => !sameCol(c, xCol)) ??
      allColumns[1];

    if (!xCol || !yCol) return [];

    const tempChartX = { ...chart, columnSelections: [xCol], rowColumns: [], colColumns: [] };
    const tempChartY = { ...chart, columnSelections: [yCol], rowColumns: [], colColumns: [] };

    const xChartData = getChartData(tempChartX);
    const yChartData = getChartData(tempChartY);

    const xData = xChartData[0]?.data || [];
    const yData = yChartData[0]?.data || [];
    const xName = xCol.displayName || 'x';
    const yName = yCol.displayName || 'y';

    console.log('📈 Area/Scatter columns:', {
      x: xCol.displayName,
      y: yCol.displayName,
      xLen: xData.length,
      yLen: yData.length,
    });

    try {
      const minLength = Math.min(xData.length, yData.length);

      // Determine if Y is numeric; if not, fall back to counting rows per X bucket
      const sampleY = yData.slice(0, 10);
      const yIsNumeric = sampleY.every((val: any) => {
        if (typeof val === 'number') return true;
        const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        return !isNaN(parsed) && String(val).trim() !== '';
      });

      if (yIsNumeric) {
        const points: any[] = [];
        for (let i = 0; i < minLength && i < 1000; i++) {
          const xVal = xData[i];
          const yVal = yData[i];
          const yNum = typeof yVal === 'number' ? yVal : parseFloat(String(yVal).replace(/[^0-9.-]/g, ''));
          if (!isNaN(yNum)) {
            points.push({
              [xName]: xVal,
              [yName]: yNum,
            });
          }
        }
        return points;
      }

      // Categorical Y: count occurrences per X category
      const counts: Record<string, number> = {};
      for (let i = 0; i < minLength; i++) {
        const xKey = String(xData[i]);
        counts[xKey] = (counts[xKey] || 0) + 1;
      }

      return Object.entries(counts)
        .slice(0, 1000)
        .map(([xKey, count]) => ({
          [xName]: xKey,
          [yName]: count,
        }));
    } catch (error) {
      console.error('Error transforming area/scatter data:', error);
      return [];
    }
  };

  // Transform data for Treemap and Funnel (Category + Value)
  const getTreemapData = (chart: ChartConfig) => {
    // Similar logic to Pie chart: 1 Category (Rows), 1 Value (Columns)
    const hasRowsCols = chart.rowColumns.length > 0 || chart.colColumns.length > 0;
    const columnsToUse = hasRowsCols ? [...chart.rowColumns, ...chart.colColumns] : chart.columnSelections;
    
    if (columnsToUse.length === 0) return [];

    try {
      const labelCol = chart.rowColumns[0] || columnsToUse[0];
      const valueCol = chart.colColumns[0] || columnsToUse[1];
      
      if (!labelCol || !valueCol) return [];
      
      // Clear rowColumns and colColumns to ensure we only fetch the specific column
      const tempChartLabel = { ...chart, columnSelections: [labelCol], rowColumns: [], colColumns: [] };
      const tempChartValue = { ...chart, columnSelections: [valueCol], rowColumns: [], colColumns: [] };
      
      const labelChartData = getChartData(tempChartLabel);
      const valueChartData = getChartData(tempChartValue);
      
      const labels = labelChartData[0]?.data || [];
      const values = valueChartData[0]?.data || [];

      const minLength = Math.min(labels.length, values.length);
      const aggregated: Record<string, number> = {};
      
      for (let i = 0; i < minLength; i++) {
        const label = String(labels[i]);
        const val = values[i];
        const numVal = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        
        if (!isNaN(numVal)) {
          aggregated[label] = (aggregated[label] || 0) + numVal;
        }
      }
      
      const labelKey = labelCol.displayName;
      const valueKey = valueCol.displayName;

      return Object.entries(aggregated)
        .map(([name, value]) => ({ 
          [labelKey]: name, 
          [valueKey]: value 
        }))
        .sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0))
        .slice(0, 20); // Limit for readability
    } catch (error) {
      console.error('Error transforming treemap data:', error);
      return [];
    }
  };

  const getFunnelData = (chart: ChartConfig) => {
    return getTreemapData(chart);
  };

  const getHeatmapData = (chart: ChartConfig) => {
    const hasRowsCols = chart.rowColumns.length > 0 || chart.colColumns.length > 0;
    if (!hasRowsCols) {
      console.log('🔥 Heatmap needs row and column dimensions');
      return [];
    }

    const chartData = getChartData(chart);
    if (chartData.length === 0) return [];

    // For heatmap, we need: 2 categorical (rowColumns) and 1 numeric (colColumns)
    // rowColumns[0] = X-axis, rowColumns[1] = Y-axis, colColumns[0] = value
    const xAxisCol = chart.rowColumns[0];
    const yAxisCol = chart.rowColumns[1];
    const valueCol = chart.colColumns[0];

    if (!xAxisCol || !yAxisCol || !valueCol) {
      console.log('🔥 Heatmap needs 2 row columns (X, Y) and 1 value column');
      return [];
    }

    // Build flat data array for HeatmapChart component
    const flatData: any[] = [];
    
    const xData = chartData.find(r => r.selection.datasetId === xAxisCol.datasetId && r.selection.columnName === xAxisCol.columnName);
    const yData = chartData.find(r => r.selection.datasetId === yAxisCol.datasetId && r.selection.columnName === yAxisCol.columnName);
    const vData = chartData.find(r => r.selection.datasetId === valueCol.datasetId && r.selection.columnName === valueCol.columnName);

    if (!xData || !yData || !vData) return [];

    const length = Math.min(xData.data?.length || 0, yData.data?.length || 0, vData.data?.length || 0);
    
    for (let i = 0; i < length; i++) {
      flatData.push({
        [xAxisCol.displayName]: xData.data[i],
        [yAxisCol.displayName]: yData.data[i],
        [valueCol.displayName]: vData.data[i]
      });
    }

    console.log('🔥 Heatmap data:', flatData.length, 'rows');
    return flatData;
  };

  const isChartDataLoading = chartDataQueries.isLoading;
  const hasChartDataError = chartDataQueries.isError;

  if (isDatasetsLoading || isConnectionsLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '16px', color: '#6b7280' }}>
          <span style={{ marginRight: '8px' }}>🔄</span>
          Loading data sources...
        </div>
      </div>
    );
  }

  if (renderError) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '32px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>❌</div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#ef4444', marginBottom: '8px' }}>
              Rendering Error
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '8px', fontFamily: 'monospace', fontSize: '14px' }}>
              {renderError}
            </p>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              Check the browser console for more details.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '16px',
                padding: '8px 16px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedDatasets.length === 0 && selectedConnections.length === 0) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '32px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <button
            onClick={handleBack}
            style={{
              marginBottom: '24px',
              padding: '8px 16px',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#374151'
            }}
          >
            ← Back to Dashboard
          </button>
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#ef4444', marginBottom: '8px' }}>
              No Datasets Selected
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '16px' }}>
              Please go back to the dashboard and select datasets or MongoDB connections to visualize.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalDataSources = selectedDatasets.length + selectedConnections.length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '32px' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        <button
          onClick={handleBack}
          style={{
            marginBottom: '24px',
            padding: '8px 16px',
            backgroundColor: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#374151',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
        >
          ← Back to Dashboard
        </button>

        {/* Modern Header with Tabs */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
                Dashboard Builder
              </h1>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {totalDataSources} data source{totalDataSources !== 1 ? 's' : ''} • {charts.length} chart{charts.length !== 1 ? 's' : ''}
              </p>
            </div>
            {charts.length > 0 && (
              <button
                onClick={() => setShowSaveModal(true)}
                disabled={saveDashboardMutation.isPending}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saveDashboardMutation.isPending ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
                  transition: 'all 0.2s',
                  opacity: saveDashboardMutation.isPending ? 0.6 : 1
                }}
                onMouseEnter={(e) => !saveDashboardMutation.isPending && (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                {saveDashboardMutation.isPending ? '💾 Saving...' : '💾 Save Dashboard'}
              </button>
            )}
          </div>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid #e5e7eb' }}>
            <button
              onClick={() => setActiveTab('design')}
              style={{
                padding: '12px 24px',
                backgroundColor: activeTab === 'design' ? 'white' : 'transparent',
                color: activeTab === 'design' ? '#4f46e5' : '#6b7280',
                border: 'none',
                borderBottom: activeTab === 'design' ? '3px solid #4f46e5' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.2s',
                marginBottom: '-2px'
              }}
            >
              🎨 Design
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              style={{
                padding: '12px 24px',
                backgroundColor: activeTab === 'analytics' ? 'white' : 'transparent',
                color: activeTab === 'analytics' ? '#4f46e5' : '#6b7280',
                border: 'none',
                borderBottom: activeTab === 'analytics' ? '3px solid #4f46e5' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.2s',
                marginBottom: '-2px'
              }}
            >
              🔧 Analytics
            </button>
            <button
              onClick={() => setActiveTab('export')}
              style={{
                padding: '12px 24px',
                backgroundColor: activeTab === 'export' ? 'white' : 'transparent',
                color: activeTab === 'export' ? '#4f46e5' : '#6b7280',
                border: 'none',
                borderBottom: activeTab === 'export' ? '3px solid #4f46e5' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                transition: 'all 0.2s',
                marginBottom: '-2px'
              }}
            >
              📤 Export
            </button>
          </div>
        </div>

        {/* Warning banner for problematic datasets */}
        {problematicDatasets.length > 0 && (
          <div style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fbbf24',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <div style={{ fontSize: '24px' }}>⚠️</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#92400e', marginBottom: '4px' }}>
                Some datasets cannot be previewed
              </h3>
              <p style={{ fontSize: '14px', color: '#78350f', marginBottom: '8px' }}>
                The following dataset{problematicDatasets.length !== 1 ? 's have' : ' has'} incomplete metadata or errors:
              </p>
              <ul style={{ fontSize: '14px', color: '#78350f', marginLeft: '20px', marginBottom: '8px' }}>
                {problematicDatasets.map((ds: Dataset) => (
                  <li key={ds.id}>
                    <strong>{ds.name}</strong> - Status: {ds.status}
                    {ds.error_message && ` (${ds.error_message})`}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: '13px', color: '#92400e' }}>
                💡 <strong>Solution:</strong> Please re-upload these datasets from the dashboard to fix metadata issues.
              </p>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'design' && (
          <div style={{ display: 'flex', gap: '24px' }}>
          {/* Modern Left Sidebar */}
          <div style={{ width: '320px', flexShrink: 0 }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              position: 'sticky',
              top: '32px',
              overflow: 'hidden'
            }}>
              {/* Data Sources Section */}
              <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📁 Data Sources
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Regular Datasets */}
                  {selectedDatasets.map(ds => {
                    const details = allDatasetDetails.find((d: any) => d.id === ds.id);
                    const qualityScore = details?.quality_report?.overall_score || 0;
                    const columnCount = details?.schema_info?.columns?.length || 0;
                    return (
                      <div
                        key={ds.id}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px',
                          fontSize: '13px',
                          border: '1px solid #e5e7eb'
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          📄 {ds.name}
                          {qualityScore > 90 && <span style={{ fontSize: '12px' }}>✅</span>}
                          {qualityScore >= 70 && qualityScore <= 90 && <span style={{ fontSize: '12px' }}>⚠️</span>}
                          {qualityScore < 70 && qualityScore > 0 && <span style={{ fontSize: '12px' }}>❌</span>}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '12px' }}>
                          📊 {columnCount} columns
                          {qualityScore > 0 && ` • ${qualityScore}% quality`}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* MongoDB Connections */}
                  {selectedConnections.map((conn: any) => {
                    const collections = connectionCollections[conn.id] || [];
                    const selected = selectedCollections[conn.id] || [];
                    return (
                      <div
                        key={conn.id}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: '#eff6ff',
                          borderRadius: '8px',
                          fontSize: '13px',
                          border: '1px solid #93c5fd'
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          🍃 {conn.name}
                        </div>
                        <div style={{ color: '#1e40af', fontSize: '12px', marginBottom: '8px' }}>
                          📊 {collections.length} collection(s)
                        </div>
                        {/* Collection selector */}
                        <select
                          multiple
                          value={selected}
                          onChange={(e) => {
                            const options = Array.from(e.target.selectedOptions, option => option.value);
                            setSelectedCollections(prev => ({ ...prev, [conn.id]: options }));
                          }}
                          style={{
                            width: '100%',
                            padding: '6px',
                            fontSize: '12px',
                            border: '1px solid #93c5fd',
                            borderRadius: '4px',
                            backgroundColor: 'white',
                            maxHeight: '100px',
                            overflow: 'auto'
                          }}
                        >
                          {collections.map((coll: string) => (
                            <option key={coll} value={coll}>
                              {coll}
                            </option>
                          ))}
                        </select>
                        <div style={{ fontSize: '11px', color: '#1e40af', marginTop: '4px' }}>
                          💡 Hold Ctrl/Cmd to select multiple
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Visualizations Section */}
              <div style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
                📊 Visualizations
              </h2>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>
                  Chart Type
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedChartType}
                    onChange={(e) => setSelectedChartType(e.target.value as typeof selectedChartType)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '14px',
                      fontWeight: 500,
                      border: '2px solid #4f46e5',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      color: '#4f46e5',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="bar">📊 Bar Chart</option>
                    <option value="pie">🥧 3D Pie Chart</option>
                    <option value="line">📈 Line Chart</option>
                    <option value="area">📉 Area Chart</option>
                    <option value="scatter">⚪ Scatter Plot</option>
                    <option value="gauge">🎯 Gauge Chart</option>
                    <option value="kpi">💯 KPI Card</option>
                    <option value="table">📋 Table</option>
                    <option value="heatmap">🔥 Heatmap</option>
                    <option value="treemap">🔲 Treemap</option>
                    <option value="funnel">🔻 Funnel Chart</option>
                  </select>
                </div>
                {/* Tooltip descriptions */}
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '6px', fontSize: '12px', color: '#6b7280' }}>
                  {selectedChartType === 'bar' && '📊 Compare categories with vertical bars. Best for discrete categories.'}
                  {selectedChartType === 'pie' && '🥧 Show proportions in a circle. Best for parts of a whole (max 6-8 slices).'}
                  {selectedChartType === 'line' && '📈 Display trends over time. Best for time-series data.'}
                  {selectedChartType === 'area' && '📉 Filled line chart. Best for cumulative data and trends.'}
                  {selectedChartType === 'scatter' && '⚪ Show correlation between variables. Best for finding relationships.'}
                  {selectedChartType === 'gauge' && '🎯 Progress indicator. Best for showing completion (0-100%).'}
                  {selectedChartType === 'kpi' && '💯 Single metric display. Best for headline numbers.'}
                  {selectedChartType === 'table' && '📋 Raw data view. Best for detailed inspection.'}
                  {selectedChartType === 'heatmap' && '🔥 Correlation matrix. Best for comparing two categorical dimensions (region × product, day × hour).'}
                  {selectedChartType === 'treemap' && '🔲 Nested rectangles. Best for hierarchical data and proportions.'}
                  {selectedChartType === 'funnel' && '🔻 Process stages. Best for conversion rates and pipelines.'}
                </div>
                  {selectedChartType === 'kpi' && '💯 Big number metric with trend. Best for key performance indicators.'}
                  {selectedChartType === 'table' && '📋 Raw data in rows and columns. Best for detailed inspection.'}
                </div>
              </div>

              <button
                onClick={handleAddChart}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
              >
                + Add Chart to Dashboard
              </button>

              {/* Hide the old chart type buttons */}
              <div style={{ display: 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { type: 'bar' as const, icon: '📊', label: 'Bar Chart', tooltip: 'Compare categories with vertical bars. Best for comparing discrete categories.' },
                    { type: 'pie' as const, icon: '🥧', label: '3D Pie Chart', tooltip: 'Show proportions in a circle. Best for showing parts of a whole (max 6-8 slices).' },
                    { type: 'line' as const, icon: '📈', label: 'Line Chart', tooltip: 'Display trends over time. Best for time-series data and continuous values.' },
                    { type: 'area' as const, icon: '📉', label: 'Area Chart', tooltip: 'Filled line chart showing volume over time. Best for cumulative data and trends.' },
                    { type: 'scatter' as const, icon: '⚪', label: 'Scatter Plot', tooltip: 'Show correlation between two variables. Best for finding relationships and outliers.' },
                    { type: 'gauge' as const, icon: '🎯', label: 'Gauge Chart', tooltip: 'Progress indicator toward a goal. Best for showing completion percentage (0-100%).' },
                    { type: 'kpi' as const, icon: '💯', label: 'KPI Card', tooltip: 'Big number metric with trend. Best for highlighting key performance indicators.' },
                    { type: 'table' as const, icon: '📋', label: 'Table', tooltip: 'Display raw data in rows and columns. Best for detailed data inspection.' },
                    { type: 'heatmap' as const, icon: '🔥', label: 'Heatmap', tooltip: 'Correlation matrix. Best for analyzing relationships between two categorical dimensions.' },
                  ].map(({ type, icon, label, tooltip }) => (
                    <div key={type} style={{ position: 'relative' }}>
                      <button
                        onClick={() => setSelectedChartType(type)}
                        onMouseEnter={() => setHoveredChartType(type)}
                        onMouseLeave={() => setHoveredChartType(null)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          backgroundColor: selectedChartType === type ? '#eef2ff' : 'white',
                          color: selectedChartType === type ? '#4f46e5' : '#6b7280',
                          border: selectedChartType === type ? '2px solid #4f46e5' : '1px solid #d1d5db',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 500,
                          textAlign: 'left',
                          transition: 'all 0.2s',
                        }}
                      >
                        {icon} {label}
                      </button>
                      {hoveredChartType === type && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 'calc(100% + 12px)',
                            top: '0',
                            zIndex: 1000,
                            backgroundColor: '#1f2937',
                            color: 'white',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            lineHeight: '1.5',
                            maxWidth: '280px',
                            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
                            whiteSpace: 'normal',
                            pointerEvents: 'none',
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: '4px', color: '#60a5fa' }}>
                            {icon} {label}
                          </div>
                          {tooltip}
                          <div
                            style={{
                              position: 'absolute',
                              left: '-6px',
                              top: '16px',
                              width: '0',
                              height: '0',
                              borderTop: '6px solid transparent',
                              borderBottom: '6px solid transparent',
                              borderRight: '6px solid #1f2937',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {charts.length > 0 && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
                    Charts ({charts.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {charts.map((chart, idx) => {
                      const icons: Record<string, string> = { bar: '📊', pie: '🥧', line: '📈', table: '📋', area: '📉', scatter: '⚪', gauge: '🎯', kpi: '💯', heatmap: '🔥' };
                      return (
                        <div
                          key={chart.id}
                          style={{
                            padding: '10px 12px',
                            backgroundColor: editingChartId === chart.id ? '#eef2ff' : '#f9fafb',
                            border: editingChartId === chart.id ? '1px solid #4f46e5' : '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => setEditingChartId(chart.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: '#111827', fontWeight: 500 }}>
                              {icons[chart.type]} Chart {idx + 1}
                            </span>
                            <span style={{ color: '#6b7280', fontSize: '11px' }}>
                              {chart.columnSelections.length} col{chart.columnSelections.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
            </div>

          {/* Middle Panel - Dataset Columns (Tableau-style) */}
          <div style={{
            width: '220px',
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            maxHeight: 'calc(100vh - 180px)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📁 Data Sources
                </h3>
                {(selectedDatasets.length > 0 || selectedConnections.length > 0) && (
                  <button
                    onClick={() => {
                      // Prepare datasets with full details
                      const datasetsToPass = selectedDatasets.map(ds => {
                        const detail = allDatasetDetails.find((d: any) => d.id === ds.id);
                        return detail || ds;
                      });
                      
                      // Prepare connections with selected tables
                      const connectionsToPass = selectedConnections.map(conn => ({
                        ...conn,
                        selectedTables: selectedCollections[conn.id] || []
                      }));

                      navigate('/model', { 
                        state: { 
                          datasets: datasetsToPass,
                          connections: connectionsToPass
                        } 
                      });
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      backgroundColor: '#eff6ff',
                      color: '#3b82f6',
                      border: '1px solid #bfdbfe',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Open selected data in Data Flow workspace"
                  >
                    <span>🕸️</span> Data Flow
                  </button>
                )}
              </div>
            </div>

            {/* Dataset list with expandable columns */}
            <div style={{ padding: '12px' }}>
              {selectedDatasets.length === 0 && selectedConnections.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                  No datasets or connections selected
                </div>
              ) : (
                <>
                  {/* Regular Datasets */}
                  {selectedDatasets.map((dataset) => {
                    const details = allDatasetDetails.find((d: any) => d.id === dataset.id);
                    const columns = details?.schema_info?.schema?.columns || details?.schema_info?.columns || [];
                    const isExpanded = expandedDatasets.has(dataset.id);

                    return (
                      <div key={dataset.id} style={{ marginBottom: '8px' }}>
                        {/* Dataset header */}
                        <button
                          onClick={() => toggleDatasetExpansion(dataset.id)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            backgroundColor: isExpanded ? '#f3f4f6' : 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.2s',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: '#111827',
                            textAlign: 'left'
                          }}
                          onMouseEnter={(e) => {
                            if (!isExpanded) e.currentTarget.style.backgroundColor = '#f9fafb';
                          }}
                          onMouseLeave={(e) => {
                            if (!isExpanded) e.currentTarget.style.backgroundColor = 'white';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                            <span style={{ fontSize: '16px' }}>{isExpanded ? '📂' : '📁'}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {dataset.name}
                            </span>
                          </div>
                          <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: '8px' }}>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </button>

                        {/* Columns list */}
                        {isExpanded && (
                          <div style={{ marginTop: '4px', marginLeft: '12px', paddingLeft: '12px', borderLeft: '2px solid #e5e7eb' }}>
                            {columns.length === 0 ? (
                              <div style={{ padding: '8px', fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
                                No columns available
                              </div>
                            ) : (
                              columns.map((column: any) => {
                                const columnType = column.type?.toLowerCase() || 'text';
                                const icon = columnType.includes('int') || columnType.includes('float') || columnType.includes('numeric') ? '#️⃣' :
                                            columnType.includes('date') || columnType.includes('time') ? '📅' :
                                            columnType.includes('bool') ? '✓' : 'Abc';

                                return (
                                  <div
                                    key={column.name}
                                    draggable
                                    onDragStart={(e) => {
                                      const columnSelection: ColumnSelection = {
                                        datasetId: dataset.id,
                                        columnName: column.name,
                                        displayName: column.displayName || column.name,
                                        datasetName: dataset.name,
                                        type: columnType
                                      };
                                      setDraggedColumn(columnSelection);
                                      e.dataTransfer.effectAllowed = 'copy';
                                      e.dataTransfer.setData('application/json', JSON.stringify(columnSelection));
                                    }}
                                    onDragEnd={() => setDraggedColumn(null)}
                                    style={{
                                      padding: '8px 10px',
                                      marginBottom: '4px',
                                      backgroundColor: 'white',
                                      border: '1px solid #e5e7eb',
                                      borderRadius: '4px',
                                      cursor: 'grab',
                                      fontSize: '12px',
                                      color: '#374151',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                                      e.currentTarget.style.borderColor = '#4f46e5';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = 'white';
                                      e.currentTarget.style.borderColor = '#e5e7eb';
                                    }}
                                  >
                                    <span style={{ fontSize: '14px' }}>{icon}</span>
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {column.displayName || column.name}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* MongoDB Connections */}
                  {selectedConnections.map((conn: any) => {
                    const collections = selectedCollections[conn.id] || [];
                    
                    return collections.map((collectionName: string) => (
                      <MongoDBCollectionItem
                        key={`conn:${conn.id}:collection:${collectionName}`}
                        connectionId={conn.id}
                        collectionName={collectionName}
                        isExpanded={expandedDatasets.has(`conn:${conn.id}:collection:${collectionName}`)}
                        onToggleExpand={toggleDatasetExpansion}
                        connectionName={conn.name}
                        setDraggedColumn={setDraggedColumn}
                      />
                    ));
                  })}
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Charts Display */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Columns and Rows Drop Zones (Tableau-style) */}
            {charts.length > 0 && editingChartId && (() => {
              const editingChart = charts.find(c => c.id === editingChartId);
              if (!editingChart) return null;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {/* Columns Drop Zone (Y-axis) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedColumn) {
                        handleAddToColumns(editingChartId, draggedColumn);
                        setDraggedColumn(null);
                      }
                    }}
                    style={{
                      minHeight: '50px',
                      padding: '12px 16px',
                      backgroundColor: 'white',
                      border: '2px dashed #10b981',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', minWidth: '80px' }}>
                      ≡ Columns
                    </div>
                    {editingChart.colColumns.length === 0 ? (
                      <span style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>Drop Y-axis fields here</span>
                    ) : (
                      editingChart.colColumns.map((col, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#d1fae5',
                            border: '1px solid #10b981',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#047857',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          {col.displayName}
                          <button
                            onClick={() => handleRemoveFromColumns(editingChartId, idx)}
                            style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#047857',
                              cursor: 'pointer',
                              fontSize: '14px',
                              padding: '0 2px',
                              lineHeight: 1
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Rows Drop Zone (X-axis) */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedColumn) {
                        handleAddToRows(editingChartId, draggedColumn);
                        setDraggedColumn(null);
                      }
                    }}
                    style={{
                      minHeight: '50px',
                      padding: '12px 16px',
                      backgroundColor: 'white',
                      border: '2px dashed #6366f1',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#6366f1', minWidth: '80px' }}>
                      ☰ Rows
                    </div>
                    {editingChart.rowColumns.length === 0 ? (
                      <span style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>Drop X-axis fields here</span>
                    ) : (
                      editingChart.rowColumns.map((col, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#e0e7ff',
                            border: '1px solid #6366f1',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#4338ca',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          {col.displayName}
                          <button
                            onClick={() => handleRemoveFromRows(editingChartId, idx)}
                            style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#4338ca',
                              cursor: 'pointer',
                              fontSize: '14px',
                              padding: '0 2px',
                              lineHeight: 1
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}

            {charts.length === 0 ? (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '2px dashed #d1d5db',
                padding: '60px 24px',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>📊</div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                  No Charts Yet
                </h2>
                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
                  Select a chart type from the left panel and click "Add Chart to Dashboard" to get started
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '24px' }}>
                {/* Main Charts Column */}
                <div style={{ flex: (showGaugeConfig || showScatterConfig || showBarConfig || showPieConfig || showLineConfig || showAreaConfig) ? '1 1 65%' : '1', display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
                  {charts.map((chart) => (
                    <div key={chart.id} style={{ position: 'relative' }}>
                      <ChartCard
                        chart={chart}
                        chartIndex={charts.indexOf(chart)}
                        isEditing={editingChartId === chart.id}
                        selectedDatasets={selectedDatasets}
                        allDatasetDetails={allDatasetDetails as any}
                        datasetDetailsLoading={datasetDetailsQueries.isLoading}
                        datasetDetailsError={datasetDetailsQueries.isError}
                        chartData={
                          chart.type === 'bar' ? getBarChartData(chart) :
                          chart.type === 'pie' ? getPieChartData(chart) :
                          chart.type === 'line' ? getLineChartData(chart) :
                          chart.type === 'area' ? getAreaScatterData(chart) :
                          chart.type === 'scatter' ? getAreaScatterData(chart) :
                          chart.type === 'gauge' ? getGaugeKpiData(chart) :
                          chart.type === 'kpi' ? getGaugeKpiData(chart) :
                          chart.type === 'table' ? getTableData(chart) :
                          chart.type === 'heatmap' ? getHeatmapData(chart) :
                          chart.type === 'treemap' ? getTreemapData(chart) :
                          chart.type === 'funnel' ? getFunnelData(chart) :
                          []
                        }
                        isChartDataLoading={isChartDataLoading}
                        hasChartDataError={hasChartDataError}
                        colors={COLORS}
                        onEdit={() => setEditingChartId(chart.id)}
                        onRemove={() => handleRemoveChart(chart.id)}
                        onUpdateTitle={(newTitle) => handleUpdateChartTitle(chart.id, newTitle)}
                        onAddColumn={(datasetId, columnName) => handleAddColumnToChart(chart.id, datasetId, columnName)}
                        onRemoveColumn={(index) => handleRemoveColumnFromChart(chart.id, index)}
                      />
                      {/* Add Settings Buttons for Special Chart Types */}
                      {chart.type === 'gauge' && (
                        <button
                          onClick={() => {
                            setShowGaugeConfig(showGaugeConfig === chart.id ? null : chart.id);
                            setShowScatterConfig(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: '16px',
                            right: editingChartId === chart.id ? '140px' : '80px',
                            backgroundColor: showGaugeConfig === chart.id ? '#4f46e5' : 'white',
                            color: showGaugeConfig === chart.id ? 'white' : '#4f46e5',
                            border: '1px solid #4f46e5',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                            zIndex: 10
                          }}
                          onMouseEnter={(e) => {
                            if (showGaugeConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = '#eff6ff';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (showGaugeConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = 'white';
                            }
                          }}
                        >
                          🎯 Target Settings
                        </button>
                      )}
                      {chart.type === 'scatter' && (
                        <button
                          onClick={() => {
                            setShowScatterConfig(showScatterConfig === chart.id ? null : chart.id);
                            setShowGaugeConfig(null);
                            setShowBarConfig(null);
                            setShowPieConfig(null);
                            setShowLineConfig(null);
                            setShowAreaConfig(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: '16px',
                            right: editingChartId === chart.id ? '140px' : '80px',
                            backgroundColor: showScatterConfig === chart.id ? '#10b981' : 'white',
                            color: showScatterConfig === chart.id ? 'white' : '#10b981',
                            border: '1px solid #10b981',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                            zIndex: 10
                          }}
                          onMouseEnter={(e) => {
                            if (showScatterConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = '#d1fae5';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (showScatterConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = 'white';
                            }
                          }}
                        >
                          🔵 Marks
                        </button>
                      )}
                      {chart.type === 'bar' && (
                        <button
                          onClick={() => {
                            setShowBarConfig(showBarConfig === chart.id ? null : chart.id);
                            setShowGaugeConfig(null);
                            setShowScatterConfig(null);
                            setShowPieConfig(null);
                            setShowLineConfig(null);
                            setShowAreaConfig(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: '16px',
                            right: editingChartId === chart.id ? '140px' : '80px',
                            backgroundColor: showBarConfig === chart.id ? '#6366f1' : 'white',
                            color: showBarConfig === chart.id ? 'white' : '#6366f1',
                            border: '1px solid #6366f1',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                            zIndex: 10
                          }}
                          onMouseEnter={(e) => {
                            if (showBarConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = '#e0e7ff';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (showBarConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = 'white';
                            }
                          }}
                        >
                          📊 Bar Settings
                        </button>
                      )}
                      {chart.type === 'pie' && (
                        <button
                          onClick={() => {
                            setShowPieConfig(showPieConfig === chart.id ? null : chart.id);
                            setShowGaugeConfig(null);
                            setShowScatterConfig(null);
                            setShowBarConfig(null);
                            setShowLineConfig(null);
                            setShowAreaConfig(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: '16px',
                            right: editingChartId === chart.id ? '140px' : '80px',
                            backgroundColor: showPieConfig === chart.id ? '#f59e0b' : 'white',
                            color: showPieConfig === chart.id ? 'white' : '#f59e0b',
                            border: '1px solid #f59e0b',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                            zIndex: 10
                          }}
                          onMouseEnter={(e) => {
                            if (showPieConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = '#fef3c7';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (showPieConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = 'white';
                            }
                          }}
                        >
                          🥧 Pie Settings
                        </button>
                      )}
                      {chart.type === 'line' && (
                        <button
                          onClick={() => {
                            setShowLineConfig(showLineConfig === chart.id ? null : chart.id);
                            setShowGaugeConfig(null);
                            setShowScatterConfig(null);
                            setShowBarConfig(null);
                            setShowPieConfig(null);
                            setShowAreaConfig(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: '16px',
                            right: editingChartId === chart.id ? '140px' : '80px',
                            backgroundColor: showLineConfig === chart.id ? '#ec4899' : 'white',
                            color: showLineConfig === chart.id ? 'white' : '#ec4899',
                            border: '1px solid #ec4899',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                            zIndex: 10
                          }}
                          onMouseEnter={(e) => {
                            if (showLineConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = '#fce7f3';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (showLineConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = 'white';
                            }
                          }}
                        >
                          📈 Line Settings
                        </button>
                      )}
                      {chart.type === 'area' && (
                        <button
                          onClick={() => {
                            setShowAreaConfig(showAreaConfig === chart.id ? null : chart.id);
                            setShowGaugeConfig(null);
                            setShowScatterConfig(null);
                            setShowBarConfig(null);
                            setShowPieConfig(null);
                            setShowLineConfig(null);
                          }}
                          style={{
                            position: 'absolute',
                            top: '16px',
                            right: editingChartId === chart.id ? '140px' : '80px',
                            backgroundColor: showAreaConfig === chart.id ? '#8b5cf6' : 'white',
                            color: showAreaConfig === chart.id ? 'white' : '#8b5cf6',
                            border: '1px solid #8b5cf6',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                            zIndex: 10
                          }}
                          onMouseEnter={(e) => {
                            if (showAreaConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = '#f3e8ff';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (showAreaConfig !== chart.id) {
                              e.currentTarget.style.backgroundColor = 'white';
                            }
                          }}
                        >
                          📉 Area Settings
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Gauge Configuration Panel */}
                {showGaugeConfig && charts.find(c => c.id === showGaugeConfig) && (
                  <div style={{
                    flex: '0 0 35%',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    padding: '24px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    maxHeight: '600px',
                    overflowY: 'auto',
                    position: 'sticky',
                    top: '20px'
                  }}>
                    {(() => {
                      const chart = charts.find(c => c.id === showGaugeConfig)!;
                      const config = chart.gaugeConfig || {
                        target: 2500000,
                        level1: 40,
                        level2: 60,
                        level3: 80,
                        overTarget: 110,
                        colors: {
                          low: '#ef4444',
                          medium: '#f59e0b',
                          high: '#10b981',
                          overTarget: '#3b82f6'
                        }
                      };

                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
                              🎯 Gauge Configuration
                            </h3>
                            <button
                              onClick={() => setShowGaugeConfig(null)}
                              style={{
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '20px',
                                color: '#6b7280',
                                padding: '4px'
                              }}
                            >
                              ✕
                            </button>
                          </div>

                          {/* Target Value */}
                          <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                              Target Value
                            </label>
                            <input
                              type="number"
                              value={config.target}
                              onChange={(e) => handleUpdateGaugeConfig(chart.id, { target: Number(e.target.value) })}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px'
                              }}
                            />
                            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                              Maximum value for the gauge (e.g., 2,500,000)
                            </p>
                          </div>

                          {/* Level 1 */}
                          <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                              <span>Level 1 (Low)</span>
                              <span style={{ color: config.colors.low }}>■</span>
                            </label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={config.level1}
                                onChange={(e) => handleUpdateGaugeConfig(chart.id, { level1: Number(e.target.value) })}
                                style={{ flex: 1 }}
                              />
                              <input
                                type="number"
                                value={config.level1}
                                onChange={(e) => handleUpdateGaugeConfig(chart.id, { level1: Number(e.target.value) })}
                                style={{
                                  width: '60px',
                                  padding: '6px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  textAlign: 'center'
                                }}
                              />
                              <span style={{ fontSize: '13px', color: '#6b7280' }}>%</span>
                            </div>
                            <input
                              type="color"
                              value={config.colors.low}
                              onChange={(e) => handleUpdateGaugeConfig(chart.id, {
                                colors: { ...config.colors, low: e.target.value }
                              })}
                              style={{ marginTop: '8px', width: '100%', height: '36px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                            />
                          </div>

                          {/* Level 2 */}
                          <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                              <span>Level 2 (Medium)</span>
                              <span style={{ color: config.colors.medium }}>■</span>
                            </label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={config.level2}
                                onChange={(e) => handleUpdateGaugeConfig(chart.id, { level2: Number(e.target.value) })}
                                style={{ flex: 1 }}
                              />
                              <input
                                type="number"
                                value={config.level2}
                                onChange={(e) => handleUpdateGaugeConfig(chart.id, { level2: Number(e.target.value) })}
                                style={{
                                  width: '60px',
                                  padding: '6px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  textAlign: 'center'
                                }}
                              />
                              <span style={{ fontSize: '13px', color: '#6b7280' }}>%</span>
                            </div>
                            <input
                              type="color"
                              value={config.colors.medium}
                              onChange={(e) => handleUpdateGaugeConfig(chart.id, {
                                colors: { ...config.colors, medium: e.target.value }
                              })}
                              style={{ marginTop: '8px', width: '100%', height: '36px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                            />
                          </div>

                          {/* Level 3 */}
                          <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                              <span>Level 3 (High)</span>
                              <span style={{ color: config.colors.high }}>■</span>
                            </label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={config.level3}
                                onChange={(e) => handleUpdateGaugeConfig(chart.id, { level3: Number(e.target.value) })}
                                style={{ flex: 1 }}
                              />
                              <input
                                type="number"
                                value={config.level3}
                                onChange={(e) => handleUpdateGaugeConfig(chart.id, { level3: Number(e.target.value) })}
                                style={{
                                  width: '60px',
                                  padding: '6px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  textAlign: 'center'
                                }}
                              />
                              <span style={{ fontSize: '13px', color: '#6b7280' }}>%</span>
                            </div>
                            <input
                              type="color"
                              value={config.colors.high}
                              onChange={(e) => handleUpdateGaugeConfig(chart.id, {
                                colors: { ...config.colors, high: e.target.value }
                              })}
                              style={{ marginTop: '8px', width: '100%', height: '36px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                            />
                          </div>

                          {/* Over Target */}
                          <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                              <span>Over Target</span>
                              <span style={{ color: config.colors.overTarget }}>■</span>
                            </label>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <input
                                type="range"
                                min="100"
                                max="150"
                                value={config.overTarget}
                                onChange={(e) => handleUpdateGaugeConfig(chart.id, { overTarget: Number(e.target.value) })}
                                style={{ flex: 1 }}
                              />
                              <input
                                type="number"
                                value={config.overTarget}
                                onChange={(e) => handleUpdateGaugeConfig(chart.id, { overTarget: Number(e.target.value) })}
                                style={{
                                  width: '60px',
                                  padding: '6px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  textAlign: 'center'
                                }}
                              />
                              <span style={{ fontSize: '13px', color: '#6b7280' }}>%</span>
                            </div>
                            <input
                              type="color"
                              value={config.colors.overTarget}
                              onChange={(e) => handleUpdateGaugeConfig(chart.id, {
                                colors: { ...config.colors, overTarget: e.target.value }
                              })}
                              style={{ marginTop: '8px', width: '100%', height: '36px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                            />
                          </div>

                          <div style={{
                            marginTop: '24px',
                            padding: '16px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '8px',
                            fontSize: '13px',
                            color: '#374151'
                          }}>
                            <div style={{ fontWeight: 600, marginBottom: '8px' }}>💡 Tips:</div>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                              <li>Set target to your max expected value</li>
                              <li>Adjust level thresholds to define performance ranges</li>
                              <li>Customize colors to match your brand</li>
                              <li>Values above 100% will use the "Over Target" color</li>
                            </ul>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Scatter Configuration Panel */}
                {showScatterConfig && charts.find(c => c.id === showScatterConfig) && (
                  <div style={{
                    flex: '0 0 35%',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    padding: '24px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    maxHeight: '700px',
                    overflowY: 'auto',
                    position: 'sticky',
                    top: '20px'
                  }}>
                    {(() => {
                      const chart = charts.find(c => c.id === showScatterConfig)!;
                      const config = chart.scatterConfig || {
                        markType: 'circle',
                        showLabels: false,
                        showTrendLine: false,
                        pointSize: 8,
                        pointOpacity: 0.7,
                        colors: COLORS
                      };

                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
                              🎨 Marks Card
                            </h3>
                            <button
                              onClick={() => setShowScatterConfig(null)}
                              style={{
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '20px',
                                color: '#6b7280',
                                padding: '4px'
                              }}
                            >
                              ✕
                            </button>
                          </div>

                          {/* Mark Type Selector */}
                          <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '12px' }}>
                              Mark Type
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              {[
                                { value: 'circle', icon: '⚫', label: 'Circle' },
                                { value: 'square', icon: '⬛', label: 'Square' },
                                { value: 'diamond', icon: '🔶', label: 'Diamond' },
                                { value: 'triangle', icon: '🔺', label: 'Triangle' }
                              ].map(mark => (
                                <button
                                  key={mark.value}
                                  onClick={() => handleUpdateScatterConfig(chart.id, { markType: mark.value as any })}
                                  style={{
                                    padding: '10px',
                                    backgroundColor: config.markType === mark.value ? '#10b981' : 'white',
                                    color: config.markType === mark.value ? 'white' : '#374151',
                                    border: `2px solid ${config.markType === mark.value ? '#10b981' : '#d1d5db'}`,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (config.markType !== mark.value) {
                                      e.currentTarget.style.borderColor = '#10b981';
                                      e.currentTarget.style.backgroundColor = '#d1fae5';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (config.markType !== mark.value) {
                                      e.currentTarget.style.borderColor = '#d1d5db';
                                      e.currentTarget.style.backgroundColor = 'white';
                                    }
                                  }}
                                >
                                  <span style={{ fontSize: '16px' }}>{mark.icon}</span>
                                  {mark.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Point Size */}
                          <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                              <span>📏 Point Size</span>
                              <span style={{ color: '#6b7280', fontSize: '13px' }}>{config.pointSize}px</span>
                            </label>
                            <input
                              type="range"
                              min="4"
                              max="20"
                              value={config.pointSize}
                              onChange={(e) => handleUpdateScatterConfig(chart.id, { pointSize: Number(e.target.value) })}
                              style={{
                                width: '100%',
                                accentColor: '#10b981'
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                              <span>Small</span>
                              <span>Large</span>
                            </div>
                          </div>

                          {/* Point Opacity */}
                          <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                              <span>💧 Point Opacity</span>
                              <span style={{ color: '#6b7280', fontSize: '13px' }}>{Math.round(config.pointOpacity * 100)}%</span>
                            </label>
                            <input
                              type="range"
                              min="0.1"
                              max="1"
                              step="0.1"
                              value={config.pointOpacity}
                              onChange={(e) => handleUpdateScatterConfig(chart.id, { pointOpacity: Number(e.target.value) })}
                              style={{
                                width: '100%',
                                accentColor: '#10b981'
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                              <span>Transparent</span>
                              <span>Solid</span>
                            </div>
                          </div>

                          {/* Show Labels */}
                          <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={config.showLabels}
                                onChange={(e) => handleUpdateScatterConfig(chart.id, { showLabels: e.target.checked })}
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  cursor: 'pointer',
                                  accentColor: '#10b981'
                                }}
                              />
                              <div>
                                <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                                  🏷️ Show Labels
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                  Display data values on points
                                </div>
                              </div>
                            </label>
                          </div>

                          {/* Show Trend Line */}
                          <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={config.showTrendLine}
                                onChange={(e) => handleUpdateScatterConfig(chart.id, { showTrendLine: e.target.checked })}
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  cursor: 'pointer',
                                  accentColor: '#10b981'
                                }}
                              />
                              <div>
                                <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                                  📈 Show Trend Line
                                </div>
                                <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '2px' }}>
                                  Add linear regression line
                                </div>
                              </div>
                            </label>
                          </div>

                          {/* Color By Column */}
                          <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                              🎨 Color By
                            </label>
                            <select
                              value={config.colorByColumn || ''}
                              onChange={(e) => handleUpdateScatterConfig(chart.id, { colorByColumn: e.target.value || undefined })}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                                backgroundColor: 'white',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="">None (single color)</option>
                              {chart.columnSelections.map((col, idx) => (
                                <option key={idx} value={col.columnName}>
                                  {col.displayName}
                                </option>
                              ))}
                            </select>
                            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', margin: '4px 0 0 0' }}>
                              Group points by categorical dimension
                            </p>
                          </div>

                          {/* Size By Column */}
                          <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                              📊 Size By
                            </label>
                            <select
                              value={config.sizeByColumn || ''}
                              onChange={(e) => handleUpdateScatterConfig(chart.id, { sizeByColumn: e.target.value || undefined })}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                                backgroundColor: 'white',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="">None (uniform size)</option>
                              {chart.columnSelections.map((col, idx) => (
                                <option key={idx} value={col.columnName}>
                                  {col.displayName}
                                </option>
                              ))}
                            </select>
                            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', margin: '4px 0 0 0' }}>
                              Scale point size by numeric measure
                            </p>
                          </div>

                          {/* Tips */}
                          <div style={{
                            marginTop: '24px',
                            padding: '16px',
                            backgroundColor: '#eff6ff',
                            borderRadius: '8px',
                            fontSize: '13px',
                            color: '#1e40af',
                            border: '1px solid #93c5fd'
                          }}>
                            <div style={{ fontWeight: 600, marginBottom: '8px' }}>💡 Pro Tips:</div>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                              <li>Use trend lines to identify correlations</li>
                              <li>Color by category to compare segments</li>
                              <li>Size by measure to show 3rd dimension</li>
                              <li>Reduce opacity when points overlap</li>
                            </ul>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Bar Configuration Panel */}
                {showBarConfig && charts.find(c => c.id === showBarConfig) && (() => {
                  const chart = charts.find(c => c.id === showBarConfig)!;
                  const config = chart.barConfig || {
                    orientation: 'vertical',
                    showLabels: false,
                    showGrid: true,
                    barWidth: 40,
                    sortBy: 'none',
                    aggregation: 'sum',
                    colors: COLORS
                  };

                  return (
                    <div style={{
                      flex: '0 0 35%',
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      padding: '24px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      maxHeight: '700px',
                      overflowY: 'auto',
                      position: 'sticky',
                      top: '20px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
                          📊 Bar Chart Settings
                        </h3>
                        <button onClick={() => setShowBarConfig(null)} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280', padding: '4px' }}>✕</button>
                      </div>

                      {/* Orientation */}
                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '12px' }}>Orientation</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {[
                            { value: 'vertical', icon: '📊', label: 'Vertical' },
                            { value: 'horizontal', icon: '📉', label: 'Horizontal' }
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => handleUpdateBarConfig(chart.id, { orientation: opt.value as any })}
                              style={{
                                padding: '10px',
                                backgroundColor: config.orientation === opt.value ? '#6366f1' : 'white',
                                color: config.orientation === opt.value ? 'white' : '#374151',
                                border: `2px solid ${config.orientation === opt.value ? '#6366f1' : '#d1d5db'}`,
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              {opt.icon} {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sort By */}
                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>Sort By</label>
                        <select value={config.sortBy} onChange={(e) => handleUpdateBarConfig(chart.id, { sortBy: e.target.value as any })} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: 'white', cursor: 'pointer' }}>
                          <option value="none">None</option>
                          <option value="ascending">Ascending ↑</option>
                          <option value="descending">Descending ↓</option>
                        </select>
                      </div>

                      {/* Aggregation */}
                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>Aggregation</label>
                        <select value={config.aggregation} onChange={(e) => handleUpdateBarConfig(chart.id, { aggregation: e.target.value as any })} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', backgroundColor: 'white', cursor: 'pointer' }}>
                          <option value="sum">Sum</option>
                          <option value="avg">Average</option>
                          <option value="count">Count</option>
                          <option value="min">Minimum</option>
                          <option value="max">Maximum</option>
                        </select>
                      </div>

                      {/* Bar Width */}
                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                          <span>Bar Width</span>
                          <span style={{ color: '#6b7280', fontSize: '13px' }}>{config.barWidth}%</span>
                        </label>
                        <input type="range" min="20" max="100" value={config.barWidth} onChange={(e) => handleUpdateBarConfig(chart.id, { barWidth: Number(e.target.value) })} style={{ width: '100%', accentColor: '#6366f1' }} />
                      </div>

                      {/* Toggles */}
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.showLabels} onChange={(e) => handleUpdateBarConfig(chart.id, { showLabels: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#6366f1' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Labels</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={config.showGrid} onChange={(e) => handleUpdateBarConfig(chart.id, { showGrid: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#6366f1' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Grid</span>
                        </label>
                      </div>
                    </div>
                  );
                })()}

                {/* Pie Configuration Panel */}
                {showPieConfig && charts.find(c => c.id === showPieConfig) && (() => {
                  const chart = charts.find(c => c.id === showPieConfig)!;
                  const config = chart.pieConfig || {
                    showLabels: true,
                    showPercentages: true,
                    showLegend: true,
                    innerRadius: 0,
                    sortSlices: true,
                    colors: COLORS
                  };

                  return (
                    <div style={{
                      flex: '0 0 35%',
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      padding: '24px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      maxHeight: '700px',
                      overflowY: 'auto',
                      position: 'sticky',
                      top: '20px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
                          🥧 Pie Chart Settings
                        </h3>
                        <button onClick={() => setShowPieConfig(null)} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280', padding: '4px' }}>✕</button>
                      </div>

                      {/* Inner Radius (Donut) */}
                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                          <span>Inner Radius (Donut Effect)</span>
                          <span style={{ color: '#6b7280', fontSize: '13px' }}>{config.innerRadius}%</span>
                        </label>
                        <input type="range" min="0" max="70" value={config.innerRadius} onChange={(e) => handleUpdatePieConfig(chart.id, { innerRadius: Number(e.target.value) })} style={{ width: '100%', accentColor: '#f59e0b' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                          <span>Pie</span>
                          <span>Donut</span>
                        </div>
                      </div>

                      {/* Toggles */}
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.showLabels} onChange={(e) => handleUpdatePieConfig(chart.id, { showLabels: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#f59e0b' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Labels</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.showPercentages} onChange={(e) => handleUpdatePieConfig(chart.id, { showPercentages: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#f59e0b' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Percentages</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.showLegend} onChange={(e) => handleUpdatePieConfig(chart.id, { showLegend: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#f59e0b' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Legend</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={config.sortSlices} onChange={(e) => handleUpdatePieConfig(chart.id, { sortSlices: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#f59e0b' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Sort Slices by Value</span>
                        </label>
                      </div>

                      <div style={{ padding: '16px', backgroundColor: '#fffbeb', borderRadius: '8px', fontSize: '13px', color: '#92400e', border: '1px solid #fcd34d' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>💡 Best Practices:</div>
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                          <li>Use for 5-7 categories maximum</li>
                          <li>Start largest slice at 12 o'clock</li>
                          <li>Use donut charts to add central label</li>
                        </ul>
                      </div>
                    </div>
                  );
                })()}

                {/* Line Configuration Panel */}
                {showLineConfig && charts.find(c => c.id === showLineConfig) && (() => {
                  const chart = charts.find(c => c.id === showLineConfig)!;
                  const config = chart.lineConfig || {
                    showPoints: true,
                    showLabels: false,
                    showGrid: true,
                    lineWidth: 2,
                    curveType: 'linear',
                    showArea: false,
                    colors: COLORS
                  };

                  return (
                    <div style={{
                      flex: '0 0 35%',
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      padding: '24px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      maxHeight: '700px',
                      overflowY: 'auto',
                      position: 'sticky',
                      top: '20px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
                          📈 Line Chart Settings
                        </h3>
                        <button onClick={() => setShowLineConfig(null)} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280', padding: '4px' }}>✕</button>
                      </div>

                      {/* Curve Type */}
                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '12px' }}>Curve Type</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {[
                            { value: 'linear', icon: '📏', label: 'Linear' },
                            { value: 'smooth', icon: '〰️', label: 'Smooth' }
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => handleUpdateLineConfig(chart.id, { curveType: opt.value as any })}
                              style={{
                                padding: '10px',
                                backgroundColor: config.curveType === opt.value ? '#ec4899' : 'white',
                                color: config.curveType === opt.value ? 'white' : '#374151',
                                border: `2px solid ${config.curveType === opt.value ? '#ec4899' : '#d1d5db'}`,
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              {opt.icon} {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Line Width */}
                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                          <span>Line Width</span>
                          <span style={{ color: '#6b7280', fontSize: '13px' }}>{config.lineWidth}px</span>
                        </label>
                        <input type="range" min="1" max="5" value={config.lineWidth} onChange={(e) => handleUpdateLineConfig(chart.id, { lineWidth: Number(e.target.value) })} style={{ width: '100%', accentColor: '#ec4899' }} />
                      </div>

                      {/* Toggles */}
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fce7f3', borderRadius: '8px', border: '1px solid #f9a8d4' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.showPoints} onChange={(e) => handleUpdateLineConfig(chart.id, { showPoints: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#ec4899' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Data Points</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.showLabels} onChange={(e) => handleUpdateLineConfig(chart.id, { showLabels: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#ec4899' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Labels</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.showGrid} onChange={(e) => handleUpdateLineConfig(chart.id, { showGrid: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#ec4899' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Grid</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={config.showArea} onChange={(e) => handleUpdateLineConfig(chart.id, { showArea: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#ec4899' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Fill Area Below Line</span>
                        </label>
                      </div>
                    </div>
                  );
                })()}

                {/* Area Configuration Panel */}
                {showAreaConfig && charts.find(c => c.id === showAreaConfig) && (() => {
                  const chart = charts.find(c => c.id === showAreaConfig)!;
                  const config = chart.areaConfig || {
                    stacked: false,
                    showPoints: false,
                    showLabels: false,
                    showGrid: true,
                    fillOpacity: 0.6,
                    colors: COLORS
                  };

                  return (
                    <div style={{
                      flex: '0 0 35%',
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      padding: '24px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      maxHeight: '700px',
                      overflowY: 'auto',
                      position: 'sticky',
                      top: '20px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
                          📉 Area Chart Settings
                        </h3>
                        <button onClick={() => setShowAreaConfig(null)} style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280', padding: '4px' }}>✕</button>
                      </div>

                      {/* Fill Opacity */}
                      <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                          <span>Fill Opacity</span>
                          <span style={{ color: '#6b7280', fontSize: '13px' }}>{Math.round(config.fillOpacity * 100)}%</span>
                        </label>
                        <input type="range" min="0.1" max="1" step="0.1" value={config.fillOpacity} onChange={(e) => handleUpdateAreaConfig(chart.id, { fillOpacity: Number(e.target.value) })} style={{ width: '100%', accentColor: '#8b5cf6' }} />
                      </div>

                      {/* Toggles */}
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f3e8ff', borderRadius: '8px', border: '1px solid #c084fc' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.stacked} onChange={(e) => handleUpdateAreaConfig(chart.id, { stacked: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#8b5cf6' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Stacked Areas</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.showPoints} onChange={(e) => handleUpdateAreaConfig(chart.id, { showPoints: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#8b5cf6' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Data Points</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                          <input type="checkbox" checked={config.showLabels} onChange={(e) => handleUpdateAreaConfig(chart.id, { showLabels: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#8b5cf6' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Labels</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={config.showGrid} onChange={(e) => handleUpdateAreaConfig(chart.id, { showGrid: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#8b5cf6' }} />
                          <span style={{ fontSize: '14px', color: '#111827' }}>Show Grid</span>
                        </label>
                      </div>

                      <div style={{ padding: '16px', backgroundColor: '#faf5ff', borderRadius: '8px', fontSize: '13px', color: '#6b21a8', border: '1px solid #d8b4fe' }}>
                        <div style={{ fontWeight: 600, marginBottom: '8px' }}>💡 Best Practices:</div>
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                          <li>Use for cumulative data over time</li>
                          <li>Stack to show part-to-whole trends</li>
                          <li>Adjust opacity when areas overlap</li>
                        </ul>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Global Filters */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔍 Global Filters
              </h3>
              <GlobalFilterPanel
                availableColumns={selectedDatasets.flatMap(ds => {
                  const details = allDatasetDetails.find((d: any) => d.id === ds.id);
                  const columns = details?.schema_info?.columns || [];
                  return columns.map((c: any) => ({
                    column: c.name,
                    datasetId: ds.id,
                    datasetName: ds.name,
                    type: c.type
                  }));
                })}
                filters={globalFilters}
                onFiltersChange={setGlobalFilters}
                onApplyFilters={() => console.log('Filters applied:', globalFilters)}
              />
            </div>

            {/* Date Range Filter */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📅 Date Range
              </h3>
              <DateRangeFilter
                onDateRangeChange={(start: Date | null, end: Date | null) => setDateRange({ start, end })}
                initialStartDate={dateRange.start}
                initialEndDate={dateRange.end}
              />
              <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px', fontSize: '13px', color: '#6b7280' }}>
                💡 Apply date filters to all charts at once
              </div>
            </div>

            {/* Calculated Fields - Full Width */}
            <div style={{ gridColumn: '1 / -1', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
              <CalculatedFieldsEditor
                columns={selectedDatasets.flatMap(ds => 
                  (allDatasetDetails.find((d: any) => d.id === ds.id)?.schema_info?.columns || []).map((c: any) => c.name)
                )}
                calculatedFields={calculatedFields}
                onChange={setCalculatedFields}
              />
            </div>

            {/* Dataset Joins - Full Width */}
            <div style={{ gridColumn: '1 / -1', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
              <DatasetJoinEditor
                datasets={selectedDatasets.map(ds => {
                  const details = allDatasetDetails.find((d: any) => d.id === ds.id);
                  return {
                    id: ds.id,
                    name: ds.name,
                    columns: (details?.schema_info?.columns || []).map((c: any) => c.name)
                  };
                })}
                joins={datasetJoins}
                onChange={setDatasetJoins}
              />
            </div>
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
              <h3 style={{ fontSize: '24px', fontWeight: 600, color: '#111827', marginBottom: '24px' }}>
                📤 Export & Share Dashboard
              </h3>
              
              {charts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                  <p style={{ fontSize: '16px', color: '#6b7280' }}>
                    Create some charts first to export your dashboard
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Save Dashboard */}
                  <div style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                          💾 Save Dashboard
                        </h4>
                        <p style={{ fontSize: '14px', color: '#6b7280' }}>
                          Save your dashboard with {charts.length} chart{charts.length !== 1 ? 's' : ''} to your workspace
                        </p>
                      </div>
                      <button
                        onClick={() => setShowSaveModal(true)}
                        disabled={saveDashboardMutation.isPending}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#4f46e5',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: saveDashboardMutation.isPending ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          opacity: saveDashboardMutation.isPending ? 0.6 : 1
                        }}
                      >
                        {saveDashboardMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {/* Export as PDF */}
                  <div style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                          📄 Export as PDF
                        </h4>
                        <p style={{ fontSize: '14px', color: '#6b7280' }}>
                          Download your dashboard as a PDF document
                        </p>
                      </div>
                      <button
                        onClick={() => alert('PDF export coming soon!')}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: 'white',
                          color: '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Export PDF
                      </button>
                    </div>
                  </div>

                  {/* Export as Image */}
                  <div style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                          🖼️ Export as Image
                        </h4>
                        <p style={{ fontSize: '14px', color: '#6b7280' }}>
                          Save your dashboard as PNG or JPEG
                        </p>
                      </div>
                      <button
                        onClick={() => alert('Image export coming soon!')}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: 'white',
                          color: '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Export Image
                      </button>
                    </div>
                  </div>

                  {/* Share Link */}
                  <div style={{ padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                          🔗 Share Link
                        </h4>
                        <p style={{ fontSize: '14px', color: '#6b7280' }}>
                          Generate a shareable link to this dashboard
                        </p>
                      </div>
                      <button
                        onClick={() => alert('Share feature coming soon!')}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: 'white',
                          color: '#374151',
                          border: '1px solid #d1d5db',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Share
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save Dashboard Modal */}
      {showSaveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '24px' }}>
              💾 Save as Dashboard
            </h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                Dashboard Name *
              </label>
              <input
                type="text"
                value={dashboardName}
                onChange={(e) => setDashboardName(e.target.value)}
                placeholder="e.g., Sales Analytics Q4 2024"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#4f46e5'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
                Description (optional)
              </label>
              <textarea
                value={dashboardDescription}
                onChange={(e) => setDashboardDescription(e.target.value)}
                placeholder="Add a description for your dashboard..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'vertical'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#4f46e5'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#d1d5db'}
              />
            </div>

            <div style={{
              padding: '12px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              marginBottom: '24px',
              fontSize: '13px',
              color: '#6b7280'
            }}>
              📊 This dashboard will include <strong style={{ color: '#111827' }}>{charts.length}</strong> chart{charts.length !== 1 ? 's' : ''}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setDashboardName('');
                  setDashboardDescription('');
                }}
                disabled={saveDashboardMutation.isPending}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: saveDashboardMutation.isPending ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  opacity: saveDashboardMutation.isPending ? 0.6 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDashboard}
                disabled={saveDashboardMutation.isPending}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saveDashboardMutation.isPending ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  opacity: saveDashboardMutation.isPending ? 0.6 : 1
                }}
              >
                {saveDashboardMutation.isPending ? 'Saving...' : 'Save Dashboard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};