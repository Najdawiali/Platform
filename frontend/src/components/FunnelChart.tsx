import React, { useMemo } from 'react';
import { ResponsiveContainer, FunnelChart as RechartsFunnelChart, Funnel, Tooltip, LabelList } from 'recharts';

interface FunnelChartProps {
  data: any[];
  nameKey: string;
  dataKey: string;
  colors: string[];
  height?: number;
  labelWidth?: number;
}

export const FunnelChart: React.FC<FunnelChartProps> = ({
  data,
  nameKey,
  dataKey,
  // colors,
  height = 400,
  labelWidth = 220,
}) => {
  const margin = useMemo(() => ({ top: 12, right: Math.max(60, labelWidth + 30), left: 12, bottom: 12 }), [labelWidth]);

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
      <foreignObject x={boxX} y={boxY} width={labelWidth} height={boxH} style={{ overflow: 'visible' }}>
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
        <Funnel dataKey={dataKey} data={data} isAnimationActive>
          <LabelList dataKey={nameKey} content={renderLabel} />
        </Funnel>
      </RechartsFunnelChart>
    </ResponsiveContainer>
  );
};
