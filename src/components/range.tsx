import type { EstimateRange } from "@/lib/earnings/estimate";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Mid estimate with its low–high band underneath. */
export function Range({
  value,
  precise = false,
  size = "md",
  className,
}: {
  value: EstimateRange;
  precise?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const collapsed = Math.abs(value.high - value.low) < 0.005;
  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span
        className={cn(
          "font-semibold tracking-tight",
          size === "lg" && "text-4xl sm:text-5xl",
          size === "md" && "text-base",
          size === "sm" && "text-sm",
        )}
      >
        {formatUsd(value.mid, precise)}
      </span>
      {!collapsed && (
        <span className={cn("text-muted-foreground tabular-nums", size === "lg" ? "text-sm" : "text-xs")}>
          {formatUsd(value.low, precise)} – {formatUsd(value.high, precise)}
        </span>
      )}
    </span>
  );
}
