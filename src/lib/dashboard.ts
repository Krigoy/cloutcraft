import "server-only";
import { cache } from "react";
import * as repo from "@/lib/db/repo";
import { estimateAll, type ChannelEarnings, type EstimatedItem, type PayoutCalibration, type PayoutReport } from "@/lib/earnings/estimate";
import { monthlyGrowthRate, PACE_WINDOW_DAYS, projectGoal, type GoalProjection, type GoalRecord, type HistoryPoint } from "@/lib/goals";
import { resolveRates, type Rates } from "@/lib/earnings/rates";
import { analyze, type InsightReport } from "@/lib/insights/analyze";
import { PLATFORM_LABEL, type ChannelSnapshot, type LiveSample, type Platform } from "@/lib/platforms/types";
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

export interface GoalView {
  goal: GoalRecord;
  projection: GoalProjection;
  /** e.g. "1M YouTube followers" */
  label: string;
}

/** Sum of mid estimates for items published in the `days` before `end`. */
function earningsIn(items: EstimatedItem[], end: number, days: number): number {
  const start = end - days * 86_400_000;
  return items.reduce((s, e) => {
    const t = new Date(e.item.publishedAt).getTime();
    return t >= start && t < end ? s + e.estimate.mid : s;
  }, 0);
}

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function goalLabel(goal: GoalRecord): string {
  const scope = goal.platform ? PLATFORM_LABEL[goal.platform] : "total";
  return goal.metric === "followers"
    ? `${compactNumber.format(goal.target)} ${scope} followers`
    : `$${compactNumber.format(goal.target)}/month ${goal.platform ? `from ${PLATFORM_LABEL[goal.platform]}` : "in total"}`;
}

function buildGoalViews(
  goals: GoalRecord[],
  snapshots: Partial<Record<Platform, ChannelSnapshot>>,
  history: Partial<Record<Platform, HistoryPoint[]>>,
  estimated: EstimatedItem[],
  now: Date,
): GoalView[] {
  return goals.map((goal) => {
    let current = 0;
    let pace: number | null = null;
    if (goal.metric === "followers") {
      const platforms = goal.platform ? [goal.platform] : (Object.keys(snapshots) as Platform[]);
      // Combined pace: follower-weighted mean of the per-platform rates that have history.
      let weighted = 0;
      let weight = 0;
      for (const p of platforms) {
        const followers = snapshots[p]?.followers ?? 0;
        current += followers;
        const r = monthlyGrowthRate(history[p] ?? [], now);
        if (r !== null && followers > 0) {
          weighted += r * followers;
          weight += followers;
        }
      }
      pace = weight > 0 ? weighted / weight : null;
    } else {
      const items = goal.platform ? estimated.filter((e) => e.item.platform === goal.platform) : estimated;
      current = earningsIn(items, now.getTime(), 30);
      const previous = earningsIn(items, now.getTime() - 30 * 86_400_000, 30);
      pace = previous > 0 ? current / previous - 1 : null;
    }
    return { goal, projection: projectGoal(goal, current, pace, now), label: goalLabel(goal) };
  });
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
  /** Real payouts the creator entered, and the per-platform factor fitted from them. */
  payoutReports: PayoutReport[];
  calibration: Partial<Record<Platform, PayoutCalibration>>;
  /** Active goals with their projection (archived ones are not loaded here). */
  goals: GoalView[];
  reachedGoals: number;
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
  const [connections, snapshots, rateOverrides, payoutReports, allGoals, history, items, live, lastTick] = await Promise.all([
    repo.listConnections(workspaceId),
    repo.latestSnapshots(workspaceId),
    repo.getRateOverrides(workspaceId),
    repo.listPayoutReports(workspaceId),
    repo.listGoals(workspaceId),
    repo.followerHistory(workspaceId, new Date(now.getTime() - PACE_WINDOW_DAYS * 86_400_000).toISOString()),
    repo.listContentItems(workspaceId, {
      sinceIso: new Date(now.getTime() - lookbackDays() * 86_400_000).toISOString(),
    }),
    repo.currentlyLive(workspaceId),
    repo.lastSchedulerRun(),
  ]);
  const rates = resolveRates(rateOverrides);

  const { items: estimated, channels, calibration } = estimateAll(items, snapshots, rates, { windowDays, now, payoutReports });
  const windowStart = now.getTime() - windowDays * 86_400_000;
  const inWindow = estimated.filter((e) => new Date(e.item.publishedAt).getTime() >= windowStart);
  const report = analyze({ items: estimated, snapshots, windowDays, now, timeZone: env().ANALYSIS_TIMEZONE });
  const goals = buildGoalViews(allGoals.filter((g) => g.status === "active"), snapshots, history, estimated, now);
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
    payoutReports,
    calibration,
    goals,
    reachedGoals: allGoals.filter((g) => g.status === "reached").length,
    report,
    views24h,
    views7d,
    live,
    hasData: items.length > 0,
    lastTick,
  };
});
