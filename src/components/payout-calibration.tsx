import { Trash2 } from "lucide-react";
import { addPayoutAction, deletePayoutAction } from "@/app/settings/payout-actions";
import { PlatformBadge } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PayoutCalibration, PayoutReport } from "@/lib/earnings/estimate";
import { PAYOUT_SOURCES, payoutSourceLabel } from "@/lib/earnings/payouts";
import { formatUsd } from "@/lib/format";
import { PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/platforms/types";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const period = (r: PayoutReport) => `${dateFormat.format(new Date(`${r.periodStart}T00:00:00Z`))} – ${dateFormat.format(new Date(`${r.periodEnd}T00:00:00Z`))}`;

function monthAgo(): { start: string; end: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

/** Settings section: real payouts in, a per-platform calibration factor out. */
export function PayoutCalibrationSection({
  reports,
  calibration,
}: {
  reports: PayoutReport[];
  calibration: Partial<Record<Platform, PayoutCalibration>>;
}) {
  const defaults = monthAgo();
  const calibrated = PLATFORMS.map((p) => calibration[p]).filter((c): c is PayoutCalibration => !!c);

  return (
    <section id="payouts" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Real payouts</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Enter what a platform actually paid you for a period and the model for that platform is rescaled to match. Publish date stands in for
            earning date, so use whole months or longer.
          </p>
        </div>
        {calibrated.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {calibrated.map((c) => (
              <Badge key={c.platform} variant={c.reports > 0 ? "secondary" : "outline"} className="gap-1.5 font-normal" title={c.reports > 0 ? `Model ${formatUsd(c.modeledUsd)} vs. paid ${formatUsd(c.reportedUsd)} over ${c.reports} payout${c.reports === 1 ? "" : "s"}` : "No modelled content in those periods yet"}>
                {PLATFORM_LABEL[c.platform]}
                {c.reports > 0 ? (
                  <span className="font-medium tabular-nums">× {c.factor.toFixed(2)}</span>
                ) : (
                  <span className="text-muted-foreground">not applied</span>
                )}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Card data-reveal className="py-0">
        {reports.length > 0 && (
          <>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <PlatformBadge platform={r.platform} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{period(r)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {payoutSourceLabel(r.source)}
                        {r.note ? <span className="block text-xs">{r.note}</span> : null}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatUsd(r.amountUsd, true)}</TableCell>
                      <TableCell className="text-right">
                        <form action={deletePayoutAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            aria-label="Remove payout"
                            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <Separator />
          </>
        )}
        {calibrated.some((c) => c.reports === 0 && c.reason) && (
          <>
            <ul className="space-y-1 px-4 py-3 text-xs text-muted-foreground">
              {calibrated
                .filter((c) => c.reports === 0 && c.reason)
                .map((c) => (
                  <li key={c.platform}>
                    <span className="font-medium text-foreground">{PLATFORM_LABEL[c.platform]} — not applied.</span> {c.reason}
                  </li>
                ))}
            </ul>
            <Separator />
          </>
        )}
        <form action={addPayoutAction}>
          <CardFooter className="grid gap-3 py-4 sm:grid-cols-[9rem_1fr_1fr_8rem_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="payout-platform">Platform</Label>
              <NativeSelect id="payout-platform" name="platform" defaultValue="youtube" required>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABEL[p]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-start">From</Label>
              <Input id="payout-start" name="periodStart" type="date" defaultValue={defaults.start} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-end">To</Label>
              <Input id="payout-end" name="periodEnd" type="date" defaultValue={defaults.end} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-amount">Paid (USD)</Label>
              <Input id="payout-amount" name="amountUsd" type="number" step="0.01" min={0} inputMode="decimal" placeholder="0.00" required className="text-right tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-source">Source</Label>
              <NativeSelect id="payout-source" name="source" defaultValue="youtube_studio">
                {Object.entries(PAYOUT_SOURCES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" variant={reports.length ? "outline" : "default"}>
              Add payout
            </Button>
          </CardFooter>
        </form>
      </Card>
    </section>
  );
}
