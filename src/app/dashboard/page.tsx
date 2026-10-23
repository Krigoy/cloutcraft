import Link from "next/link";
import { Radio } from "lucide-react";
import { BasisBadge, PlatformBadge } from "@/components/badges";
import { EarningsTimeline } from "@/components/earnings-timeline";
import { EmptyState } from "@/components/empty-state";
import { WindowPicker } from "@/components/filter-links";
import { FindingCard } from "@/components/finding-card";
import { GoalsStrip } from "@/components/goals-strip";
import { Flash } from "@/components/flash";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { Range } from "@/components/range";
import { SourceBreakdown } from "@/components/source-breakdown";
import { StatTile } from "@/components/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDashboard, parseWindow } from "@/lib/dashboard";
import { formatCompact, formatPercent, formatUsd } from "@/lib/format";
import { PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/platforms/types";
import type { PageWithSearchParams } from "@/lib/search-params";
import { buildTimeline } from "@/lib/timeline";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: PageWithSearchParams) {
  const params = await searchParams;
  const windowDays = parseWindow(params.window);
  const data = await loadDashboard(windowDays);

  if (!data.hasData) {
    return (
      <Reveal className="space-y-4">
        <Flash params={params} />
        <EmptyState connections={data.connections} />
      </Reveal>
    );
  }

  const { report, channels } = data;
  const { growth } = report;
  const platforms = PLATFORMS.filter((p) => report.totals.byPlatform.some((x) => x.platform === p));
  const timeline = buildTimeline(data.inWindow, windowDays, data.now);
  const followers = Object.values(data.snapshots).reduce((s, snap) => s + (snap.followers ?? 0), 0);
  const topFindings = report.findings.slice(0, 6);
  const isDemo = data.connections.some((c) => c.isDemo);
  const calibratedPlatforms = Object.values(data.calibration).filter((c) => c.reports > 0);

  return (
    <Reveal className="space-y-6">
      <Flash params={params} />

      <div data-reveal className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Content published in the last {windowDays} days
            {isDemo && (
              <>
                {" "}
                · <Badge variant="secondary">demo data</Badge>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.live.map((l) => (
            <Badge key={`${l.platform}:${l.streamId}`} variant="outline" className="gap-1.5 border-critical/40">
              <Radio className="size-3 animate-pulse text-critical" />
              Live on {PLATFORM_LABEL[l.platform]} · {formatCompact(l.viewerCount)} watching
            </Badge>
          ))}
          <WindowPicker base="/dashboard" params={params} current={windowDays} options={data.windowOptions} />
          <form action="/api/sync" method="post">
            <Button type="submit" variant="outline" size="sm">
              Sync now
            </Button>
          </form>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <Card data-reveal className="lift gap-2 py-4">
          <CardContent className="space-y-2 px-4">
            <div className="text-sm text-muted-foreground">Estimated earnings</div>
            <div className="min-w-0">
              <CountUp
                value={report.totals.earnings.mid}
                format="usd"
                duration={1100}
                fit={{ max: 48, min: 24 }}
                className="hero-figure block leading-none font-semibold tracking-tight"
              />
              <div className="mt-1 text-sm text-muted-foreground tabular-nums">
                {formatUsd(report.totals.earnings.low)} – {formatUsd(report.totals.earnings.high)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {growth.earningsChange !== null && (
                <span className={growth.earningsChange >= 0 ? "text-good font-medium" : "text-critical font-medium"}>
                  {growth.earningsChange >= 0 ? "+" : "−"}
                  {formatPercent(Math.abs(growth.earningsChange))} vs. previous {windowDays} days
                </span>
              )}
              {calibratedPlatforms.length > 0 ? (
                <Link href="/settings#payouts" className="hover:underline">
                  Calibrated to your {calibratedPlatforms.map((c) => PLATFORM_LABEL[c.platform]).join(" and ")} payouts.
                </Link>
              ) : (
                <span>Mid estimate with low–high band.</span>
              )}
            </div>
          </CardContent>
        </Card>
        <StatTile
          label="Views"
          count={{ value: report.totals.views, format: "compact" }}
          delta={growth.viewsChange}
          deltaLabel={`vs. previous ${windowDays} days`}
        />
        <StatTile
          label="New views · 24 h"
          count={data.views24h.coverage > 0 ? { value: data.views24h.total, format: "signed-compact" } : undefined}
          value={data.views24h.coverage > 0 ? undefined : "—"}
          sub={
            data.views7d.coverage > 0
              ? `+${formatCompact(data.views7d.total)} in 7 days`
              : "Appears after the next scheduled sync"
          }
        />
        <StatTile
          label="Published"
          count={{ value: report.totals.items, format: "int" }}
          sub={`${growth.itemsPrevious} in the previous period`}
        />
        <StatTile
          label="Followers"
          count={followers ? { value: followers, format: "compact" } : undefined}
          value={followers ? undefined : "—"}
          sub="across connected channels"
        />
      </section>

      <GoalsStrip goals={data.goals} reached={data.reachedGoals} platforms={platforms} now={data.now} />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card data-reveal className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Earnings by publish week</CardTitle>
            <CardDescription>Mid estimate attributed to the week each item was published.</CardDescription>
          </CardHeader>
          <CardContent>
            <EarningsTimeline data={timeline} platforms={platforms} />
          </CardContent>
        </Card>
        <Card data-reveal>
          <CardHeader>
            <CardTitle>By platform</CardTitle>
            <CardDescription>Share of the estimate and how solid it is.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {report.totals.byPlatform.map((p) => (
                <li key={p.platform} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="space-y-1">
                    <PlatformBadge platform={p.platform} />
                    <div className="text-xs text-muted-foreground">
                      {p.items} items · {formatCompact(p.views)} views
                      {p.followers ? ` · ${formatCompact(p.followers)} followers` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Range value={p.earnings} size="sm" />
                    {channels[p.platform] && <BasisBadge basis={channels[p.platform]!.basis} />}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card data-reveal>
          <CardHeader className="flex-row items-start justify-between">
            <div className="space-y-1">
              <CardTitle>What the numbers say</CardTitle>
              <CardDescription>Computed from your data. The coach turns these into a plan.</CardDescription>
            </div>
            <Link href={`/coach?window=${windowDays}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open coach
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {topFindings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not enough content in this period for patterns to emerge yet.</p>
            ) : (
              topFindings.map((f) => <FindingCard key={f.id} finding={f} compact />)
            )}
          </CardContent>
        </Card>
        <Card data-reveal>
          <CardHeader>
            <CardTitle>Top performers</CardTitle>
            <CardDescription>Views relative to the median for the same platform and format.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.topPerformers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Needs at least three items per format.</p>
            ) : (
              <ol className="divide-y">
                {report.topPerformers.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:underline">
                        {s.title}
                      </a>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <PlatformBadge platform={s.platform} /> {formatCompact(s.views)} views
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-good">{s.viewsVsBaseline.toFixed(1)}×</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {platforms.map((p: Platform) => {
          const ch = channels[p];
          if (!ch) return null;
          return (
            <Card key={p} data-reveal className="lift">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{PLATFORM_LABEL[p]} income mix</span>
                  <BasisBadge basis={ch.basis} />
                </CardTitle>
                <CardDescription>
                  <Range value={ch.total} size="sm" />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SourceBreakdown bySource={ch.bySource} />
                {ch.notes.length > 0 && (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {ch.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </Reveal>
  );
}
