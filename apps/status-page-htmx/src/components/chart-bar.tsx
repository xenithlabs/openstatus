import type { FC } from "hono/jsx";

export interface BarChartUptimeData {
  interval: string;
  success: number;
  degraded: number;
  error: number;
}

export interface BarChartUptimeProps {
  data: BarChartUptimeData[];
  width?: number;
  height?: number;
}

const PADDING = { top: 20, right: 16, bottom: 32, left: 36 };
const STACK_COLORS = {
  success: "#22c55e",
  degraded: "#eab308",
  error: "#ef4444",
};

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.ceil(v / (nice * mag)) * (nice * mag);
}

export const ChartBar: FC<BarChartUptimeProps> = ({
  data,
  width = 700,
  height = 250,
}) => {
  if (data.length === 0) {
    return (
      <div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No uptime data available
      </div>
    );
  }

  const plotLeft = PADDING.left;
  const plotRight = width - PADDING.right;
  const plotTop = PADDING.top;
  const plotBottom = height - PADDING.bottom;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  const maxVal = Math.max(
    ...data.map((d) => d.success + d.degraded + d.error),
    1,
  );
  const yMax = niceMax(maxVal);
  const yMin = 0;
  const yRange = yMax - yMin || 1;
  const yTicks = 5;

  const barCount = data.length;
  const barGap = Math.max(1, Math.min(4, plotW / barCount / 4));
  const barWidth = Math.max(1, (plotW - barGap * (barCount + 1)) / barCount);

  // X-axis labels
  const maxLabels = Math.floor(plotW / 50);
  const xStep = Math.max(1, Math.ceil(barCount / maxLabels));

  const stacks: Array<{ key: "error" | "degraded" | "success"; color: string }> = [
    { key: "error", color: STACK_COLORS.error },
    { key: "degraded", color: STACK_COLORS.degraded },
    { key: "success", color: STACK_COLORS.success },
  ];

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
                {val}
              </text>
            </>
          );
        })}

        {/* Stacked bars */}
        {data.map((d, i) => {
          const barX = plotLeft + barGap + i * (barWidth + barGap);
          let stackY = plotBottom;

          return stacks.map(({ key, color }) => {
            const val = d[key];
            if (val === 0) return null;
            const scaledH = (val / yRange) * plotH;
            stackY -= scaledH;
            return (
              <rect
                x={barX}
                y={stackY}
                width={barWidth}
                height={scaledH}
                fill={color}
                rx="1"
                ry="1"
              />
            );
          });
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % xStep !== 0 && i !== data.length - 1) return null;
          const x = plotLeft + barGap + i * (barWidth + barGap) + barWidth / 2;
          return (
            <text
              x={x}
              y={height - 6}
              text-anchor="middle"
              class="fill-muted-foreground text-[10px]"
            >
              {d.interval}
            </text>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${plotRight - 120}, ${plotTop + 8})`}>
          {(
            [
              { key: "success", label: "Success", color: STACK_COLORS.success },
              {
                key: "degraded",
                label: "Degraded",
                color: STACK_COLORS.degraded,
              },
              { key: "error", label: "Error", color: STACK_COLORS.error },
            ] as const
          ).map(({ label, color }, i) => {
            const y = i * 16;
            return (
              <>
                <rect
                  x={0}
                  y={y}
                  width={10}
                  height={10}
                  rx={2}
                  fill={color}
                />
                <text x={14} y={y + 9} class="fill-muted-foreground text-[10px]">
                  {label}
                </text>
              </>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
