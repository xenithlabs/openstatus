import type { FC } from "hono/jsx";

export interface LineChartProps {
  data: Array<{ timestamp: string; [region: string]: number | string }>;
  regions: string[];
  width?: number;
  height?: number;
}

const PADDING = { top: 20, right: 16, bottom: 32, left: 48 };
const REGION_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#eab308", // yellow
  "#8b5cf6", // purple
  "#ec4899", // pink
];

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.ceil(v / (nice * mag)) * (nice * mag);
}

export const ChartLine: FC<LineChartProps> = ({
  data,
  regions,
  width = 700,
  height = 250,
}) => {
  if (data.length === 0 || regions.length === 0) {
    return (
      <div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No region data available
      </div>
    );
  }

  const plotLeft = PADDING.left;
  const plotRight = width - PADDING.right;
  const plotTop = PADDING.top;
  const plotBottom = height - PADDING.bottom;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  // Compute global max across all regions
  let maxVal = 1;
  for (const r of regions) {
    for (const d of data) {
      const v = d[r];
      if (typeof v === "number" && v > maxVal) maxVal = v;
    }
  }
  const yMin = 0;
  const yMax = niceMax(maxVal);
  const yRange = yMax - yMin || 1;
  const yTicks = 5;

  // X-axis labels: skip every N
  const maxLabels = Math.floor(plotW / 60);
  const xStep = Math.max(1, Math.ceil(data.length / maxLabels));

  return (
    <div class="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        class="w-full"
        style="max-width: 100%; height: auto;"
      >
        {/* Y-axis gridlines + labels */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = yMin + (i / yTicks) * yRange;
          const y = plotBottom - ((val - yMin) / yRange) * plotH;
          return (
            <>
              <line
                x1={plotLeft}
                y1={y}
                x2={plotRight}
                y2={y}
                stroke="currentColor"
                class="text-border/30"
                stroke-width="1"
              />
              <text
                x={plotLeft - 6}
                y={y + 4}
                text-anchor="end"
                class="fill-muted-foreground text-[10px]"
              >
                {val}ms
              </text>
            </>
          );
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % xStep !== 0 && i !== data.length - 1) return null;
          const x = plotLeft + (i / Math.max(data.length - 1, 1)) * plotW;
          return (
            <text
              x={x}
              y={height - 6}
              text-anchor="middle"
              class="fill-muted-foreground text-[10px]"
            >
              {d.timestamp}
            </text>
          );
        })}

        {/* One polyline per region */}
        {regions.map((region, ri) => {
          const color = REGION_COLORS[ri % REGION_COLORS.length];
          const points = data
            .map((d, i) => {
              const v = d[region];
              if (typeof v !== "number") return null;
              const x = plotLeft + (i / Math.max(data.length - 1, 1)) * plotW;
              const y = plotBottom - ((v - yMin) / yRange) * plotH;
              return `${x},${y}`;
            })
            .filter(Boolean)
            .join(" ");

          return (
            <polyline
              points={points}
              fill="none"
              stroke={color}
              stroke-width="1.5"
            />
          );
        })}

        {/* Legend */}
        <g transform={`translate(${plotLeft + 8}, ${plotTop + 8})`}>
          {regions.map((region, i) => {
            const color = REGION_COLORS[i % REGION_COLORS.length];
            const y = i * 16;
            return (
              <>
                <circle cx={5} cy={y + 5} r={4} fill={color} />
                <text x={14} y={y + 9} class="fill-muted-foreground text-[10px]">
                  {region}
                </text>
              </>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
