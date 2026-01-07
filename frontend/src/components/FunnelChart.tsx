import React, { useMemo } from 'react';
import { ResponsiveContainer, FunnelChart as RechartsFunnelChart, Funnel, Tooltip, LabelList } from 'recharts';

interface FunnelChartProps {
  data: any[];
  nameKey: string;
  dataKey: string;
  colors: string[];
  width?: number;
  height?: number;
  labelWidth?: number;
}

export const FunnelChart: React.FC<FunnelChartProps> = ({
  data,
  nameKey,
  dataKey,
  colors,
  width,
  height = 400,
  labelWidth = 220,
}) => {
  const safeWidth = Number.isFinite(width) && (width as number) > 0 ? (width as number) : 900;
  const effectiveLabelWidth = useMemo(() => {
    const base = Number.isFinite(labelWidth) ? labelWidth : 220;
    const maxLabel = Math.max(160, Math.floor(safeWidth * 0.32));
    return Math.max(140, Math.min(base, maxLabel));
  }, [labelWidth, safeWidth]);

  const margin = useMemo(() => ({ top: 12, right: Math.max(50, effectiveLabelWidth + 24), left: 12, bottom: 12 }), [effectiveLabelWidth]);

  const coloredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.map((d, i) => ({
      ...d,
      fill: typeof d?.fill === 'string' ? d.fill : colors[i % Math.max(1, colors.length)],
    }));
  }, [data, colors]);

  const renderLabel = (props: any) => {
    const label = String(props?.value ?? '');
    const x = Number(props?.x ?? 0);
    const y = Number(props?.y ?? 0);
    const width = Number(props?.width ?? 0);
    const height = Number(props?.height ?? 0);

    const boxX = x + width + 8;
    const boxY = y;
    const boxH = Math.max(18, height);

    return (
      <foreignObject x={boxX} y={boxY} width={effectiveLabelWidth} height={boxH} style={{ overflow: 'visible' }}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            fontSize: '12px',
            color: '#0f172a',
            lineHeight: 1.15,
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
          }}
          title={label}
        >
          {label}
        </div>
      </foreignObject>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsFunnelChart margin={margin}>
        <Tooltip />
        <Funnel dataKey={dataKey} data={coloredData} isAnimationActive={false}>
          <LabelList dataKey={nameKey} content={renderLabel} />
        </Funnel>
      </RechartsFunnelChart>
    </ResponsiveContainer>
  );
};
