import type { EarningsEstimate, EstimatedItem } from "@/lib/earnings/estimate";
import { median } from "@/lib/insights/analyze";
import type { LiveSample, Platform } from "@/lib/platforms/types";

/**
 * Live-stream analytics: per-stream rows for the streams page, period KPIs
 * with a previous-period comparison, and the viewer curve for one stream.
 * Pure functions; the page supplies the synced items and samples.
 */

export interface StreamView {
  /** Stable key for `?stream=`: the content item id, or `live:<platform>:<streamId>` while live. */
  key: string;
  platform: Platform;
  title: string;
  url?: string;
  startedAt: string;
  durationSec: number;
  avgViewers?: number;
  peakViewers?: number;
  /** VOD views, when the platform reports them. */
  views?: number;
  estimate?: EarningsEstimate;
  streamId?: string;
  /** Avg viewers ÷ the period's median avg viewers on the same platform. */
  vsMedian: number | null;
  live?: { viewers: number; capturedAt: string };
}

export interface StreamKpis {
  streams: number;
  streamsPrevious: number;
  hours: number;
  hoursPrevious: number;
  medianAvgViewers: number | null;
  medianAvgViewersPrevious: number | null;
  bestPeak: { viewers: number; title: string } | null;
  earningsMid: number;
  earningsPreviousMid: number;
}

export interface StreamsSummary {
  streams: StreamView[];
  kpis: StreamKpis;
}

export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return (current - previous) / previous;
}

const ENDED_GRACE_MS = 10 * 60_000;

export function summarizeStreams(items: EstimatedItem[], live: LiveSample[], windowDays: number, now: Date): StreamsSummary {
  const windowStart = now.getTime() - windowDays * 86_400_000;
  const prevStart = now.getTime() - 2 * windowDays * 86_400_000;
  const liveItems = items.filter((e) => e.item.kind === "live");
  const at = (e: EstimatedItem) => new Date(e.item.publishedAt).getTime();
  const current = liveItems.filter((e) => at(e) >= windowStart && at(e) <= now.getTime());
  const previous = liveItems.filter((e) => at(e) >= prevStart && at(e) < windowStart);

  const medianByPlatform = new Map<Platform, number>();
  for (const p of new Set(current.map((e) => e.item.platform))) {
    const avgs = current.filter((e) => e.item.platform === p && e.item.avgViewers !== undefined).map((e) => e.item.avgViewers!);
    if (avgs.length >= 3) medianByPlatform.set(p, median(avgs));
  }

  const streams: StreamView[] = current
    .map((e) => {
      const med = medianByPlatform.get(e.item.platform);
      return {
        key: e.item.id,
        platform: e.item.platform,
        title: e.item.title,
        url: e.item.url,
        startedAt: e.item.publishedAt,
        durationSec: e.item.durationSec,
        avgViewers: e.item.avgViewers,
        peakViewers: e.item.peakViewers,
        views: e.item.views,
        estimate: e.estimate,
        streamId: e.item.streamId,
        vsMedian: med && e.item.avgViewers !== undefined && med > 0 ? e.item.avgViewers / med : null,
      } satisfies StreamView;
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // A broadcast in progress has no VOD yet: show it from its freshest sample.
  for (const l of live) {
    if (streams.some((s) => s.streamId === l.streamId)) continue;
    const startedAt = l.startedAt ?? l.capturedAt;
    streams.unshift({
      key: `live:${l.platform}:${l.streamId}`,
      platform: l.platform,
      title: l.title ?? "Live now",
      startedAt,
      durationSec: Math.max(0, Math.round((new Date(l.capturedAt).getTime() - new Date(startedAt).getTime()) / 1000)),
      streamId: l.streamId,
      vsMedian: null,
      live: { viewers: l.viewerCount, capturedAt: l.capturedAt },
    });
  }

  const hours = (xs: EstimatedItem[]) => xs.reduce((s, e) => s + e.item.durationSec / 3600, 0);
  const medAvg = (xs: EstimatedItem[]) => {
    const avgs = xs.filter((e) => e.item.avgViewers !== undefined).map((e) => e.item.avgViewers!);
    return avgs.length ? median(avgs) : null;
  };
  const best = current.filter((e) => e.item.peakViewers !== undefined).sort((a, b) => b.item.peakViewers! - a.item.peakViewers!)[0];

  return {
    streams,
    kpis: {
      streams: current.length,
      streamsPrevious: previous.length,
      hours: hours(current),
      hoursPrevious: hours(previous),
      medianAvgViewers: medAvg(current),
      medianAvgViewersPrevious: medAvg(previous),
      bestPeak: best ? { viewers: best.item.peakViewers!, title: best.item.title } : null,
      earningsMid: current.reduce((s, e) => s + e.estimate.mid, 0),
      earningsPreviousMid: previous.reduce((s, e) => s + e.estimate.mid, 0),
    },
  };
}

export interface CurvePoint {
  /** Minutes since the stream started. */
  minute: number;
  viewers: number;
}

/** Viewer samples as minutes-since-start, oldest first; `startedAt` falls back to the first sample. */
export function viewerCurve(samples: { capturedAt: string; viewerCount: number }[], startedAt?: string): CurvePoint[] {
  if (samples.length === 0) return [];
  const sorted = [...samples].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  const t0 = new Date(startedAt ?? sorted[0].capturedAt).getTime();
  return sorted.map((s) => ({ minute: Math.max(0, Math.round((new Date(s.capturedAt).getTime() - t0) / 60_000)), viewers: s.viewerCount }));
}

/** Whether a stream's samples describe a finished broadcast (no sample in the last few minutes). */
export function streamEnded(samples: { capturedAt: string }[], now: Date): boolean {
  if (samples.length === 0) return true;
  const last = Math.max(...samples.map((s) => new Date(s.capturedAt).getTime()));
  return now.getTime() - last > ENDED_GRACE_MS;
}

export function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(h >= 10 ? 0 : 1)} h`;
}
