import { ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EstimatedItem } from "@/lib/earnings/estimate";
import { formatCompact, formatDate, formatDuration, formatPercent, formatUsd } from "@/lib/format";
import { BasisBadge, KindBadge, PlatformDot } from "./badges";

export interface ContentRow {
  entry: EstimatedItem;
  /** Views gained in the last 24 h (null when there is no history yet). */
  views24h: number | null;
  /** Views ÷ median views for the same platform + format. */
  vsBaseline: number | null;
}

function engagement(row: ContentRow): number | null {
  const { item } = row.entry;
  if (!item.views) return null;
  const total = (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0);
  return total > 0 ? total / item.views : null;
}

export function ContentTable({ rows }: { rows: ContentRow[] }) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nothing matches these filters.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-64">Title</TableHead>
          <TableHead>Published</TableHead>
          <TableHead className="text-right">Length</TableHead>
          <TableHead className="text-right">Views</TableHead>
          <TableHead className="text-right">+24 h</TableHead>
          <TableHead className="text-right">vs. median</TableHead>
          <TableHead className="text-right">Engagement</TableHead>
          <TableHead className="text-right">Est. earnings</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const { item, estimate } = row.entry;
          const eng = engagement(row);
          const ratio = row.vsBaseline;
          return (
            <TableRow key={item.id}>
              <TableCell className="max-w-xs">
                <div className="flex items-start gap-2">
                  <PlatformDot platform={item.platform} className="mt-1.5" />
                  <div className="min-w-0 space-y-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 truncate font-medium hover:underline"
                      title={item.title}
                    >
                      <span className="truncate">{item.title}</span>
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                    </a>
                    <div className="flex items-center gap-1.5">
                      <KindBadge kind={item.kind} />
                      {item.kind === "live" && item.avgViewers !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          avg {formatCompact(item.avgViewers)} · peak {formatCompact(item.peakViewers ?? item.avgViewers)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(item.publishedAt)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatDuration(item.durationSec)}</TableCell>
              <TableCell className="text-right tabular-nums">{item.views.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {row.views24h === null ? "—" : `+${formatCompact(row.views24h)}`}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {ratio === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={ratio >= 1.5 ? "text-good font-medium" : ratio < 0.5 ? "text-serious" : ""}>
                    {ratio.toFixed(1)}×
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {eng === null ? "—" : formatPercent(eng, 1)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-col items-end gap-1" title={estimate.notes.join(" ")}>
                  <span className="font-medium tabular-nums">{formatUsd(estimate.mid, true)}</span>
                  {estimate.basis !== "reported" && estimate.basis !== "none" && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatUsd(estimate.low, true)} – {formatUsd(estimate.high, true)}
                    </span>
                  )}
                  <BasisBadge basis={estimate.basis} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
