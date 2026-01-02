import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '../services/dashboardService';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { ScatterPlot } from './ScatterPlot';
import { GaugeChart } from './GaugeChart';
import { FunnelChart } from './FunnelChart';
import { ProgressiveXYChart } from './ProgressiveXYChart';
import { SavedTableChart } from './SavedTableChart';
import { HeatmapChart } from './HeatmapChart';
import { HistogramChart } from './HistogramChart';
import { BoxPlotChart } from './BoxPlotChart';

interface SavedChartRendererProps {
  dashboardId: string;
  chart: any;
}

const toNumber = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

export const SavedChartRenderer: React.FC<SavedChartRendererProps> = ({ dashboardId, chart }) => {
  const cfg = chart.config || {};
  const isSelfManaged = chart.chart_type === 'table' || chart.chart_type === 'bar' || chart.chart_type === 'line' || chart.chart_type === 'area';

  const { data: chartData, isLoading, error } = useQuery({
    queryKey: ['chart-data', dashboardId, chart.id],
    queryFn: () => dashboardService.getChartAggregatedData(dashboardId, chart.id, {}),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !isSelfManaged,
  });

  // Table
  if (chart.chart_type === 'table') {
    return <SavedTableChart dashboardId={dashboardId} chartId={chart.id} cfg={cfg} />;
  }

  // Bar / Line / Area
  if (chart.chart_type === 'bar' || chart.chart_type === 'line' || chart.chart_type === 'area') {
    const orientation = (cfg.barOrientation || cfg.orientation || 'vertical') as 'vertical' | 'horizontal';
    return (
      <ProgressiveXYChart
        chart={chart}
        dashboardId={dashboardId}
        orientation={orientation}
      />
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
        Loading...
      </div>
    );
  }

  if (error || !chartData || !chartData.data) {
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

  const data = chartData.data;
  const colors = ['#4f46e5', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#a855f7', '#14b8a6', '#eab308'];

  // Pie / Donut
  if (chart.chart_type === 'pie' || chart.chart_type === 'donut') {
    const xCol: string | undefined = chart.x_column || (typeof cfg.xAxis === 'string' ? cfg.xAxis : undefined);
    const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined);
    
    if (!xCol || !yCol) return <div>Invalid config</div>;

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
        case 'count': return s.count;
        case 'sum': return s.sum;
        case 'avg': return s.count > 0 ? s.sum / s.count : 0;
        case 'min': return s.min ?? 0;
        case 'max': return s.max ?? 0;
        default: return s.sum;
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
    if (!xCol || !yCol) return <div>Invalid config</div>;

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
        height={400}
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
    const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined) || (yAxes[0] || undefined);

    const radarAggregation = typeof cfg.radarAggregation === 'string' ? cfg.radarAggregation : 'sum';
    const radarSortOrder = typeof cfg.radarSortOrder === 'string' ? cfg.radarSortOrder : 'value_desc';
    const rawTopN = toNumber(cfg.radarTopN);
    const radarTopN = rawTopN !== null ? Math.max(0, Math.round(rawTopN)) : 10;
    const radarGroupOther = typeof cfg.radarGroupOther === 'boolean' ? cfg.radarGroupOther : false;
    const rawFill = toNumber(cfg.radarFillOpacity);
    const radarFillOpacity = rawFill !== null ? rawFill : 0.15;
    const showLegend = typeof cfg.showLegend === 'boolean' ? cfg.showLegend : true;
    const showGrid = typeof cfg.showGrid === 'boolean' ? cfg.showGrid : true;
    const hasMultiY = yAxes.length > 1;
    const radarNormalizeMetrics = typeof (cfg as any).radarNormalizeMetrics === 'boolean' ? (cfg as any).radarNormalizeMetrics : true;
    
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

    if (!xCol || (radarAxisMode === 'categories' && !yCol) || (radarAxisMode === 'metrics' && !(yAxes.length > 0 || yCol))) {
      return <div>Invalid config</div>;
    }

    const xColResolved = xCol;
    const yColResolved = yCol;

    type Stats = { sum: number; count: number; min: number | null; max: number | null };
    const computeValue = (agg: 'sum' | 'avg' | 'min' | 'max' | 'count', sum: number, count: number, min: number | null, max: number | null): number => {
      switch (agg) {
        case 'count': return count;
        case 'sum': return sum;
        case 'avg': return count > 0 ? sum / count : 0;
        case 'min': return min ?? 0;
        case 'max': return max ?? 0;
        default: return sum;
      }
    };

    const prepared = (() => {
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

        for (const r of data as any[]) {
          const category = String(r?.[xColResolved] ?? '').trim();
          if (!category) continue;
          let seriesKey = hasSeries ? (String(r?.[radarSeriesBy] ?? '').trim() || 'Unknown') : (yColResolved || 'Value');
          if (seriesKey.length > 19 && seriesKey[10] === 'T') seriesKey = seriesKey.substring(0, 19);
          seriesSet.add(seriesKey);
          const s = ensure(category, seriesKey);
          if (radarAggregation === 'count') { s.count += 1; continue; }
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

      // Mode B: metrics
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
        if (seriesKey.length > 19 && seriesKey[10] === 'T') seriesKey = seriesKey.substring(0, 19);
        for (const metric of metrics) {
          const s = ensure(seriesKey, metric);
          if (radarAggregation === 'count') { s.count += 1; continue; }
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
      if (radarTopN > 0 && seriesKeys.length > radarTopN) {
        keptSeries = seriesKeys.slice(0, radarTopN);
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

    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={prepared.data} margin={{ top: 20, right: 30, left: 30, bottom: 20 }}>
          {showGrid ? <PolarGrid stroke="#e2e8f0" /> : null}
          <PolarAngleAxis dataKey={prepared.axisKey} tick={{ fontSize: 12, fill: '#64748b' }} />
          {prepared.normalized ? (
            <PolarRadiusAxis angle={90} domain={prepared.hasNegative ? [-1, 1] : [0, 1]} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} tick={{ fontSize: 11, fill: '#64748b' }} />
          ) : (
            <PolarRadiusAxis angle={90} tick={{ fontSize: 11, fill: '#64748b' }} />
          )}
          {prepared.seriesKeys.map((k, i) => (
            <Radar key={k} name={k} dataKey={k} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={radarFillOpacity} strokeWidth={2} />
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
    if (!xCol || !yCol) return <div>Invalid config</div>;

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
      if (funnelAggregation === 'count') { s.count += 1; continue; }
      const n = toNumber(r?.[yCol]);
      if (n === null) continue;
      s.sum += n;
      s.count += 1;
      s.min = s.min === null ? n : Math.min(s.min, n);
      s.max = s.max === null ? n : Math.max(s.max, n);
    }

    const compute = (s: Stats): number => {
      switch (funnelAggregation) {
        case 'count': return s.count;
        case 'sum': return s.sum;
        case 'avg': return s.count > 0 ? s.sum / s.count : 0;
        case 'min': return s.min ?? 0;
        case 'max': return s.max ?? 0;
        default: return s.sum;
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
          <FunnelChart data={rendered} nameKey="name" dataKey="value" colors={colors} height={320} />
          {withPercent && rendered.length > 0 ? (
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#64748b' }}>Showing percent of first stage.</div>
          ) : null}
        </div>
      </div>
    );
  }

  // Gauge
  if (chart.chart_type === 'gauge') {
    const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined);
    if (!yCol) return <div>Invalid config</div>;

    const gaugeAggregation = typeof cfg.gaugeAggregation === 'string' ? cfg.gaugeAggregation : 'last';
    const gaugeSortByColumn = typeof cfg.gaugeSortByColumn === 'string' ? cfg.gaugeSortByColumn : '';
    const minValue = toNumber(cfg.gaugeMinValue) ?? 0;
    const useAutoMax = typeof cfg.gaugeUseAutoMax === 'boolean' ? cfg.gaugeUseAutoMax : true;
    const maxValueCfg = toNumber(cfg.gaugeMaxValue) ?? 100;
    const decimals = toNumber(cfg.gaugeDecimals) ?? 0;
    const prefix = typeof cfg.gaugePrefix === 'string' ? cfg.gaugePrefix : '';
    const suffix = typeof cfg.gaugeSuffix === 'string' ? cfg.gaugeSuffix : '';
    const unit = typeof cfg.gaugeUnit === 'string' ? cfg.gaugeUnit : '';
    const thresholdLow = toNumber(cfg.gaugeThresholdLow) ?? 33;
    const thresholdMedium = toNumber(cfg.gaugeThresholdMedium) ?? 66;
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

    const needsOrdering = (gaugeAggregation === 'first' || gaugeAggregation === 'last') && !!gaugeSortByColumn;
    const orderedRows = needsOrdering
        ? (data as any[]).slice().sort((a, b) => compareForSort(a?.[gaugeSortByColumn], b?.[gaugeSortByColumn]))
        : (data as any[]);

    const orderedNums = orderedRows
        .map((r) => toNumber(r?.[yCol]))
        .filter((n): n is number => n !== null && Number.isFinite(n));

    let value = 0;
    if (gaugeAggregation === 'count') {
        value = (data as any[]).length;
    } else if (orderedNums.length > 0) {
        if (gaugeAggregation === 'first') value = orderedNums[0];
        else if (gaugeAggregation === 'last') value = orderedNums[orderedNums.length - 1];
        else if (gaugeAggregation === 'sum') value = orderedNums.reduce((acc, n) => acc + n, 0);
        else if (gaugeAggregation === 'avg') value = orderedNums.reduce((acc, n) => acc + n, 0) / orderedNums.length;
        else if (gaugeAggregation === 'min') value = Math.min(...orderedNums);
        else if (gaugeAggregation === 'max') value = Math.max(...orderedNums);
        else value = orderedNums[orderedNums.length - 1];
    }

    const dataMax = orderedNums.length > 0 ? Math.max(...orderedNums) : 0;
    const safeMin = Number.isFinite(minValue) ? minValue : 0;
    const computedMax = useAutoMax
        ? Math.max(1, safeMin + 1, dataMax, value)
        : Math.max(1, maxValueCfg);

    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 520, maxWidth: '100%' }}>
          <GaugeChart
            value={value}
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
            height={300}
          />
        </div>
      </div>
    );
  }

  // KPI
  if (chart.chart_type === 'kpi') {
    const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined);
    if (!yCol) return <div>Invalid config</div>;

    const kpiAggregation = typeof cfg.kpiAggregation === 'string' ? cfg.kpiAggregation : 'sum';
    const decimals = toNumber(cfg.kpiDecimals) ?? 0;
    const prefix = typeof cfg.kpiPrefix === 'string' ? cfg.kpiPrefix : '';
    const suffix = typeof cfg.kpiSuffix === 'string' ? cfg.kpiSuffix : '';
    
    let sum = 0;
    let count = 0;
    let min: number | null = null;
    let max: number | null = null;

    for (const r of data as any[]) {
      const n = toNumber(r?.[yCol]);
      if (n === null) continue;
      sum += n;
      count += 1;
      min = min === null ? n : Math.min(min, n);
      max = max === null ? n : Math.max(max, n);
    }

    let value = 0;
    switch (kpiAggregation) {
      case 'count': value = count; break;
      case 'sum': value = sum; break;
      case 'avg': value = count > 0 ? sum / count : 0; break;
      case 'min': value = min ?? 0; break;
      case 'max': value = max ?? 0; break;
      default: value = sum;
    }

    const formatted = Number.isFinite(value)
      ? `${prefix}${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
      : '—';

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column' }}>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, marginBottom: '8px' }}>{yCol}</div>
        <div style={{ fontSize: '72px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
          {formatted}
        </div>
      </div>
    );
  }

  // Heatmap
  if (chart.chart_type === 'heatmap') {
    const xCol: string | undefined = chart.x_column || (typeof cfg.xAxis === 'string' ? cfg.xAxis : undefined);
    const yCol: string | undefined = chart.y_column || (typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined);
    const valueCol: string | undefined = (typeof cfg.heatmapValueColumn === 'string' && cfg.heatmapValueColumn) 
      ? cfg.heatmapValueColumn 
      : (typeof cfg.valueColumn === 'string' ? cfg.valueColumn : undefined);
    
    if (!xCol || !yCol || !valueCol) {
      return <div style={{ padding: '20px', color: '#dc2626' }}>Invalid heatmap config - missing x, y, or value column</div>;
    }

    const aggregation = typeof cfg.heatmapAggregation === 'string' ? cfg.heatmapAggregation : 'sum';
    const colorScheme = Array.isArray(cfg.heatmapColorScheme) ? cfg.heatmapColorScheme : undefined;
    const showValues = typeof cfg.heatmapShowValues === 'boolean' ? cfg.heatmapShowValues : true;
    const showGrid = typeof cfg.heatmapShowGrid === 'boolean' ? cfg.heatmapShowGrid : true;
    const cellBorderWidth = toNumber(cfg.heatmapCellBorderWidth) ?? 1;

    return (
      <HeatmapChart
        data={data}
        xColumn={xCol}
        yColumn={yCol}
        valueColumn={valueCol}
        aggregation={aggregation as any}
        colorScheme={colorScheme}
        showValues={showValues}
        showGrid={showGrid}
        cellBorderWidth={cellBorderWidth}
        height={400}
      />
    );
  }

  // Histogram
  if (chart.chart_type === 'histogram') {
    const valueCol: string | undefined = (typeof cfg.histogramValueColumn === 'string' && cfg.histogramValueColumn)
      ? cfg.histogramValueColumn
      : (chart.x_column || undefined);
    
    if (!valueCol) {
      return <div style={{ padding: '20px', color: '#dc2626' }}>Invalid histogram config - missing value column</div>;
    }

    const binCount = typeof cfg.histogramBinCount === 'number' ? cfg.histogramBinCount : 10;
    const color = typeof cfg.histogramColor === 'string' ? cfg.histogramColor : '#3b82f6';
    const showGrid = typeof cfg.histogramShowGrid === 'boolean' ? cfg.histogramShowGrid : true;
    const showValues = typeof cfg.histogramShowValues === 'boolean' ? cfg.histogramShowValues : false;

    return (
      <HistogramChart
        data={data}
        valueColumn={valueCol}
        binCount={binCount}
        color={color}
        showGrid={showGrid}
        showValues={showValues}
        height={400}
      />
    );
  }

  // Box Plot
  if (chart.chart_type === 'boxplot') {
    const valueCol: string | undefined = (typeof cfg.boxPlotValueColumn === 'string' && cfg.boxPlotValueColumn)
      ? cfg.boxPlotValueColumn
      : (chart.x_column || undefined);
    
    if (!valueCol) {
      return <div style={{ padding: '20px', color: '#dc2626' }}>Invalid box plot config - missing value column</div>;
    }

    const categoryCol: string | undefined = (typeof cfg.boxPlotCategoryColumn === 'string' && cfg.boxPlotCategoryColumn)
      ? cfg.boxPlotCategoryColumn
      : undefined;
    const showOutliers = typeof cfg.boxPlotShowOutliers === 'boolean' ? cfg.boxPlotShowOutliers : true;
    const boxColor = typeof cfg.boxPlotBoxColor === 'string' ? cfg.boxPlotBoxColor : '#3b82f6';
    const showGrid = typeof cfg.boxPlotShowGrid === 'boolean' ? cfg.boxPlotShowGrid : true;

    return (
      <BoxPlotChart
        data={data}
        valueColumn={valueCol}
        categoryColumn={categoryCol}
        showOutliers={showOutliers}
        boxColor={boxColor}
        showGrid={showGrid}
        height={400}
      />
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
      Chart type '{chart.chart_type}' preview not supported yet
    </div>
  );
};
