import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { dashboardService } from '../services/dashboardService';
import { datasetService } from '../services/datasetService';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area, ScatterChart, Scatter, ZAxis, LabelList, FunnelChart, Funnel } from 'recharts';
import { ProgressiveXYChart } from '../components/ProgressiveXYChart';
import { GaugeChart } from '../components/GaugeChart';
import { FunnelChart as FunnelChartComponent } from '../components/FunnelChart';
import { ScatterPlot } from '../components/ScatterPlot';

const toNumber = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const isFiniteNumber = (v: any): v is number => typeof v === 'number' && Number.isFinite(v);

const SavedTableChart: React.FC<{
  dashboardId: string;
  chartId: string;
  cfg: Record<string, any>;
}> = ({ dashboardId, chartId, cfg }) => {
  const visibleCols = Array.isArray(cfg.tableVisibleColumns) ? cfg.tableVisibleColumns.filter((c: any) => typeof c === 'string') : [];
  const requestedColumns = visibleCols.length > 0 ? visibleCols.join(',') : undefined;

  const tableDense = typeof cfg.tableDense === 'boolean' ? cfg.tableDense : false;
  const tableWrap = typeof cfg.tableWrap === 'boolean' ? cfg.tableWrap : false;
  const tableFullData = typeof cfg.tableFullData === 'boolean' ? cfg.tableFullData : false;
  const rawRowLimit = toNumber(cfg.tableRowLimit);
  const totalLimit = tableFullData ? Number.POSITIVE_INFINITY : (rawRowLimit !== null ? Math.max(10, Math.round(rawRowLimit)) : 200);
  const pageSize = 200;
  const tableSortColumn = typeof cfg.tableSortColumn === 'string' ? cfg.tableSortColumn : '';
  const tableSortDir = cfg.tableSortDir === 'desc' ? 'desc' : 'asc';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const [columns, setColumns] = useState<string[]>(visibleCols);
  const [rows, setRows] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resetKey = useMemo(() => {
    return JSON.stringify({
      requestedColumns,
      pageSize,
      tableFullData,
      totalLimit,
      tableSortColumn,
      tableSortDir,
      tableDense,
      tableWrap,
      tableEnableAggregation: !!cfg.tableEnableAggregation,
      tableGroupByColumns: Array.isArray(cfg.tableGroupByColumns) ? cfg.tableGroupByColumns : [],
      tableMetrics: Array.isArray(cfg.tableMetrics) ? cfg.tableMetrics : [],
    });
  }, [requestedColumns, pageSize, tableFullData, totalLimit, tableSortColumn, tableSortDir, tableDense, tableWrap]);

  const loadMore = async () => {
    if (loadingRef.current) return;
    if (!hasMore) return;

    if (rows.length >= totalLimit) {
      setHasMore(false);
      return;
    }

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const remaining = Number.isFinite(totalLimit) ? Math.max(0, totalLimit - rows.length) : pageSize;
      const limit = Math.max(1, Math.min(pageSize, remaining));
      const resp = await dashboardService.getChartAggregatedData(dashboardId, chartId, {
        columns: requestedColumns,
        offset,
        limit,
        sortColumn: tableSortColumn || undefined,
        sortDir: tableSortColumn ? tableSortDir : undefined,
      });

      const nextRows: any[] = Array.isArray(resp?.data) ? resp.data : [];
      const nextCols: string[] = Array.isArray(resp?.columns) ? resp.columns : [];

      if (nextCols.length > 0) setColumns(nextCols);
      setRows((prev) => prev.concat(nextRows));
      setOffset((prev) => prev + nextRows.length);
      if (nextRows.length < limit || (Number.isFinite(totalLimit) && (rows.length + nextRows.length) >= totalLimit)) {
        setHasMore(false);
      }
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Failed to load table data');
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Reset and fetch first page when config affecting the table changes
    setColumns(visibleCols);
    setRows([]);
    setOffset(0);
    setHasMore(true);
    setError(null);

    // Fire and forget; guarded by loadingRef
    void (async () => {
      await loadMore();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, dashboardId, resetKey]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < 120) {
      void loadMore();
    }
  };

  if (error) {
    return (
      <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '20px', color: '#dc2626', fontSize: '12px' }}>
        {error}
      </div>
    );
  }

  if (rows.length === 0 && isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>Loading…</div>
    );
  }

  if (rows.length === 0) {
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

  const tableColumns = (columns.length > 0 ? columns : Object.keys(rows[0] || {})).filter((c) => typeof c === 'string');

  console.log('SavedTableChart render:', {
    dashboardId,
    chartId,
    rowCount: rows.length,
    hasMore,
    containerHeight: containerRef.current?.clientHeight,
    scrollHeight: containerRef.current?.scrollHeight
  });

  return (
    <div 
      ref={containerRef} 
      onScroll={onScroll} 
      style={{ 
        overflowX: 'auto', 
        maxHeight: '100%',
        height: '100%',
        overflowY: 'auto',
        position: 'relative'
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: tableDense ? '11px' : '13px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
            {tableColumns.map((col: string, idx: number) => (
              <th
                key={idx}
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  borderBottom: '2px solid #e2e8f0',
                  fontWeight: 600,
                  color: '#0f172a',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, rowIdx: number) => (
            <tr
              key={rowIdx}
              style={{
                borderBottom: '1px solid #f1f5f9',
                backgroundColor: rowIdx % 2 === 0 ? 'white' : '#f8fafc',
              }}
            >
              {tableColumns.map((col: string, colIdx: number) => (
                <td
                  key={colIdx}
                  style={{
                    padding: tableDense ? '6px 10px' : '10px 12px',
                    color: '#475569',
                    whiteSpace: tableWrap ? 'normal' : 'nowrap',
                    maxWidth: tableWrap ? '640px' : '320px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {String(row?.[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: '#64748b', backgroundColor: '#f8fafc' }}>
        {isLoading
          ? 'Loading more…'
          : hasMore
            ? `Scroll to load more (loaded ${rows.length}${Number.isFinite(totalLimit) ? `/${totalLimit}` : ''})`
            : `Loaded ${rows.length}${Number.isFinite(totalLimit) ? `/${totalLimit}` : ''}`}
      </div>
    </div>
  );
};

const DashboardViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we're viewing as an insight (single-chart dashboard)
  const isInsightView = location.pathname.startsWith('/insights/');

  const [tab, setTab] = useState<'query' | 'preview' | 'config'>('config');

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
          // Progressive charts fetch incrementally on scroll (avoid loading all points up-front)
          if (chart.chart_type === 'bar' || chart.chart_type === 'line' || chart.chart_type === 'area') {
            return {
              chartId: chart.id,
              data: null,
              columns: [],
              progressive: true,
            };
          }

          // Table charts fetch incrementally on scroll (avoid loading all rows up-front)
          if (chart.chart_type === 'table') {
            return {
              chartId: chart.id,
              data: null,
              columns: [],
              progressive: true,
            };
          }

          // ✅ USE SERVER-SIDE AGGREGATED DATA
          // This fetches pre-aggregated data (10-100 rows) instead of full dataset (100K rows)
          // Dramatically improves performance:
          // - Network: 100MB → 1KB (99.9% reduction)
          // - Memory: 100K objects → 20 objects
          // - Speed: 100x faster rendering
          const cfg = (chart.config || {}) as Record<string, any>;
          let requestedColumns: string | undefined;
          const cols = new Set<string>();
          if (chart.chart_type === 'scatter') {
            const scatterCfg = (cfg.scatterConfig || {}) as Record<string, any>;
            if (typeof chart.x_column === 'string' && chart.x_column) cols.add(chart.x_column);
            if (typeof chart.y_column === 'string' && chart.y_column) cols.add(chart.y_column);
            const colorBy = (typeof cfg.scatterColorBy === 'string' && cfg.scatterColorBy)
              ? cfg.scatterColorBy
              : (typeof scatterCfg.colorByColumn === 'string' ? scatterCfg.colorByColumn : '');
            const sizeBy = (typeof cfg.scatterSizeBy === 'string' && cfg.scatterSizeBy)
              ? cfg.scatterSizeBy
              : (typeof scatterCfg.sizeByColumn === 'string' ? scatterCfg.sizeByColumn : '');
            if (colorBy) cols.add(colorBy);
            if (sizeBy) cols.add(sizeBy);
          } else if (chart.chart_type === 'pie' || chart.chart_type === 'donut' || chart.chart_type === 'funnel') {
            const xCol = (typeof chart.x_column === 'string' && chart.x_column) ? chart.x_column : (typeof cfg.xAxis === 'string' ? cfg.xAxis : '');
            const yCol = (typeof chart.y_column === 'string' && chart.y_column) ? chart.y_column : (typeof cfg.yAxis === 'string' ? cfg.yAxis : '');
            if (xCol) cols.add(xCol);
            if (yCol) cols.add(yCol);
          } else if (chart.chart_type === 'radar') {
            const xCol = (typeof chart.x_column === 'string' && chart.x_column) ? chart.x_column : (typeof cfg.xAxis === 'string' ? cfg.xAxis : '');
            const yCol = (typeof chart.y_column === 'string' && chart.y_column) ? chart.y_column : (typeof cfg.yAxis === 'string' ? cfg.yAxis : '');
            if (xCol) cols.add(xCol);
            if (yCol) cols.add(yCol);

            const yAxes = Array.isArray(cfg.yAxes) ? cfg.yAxes.filter((c: any) => typeof c === 'string' && c.trim()) : [];
            for (const c of yAxes) cols.add(c);

            const radarSeriesBy = typeof cfg.radarSeriesBy === 'string' ? cfg.radarSeriesBy : (typeof cfg.seriesBy === 'string' ? cfg.seriesBy : '');
            if (radarSeriesBy) cols.add(radarSeriesBy);
          } else if (chart.chart_type === 'gauge' || chart.chart_type === 'kpi') {
            const yCol = (typeof chart.y_column === 'string' && chart.y_column) ? chart.y_column : (typeof cfg.yAxis === 'string' ? cfg.yAxis : '');
            if (yCol) cols.add(yCol);
            const sortCol = typeof cfg.gaugeSortByColumn === 'string' ? cfg.gaugeSortByColumn : '';
            if (sortCol) cols.add(sortCol);
          }
          if (cols.size > 0) requestedColumns = Array.from(cols).join(',');

          const data = await dashboardService.getChartAggregatedData(id!, chart.id, requestedColumns ? { columns: requestedColumns } : undefined);
          return {
            chartId: chart.id,
            data: data.data,  // Already aggregated on server!
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

  const sqlInsight = useMemo(() => {
    // Only show insight view if the dashboard is marked as an insight
    // Regular dashboards (even with 1 chart) should use dashboard view
    if (!dashboard || !dashboard.is_insight) return null;
    if (dashboard.charts?.length !== 1) return null;
    
    const chart = dashboard.charts[0];
    const sql = chart?.config?.sql_query;
    if (!chart || !sql) return null;
    
    console.log('Detected SQL Insight:', { 
      dashboardId: dashboard.id, 
      chartCount: dashboard.charts.length,
      hasSqlQuery: !!sql,
      isInsight: dashboard.is_insight
    });
    
    return { dashboard, chart, sql: String(sql) };
  }, [dashboard]);

  const previewQuery = useQuery({
    queryKey: ['dataset-preview', sqlInsight?.chart?.dataset_id],
    queryFn: () => datasetService.getDatasetPreview(sqlInsight!.chart.dataset_id, 100),
    enabled: !!sqlInsight?.chart?.dataset_id && tab === 'preview',
    retry: false,
  });

  const renderChart = (chart: any, chartData: any) => {
    const cfg = chart.config || {};
    
    // Table charts are paginated/infinite-scroll; do not rely on the dashboard-wide prefetch.
    if (chart.chart_type === 'table') {
      return <SavedTableChart dashboardId={id!} chartId={chart.id} cfg={cfg} />;
    }

    // Progressive scroll-based loading for bar/line/area (horizontal scroll for vertical orientation,
    // vertical scroll for horizontal orientation)
    if (chart.chart_type === 'bar' || chart.chart_type === 'line' || chart.chart_type === 'area') {
      const orientation = (cfg.barOrientation || cfg.orientation || 'vertical') as 'vertical' | 'horizontal';
      return (
        <ProgressiveXYChart
          chart={chart}
          dashboardId={id!}
          orientation={orientation}
        />
      );
    }

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

    const colors = ['#4f46e5', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#a855f7', '#14b8a6', '#eab308'];
    const data = chartData.data || [];
    
    // Debug logs removed
    
    // Pie / Donut
    if (chart.chart_type === 'pie' || chart.chart_type === 'donut') {
      const xCol: string | undefined = chart.x_column || (typeof cfg.xAxis === 'string' ? cfg.xAxis : undefined);
      const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined);
      if (!xCol || !yCol) {
        return (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ color: '#dc2626', fontSize: '14px' }}>Invalid chart configuration - missing category/value</div>
          </div>
        );
      }

      const pieAggregation = typeof cfg.pieAggregation === 'string' ? cfg.pieAggregation : 'sum';
      const pieSortOrder = typeof cfg.pieSortOrder === 'string' ? cfg.pieSortOrder : 'value_desc';
      const rawTopN = toNumber(cfg.pieTopN);
      const pieTopN = rawTopN !== null ? Math.max(0, Math.round(rawTopN)) : 8;
      const pieGroupOther = typeof cfg.pieGroupOther === 'boolean' ? cfg.pieGroupOther : true;
      const rawInnerRadius = toNumber(cfg.donutInnerRadius);
      const donutInnerRadius = rawInnerRadius !== null ? rawInnerRadius : 70;
      const pieLabelMode = typeof cfg.pieLabelMode === 'string' ? cfg.pieLabelMode : 'percent';
      const showLegend = typeof cfg.showLegend === 'boolean' ? cfg.showLegend : true;
      const showDataLabels = typeof cfg.showDataLabels === 'boolean' ? cfg.showDataLabels : false;

      type Stats = { sum: number; count: number; min: number | null; max: number | null };
      const statsByName = new Map<string, Stats>();
      const ensure = (k: string): Stats => {
        const e = statsByName.get(k);
        if (e) return e;
        const s: Stats = { sum: 0, count: 0, min: null, max: null };
        statsByName.set(k, s);
        return s;
      };

      for (const r of data as any[]) {
        const name = String(r?.[xCol] ?? '').trim();
        if (!name) continue;
        const s = ensure(name);
        if (pieAggregation === 'count') {
          s.count += 1;
          continue;
        }
        const n = toNumber(r?.[yCol]);
        if (n === null) continue;
        s.sum += n;
        s.count += 1;
        s.min = s.min === null ? n : Math.min(s.min, n);
        s.max = s.max === null ? n : Math.max(s.max, n);
      }

      const compute = (s: Stats): number => {
        switch (pieAggregation) {
          case 'count':
            return s.count;
          case 'sum':
            return s.sum;
          case 'avg':
            return s.count > 0 ? s.sum / s.count : 0;
          case 'min':
            return s.min ?? 0;
          case 'max':
            return s.max ?? 0;
          default:
            return s.sum;
        }
      };

      let pieData = Array.from(statsByName.entries()).map(([name, s]) => ({ name, value: compute(s) }));
      pieData.sort((a, b) => {
        if (pieSortOrder === 'value_desc') return b.value - a.value;
        if (pieSortOrder === 'value_asc') return a.value - b.value;
        if (pieSortOrder === 'label_desc') return b.name.localeCompare(a.name);
        return a.name.localeCompare(b.name);
      });

      if (pieTopN > 0 && pieData.length > pieTopN) {
        const top = pieData.slice(0, pieTopN);
        const rest = pieData.slice(pieTopN);
        if (pieGroupOther) {
          const otherValue = rest.reduce((acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0), 0);
          if (otherValue > 0) top.push({ name: 'Other', value: otherValue });
        }
        pieData = top;
      }

      const total = pieData.reduce((acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0), 0);
      const labelFn = (props: any) => {
        if (pieLabelMode === 'none') return '';
        const name = String(props?.name ?? '');
        const value = Number(props?.value ?? 0);
        const percent = Number(props?.percent ?? 0);
        if (pieLabelMode === 'percent') return `${Math.round(percent * 100)}%`;
        if (pieLabelMode === 'value') return `${value.toLocaleString()}`;
        if (pieLabelMode === 'both') return `${name}: ${value.toLocaleString()} (${Math.round(percent * 100)}%)`;
        return '';
      };

      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip />
            {showLegend ? <Legend /> : null}
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              innerRadius={chart.chart_type === 'donut' ? donutInnerRadius : 0}
              outerRadius={110}
              paddingAngle={2}
              label={showDataLabels && pieLabelMode !== 'none' ? labelFn : false}
              labelLine={showDataLabels && pieLabelMode !== 'none'}
            >
              {pieData.map((_, idx) => (
                <Cell key={idx} fill={colors[idx % colors.length]} />
              ))}
            </Pie>
            {chart.chart_type === 'donut' ? (
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#0f172a" style={{ fontSize: 12, fontWeight: 800 }}>
                {total ? total.toLocaleString() : ''}
              </text>
            ) : null}
          </PieChart>
        </ResponsiveContainer>
      );
    }

    // Scatter
    if (chart.chart_type === 'scatter') {
      const xCol: string | undefined = chart.x_column || (typeof cfg.xAxis === 'string' ? cfg.xAxis : undefined);
      const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined);
      if (!xCol || !yCol) {
        return (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ color: '#dc2626', fontSize: '14px' }}>Invalid chart configuration - missing x/y</div>
          </div>
        );
      }

      const scatterCfg = (cfg.scatterConfig || {}) as Record<string, any>;
      const scatterColorBy = (typeof cfg.scatterColorBy === 'string' && cfg.scatterColorBy)
        ? cfg.scatterColorBy
        : (typeof scatterCfg.colorByColumn === 'string' ? scatterCfg.colorByColumn : '');
      const scatterSizeBy = (typeof cfg.scatterSizeBy === 'string' && cfg.scatterSizeBy)
        ? cfg.scatterSizeBy
        : (typeof scatterCfg.sizeByColumn === 'string' ? scatterCfg.sizeByColumn : '');

      const rawOpacity = toNumber((cfg as any).scatterPointOpacity ?? (scatterCfg as any).pointOpacity);
      const scatterPointOpacity = rawOpacity !== null ? rawOpacity : 0.85;

      const rawMaxSize = toNumber((cfg as any).scatterMaxPointSize);
      const scatterMaxPointSize = rawMaxSize !== null ? rawMaxSize : 70;

      const rawPointSize = toNumber((cfg as any).scatterPointSize ?? (scatterCfg as any).pointSize);
      const scatterPointSize = rawPointSize !== null ? rawPointSize : 8;

      const showLabels = typeof scatterCfg.showLabels === 'boolean' ? scatterCfg.showLabels : false;
      const showTrendLine = typeof scatterCfg.showTrendLine === 'boolean' ? scatterCfg.showTrendLine : false;
      const showLegend = typeof cfg.showLegend === 'boolean' ? cfg.showLegend : true;
      const showGrid = typeof cfg.showGrid === 'boolean' ? cfg.showGrid : true;

      const palette: string[] = Array.isArray(scatterCfg.colors) && scatterCfg.colors.length
        ? scatterCfg.colors
        : colors;

      const cleaned = (data as any[]).filter((r) => {
        const x = toNumber(r?.[xCol]);
        const y = toNumber(r?.[yCol]);
        return x !== null && y !== null;
      });

      const series: Array<{ key: string; label: string; data: any[]; color: string }> = (() => {
        if (!scatterColorBy) return [{ key: 'series', label: 'Series', data: cleaned, color: palette[0] }];
        const groups = new Map<string, any[]>();
        for (const r of cleaned) {
          const k = String((r as any)?.[scatterColorBy] ?? '').trim() || 'Unknown';
          const arr = groups.get(k) ?? [];
          arr.push(r);
          groups.set(k, arr);
        }
        return Array.from(groups.entries()).map(([k, d], idx) => ({ key: k, label: k, data: d, color: palette[idx % palette.length] }));
      })();

      return (
        <ScatterPlot
          data={[]}
          series={series}
          xKey={xCol}
          yKey={yCol}
          sizeKey={scatterSizeBy || undefined}
          height={450}
          showGrid={showGrid}
          showLegend={showLegend}
          pointSize={scatterPointSize}
          pointOpacity={scatterPointOpacity}
          maxPointSize={scatterMaxPointSize}
          showLabels={showLabels}
          showTrendLine={showTrendLine}
          xLabel={xCol}
          yLabel={yCol}
        />
      );
    }

    // Radar
    if (chart.chart_type === 'radar') {
      const xCol: string | undefined = chart.x_column || (typeof cfg.xAxis === 'string' ? cfg.xAxis : undefined);
      const yAxes: string[] = Array.isArray(cfg.yAxes)
        ? cfg.yAxes.filter((c: any) => typeof c === 'string' && c.trim())
        : [];

      const isNonEmptyString = (v: any): v is string => typeof v === 'string' && v.trim().length > 0;

      // Legacy/single-metric fallback (older configs used y_column/yAxis)
      const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined) || (yAxes[0] || undefined);

      const radarAggregation = typeof cfg.radarAggregation === 'string' ? cfg.radarAggregation : 'sum';
      const radarSortOrder = typeof cfg.radarSortOrder === 'string' ? cfg.radarSortOrder : 'value_desc';
      const rawTopN = toNumber(cfg.radarTopN);
      const radarTopN = rawTopN !== null ? Math.max(0, Math.round(rawTopN)) : 10;
      const radarGroupOther = typeof cfg.radarGroupOther === 'boolean' ? cfg.radarGroupOther : false;
      const rawFill = toNumber(cfg.radarFillOpacity);
      const radarFillOpacity = rawFill !== null ? rawFill : 0.15;
      // Debug log removed
      const showLegend = typeof cfg.showLegend === 'boolean' ? cfg.showLegend : true;

      const showGrid = typeof cfg.showGrid === 'boolean' ? cfg.showGrid : true;

      const hasMultiY = yAxes.length > 1;

      const radarNormalizeMetrics = typeof (cfg as any).radarNormalizeMetrics === 'boolean'
        ? (cfg as any).radarNormalizeMetrics
        : true;

      const radarUsePerMetricAggregation = typeof (cfg as any).radarUsePerMetricAggregation === 'boolean' ? (cfg as any).radarUsePerMetricAggregation : false;
      const radarMetricAggregations = (() => {
        const raw = (cfg as any).radarMetricAggregations;
        if (!raw || typeof raw !== 'object') return {} as Record<string, any>;
        return raw as Record<string, any>;
      })();
      const normalizeRadarAgg = (v: any): 'sum' | 'avg' | 'min' | 'max' | 'count' | undefined => {
        return v === 'sum' || v === 'avg' || v === 'min' || v === 'max' || v === 'count' ? v : undefined;
      };
      const radarAxisMode = (typeof cfg.radarAxisMode === 'string' && (cfg.radarAxisMode === 'categories' || cfg.radarAxisMode === 'metrics'))
        ? (cfg.radarAxisMode as 'categories' | 'metrics')
        : (hasMultiY ? 'metrics' : 'categories');
      const radarSeriesBy = typeof cfg.radarSeriesBy === 'string' ? cfg.radarSeriesBy : (typeof cfg.seriesBy === 'string' ? cfg.seriesBy : '');

      // Validation depends on axis mode:
      // - categories: need x + single y
      // - metrics: need x + at least one metric (yAxes or yCol)
      if (!xCol || (radarAxisMode === 'categories' && !yCol) || (radarAxisMode === 'metrics' && !(yAxes.length > 0 || yCol))) {
        return (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ color: '#dc2626', fontSize: '14px' }}>
              Invalid chart configuration - missing required columns
            </div>
          </div>
        );
      }

      // After validation above, these are safe to use.
      const xColResolved = xCol;
      const yColResolved = yCol;

      type Stats = { sum: number; count: number; min: number | null; max: number | null };
      const computeValue = (agg: 'sum' | 'avg' | 'min' | 'max' | 'count', sum: number, count: number, min: number | null, max: number | null): number => {
        switch (agg) {
          case 'count':
            return count;
          case 'sum':
            return sum;
          case 'avg':
            return count > 0 ? sum / count : 0;
          case 'min':
            return min ?? 0;
          case 'max':
            return max ?? 0;
          default:
            return sum;
        }
      };

      const prepared = (() => {
        // Mode A: axes are categories (xCol); series are groups (radarSeriesBy)
        if (radarAxisMode === 'categories') {
          const statsBy = new Map<string, Map<string, Stats>>();
          const ensure = (category: string, seriesKey: string): Stats => {
            const cat = statsBy.get(category) ?? new Map<string, Stats>();
            if (!statsBy.has(category)) statsBy.set(category, cat);
            const e = cat.get(seriesKey);
            if (e) return e;
            const s: Stats = { sum: 0, count: 0, min: null, max: null };
            cat.set(seriesKey, s);
            return s;
          };

          const hasSeries = Boolean(radarSeriesBy);
          const seriesSet = new Set<string>();

          // Debug logs removed

          for (const r of data as any[]) {
            const category = String(r?.[xColResolved] ?? '').trim();
            if (!category) continue;
            let seriesKey = hasSeries ? (String(r?.[radarSeriesBy] ?? '').trim() || 'Unknown') : (yColResolved || 'Value');
            // Truncate ISO timestamps at position 19 to remove timezone (match SQL modal behavior)
            if (seriesKey.length > 19 && seriesKey[10] === 'T') {
              seriesKey = seriesKey.substring(0, 19);
            }
            // Debug log removed
            seriesSet.add(seriesKey);
            const s = ensure(category, seriesKey);
            if (radarAggregation === 'count') {
              s.count += 1;
              continue;
            }
            const n = toNumber(r?.[yColResolved as string]);
            if (n === null) continue;
            s.sum += n;
            s.count += 1;
            s.min = s.min === null ? n : Math.min(s.min, n);
            s.max = s.max === null ? n : Math.max(s.max, n);
          }

          const seriesKeys = Array.from(seriesSet);
          const categories = Array.from(statsBy.keys());

          const totals = new Map<string, number>();
          for (const cat of categories) {
            const m = statsBy.get(cat);
            let t = 0;
            if (m) {
              for (const sk of seriesKeys) {
                const s = m.get(sk);
                if (!s) continue;
                t += computeValue(radarAggregation as any, s.sum, s.count, s.min, s.max);
              }
            }
            totals.set(cat, t);
          }

          categories.sort((a, b) => {
            const av = totals.get(a) ?? 0;
            const bv = totals.get(b) ?? 0;
            if (radarSortOrder === 'value_desc') return bv - av;
            if (radarSortOrder === 'value_asc') return av - bv;
            if (radarSortOrder === 'label_desc') return b.localeCompare(a);
            return a.localeCompare(b);
          });

          let kept = categories;
          let rest: string[] = [];
          if (radarTopN > 0 && categories.length > radarTopN) {
            kept = categories.slice(0, radarTopN);
            rest = categories.slice(radarTopN);
          }

          const rowsOut: Array<Record<string, any>> = kept.map((cat) => {
            const row: Record<string, any> = { category: cat };
            const m = statsBy.get(cat);
            for (const sk of seriesKeys) {
              const s = m?.get(sk);
              row[sk] = s ? computeValue(radarAggregation as any, s.sum, s.count, s.min, s.max) : 0;
            }
            return row;
          });

          // Debug logs removed

          if (radarGroupOther && rest.length > 0) {
            const other: Record<string, any> = { category: 'Other' };
            for (const sk of seriesKeys) other[sk] = 0;
            for (const cat of rest) {
              const m = statsBy.get(cat);
              for (const sk of seriesKeys) {
                const s = m?.get(sk);
                if (!s) continue;
                other[sk] += computeValue(radarAggregation as any, s.sum, s.count, s.min, s.max);
              }
            }
            rowsOut.push(other);
          }

          return { axisKey: 'category' as const, data: rowsOut, seriesKeys };
        }

        // Mode B: axes are metrics (yAxes); series are groups (radarSeriesBy default xCol)
        const metrics = (yAxes.length > 0 ? yAxes : [yColResolved]).filter(isNonEmptyString);
        const seriesCol = radarSeriesBy || xColResolved;
        const statsBySeries = new Map<string, Map<string, Stats>>();
        const ensure = (seriesKey: string, metric: string): Stats => {
          const sMap = statsBySeries.get(seriesKey) ?? new Map<string, Stats>();
          if (!statsBySeries.has(seriesKey)) statsBySeries.set(seriesKey, sMap);
          const e = sMap.get(metric);
          if (e) return e;
          const s: Stats = { sum: 0, count: 0, min: null, max: null };
          sMap.set(metric, s);
          return s;
        };

        for (const r of data as any[]) {
          let seriesKey = String(r?.[seriesCol] ?? '').trim() || 'Unknown';
          // Truncate ISO timestamps at position 19 to remove timezone (match SQL modal behavior)
          if (seriesKey.length > 19 && seriesKey[10] === 'T') {
            seriesKey = seriesKey.substring(0, 19);
          }
          for (const metric of metrics) {
            const s = ensure(seriesKey, metric);
            if (radarAggregation === 'count') {
              s.count += 1;
              continue;
            }
            const n = toNumber(r?.[metric]);
            if (n === null) continue;
            s.sum += n;
            s.count += 1;
            s.min = s.min === null ? n : Math.min(s.min, n);
            s.max = s.max === null ? n : Math.max(s.max, n);
          }
        }

        let seriesKeys = Array.from(statsBySeries.keys());
        const totals = new Map<string, number>();
        for (const sk of seriesKeys) {
          const m = statsBySeries.get(sk);
          let t = 0;
          if (m) {
            for (const metric of metrics) {
              const s = m.get(metric);
              if (!s) continue;
              const metricAgg = radarUsePerMetricAggregation ? normalizeRadarAgg(radarMetricAggregations?.[metric]) : undefined;
              const agg = (metricAgg ?? (radarAggregation as any)) as 'sum' | 'avg' | 'min' | 'max' | 'count';
              t += Math.abs(computeValue(agg, s.sum, s.count, s.min, s.max));
            }
          }
          totals.set(sk, t);
        }
        seriesKeys.sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));

        let keptSeries = seriesKeys;
        let restSeries: string[] = [];
        if (radarTopN > 0 && seriesKeys.length > radarTopN) {
          keptSeries = seriesKeys.slice(0, radarTopN);
          restSeries = seriesKeys.slice(radarTopN);
        }

        if (radarGroupOther && restSeries.length > 0) {
          const otherKey = 'Other';
          const otherMap = new Map<string, Stats>();
          for (const metric of metrics) {
            otherMap.set(metric, { sum: 0, count: 0, min: null, max: null });
          }
          for (const sk of restSeries) {
            const m = statsBySeries.get(sk);
            if (!m) continue;
            for (const metric of metrics) {
              const src = m.get(metric);
              const dst = otherMap.get(metric);
              if (!src || !dst) continue;
              dst.sum += src.sum;
              dst.count += src.count;
              dst.min = dst.min === null ? src.min : (src.min === null ? dst.min : Math.min(dst.min, src.min));
              dst.max = dst.max === null ? src.max : (src.max === null ? dst.max : Math.max(dst.max, src.max));
            }
          }
          statsBySeries.set(otherKey, otherMap);
          keptSeries = [...keptSeries, otherKey];
        }

        let hasNegative = false;
        let rowsOut: Array<Record<string, any>> = metrics.map((metric) => {
          const row: Record<string, any> = { metric };
          for (const sk of keptSeries) {
            const s = statsBySeries.get(sk)?.get(metric);
            const metricAgg = radarUsePerMetricAggregation ? normalizeRadarAgg(radarMetricAggregations?.[metric]) : undefined;
            const agg = (metricAgg ?? (radarAggregation as any)) as 'sum' | 'avg' | 'min' | 'max' | 'count';
            const v = s ? computeValue(agg, s.sum, s.count, s.min, s.max) : 0;
            if (v < 0) hasNegative = true;
            row[sk] = v;
          }
          return row;
        });

        const normalized = radarAxisMode === 'metrics' && radarNormalizeMetrics;
        if (normalized) {
          rowsOut = rowsOut.map((row) => {
            let maxAbs = 0;
            for (const sk of keptSeries) {
              const v = toNumber((row as any)[sk]);
              if (v === null) continue;
              maxAbs = Math.max(maxAbs, Math.abs(v));
            }
            if (!maxAbs) return row;
            const next: Record<string, any> = { ...row };
            for (const sk of keptSeries) {
              const v = toNumber((row as any)[sk]);
              next[sk] = v === null ? 0 : v / maxAbs;
            }
            return next;
          });
        }

        return { axisKey: 'metric' as const, data: rowsOut, seriesKeys: keptSeries, normalized, hasNegative: normalized && hasNegative };
      })();

      // Debug log removed

      return (
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart 
            data={prepared.data} 
            margin={{ top: 20, right: 30, left: 30, bottom: 20 }}
          >
            {showGrid ? <PolarGrid stroke="#e2e8f0" /> : null}
            <PolarAngleAxis dataKey={prepared.axisKey} tick={{ fontSize: 12, fill: '#64748b' }} />
            {prepared.normalized ? (
              <PolarRadiusAxis
                angle={90}
                domain={prepared.hasNegative ? [-1, 1] : [0, 1]}
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
            ) : (
              <PolarRadiusAxis angle={90} tick={{ fontSize: 11, fill: '#64748b' }} />
            )}
            {prepared.seriesKeys.map((k, i) => (
              <Radar
                key={k}
                name={k}
                dataKey={k}
                stroke={colors[i % colors.length]}
                fill={colors[i % colors.length]}
                fillOpacity={radarFillOpacity}
                strokeWidth={2}
              />
            ))}
            <Tooltip />
            {showLegend ? <Legend /> : null}
          </RadarChart>
        </ResponsiveContainer>
      );
    }

    // Funnel
    if (chart.chart_type === 'funnel') {
      const xCol: string | undefined = chart.x_column || (typeof cfg.xAxis === 'string' ? cfg.xAxis : undefined);
      const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined);
      if (!xCol || !yCol) {
        return (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ color: '#dc2626', fontSize: '14px' }}>Invalid chart configuration - missing stage/value</div>
          </div>
        );
      }

      const funnelAggregation = typeof cfg.funnelAggregation === 'string' ? cfg.funnelAggregation : 'sum';
      const funnelSortOrder = typeof cfg.funnelSortOrder === 'string' ? cfg.funnelSortOrder : 'value_desc';
      const rawTopN = toNumber(cfg.funnelTopN);
      const funnelTopN = rawTopN !== null ? Math.max(0, Math.round(rawTopN)) : 10;
      const funnelGroupOther = typeof cfg.funnelGroupOther === 'boolean' ? cfg.funnelGroupOther : false;
      const funnelShowPercentOfFirst = typeof cfg.funnelShowPercentOfFirst === 'boolean' ? cfg.funnelShowPercentOfFirst : true;

      type Stats = { sum: number; count: number; min: number | null; max: number | null };
      const statsByStage = new Map<string, Stats>();
      const ensure = (k: string): Stats => {
        const e = statsByStage.get(k);
        if (e) return e;
        const s: Stats = { sum: 0, count: 0, min: null, max: null };
        statsByStage.set(k, s);
        return s;
      };

      for (const r of data as any[]) {
        const stage = String(r?.[xCol] ?? '').trim();
        if (!stage) continue;
        const s = ensure(stage);
        if (funnelAggregation === 'count') {
          s.count += 1;
          continue;
        }
        const n = toNumber(r?.[yCol]);
        if (n === null) continue;
        s.sum += n;
        s.count += 1;
        s.min = s.min === null ? n : Math.min(s.min, n);
        s.max = s.max === null ? n : Math.max(s.max, n);
      }

      const compute = (s: Stats): number => {
        switch (funnelAggregation) {
          case 'count':
            return s.count;
          case 'sum':
            return s.sum;
          case 'avg':
            return s.count > 0 ? s.sum / s.count : 0;
          case 'min':
            return s.min ?? 0;
          case 'max':
            return s.max ?? 0;
          default:
            return s.sum;
        }
      };

      let funnelData = Array.from(statsByStage.entries()).map(([name, s]) => ({ name, value: compute(s) }));
      funnelData.sort((a, b) => {
        if (funnelSortOrder === 'value_desc') return b.value - a.value;
        if (funnelSortOrder === 'value_asc') return a.value - b.value;
        if (funnelSortOrder === 'label_desc') return b.name.localeCompare(a.name);
        return a.name.localeCompare(b.name);
      });

      if (funnelTopN > 0 && funnelData.length > funnelTopN) {
        const top = funnelData.slice(0, funnelTopN);
        const rest = funnelData.slice(funnelTopN);
        if (funnelGroupOther) {
          const otherValue = rest.reduce((acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0), 0);
          if (otherValue > 0) top.push({ name: 'Other', value: otherValue });
        }
        funnelData = top;
      }

      const withPercent = funnelShowPercentOfFirst && funnelData.length > 0;
      const first = withPercent ? (funnelData[0].value || 0) : 0;
      const denom = first > 0 ? first : 0;
      const rendered = withPercent ? funnelData.map((d) => ({ ...d, percent: denom ? d.value / denom : undefined })) : funnelData;

      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 560, maxWidth: '100%' }}>
            <FunnelChartComponent data={rendered} nameKey="name" dataKey="value" colors={colors} height={320} />
            {withPercent && rendered.length > 0 ? (
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#64748b' }}>Showing percent of first stage.</div>
            ) : null}
          </div>
        </div>
      );
    }

    // Gauge/KPI are single-value charts: compute from y_column and saved config.
    // (Do not rely on x_column or generic processedData mapping.)
    if (chart.chart_type === 'gauge' || chart.chart_type === 'kpi') {
      const cfg = (chart.config || {}) as Record<string, any>;
      const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined);

      if (!yCol) {
        return (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ color: '#dc2626', fontSize: '14px' }}>Invalid chart configuration - missing value column</div>
          </div>
        );
      }

      const nums = (data as any[])
        .map((r) => toNumber(r?.[yCol]))
        .filter((n): n is number => n !== null && Number.isFinite(n));

      if (chart.chart_type === 'kpi') {
        const kpiAgg = typeof cfg.kpiAggregation === 'string' ? cfg.kpiAggregation : 'sum';
        const decimals = isFiniteNumber(cfg.kpiDecimals) ? cfg.kpiDecimals : 0;
        const prefix = typeof cfg.kpiPrefix === 'string' ? cfg.kpiPrefix : '';
        const suffix = typeof cfg.kpiSuffix === 'string' ? cfg.kpiSuffix : '';

        let value = 0;
        if (kpiAgg === 'count') {
          value = (data as any[]).length;
        } else if (kpiAgg === 'sum') {
          value = nums.reduce((acc, n) => acc + n, 0);
        } else if (kpiAgg === 'avg') {
          value = nums.length > 0 ? nums.reduce((acc, n) => acc + n, 0) / nums.length : 0;
        } else if (kpiAgg === 'min') {
          value = nums.length > 0 ? Math.min(...nums) : 0;
        } else if (kpiAgg === 'max') {
          value = nums.length > 0 ? Math.max(...nums) : 0;
        }

        const formatted = Number.isFinite(value)
          ? `${prefix}${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
          : '—';

        return (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, marginBottom: '8px' }}>{yCol}</div>
            <div style={{ fontSize: '72px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{formatted}</div>
          </div>
        );
      }

      // Gauge
      const gaugeAgg = typeof cfg.gaugeAggregation === 'string' ? cfg.gaugeAggregation : 'last';
      const gaugeSortByColumn = typeof cfg.gaugeSortByColumn === 'string' ? cfg.gaugeSortByColumn : '';
      const minValue = isFiniteNumber(cfg.gaugeMinValue) ? cfg.gaugeMinValue : 0;
      const useAutoMax = typeof cfg.gaugeUseAutoMax === 'boolean' ? cfg.gaugeUseAutoMax : true;
      const maxValueCfg = isFiniteNumber(cfg.gaugeMaxValue) ? cfg.gaugeMaxValue : 100;
      const decimals = isFiniteNumber(cfg.gaugeDecimals) ? cfg.gaugeDecimals : 0;
      const prefix = typeof cfg.gaugePrefix === 'string' ? cfg.gaugePrefix : '';
      const suffix = typeof cfg.gaugeSuffix === 'string' ? cfg.gaugeSuffix : '';
      const unit = typeof cfg.gaugeUnit === 'string' ? cfg.gaugeUnit : '';
      const thresholdLow = isFiniteNumber(cfg.gaugeThresholdLow) ? cfg.gaugeThresholdLow : 33;
      const thresholdMedium = isFiniteNumber(cfg.gaugeThresholdMedium) ? cfg.gaugeThresholdMedium : 66;
      const showLegend = typeof cfg.gaugeShowLegend === 'boolean' ? cfg.gaugeShowLegend : true;
      const showPercent = typeof cfg.gaugeShowPercent === 'boolean' ? cfg.gaugeShowPercent : true;
      const showValue = typeof cfg.gaugeShowValue === 'boolean' ? cfg.gaugeShowValue : true;

      const compareForSort = (av: any, bv: any) => {
        const an = toNumber(av);
        const bn = toNumber(bv);
        if (an !== null && bn !== null) return an - bn;

        const at = Date.parse(String(av ?? ''));
        const bt = Date.parse(String(bv ?? ''));
        if (Number.isFinite(at) && Number.isFinite(bt)) return at - bt;

        return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      };

      const needsOrdering = (gaugeAgg === 'first' || gaugeAgg === 'last') && !!gaugeSortByColumn;
      const orderedRows = needsOrdering
        ? (data as any[]).slice().sort((a, b) => compareForSort(a?.[gaugeSortByColumn], b?.[gaugeSortByColumn]))
        : (data as any[]);

      const orderedNums = orderedRows
        .map((r) => toNumber(r?.[yCol]))
        .filter((n): n is number => n !== null && Number.isFinite(n));

      let gaugeValue = 0;
      if (gaugeAgg === 'count') {
        gaugeValue = (data as any[]).length;
      } else if (orderedNums.length > 0) {
        if (gaugeAgg === 'first') gaugeValue = orderedNums[0];
        else if (gaugeAgg === 'last') gaugeValue = orderedNums[orderedNums.length - 1];
        else if (gaugeAgg === 'sum') gaugeValue = orderedNums.reduce((acc, n) => acc + n, 0);
        else if (gaugeAgg === 'avg') gaugeValue = orderedNums.reduce((acc, n) => acc + n, 0) / orderedNums.length;
        else if (gaugeAgg === 'min') gaugeValue = Math.min(...orderedNums);
        else if (gaugeAgg === 'max') gaugeValue = Math.max(...orderedNums);
        else gaugeValue = orderedNums[orderedNums.length - 1];
      }

      const dataMax = orderedNums.length > 0 ? Math.max(...orderedNums) : 0;
      const safeMin = Number.isFinite(minValue) ? minValue : 0;
      const computedMax = useAutoMax
        ? Math.max(1, safeMin + 1, dataMax, gaugeValue)
        : Math.max(1, maxValueCfg);

      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 520, maxWidth: '100%' }}>
            <GaugeChart
              value={gaugeValue}
              minValue={minValue}
              maxValue={computedMax}
              title={yCol}
              unit={unit}
              decimals={decimals}
              prefix={prefix}
              suffix={suffix}
              thresholds={{ low: thresholdLow, medium: thresholdMedium }}
              showLegend={showLegend}
              showPercent={showPercent}
              showValue={showValue}
            />
          </div>
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
    
    // Use raw data directly - no aggregation
    // Map data to recharts format: name (x-axis), value (y-axis)
    const processedData = data
      .filter((row: any) => row[chart.x_column] != null && row[chart.y_column] != null)
      .map((row: any) => ({
        name: String(row[chart.x_column]),
        value: Number(row[chart.y_column]) || 0
      }));
    
    // Debug logs removed
    
    // If no data after processing, show empty state
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
          <ResponsiveContainer width="100%" height="100%">
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
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
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
            </LineChart>
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
          <ResponsiveContainer width="100%" height="100%">
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
                {pieData.map((_entry: any, index: number) => (
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
      case 'donut':
        // Donut is like pie but with innerRadius
        const donutTotal = processedData.reduce((sum: number, item: any) => sum + item.value, 0);
        const donutData = processedData.map((item: any) => ({
          ...item,
          percentage: ((item.value / donutTotal) * 100).toFixed(1)
        }));
        
        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="45%"
                labelLine={false}
                label={({ name, percent }: any) => {
                  const percentage = (percent * 100).toFixed(0);
                  if (parseFloat(percentage) > 3 && name) {
                    const shortName = name.length > 15 ? name.substring(0, 12) + '...' : name;
                    return `${shortName}: ${percentage}%`;
                  }
                  return '';
                }}
                outerRadius={130}
                innerRadius={65}
                fill="#8884d8"
                dataKey="value"
                paddingAngle={1}
              >
                {donutData.map((_entry: any, index: number) => (
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
      case 'area':
        const areaData = processedData.map((item: any) => ({
          ...item,
          name: item.name.length > 20 ? item.name.substring(0, 17) + '...' : item.name,
          fullName: item.name
        }));
        
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[0]} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={colors[0]} stopOpacity={0.1}/>
                </linearGradient>
              </defs>
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
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={colors[0]} 
                strokeWidth={2}
                fill="url(#colorValue)"
                dot={{ fill: colors[0], r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'scatter':
        const scatterData = processedData.map((item: any) => ({
          ...item,
          x: item.value,
          y: item.count || item.value,
          z: item.count || 100
        }));
        
        return (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                type="number" 
                dataKey="x" 
                name="Value"
                style={{ fontSize: '12px', fill: '#64748b' }}
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name="Count"
                style={{ fontSize: '12px', fill: '#64748b' }}
              />
              <ZAxis type="number" dataKey="z" range={[60, 400]} />
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
                          Count: <span style={{ fontWeight: '600' }}>{data.count}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ strokeDasharray: '3 3' }}
              />
              <Scatter name="Data Points" data={scatterData} fill={colors[0]} />
            </ScatterChart>
          </ResponsiveContainer>
        );
      case 'funnel':
        const funnelData = processedData.map((item: any, index: number) => ({
          ...item,
          fill: colors[index % colors.length]
        }));
        
        return (
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
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
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Funnel dataKey="value" data={funnelData} isAnimationActive>
                <LabelList position="right" fill="#000" stroke="none" dataKey="name" />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        );
      case 'kpi':
      case 'gauge':
        // handled above
        return null;
      case 'radar':
        const radarData = processedData.map((item: any) => ({
          ...item,
          name: item.name.length > 15 ? item.name.substring(0, 12) + '...' : item.name,
          fullName: item.name
        }));
        
        return (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis 
                dataKey="name" 
                style={{ fontSize: '12px', fill: '#64748b' }}
              />
              <PolarRadiusAxis 
                angle={90} 
                style={{ fontSize: '11px', fill: '#64748b' }}
              />
              <Radar 
                name="Value" 
                dataKey="value" 
                stroke={colors[0]} 
                fill={colors[0]} 
                fillOpacity={0.6}
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
              <Legend 
                wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
              />
            </RadarChart>
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

  console.log('DashboardViewPage render:', {
    dashboardId: dashboard?.id,
    chartCount: dashboard?.charts?.length,
    sqlInsight: !!sqlInsight,
    viewType: sqlInsight ? 'insight' : 'dashboard'
  });

  if (sqlInsight) {
    const chartData = chartsData.find(d => d.chartId === sqlInsight.chart.id);
    
    const formatTime = (iso?: string): string => {
      if (!iso) return "Unknown";
      const date = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      
      if (diffHours < 1) return "Just now";
      if (diffHours < 24) return diffHours + " hour" + (diffHours === 1 ? "" : "s") + " ago";
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return diffDays + " day" + (diffDays === 1 ? "" : "s") + " ago";
      if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return weeks + " week" + (weeks === 1 ? "" : "s") + " ago";
      }
      return date.toLocaleDateString();
    };
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: '#fff' }}>
        {/* Header */}
        <div style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '16px 32px',
        }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <button
              onClick={() => navigate('/insights')}
              style={{
                padding: '6px 0',
                backgroundColor: 'transparent',
                color: '#64748b',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              ← Back
            </button>

            {/* Title and metadata */}
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px', marginBottom: '10px' }}>
                  {sqlInsight.dashboard.name}
                </h1>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Data source badge */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#64748b',
                  }}>
                    <span>📊</span>
                    <span>SQL Insight</span>
                  </div>
                  
                  {/* Updated time badge */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#64748b',
                  }}>
                    <span>🕐</span>
                    <span>Updated {formatTime(sqlInsight.dashboard.updated_at || sqlInsight.dashboard.created_at)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => navigate(`/insights/sql-editor?dashboardId=${sqlInsight.dashboard.id}&chartId=${sqlInsight.chart.id}`)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                ✏️ Edit
              </button>
            </div>
              
              {/* Description */}
              {sqlInsight.dashboard.description && (
                <p style={{ color: '#64748b', fontSize: '14px', marginTop: '12px', lineHeight: 1.6 }}>
                  {sqlInsight.dashboard.description}
                </p>
              )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#f8fafc' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 32px' }}>
            
            {/* Visualization Card */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {/* Header with Title and Chart Type */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px 20px 16px',
              }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.05em' }}>
                  Visualization
                </h3>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {sqlInsight.chart.chart_type.charAt(0).toUpperCase() + sqlInsight.chart.chart_type.slice(1)} Chart
                </div>
              </div>

              {/* Chart Visualization */}
              {chartQueries.isLoading ? (
                <div style={{ padding: '80px 20px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                  Loading chart data...
                </div>
              ) : (
                <div style={{ padding: '20px', paddingBottom: '44px', height: '500px' }}>
                  {renderChart(sqlInsight.chart, chartData)}
                </div>
              )}

              {/* Info Note */}
              <div style={{
                padding: '12px 20px',
                backgroundColor: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                fontSize: '12px',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '14px' }}>ℹ️</span>
                <span>The chart applies transformations (aggregations, filters, sorting) to the source data shown below</span>
              </div>

              {/* Tabs */}
              <div style={{
                borderTop: '1px solid #e2e8f0',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#fff',
                padding: '0 20px',
                display: 'flex',
                gap: '0px',
              }}>
                {([
                  { key: 'config', label: 'Chart Configuration', icon: '⚙️' },
                  { key: 'query', label: 'Source SQL Query', icon: '</>' },
                  { key: 'preview', label: 'Source Data', icon: '📋' },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    style={{
                      padding: '12px 20px',
                      border: 'none',
                      borderBottom: tab === t.key ? '2px solid #0f172a' : '2px solid transparent',
                      backgroundColor: 'transparent',
                      color: tab === t.key ? '#0f172a' : '#64748b',
                      fontSize: '13px',
                      fontWeight: tab === t.key ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    onMouseEnter={(e) => {
                      if (tab !== t.key) {
                        e.currentTarget.style.color = '#0f172a';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (tab !== t.key) {
                        e.currentTarget.style.color = '#64748b';
                      }
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ padding: '20px' }}>
                {/* Configuration Tab */}
                {tab === 'config' && (
                  <div>
                    {(() => {
                      const cfg = (sqlInsight.chart.config || {}) as Record<string, any>;
                      const scatterCfg = (cfg.scatterConfig || {}) as Record<string, any>;
                      const isScatter = sqlInsight.chart.chart_type === 'scatter';
                      const isRadar = sqlInsight.chart.chart_type === 'radar';
                      const isXY = sqlInsight.chart.chart_type === 'bar' || sqlInsight.chart.chart_type === 'line' || sqlInsight.chart.chart_type === 'area';

                      const scatterColorBy = (typeof cfg.scatterColorBy === 'string' && cfg.scatterColorBy)
                        ? cfg.scatterColorBy
                        : (typeof scatterCfg.colorByColumn === 'string' ? scatterCfg.colorByColumn : '');
                      const scatterSizeBy = (typeof cfg.scatterSizeBy === 'string' && cfg.scatterSizeBy)
                        ? cfg.scatterSizeBy
                        : (typeof scatterCfg.sizeByColumn === 'string' ? scatterCfg.sizeByColumn : '');
                      const scatterMaxPointSize = toNumber(cfg.scatterMaxPointSize) ?? 70;
                      const scatterPointOpacity = toNumber(cfg.scatterPointOpacity ?? scatterCfg.pointOpacity) ?? 0.85;
                      const scatterPointSize = toNumber(cfg.scatterPointSize ?? scatterCfg.pointSize) ?? 8;
                      const scatterShowLabels = typeof scatterCfg.showLabels === 'boolean' ? scatterCfg.showLabels : false;
                      const scatterShowTrendLine = typeof scatterCfg.showTrendLine === 'boolean' ? scatterCfg.showTrendLine : false;
                      const scatterMarkType = typeof scatterCfg.markType === 'string' ? scatterCfg.markType : '';

                      const showGrid = typeof cfg.showGrid === 'boolean' ? cfg.showGrid : true;
                      const showLegend = typeof cfg.showLegend === 'boolean' ? cfg.showLegend : true;
                      const showDataLabels = typeof cfg.showDataLabels === 'boolean' ? cfg.showDataLabels : false;

                      // Extract axis arrays from config
                      const xAxes: string[] = Array.isArray(cfg.xAxes)
                        ? cfg.xAxes.filter((c: any) => typeof c === 'string' && c.trim())
                        : [];
                      const yAxes: string[] = Array.isArray(cfg.yAxes)
                        ? cfg.yAxes.filter((c: any) => typeof c === 'string' && c.trim())
                        : [];

                      const xySeriesBy = typeof cfg.seriesBy === 'string' ? cfg.seriesBy : '';
                      const xyAggregation = typeof cfg.aggregation === 'string' ? cfg.aggregation : 'none';
                      const xySortOrder = typeof cfg.sortOrder === 'string' ? cfg.sortOrder : 'none';
                      const xyXTimeGrain = typeof cfg.xTimeGrain === 'string' ? cfg.xTimeGrain : 'none';
                      const xyCurveType = typeof cfg.curveType === 'string' ? cfg.curveType : 'monotone';
                      const xyShowMarkers = typeof cfg.showMarkers === 'boolean' ? cfg.showMarkers : true;
                      const xyIsStacked = typeof cfg.isStacked === 'boolean' ? cfg.isStacked : false;
                      const xyAreaFillOpacity = Number.isFinite(Number(cfg.areaFillOpacity)) ? Number(cfg.areaFillOpacity) : 0.2;
                      const xyBarOrientation = typeof cfg.barOrientation === 'string' ? cfg.barOrientation : 'vertical';
                      const xyBarCornerRadius = Number.isFinite(Number(cfg.barCornerRadius)) ? Number(cfg.barCornerRadius) : 6;

                      const radarYAxes: string[] = Array.isArray(cfg.yAxes)
                        ? cfg.yAxes.filter((c: any) => typeof c === 'string' && c.trim())
                        : [];
                      const radarHasMultiY = radarYAxes.length > 1;
                      const radarAxisMode = (typeof cfg.radarAxisMode === 'string' && (cfg.radarAxisMode === 'categories' || cfg.radarAxisMode === 'metrics'))
                        ? (cfg.radarAxisMode as 'categories' | 'metrics')
                        : (radarHasMultiY ? 'metrics' : 'categories');
                      const radarSeriesBy = typeof cfg.radarSeriesBy === 'string' ? cfg.radarSeriesBy : '';
                      const radarAggregation = typeof cfg.radarAggregation === 'string' ? cfg.radarAggregation : 'sum';
                      const radarSortOrder = typeof cfg.radarSortOrder === 'string' ? cfg.radarSortOrder : 'value_desc';
                      const radarTopN = Number.isFinite(Number(cfg.radarTopN)) ? Number(cfg.radarTopN) : 10;
                      const radarGroupOther = typeof cfg.radarGroupOther === 'boolean' ? cfg.radarGroupOther : false;
                      const radarFillOpacity = toNumber(cfg.radarFillOpacity) ?? 0.25;
                      const radarNormalizeMetrics = typeof cfg.radarNormalizeMetrics === 'boolean' ? cfg.radarNormalizeMetrics : true;
                      const radarUsePerMetricAggregation = typeof cfg.radarUsePerMetricAggregation === 'boolean' ? cfg.radarUsePerMetricAggregation : false;
                      const radarMetricAggregationsRaw = (cfg as any).radarMetricAggregations;
                      const radarMetricAggregations: Record<string, any> = radarMetricAggregationsRaw && typeof radarMetricAggregationsRaw === 'object' ? radarMetricAggregationsRaw : {};
                      const radarMetricAggSummary = (() => {
                        if (!radarUsePerMetricAggregation) return '';
                        const parts: string[] = [];
                        for (const m of radarYAxes) {
                          const a = radarMetricAggregations?.[m];
                          if (typeof a === 'string' && a) parts.push(`${m}: ${a}`);
                        }
                        return parts.join(', ');
                      })();

                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                          {sqlInsight.chart.chart_type === 'gauge' || sqlInsight.chart.chart_type === 'kpi' ? (
                            <>
                              {/* Value */}
                              {sqlInsight.chart.y_column && (
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Value</div>
                                  <div style={{ fontSize: '14px', color: '#0f172a' }}>{sqlInsight.chart.y_column}</div>
                                </div>
                              )}

                              {/* Aggregation */}
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Aggregation</div>
                                <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                  {sqlInsight.chart.chart_type === 'gauge'
                                    ? (sqlInsight.chart.config?.gaugeAggregation || 'last')
                                    : (sqlInsight.chart.config?.kpiAggregation || 'sum')}
                                </div>
                              </div>

                              {/* Range (Gauge only) */}
                              {sqlInsight.chart.chart_type === 'gauge' ? (
                                <>
                                  {sqlInsight.chart.config?.gaugeSortByColumn ? (
                                    <div>
                                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Sort by</div>
                                      <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(sqlInsight.chart.config?.gaugeSortByColumn)}</div>
                                    </div>
                                  ) : null}
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Min</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(sqlInsight.chart.config?.gaugeMinValue ?? 0)}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Max</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                      {sqlInsight.chart.config?.gaugeUseAutoMax ? 'Auto' : String(sqlInsight.chart.config?.gaugeMaxValue ?? 100)}
                                    </div>
                                  </div>
                                </>
                              ) : null}
                            </>
                          ) : (
                            <>
                              {sqlInsight.chart.chart_type === 'table' ? (
                                <>
                                  {/* Aggregation */}
                                  {sqlInsight.chart.config?.tableEnableAggregation ? (
                                    <>
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Group by</div>
                                        <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                          {Array.isArray(sqlInsight.chart.config?.tableGroupByColumns) && sqlInsight.chart.config?.tableGroupByColumns.length
                                            ? sqlInsight.chart.config?.tableGroupByColumns.join(', ')
                                            : '—'}
                                        </div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Metrics</div>
                                        <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                          {Array.isArray(sqlInsight.chart.config?.tableMetrics) && sqlInsight.chart.config?.tableMetrics.length
                                            ? sqlInsight.chart.config?.tableMetrics
                                                .map((m: any) => {
                                                  const agg = String(m?.agg ?? '').toLowerCase();
                                                  const col = String(m?.column ?? '');
                                                  return agg && col ? `${agg}(${col})` : null;
                                                })
                                                .filter(Boolean)
                                                .join(', ')
                                            : '—'}
                                        </div>
                                      </div>
                                    </>
                                  ) : null}

                                  {/* Visible Columns */}
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Columns</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                      {Array.isArray(sqlInsight.chart.config?.tableVisibleColumns) && sqlInsight.chart.config?.tableVisibleColumns.length
                                        ? sqlInsight.chart.config?.tableVisibleColumns.join(', ')
                                        : 'All'}
                                    </div>
                                  </div>

                                  {/* Rows */}
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Rows</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                      {sqlInsight.chart.config?.tableFullData
                                        ? 'Full data (loads on scroll)'
                                        : `Limit: ${String(sqlInsight.chart.config?.tableRowLimit ?? 200)} (loads on scroll)`}
                                    </div>
                                  </div>

                                  {/* Sort */}
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Sort</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                      {sqlInsight.chart.config?.tableSortColumn
                                        ? `${String(sqlInsight.chart.config?.tableSortColumn)} (${String(sqlInsight.chart.config?.tableSortDir === 'desc' ? 'desc' : 'asc')})`
                                        : 'None'}
                                    </div>
                                  </div>

                                  {/* Density */}
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Density</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{sqlInsight.chart.config?.tableDense ? 'Dense' : 'Normal'}</div>
                                  </div>

                                  {/* Wrap */}
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Wrap</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{sqlInsight.chart.config?.tableWrap ? 'On' : 'Off'}</div>
                                  </div>
                                </>
                              ) : null}

                              {/* Funnel settings */}
                              {sqlInsight.chart.chart_type === 'funnel' ? (
                                <>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Aggregation</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(sqlInsight.chart.config?.funnelAggregation || 'sum')}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Sort</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(sqlInsight.chart.config?.funnelSortOrder || 'value_desc')}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Top N</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                      {Number(sqlInsight.chart.config?.funnelTopN) === 0 ? 'All' : String(sqlInsight.chart.config?.funnelTopN ?? 10)}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Group other</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{sqlInsight.chart.config?.funnelGroupOther ? 'On' : 'Off'}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>% of first</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                      {typeof sqlInsight.chart.config?.funnelShowPercentOfFirst === 'boolean'
                                        ? (sqlInsight.chart.config?.funnelShowPercentOfFirst ? 'On' : 'Off')
                                        : 'On'}
                                    </div>
                                  </div>
                                </>
                              ) : null}

                              {/* X-Axis */}
                              {sqlInsight.chart.chart_type !== 'table' && (xAxes.length > 0 || sqlInsight.chart.x_column) && (
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>X-Axis</div>
                                  <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                    {xAxes.length > 0 ? xAxes.join(', ') : sqlInsight.chart.x_column}
                                  </div>
                                </div>
                              )}

                              {/* Y-Axis */}
                              {sqlInsight.chart.chart_type !== 'table' && (yAxes.length > 0 || sqlInsight.chart.y_column) && !(isRadar && radarYAxes.length > 0) && (
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Y-Axis</div>
                                  <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                    {yAxes.length > 0 ? yAxes.join(', ') : sqlInsight.chart.y_column}
                                  </div>
                                </div>
                              )}

                              {/* Scatter settings */}
                              {isScatter ? (
                                <>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Color by</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{scatterColorBy || 'None'}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Size by</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{scatterSizeBy || 'None'}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Point size</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{`${scatterPointSize}px`}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Point opacity</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{scatterPointOpacity.toFixed(2)}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Max point size</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{scatterSizeBy ? `${scatterMaxPointSize}px` : '—'}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Show labels</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{scatterShowLabels ? 'On' : 'Off'}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Trend line</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{scatterShowTrendLine ? 'On' : 'Off'}</div>
                                  </div>
                                  {scatterMarkType ? (
                                    <div>
                                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Mark</div>
                                      <div style={{ fontSize: '14px', color: '#0f172a' }}>{scatterMarkType}</div>
                                    </div>
                                  ) : null}
                                </>
                              ) : null}

                              {/* Bar/Line/Area settings */}
                              {isXY ? (
                                <>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Series by</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{xySeriesBy || 'None'}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Aggregation</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(xyAggregation)}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Sort</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(xySortOrder)}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>X time grain</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(xyXTimeGrain)}</div>
                                  </div>

                                  {sqlInsight.chart.chart_type === 'line' || sqlInsight.chart.chart_type === 'area' ? (
                                    <>
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Curve</div>
                                        <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(xyCurveType)}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Markers</div>
                                        <div style={{ fontSize: '14px', color: '#0f172a' }}>{xyShowMarkers ? 'On' : 'Off'}</div>
                                      </div>
                                    </>
                                  ) : null}

                                  {sqlInsight.chart.chart_type === 'area' ? (
                                    <div>
                                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Fill opacity</div>
                                      <div style={{ fontSize: '14px', color: '#0f172a' }}>{Number.isFinite(xyAreaFillOpacity) ? xyAreaFillOpacity.toFixed(2) : '0.20'}</div>
                                    </div>
                                  ) : null}

                                  {sqlInsight.chart.chart_type === 'bar' ? (
                                    <>
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Orientation</div>
                                        <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(xyBarOrientation)}</div>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Corner radius</div>
                                        <div style={{ fontSize: '14px', color: '#0f172a' }}>{`${Math.round(Number(xyBarCornerRadius))}px`}</div>
                                      </div>
                                    </>
                                  ) : null}

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Stacked</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{xyIsStacked ? 'On' : 'Off'}</div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Data labels</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{showDataLabels ? 'On' : 'Off'}</div>
                                  </div>
                                </>
                              ) : null}

                              {/* Radar settings */}
                              {isRadar ? (
                                <>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Axes</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                      {radarAxisMode === 'metrics' ? 'Metrics (Y columns)' : 'Categories (X)'}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Series by</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{radarSeriesBy || 'None'}</div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Y metrics</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>
                                      {radarYAxes.length ? radarYAxes.join(', ') : (sqlInsight.chart.y_column || '—')}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Aggregation</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(radarAggregation)}</div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Per-metric aggregation</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{radarUsePerMetricAggregation ? 'On' : 'Off'}</div>
                                  </div>

                                  {radarAxisMode === 'metrics' ? (
                                    <div>
                                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Normalize metrics</div>
                                      <div style={{ fontSize: '14px', color: '#0f172a' }}>{radarNormalizeMetrics ? 'On' : 'Off'}</div>
                                    </div>
                                  ) : null}

                                  {radarUsePerMetricAggregation ? (
                                    <div style={{ gridColumn: '1 / -1' }}>
                                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Metric aggregations</div>
                                      <div style={{ fontSize: '14px', color: '#0f172a' }}>{radarMetricAggSummary || '—'}</div>
                                    </div>
                                  ) : null}

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Sort</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{String(radarSortOrder)}</div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                                      {radarHasMultiY && radarAxisMode === 'metrics' ? 'Max series' : 'Max categories'}
                                    </div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{radarTopN === 0 ? 'All' : String(radarTopN)}</div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Group other</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{radarGroupOther ? 'On' : 'Off'}</div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Fill opacity</div>
                                    <div style={{ fontSize: '14px', color: '#0f172a' }}>{radarFillOpacity.toFixed(2)}</div>
                                  </div>
                                </>
                              ) : null}
                            </>
                          )}

                          {/* Color Scheme */}
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Color Scheme</div>
                            <div style={{ fontSize: '14px', color: '#0f172a' }}>Default</div>
                          </div>

                          {/* Grid */}
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Grid</div>
                            <div style={{ fontSize: '14px', color: '#0f172a' }}>{showGrid ? 'Visible' : 'Hidden'}</div>
                          </div>

                          {/* Legend */}
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Legend</div>
                            <div style={{ fontSize: '14px', color: '#0f172a' }}>{showLegend ? 'Visible' : 'Hidden'}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Query Tab */}
                {tab === 'query' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>SQL Query</div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(sqlInsight.sql);
                        }}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          backgroundColor: 'white',
                          color: '#64748b',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        📋 Copy
                      </button>
                    </div>
                    <pre style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '16px',
                      fontSize: '13px',
                      color: '#0f172a',
                      fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                      lineHeight: 1.6,
                    }}>
                      {sqlInsight.sql}
                    </pre>
                  </div>
                )}

                {/* Data Preview Tab */}
                {tab === 'preview' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                        Sample Data ({previewQuery.data?.rows.length || 0} rows shown)
                      </div>
                      <button
                        onClick={() => {
                          // Trigger CSV export download
                          if (sqlInsight?.chart?.dataset_id) {
                            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                            const token = localStorage.getItem('access_token');
                            const chartName = encodeURIComponent(sqlInsight.dashboard.name);
                            const exportUrl = `${apiBaseUrl}/api/datasets/${sqlInsight.chart.dataset_id}/export?token=${token}&filename=${chartName}`;
                            
                            // Trigger download
                            window.location.href = exportUrl;
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          backgroundColor: 'white',
                          color: '#64748b',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                      >
                        📥 Export Source Data (CSV)
                      </button>
                    </div>
                    {previewQuery.isLoading ? (
                      <div style={{ padding: '64px', textAlign: 'center', color: '#64748b' }}>Loading preview...</div>
                    ) : previewQuery.data ? (
                      <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
                              {previewQuery.data.columns.map((c) => (
                                <th key={c} style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {c}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewQuery.data.rows.map((r, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                {previewQuery.data.columns.map((c) => (
                                  <td key={c} style={{ padding: '10px 16px', color: '#475569', whiteSpace: 'nowrap', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {r?.[c] === null ? <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>null</span> : String(r?.[c] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding: '64px', textAlign: 'center', color: '#64748b' }}>No preview available</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                onClick={() => navigate(isInsightView ? '/insights' : '/dashboards')}
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
                navigate(`/dashboards/new?edit=${dashboard.id}`);
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
            <div style={{ position: 'relative', width: '100%' }}>
              {dashboard.charts.map((chart, chartIndex) => {
                const chartData = chartsData.find(d => d.chartId === chart.id);
                
                // Calculate percentage-based positioning with gaps
                const gap = 24; // Gap in pixels between charts
                const leftPercent = (chart.position_x / 12) * 100;
                const widthPercent = (chart.width / 12) * 100;
                const topPx = chart.position_y * 100 + (chart.position_y > 0 ? gap : 0);
                const heightPx = chart.height * 100 - (gap / 2);
                
                console.log(`Chart ${chartIndex} (${chart.title}):`, {
                  type: chart.chart_type,
                  position: { x: chart.position_x, y: chart.position_y },
                  size: { width: chart.width, height: chart.height },
                  calculated: { leftPercent, topPx, widthPercent, heightPx }
                });
                
                return (
                  <div
                    key={chart.id}
                    style={{
                      position: 'absolute',
                      left: `${leftPercent}%`,
                      top: `${topPx}px`,
                      width: chart.position_x + chart.width < 12 
                        ? `calc(${widthPercent}% - ${gap}px)` 
                        : `${widthPercent}%`,
                      height: `${heightPx}px`,
                      backgroundColor: 'white',
                      borderRadius: '16px',
                      border: '1px solid #e2e8f0',
                      overflow: 'hidden',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      pointerEvents: 'auto'
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
                      backgroundColor: '#f8fafc',
                      flexShrink: 0
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
                    <div style={{ 
                      flex: 1, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      minHeight: 0,
                      height: '100%',
                      position: 'relative'
                    }}>
                      {/* Inner Title (from config) */}
                      {chart.config?.chartTitle && (
                        <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a', padding: '12px 20px 0', flexShrink: 0 }}>
                          {chart.config.chartTitle}
                        </div>
                      )}

                      <div style={{ 
                        flex: 1, 
                        minHeight: 0,
                        height: '100%',
                        width: '100%',
                        padding: '20px',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        {chartQueries.isLoading ? (
                          <div style={{ padding: '64px', textAlign: 'center', color: '#64748b' }}>
                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                            Loading chart data...
                          </div>
                        ) : (
                          <div 
                            ref={(el) => {
                              if (el) {
                                console.log(`Chart ${chartIndex} (${chart.title}) wrapper dimensions:`, {
                                  clientWidth: el.clientWidth,
                                  clientHeight: el.clientHeight,
                                  offsetWidth: el.offsetWidth,
                                  offsetHeight: el.offsetHeight
                                });
                              }
                            }}
                            style={{ 
                              width: '100%', 
                              height: '100%', 
                              flex: 1,
                              minHeight: 0,
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                            {renderChart(chart, chartData)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Spacer to ensure container has proper height */}
              <div style={{ 
                position: 'absolute', 
                height: `${Math.max(...dashboard.charts.map(c => c.position_y + c.height)) * 100}px`,
                width: '100%',
                pointerEvents: 'none',
                zIndex: -1
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { DashboardViewPage };
