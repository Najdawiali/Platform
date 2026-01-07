import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dashboardService } from '../services/dashboardService';

const toNumber = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

interface SavedTableChartProps {
  dashboardId: string;
  chartId: string;
  cfg: Record<string, any>;
}

export const SavedTableChart: React.FC<SavedTableChartProps> = ({ dashboardId, chartId, cfg }) => {
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

  return (
    <div ref={containerRef} onScroll={onScroll} style={{ width: '100%', overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: tableDense ? '11px' : '13px' }}>
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
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
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
                    minWidth: 0,
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
