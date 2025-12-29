import React, { useEffect, useMemo, useRef, useState } from 'react';

interface ScatterPlotProps {
  data: any[];
  xKey: string;
  yKey: string;
  sizeKey?: string; // Optional: for bubble chart effect
  series?: Array<{ key: string; label: string; data: any[]; color: string }>; // Optional multi-series for color-by
  colors?: string[];
  title?: string;
  width?: number;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  xLabel?: string;
  yLabel?: string;
  pointSize?: number;
  pointOpacity?: number;
  maxPointSize?: number; // Used when sizeKey is provided (approx bubble diameter)
  showLabels?: boolean;
  showTrendLine?: boolean;
}

export const ScatterPlot: React.FC<ScatterPlotProps> = ({
  data,
  xKey,
  yKey,
  sizeKey,
  series,
  colors = ['#4f46e5'],
  title,
  width: _width = 100,
  height = 400,
  showGrid = true,
  showLegend = true,
  xLabel,
  yLabel,
  pointSize = 8,
  pointOpacity = 0.7,
  maxPointSize = 70,
  showLabels = false,
  showTrendLine = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect?.width ?? el.clientWidth;
      setContainerWidth(w);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const seriesInput = useMemo(() => {
    if (Array.isArray(series) && series.length > 0) return series;
    return [{ key: 'series', label: 'Series', data: data || [], color: colors?.[0] ?? '#4f46e5' }];
  }, [series, data, colors]);

  const prepared = useMemo(() => {
    const points: { x: number; y: number; size?: number; seriesIndex: number }[] = [];
    const seriesLabels = seriesInput.map((s) => s.label);
    const seriesColors = seriesInput.map((s) => s.color);

    for (let si = 0; si < seriesInput.length; si++) {
      const rows = seriesInput[si]?.data || [];
      for (const row of rows) {
        const x = Number(row?.[xKey]);
        const y = Number(row?.[yKey]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const s = sizeKey != null ? Number(row?.[sizeKey]) : undefined;
        points.push({ x, y, size: Number.isFinite(s as any) ? (s as number) : undefined, seriesIndex: si });
      }
    }

    let xMin = Number.POSITIVE_INFINITY;
    let xMax = Number.NEGATIVE_INFINITY;
    let yMin = Number.POSITIVE_INFINITY;
    let yMax = Number.NEGATIVE_INFINITY;
    let sMin = Number.POSITIVE_INFINITY;
    let sMax = Number.NEGATIVE_INFINITY;

    for (const p of points) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      if (sizeKey && p.size != null) {
        if (p.size < sMin) sMin = p.size;
        if (p.size > sMax) sMax = p.size;
      }
    }

    if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
      xMin = 0;
      xMax = 1;
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      yMin = 0;
      yMax = 1;
    }

    // Add a small padding so points don't sit exactly on the axes.
    const pad = (min: number, max: number) => {
      const span = max - min;
      if (!Number.isFinite(span) || span === 0) return [min - 1, max + 1] as const;
      const p = span * 0.05;
      return [min - p, max + p] as const;
    };
    const [x0, x1] = pad(xMin, xMax);
    const [y0, y1] = pad(yMin, yMax);

    const hasSize = Boolean(sizeKey);
    const sizeDomain = hasSize && Number.isFinite(sMin) && Number.isFinite(sMax) ? ([sMin, sMax] as const) : ([0, 1] as const);

    // Precompute linear regression for trend line.
    let trend:
      | {
          slope: number;
          intercept: number;
          minX: number;
          maxX: number;
        }
      | null = null;
    if (showTrendLine && points.length > 1) {
      const n = points.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumX2 = 0;
      for (const p of points) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumX2 += p.x * p.x;
      }
      const denom = n * sumX2 - sumX * sumX;
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;
        trend = { slope, intercept, minX: xMin, maxX: xMax };
      }
    }

    return {
      points,
      xDomain: [x0, x1] as const,
      yDomain: [y0, y1] as const,
      sizeDomain,
      trend,
      seriesLabels,
      seriesColors,
    };
  }, [seriesInput, sizeKey, xKey, yKey, showTrendLine]);

  const chartWidth = Math.max(0, Math.floor(containerWidth || 0));
  const chartHeight = Math.max(0, Math.floor(height));

  const layout = useMemo(() => {
    // Similar to typical chart margins.
    const margin = {
      top: 20,
      right: 20,
      bottom: 40,
      left: 56,
    };
    return {
      margin,
      plotX: margin.left,
      plotY: margin.top,
      plotW: Math.max(1, chartWidth - margin.left - margin.right),
      plotH: Math.max(1, chartHeight - margin.top - margin.bottom),
    };
  }, [chartWidth, chartHeight]);

  const fallbackColor = colors?.[0] ?? '#4f46e5';

  const legendEnabled = showLegend && prepared.seriesLabels.length > 0;
  const legendHeight = legendEnabled ? 72 : 0;

  const scaled = useMemo(() => {
    const { xDomain, yDomain, sizeDomain, points } = prepared;
    const [x0, x1] = xDomain;
    const [y0, y1] = yDomain;

    const xSpan = x1 - x0;
    const ySpan = y1 - y0;
    const sx = (x: number) => layout.plotX + ((x - x0) / (xSpan || 1)) * layout.plotW;
    const sy = (y: number) => layout.plotY + layout.plotH - ((y - y0) / (ySpan || 1)) * layout.plotH;

    const [s0, s1] = sizeDomain;
    const sSpan = s1 - s0;
    const minR = 2;
    const maxR = Math.max(6, Math.min(30, maxPointSize / 2));
    const sr = (s?: number) => {
      if (!sizeKey) return pointSize / 2;
      const v = typeof s === 'number' && Number.isFinite(s) ? s : s0;
      const t = sSpan === 0 ? 0.5 : (v - s0) / sSpan;
      return minR + t * (maxR - minR);
    };

    const xs = new Float32Array(points.length);
    const ys = new Float32Array(points.length);
    const rs = new Float32Array(points.length);
    const seriesIdx = new Uint16Array(points.length);
    for (let i = 0; i < points.length; i++) {
      xs[i] = sx(points[i].x);
      ys[i] = sy(points[i].y);
      rs[i] = sr(points[i].size);
      seriesIdx[i] = points[i].seriesIndex;
    }

    const cellSize = 28;
    const cols = Math.max(1, Math.ceil(Math.max(1, chartWidth) / cellSize));
    const rows = Math.max(1, Math.ceil(Math.max(1, chartHeight) / cellSize));
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < xs.length; i++) {
      const gx = Math.max(0, Math.min(cols - 1, Math.floor(xs[i] / cellSize)));
      const gy = Math.max(0, Math.min(rows - 1, Math.floor(ys[i] / cellSize)));
      const key = gx + gy * cols;
      const arr = buckets.get(key);
      if (arr) arr.push(i);
      else buckets.set(key, [i]);
    }

    return {
      xs,
      ys,
      rs,
      seriesIdx,
      buckets,
      grid: { cellSize, cols, rows },
      sx,
      sy,
    };
  }, [prepared, layout, chartWidth, chartHeight, pointSize, sizeKey, maxPointSize]);

  const formatTick = (v: number) => {
    try {
      return v.toLocaleString();
    } catch {
      return String(v);
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const w = chartWidth;
    const h = chartHeight;

    canvas.width = Math.max(1, w) * dpr;
    canvas.height = Math.max(1, h) * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.clearRect(0, 0, w, h);

    // Grid
    if (showGrid) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      const ticks = 5;
      for (let i = 0; i <= ticks; i++) {
        const tx = layout.plotX + (i / ticks) * layout.plotW;
        const ty = layout.plotY + (i / ticks) * layout.plotH;
        ctx.beginPath();
        ctx.moveTo(tx, layout.plotY);
        ctx.lineTo(tx, layout.plotY + layout.plotH);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(layout.plotX, ty);
        ctx.lineTo(layout.plotX + layout.plotW, ty);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Axes
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.plotX, layout.plotY);
    ctx.lineTo(layout.plotX, layout.plotY + layout.plotH);
    ctx.lineTo(layout.plotX + layout.plotW, layout.plotY + layout.plotH);
    ctx.stroke();

    // Ticks + labels
    const ticks = 5;
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

    const [x0, x1] = prepared.xDomain;
    const [y0, y1] = prepared.yDomain;
    for (let i = 0; i <= ticks; i++) {
      const t = i / ticks;
      const xv = x0 + t * (x1 - x0);
      const yv = y0 + t * (y1 - y0);
      const px = layout.plotX + t * layout.plotW;
      const py = layout.plotY + layout.plotH - t * layout.plotH;

      // x ticks
      ctx.strokeStyle = '#d1d5db';
      ctx.beginPath();
      ctx.moveTo(px, layout.plotY + layout.plotH);
      ctx.lineTo(px, layout.plotY + layout.plotH + 4);
      ctx.stroke();

      const xt = formatTick(xv);
      const xtw = ctx.measureText(xt).width;
      ctx.fillStyle = '#6b7280';
      ctx.fillText(xt, px - xtw / 2, layout.plotY + layout.plotH + 18);

      // y ticks
      ctx.strokeStyle = '#d1d5db';
      ctx.beginPath();
      ctx.moveTo(layout.plotX - 4, py);
      ctx.lineTo(layout.plotX, py);
      ctx.stroke();

      const yt = formatTick(yv);
      const ytw = ctx.measureText(yt).width;
      ctx.fillStyle = '#6b7280';
      ctx.fillText(yt, layout.plotX - 8 - ytw, py + 4);
    }

    // Axis titles
    ctx.fillStyle = '#6b7280';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    const xTitle = xLabel || xKey;
    const yTitle = yLabel || yKey;
    const xTw = ctx.measureText(xTitle).width;
    ctx.fillText(xTitle, layout.plotX + layout.plotW / 2 - xTw / 2, h - 8);

    ctx.save();
    ctx.translate(14, layout.plotY + layout.plotH / 2);
    ctx.rotate(-Math.PI / 2);
    const yTw = ctx.measureText(yTitle).width;
    ctx.fillText(yTitle, -yTw / 2, 0);
    ctx.restore();

    // Points (draw grouped by series color to reduce fillStyle churn)
    ctx.globalAlpha = Math.max(0, Math.min(1, pointOpacity));
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;

    const seriesCount = prepared.seriesColors.length;
    for (let si = 0; si < seriesCount; si++) {
      ctx.fillStyle = prepared.seriesColors[si] || fallbackColor;
      for (let i = 0; i < scaled.xs.length; i++) {
        if (scaled.seriesIdx[i] !== si) continue;
        const cx = scaled.xs[i];
        const cy = scaled.ys[i];
        const r = Math.max(1, scaled.rs[i]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Optional labels (can be expensive; respect the toggle)
    if (showLabels) {
      ctx.fillStyle = '#111827';
      ctx.font = '600 11px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      for (let i = 0; i < scaled.xs.length; i++) {
        const cx = scaled.xs[i];
        const cy = scaled.ys[i];
        const p = prepared.points[i];
        const label = `${formatTick(p.x)}, ${formatTick(p.y)}`;
        ctx.fillText(label, cx + 6, cy - 6);
      }
    }

    // Trend line
    if (prepared.trend) {
      const { slope, intercept, minX, maxX } = prepared.trend;
      const xA = minX;
      const xB = maxX;
      const yA = slope * xA + intercept;
      const yB = slope * xB + intercept;
      const pAx = scaled.sx(xA);
      const pAy = scaled.sy(yA);
      const pBx = scaled.sx(xB);
      const pBy = scaled.sy(yB);
      ctx.strokeStyle = fallbackColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(pAx, pAy);
      ctx.lineTo(pBx, pBy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  useEffect(() => {
    if (chartWidth <= 0 || chartHeight <= 0) return;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chartWidth,
    chartHeight,
    prepared,
    scaled,
    showGrid,
    pointOpacity,
    showLabels,
    fallbackColor,
    maxPointSize,
  ]);

  const handlePointerMove = (evt: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const { cellSize, cols, rows } = scaled.grid;
      const gx = Math.max(0, Math.min(cols - 1, Math.floor(x / cellSize)));
      const gy = Math.max(0, Math.min(rows - 1, Math.floor(y / cellSize)));

      let bestIdx: number | null = null;
      let bestD2 = Infinity;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = gx + ox;
          const ny = gy + oy;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          const key = nx + ny * cols;
          const bucket = scaled.buckets.get(key);
          if (!bucket) continue;
          for (const idx of bucket) {
            const dx = x - scaled.xs[idx];
            const dy = y - scaled.ys[idx];
            const r = scaled.rs[idx] + 4;
            const d2 = dx * dx + dy * dy;
            if (d2 <= r * r && d2 < bestD2) {
              bestD2 = d2;
              bestIdx = idx;
            }
          }
        }
      }

      if (bestIdx == null) {
        setHoveredIndex(null);
        setTooltipPos(null);
      } else {
        setHoveredIndex(bestIdx);
        setTooltipPos({ x, y });
      }
    });
  };

  const handlePointerLeave = () => {
    setHoveredIndex(null);
    setTooltipPos(null);
  };

  return (
    <div style={{ width: '100%' }}>
      {title && (
        <h3
          style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: '#111827',
          }}
        >
          {title}
        </h3>
      )}

      {legendEnabled ? (
        <div
          style={{
            width: '100%',
            height: legendHeight,
            marginBottom: 10,
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            backgroundColor: 'white',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '12px', color: '#0f172a', marginBottom: 8 }}>
            {sizeKey ? `${xKey} vs ${yKey} (size: ${sizeKey})` : `${xKey} vs ${yKey}`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'center' }}>
            {prepared.seriesLabels.map((label, idx) => (
              <div key={`${label}-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#111827', maxWidth: '100%' }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 9999,
                    backgroundColor: prepared.seriesColors[idx] || fallbackColor,
                    display: 'inline-block',
                    flex: '0 0 auto',
                  }}
                />
                <span style={{ fontSize: '12px', color: '#0f172a', whiteSpace: 'nowrap' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: Math.max(120, height - legendHeight),
          position: 'relative',
          userSelect: 'none',
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <canvas ref={canvasRef} />

        {hoveredIndex != null && tooltipPos && prepared.points[hoveredIndex] && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(tooltipPos.x + 12, Math.max(0, chartWidth - 260)),
              top: Math.max(0, tooltipPos.y + 12),
              pointerEvents: 'none',
              backgroundColor: 'white',
              padding: '12px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              width: 240,
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: '8px',
                paddingBottom: '4px',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              Data Point
            </div>
            {prepared.seriesLabels.length > 1 ? (
              <p
                style={{
                  margin: '4px 0',
                  fontSize: '13px',
                  color: '#111827',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <span style={{ color: '#6b7280' }}>Series:</span>
                <span style={{ fontWeight: 600 }}>
                  {prepared.seriesLabels[prepared.points[hoveredIndex].seriesIndex] || 'Series'}
                </span>
              </p>
            ) : null}
            <p
              style={{
                margin: '4px 0',
                fontSize: '13px',
                color: '#111827',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <span style={{ color: '#6b7280' }}>{xLabel || xKey}:</span>
              <span style={{ fontWeight: 600 }}>{formatTick(prepared.points[hoveredIndex].x)}</span>
            </p>
            <p
              style={{
                margin: '4px 0',
                fontSize: '13px',
                color: '#111827',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <span style={{ color: '#6b7280' }}>{yLabel || yKey}:</span>
              <span style={{ fontWeight: 600 }}>{formatTick(prepared.points[hoveredIndex].y)}</span>
            </p>
            {sizeKey && (
              <p
                style={{
                  margin: '4px 0',
                  fontSize: '13px',
                  color: '#111827',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <span style={{ color: '#6b7280' }}>{sizeKey}:</span>
                <span style={{ fontWeight: 600 }}>
                  {prepared.points[hoveredIndex].size != null ? formatTick(prepared.points[hoveredIndex].size as number) : '—'}
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Info about bubble size */}
      {sizeKey && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          ℹ️ Bubble size represents: <strong style={{ color: '#111827' }}>{sizeKey}</strong>
        </div>
      )}
      
      {/* Trend Line Info */}
      {showTrendLine && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#eff6ff',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#1e40af',
            textAlign: 'center',
            border: '1px solid #93c5fd'
          }}
        >
          📈 Trend line shows linear correlation between {xLabel || xKey} and {yLabel || yKey}
        </div>
      )}
    </div>
  );
};
