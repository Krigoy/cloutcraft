import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountUp, type CountFormat } from "./motion/count-up";

interface StatTileProps {
  label: string;
  /** Static value, or use `count` for an animated number. */
  value?: ReactNode;
  count?: { value: number; format: CountFormat };
  /** Secondary line under the value. */
  sub?: ReactNode;
  /** Fractional change vs a named period (0.12 = +12%). Null hides the delta. */
  delta?: number | null;
  deltaLabel?: string;
  upIsGood?: boolean;
  className?: string;
}

export function StatTile({ label, value, count, sub, delta, deltaLabel, upIsGood = true, className }: StatTileProps) {
  const showDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const positive = (delta ?? 0) >= 0;
  const good = positive === upIsGood;
  return (
    <Card data-reveal className={cn("lift gap-2 py-4", className)}>
      <CardContent className="space-y-1 px-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight">
          {count ? <CountUp value={count.value} format={count.format} /> : value}
        </div>
        {(showDelta || sub) && (
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {showDelta && (
              <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-good" : "text-critical")}>
                {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {formatPercent(Math.abs(delta!))}
                {deltaLabel && <span className="font-normal text-muted-foreground"> {deltaLabel}</span>}
              </span>
            )}
            {sub && <span>{sub}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
