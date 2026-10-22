import { REVENUE_SOURCE_LABEL, type EstimateRange, type RevenueSource } from "@/lib/earnings/estimate";
import { formatUsd } from "@/lib/format";
import { Meter } from "./motion/meter";

const SOURCE_COLOR: Record<RevenueSource, string> = {
  ads: "bg-src-ads",
  subs: "bg-src-subs",
  bits: "bg-src-bits",
  creator_rewards: "bg-src-rewards",
};

const ORDER: RevenueSource[] = ["ads", "subs", "bits", "creator_rewards"];

/** Horizontal meters: share of a platform's estimated earnings by source. */
export function SourceBreakdown({ bySource }: { bySource: Partial<Record<RevenueSource, EstimateRange>> }) {
  const rows = ORDER.filter((s) => bySource[s] && bySource[s]!.mid > 0).map((s) => ({ source: s, ...bySource[s]! }));
  const total = rows.reduce((sum, r) => sum + r.mid, 0);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing estimable in this period.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => {
        const share = total > 0 ? r.mid / total : 0;
        return (
          <li key={r.source} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <span aria-hidden className={`inline-block size-2 rounded-sm ${SOURCE_COLOR[r.source]}`} />
                {REVENUE_SOURCE_LABEL[r.source]}
              </span>
              <span className="tabular-nums">
                {formatUsd(r.mid)} <span className="text-muted-foreground">({Math.round(share * 100)}%)</span>
              </span>
            </div>
            <Meter share={share} colorClass={SOURCE_COLOR[r.source]} delay={i * 90} label={`${REVENUE_SOURCE_LABEL[r.source]} share`} />
          </li>
        );
      })}
    </ul>
  );
}
