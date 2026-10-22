"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact, formatUsd } from "@/lib/format";
import { PLATFORM_LABEL, type Platform } from "@/lib/platforms/types";
import type { TimelinePoint } from "@/lib/timeline";

interface TooltipPayloadEntry {
  dataKey?: string | number;
  value?: number;
}

function TimelineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipPayloadEntry>;
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((p) => typeof p.value === "number");
  const total = rows.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 text-muted-foreground">Week of {label}</div>
      {[...rows].reverse().map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3" style={{ background: `var(--chart-${String(p.dataKey)})` }} />
            <span className="text-muted-foreground">{PLATFORM_LABEL[p.dataKey as Platform] ?? String(p.dataKey)}</span>
          </span>
          <span className="font-medium tabular-nums">{formatUsd(p.value ?? 0, true)}</span>
        </div>
      ))}
      {rows.length > 1 && (
        <div className="mt-1 flex items-center justify-between gap-4 border-t pt-1">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">{formatUsd(total, true)}</span>
        </div>
      )}
    </div>
  );
}

export function EarningsTimeline({ data, platforms }: { data: TimelinePoint[]; platforms: Platform[] }) {
  if (platforms.length === 0) return null;
  return (
    <div className="h-72 w-full" role="img" aria-label="Estimated earnings per publish week, stacked by platform">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            minTickGap={28}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: number) => (v === 0 ? "$0" : `$${formatCompact(v)}`)}
          />
          <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.6 }} content={<TimelineTooltip />} />
          {platforms.length > 1 && (
            <Legend
              iconType="square"
              iconSize={10}
              formatter={(value: string) => (
                <span className="text-xs text-muted-foreground">{PLATFORM_LABEL[value as Platform] ?? value}</span>
              )}
            />
          )}
          {platforms.map((p, i) => (
            <Bar
              key={p}
              dataKey={p}
              stackId="earnings"
              fill={`var(--chart-${p})`}
              stroke="var(--card)"
              strokeWidth={2}
              maxBarSize={24}
              radius={i === platforms.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
