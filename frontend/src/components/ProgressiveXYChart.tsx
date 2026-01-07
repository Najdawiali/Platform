import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  LabelList,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  AreaChart as RechartsAreaChart,
  Area,
} from 'recharts';

import type { DashboardChart } from '../types';
import { dashboardService } from '../services/dashboardService';

type Orientation = 'vertical' | 'horizontal';

type Aggregation = 'none' | 'sum' | 'avg' | 'min' | 'max' | 'count';
type SortOrder = 'none' | 'x_asc' | 'x_desc' | 'y_asc' | 'y_desc';

type TimeGrain = 'none' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

const COLORS = ['#4f46e5', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#a855f7', '#14b8a6', '#eab308'];

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const normalizeKey = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  return String(v);
};

const compareStrings = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const isTemporalColumnName = (name: string): boolean => {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return (
    n.includes('date') ||
    n.includes('time') ||
    n.includes('timestamp') ||
    n.includes('datetime') ||
    n.endsWith('_at') ||
    n.endsWith('_ts')
  );
};

const parseDateLike = (v: unknown): Date | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v;

  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 1e12 && v <= 4e12) return new Date(v);
    if (v >= 1e9 && v <= 4e9) return new Date(v * 1000);
    return null;
  }

  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return null;
  const looksDateLike = /^\d{4}-\d{2}-\d{2}/.test(t) || t.includes('T') || /\d{2}:\d{2}/.test(t);
  if (!looksDateLike) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  if (year < 1970 || year > 2100) return null;
  return d;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const isoWeek = (d: Date): { year: number; week: number } => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
};

const applyTimeGrain = (v: unknown, grain: TimeGrain): string => {
  if (grain === 'none') return normalizeKey(v);
  const d = parseDateLike(v);
  if (!d) return normalizeKey(v);

  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const da = d.getUTCDate();
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();

  switch (grain) {
    case 'minute':
      return `${y}-${pad2(mo)}-${pad2(da)} ${pad2(hh)}:${pad2(mm)}`;
    case 'hour':
      return `${y}-${pad2(mo)}-${pad2(da)} ${pad2(hh)}:00`;
    case 'day':
      return `${y}-${pad2(mo)}-${pad2(da)}`;
    case 'week': {
      const w = isoWeek(d);
      return `${w.year}-W${pad2(w.week)}`;
    }
    case 'month':
      return `${y}-${pad2(mo)}`;
    case 'quarter': {
      const q = Math.floor((mo - 1) / 3) + 1;
      return `${y}-Q${q}`;
    }
    case 'year':
      return String(y);
    default:
      return normalizeKey(v);
  }
};

const isTemporalColumn = (col: string, rows: Array<Record<string, any>>): boolean => {
  const sample = rows.slice(0, 50);
  const candidates = sample.map((r) => r?.[col]).filter((v) => v !== null && v !== undefined);
  if (candidates.length === 0) return false;

  let parsed = 0;
  for (const v of candidates.slice(0, 20)) {
    if (parseDateLike(v)) parsed += 1;
  }
  const ratio = parsed / Math.min(20, candidates.length);
  if (isTemporalColumnName(col)) return ratio >= 0.2;
  return ratio >= 0.8;
};

type ProgressiveXYChartProps = {
  chart: DashboardChart;
  dashboardId: string;
  orientation?: Orientation;
  windowSize?: number;
};

function pickKey(preferred: string | undefined, columns: string[] | null, fallback: string): string {
  if (preferred && columns?.includes(preferred)) return preferred;
  if (columns?.includes(fallback)) return fallback;
  if (columns && columns.length > 0) return columns[0];
  return preferred || fallback;
}

export const ProgressiveXYChart: React.FC<ProgressiveXYChartProps> = ({
  chart,
  dashboardId,
  orientation = 'vertical',
  windowSize = 50,
}) => {
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasPrev, setHasPrev] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Hard cap to prevent the browser/devtools from OOM'ing when users scroll through
  // very large datasets (especially seriesBy, which is tall rows per x-bucket).
  const maxRowsInMemory = 1000;
  // const bufferSize = 200; // How many rows to fetch when scrolling back/forward

  // Debug logging: Enabled by default in DEV mode.
  // To disable, run `localStorage.setItem('debugXYChart','0')` and reload.
  const debugEnabled = useMemo(() => {
    if (!import.meta.env.DEV) return false;
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem('debugXYChart') === '0') {
        return false;
      }
    } catch {
      // ignore
    }
    return true;
  }, []);
  
  // Debug refs and functions removed - used for performance logging
  const loadMoreCallCountRef = useRef<number>(0);
  const trimEventCountRef = useRef<number>(0);
  const recentLoadMoreBurstRef = useRef<{ at: number; count: number }>({ at: 0, count: 0 });
  const inFlightRef = useRef<boolean>(false);
  const scrollAdjustmentRef = useRef<number>(0);

  // Debug logging removed
  
  useEffect(() => {
    // Debug log removed
  }, [chart.chart_type, chart.id, debugEnabled, maxRowsInMemory, orientation, windowSize]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollLeftRef = useRef<number>(0);
  const lastScrollTopRef = useRef<number>(0);
  const lastTriggerAtRef = useRef<number>(0);
  const suppressScrollUntilRef = useRef<number>(0);

  // Track container size so we can always make the chart slightly wider than the container.
  // This guarantees a horizontal scrollbar exists, which is required for progressive loading
  // when the first page contains only a few x-buckets (e.g. seriesBy tall rows).
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const update = () => setContainerWidth(el.clientWidth || 0);
    update();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Initialize scroll position refs once the container is mounted.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    lastScrollLeftRef.current = el.scrollLeft || 0;
    lastScrollTopRef.current = el.scrollTop || 0;
  }, []);

  // Apply any pending scroll adjustments requested by trimming/prepending logic.
  useEffect(() => {
    const delta = scrollAdjustmentRef.current;
    if (!delta) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    // Suppress scroll-triggered loads caused by our own scroll adjustments.
    suppressScrollUntilRef.current = Date.now() + 500;

    if (orientation === 'vertical') {
      el.scrollLeft = Math.max(0, el.scrollLeft + delta);
      lastScrollLeftRef.current = el.scrollLeft;
    } else {
      el.scrollTop = Math.max(0, el.scrollTop + delta);
      lastScrollTopRef.current = el.scrollTop;
    }
    scrollAdjustmentRef.current = 0;
  }, [data.length, orientation]);

  const layout = orientation === 'horizontal' ? 'vertical' : 'horizontal';

  const cfg = (chart.config || {}) as Record<string, any>;

  const showGrid = useMemo(() => (typeof cfg.showGrid === 'boolean' ? cfg.showGrid : true), [cfg.showGrid]);
  const showLegend = useMemo(() => (typeof cfg.showLegend === 'boolean' ? cfg.showLegend : true), [cfg.showLegend]);
  const showDataLabels = useMemo(() => (typeof cfg.showDataLabels === 'boolean' ? cfg.showDataLabels : false), [cfg.showDataLabels]);

  const curveType = useMemo(() => (typeof cfg.curveType === 'string' && cfg.curveType ? cfg.curveType : 'monotone'), [cfg.curveType]);
  const showMarkers = useMemo(() => (typeof cfg.showMarkers === 'boolean' ? cfg.showMarkers : true), [cfg.showMarkers]);
  const areaFillOpacity = useMemo(() => {
    const v = Number(cfg.areaFillOpacity);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.2;
  }, [cfg.areaFillOpacity]);
  const isStacked = useMemo(() => (typeof cfg.isStacked === 'boolean' ? cfg.isStacked : false), [cfg.isStacked]);
  const barCornerRadius = useMemo(() => {
    const v = Number(cfg.barCornerRadius);
    return Number.isFinite(v) ? Math.max(0, Math.round(v)) : 6;
  }, [cfg.barCornerRadius]);

  const xAxes = useMemo(() => {
    const fromCfg = Array.isArray(cfg.xAxes) ? cfg.xAxes.filter((v) => typeof v === 'string') : [];
    if (fromCfg.length > 0) return fromCfg;
    const single = typeof cfg.xAxis === 'string' ? cfg.xAxis : undefined;
    const x = chart.x_column || single;
    return x ? [x] : [];
  }, [cfg.xAxes, cfg.xAxis, chart.x_column]);

  const yAxes = useMemo(() => {
    const fromCfg = Array.isArray(cfg.yAxes) ? cfg.yAxes.filter((v) => typeof v === 'string') : [];
    if (fromCfg.length > 0) return fromCfg;
    const single = typeof cfg.yAxis === 'string' ? cfg.yAxis : undefined;
    const y = chart.y_column || single;
    return y ? [y] : [];
  }, [cfg.yAxes, cfg.yAxis, chart.y_column]);

  const seriesBy = useMemo(() => (typeof cfg.seriesBy === 'string' ? cfg.seriesBy : ''), [cfg.seriesBy]);

  const xTimeGrain = useMemo<TimeGrain>(() => {
    const g = cfg.xTimeGrain;
    if (g === 'minute' || g === 'hour' || g === 'day' || g === 'week' || g === 'month' || g === 'quarter' || g === 'year' || g === 'none') return g;
    return 'none';
  }, [cfg.xTimeGrain]);
  const aggregation = useMemo<Aggregation>(() => {
    const a = cfg.aggregation;
    if (a === 'sum' || a === 'avg' || a === 'min' || a === 'max' || a === 'count' || a === 'none') return a;
    return 'none';
  }, [cfg.aggregation]);
  const sortOrder = useMemo<SortOrder>(() => {
    const s = cfg.sortOrder;
    if (s === 'x_asc' || s === 'x_desc' || s === 'y_asc' || s === 'y_desc' || s === 'none') return s;
    return 'none';
  }, [cfg.sortOrder]);

  const requestedColumns = useMemo(() => {
    const parts: string[] = [];
    for (const c of xAxes) parts.push(c);
    for (const c of yAxes) parts.push(c);
    if (seriesBy) parts.push(seriesBy);
    if (chart.x_column) parts.push(chart.x_column);
    if (chart.y_column) parts.push(chart.y_column);
    const uniq = Array.from(new Set(parts.filter((v) => typeof v === 'string' && v.trim().length > 0)));
    return uniq.length > 0 ? uniq.join(',') : undefined;
  }, [chart.x_column, chart.y_column, seriesBy, xAxes, yAxes]);

  const sortForPaging = useMemo(() => {
    const primaryX = xAxes[0] ?? chart.x_column;
    return typeof primaryX === 'string' && primaryX.trim().length > 0 ? primaryX : undefined;
  }, [chart.x_column, xAxes]);

  const xKey = useMemo(() => {
    // Backend often returns either {name,value} or {<x_column>,<y_column>}.
    const primary = xAxes[0] ?? chart.x_column;
    return pickKey(primary, columns, 'name');
  }, [chart.x_column, columns, xAxes]);

  const yKey = useMemo(() => {
    const primary = yAxes[0] ?? chart.y_column;
    return pickKey(primary, columns, 'value');
  }, [chart.y_column, columns, yAxes]);

  const xyXAxisKey = useMemo(() => {
    const primaryCol = xAxes[0] ?? '';
    const temporal = primaryCol ? (isTemporalColumnName(primaryCol) || isTemporalColumn(primaryCol, data)) : false;
    const needsComputed = xAxes.length > 1 || (temporal && xTimeGrain !== 'none');
    return needsComputed ? '__x' : xKey;
  }, [data, xAxes, xKey, xTimeGrain]);

  const baseRows = useMemo(() => {
    const primaryCol = xAxes[0] ?? '';
    const temporalPrimary = primaryCol ? (isTemporalColumnName(primaryCol) || isTemporalColumn(primaryCol, data)) : false;
    const needsComputedX = xAxes.length > 1 || (temporalPrimary && xTimeGrain !== 'none');
    if (!needsComputedX) return data;

    const temporalCols = new Set(xAxes.filter((c) => isTemporalColumnName(c) || isTemporalColumn(c, data)));

    return data.map((r) => {
      const parts =
        xAxes.length > 1
          ? xAxes
              .map((c) => {
                const raw = (r as any)?.[c];
                return temporalCols.has(c) ? applyTimeGrain(raw, xTimeGrain) : normalizeKey(raw);
              })
              .filter(Boolean)
          : [applyTimeGrain((r as any)?.[xKey], xTimeGrain)].filter(Boolean);
      return { ...(r as any), __x: parts.join(' / ') };
    });
  }, [data, xAxes, xKey, xTimeGrain]);

  const processed = useMemo(() => {
    // Debug timing removed
    // Keep raw rows if no grouping/aggregation/sort is needed.
    const needsAgg = seriesBy || aggregation !== 'none' || sortOrder !== 'none';
    if (!needsAgg) {
      // Debug log removed
      return baseRows;
    }

    const xCol = xyXAxisKey;
    const primaryY = yKey;
    const selectedY = yAxes.length > 0 ? yAxes : (primaryY ? [primaryY] : []);

    type AggStats = { sum: number; count: number; min: number | null; max: number | null };
    const groups = new Map<string, { series: Map<string, AggStats> }>();

    const ensureStats = (seriesMap: Map<string, AggStats>, seriesName: string): AggStats => {
      const existing = seriesMap.get(seriesName);
      if (existing) return existing;
      const s: AggStats = { sum: 0, count: 0, min: null, max: null };
      seriesMap.set(seriesName, s);
      return s;
    };

    for (const r of baseRows as any[]) {
      const xVal = (r as any)?.[xCol];
      const xStr = normalizeKey(xVal);
      if (!xStr) continue;

      const g = groups.get(xStr) ?? { series: new Map<string, AggStats>() };

      if (seriesBy) {
        const sName = normalizeKey((r as any)?.[seriesBy]);
        if (!sName) continue;
        const stats = ensureStats(g.series, sName);
        if (aggregation === 'count') {
          stats.count += 1;
        } else {
          const n = toNumber((r as any)?.[primaryY]);
          if (n !== null) {
            stats.sum += n;
            stats.count += 1;
            stats.min = stats.min === null ? n : Math.min(stats.min, n);
            stats.max = stats.max === null ? n : Math.max(stats.max, n);
          }
        }
      } else {
        if (aggregation === 'count') {
          const stats = ensureStats(g.series, 'count');
          stats.count += 1;
        } else {
          for (const y of selectedY) {
            const stats = ensureStats(g.series, y);
            const n = toNumber((r as any)?.[y]);
            if (n !== null) {
              stats.sum += n;
              stats.count += 1;
              stats.min = stats.min === null ? n : Math.min(stats.min, n);
              stats.max = stats.max === null ? n : Math.max(stats.max, n);
            }
          }
        }
      }

      groups.set(xStr, g);
    }

    const computeAgg = (s: AggStats): number => {
      switch (aggregation) {
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
        case 'none':
        default:
          return 0;
      }
    };

    const out = Array.from(groups.entries()).map(([xStr, g]) => {
      const obj: Record<string, any> = {};
      obj[xCol] = xStr;
      for (const [seriesName, stats] of g.series.entries()) {
        obj[seriesName] = computeAgg(stats);
      }
      return obj;
    });

    const getYForSort = (row: Record<string, any>): number => {
      if (!seriesBy) {
        if (aggregation === 'count') return Number(row['count'] ?? 0);
        let sum = 0;
        for (const y of selectedY) {
          const n = toNumber(row[y]);
          if (n !== null) sum += n;
        }
        return sum;
      }
      let sum = 0;
      for (const [k, v] of Object.entries(row)) {
        if (k === xCol) continue;
        const n = toNumber(v);
        if (n !== null) sum += n;
      }
      return sum;
    };

    if (sortOrder !== 'none') {
      out.sort((a, b) => {
        if (sortOrder === 'x_asc') return compareStrings(String(a[xCol] ?? ''), String(b[xCol] ?? ''));
        if (sortOrder === 'x_desc') return compareStrings(String(b[xCol] ?? ''), String(a[xCol] ?? ''));
        if (sortOrder === 'y_asc') return getYForSort(a) - getYForSort(b);
        if (sortOrder === 'y_desc') return getYForSort(b) - getYForSort(a);
        return 0;
      });
    }

    // Debug log removed

    return out;
  }, [aggregation, baseRows, seriesBy, sortOrder, xAxes.length, xyXAxisKey, yAxes, yKey, debugEnabled]);

  const seriesKeys = useMemo(() => {
    if (seriesBy) {
      const keys = new Set<string>();
      for (const r of processed as any[]) {
        for (const k of Object.keys(r || {})) {
          if (k === xyXAxisKey) continue;
          keys.add(k);
        }
      }
      return Array.from(keys);
    }
    if (aggregation === 'count') return ['count'];
    return yAxes.length > 0 ? yAxes : [yKey];
  }, [aggregation, processed, seriesBy, xyXAxisKey, yAxes, yKey]);

  const resetAndLoad = useCallback(async () => {
    inFlightRef.current = true;
    setData([]);
    setColumns(null);
    setHasMore(true);
    setHasPrev(false);
    setOffset(0);
    setError(null);

    // Load first window
    setLoading(true);
    try {
      const result = await dashboardService.getChartAggregatedData(dashboardId, chart.id, {
        columns: requestedColumns,
        offset: 0,
        limit: windowSize,
        sortColumn: sortForPaging,
        sortDir: sortForPaging ? 'asc' : undefined,
      });
      const firstRows = Array.isArray(result?.data) ? result.data : [];
      setColumns(Array.isArray(result?.columns) ? result.columns : null);

      // Progressive mode: only fetch additional pages when the user scrolls.
      const metaHasMore = Boolean((result as any)?.metadata?.has_more);
      setData(firstRows);
      setOffset(firstRows.length);
      setHasMore(metaHasMore);
      setHasPrev(false);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[XY debug] resetAndLoad failed', e);
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : e?.message || 'Failed to load chart data');
      setHasMore(false);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [chart.id, dashboardId, requestedColumns, sortForPaging, windowSize]);

  useEffect(() => {
    resetAndLoad();
  }, [resetAndLoad]);

  const loadMore = useCallback(async () => {
    if (inFlightRef.current) return;
    if (loading || !hasMore) return;

    inFlightRef.current = true;
    loadMoreCallCountRef.current += 1;

    // Detect accidental rapid-fire load loops (usually caused by nearEnd logic).
    const now = Date.now();
    if (now - recentLoadMoreBurstRef.current.at < 800) {
      recentLoadMoreBurstRef.current.count += 1;
    } else {
      recentLoadMoreBurstRef.current = { at: now, count: 1 };
    }
    if (debugEnabled && recentLoadMoreBurstRef.current.count >= 4) {
      // eslint-disable-next-line no-console
      console.warn('[XY debug] rapid loadMore burst', { count: recentLoadMoreBurstRef.current.count, at: now });
    }

    setLoading(true);
    try {
      const result = await dashboardService.getChartAggregatedData(dashboardId, chart.id, {
        columns: requestedColumns,
        offset,
        limit: windowSize,
        sortColumn: sortForPaging,
        sortDir: sortForPaging ? 'asc' : undefined,
      });
      const next = Array.isArray(result?.data) ? result.data : [];
      setColumns((prev) => prev ?? (Array.isArray(result?.columns) ? result.columns : null));
      setData((prev) => {
        if (next.length === 0) return prev;
        const merged = [...prev, ...next];
        if (merged.length <= maxRowsInMemory) return merged;
        // Keep the newest rows only.
        if (debugEnabled) {
          trimEventCountRef.current += 1;
          // Debug log removed
        }
        
        const droppedCount = merged.length - maxRowsInMemory;
        if (droppedCount > 0) {
           const pxPerPoint = chart.chart_type === 'bar' ? (orientation === 'vertical' ? 55 : 36) : (orientation === 'vertical' ? 45 : 28);
           scrollAdjustmentRef.current = -1 * (droppedCount * pxPerPoint);
        }

        setHasPrev(true); // We trimmed from the start, so we can scroll back
        return merged.slice(merged.length - maxRowsInMemory);
      });
      setOffset((prev) => prev + next.length);
      const metaHasMore = Boolean((result as any)?.metadata?.has_more);
      setHasMore(metaHasMore);
      setError(null);

    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[XY debug] loadMore failed', e);
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : e?.message || 'Failed to load more data');
      setHasMore(false);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [chart.id, dashboardId, hasMore, loading, offset, requestedColumns, sortForPaging, windowSize]);

  const loadPrev = useCallback(async () => {
    if (inFlightRef.current) return;
    if (loading || !hasPrev) return;

    // Calculate where to fetch from.
    // Current data starts at: offset - data.length
    // We want to fetch 'windowSize' rows BEFORE that.
    const currentStart = Math.max(0, offset - data.length);
    if (currentStart === 0) {
      setHasPrev(false);
      return;
    }

    const fetchLimit = Math.min(windowSize, currentStart);
    const fetchOffset = Math.max(0, currentStart - fetchLimit);

    inFlightRef.current = true;
    setLoading(true);

    try {
      const result = await dashboardService.getChartAggregatedData(dashboardId, chart.id, {
        columns: requestedColumns,
        offset: fetchOffset,
        limit: fetchLimit,
        sortColumn: sortForPaging,
        sortDir: sortForPaging ? 'asc' : undefined,
      });
      const prevRows = Array.isArray(result?.data) ? result.data : [];
      
      setData((currentData) => {
        if (prevRows.length === 0) return currentData;
        const merged = [...prevRows, ...currentData];
        
        if (merged.length <= maxRowsInMemory) return merged;
        
        // Trim from the END (newest data) to make room for older data
        // Debug log removed
        
        // When loading previous data, we are adding rows to the start.
        // We need to shift the scroll position forward by the size of the added rows
        // so the user stays looking at the same data point.
        const pxPerPoint = chart.chart_type === 'bar' ? (orientation === 'vertical' ? 55 : 36) : (orientation === 'vertical' ? 45 : 28);
        scrollAdjustmentRef.current = prevRows.length * pxPerPoint;

        setHasMore(true); // We trimmed the end, so we can scroll forward again
        return merged.slice(0, maxRowsInMemory);
      });

      // If we reached the absolute beginning (offset 0), disable hasPrev
      if (fetchOffset === 0) {
        setHasPrev(false);
      }
      
      // Note: We do NOT update 'offset' here because 'offset' tracks the *end* of the loaded range
      // relative to the total dataset. When we load previous data and trim the end, the 'offset'
      // effectively decreases.
      // New end offset = old end offset - (number of rows trimmed from end)
      // But calculating that exactly is tricky with async state.
      // A simpler invariant: offset = (start_index_of_data) + data.length
      // We know start_index changed to fetchOffset.
      // So:
      setOffset(fetchOffset + Math.min(maxRowsInMemory, prevRows.length + data.length));

    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[XY debug] loadPrev failed', e);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [chart.id, dashboardId, data.length, hasPrev, loading, offset, requestedColumns, sortForPaging, windowSize]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (inFlightRef.current) return;

    // Ignore scroll events caused by layout changes / programmatic adjustments.
    const now = Date.now();
    if (now < suppressScrollUntilRef.current) {
      lastScrollLeftRef.current = el.scrollLeft || 0;
      lastScrollTopRef.current = el.scrollTop || 0;
      return;
    }

    const thresholdPx = 120;
    const cooldownMs = 350;
    const canTrigger = now - lastTriggerAtRef.current > cooldownMs;

    if (orientation === 'vertical') {
      // Horizontal scrolling (more points along X)
      const dx = (el.scrollLeft || 0) - (lastScrollLeftRef.current || 0);
      const nearEnd = el.scrollWidth - (el.scrollLeft + el.clientWidth) < thresholdPx;
      const nearStart = el.scrollLeft < thresholdPx;

      lastScrollLeftRef.current = el.scrollLeft || 0;
      
      if (nearEnd && hasMore && dx > 0 && canTrigger) {
        lastTriggerAtRef.current = now;
        loadMore();
      } else if (nearStart && hasPrev && dx < 0 && canTrigger) {
        lastTriggerAtRef.current = now;
        loadPrev();
      }
      return;
    }

    // Vertical scrolling (more points along Y)
    const dy = (el.scrollTop || 0) - (lastScrollTopRef.current || 0);
    const nearEnd = el.scrollHeight - (el.scrollTop + el.clientHeight) < thresholdPx;
    const nearStart = el.scrollTop < thresholdPx;

    lastScrollTopRef.current = el.scrollTop || 0;

    if (nearEnd && hasMore && dy > 0 && canTrigger) {
      lastTriggerAtRef.current = now;
      loadMore();
    } else if (nearStart && hasPrev && dy < 0 && canTrigger) {
      lastTriggerAtRef.current = now;
      loadPrev();
    }
  }, [hasMore, hasPrev, loadMore, loadPrev, orientation]);

  // Periodic heartbeat so we can correlate heap growth with user actions.
  useEffect(() => {
    if (!debugEnabled) return;
    const id = window.setInterval(() => {
      // Heartbeat removed
    }, 3000);
    return () => window.clearInterval(id);
  }, [debugEnabled]);

  const chartWidth = useMemo(() => {
    if (orientation !== 'vertical') return '100%';
    // Keep the chart just a bit wider than its container so a scrollbar always exists,
    // allowing the user to trigger progressive loading via scrolling.
    // Make the overflow meaningfully scrollable; otherwise even a tiny scroll puts us at
    // the end and triggers rapid consecutive loads.
    const thresholdPx = 120;
    const minWidth = Math.max(800, (containerWidth || 0) + thresholdPx * 2 + 1);
    const pxPerPoint = chart.chart_type === 'bar' ? 55 : 45;
    return Math.max(minWidth, processed.length * pxPerPoint);
  }, [containerWidth, processed.length, orientation, chart.chart_type]);

  const chartHeight = useMemo(() => {
    if (orientation !== 'horizontal') return 450;
    const minHeight = 450;
    const pxPerPoint = chart.chart_type === 'bar' ? 36 : 28;
    return Math.max(minHeight, processed.length * pxPerPoint + 120);
  }, [processed.length, orientation, chart.chart_type]);

  const commonGridAndTooltip = (
    <>
      {showGrid ? <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /> : null}
      <Tooltip />
    </>
  );

  const legend = showLegend ? (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 14,
        padding: '10px 12px',
        borderBottom: '1px solid #e2e8f0',
        background: 'white',
        fontSize: 12,
        color: '#475569',
        fontWeight: 700,
        flexWrap: 'wrap',
      }}
    >
      {seriesKeys.map((k, i) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length] }} />
          <div>{k}</div>
        </div>
      ))}
    </div>
  ) : null;

  if (error) {
    return (
      <div
        style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          padding: 16,
          color: '#b91c1c',
          fontSize: 13,
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', width: '100%', maxWidth: '100%' }}>
      {legend}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          width: '100%',
          overflowX: orientation === 'vertical' ? 'auto' : 'hidden',
          overflowY: orientation === 'horizontal' ? 'auto' : 'hidden',
          maxHeight: orientation === 'horizontal' ? 650 : undefined,
          // Avoid scroll chaining causing accidental page scroll
          overscrollBehavior: 'contain',
          opacity: loading && data.length === 0 ? 0.6 : 1,
        }}
      >
        <div style={{ width: chartWidth, height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart.chart_type === 'bar' ? (
            <BarChart data={processed} layout={layout as any} margin={{ top: 20, right: 30, left: layout === 'vertical' ? 120 : 20, bottom: 80 }}>
              {commonGridAndTooltip}
              {layout === 'horizontal' ? (
                <>
                  <XAxis
                    dataKey={xyXAxisKey}
                    type="category"
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={100}
                    style={{ fontSize: '11px', fill: '#64748b' }}
                  />
                  <YAxis type="number" style={{ fontSize: '12px', fill: '#64748b' }} />
                </>
              ) : (
                <>
                  <XAxis type="number" style={{ fontSize: '11px', fill: '#64748b' }} />
                  <YAxis dataKey={xyXAxisKey} type="category" width={120} style={{ fontSize: '12px', fill: '#64748b' }} />
                </>
              )}
              {seriesKeys.map((k, i) => (
                <Bar
                  key={k}
                  dataKey={k}
                  fill={COLORS[i % COLORS.length]}
                  maxBarSize={50}
                  stackId={seriesBy && isStacked ? 'stack' : undefined}
                  radius={layout === 'vertical' ? [0, barCornerRadius, barCornerRadius, 0] : [barCornerRadius, barCornerRadius, 0, 0]}
                  isAnimationActive={false} // Disable animation for performance
                >
                  {showDataLabels ? <LabelList dataKey={k} position={layout === 'vertical' ? 'right' : 'top'} /> : null}
                </Bar>
              ))}
            </BarChart>
          ) : chart.chart_type === 'area' ? (
            <RechartsAreaChart data={processed} layout={layout as any} margin={{ top: 20, right: 30, left: layout === 'vertical' ? 120 : 20, bottom: 80 }}>
              {commonGridAndTooltip}
              <XAxis
                dataKey={layout === 'horizontal' ? xyXAxisKey : undefined}
                type={layout === 'vertical' ? 'number' : 'category'}
                interval={0}
                angle={layout === 'horizontal' ? -35 : 0}
                textAnchor={layout === 'horizontal' ? 'end' : 'start'}
                height={layout === 'horizontal' ? 100 : undefined}
                style={{ fontSize: '11px', fill: '#64748b' }}
              />
              <YAxis
                dataKey={layout === 'vertical' ? xyXAxisKey : undefined}
                type={layout === 'vertical' ? 'category' : 'number'}
                width={layout === 'vertical' ? 120 : undefined}
                style={{ fontSize: '12px', fill: '#64748b' }}
              />
              {seriesKeys.map((k, i) => (
                <Area
                  key={k}
                  type={curveType as any}
                  dataKey={k}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={areaFillOpacity}
                  strokeWidth={2}
                  dot={showMarkers}
                  stackId={seriesBy && isStacked ? 'stack' : undefined}
                  isAnimationActive={false} // Disable animation for performance
                >
                  {showDataLabels ? <LabelList dataKey={k} position="top" /> : null}
                </Area>
              ))}
            </RechartsAreaChart>
          ) : (
            <RechartsLineChart data={processed} layout={layout as any} margin={{ top: 20, right: 30, left: layout === 'vertical' ? 120 : 20, bottom: 80 }}>
              {commonGridAndTooltip}
              <XAxis
                dataKey={layout === 'horizontal' ? xyXAxisKey : undefined}
                type={layout === 'vertical' ? 'number' : 'category'}
                interval={0}
                angle={layout === 'horizontal' ? -35 : 0}
                textAnchor={layout === 'horizontal' ? 'end' : 'start'}
                height={layout === 'horizontal' ? 100 : undefined}
                style={{ fontSize: '11px', fill: '#64748b' }}
              />
              <YAxis
                dataKey={layout === 'vertical' ? xyXAxisKey : undefined}
                type={layout === 'vertical' ? 'category' : 'number'}
                width={layout === 'vertical' ? 120 : undefined}
                style={{ fontSize: '12px', fill: '#64748b' }}
              />
              {seriesKeys.map((k, i) => (
                <Line key={k} type={curveType as any} dataKey={k} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={showMarkers} isAnimationActive={false}>
                  {showDataLabels ? <LabelList dataKey={k} position="top" /> : null}
                </Line>
              ))}
            </RechartsLineChart>
          )}
        </ResponsiveContainer>
      </div>
      </div>
    </div>
  );
};
