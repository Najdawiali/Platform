import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';

import { GaugeChart } from './GaugeChart';
import { FunnelChart } from './FunnelChart';
import { ScatterPlot } from './ScatterPlot';
import { HeatmapChart } from './HeatmapChart';
import { HistogramChart } from './HistogramChart';
import { BoxPlotChart } from './BoxPlotChart';
import { dashboardService } from '../services/dashboardService';
import { savedQueryService } from '../services/savedQueryService';

type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'scatter' | 'radar' | 'funnel' | 'kpi' | 'gauge' | 'table' | 'heatmap' | 'histogram' | 'boxplot';

type Aggregation = 'none' | 'sum' | 'avg' | 'min' | 'max' | 'count';
type SortOrder = 'none' | 'x_asc' | 'x_desc' | 'y_asc' | 'y_desc';
type BarOrientation = 'vertical' | 'horizontal';
type CurveType = 'linear' | 'monotone';

type PieAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count';
type PieSortOrder = 'value_desc' | 'value_asc' | 'label_asc' | 'label_desc';
type PieLabelMode = 'none' | 'percent' | 'value' | 'both';

type RadarAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count';
type RadarSortOrder = 'value_desc' | 'value_asc' | 'label_asc' | 'label_desc';
type RadarAxisMode = 'categories' | 'metrics';

type FunnelAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count';
type FunnelSortOrder = 'value_desc' | 'value_asc' | 'label_asc' | 'label_desc';

type KpiAggregation = 'sum' | 'avg' | 'min' | 'max' | 'count';

type GaugeAggregation = 'first' | 'last' | 'sum' | 'avg' | 'min' | 'max' | 'count';
type TableSortDir = 'asc' | 'desc';
type TableMetricAgg = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct';

type TableMetric = {
  agg: TableMetricAgg;
  column: string; // column name, or '*' for count(*)
  alias: string; // output column name
};

type TimeGrain = 'none' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface SQLVisualizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  page?: number;
  totalPages?: number;
  columns: string[];
  rows: Array<Record<string, any>>;
  query?: string;
  sources?: any[];
  initialConfig?: Record<string, any>; // Added to support restoring state
  onConfigChange?: (config: {
    chartType: ChartType;
    title: string;
    xAxis: string;
    yAxis: string;
    config: Record<string, any>;
  }) => void;
  onSaveSuccess?: () => void;
  mode?: 'config' | 'sql_direct';
}

const COLORS = ['#4f46e5', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#a855f7', '#14b8a6', '#eab308'];

const isNumeric = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return false;
    const n = Number(t);
    return Number.isFinite(n);
  }
  return false;
};

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

const inferNumericColumns = (columns: string[], rows: Array<Record<string, any>>): string[] => {
  const sample = rows.slice(0, 50);
  return columns.filter((c) => sample.some((r) => isNumeric(r?.[c])));
};

const inferCategoricalColumns = (columns: string[], numericColumns: string[]): string[] => {
  return columns.filter((c) => !numericColumns.includes(c));
};

const normalizeKey = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  return String(v);
};

const compareStrings = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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
    // Heuristic: epoch seconds / ms
    if (v >= 1e12 && v <= 4e12) return new Date(v);
    if (v >= 1e9 && v <= 4e9) return new Date(v * 1000);
    return null;
  }

  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;

  // Avoid parsing plain numeric strings (often IDs).
  if (/^\d+$/.test(t)) return null;

  // Quick checks for common date/timestamp patterns.
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
  // ISO week date, using UTC to avoid timezone drift.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday in current week decides the year.
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

type MultiSelectOptionGroup = { label: string; options: string[] };

const MultiSelectChipField: React.FC<{
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  groups: MultiSelectOptionGroup[];
}> = ({ value, onChange, placeholder, groups }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const draggingRef = useRef<string | null>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const toggleValue = useCallback(
    (col: string) => {
      onChange(value.includes(col) ? value.filter((v) => v !== col) : [...value, col]);
    },
    [onChange, value]
  );

  const removeValue = useCallback(
    (col: string) => {
      onChange(value.filter((v) => v !== col));
    },
    [onChange, value]
  );

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setOpen((prev) => !prev);
          if (e.key === 'Escape') setOpen(false);
        }}
        style={{
          width: '100%',
          minHeight: '40px',
          padding: '8px 10px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          fontSize: '12px',
          fontWeight: 700,
          color: '#0f172a',
          backgroundColor: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        {value.length === 0 ? <span style={{ color: '#64748b', fontWeight: 700 }}>{placeholder ?? 'Select columns'}</span> : null}
        {value.map((col) => (
          <div
            key={col}
            draggable
            onDragStart={() => {
              draggingRef.current = col;
            }}
            onDragEnd={(e) => {
              const dragged = draggingRef.current;
              draggingRef.current = null;
              if (!dragged) return;
              const rect = rootRef.current?.getBoundingClientRect();
              if (!rect) return;
              const padding = 6;
              const outside =
                e.clientX < rect.left - padding ||
                e.clientX > rect.right + padding ||
                e.clientY < rect.top - padding ||
                e.clientY > rect.bottom + padding;
              if (outside) removeValue(dragged);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 8px',
              borderRadius: '999px',
              border: '1px solid #e2e8f0',
              backgroundColor: 'white',
              maxWidth: '100%',
            }}
            title="Drag out to remove"
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{col}</span>
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                removeValue(col);
              }}
              aria-label={`Remove ${col}`}
              style={{
                border: '1px solid #e2e8f0',
                backgroundColor: 'white',
                borderRadius: '6px',
                padding: '0 6px',
                fontWeight: 900,
                cursor: 'pointer',
                lineHeight: '18px',
                height: '20px',
              }}
            >
              -
            </button>
          </div>
        ))}
      </div>

      {open ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 50,
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            backgroundColor: 'white',
            boxShadow: '0 10px 18px rgba(15, 23, 42, 0.08)',
            overflow: 'hidden',
          }}
        >
          <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '6px' }}>
            {groups
              .filter((g) => g.options.length > 0)
              .map((g) => (
                <div key={g.label} style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', padding: '6px 6px 4px' }}>{g.label}</div>
                  {g.options.map((col) => {
                    const selected = value.includes(col);
                    return (
                      <div
                        key={col}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleValue(col)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') toggleValue(col);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: selected ? '#eef2ff' : 'transparent',
                          color: '#0f172a',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col}</span>
                        <span style={{ fontSize: '12px', fontWeight: 900, color: selected ? '#4f46e5' : '#94a3b8' }}>{selected ? '✓' : '+'}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const Icon: React.FC<{
  label: string;
  onHoverIn?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  onHoverOut?: () => void;
  children: React.ReactNode;
}> = ({ label, onHoverIn, onHoverOut, children }) => (
  <span
    aria-label={label}
    onMouseEnter={onHoverIn}
    onMouseLeave={onHoverOut}
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}
  >
    {children}
  </span>
);

const chartTypeMeta: Record<ChartType, { label: string; help: string; icon: React.ReactNode }> = {
  bar: {
    label: 'Bar',
    help: 'Compare values across categories side by side.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 14V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M2 14H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4.5 12V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 12V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M11.5 12V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  line: {
    label: 'Line',
    help: 'Track trends and changes over time.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 14V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M2 14H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4 11L7 8L9.5 10L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  area: {
    label: 'Area',
    help: 'Show cumulative totals or volume over time.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 14V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M2 14H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4 11L7 8L9.5 10L13 5V14H4V11Z" fill="currentColor" opacity="0.25" />
        <path d="M4 11L7 8L9.5 10L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  pie: {
    label: 'Pie',
    help: 'Display proportions of a whole.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 2a6 6 0 1 0 6 6H8V2Z" fill="currentColor" opacity="0.25" />
        <path d="M8 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 2a6 6 0 1 0 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  donut: {
    label: 'Donut',
    help: 'Compare parts of a whole with a central focus.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="8" cy="8" r="2.6" fill="white" />
        <path d="M8 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  scatter: {
    label: 'Scatter',
    help: 'Reveal relationships or correlations between variables.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 14V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M2 14H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="5" cy="10.5" r="1.2" fill="currentColor" />
        <circle cx="8" cy="8" r="1.2" fill="currentColor" />
        <circle cx="11.5" cy="5.5" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  radar: {
    label: 'Radar',
    help: 'Compare multiple metrics across categories.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 2l5 3v6l-5 3-5-3V5l5-3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 4.5l3 1.8v3.4l-3 1.8-3-1.8V6.3l3-1.8Z" fill="currentColor" opacity="0.22" />
        <path d="M8 2v12" stroke="currentColor" strokeWidth="1" opacity="0.6" />
        <path d="M3 5l10 6" stroke="currentColor" strokeWidth="1" opacity="0.6" />
        <path d="M13 5L3 11" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      </svg>
    ),
  },
  funnel: {
    label: 'Funnel',
    help: 'Visualize stages in a process and drop-offs.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 3h10l-4.2 5v4l-1.6 1V8L3 3Z" fill="currentColor" opacity="0.25" />
        <path d="M3 3h10l-4.2 5v4l-1.6 1V8L3 3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  kpi: {
    label: 'KPI',
    help: 'Highlight a single key performance metric.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 12V4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M3 12H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M5 10l2-2 2 2 3-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  gauge: {
    label: 'Gauge',
    help: 'Show progress toward a target or goal.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 11a5 5 0 1 1 10 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M8 8l3-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="8" r="1" fill="currentColor" />
      </svg>
    ),
  },
  table: {
    label: 'Table',
    help: 'View detailed data in rows and columns.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 6.5h11" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 3v10" stroke="currentColor" strokeWidth="1.2" />
        <path d="M10 3v10" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  heatmap: {
    label: 'Heatmap',
    help: 'Show correlation between two categorical dimensions using color intensity.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="3.5" height="3.5" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="0.8" />
        <rect x="6" y="2" width="3.5" height="3.5" fill="currentColor" opacity="0.6" stroke="currentColor" strokeWidth="0.8" />
        <rect x="10" y="2" width="3.5" height="3.5" fill="currentColor" opacity="0.9" stroke="currentColor" strokeWidth="0.8" />
        <rect x="2" y="6" width="3.5" height="3.5" fill="currentColor" opacity="0.6" stroke="currentColor" strokeWidth="0.8" />
        <rect x="6" y="6" width="3.5" height="3.5" fill="currentColor" opacity="0.9" stroke="currentColor" strokeWidth="0.8" />
        <rect x="10" y="6" width="3.5" height="3.5" fill="currentColor" opacity="0.5" stroke="currentColor" strokeWidth="0.8" />
        <rect x="2" y="10" width="3.5" height="3.5" fill="currentColor" opacity="0.4" stroke="currentColor" strokeWidth="0.8" />
        <rect x="6" y="10" width="3.5" height="3.5" fill="currentColor" opacity="0.7" stroke="currentColor" strokeWidth="0.8" />
        <rect x="10" y="10" width="3.5" height="3.5" fill="currentColor" opacity="0.8" stroke="currentColor" strokeWidth="0.8" />
      </svg>
    ),
  },
  histogram: {
    label: 'Histogram',
    help: 'Display the distribution of numeric values in bins.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 14V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M2 14H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="3.5" y="9" width="1.8" height="5" fill="currentColor" opacity="0.7" />
        <rect x="5.8" y="6" width="1.8" height="8" fill="currentColor" opacity="0.7" />
        <rect x="8.1" y="4" width="1.8" height="10" fill="currentColor" opacity="0.7" />
        <rect x="10.4" y="7" width="1.8" height="7" fill="currentColor" opacity="0.7" />
      </svg>
    ),
  },
  boxplot: {
    label: 'Box & Whisker',
    help: 'Display distribution statistics (min, Q1, median, Q3, max) and outliers.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 14V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M2 14H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="5" y="5" width="6" height="6" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.2" />
        <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" />
        <line x1="8" y1="3" x2="8" y2="5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="8" y1="11" x2="8" y2="13" stroke="currentColor" strokeWidth="1.2" />
        <line x1="6.5" y1="3" x2="9.5" y2="3" stroke="currentColor" strokeWidth="1.2" />
        <line x1="6.5" y1="13" x2="9.5" y2="13" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="12" cy="4" r="0.8" fill="currentColor" />
      </svg>
    ),
  },
};

export const SQLVisualizeModal: React.FC<SQLVisualizeModalProps> = ({ isOpen, onClose, page, totalPages, columns, rows, query, sources, onConfigChange, onSaveSuccess, mode = 'config', initialConfig }) => {
  const navigate = useNavigate();
  const numericColumns = useMemo(() => inferNumericColumns(columns, rows), [columns, rows]);
  const nonNumericColumns = useMemo(() => inferCategoricalColumns(columns, numericColumns), [columns, numericColumns]);

  const [layoutReady, setLayoutReady] = useState(false);
  
  // Save insight state
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  
  // Edit mode tracking - extracted from initialConfig
  const [editDashboardId, setEditDashboardId] = useState<string | null>(null);
  const [editChartId, setEditChartId] = useState<string | null>(null);

  const [chartType, setChartType] = useState<ChartType>('bar');
    const [iconTooltip, setIconTooltip] = useState<null | { text: string; x: number; y: number }>(null);

    const showIconTooltip = useCallback((text: string, targetEl: HTMLElement) => {
      const rect = targetEl.getBoundingClientRect();
      setIconTooltip({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    }, []);

    const hideIconTooltip = useCallback(() => {
      setIconTooltip(null);
    }, []);
  const [chartTitle, setChartTitle] = useState<string>('');

  // X/Y selections (multi-select).
  // Keep backward-compatible primary xAxis/yAxis via the first selected entry.
  const [xAxes, setXAxes] = useState<string[]>([]);
  const [yAxes, setYAxes] = useState<string[]>([]);
  const xAxis = xAxes[0] ?? '';
  const yAxis = yAxes[0] ?? '';

  // Time breakdown for temporal X axis (only shown when X is date/time-like).
  const [xTimeGrain, setXTimeGrain] = useState<TimeGrain>('none');

  // Bar/Line/Area advanced options
  const [seriesBy, setSeriesBy] = useState<string>('');
  const [aggregation, setAggregation] = useState<Aggregation>('none');
  const [sortOrder, setSortOrder] = useState<SortOrder>('none');

  const [barOrientation, setBarOrientation] = useState<BarOrientation>('vertical');
  const [isStacked, setIsStacked] = useState<boolean>(false);

  const [curveType, setCurveType] = useState<CurveType>('monotone');
  const [showMarkers, setShowMarkers] = useState<boolean>(true);
  const [areaFillOpacity, setAreaFillOpacity] = useState<number>(0.2);

  // Pie / Donut options
  const [pieAggregation, setPieAggregation] = useState<PieAggregation>('sum');
  const [pieSortOrder, setPieSortOrder] = useState<PieSortOrder>('value_desc');
  const [pieLabelMode, setPieLabelMode] = useState<PieLabelMode>('percent');
  const [pieTopN, setPieTopN] = useState<number>(8);
  const [pieGroupOther, setPieGroupOther] = useState<boolean>(true);
  const [donutInnerRadius, setDonutInnerRadius] = useState<number>(70);

  // Radar options
  const [radarAggregation, setRadarAggregation] = useState<RadarAggregation>('sum');
  const [radarSortOrder, setRadarSortOrder] = useState<RadarSortOrder>('value_desc');
  const [radarTopN, setRadarTopN] = useState<number>(10);
  const [radarGroupOther, setRadarGroupOther] = useState<boolean>(false);
  const [radarFillOpacity, setRadarFillOpacity] = useState<number>(0.15);
  const [radarAxisMode, setRadarAxisMode] = useState<RadarAxisMode>('categories');
  const [radarSeriesBy, setRadarSeriesBy] = useState<string>('');
  const [radarNormalizeMetrics, setRadarNormalizeMetrics] = useState<boolean>(true);
  const [radarUsePerMetricAggregation, setRadarUsePerMetricAggregation] = useState<boolean>(false);
  const [radarMetricAggregations, setRadarMetricAggregations] = useState<Record<string, RadarAggregation>>({});

  // Funnel options
  const [funnelAggregation, setFunnelAggregation] = useState<FunnelAggregation>('sum');
  const [funnelSortOrder, setFunnelSortOrder] = useState<FunnelSortOrder>('value_desc');
  const [funnelTopN, setFunnelTopN] = useState<number>(10);
  const [funnelGroupOther, setFunnelGroupOther] = useState<boolean>(false);
  const [funnelShowPercentOfFirst, setFunnelShowPercentOfFirst] = useState<boolean>(true);

  // KPI options
  const [kpiAggregation, setKpiAggregation] = useState<KpiAggregation>('sum');
  const [kpiDecimals, setKpiDecimals] = useState<number>(0);
  const [kpiPrefix, setKpiPrefix] = useState<string>('');
  const [kpiSuffix, setKpiSuffix] = useState<string>('');

  // Gauge options
  const [gaugeAggregation, setGaugeAggregation] = useState<GaugeAggregation>('last');
  const [gaugeSortByColumn, setGaugeSortByColumn] = useState<string>('');
  const [gaugeMinValue, setGaugeMinValue] = useState<number>(0);
  const [gaugeUseAutoMax, setGaugeUseAutoMax] = useState<boolean>(true);
  const [gaugeMaxValue, setGaugeMaxValue] = useState<number>(100);
  const [gaugeDecimals, setGaugeDecimals] = useState<number>(0);
  const [gaugePrefix, setGaugePrefix] = useState<string>('');
  const [gaugeSuffix, setGaugeSuffix] = useState<string>('');
  const [gaugeUnit, setGaugeUnit] = useState<string>('');
  const [gaugeThresholdLow, setGaugeThresholdLow] = useState<number>(33);
  const [gaugeThresholdMedium, setGaugeThresholdMedium] = useState<number>(66);
  const [gaugeShowLegend, setGaugeShowLegend] = useState<boolean>(true);
  const [gaugeShowPercent, setGaugeShowPercent] = useState<boolean>(true);
  const [gaugeShowValue, setGaugeShowValue] = useState<boolean>(true);

  // Table options
  const [tableRowLimit, setTableRowLimit] = useState<number>(200);
  const [tableFullData, setTableFullData] = useState<boolean>(false);
  const [tableWrap, setTableWrap] = useState<boolean>(false);
  const [tableDense, setTableDense] = useState<boolean>(false);
  const [tableSortColumn, setTableSortColumn] = useState<string>('');
  const [tableSortDir, setTableSortDir] = useState<TableSortDir>('asc');
  const [tableVisibleColumns, setTableVisibleColumns] = useState<string[]>([]);
  const [tableEnableAggregation, setTableEnableAggregation] = useState<boolean>(false);
  const [tableGroupByColumns, setTableGroupByColumns] = useState<string[]>([]);
  const [tableMetrics, setTableMetrics] = useState<TableMetric[]>([]);

  // Scatter options
  const [scatterColorBy, setScatterColorBy] = useState<string>('');
  const [scatterSizeBy, setScatterSizeBy] = useState<string>('');
  const [scatterPointOpacity, setScatterPointOpacity] = useState<number>(0.85);
  const [scatterMaxPointSize, setScatterMaxPointSize] = useState<number>(70);

  // Heatmap options
  const [heatmapAggregation, setHeatmapAggregation] = useState<'sum' | 'avg' | 'count' | 'min' | 'max'>('sum');
  const [heatmapValueColumn, setHeatmapValueColumn] = useState<string>('');
  const [heatmapShowValues, setHeatmapShowValues] = useState<boolean>(true);
  const [heatmapShowGrid, setHeatmapShowGrid] = useState<boolean>(true);
  const [heatmapCellBorderWidth, setHeatmapCellBorderWidth] = useState<number>(1);
  const [heatmapColorScheme, setHeatmapColorScheme] = useState<string[]>(['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444']);

  // Histogram options
  const [histogramValueColumn, setHistogramValueColumn] = useState<string>('');
  const [histogramBinCount, setHistogramBinCount] = useState<number>(10);
  const [histogramColor, setHistogramColor] = useState<string>('#3b82f6');
  const [histogramShowGrid, setHistogramShowGrid] = useState<boolean>(true);
  const [histogramShowValues, setHistogramShowValues] = useState<boolean>(false);

  // Box plot options
  const [boxPlotValueColumn, setBoxPlotValueColumn] = useState<string>('');
  const [boxPlotCategoryColumn, setBoxPlotCategoryColumn] = useState<string>('');
  const [boxPlotShowOutliers, setBoxPlotShowOutliers] = useState<boolean>(true);
  const [boxPlotBoxColor, setBoxPlotBoxColor] = useState<string>('#3b82f6');
  const [boxPlotShowGrid, setBoxPlotShowGrid] = useState<boolean>(true);

  // Global display options
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [showDataLabels, setShowDataLabels] = useState<boolean>(false);
  const [barCornerRadius, setBarCornerRadius] = useState<number>(6);

  // Color options
  const [colorScheme, setColorScheme] = useState<'default' | 'custom' | 'specific'>('default');
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [colorMapping, setColorMapping] = useState<Record<string, string>>({});

  // Restore state from initialConfig
  useEffect(() => {
    if (initialConfig && isOpen) {
      // Extract edit mode tracking IDs
      if (initialConfig.editDashboardId) {
        setEditDashboardId(initialConfig.editDashboardId);
      }
      if (initialConfig.editChartId) {
        setEditChartId(initialConfig.editChartId);
      }
      
      // Restore Insight Name & Description if provided (for editing)
      // Note: We do NOT sync chartTitle to saveName here. They should be distinct.
      if (initialConfig.insightName) {
        setSaveName(initialConfig.insightName);
      }
      if (initialConfig.insightDescription) {
        setSaveDescription(initialConfig.insightDescription);
      }

      if (initialConfig.chartType) setChartType(initialConfig.chartType as ChartType);
      if (initialConfig.chartTitle) setChartTitle(initialConfig.chartTitle);
      
      // Axes
      if (Array.isArray(initialConfig.xAxes) && initialConfig.xAxes.length > 0) {
        setXAxes(initialConfig.xAxes);
      } else if (initialConfig.xAxis) {
        setXAxes([initialConfig.xAxis]);
      }
      
      if (Array.isArray(initialConfig.yAxes) && initialConfig.yAxes.length > 0) {
        setYAxes(initialConfig.yAxes);
      } else if (initialConfig.yAxis) {
        setYAxes([initialConfig.yAxis]);
      }

      if (initialConfig.xTimeGrain) setXTimeGrain(initialConfig.xTimeGrain);

      // Global
      if (typeof initialConfig.showGrid === 'boolean') setShowGrid(initialConfig.showGrid);
      if (typeof initialConfig.showLegend === 'boolean') setShowLegend(initialConfig.showLegend);
      if (typeof initialConfig.showDataLabels === 'boolean') setShowDataLabels(initialConfig.showDataLabels);
      if (typeof initialConfig.barCornerRadius === 'number') setBarCornerRadius(initialConfig.barCornerRadius);

      // Colors
      if (initialConfig.colorScheme) setColorScheme(initialConfig.colorScheme);
      if (Array.isArray(initialConfig.customColors)) setCustomColors(initialConfig.customColors);
      if (initialConfig.colorMapping) setColorMapping(initialConfig.colorMapping);

      // Bar/Line/Area
      if (initialConfig.seriesBy) setSeriesBy(initialConfig.seriesBy);
      if (initialConfig.aggregation) setAggregation(initialConfig.aggregation);
      if (initialConfig.sortOrder) setSortOrder(initialConfig.sortOrder);
      if (initialConfig.barOrientation) setBarOrientation(initialConfig.barOrientation);
      if (typeof initialConfig.isStacked === 'boolean') setIsStacked(initialConfig.isStacked);
      if (initialConfig.curveType) setCurveType(initialConfig.curveType);
      if (typeof initialConfig.showMarkers === 'boolean') setShowMarkers(initialConfig.showMarkers);
      if (typeof initialConfig.areaFillOpacity === 'number') setAreaFillOpacity(initialConfig.areaFillOpacity);

      // Pie/Donut
      if (initialConfig.pieAggregation) setPieAggregation(initialConfig.pieAggregation);
      if (initialConfig.pieSortOrder) setPieSortOrder(initialConfig.pieSortOrder);
      if (initialConfig.pieLabelMode) setPieLabelMode(initialConfig.pieLabelMode);
      if (typeof initialConfig.pieTopN === 'number') setPieTopN(initialConfig.pieTopN);
      if (typeof initialConfig.pieGroupOther === 'boolean') setPieGroupOther(initialConfig.pieGroupOther);
      if (typeof initialConfig.donutInnerRadius === 'number') setDonutInnerRadius(initialConfig.donutInnerRadius);

      // Radar
      if (initialConfig.radarAggregation) setRadarAggregation(initialConfig.radarAggregation);
      if (initialConfig.radarSortOrder) setRadarSortOrder(initialConfig.radarSortOrder);
      if (typeof initialConfig.radarTopN === 'number') setRadarTopN(initialConfig.radarTopN);
      if (typeof initialConfig.radarGroupOther === 'boolean') setRadarGroupOther(initialConfig.radarGroupOther);
      if (typeof initialConfig.radarFillOpacity === 'number') setRadarFillOpacity(initialConfig.radarFillOpacity);
      if (initialConfig.radarAxisMode) setRadarAxisMode(initialConfig.radarAxisMode);
      if (initialConfig.radarSeriesBy) setRadarSeriesBy(initialConfig.radarSeriesBy);
      if (typeof initialConfig.radarNormalizeMetrics === 'boolean') setRadarNormalizeMetrics(initialConfig.radarNormalizeMetrics);
      if (typeof initialConfig.radarUsePerMetricAggregation === 'boolean') setRadarUsePerMetricAggregation(initialConfig.radarUsePerMetricAggregation);
      if (initialConfig.radarMetricAggregations) setRadarMetricAggregations(initialConfig.radarMetricAggregations);

      // Funnel
      if (initialConfig.funnelAggregation) setFunnelAggregation(initialConfig.funnelAggregation);
      if (initialConfig.funnelSortOrder) setFunnelSortOrder(initialConfig.funnelSortOrder);
      if (typeof initialConfig.funnelTopN === 'number') setFunnelTopN(initialConfig.funnelTopN);
      if (typeof initialConfig.funnelGroupOther === 'boolean') setFunnelGroupOther(initialConfig.funnelGroupOther);
      if (typeof initialConfig.funnelShowPercentOfFirst === 'boolean') setFunnelShowPercentOfFirst(initialConfig.funnelShowPercentOfFirst);

      // KPI
      if (initialConfig.kpiAggregation) setKpiAggregation(initialConfig.kpiAggregation);
      if (typeof initialConfig.kpiDecimals === 'number') setKpiDecimals(initialConfig.kpiDecimals);
      if (initialConfig.kpiPrefix) setKpiPrefix(initialConfig.kpiPrefix);
      if (initialConfig.kpiSuffix) setKpiSuffix(initialConfig.kpiSuffix);

      // Gauge
      if (initialConfig.gaugeAggregation) setGaugeAggregation(initialConfig.gaugeAggregation);
      if (initialConfig.gaugeSortByColumn) setGaugeSortByColumn(initialConfig.gaugeSortByColumn);
      if (typeof initialConfig.gaugeMinValue === 'number') setGaugeMinValue(initialConfig.gaugeMinValue);
      if (typeof initialConfig.gaugeUseAutoMax === 'boolean') setGaugeUseAutoMax(initialConfig.gaugeUseAutoMax);
      if (typeof initialConfig.gaugeMaxValue === 'number') setGaugeMaxValue(initialConfig.gaugeMaxValue);
      if (typeof initialConfig.gaugeDecimals === 'number') setGaugeDecimals(initialConfig.gaugeDecimals);
      if (initialConfig.gaugePrefix) setGaugePrefix(initialConfig.gaugePrefix);
      if (initialConfig.gaugeSuffix) setGaugeSuffix(initialConfig.gaugeSuffix);
      if (initialConfig.gaugeUnit) setGaugeUnit(initialConfig.gaugeUnit);
      if (typeof initialConfig.gaugeThresholdLow === 'number') setGaugeThresholdLow(initialConfig.gaugeThresholdLow);
      if (typeof initialConfig.gaugeThresholdMedium === 'number') setGaugeThresholdMedium(initialConfig.gaugeThresholdMedium);
      if (typeof initialConfig.gaugeShowLegend === 'boolean') setGaugeShowLegend(initialConfig.gaugeShowLegend);
      if (typeof initialConfig.gaugeShowPercent === 'boolean') setGaugeShowPercent(initialConfig.gaugeShowPercent);
      if (typeof initialConfig.gaugeShowValue === 'boolean') setGaugeShowValue(initialConfig.gaugeShowValue);

      // Table
      if (typeof initialConfig.tableRowLimit === 'number') setTableRowLimit(initialConfig.tableRowLimit);
      if (typeof initialConfig.tableFullData === 'boolean') setTableFullData(initialConfig.tableFullData);
      if (typeof initialConfig.tableWrap === 'boolean') setTableWrap(initialConfig.tableWrap);
      if (typeof initialConfig.tableDense === 'boolean') setTableDense(initialConfig.tableDense);
      if (initialConfig.tableSortColumn) setTableSortColumn(initialConfig.tableSortColumn);
      if (initialConfig.tableSortDir) setTableSortDir(initialConfig.tableSortDir);
      if (Array.isArray(initialConfig.tableVisibleColumns)) setTableVisibleColumns(initialConfig.tableVisibleColumns);
      if (typeof initialConfig.tableEnableAggregation === 'boolean') setTableEnableAggregation(initialConfig.tableEnableAggregation);
      if (Array.isArray(initialConfig.tableGroupByColumns)) setTableGroupByColumns(initialConfig.tableGroupByColumns);
      if (Array.isArray(initialConfig.tableMetrics)) setTableMetrics(initialConfig.tableMetrics);

      // Scatter
      if (initialConfig.scatterColorBy) setScatterColorBy(initialConfig.scatterColorBy);
      if (initialConfig.scatterSizeBy) setScatterSizeBy(initialConfig.scatterSizeBy);
      if (typeof initialConfig.scatterPointOpacity === 'number') setScatterPointOpacity(initialConfig.scatterPointOpacity);
      if (typeof initialConfig.scatterMaxPointSize === 'number') setScatterMaxPointSize(initialConfig.scatterMaxPointSize);

      // Heatmap
      if (initialConfig.heatmapAggregation) {
        const v = initialConfig.heatmapAggregation;
        if (v === 'sum' || v === 'avg' || v === 'count' || v === 'min' || v === 'max') {
          setHeatmapAggregation(v);
        }
      }
      if (initialConfig.heatmapValueColumn) setHeatmapValueColumn(initialConfig.heatmapValueColumn);
      if (typeof initialConfig.heatmapShowValues === 'boolean') setHeatmapShowValues(initialConfig.heatmapShowValues);
      if (typeof initialConfig.heatmapShowGrid === 'boolean') setHeatmapShowGrid(initialConfig.heatmapShowGrid);
      if (typeof initialConfig.heatmapCellBorderWidth === 'number') setHeatmapCellBorderWidth(initialConfig.heatmapCellBorderWidth);
      if (Array.isArray(initialConfig.heatmapColorScheme)) setHeatmapColorScheme(initialConfig.heatmapColorScheme);

      // Histogram
      if (initialConfig.histogramValueColumn) setHistogramValueColumn(initialConfig.histogramValueColumn);
      if (typeof initialConfig.histogramBinCount === 'number') setHistogramBinCount(initialConfig.histogramBinCount);
      if (initialConfig.histogramColor) setHistogramColor(initialConfig.histogramColor);
      if (typeof initialConfig.histogramShowGrid === 'boolean') setHistogramShowGrid(initialConfig.histogramShowGrid);
      if (typeof initialConfig.histogramShowValues === 'boolean') setHistogramShowValues(initialConfig.histogramShowValues);

      // Box plot
      if (initialConfig.boxPlotValueColumn) setBoxPlotValueColumn(initialConfig.boxPlotValueColumn);
      if (initialConfig.boxPlotCategoryColumn) setBoxPlotCategoryColumn(initialConfig.boxPlotCategoryColumn);
      if (typeof initialConfig.boxPlotShowOutliers === 'boolean') setBoxPlotShowOutliers(initialConfig.boxPlotShowOutliers);
      if (initialConfig.boxPlotBoxColor) setBoxPlotBoxColor(initialConfig.boxPlotBoxColor);
      if (typeof initialConfig.boxPlotShowGrid === 'boolean') setBoxPlotShowGrid(initialConfig.boxPlotShowGrid);
    }
  }, [initialConfig, isOpen]);
  
  // Clear edit state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEditDashboardId(null);
      setEditChartId(null);
    }
  }, [isOpen]);

    const exportConfig = useCallback(() => {
      const primaryXAxis = xAxes[0] ?? '';
      const primaryYAxis = yAxes[0] ?? '';

      const common = {
        chartType,
        title: chartTitle,
        xAxis: primaryXAxis,
        yAxis: primaryYAxis,
      };

      const cfg: Record<string, any> = {
        mode, // Save the visualization mode (config vs sql_direct)
        chartType,
        chartTitle,
        xAxis: primaryXAxis,
        yAxis: primaryYAxis,
        xAxes,
        yAxes,
        xTimeGrain,

        // Global display options (apply to multiple chart types)
        showGrid,
        showLegend,
        showDataLabels,
        barCornerRadius,

        // Colors
        colorScheme,
        customColors,
        colorMapping,

        // Scatter options
        scatterColorBy,
        scatterSizeBy,
        scatterPointOpacity,
        scatterMaxPointSize,
      };

      if (chartType === 'bar' || chartType === 'line' || chartType === 'area') {
        cfg.seriesBy = seriesBy;
        cfg.aggregation = aggregation;
        cfg.sortOrder = sortOrder;
        cfg.barOrientation = barOrientation;
        cfg.isStacked = isStacked;
        cfg.curveType = curveType;
        cfg.showMarkers = showMarkers;
        cfg.areaFillOpacity = areaFillOpacity;
      } else if (chartType === 'pie' || chartType === 'donut') {
        cfg.pieAggregation = pieAggregation;
        cfg.pieSortOrder = pieSortOrder;
        cfg.pieLabelMode = pieLabelMode;
        cfg.pieTopN = pieTopN;
        cfg.pieGroupOther = pieGroupOther;
        cfg.donutInnerRadius = donutInnerRadius;
      } else if (chartType === 'radar') {
        cfg.radarAggregation = radarAggregation;
        cfg.radarSortOrder = radarSortOrder;
        cfg.radarTopN = radarTopN;
        cfg.radarGroupOther = radarGroupOther;
        cfg.radarFillOpacity = radarFillOpacity;
        cfg.radarAxisMode = radarAxisMode;
        cfg.radarSeriesBy = radarSeriesBy;
        cfg.radarNormalizeMetrics = radarNormalizeMetrics;
        cfg.radarUsePerMetricAggregation = radarUsePerMetricAggregation;
        cfg.radarMetricAggregations = radarMetricAggregations;
      } else if (chartType === 'funnel') {
        cfg.funnelAggregation = funnelAggregation;
        cfg.funnelSortOrder = funnelSortOrder;
        cfg.funnelTopN = funnelTopN;
        cfg.funnelGroupOther = funnelGroupOther;
        cfg.funnelShowPercentOfFirst = funnelShowPercentOfFirst;
      } else if (chartType === 'kpi') {
        cfg.kpiAggregation = kpiAggregation;
        cfg.kpiDecimals = kpiDecimals;
        cfg.kpiPrefix = kpiPrefix;
        cfg.kpiSuffix = kpiSuffix;
      } else if (chartType === 'gauge') {
        cfg.gaugeAggregation = gaugeAggregation;
        cfg.gaugeSortByColumn = gaugeSortByColumn;
        cfg.gaugeMinValue = gaugeMinValue;
        cfg.gaugeUseAutoMax = gaugeUseAutoMax;
        cfg.gaugeMaxValue = gaugeMaxValue;
        cfg.gaugeDecimals = gaugeDecimals;
        cfg.gaugePrefix = gaugePrefix;
        cfg.gaugeSuffix = gaugeSuffix;
        cfg.gaugeUnit = gaugeUnit;
        cfg.gaugeThresholdLow = gaugeThresholdLow;
        cfg.gaugeThresholdMedium = gaugeThresholdMedium;
        cfg.gaugeShowLegend = gaugeShowLegend;
        cfg.gaugeShowPercent = gaugeShowPercent;
        cfg.gaugeShowValue = gaugeShowValue;
      } else if (chartType === 'table') {
        cfg.tableRowLimit = tableRowLimit;
        cfg.tableFullData = tableFullData;
        cfg.tableWrap = tableWrap;
        cfg.tableDense = tableDense;
        cfg.tableSortColumn = tableSortColumn;
        cfg.tableSortDir = tableSortDir;
        cfg.tableVisibleColumns = tableVisibleColumns;

        cfg.tableEnableAggregation = tableEnableAggregation;
        cfg.tableGroupByColumns = tableGroupByColumns;
        cfg.tableMetrics = tableMetrics;
      } else if (chartType === 'heatmap') {
        cfg.heatmapAggregation = heatmapAggregation;
        cfg.heatmapValueColumn = heatmapValueColumn;
        cfg.heatmapShowValues = heatmapShowValues;
        cfg.heatmapShowGrid = heatmapShowGrid;
        cfg.heatmapCellBorderWidth = heatmapCellBorderWidth;
        cfg.heatmapColorScheme = heatmapColorScheme;
      } else if (chartType === 'histogram') {
        cfg.histogramValueColumn = histogramValueColumn;
        cfg.histogramBinCount = histogramBinCount;
        cfg.histogramColor = histogramColor;
        cfg.histogramShowGrid = histogramShowGrid;
        cfg.histogramShowValues = histogramShowValues;
      } else if (chartType === 'boxplot') {
        cfg.boxPlotValueColumn = boxPlotValueColumn;
        cfg.boxPlotCategoryColumn = boxPlotCategoryColumn;
        cfg.boxPlotShowOutliers = boxPlotShowOutliers;
        cfg.boxPlotBoxColor = boxPlotBoxColor;
        cfg.boxPlotShowGrid = boxPlotShowGrid;
      }

      // Override xAxis/yAxis for special chart types
      let finalXAxis = primaryXAxis;
      let finalYAxis = primaryYAxis;
      
      if (chartType === 'histogram') {
        finalXAxis = histogramValueColumn; // Use value column as x_column for backend
        finalYAxis = ''; // No y-axis for histogram
      } else if (chartType === 'boxplot') {
        finalXAxis = boxPlotValueColumn; // Use value column as x_column for backend
        finalYAxis = ''; // No y-axis for box plot
      }

      return { ...common, xAxis: finalXAxis, yAxis: finalYAxis, config: cfg };
    }, [
      aggregation,
      areaFillOpacity,
      barOrientation,
      chartTitle,
      chartType,
      curveType,
      donutInnerRadius,
      funnelAggregation,
      funnelGroupOther,
      funnelShowPercentOfFirst,
      funnelSortOrder,
      funnelTopN,
      gaugeAggregation,
      gaugeDecimals,
      gaugeMaxValue,
      gaugeMinValue,
      radarMetricAggregations,
      gaugePrefix,
      gaugeShowLegend,
      gaugeShowPercent,
      radarUsePerMetricAggregation,
      gaugeShowValue,
      gaugeSuffix,
      gaugeSortByColumn,
      gaugeThresholdLow,
      gaugeThresholdMedium,
      gaugeUnit,
      gaugeUseAutoMax,
      isStacked,
      kpiAggregation,
      kpiDecimals,
      kpiPrefix,
      kpiSuffix,
      pieAggregation,
      pieGroupOther,
      pieLabelMode,
      pieSortOrder,
      pieTopN,
      radarAggregation,
      radarAxisMode,
      radarFillOpacity,
      radarGroupOther,
      radarNormalizeMetrics,
      radarSeriesBy,
      radarSortOrder,
      radarTopN,
      scatterColorBy,
      scatterMaxPointSize,
      scatterPointOpacity,
      scatterSizeBy,
      heatmapAggregation,
      heatmapValueColumn,
      heatmapShowValues,
      heatmapShowGrid,
      heatmapCellBorderWidth,
      heatmapColorScheme,
      histogramValueColumn,
      histogramBinCount,
      histogramColor,
      histogramShowGrid,
      histogramShowValues,
      boxPlotValueColumn,
      boxPlotCategoryColumn,
      boxPlotShowOutliers,
      boxPlotBoxColor,
      boxPlotShowGrid,
      seriesBy,
      showDataLabels,
      showGrid,
      showLegend,
      showMarkers,
      sortOrder,
      tableDense,
      tableFullData,
      tableRowLimit,
      tableSortColumn,
      tableSortDir,
      tableVisibleColumns,
      tableWrap,
      tableEnableAggregation,
      tableGroupByColumns,
      tableMetrics,
      barCornerRadius,
      xAxes,
      xTimeGrain,
      yAxes,
    ]);

  // Initialize sensible defaults when opened / data changes
  useEffect(() => {
    if (!isOpen) return;

    // PARANOID: Ensure saveName is cleared if we are not in edit mode (no initialConfig)
    // This prevents any stale state or confusion.
    if (!initialConfig) {
      setSaveName('');
      setSaveDescription('');
    }

    const firstCol = columns[0] || '';
    const firstNumeric = numericColumns[0] || '';

    setChartTitle((prev) => (prev ? prev : ''));

    // Only apply defaults if we are NOT restoring a saved configuration.
    // If initialConfig is present, the restoration effect handles state setup.
    if (!initialConfig) {
      if (mode === 'sql_direct') {
        // Direct Mode: Heuristic auto-mapping
        const firstDim = nonNumericColumns[0] || firstCol;
        setXAxes([firstDim]);

        // Default to all numeric columns for Y-axis to show multi-series immediately
        if (numericColumns.length > 0) {
          setYAxes(numericColumns);
        } else {
          setYAxes([firstCol]);
        }

        // Force "No Aggregation" settings
        setAggregation('none');
        setSortOrder('none');
        setXTimeGrain('none');
      } else {
        // Config Mode: Standard defaults (preserve selection if valid)
        setXAxes((prev) => {
          const next = prev.filter((c) => columns.includes(c));
          return next.length > 0 ? next : (firstCol ? [firstCol] : []);
        });
        setYAxes((prev) => {
          const next = prev.filter((c) => columns.includes(c));
          const fallback = firstNumeric || firstCol;
          return next.length > 0 ? next : (fallback ? [fallback] : []);
        });
      }
    }

    // Keep seriesBy valid
    setSeriesBy((prev) => (prev && columns.includes(prev) ? prev : ''));

    // Keep radar series-by valid
    setRadarSeriesBy((prev) => (prev && columns.includes(prev) ? prev : ''));

    // Keep gauge sort-by valid
    setGaugeSortByColumn((prev) => (prev && columns.includes(prev) ? prev : ''));

    // Keep scatter mappings valid
    setScatterColorBy((prev) => (prev && columns.includes(prev) ? prev : ''));
    setScatterSizeBy((prev) => (prev && columns.includes(prev) ? prev : ''));

    // Table defaults
    setTableSortColumn((prev) => (prev && columns.includes(prev) ? prev : ''));
    setTableVisibleColumns((prev) => {
      if (prev.length === 0) return columns;
      const next = prev.filter((c) => columns.includes(c));
      return next.length > 0 ? next : columns;
    });

    setTableGroupByColumns((prev) => prev.filter((c) => columns.includes(c)));
    setTableMetrics((prev) =>
      prev
        .map((m) => ({ ...m, column: m.column === '*' ? '*' : (columns.includes(m.column) ? m.column : '') }))
        .filter((m) => m.column === '*' || (m.column && columns.includes(m.column)))
    );
  }, [isOpen, columns, numericColumns, initialConfig, mode, nonNumericColumns]);

  const safeTableAlias = useCallback((agg: TableMetricAgg, col: string) => {
    const base = `${agg}_${col === '*' ? 'rows' : col}`;
    const cleaned = base
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);
    return cleaned || 'metric';
  }, []);

  const tableAggregationEnabled = useMemo(() => {
    if (chartType !== 'table') return false;
    if (!tableEnableAggregation) return false;
    const groupsValid = tableGroupByColumns.length > 0;
    const metricsValid = tableMetrics.length > 0;
    return groupsValid && metricsValid;
  }, [chartType, tableEnableAggregation, tableGroupByColumns.length, tableMetrics.length]);

  const tableAggColumns = useMemo(() => {
    if (!tableAggregationEnabled) return [] as string[];
    const metricAliases = tableMetrics.map((m) => m.alias).filter(Boolean);
    return Array.from(new Set([...tableGroupByColumns, ...metricAliases]));
  }, [tableAggregationEnabled, tableGroupByColumns, tableMetrics]);

  useEffect(() => {
    if (!isOpen) return;
    if (chartType !== 'table') return;

    const base = tableAggregationEnabled ? tableAggColumns : columns;

    setTableSortColumn((prev) => (prev && base.includes(prev) ? prev : ''));
    setTableVisibleColumns((prev) => {
      if (base.length === 0) return prev;
      if (prev.length === 0) return base;
      const next = prev.filter((c) => base.includes(c));
      return next.length > 0 ? next : base;
    });
  }, [isOpen, chartType, columns, tableAggregationEnabled, tableAggColumns]);

  const tableAggregatedRows = useMemo(() => {
    if (!tableAggregationEnabled) return rows;
    const groups = tableGroupByColumns;
    const metrics = tableMetrics;

    type AggState = {
      groupValues: Record<string, any>;
      sums: Record<string, number>;
      counts: Record<string, number>;
      mins: Record<string, number>;
      maxs: Record<string, number>;
      distinct: Record<string, Set<string>>;
    };

    const map = new Map<string, AggState>();
    const keyForRow = (r: any) => JSON.stringify(groups.map((g) => r?.[g] ?? null));

    for (const r of rows) {
      const k = keyForRow(r);
      let st = map.get(k);
      if (!st) {
        const groupValues: Record<string, any> = {};
        for (const g of groups) groupValues[g] = r?.[g];
        st = { groupValues, sums: {}, counts: {}, mins: {}, maxs: {}, distinct: {} };
        map.set(k, st);
      }

      for (const m of metrics) {
        const alias = m.alias;
        if (!alias) continue;
        if (m.agg === 'count') {
          if (m.column === '*') {
            st.counts[alias] = (st.counts[alias] ?? 0) + 1;
          } else {
            const v = r?.[m.column];
            if (v !== null && v !== undefined) st.counts[alias] = (st.counts[alias] ?? 0) + 1;
          }
          continue;
        }
        if (m.agg === 'count_distinct') {
          const v = r?.[m.column];
          if (v === null || v === undefined) continue;
          const s = String(v);
          if (!st.distinct[alias]) st.distinct[alias] = new Set<string>();
          st.distinct[alias].add(s);
          continue;
        }

        const n = toNumber(r?.[m.column]);
        if (n === null || !Number.isFinite(n)) continue;

        if (m.agg === 'sum' || m.agg === 'avg') {
          st.sums[alias] = (st.sums[alias] ?? 0) + n;
          st.counts[alias] = (st.counts[alias] ?? 0) + 1;
        } else if (m.agg === 'min') {
          st.mins[alias] = st.mins[alias] === undefined ? n : Math.min(st.mins[alias], n);
        } else if (m.agg === 'max') {
          st.maxs[alias] = st.maxs[alias] === undefined ? n : Math.max(st.maxs[alias], n);
        }
      }
    }

    const out: any[] = [];
    for (const st of map.values()) {
      const row: any = { ...st.groupValues };
      for (const m of metrics) {
        const a = m.alias;
        if (!a) continue;
        if (m.agg === 'count') row[a] = st.counts[a] ?? 0;
        else if (m.agg === 'count_distinct') row[a] = st.distinct[a] ? st.distinct[a].size : 0;
        else if (m.agg === 'sum') row[a] = st.sums[a] ?? 0;
        else if (m.agg === 'avg') {
          const c = st.counts[a] ?? 0;
          row[a] = c > 0 ? (st.sums[a] ?? 0) / c : 0;
        } else if (m.agg === 'min') row[a] = st.mins[a] ?? null;
        else if (m.agg === 'max') row[a] = st.maxs[a] ?? null;
      }
      out.push(row);
    }

    return out;
  }, [rows, tableAggregationEnabled, tableGroupByColumns, tableMetrics]);

  // Keep gauge thresholds ordered
  useEffect(() => {
    if (!isOpen) return;
    if (gaugeThresholdLow > gaugeThresholdMedium) {
      setGaugeThresholdMedium(gaugeThresholdLow);
    }
  }, [isOpen, gaugeThresholdLow, gaugeThresholdMedium]);

  const gaugeValue = useMemo(() => {
    if (chartType !== 'gauge') return 0;

    const compareForSort = (av: unknown, bv: unknown) => {
      const an = toNumber(av);
      const bn = toNumber(bv);
      if (an !== null && bn !== null) return an - bn;

      const ad = parseDateLike(av);
      const bd = parseDateLike(bv);
      if (ad && bd) return ad.getTime() - bd.getTime();

      return compareStrings(String(av ?? ''), String(bv ?? ''));
    };

    const needsOrdering = (gaugeAggregation === 'first' || gaugeAggregation === 'last') && !!gaugeSortByColumn;
    const orderedRows = needsOrdering
      ? rows.slice().sort((a, b) => compareForSort(a?.[gaugeSortByColumn], b?.[gaugeSortByColumn]))
      : rows;

    const nums = orderedRows
      .map((r) => toNumber(r?.[yAxis]))
      .filter((n): n is number => n !== null && Number.isFinite(n));

    if (gaugeAggregation === 'count') return rows.length;
    if (nums.length === 0) return 0;

    if (gaugeAggregation === 'first') return nums[0];
    if (gaugeAggregation === 'last') return nums[nums.length - 1];
    if (gaugeAggregation === 'sum') return nums.reduce((acc, n) => acc + n, 0);
    if (gaugeAggregation === 'avg') return nums.reduce((acc, n) => acc + n, 0) / nums.length;
    if (gaugeAggregation === 'min') return Math.min(...nums);
    if (gaugeAggregation === 'max') return Math.max(...nums);
    return nums[nums.length - 1];
  }, [chartType, rows, yAxis, gaugeAggregation, gaugeSortByColumn]);

  const gaugeComputedMax = useMemo(() => {
    if (!gaugeUseAutoMax) return Math.max(1, gaugeMaxValue);

    // Auto max: use the max value observed in the current data for the selected column.
    // This makes gauges like Avg(score) display as “80 of 100” (if 100 exists in data),
    // rather than always “80 of 80”.
    const nums = rows
      .map((r) => toNumber(r?.[yAxis]))
      .filter((n): n is number => n !== null && Number.isFinite(n));

    const dataMax = nums.length > 0 ? Math.max(...nums) : 0;
    const safeMin = Number.isFinite(gaugeMinValue) ? gaugeMinValue : 0;
    return Math.max(1, safeMin + 1, dataMax, gaugeValue);
  }, [gaugeUseAutoMax, rows, yAxis, gaugeMinValue, gaugeValue, gaugeMaxValue]);

  const tableColumnsToShow = useMemo(() => {
    if (chartType !== 'table') return columns;
    const base = tableAggregationEnabled ? tableAggColumns : columns;
    const chosen = (tableVisibleColumns.length ? tableVisibleColumns : base).filter((c) => base.includes(c));
    return chosen.length > 0 ? chosen : base;
  }, [chartType, columns, tableVisibleColumns, tableAggregationEnabled, tableAggColumns]);

  const tableRowsToShow = useMemo(() => {
    if (chartType !== 'table') return rows;
    const baseCols = tableAggregationEnabled ? tableAggColumns : columns;
    let data = (tableAggregationEnabled ? tableAggregatedRows : rows).slice();

    const col = tableSortColumn;
    if (col && baseCols.includes(col)) {
      const dir = tableSortDir === 'asc' ? 1 : -1;
      data.sort((a, b) => {
        const av = a?.[col];
        const bv = b?.[col];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;

        const an = toNumber(av);
        const bn = toNumber(bv);
        if (an !== null && bn !== null) return (an - bn) * dir;

        return compareStrings(String(av), String(bv)) * dir;
      });
    }

    const lim = Math.max(10, Math.min(2000, Number.isFinite(tableRowLimit) ? tableRowLimit : 200));
    return data.slice(0, lim);
  }, [chartType, rows, columns, tableAggregationEnabled, tableAggColumns, tableAggregatedRows, tableSortColumn, tableSortDir, tableRowLimit]);

  // If user selects seriesBy, aggregation must be enabled (pivot requires it)
  useEffect(() => {
    if (!isOpen) return;
    if (seriesBy && aggregation === 'none') {
      setAggregation('sum');
    }
  }, [isOpen, seriesBy, aggregation]);

  // Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Avoid Recharts ResponsiveContainer measuring during initial mount (can be -1).
  useEffect(() => {
    if (!isOpen) {
      setLayoutReady(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setLayoutReady(true));
    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    onConfigChange?.(exportConfig());
  }, [exportConfig, isOpen, onConfigChange]);

  const effectiveColors = useMemo(() => {
    if (colorScheme === 'custom' && customColors.length > 0) {
      return customColors;
    }
    return COLORS;
  }, [colorScheme, customColors]);

  const chartData = useMemo(() => {
    // Normalize into objects with selected keys for charts.
    // Keep row order; do not aggregate (matches "use query results" expectation).
    return rows.map((r, idx) => ({
      __idx: idx + 1,
      ...(r || {}),
    }));
  }, [rows]);

  const isXYChart = chartType === 'bar' || chartType === 'line' || chartType === 'area';

  useEffect(() => {
    if (!isOpen) return;
    if (chartType !== 'radar') return;

    // When multiple Y metrics are selected for radar, default to metrics-as-axes.
    // When multi-metric selection is removed, go back to category axes.
    if (yAxes.length > 1 && radarAxisMode !== 'metrics') setRadarAxisMode('metrics');
    if (yAxes.length <= 1 && radarAxisMode === 'metrics') setRadarAxisMode('categories');
  }, [chartType, isOpen, radarAxisMode, yAxes.length]);

  useEffect(() => {
    if (!isOpen) return;
    if (chartType !== 'radar') return;

    // Keep the per-metric aggregation map in sync with selected Y columns.
    setRadarMetricAggregations((prev) => {
      const next: Record<string, RadarAggregation> = {};
      for (const metric of yAxes) {
        if (!metric) continue;
        next[metric] = prev[metric] ?? radarAggregation;
      }
      return next;
    });
  }, [chartType, isOpen, radarAggregation, yAxes]);

    const isTemporalX = useMemo(() => {
      const cols = xAxes.filter(Boolean);
      if (cols.length === 0) return false;

      // Show the breakdown dropdown if ANY selected X column looks temporal.
      // This is important for multi-select X where the first column may be an ID.
      for (const c of cols) {
        if (isTemporalColumnName(c)) return true;
      }
      for (const c of cols) {
        if (isTemporalColumn(c, rows)) return true;
      }
      return false;
    }, [rows, xAxes]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isTemporalX && xTimeGrain !== 'none') setXTimeGrain('none');
  }, [isOpen, isTemporalX, xTimeGrain]);

  const xyXAxisKey = useMemo(() => {
    const needsComputed = xAxes.length > 1 || (isTemporalX && xTimeGrain !== 'none');
    return needsComputed ? '__x' : xAxis;
  }, [isTemporalX, xAxes.length, xAxis, xTimeGrain]);

  const xyChartData = useMemo(() => {
    if (!isXYChart) return chartData;
    if (!xAxis) return chartData;

    const withCombinedX = xAxes.length > 1;
    const needsComputedX = withCombinedX || (isTemporalX && xTimeGrain !== 'none');
    const baseData = needsComputedX
      ? chartData.map((r) => {
          const parts = withCombinedX
            ? xAxes
                .map((c) => {
                  const raw = (r as any)?.[c];
                  return isTemporalColumnName(c) || parseDateLike(raw) ? applyTimeGrain(raw, xTimeGrain) : normalizeKey(raw);
                })
                .filter(Boolean)
            : [applyTimeGrain((r as any)?.[xAxis], xTimeGrain)].filter(Boolean);
          return { ...(r as any), __x: parts.join(' / ') };
        })
      : chartData;

    // Fast path: raw rows, no series grouping.
    if (!seriesBy && aggregation === 'none' && sortOrder === 'none') {
      return baseData;
    }

    const xKey = needsComputedX ? '__x' : xAxis;
    const sKey = seriesBy;
    const primaryYKey = yAxis;
    const selectedYKeys = yAxes.length > 0 ? yAxes : (primaryYKey ? [primaryYKey] : []);

    // Group by x, then by series.
    // Each group keeps running stats to support multiple aggregations.
    type AggStats = { sum: number; count: number; min: number | null; max: number | null };
    const groups = new Map<string, { xRaw: unknown; series: Map<string, AggStats> }>();

    const ensureStats = (seriesMap: Map<string, AggStats>, seriesName: string): AggStats => {
      const existing = seriesMap.get(seriesName);
      if (existing) return existing;
      const s: AggStats = { sum: 0, count: 0, min: null, max: null };
      seriesMap.set(seriesName, s);
      return s;
    };

    for (const r of baseData as any[]) {
      const xVal = (r as any)?.[xKey];
      const xStr = normalizeKey(xVal);
      if (!xStr) continue;

      const g = groups.get(xStr) ?? { xRaw: xVal, series: new Map<string, AggStats>() };

      if (sKey) {
        const seriesName = normalizeKey((r as any)?.[sKey]);
        if (!seriesName) continue;
        const stats = ensureStats(g.series, seriesName);

        if (aggregation === 'count') {
          stats.count += 1;
        } else {
          const n = toNumber((r as any)?.[primaryYKey]);
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
          for (const yKey of selectedYKeys) {
            const stats = ensureStats(g.series, yKey);
            const n = toNumber((r as any)?.[yKey]);
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

    const computeAgg = (stats: AggStats): number => {
      switch (aggregation) {
        case 'count':
          return stats.count;
        case 'sum':
          return stats.sum;
        case 'avg':
          return stats.count > 0 ? stats.sum / stats.count : 0;
        case 'min':
          return stats.min ?? 0;
        case 'max':
          return stats.max ?? 0;
        case 'none':
        default:
          return 0;
      }
    };

    const data = Array.from(groups.entries()).map(([xStr, g]) => {
      const obj: Record<string, any> = { __idx: xStr };
      obj[xKey] = xStr;
      for (const [seriesName, stats] of g.series.entries()) {
        obj[seriesName] = computeAgg(stats);
      }
      return obj;
    });

    const getYForSort = (row: Record<string, any>): number => {
      if (!sKey) {
        if (aggregation === 'count') {
          const v = row['count'];
          return isFiniteNumber(v) ? v : Number(toNumber(v) ?? 0);
        }
        let sum = 0;
        for (const yKey of selectedYKeys) {
          const v = row[yKey];
          const n = toNumber(v);
          if (n !== null) sum += n;
        }
        return sum;
      }
      let sum = 0;
      for (const [k, v] of Object.entries(row)) {
        if (k === '__idx' || k === xKey) continue;
        const n = toNumber(v);
        if (n !== null) sum += n;
      }
      return sum;
    };

    if (sortOrder !== 'none') {
      data.sort((a, b) => {
        if (sortOrder === 'x_asc') return compareStrings(String(a[xKey] ?? ''), String(b[xKey] ?? ''));
        if (sortOrder === 'x_desc') return compareStrings(String(b[xKey] ?? ''), String(a[xKey] ?? ''));
        if (sortOrder === 'y_asc') return getYForSort(a) - getYForSort(b);
        if (sortOrder === 'y_desc') return getYForSort(b) - getYForSort(a);
        return 0;
      });
    }

    return data;
  }, [isXYChart, chartData, xAxis, xAxes, yAxis, yAxes, seriesBy, aggregation, sortOrder, isTemporalX, xTimeGrain]);

  const xySeriesKeys = useMemo(() => {
    if (!isXYChart) return [] as string[];
    if (!seriesBy) {
      if (aggregation === 'count') return ['count'];
      return yAxes.length > 0 ? yAxes : (yAxis ? [yAxis] : []);
    }

    const keys = new Set<string>();
    for (const r of xyChartData as any[]) {
      for (const k of Object.keys(r || {})) {
        if (k === '__idx' || k === xyXAxisKey) continue;
        keys.add(k);
      }
    }
    return Array.from(keys);
  }, [isXYChart, seriesBy, aggregation, xyChartData, xyXAxisKey, yAxes, yAxis]);

  const hasResults = columns.length > 0 && rows.length > 0;

  const pieData = useMemo(() => {
    if (!(chartType === 'pie' || chartType === 'donut')) return [] as Array<{ name: string; value: number }>;
    if (!xAxis || !yAxis) return [];

    type Stats = { sum: number; count: number; min: number | null; max: number | null };
    const statsByName = new Map<string, Stats>();

    const ensure = (key: string): Stats => {
      const e = statsByName.get(key);
      if (e) return e;
      const s: Stats = { sum: 0, count: 0, min: null, max: null };
      statsByName.set(key, s);
      return s;
    };

    for (const r of rows) {
      const name = String(r?.[xAxis] ?? '').trim();
      if (!name) continue;
      const s = ensure(name);

      if (pieAggregation === 'count') {
        s.count += 1;
        continue;
      }

      const n = toNumber(r?.[yAxis]);
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
      }
    };

    let data = Array.from(statsByName.entries()).map(([name, s]) => ({ name, value: compute(s) }));

    data.sort((a, b) => {
      if (pieSortOrder === 'value_desc') return b.value - a.value;
      if (pieSortOrder === 'value_asc') return a.value - b.value;
      if (pieSortOrder === 'label_desc') return compareStrings(b.name, a.name);
      return compareStrings(a.name, b.name);
    });

    if (pieTopN > 0 && data.length > pieTopN) {
      const top = data.slice(0, pieTopN);
      const rest = data.slice(pieTopN);
      if (pieGroupOther) {
        const otherValue = rest.reduce((acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0), 0);
        if (otherValue > 0) top.push({ name: 'Other', value: otherValue });
      }
      data = top;
    }

    return data;
  }, [chartType, rows, xAxis, yAxis, pieAggregation, pieSortOrder, pieTopN, pieGroupOther]);

  const pieTotalValue = useMemo(() => {
    if (!(chartType === 'pie' || chartType === 'donut')) return 0;
    return pieData.reduce((acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0), 0);
  }, [chartType, pieData]);

  const radarPrepared = useMemo(() => {
    if (chartType !== 'radar') {
      return {
        axisKey: 'category' as const,
        data: [] as Array<Record<string, any>>,
        seriesKeys: [] as string[],
        normalized: false,
        hasNegative: false,
      };
    }

    const yCols = (Array.isArray(yAxes) ? yAxes : []).filter(Boolean);
    const hasMultiY = yCols.length > 1;
    const mode: RadarAxisMode = hasMultiY ? radarAxisMode : 'categories';

    const computeValue = (agg: RadarAggregation, sum: number, count: number, min: number | null, max: number | null): number => {
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
      }
    };

    // Mode A: Axes are categories (xAxis values); series are groups (radarSeriesBy)
    if (mode === 'categories') {
      if (!xAxis || !yAxis) return { axisKey: 'category' as const, data: [] as any[], seriesKeys: [] as string[], normalized: false, hasNegative: false };

      type Stats = { sum: number; count: number; min: number | null; max: number | null };
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

      const seriesCol = radarSeriesBy;
      const hasSeries = Boolean(seriesCol);
      const seriesSet = new Set<string>();

      for (const r of rows) {
        const category = String(r?.[xAxis] ?? '').trim();
        if (!category) continue;
        let seriesKey = hasSeries ? (String(r?.[seriesCol] ?? '').trim() || 'Unknown') : (yAxis || 'Value');
        // Truncate ISO timestamps at position 19 to remove timezone/microseconds
        if (seriesKey.length > 19 && seriesKey[10] === 'T') {
          seriesKey = seriesKey.substring(0, 19);
        }
        seriesSet.add(seriesKey);
        const s = ensure(category, seriesKey);
        if (radarAggregation === 'count') {
          s.count += 1;
          continue;
        }
        const n = toNumber(r?.[yAxis]);
        if (n === null) continue;
        s.sum += n;
        s.count += 1;
        s.min = s.min === null ? n : Math.min(s.min, n);
        s.max = s.max === null ? n : Math.max(s.max, n);
      }

      const seriesKeys = Array.from(seriesSet);
      const categories = Array.from(statsBy.keys());

      // Score each category for sorting/topN based on total across series
      const totals = new Map<string, number>();
      for (const cat of categories) {
        let t = 0;
        const m = statsBy.get(cat);
        if (m) {
          for (const sk of seriesKeys) {
            const s = m.get(sk);
            if (!s) continue;
            t += computeValue(radarAggregation, s.sum, s.count, s.min, s.max);
          }
        }
        totals.set(cat, t);
      }

      categories.sort((a, b) => {
        const av = totals.get(a) ?? 0;
        const bv = totals.get(b) ?? 0;
        if (radarSortOrder === 'value_desc') return bv - av;
        if (radarSortOrder === 'value_asc') return av - bv;
        if (radarSortOrder === 'label_desc') return compareStrings(b, a);
        return compareStrings(a, b);
      });

      let kept = categories;
      let rest: string[] = [];
      if (radarTopN > 0 && categories.length > radarTopN) {
        kept = categories.slice(0, radarTopN);
        rest = categories.slice(radarTopN);
      }

      const data: Array<Record<string, any>> = kept.map((cat) => {
        const row: Record<string, any> = { category: cat };
        const m = statsBy.get(cat);
        for (const sk of seriesKeys) {
          const s = m?.get(sk);
          row[sk] = s ? computeValue(radarAggregation, s.sum, s.count, s.min, s.max) : 0;
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
            other[sk] += computeValue(radarAggregation, s.sum, s.count, s.min, s.max);
          }
        }
        data.push(other);
      }

      return { axisKey: 'category' as const, data, seriesKeys, normalized: false, hasNegative: false };
    }

    // Mode B: Axes are metrics (yAxes); series are groups (radarSeriesBy, default xAxis)
    const metrics = yCols;
    const seriesCol = radarSeriesBy || xAxis;
    if (!seriesCol) return { axisKey: 'metric' as const, data: [] as any[], seriesKeys: [] as string[], normalized: false, hasNegative: false };

    type Stats = { sum: number; count: number; min: number | null; max: number | null };
    const statsBySeries = new Map<string, Map<string, Stats>>(); // series -> metric -> stats
    const ensure = (seriesKey: string, metric: string): Stats => {
      const sMap = statsBySeries.get(seriesKey) ?? new Map<string, Stats>();
      if (!statsBySeries.has(seriesKey)) statsBySeries.set(seriesKey, sMap);
      const e = sMap.get(metric);
      if (e) return e;
      const s: Stats = { sum: 0, count: 0, min: null, max: null };
      sMap.set(metric, s);
      return s;
    };

    for (const r of rows) {
      const seriesKey = String(r?.[seriesCol] ?? '').trim() || 'Unknown';
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

    // Sort series by total magnitude across metrics for stable topN
    const seriesTotals = new Map<string, number>();
    for (const sk of seriesKeys) {
      const m = statsBySeries.get(sk);
      let t = 0;
      if (m) {
        for (const metric of metrics) {
          const s = m.get(metric);
          if (!s) continue;
          const agg = radarUsePerMetricAggregation ? (radarMetricAggregations[metric] ?? radarAggregation) : radarAggregation;
          t += Math.abs(computeValue(agg, s.sum, s.count, s.min, s.max));
        }
      }
      seriesTotals.set(sk, t);
    }
    seriesKeys.sort((a, b) => (seriesTotals.get(b) ?? 0) - (seriesTotals.get(a) ?? 0));

    let keptSeries = seriesKeys;
    let restSeries: string[] = [];
    if (radarTopN > 0 && seriesKeys.length > radarTopN) {
      keptSeries = seriesKeys.slice(0, radarTopN);
      restSeries = seriesKeys.slice(radarTopN);
    }

    if (radarGroupOther && restSeries.length > 0) {
      // Aggregate the rest into an "Other" series
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
    let data: Array<Record<string, any>> = metrics.map((metric) => {
      const row: Record<string, any> = { metric };
      for (const sk of keptSeries) {
        const s = statsBySeries.get(sk)?.get(metric);
        const agg = radarUsePerMetricAggregation ? (radarMetricAggregations[metric] ?? radarAggregation) : radarAggregation;
        const v = s ? computeValue(agg, s.sum, s.count, s.min, s.max) : 0;
        if (v < 0) hasNegative = true;
        row[sk] = v;
      }
      return row;
    });

    // Normalize each metric independently (0..1) to avoid mixed-unit metrics being dominated
    // by large-scale values like revenue.
    const normalized = Boolean(radarNormalizeMetrics);
    if (normalized) {
      data = data.map((row) => {
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

    return { axisKey: 'metric' as const, data, seriesKeys: keptSeries, normalized, hasNegative: normalized && hasNegative };
  }, [
    chartType,
    rows,
    xAxis,
    yAxis,
    yAxes,
    radarAggregation,
    radarAxisMode,
    radarMetricAggregations,
    radarNormalizeMetrics,
    radarGroupOther,
    radarSeriesBy,
    radarSortOrder,
    radarTopN,
    radarUsePerMetricAggregation,
  ]);

  const funnelData = useMemo(() => {
    if (chartType !== 'funnel') return [] as Array<{ name: string; value: number; percent?: number }>;
    if (!xAxis || !yAxis) return [];

    type Stats = { sum: number; count: number; min: number | null; max: number | null };
    const statsByStage = new Map<string, Stats>();

    const ensure = (key: string): Stats => {
      const e = statsByStage.get(key);
      if (e) return e;
      const s: Stats = { sum: 0, count: 0, min: null, max: null };
      statsByStage.set(key, s);
      return s;
    };

    for (const r of rows) {
      const stage = String(r?.[xAxis] ?? '').trim();
      if (!stage) continue;
      const s = ensure(stage);

      if (funnelAggregation === 'count') {
        s.count += 1;
        continue;
      }

      const n = toNumber(r?.[yAxis]);
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
      }
    };

    let data = Array.from(statsByStage.entries()).map(([name, s]) => ({ name, value: compute(s) }));

    data.sort((a, b) => {
      if (funnelSortOrder === 'value_desc') return b.value - a.value;
      if (funnelSortOrder === 'value_asc') return a.value - b.value;
      if (funnelSortOrder === 'label_desc') return compareStrings(b.name, a.name);
      return compareStrings(a.name, b.name);
    });

    if (funnelTopN > 0 && data.length > funnelTopN) {
      const top = data.slice(0, funnelTopN);
      const rest = data.slice(funnelTopN);
      if (funnelGroupOther) {
        const otherValue = rest.reduce((acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0), 0);
        if (otherValue > 0) top.push({ name: 'Other', value: otherValue });
      }
      data = top;
    }

    if (funnelShowPercentOfFirst && data.length > 0) {
      const first = data[0].value || 0;
      const denom = first > 0 ? first : 0;
      data = data.map((d) => ({ ...d, percent: denom ? d.value / denom : undefined }));
    }

    return data;
  }, [chartType, rows, xAxis, yAxis, funnelAggregation, funnelSortOrder, funnelTopN, funnelGroupOther, funnelShowPercentOfFirst]);

  const scatterSeries = useMemo(() => {
    if (chartType !== 'scatter') return [] as Array<{ key: string; label: string; data: any[]; color: string }>;

    const xKey = xAxis;
    const yKey = yAxis;
    if (!xKey || !yKey) return [];

    const cleaned = chartData.filter((r: any) => {
      const x = toNumber(r?.[xKey]);
      const y = toNumber(r?.[yKey]);
      return x !== null && y !== null;
    });

    if (!scatterColorBy) {
      return [{ key: 'series', label: 'Series', data: cleaned, color: COLORS[0] }];
    }

    const groups = new Map<string, any[]>();
    for (const r of cleaned) {
      const k = String((r as any)?.[scatterColorBy] ?? '').trim() || 'Unknown';
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    return Array.from(groups.entries()).map(([k, data], idx) => ({ key: k, label: k, data, color: COLORS[idx % COLORS.length] }));
  }, [chartType, chartData, xAxis, yAxis, scatterColorBy]);

  const availableSeriesKeys = useMemo(() => {
    if (isXYChart) return xySeriesKeys;
    if (chartType === 'pie' || chartType === 'donut') return pieData.map((d) => d.name);
    if (chartType === 'radar') return radarPrepared.seriesKeys;
    if (chartType === 'funnel') return funnelData.map((d) => d.name);
    return [];
  }, [isXYChart, chartType, xySeriesKeys, pieData, radarPrepared, funnelData]);

  const getColor = useCallback((key: string, index: number) => {
    if (colorScheme === 'specific') {
      return colorMapping[key] || COLORS[index % COLORS.length];
    }
    return effectiveColors[index % effectiveColors.length];
  }, [colorScheme, colorMapping, effectiveColors]);

  const renderChart = () => {
    if (!hasResults) {
      return (
        <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>
          Run a query to visualize results.
        </div>
      );
    }

    if (!layoutReady) {
      return (
        <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>
          Preparing chart...
        </div>
      );
    }

    const commonGrid = showGrid ? <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" /> : null;
    const commonTooltip = <Tooltip />;
    const commonLegend = showLegend ? <Legend /> : null;

    if (chartType === 'table') {
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: tableDense ? '11px' : '12px' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>
              <tr>
                {tableColumnsToShow.map((c) => (
                  <th
                    key={c}
                    style={{
                      textAlign: 'left',
                      padding: tableDense ? '8px 10px' : '10px 12px',
                      borderBottom: '1px solid #e2e8f0',
                      color: '#475569',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                    title="Click to sort"
                    onClick={() => {
                      if (tableSortColumn === c) {
                        setTableSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setTableSortColumn(c);
                        setTableSortDir('asc');
                      }
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span>{c}</span>
                      {tableSortColumn === c ? (
                        <span style={{ fontSize: '10px', color: '#64748b' }}>{tableSortDir === 'asc' ? '▲' : '▼'}</span>
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRowsToShow.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  {tableColumnsToShow.map((c) => (
                    <td
                      key={c}
                      style={{
                        padding: tableDense ? '6px 10px' : '8px 12px',
                        color: '#334155',
                        whiteSpace: tableWrap ? 'normal' : 'nowrap',
                        maxWidth: tableWrap ? '640px' : '320px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r?.[c] === null ? <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>null</span> : String(r?.[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (chartType === 'kpi') {
      const nums = rows
        .map((r) => toNumber(r?.[yAxis]))
        .filter((n): n is number => n !== null && Number.isFinite(n));

      let value = 0;
      if (kpiAggregation === 'count') {
        value = rows.length;
      } else if (kpiAggregation === 'sum') {
        value = nums.reduce((acc, n) => acc + n, 0);
      } else if (kpiAggregation === 'avg') {
        value = nums.length > 0 ? nums.reduce((acc, n) => acc + n, 0) / nums.length : 0;
      } else if (kpiAggregation === 'min') {
        value = nums.length > 0 ? Math.min(...nums) : 0;
      } else if (kpiAggregation === 'max') {
        value = nums.length > 0 ? Math.max(...nums) : 0;
      }

      const formatted = Number.isFinite(value)
        ? `${kpiPrefix}${value.toLocaleString(undefined, { minimumFractionDigits: kpiDecimals, maximumFractionDigits: kpiDecimals })}${kpiSuffix}`
        : '—';

      return (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, marginBottom: '8px' }}>{yAxis || 'Value'}</div>
          <div style={{ fontSize: '48px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>{formatted}</div>
        </div>
      );
    }

    if (chartType === 'gauge') {
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 520, maxWidth: '100%' }}>
            <GaugeChart
              value={gaugeValue}
              minValue={gaugeMinValue}
              maxValue={gaugeComputedMax}
              title={yAxis || 'Value'}
              unit={gaugeUnit}
              decimals={gaugeDecimals}
              prefix={gaugePrefix}
              suffix={gaugeSuffix}
              thresholds={{ low: gaugeThresholdLow, medium: gaugeThresholdMedium }}
              showLegend={gaugeShowLegend}
              showPercent={gaugeShowPercent}
              showValue={gaugeShowValue}
            />
          </div>
        </div>
      );
    }

    if (chartType === 'heatmap') {
      if (!xAxis || !yAxis || !heatmapValueColumn) {
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔥</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Select X, Y, and Value columns</div>
              <div style={{ fontSize: '12px', marginTop: '6px' }}>X & Y should be categorical, Value should be numeric</div>
            </div>
          </div>
        );
      }

      return (
        <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <HeatmapChart
            data={rows}
            xColumn={xAxis}
            yColumn={yAxis}
            valueColumn={heatmapValueColumn}
            aggregation={heatmapAggregation}
            colorScheme={heatmapColorScheme}
            showValues={heatmapShowValues}
            showGrid={heatmapShowGrid}
            cellBorderWidth={heatmapCellBorderWidth}
            height={400}
          />
        </div>
      );
    }

    if (chartType === 'histogram') {
      if (!histogramValueColumn) {
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Select a numeric column</div>
              <div style={{ fontSize: '12px', marginTop: '6px' }}>Histogram shows the distribution of values</div>
            </div>
          </div>
        );
      }

      return (
        <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <HistogramChart
            data={rows}
            valueColumn={histogramValueColumn}
            binCount={histogramBinCount}
            color={histogramColor}
            showGrid={histogramShowGrid}
            showValues={histogramShowValues}
            height={400}
          />
        </div>
      );
    }

    if (chartType === 'boxplot') {
      if (!boxPlotValueColumn) {
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📦</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Select a numeric column</div>
              <div style={{ fontSize: '12px', marginTop: '6px' }}>Box plot shows distribution statistics</div>
            </div>
          </div>
        );
      }

      return (
        <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <BoxPlotChart
            data={rows}
            valueColumn={boxPlotValueColumn}
            categoryColumn={boxPlotCategoryColumn || undefined}
            showOutliers={boxPlotShowOutliers}
            boxColor={boxPlotBoxColor}
            showGrid={boxPlotShowGrid}
            height={400}
          />
        </div>
      );
    }

    if (chartType === 'funnel') {
      const data = funnelData;
      const currentColors = data.map((d, i) => getColor(d.name, i));

      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 560, maxWidth: '100%' }}>
            <FunnelChart data={data} nameKey="name" dataKey="value" colors={currentColors} height={320} />
            {funnelShowPercentOfFirst && data.length > 0 ? (
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#64748b' }}>
                Showing percent of first stage.
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    if (chartType === 'pie' || chartType === 'donut') {
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
              innerRadius={chartType === 'donut' ? donutInnerRadius : 0}
              outerRadius={110}
              paddingAngle={2}
              label={showDataLabels && pieLabelMode !== 'none' ? labelFn : false}
              labelLine={showDataLabels && pieLabelMode !== 'none'}
            >
              {pieData.map((entry, idx) => (
                <Cell key={idx} fill={getColor(entry.name, idx)} />
              ))}
            </Pie>
            {chartType === 'donut' ? (
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#0f172a" style={{ fontSize: 12, fontWeight: 800 }}>
                {pieTotalValue ? pieTotalValue.toLocaleString() : ''}
              </text>
            ) : null}
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'scatter') {
      return (
        <ScatterPlot
          data={[]}
          series={scatterSeries}
          xKey={xAxis}
          yKey={yAxis}
          sizeKey={scatterSizeBy || undefined}
          height={420}
          showGrid={showGrid}
          showLegend={showLegend}
          pointOpacity={scatterPointOpacity}
          maxPointSize={scatterMaxPointSize}
          xLabel={xAxis}
          yLabel={yAxis}
        />
      );
    }

    if (chartType === 'radar') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarPrepared.data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            {showGrid ? <PolarGrid stroke="#e2e8f0" /> : null}
            <PolarAngleAxis dataKey={radarPrepared.axisKey} tick={{ fontSize: 11 }} />
            {radarPrepared.normalized ? (
              <PolarRadiusAxis
                tick={{ fontSize: 10 }}
                domain={radarPrepared.hasNegative ? [-1, 1] : [0, 1]}
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
              />
            ) : (
              <PolarRadiusAxis tick={{ fontSize: 10 }} />
            )}
            {commonTooltip}
            {commonLegend}
            {radarPrepared.seriesKeys.map((k, i) => (
              <Radar
                key={k}
                name={k}
                dataKey={k}
                stroke={getColor(k, i)}
                fill={getColor(k, i)}
                fillOpacity={radarFillOpacity}
                strokeWidth={2}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={xyChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            {commonGrid}
            <XAxis dataKey={xyXAxisKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            {commonTooltip}
            {commonLegend}
            {xySeriesKeys.map((k, i) => (
              <Line key={k} type={curveType} dataKey={k} stroke={getColor(k, i)} strokeWidth={2} dot={showMarkers}>
                {showDataLabels ? <LabelList dataKey={k} position="top" /> : null}
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'area') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={xyChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            {commonGrid}
            <XAxis dataKey={xyXAxisKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            {commonTooltip}
            {commonLegend}
            {xySeriesKeys.map((k, i) => (
              <Area
                key={k}
                type={curveType}
                dataKey={k}
                stroke={getColor(k, i)}
                fill={getColor(k, i)}
                fillOpacity={areaFillOpacity}
                dot={showMarkers}
                stackId={seriesBy && isStacked ? 'stack' : undefined}
              >
                {showDataLabels ? <LabelList dataKey={k} position="top" /> : null}
              </Area>
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    // default: bar
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={xyChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }} layout={barOrientation === 'horizontal' ? 'vertical' : 'horizontal'}>
          {commonGrid}
          {barOrientation === 'horizontal' ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey={xyXAxisKey} tick={{ fontSize: 11 }} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={xyXAxisKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
            </>
          )}
          {commonTooltip}
          {commonLegend}
          {xySeriesKeys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              fill={getColor(k, i)}
              stackId={seriesBy && isStacked ? 'stack' : undefined}
              radius={barOrientation === 'horizontal' ? [0, barCornerRadius, barCornerRadius, 0] : [barCornerRadius, barCornerRadius, 0, 0]}
            >
              {showDataLabels ? <LabelList dataKey={k} position={barOrientation === 'horizontal' ? 'right' : 'top'} /> : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const chartTypeButtons: Array<{ key: ChartType; label: string }> = (Object.keys(chartTypeMeta) as ChartType[]).map((k) => ({
    key: k,
    label: chartTypeMeta[k].label,
  }));

  const mappingLabel = (t: ChartType): { x: string; y: string } => {
    if (t === 'pie' || t === 'donut' || t === 'funnel' || t === 'radar') return { x: 'Category', y: 'Value' };
    if (t === 'scatter') return { x: 'X-Axis', y: 'Y-Axis' };
    if (t === 'kpi' || t === 'gauge') return { x: '—', y: 'Value' };
    if (t === 'histogram' || t === 'boxplot') return { x: '—', y: 'Value' };
    return { x: 'X-Axis', y: 'Y-Axis' };
  };

  const showXYSelectors = chartType !== 'table';
  const showXSelector = showXYSelectors && !(chartType === 'kpi' || chartType === 'gauge' || chartType === 'histogram' || chartType === 'boxplot');
  const showYSelector = showXYSelectors && chartType !== 'histogram' && chartType !== 'boxplot';

  const showSeriesSelector = chartType === 'bar' || chartType === 'line' || chartType === 'area';
  const showAggregationSelector = showSeriesSelector && mode !== 'sql_direct';
  const showSortSelector = showSeriesSelector && mode !== 'sql_direct';

  const canShowGrid = chartType === 'bar' || chartType === 'line' || chartType === 'area' || chartType === 'scatter';
  const canShowLegend = chartType !== 'table' && chartType !== 'kpi' && chartType !== 'gauge';
  const canShowDataLabels = chartType === 'bar' || chartType === 'line' || chartType === 'area' || chartType === 'pie' || chartType === 'donut';

  const isPie = chartType === 'pie' || chartType === 'donut';
  const isScatter = chartType === 'scatter';
  const isRadar = chartType === 'radar';
  const isFunnel = chartType === 'funnel';
  const isKpi = chartType === 'kpi';
  const isGauge = chartType === 'gauge';
  const isTable = chartType === 'table';
  const showColorSettings = isXYChart || isPie || isRadar || isFunnel;

  if (!isOpen) return null;

  const labels = mappingLabel(chartType);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      {iconTooltip && (
        <div
          style={{
            position: 'fixed',
            left: iconTooltip.x,
            top: iconTooltip.y,
            transform: 'translate(-50%, -100%)',
            background: 'white',
            color: '#0f172a',
            fontSize: '11px',
            fontWeight: 700,
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            maxWidth: '300px',
            zIndex: 9999,
            pointerEvents: 'none',
            whiteSpace: 'normal',
            textAlign: 'center',
            lineHeight: 1.35,
          }}
        >
          {iconTooltip.text}
        </div>
      )}
      <div
        style={{
          width: 'min(1280px, 95vw)',
          height: 'min(760px, 90vh)',
          backgroundColor: 'white',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>Visualize</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{rows.length.toLocaleString()} rows • {columns.length} columns</div>
            {(totalPages ?? 1) > 1 && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Note: You are viewing a preview of page {page ?? 1}. Full results will be reflected after you save this to a dashboard.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                setSaveError(null);
                // Explicitly set the save name. If editing (initialConfig present), use the existing name.
                // If creating new, ensure it starts empty (do NOT use chartTitle).
                const nameToUse = initialConfig?.insightName || '';
                setSaveName(nameToUse);
                setSaveDescription(initialConfig?.insightDescription || '');
                setIsSaveModalOpen(true);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#4f46e5',
                fontSize: '12px',
                fontWeight: 700,
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Save Insight
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                backgroundColor: 'white',
                fontSize: '12px',
                fontWeight: 700,
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Sidebar */}
          <div
            style={{
              width: '320px',
              borderRight: '1px solid #e2e8f0',
              backgroundColor: 'white',
              overflow: 'auto',
              padding: '14px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '10px' }}>VISUALIZATION TYPE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {chartTypeButtons.map((b) => {
                const active = chartType === b.key;
                const meta = chartTypeMeta[b.key];
                return (
                  <button
                    key={b.key}
                    onClick={() => setChartType(b.key)}
                    style={{
                      padding: '10px 10px',
                      borderRadius: '10px',
                      border: active ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                      backgroundColor: active ? '#eef2ff' : 'white',
                      color: active ? '#4f46e5' : '#0f172a',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                    aria-label={`${b.label}. ${meta.help}`}
                  >
                    <Icon
                      label={meta.help}
                      onHoverIn={(e) => showIconTooltip(meta.help, e.currentTarget)}
                      onHoverOut={hideIconTooltip}
                    >
                      {meta.icon}
                    </Icon>
                    <span>{b.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>CHART TITLE</div>
            <input
              value={chartTitle}
              onChange={(e) => setChartTitle(e.target.value)}
              placeholder="Chart title"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
                color: '#0f172a',
                outline: 'none',
                marginBottom: '14px',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#4f46e5')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
            />

            <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>DATA MAPPING</div>

            {showXSelector && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>{labels.x}</div>
                {isXYChart ? (
                  <>
                    <MultiSelectChipField
                      value={xAxes}
                      onChange={(next) => {
                        const valid = next.filter((c) => columns.includes(c));
                        setXAxes(valid.length > 0 ? valid : (columns[0] ? [columns[0]] : []));
                      }}
                      placeholder="Click to select columns"
                      groups={[{ label: 'Columns', options: columns }]}
                    />

                    {isTemporalX && mode !== 'sql_direct' && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '6px' }}>TIME BREAKDOWN</div>
                        <select
                          value={xTimeGrain}
                          onChange={(e) => setXTimeGrain(e.target.value as TimeGrain)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#0f172a',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="none">Raw</option>
                          <option value="minute">Minute</option>
                          <option value="hour">Hour</option>
                          <option value="day">Day</option>
                          <option value="week">Week</option>
                          <option value="month">Month</option>
                          <option value="quarter">Quarter</option>
                          <option value="year">Year</option>
                        </select>
                      </div>
                    )}
                  </>
                ) : (
                  <select
                    value={xAxis}
                    onChange={(e) => setXAxes(e.target.value ? [e.target.value] : [])}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#0f172a',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    {isScatter && numericColumns.length > 0 ? (
                      <>
                        <optgroup label="Numeric columns">
                          {numericColumns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </optgroup>
                        {nonNumericColumns.length > 0 ? (
                          <optgroup label="Other columns">
                            {nonNumericColumns.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </>
                    ) : isPie && nonNumericColumns.length > 0 ? (
                      <>
                        <optgroup label="Category columns">
                          {nonNumericColumns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </optgroup>
                        {numericColumns.length > 0 ? (
                          <optgroup label="Numeric columns">
                            {numericColumns.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </>
                    ) : (
                      columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            )}

            {showYSelector && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>{labels.y}</div>
                {isXYChart || isRadar ? (
                  <>
                    <MultiSelectChipField
                      value={yAxes}
                      onChange={(next) => {
                        const valid = next.filter((c) => columns.includes(c));
                        const fallback = numericColumns[0] || columns[0] || '';
                        setYAxes(valid.length > 0 ? valid : (fallback ? [fallback] : []));
                      }}
                      placeholder="Click to select columns"
                      groups={[
                        { label: 'Numeric columns', options: numericColumns },
                        { label: 'Other columns', options: nonNumericColumns },
                      ]}
                    />

                    {isRadar && radarUsePerMetricAggregation && yAxes.length > 0 ? (
                      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {yAxes.map((metric) => (
                          <div key={metric} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                padding: '6px 10px',
                                borderRadius: '999px',
                                border: '1px solid #e2e8f0',
                                backgroundColor: '#f8fafc',
                                color: '#0f172a',
                                fontSize: '12px',
                                fontWeight: 700,
                                lineHeight: 1,
                                maxWidth: '55%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={metric}
                            >
                              {metric}
                            </div>
                            <select
                              value={(radarMetricAggregations[metric] ?? radarAggregation) as RadarAggregation}
                              onChange={(e) =>
                                setRadarMetricAggregations((prev) => ({
                                  ...prev,
                                  [metric]: e.target.value as RadarAggregation,
                                }))
                              }
                              style={{
                                flex: 1,
                                padding: '8px 10px',
                                borderRadius: '10px',
                                border: '1px solid #e2e8f0',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#0f172a',
                                backgroundColor: 'white',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="sum">Sum</option>
                              <option value="avg">Average</option>
                              <option value="min">Min</option>
                              <option value="max">Max</option>
                              <option value="count">Count rows</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <select
                    value={yAxis}
                    onChange={(e) => setYAxes(e.target.value ? [e.target.value] : [])}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#0f172a',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    {(chartType === 'scatter' || chartType === 'kpi' || chartType === 'gauge' || chartType === 'funnel') && numericColumns.length > 0 ? (
                      <>
                        <optgroup label="Numeric columns">
                          {numericColumns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </optgroup>
                        {nonNumericColumns.length > 0 ? (
                          <optgroup label="Other columns">
                            {nonNumericColumns.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </>
                    ) : (
                      columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            )}

            {showColorSettings ? (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>APPEARANCE</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Color Scheme</div>
                <select
                  value={colorScheme}
                  onChange={(e) => setColorScheme(e.target.value as 'default' | 'custom' | 'specific')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="default">Default (Indigo/Slate)</option>
                  <option value="custom">Custom Palette</option>
                  <option value="specific">Specific Mapping</option>
                </select>

                {colorScheme === 'specific' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {availableSeriesKeys.length === 0 ? (
                      <div style={{ fontSize: '11px', color: '#64748b' }}>No series detected to map.</div>
                    ) : (
                      availableSeriesKeys.map((key, idx) => (
                        <div key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="color"
                            value={colorMapping[key] || COLORS[idx % COLORS.length]}
                            onChange={(e) => {
                              setColorMapping((prev) => ({ ...prev, [key]: e.target.value }));
                            }}
                            style={{
                              width: '36px',
                              height: '36px',
                              padding: '0',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              backgroundColor: 'transparent',
                            }}
                          />
                          <div style={{ fontSize: '12px', color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {key}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {colorScheme === 'custom' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {customColors.map((color, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => {
                            const next = [...customColors];
                            next[idx] = e.target.value;
                            setCustomColors(next);
                          }}
                          style={{
                            width: '36px',
                            height: '36px',
                            padding: '0',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            backgroundColor: 'transparent',
                          }}
                        />
                        <input
                          type="text"
                          value={color}
                          onChange={(e) => {
                            const next = [...customColors];
                            next[idx] = e.target.value;
                            setCustomColors(next);
                          }}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            fontSize: '12px',
                            color: '#0f172a',
                            outline: 'none',
                          }}
                        />
                        {customColors.length > 1 && (
                          <button
                            onClick={() => {
                              const next = customColors.filter((_, i) => i !== idx);
                              setCustomColors(next);
                            }}
                            style={{
                              padding: '8px',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              backgroundColor: 'white',
                              color: '#ef4444',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title="Remove color"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setCustomColors([...customColors, '#000000'])}
                      style={{
                        marginTop: '4px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px dashed #cbd5e1',
                        backgroundColor: '#f8fafc',
                        color: '#64748b',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        width: '100%',
                      }}
                    >
                      + Add Color
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {isKpi ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>KPI SETTINGS</div>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Aggregation</div>
                <select
                  value={kpiAggregation}
                  onChange={(e) => setKpiAggregation(e.target.value as KpiAggregation)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  <option value="count">Count rows</option>
                </select>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Decimals</div>
                <input
                  type="range"
                  min={0}
                  max={6}
                  value={kpiDecimals}
                  onChange={(e) => setKpiDecimals(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5' }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '10px' }}>{kpiDecimals}</div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Prefix</div>
                    <input
                      value={kpiPrefix}
                      onChange={(e) => setKpiPrefix(e.target.value)}
                      placeholder="$"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        color: '#0f172a',
                        outline: 'none',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = '#4f46e5')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Suffix</div>
                    <input
                      value={kpiSuffix}
                      onChange={(e) => setKpiSuffix(e.target.value)}
                      placeholder="%"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        color: '#0f172a',
                        outline: 'none',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = '#4f46e5')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    />
                  </div>
                </div>
              </>
            ) : null}

            {isRadar ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>RADAR SETTINGS</div>

                {mode !== 'sql_direct' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                    <input
                      type="checkbox"
                      checked={radarUsePerMetricAggregation}
                      onChange={(e) => setRadarUsePerMetricAggregation(e.target.checked)}
                      style={{ accentColor: '#4f46e5' }}
                    />
                    Advanced: per-metric aggregation
                  </label>
                )}

                {yAxes.length > 1 ? (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Axes</div>
                    <select
                      value={radarAxisMode}
                      onChange={(e) => setRadarAxisMode(e.target.value as RadarAxisMode)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#0f172a',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        marginBottom: '10px',
                      }}
                    >
                      <option value="metrics">Metrics (Y columns)</option>
                      <option value="categories">Categories (X)</option>
                    </select>

                    {radarAxisMode === 'metrics' ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                        <input
                          type="checkbox"
                          checked={radarNormalizeMetrics}
                          onChange={(e) => setRadarNormalizeMetrics(e.target.checked)}
                          style={{ accentColor: '#4f46e5' }}
                        />
                        Normalize metrics (per-axis scale)
                      </label>
                    ) : null}
                  </>
                ) : null}

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Series by (optional)</div>
                <select
                  value={radarSeriesBy}
                  onChange={(e) => setRadarSeriesBy(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="">None</option>
                  {nonNumericColumns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                {mode !== 'sql_direct' && (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                      {radarUsePerMetricAggregation ? 'Default aggregation (used when a metric has no override)' : 'Aggregation (applies to selected Y columns)'}
                    </div>
                    <select
                      value={radarAggregation}
                      onChange={(e) => setRadarAggregation(e.target.value as RadarAggregation)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#0f172a',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        marginBottom: '10px',
                      }}
                    >
                      <option value="sum">Sum</option>
                      <option value="avg">Average</option>
                      <option value="min">Min</option>
                      <option value="max">Max</option>
                      <option value="count">Count rows</option>
                    </select>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '-6px', marginBottom: '10px' }}>
                      {radarUsePerMetricAggregation
                        ? 'Set per-metric aggregations next to each selected Y column.'
                        : 'Aggregation is computed per group (region/series) for each selected metric.'}
                    </div>
                  </>
                )}

                {mode !== 'sql_direct' && (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Sort</div>
                    <select
                      value={radarSortOrder}
                      onChange={(e) => setRadarSortOrder(e.target.value as RadarSortOrder)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#0f172a',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        marginBottom: '10px',
                      }}
                    >
                      <option value="value_desc">Value (desc)</option>
                      <option value="value_asc">Value (asc)</option>
                      <option value="label_asc">Label (A→Z)</option>
                      <option value="label_desc">Label (Z→A)</option>
                    </select>
                  </>
                )}

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>
                  {yAxes.length > 1 && radarAxisMode === 'metrics' ? 'Max series' : 'Max categories'}
                </div>
                <input
                  type="range"
                  min={3}
                  max={24}
                  value={radarTopN}
                  onChange={(e) => setRadarTopN(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5' }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '10px' }}>Up to {radarTopN}</div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                  <input type="checkbox" checked={radarGroupOther} onChange={(e) => setRadarGroupOther(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Group remaining as “Other”
                </label>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Fill opacity</div>
                <input
                  type="range"
                  min={0.05}
                  max={0.7}
                  step={0.05}
                  value={radarFillOpacity}
                  onChange={(e) => setRadarFillOpacity(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5' }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '14px' }}>{radarFillOpacity.toFixed(2)}</div>
              </>
            ) : null}

            {isFunnel ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>FUNNEL SETTINGS</div>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Aggregation</div>
                <select
                  value={funnelAggregation}
                  onChange={(e) => setFunnelAggregation(e.target.value as FunnelAggregation)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  <option value="count">Count rows</option>
                </select>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Sort stages</div>
                <select
                  value={funnelSortOrder}
                  onChange={(e) => setFunnelSortOrder(e.target.value as FunnelSortOrder)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="value_desc">Value (desc)</option>
                  <option value="value_asc">Value (asc)</option>
                  <option value="label_asc">Label (A→Z)</option>
                  <option value="label_desc">Label (Z→A)</option>
                </select>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Stages</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={funnelTopN === 0}
                    onChange={(e) => setFunnelTopN(e.target.checked ? 0 : 10)}
                    style={{ accentColor: '#4f46e5' }}
                  />
                  All
                </label>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Top N</div>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={funnelTopN === 0 ? '' : funnelTopN}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next)) return;
                    setFunnelTopN(Math.max(1, Math.round(next)));
                  }}
                  disabled={funnelTopN === 0}
                  placeholder="10"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: funnelTopN === 0 ? '#94a3b8' : '#0f172a',
                    backgroundColor: funnelTopN === 0 ? '#f8fafc' : 'white',
                    outline: 'none',
                  }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '10px' }}>
                  {funnelTopN === 0 ? 'All stages' : `Top ${funnelTopN}`}
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                  <input type="checkbox" checked={funnelGroupOther} onChange={(e) => setFunnelGroupOther(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Group remaining as “Other”
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '14px' }}>
                  <input
                    type="checkbox"
                    checked={funnelShowPercentOfFirst}
                    onChange={(e) => setFunnelShowPercentOfFirst(e.target.checked)}
                    style={{ accentColor: '#4f46e5' }}
                  />
                  Show percent of first stage
                </label>
              </>
            ) : null}

            {isGauge ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>GAUGE SETTINGS</div>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Aggregation</div>
                <select
                  value={gaugeAggregation}
                  onChange={(e) => setGaugeAggregation(e.target.value as GaugeAggregation)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="last">Last</option>
                  <option value="first">First</option>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  <option value="count">Count rows</option>
                </select>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Sort by</div>
                <select
                  value={gaugeSortByColumn}
                  onChange={(e) => setGaugeSortByColumn(e.target.value)}
                  disabled={!(gaugeAggregation === 'first' || gaugeAggregation === 'last')}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: gaugeAggregation === 'first' || gaugeAggregation === 'last' ? '#0f172a' : '#94a3b8',
                    backgroundColor: gaugeAggregation === 'first' || gaugeAggregation === 'last' ? 'white' : '#f8fafc',
                    cursor: gaugeAggregation === 'first' || gaugeAggregation === 'last' ? 'pointer' : 'not-allowed',
                    marginBottom: '10px',
                  }}
                >
                  <option value="">(None)</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                  Used to make “First/Last” deterministic.
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Min</div>
                    <input
                      type="number"
                      value={gaugeMinValue}
                      onChange={(e) => setGaugeMinValue(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        color: '#0f172a',
                        outline: 'none',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = '#4f46e5')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Max</div>
                    <input
                      type="number"
                      value={gaugeMaxValue}
                      onChange={(e) => setGaugeMaxValue(Number(e.target.value))}
                      disabled={gaugeUseAutoMax}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        color: gaugeUseAutoMax ? '#94a3b8' : '#0f172a',
                        outline: 'none',
                        backgroundColor: gaugeUseAutoMax ? '#f8fafc' : 'white',
                      }}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '14px' }}>
                  <input type="checkbox" checked={gaugeUseAutoMax} onChange={(e) => setGaugeUseAutoMax(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Auto max
                </label>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Decimals</div>
                <input
                  type="range"
                  min={0}
                  max={6}
                  value={gaugeDecimals}
                  onChange={(e) => setGaugeDecimals(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5' }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '10px' }}>{gaugeDecimals}</div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Prefix</div>
                    <input
                      value={gaugePrefix}
                      onChange={(e) => setGaugePrefix(e.target.value)}
                      placeholder="$"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        color: '#0f172a',
                        outline: 'none',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = '#4f46e5')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Suffix</div>
                    <input
                      value={gaugeSuffix}
                      onChange={(e) => setGaugeSuffix(e.target.value)}
                      placeholder=""
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        color: '#0f172a',
                        outline: 'none',
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = '#4f46e5')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Unit (optional)</div>
                <input
                  value={gaugeUnit}
                  onChange={(e) => setGaugeUnit(e.target.value)}
                  placeholder="%"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    color: '#0f172a',
                    outline: 'none',
                    marginBottom: '14px',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#4f46e5')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                />

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Thresholds</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>Low: {gaugeThresholdLow}% • Medium: {gaugeThresholdMedium}%</div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={gaugeThresholdLow}
                  onChange={(e) => setGaugeThresholdLow(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5', marginBottom: '8px' }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={gaugeThresholdMedium}
                  onChange={(e) => setGaugeThresholdMedium(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5', marginBottom: '14px' }}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                  <input type="checkbox" checked={gaugeShowValue} onChange={(e) => setGaugeShowValue(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Show value
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                  <input type="checkbox" checked={gaugeShowPercent} onChange={(e) => setGaugeShowPercent(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Show percent
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '14px' }}>
                  <input type="checkbox" checked={gaugeShowLegend} onChange={(e) => setGaugeShowLegend(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Show legend
                </label>
              </>
            ) : null}

            {isTable ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>TABLE SETTINGS</div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={tableEnableAggregation}
                    onChange={(e) => setTableEnableAggregation(e.target.checked)}
                    style={{ accentColor: '#4f46e5' }}
                  />
                  Aggregate table (group by + metrics)
                </label>

                {tableEnableAggregation ? (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Group by</div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 10px', maxHeight: '140px', overflow: 'auto', marginBottom: '12px' }}>
                      {columns.map((c) => {
                        const checked = tableGroupByColumns.includes(c);
                        return (
                          <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', padding: '6px 0' }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const nextChecked = e.target.checked;
                                setTableGroupByColumns((prev) => {
                                  if (nextChecked) return Array.from(new Set([...prev, c]));
                                  return prev.filter((x) => x !== c);
                                });
                              }}
                              style={{ accentColor: '#4f46e5' }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Metrics</div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '12px' }}>
                      {tableMetrics.length === 0 ? (
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Add one or more metrics (e.g. sum(revenue), count(transaction_id), avg(discount_pct)).</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {tableMetrics.map((m, idx) => (
                            <div key={`${m.agg}_${m.column}_${idx}`} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <select
                                value={m.agg}
                                onChange={(e) => {
                                  const nextAgg = e.target.value as any;
                                  setTableMetrics((prev) => {
                                    const next = prev.slice();
                                    const col = next[idx]?.column ?? '';
                                    const alias = safeTableAlias(nextAgg, col || '*');
                                    next[idx] = { ...next[idx], agg: nextAgg, alias };
                                    return next;
                                  });
                                }}
                                style={{ flex: 0.9, padding: '10px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#0f172a', backgroundColor: 'white', cursor: 'pointer' }}
                              >
                                <option value="sum">Sum</option>
                                <option value="avg">Average</option>
                                <option value="min">Min</option>
                                <option value="max">Max</option>
                                <option value="count">Count</option>
                                <option value="count_distinct">Count distinct</option>
                              </select>
                              <select
                                value={m.column}
                                onChange={(e) => {
                                  const nextCol = e.target.value;
                                  setTableMetrics((prev) => {
                                    const next = prev.slice();
                                    const agg = next[idx]?.agg ?? 'sum';
                                    const alias = safeTableAlias(agg, nextCol || '*');
                                    next[idx] = { ...next[idx], column: nextCol, alias };
                                    return next;
                                  });
                                }}
                                style={{ flex: 1.3, padding: '10px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, color: '#0f172a', backgroundColor: 'white', cursor: 'pointer' }}
                              >
                                <option value="">Select column…</option>
                                <option value="*">(rows)</option>
                                {columns.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => setTableMetrics((prev) => prev.filter((_, j) => j !== idx))}
                                style={{ padding: '10px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#ef4444', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const firstNumeric = numericColumns[0] || columns[0] || '';
                            const col = firstNumeric || '*';
                            const agg: any = 'sum';
                            const alias = safeTableAlias(agg, col || '*');
                            setTableMetrics((prev) => prev.concat([{ agg, column: col, alias }]));
                          }}
                          style={{ flex: 1, padding: '10px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#0f172a', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}
                        >
                          Add metric
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                  <input type="checkbox" checked={tableFullData} onChange={(e) => setTableFullData(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Full data (load on scroll)
                </label>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Row limit</div>
                <input
                  type="number"
                  min={10}
                  value={tableRowLimit}
                  onChange={(e) => setTableRowLimit(Number(e.target.value))}
                  disabled={tableFullData}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    color: tableFullData ? '#94a3b8' : '#0f172a',
                    outline: 'none',
                    backgroundColor: tableFullData ? '#f8fafc' : 'white',
                    marginBottom: '10px',
                  }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
                  {tableFullData ? 'No limit (loads progressively as you scroll).' : 'Maximum rows included in the saved Insight (loads progressively as you scroll).'}
                </div>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Sort column</div>
                <select
                  value={tableSortColumn}
                  onChange={(e) => setTableSortColumn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="">None</option>
                  {(tableEnableAggregation ? Array.from(new Set([...tableGroupByColumns, ...tableMetrics.map((m) => m.alias).filter(Boolean)])) : columns).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {tableSortColumn ? (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <button
                      type="button"
                      onClick={() => setTableSortDir('asc')}
                      style={{
                        flex: 1,
                        padding: '10px 10px',
                        borderRadius: '10px',
                        border: tableSortDir === 'asc' ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                        backgroundColor: tableSortDir === 'asc' ? '#eef2ff' : 'white',
                        color: tableSortDir === 'asc' ? '#4f46e5' : '#0f172a',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Asc
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableSortDir('desc')}
                      style={{
                        flex: 1,
                        padding: '10px 10px',
                        borderRadius: '10px',
                        border: tableSortDir === 'desc' ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                        backgroundColor: tableSortDir === 'desc' ? '#eef2ff' : 'white',
                        color: tableSortDir === 'desc' ? '#4f46e5' : '#0f172a',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Desc
                    </button>
                  </div>
                ) : null}

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                  <input type="checkbox" checked={tableDense} onChange={(e) => setTableDense(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Dense rows
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '14px' }}>
                  <input type="checkbox" checked={tableWrap} onChange={(e) => setTableWrap(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Wrap text
                </label>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Visible columns</div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 10px', maxHeight: '160px', overflow: 'auto', marginBottom: '14px' }}>
                  {(tableAggregationEnabled ? tableAggColumns : columns).map((c) => {
                    const checked = tableColumnsToShow.includes(c);
                    return (
                      <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', padding: '6px 0' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextChecked = e.target.checked;
                            setTableVisibleColumns((prev) => {
                              const base = tableAggregationEnabled ? tableAggColumns : columns;
                              const current = prev.length ? prev : base;
                              if (nextChecked) {
                                const next = Array.from(new Set([...current, c]));
                                return next;
                              }
                              const next = current.filter((x) => x !== c);
                              return next.length > 0 ? next : current;
                            });
                          }}
                          style={{ accentColor: '#4f46e5' }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            {isPie ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>PIE / DONUT SETTINGS</div>

                {mode !== 'sql_direct' && (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Aggregation</div>
                    <select
                      value={pieAggregation}
                      onChange={(e) => setPieAggregation(e.target.value as PieAggregation)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#0f172a',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        marginBottom: '10px',
                      }}
                    >
                      <option value="sum">Sum</option>
                      <option value="avg">Average</option>
                      <option value="min">Min</option>
                      <option value="max">Max</option>
                      <option value="count">Count rows</option>
                    </select>
                  </>
                )}

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Sort slices</div>
                <select
                  value={pieSortOrder}
                  onChange={(e) => setPieSortOrder(e.target.value as PieSortOrder)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="value_desc">Value (desc)</option>
                  <option value="value_asc">Value (asc)</option>
                  <option value="label_asc">Label (A→Z)</option>
                  <option value="label_desc">Label (Z→A)</option>
                </select>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Top categories</div>
                <input
                  type="range"
                  min={3}
                  max={20}
                  value={pieTopN}
                  onChange={(e) => setPieTopN(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5' }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '10px' }}>Top {pieTopN}</div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '14px' }}>
                  <input type="checkbox" checked={pieGroupOther} onChange={(e) => setPieGroupOther(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Group remaining as “Other”
                </label>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Label format</div>
                <select
                  value={pieLabelMode}
                  onChange={(e) => setPieLabelMode(e.target.value as PieLabelMode)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '14px',
                  }}
                >
                  <option value="none">None</option>
                  <option value="percent">Percent</option>
                  <option value="value">Value</option>
                  <option value="both">Label + value + percent</option>
                </select>

                {chartType === 'donut' ? (
                  <>
                    <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Donut hole</div>
                    <input
                      type="range"
                      min={30}
                      max={110}
                      value={donutInnerRadius}
                      onChange={(e) => setDonutInnerRadius(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#4f46e5' }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '14px' }}>{donutInnerRadius}px</div>
                  </>
                ) : null}
              </>
            ) : null}

            {isScatter ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>SCATTER SETTINGS</div>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Color by (optional)</div>
                <select
                  value={scatterColorBy}
                  onChange={(e) => setScatterColorBy(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="">None</option>
                  {nonNumericColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Size by (optional)</div>
                <select
                  value={scatterSizeBy}
                  onChange={(e) => setScatterSizeBy(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="">None</option>
                  {numericColumns
                    .filter((c) => c !== xAxis && c !== yAxis)
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>

                {scatterSizeBy ? (
                  <>
                    <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Max point size</div>
                    <input
                      type="range"
                      min={30}
                      max={120}
                      value={scatterMaxPointSize}
                      onChange={(e) => setScatterMaxPointSize(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#4f46e5' }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '10px' }}>{scatterMaxPointSize}px</div>
                  </>
                ) : null}

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Point opacity</div>
                <input
                  type="range"
                  min={0.25}
                  max={1}
                  step={0.05}
                  value={scatterPointOpacity}
                  onChange={(e) => setScatterPointOpacity(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5' }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '14px' }}>{scatterPointOpacity.toFixed(2)}</div>
              </>
            ) : null}

            {chartType === 'heatmap' ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>HEATMAP SETTINGS</div>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Value column *</div>
                <select
                  value={heatmapValueColumn}
                  onChange={(e) => setHeatmapValueColumn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="">Select a value column</option>
                  {numericColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Aggregation</div>
                <select
                  value={heatmapAggregation}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'sum' || v === 'avg' || v === 'count' || v === 'min' || v === 'max') {
                      setHeatmapAggregation(v);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="count">Count</option>
                  <option value="min">Minimum</option>
                  <option value="max">Maximum</option>
                </select>

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={heatmapShowValues}
                    onChange={(e) => setHeatmapShowValues(e.target.checked)}
                    style={{ marginRight: '8px', accentColor: '#4f46e5' }}
                  />
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Show values in cells</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={heatmapShowGrid}
                    onChange={(e) => setHeatmapShowGrid(e.target.checked)}
                    style={{ marginRight: '8px', accentColor: '#4f46e5' }}
                  />
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Show grid lines</div>
                </div>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Cell border width</div>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={0.5}
                  value={heatmapCellBorderWidth}
                  onChange={(e) => setHeatmapCellBorderWidth(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5' }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '14px' }}>{heatmapCellBorderWidth}px</div>
              </>
            ) : null}

            {chartType === 'histogram' ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>HISTOGRAM SETTINGS</div>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Value column *</div>
                <select
                  value={histogramValueColumn}
                  onChange={(e) => setHistogramValueColumn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '14px'
                  }}
                >
                  <option value="">Select numeric column</option>
                  {numericColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Number of bins</div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={histogramBinCount}
                  onChange={(e) => setHistogramBinCount(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5' }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '14px' }}>{histogramBinCount} bins</div>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Bar color</div>
                <input
                  type="color"
                  value={histogramColor}
                  onChange={(e) => setHistogramColor(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    marginBottom: '14px'
                  }}
                />

                <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={histogramShowGrid}
                    onChange={(e) => setHistogramShowGrid(e.target.checked)}
                    style={{ marginRight: '8px', accentColor: '#4f46e5', cursor: 'pointer' }}
                  />
                  Show grid
                </label>

                <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '14px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={histogramShowValues}
                    onChange={(e) => setHistogramShowValues(e.target.checked)}
                    style={{ marginRight: '8px', accentColor: '#4f46e5', cursor: 'pointer' }}
                  />
                  Show values on bars
                </label>
              </>
            ) : null}

            {chartType === 'boxplot' ? (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>BOX PLOT SETTINGS</div>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Value column *</div>
                <select
                  value={boxPlotValueColumn}
                  onChange={(e) => setBoxPlotValueColumn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '14px'
                  }}
                >
                  <option value="">Select numeric column</option>
                  {numericColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Category column (optional)</div>
                <select
                  value={boxPlotCategoryColumn}
                  onChange={(e) => setBoxPlotCategoryColumn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '8px'
                  }}
                >
                  <option value="">None (single box)</option>
                  {nonNumericColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '14px' }}>
                  Group data by category to show multiple boxes
                </div>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Box color</div>
                <input
                  type="color"
                  value={boxPlotBoxColor}
                  onChange={(e) => setBoxPlotBoxColor(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    marginBottom: '14px'
                  }}
                />

                <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={boxPlotShowOutliers}
                    onChange={(e) => setBoxPlotShowOutliers(e.target.checked)}
                    style={{ marginRight: '8px', accentColor: '#4f46e5', cursor: 'pointer' }}
                  />
                  Show outliers
                </label>

                <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '14px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={boxPlotShowGrid}
                    onChange={(e) => setBoxPlotShowGrid(e.target.checked)}
                    style={{ marginRight: '8px', accentColor: '#4f46e5', cursor: 'pointer' }}
                  />
                  Show grid lines
                </label>
              </>
            ) : null}

            {showSeriesSelector && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Series (optional)</div>
                <select
                  value={seriesBy}
                  onChange={(e) => setSeriesBy(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">None</option>
                  {nonNumericColumns
                    .filter((c) => c !== xAxis)
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  Split into multiple series by a category column.
                </div>
              </div>
            )}

            {showAggregationSelector && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Aggregation</div>
                <select
                  value={aggregation}
                  onChange={(e) => setAggregation(e.target.value as Aggregation)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  {!seriesBy ? <option value="none">None (raw rows)</option> : null}
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  <option value="count">Count rows</option>
                </select>
              </div>
            )}

            {showSortSelector && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Sort</div>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <option value="none">None</option>
                  <option value="x_asc">X ascending</option>
                  <option value="x_desc">X descending</option>
                  <option value="y_desc">Y descending</option>
                  <option value="y_asc">Y ascending</option>
                </select>
              </div>
            )}

            <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>DISPLAY OPTIONS</div>
            {canShowGrid ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                Show Grid
              </label>
            ) : null}
            {canShowLegend ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                Show Legend
              </label>
            ) : null}
            {canShowDataLabels ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '14px' }}>
                <input type="checkbox" checked={showDataLabels} onChange={(e) => setShowDataLabels(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                Show Data Labels
              </label>
            ) : null}

            {(chartType === 'line' || chartType === 'area') && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>LINE / AREA SETTINGS</div>
                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Curve</div>
                <select
                  value={curveType}
                  onChange={(e) => setCurveType(e.target.value as CurveType)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="monotone">Smooth</option>
                  <option value="linear">Straight</option>
                </select>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: chartType === 'area' ? '10px' : '14px' }}>
                  <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                  Show Markers
                </label>

                {chartType === 'area' ? (
                  <>
                    <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Fill Opacity</div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.6}
                      step={0.05}
                      value={areaFillOpacity}
                      onChange={(e) => setAreaFillOpacity(Number(e.target.value))}
                      style={{ width: '100%', accentColor: '#4f46e5' }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', marginBottom: '14px' }}>{areaFillOpacity.toFixed(2)}</div>

                    {seriesBy ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '14px' }}>
                        <input type="checkbox" checked={isStacked} onChange={(e) => setIsStacked(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                        Stacked
                      </label>
                    ) : null}
                  </>
                ) : null}
              </>
            )}

            {chartType === 'bar' && (
              <>
                <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px' }}>BAR SETTINGS</div>

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Orientation</div>
                <select
                  value={barOrientation}
                  onChange={(e) => setBarOrientation(e.target.value as BarOrientation)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <option value="vertical">Vertical</option>
                  <option value="horizontal">Horizontal</option>
                </select>

                {seriesBy ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#0f172a', marginBottom: '10px' }}>
                    <input type="checkbox" checked={isStacked} onChange={(e) => setIsStacked(e.target.checked)} style={{ accentColor: '#4f46e5' }} />
                    Stacked
                  </label>
                ) : null}

                <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Corner Radius</div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={barCornerRadius}
                  onChange={(e) => setBarCornerRadius(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#4f46e5' }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>{barCornerRadius}px</div>
              </>
            )}
          </div>

          {/* Whiteboard */}
          <div style={{ flex: 1, backgroundColor: '#f8fafc', padding: '16px', minWidth: 0 }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              {chartTitle ? (
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a', marginBottom: '10px' }}>{chartTitle}</div>
              ) : null}
              <div style={{ flex: 1, minHeight: 360, minWidth: 0 }}>{renderChart()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Insight Modal */}
      {isSaveModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setIsSaveModalOpen(false)}
        >
          <div
            style={{
              width: 'min(720px, 95vw)',
              backgroundColor: 'white',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>Save Insight</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                Save this visualization as an insight in your dashboard
              </div>
            </div>

            <div style={{ padding: '20px' }}>
              {saveError && (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: '#fee2e2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#991b1b',
                    marginBottom: '16px',
                  }}
                >
                  {saveError}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Enter insight name"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    outline: 'none',
                  }}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Optional description"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '13px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    outline: 'none',
                    minHeight: '80px',
                    resize: 'vertical',
                  }}
                />
              </div>

              {query && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                    Query Preview
                  </label>
                  <pre
                    style={{
                      margin: 0,
                      padding: '12px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      color: '#0f172a',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      overflow: 'auto',
                      maxHeight: '150px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {query}
                  </pre>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setIsSaveModalOpen(false)}
                  disabled={saveBusy}
                  style={{
                    padding: '10px 16px',
                    fontSize: '13px',
                    fontWeight: 700,
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    color: '#0f172a',
                    cursor: saveBusy ? 'not-allowed' : 'pointer',
                    opacity: saveBusy ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const name = saveName.trim();
                    const queryText = String(query ?? '').trim();

                    if (!name) {
                      setSaveError('Name is required.');
                      return;
                    }
                    if (!queryText) {
                      setSaveError('Query is empty.');
                      return;
                    }
                    if (!sources || sources.length === 0) {
                      setSaveError('No sources detected. Run the query first.');
                      return;
                    }

                    setSaveBusy(true);
                    setSaveError(null);
                    try {
                      const isEditMode = !!(editDashboardId && editChartId);
                      
                      // Debug logs removed
                      
                      // 1) Save to Query Library (REQUIRED for new insights, skip for edits to avoid duplicates)
                      if (!isEditMode) {
                        await savedQueryService.createSavedQuery({
                          name,
                          description: saveDescription.trim() ? saveDescription.trim() : undefined,
                          query: queryText,
                        });
                      }
                      
                      // 2) Prepare chart configuration
                      const isSingleValueChart = chartType === 'kpi' || chartType === 'gauge';
                      const xColumn = isSingleValueChart ? '' : (xAxis || (columns?.[0] ?? ''));
                      const chartCfg = exportConfig().config;

                      let yColumn = yAxis || '';
                      // Radar can be multi-metric via config.yAxes; persist a stable fallback y_column.
                      if (chartType === 'radar' && !yColumn) {
                        const ys = (chartCfg as any)?.yAxes;
                        if (Array.isArray(ys) && ys.length > 0 && typeof ys[0] === 'string') {
                          yColumn = ys[0];
                        }
                      }
                      
                      const titleToSave = chartTitle || name;

                      if (isEditMode) {
                        // UPDATE MODE: Re-materialize and update existing dashboard insight
                        await dashboardService.updateSqlInsight(editDashboardId!, {
                          name,
                          description: saveDescription.trim() ? saveDescription.trim() : undefined,
                          query: queryText,
                          sources,
                          chart: {
                            chart_type: chartType,
                            x_column: xColumn || undefined,
                            y_column: yColumn || undefined,
                            title: titleToSave,
                            config: chartCfg,
                          },
                        });
                      } else {
                        // CREATE MODE: Create new dashboard from SQL
                        await dashboardService.createSqlInsight({
                          name,
                          description: saveDescription.trim() ? saveDescription.trim() : undefined,
                          query: queryText,
                          sources,
                          chart: {
                            chart_type: chartType,
                            x_column: xColumn || undefined,
                            y_column: yColumn || undefined,
                            title: titleToSave,
                            config: chartCfg,
                          },
                        });
                      }
                      setIsSaveModalOpen(false);
                      onSaveSuccess?.();
                      onClose();
                      navigate('/insights');
                    } catch (e: any) {
                      console.error('Save insight error:', e);
                      console.error('Error response:', e?.response);
                      console.error('Error data:', e?.response?.data);
                      
                      let errorMessage = 'Failed to save insight';
                      
                      if (e?.response?.data?.detail) {
                        const detail = e.response.data.detail;
                        // Extract just the main error message if it's a multi-line backend error
                        errorMessage = typeof detail === 'string' 
                          ? detail.split('\n')[0] 
                          : String(detail);
                      } else if (e?.message) {
                        errorMessage = e.message;
                      }
                      
                      setSaveError(errorMessage);
                    } finally {
                      setSaveBusy(false);
                    }
                  }}
                  disabled={saveBusy}
                  style={{
                    padding: '10px 16px',
                    fontSize: '13px',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#4f46e5',
                    color: 'white',
                    cursor: saveBusy ? 'not-allowed' : 'pointer',
                    opacity: saveBusy ? 0.6 : 1,
                  }}
                >
                  {saveBusy ? 'Saving...' : 'Save Insight'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
