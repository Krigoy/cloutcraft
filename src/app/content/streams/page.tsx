import type { Metadata } from "next";
import { ExternalLink, Radio } from "lucide-react";
import Link from "next/link";
import { BasisBadge, PlatformBadge, PlatformDot } from "@/components/badges";
import { ContentTabs } from "@/components/content-tabs";
import { EmptyState } from "@/components/empty-state";
import { WindowPicker } from "@/components/filter-links";
import { Flash } from "@/components/flash";
import { Reveal } from "@/components/motion/reveal";
import { Range } from "@/components/range";
import { SourceBreakdown } from "@/components/source-breakdown";
import { StatTile } from "@/components/stat-tile";
import { ViewerCurve } from "@/components/viewer-curve";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadDashboard, parseWindow } from "@/lib/dashboard";
import { liveSamplesForStream } from "@/lib/db/repo";
import type { EstimateRange, RevenueSource } from "@/lib/earnings/estimate";
import { formatCompact, formatDuration, formatUsd } from "@/lib/format";
import { firstParam, type PageWithSearchParams } from "@/lib/search-params";
import { change, formatHours, streamEnded, summarizeStreams, viewerCurve } from "@/lib/streams";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Streams" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dateShort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default async function StreamsPage({ searchParams }: PageWithSearchParams) {
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

  const { streams, kpis } = summarizeStreams(data.estimated, data.live, windowDays, data.now);
  const requested = firstParam(params.stream);
  const selected = streams.find((s) => s.key === requested) ?? streams[0];
  const samples = selected?.streamId ? await liveSamplesForStream(data.workspaceId, selected.platform, selected.streamId) : [];
  const curve = viewerCurve(samples, selected?.startedAt);
  const isLive = !!selected?.live && !streamEnded(samples.length ? samples : [{ capturedAt: selected.live.capturedAt }], data.now);
  const bySource: Partial<Record<RevenueSource, EstimateRange>> = {};
  for (const line of selected?.estimate?.breakdown ?? []) bySource[line.source] = line;

  return (
    <Reveal className="space-y-6">
      <Flash params={params} />
      <div data-reveal className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="text-sm text-muted-foreground">
            {kpis.streams} streams · {formatHours(kpis.hours)} live · {formatUsd(kpis.earningsMid)} estimated
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ContentTabs active="streams" windowDays={windowDays} />
          <WindowPicker base="/content/streams" params={params} current={windowDays} options={data.windowOptions} />
        </div>
      </div>

      {streams.length === 0 ? (
        <Card data-reveal className="items-center py-10 text-center">
          <Radio className="size-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">No streams in this period</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Twitch broadcasts and YouTube live streams appear here once they are synced.</p>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Streams" count={{ value: kpis.streams, format: "int" }} sub={`${kpis.streamsPrevious} in the previous period`} />
            <StatTile label="Hours live" value={formatHours(kpis.hours)} delta={change(kpis.hours, kpis.hoursPrevious)} deltaLabel="vs. previous period" />
            <StatTile
              label="Typical viewers"
              count={kpis.medianAvgViewers !== null ? { value: Math.round(kpis.medianAvgViewers), format: "compact" } : undefined}
              value={kpis.medianAvgViewers === null ? "—" : undefined}
              delta={change(kpis.medianAvgViewers, kpis.medianAvgViewersPrevious)}
              deltaLabel="vs. previous period"
              sub={kpis.medianAvgViewers === null ? "No concurrent-viewer data yet" : "median of stream averages"}
            />
            <StatTile
              label="Best peak"
              count={kpis.bestPeak ? { value: kpis.bestPeak.viewers, format: "compact" } : undefined}
              value={kpis.bestPeak ? undefined : "—"}
              sub={kpis.bestPeak ? <span className="line-clamp-1">{kpis.bestPeak.title}</span> : undefined}
            />
            {/* No period delta: subs and Bits are allocated only to streams inside the window, so the previous period isn't comparable. */}
            <StatTile label="Stream earnings" count={{ value: kpis.earningsMid, format: "usd" }} sub="ads, subs and Bits attributed to streams" />
          </section>

          <section className="grid gap-4 lg:grid-cols-5">
            <Card data-reveal className="lg:col-span-3">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PlatformBadge platform={selected.platform} />
                  {isLive ? (
                    <Badge variant="outline" className="gap-1.5 border-critical/40">
                      <Radio className="size-3 animate-pulse text-critical" /> Live · {formatCompact(selected.live!.viewers)} watching
                    </Badge>
                  ) : (
                    selected.estimate && <BasisBadge basis={selected.estimate.basis} />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {dateTime.format(new Date(selected.startedAt))} · {formatDuration(selected.durationSec)}
                    {selected.vsMedian !== null ? ` · ${selected.vsMedian.toFixed(1)}× your typical audience` : ""}
                  </span>
                </div>
                <CardTitle className="text-lg">
                  {selected.url ? (
                    <a href={selected.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                      {selected.title} <ExternalLink className="size-3.5 text-muted-foreground" />
                    </a>
                  ) : (
                    selected.title
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Average</dt>
                    <dd className="text-lg font-semibold tabular-nums">{selected.avgViewers !== undefined ? formatCompact(selected.avgViewers) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Peak</dt>
                    <dd className="text-lg font-semibold tabular-nums">{selected.peakViewers !== undefined ? formatCompact(selected.peakViewers) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">VOD views</dt>
                    <dd className="text-lg font-semibold tabular-nums">{selected.views ? formatCompact(selected.views) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Estimated</dt>
                    <dd>{selected.estimate ? <Range value={selected.estimate} precise size="md" /> : <span className="text-lg font-semibold">—</span>}</dd>
                  </div>
                </dl>

                {curve.length >= 2 ? (
                  <ViewerCurve points={curve} average={selected.avgViewers} color={`var(--chart-${selected.platform})`} />
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No viewer samples for this stream. Keep the scheduler running while you are live and the curve appears here.
                  </div>
                )}

                {Object.keys(bySource).length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
                    <div>
                      <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Where the money comes from</div>
                      <SourceBreakdown bySource={bySource} />
                    </div>
                    {selected.estimate && selected.estimate.notes.length > 0 && (
                      <ul className="space-y-1 self-end text-xs text-muted-foreground">
                        {selected.estimate.notes.slice(0, 3).map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-reveal className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Streams in this period</CardTitle>
                <CardDescription>Average viewers against your typical stream. Pick one to see its curve.</CardDescription>
              </CardHeader>
              <CardContent className="px-2">
                <ol className="max-h-[32rem] space-y-0.5 overflow-y-auto pr-1">
                  {streams.map((s) => {
                    const active = s.key === selected.key;
                    return (
                      <li key={s.key}>
                        <Link
                          href={`/content/streams?window=${windowDays}&stream=${encodeURIComponent(s.key)}`}
                          aria-current={active ? "true" : undefined}
                          className={cn("flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent", active && "bg-accent")}
                        >
                          <PlatformDot platform={s.platform} />
                          <div className="min-w-0 flex-1">
                            <div className={cn("truncate text-sm", active ? "font-medium" : "")}>{s.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {s.live ? "Live now" : dateShort.format(new Date(s.startedAt))} · {formatDuration(s.durationSec)}
                              {s.estimate && s.estimate.mid > 0 ? ` · ${formatUsd(s.estimate.mid)}` : ""}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium tabular-nums">{s.live ? formatCompact(s.live.viewers) : s.avgViewers !== undefined ? formatCompact(s.avgViewers) : "—"}</div>
                            <div className={cn("text-xs tabular-nums", s.vsMedian === null ? "text-muted-foreground" : s.vsMedian >= 1.25 ? "text-good" : s.vsMedian < 0.75 ? "text-serious" : "text-muted-foreground")}>
                              {s.live ? "watching" : s.vsMedian === null ? "avg" : `${s.vsMedian.toFixed(1)}×`}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </Reveal>
  );
}
