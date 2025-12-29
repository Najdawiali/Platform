import React from 'react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';

interface TreemapChartProps {
  data: any[];
  nameKey: string;
  dataKey: string;
  colors: string[];
  height?: number;
}

const CustomContent = (props: any) => {
  const { /* root, */ depth, x, y, width, height, index, colors, name } = props;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: depth < 2 ? colors[index % colors.length] : 'none',
          stroke: '#fff',
          strokeWidth: 2 / (depth + 1e-10),
          strokeOpacity: 1 / (depth + 1e-10),
        }}
      />
      {depth === 1 ? (
        <text
          x={x + width / 2}
          y={y + height / 2 + 7}
          textAnchor="middle"
          fill="#fff"
          fontSize={14}
        >
          {name}
        </text>
      ) : null}
    </g>
  );
};

export const TreemapChart: React.FC<TreemapChartProps> = ({
  data,
  nameKey,
  dataKey,
  colors,
  height = 400
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={data}
        dataKey={dataKey}
        nameKey={nameKey}
        aspectRatio={4 / 3}
        stroke="#fff"
        fill="#8884d8"
        content={<CustomContent colors={colors} />}
      >
        <Tooltip />
      </Treemap>
    </ResponsiveContainer>
  );
};
