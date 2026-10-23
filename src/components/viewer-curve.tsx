"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact } from "@/lib/format";
import type { CurvePoint } from "@/lib/streams";

function minutesLabel(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function CurveTooltip({ active, payload, label }: { active?: boolean; payload?: ReadonlyArray<{ value?: number }>; label?: number }) {
  if (!active || !payload?.length || typeof label !== "number") return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="text-muted-foreground">{minutesLabel(label)} in</div>
      <div className="font-medium tabular-nums">{(payload[0].value ?? 0).toLocaleString()} watching</div>
    </div>
  );
}

/** Concurrent viewers over a broadcast, with the stream's average as a reference. */
export function ViewerCurve({ points, average, color = "var(--chart-twitch)" }: { points: CurvePoint[]; average?: number; color?: string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Concurrent viewers over the course of the stream">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="viewer-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="minute"
            type="number"
            domain={[0, "dataMax"]}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={minutesLabel}
            minTickGap={36}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: 3 }} content={<CurveTooltip />} />
          {average !== undefined && (
            <ReferenceLine y={average} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: `avg ${formatCompact(average)}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />
          )}
          <Area type="monotone" dataKey="viewers" stroke={color} strokeWidth={2} fill="url(#viewer-fill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
