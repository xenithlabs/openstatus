import type { FC } from "hono/jsx";

export interface AreaChartPoint {
  timestamp: string;
  p75Latency: number;
  p95Latency: number;
  p99Latency: number;
  maxLatency: number;
}

export interface AreaChartProps {
  data: AreaChartPoint[];
  width?: number;
  height?: number;
}

const PADDING = { top: 20, right: 16, bottom: 32, left: 48 };
const CHART_COLORS = {
  p75: "#22c55e",
  p95: "#eab308",
  p99: "#ef4444",
};

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.ceil(v / (nice * mag)) * (nice * mag);
}

function pointPath(
  points: AreaChartPoint[],
  field: "p75Latency" | "p95Latency" | "p99Latency",
  plotLeft: number,
  plotBottom: number,
  plotW: number,
  plotH: number,
  yMin: number,
  yMax: number,
): string {
  if (points.length === 0) return "";
  const yRange = yMax - yMin || 1;
  const xs = points.map((_, i) => plotLeft + (i / Math.max(points.length - 1, 1)) * plotW);
  const ys = points.map((p) => plotBottom - ((p[field] - yMin) / yRange) * plotH);

  let d = `M ${xs[0]},${ys[0]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${xs[i]},${ys[i]}`;
  }
  // Close the area back to zero
  d += ` L ${xs[xs.length - 1]},${plotBottom} L ${xs[0]},${plotBottom} Z`;
  return d;
}

function polylinePoints(
  points: AreaChartPoint[],
  field: "p75Latency" | "p95Latency" | "p99Latency",
  plotLeft: number,
  plotBottom: number,
  plotW: number,
  plotH: number,
  yMin: number,
  yMax: number,
): string {
  if (points.length === 0) return "";
  const yRange = yMax - yMin || 1;
  return points
    .map(
      (p, i) =>
        `${plotLeft + (i / Math.max(points.length - 1, 1)) * plotW},${plotBottom - ((p[field] - yMin) / yRange) * plotH}`,
    )
    .join(" ");
}

export const ChartArea: FC<AreaChartProps> = ({
  data,
  width = 700,
  height = 250,
}) => {
  if (data.length === 0) {
    return (
      <div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No latency data available
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
    ...data.map((d) => Math.max(d.p99Latency, d.maxLatency)),
    1,
  );
  const yMin = 0;
  const yMax = niceMax(maxVal);
  const yRange = yMax - yMin || 1;
  const yTicks = 5;

  // X-axis labels: skip every N to avoid crowding
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

        {/* Areas */}
        {(["p99", "p95", "p75"] as const).map((field, idx) => {
          const colors = [CHART_COLORS.p99, CHART_COLORS.p95, CHART_COLORS.p75];
          const opacities = [0.2, 0.2, 0.25];
          return (
            <path
              d={pointPath(
                data,
                `${field}Latency` as "p75Latency" | "p95Latency" | "p99Latency",
                plotLeft,
                plotBottom,
                plotW,
                plotH,
                yMin,
                yMax,
              )}
              fill={colors[idx]}
              fill-opacity={opacities[idx]}
            />
          );
        })}

        {/* Polylines */}
        {(["p99", "p95", "p75"] as const).map((field, idx) => {
          const colors = [CHART_COLORS.p99, CHART_COLORS.p95, CHART_COLORS.p75];
          return (
            <polyline
              points={polylinePoints(
                data,
                `${field}Latency` as "p75Latency" | "p95Latency" | "p99Latency",
                plotLeft,
                plotBottom,
                plotW,
                plotH,
                yMin,
                yMax,
              )}
              fill="none"
              stroke={colors[idx]}
              stroke-width="1.5"
            />
          );
        })}

        {/* Legend */}
        <g transform={`translate(${plotLeft + 8}, ${plotTop + 8})`}>
          {(["p75", "p95", "p99"] as const).map((label, i) => {
            const colors = [CHART_COLORS.p75, CHART_COLORS.p95, CHART_COLORS.p99];
            const y = i * 16;
            return (
              <>
                <rect
                  x={0}
                  y={y}
                  width={10}
                  height={10}
                  rx={2}
                  fill={colors[i]}
                  fill-opacity="0.6"
                />
                <text
                  x={14}
                  y={y + 9}
                  class="fill-muted-foreground text-[10px]"
                >
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
