import "server-only";
import { cache } from "react";
import * as repo from "@/lib/db/repo";
import { estimateAll, type ChannelEarnings, type EstimatedItem } from "@/lib/earnings/estimate";
import { resolveRates, type Rates } from "@/lib/earnings/rates";
import { analyze, type InsightReport } from "@/lib/insights/analyze";
import type { ChannelSnapshot, LiveSample, Platform } from "@/lib/platforms/types";
import { env } from "@/lib/env";
import { getWorkspaceId } from "@/lib/session";
import { lookbackDays } from "@/lib/sync";

/**
 * Everything a page needs, computed once per request (React `cache`) so the
 * overview, content table and coach all agree on the same numbers.
 */

export type WindowDays = number;

/** Selectable windows (WINDOW_OPTIONS), never longer than the sync lookback. */
export function windowOptions(): number[] {
  const max = lookbackDays();
  const options = env().WINDOW_OPTIONS.filter((d) => d <= max);
  return options.length ? options : [max];
}

export function parseWindow(value: string | string[] | undefined): WindowDays {
  const n = Number(Array.isArray(value) ? value[0] : value);
  const options = windowOptions();
  if (options.includes(n)) return n;
  const fallback = env().DEFAULT_WINDOW_DAYS;
  return options.includes(fallback) ? fallback : options[options.length - 1];
}

export interface ViewDeltas {
  /** item id → views gained since the cutoff (null when no history exists yet). */
  perItem: Map<string, number | null>;
  total: number;
  /** Share of items with a usable history point. */
  coverage: number;
}

export interface DashboardData {
  workspaceId: string;
  windowDays: WindowDays;
  windowOptions: number[];
  now: Date;
  connections: repo.ConnectionSummary[];
  snapshots: Partial<Record<Platform, ChannelSnapshot>>;
  rates: Rates;
  rateOverrides: Record<string, number>;
  /** Every synced item (full lookback), with its estimate. */
  estimated: EstimatedItem[];
  /** Items published inside the window. */
  inWindow: EstimatedItem[];
  channels: Partial<Record<Platform, ChannelEarnings>>;
  report: InsightReport;
  views24h: ViewDeltas;
  views7d: ViewDeltas;
  live: LiveSample[];
  hasData: boolean;
  lastTick: { ranAt: string; kind: string } | null;
}

async function viewDeltas(
  workspaceId: string,
  items: EstimatedItem[],
  cutoff: Date,
): Promise<ViewDeltas> {
  const asOf = await repo.viewsAsOf(workspaceId, cutoff.toISOString());
  const perItem = new Map<string, number | null>();
  let total = 0;
  let known = 0;
  for (const { item } of items) {
    const before = asOf.get(item.id);
    let delta: number | null;
    if (before !== undefined) delta = Math.max(0, item.views - before);
    else if (new Date(item.publishedAt) > cutoff) delta = item.views;
    else delta = null;
    perItem.set(item.id, delta);
    if (delta !== null) {
      total += delta;
      known++;
    }
  }
  return { perItem, total, coverage: items.length ? known / items.length : 0 };
}

export const loadDashboard = cache(async (windowDays: WindowDays): Promise<DashboardData> => {
  const workspaceId = await getWorkspaceId();
  const now = new Date();
  const [connections, snapshots, rateOverrides, items, live, lastTick] = await Promise.all([
    repo.listConnections(workspaceId),
    repo.latestSnapshots(workspaceId),
    repo.getRateOverrides(workspaceId),
    repo.listContentItems(workspaceId, {
      sinceIso: new Date(now.getTime() - lookbackDays() * 86_400_000).toISOString(),
    }),
    repo.currentlyLive(workspaceId),
    repo.lastSchedulerRun(),
  ]);
  const rates = resolveRates(rateOverrides);

  const { items: estimated, channels } = estimateAll(items, snapshots, rates, { windowDays, now });
  const windowStart = now.getTime() - windowDays * 86_400_000;
  const inWindow = estimated.filter((e) => new Date(e.item.publishedAt).getTime() >= windowStart);
  const report = analyze({ items: estimated, snapshots, windowDays, now, timeZone: env().ANALYSIS_TIMEZONE });
  const [views24h, views7d] = await Promise.all([
    viewDeltas(workspaceId, estimated, new Date(now.getTime() - 86_400_000)),
    viewDeltas(workspaceId, estimated, new Date(now.getTime() - 7 * 86_400_000)),
  ]);

  return {
    workspaceId,
    windowDays,
    windowOptions: windowOptions(),
    now,
    connections,
    snapshots,
    rates,
    rateOverrides,
    estimated,
    inWindow,
    channels,
    report,
    views24h,
    views7d,
    live,
    hasData: items.length > 0,
    lastTick,
  };
});
