import type { Platform } from "@/lib/platforms/types";

/**
 * Goal projection. Pure: the page supplies the goal, the current value and
 * a short history, and gets back where the creator stands, when the current
 * pace lands them, and what pace the deadline would need.
 */

export const GOAL_METRICS = ["followers", "monthly_earnings"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  followers: "Followers",
  monthly_earnings: "Monthly earnings",
};

export type GoalStatus = "active" | "reached" | "archived";

export interface GoalRecord {
  id: number;
  /** null = all connected platforms combined. */
  platform: Platform | null;
  metric: GoalMetric;
  target: number;
  /** ISO date (YYYY-MM-DD). */
  targetDate: string;
  status: GoalStatus;
  createdAt: string;
  reachedAt: string | null;
}

export interface HistoryPoint {
  capturedAt: string;
  value: number;
}

export const DAYS_PER_MONTH = 365.25 / 12;
/** Shortest history that gives a usable pace. */
export const MIN_HISTORY_DAYS = 7;
/** How far back the pace is measured. */
export const PACE_WINDOW_DAYS = 90;

/**
 * Compound monthly growth from the oldest and newest points in the pace
 * window. Null when the history is too short to say anything.
 */
export function monthlyGrowthRate(history: HistoryPoint[], now: Date): number | null {
  const since = now.getTime() - PACE_WINDOW_DAYS * 86_400_000;
  const pts = history
    .filter((p) => new Date(p.capturedAt).getTime() >= since && p.value > 0)
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const days = (new Date(last.capturedAt).getTime() - new Date(first.capturedAt).getTime()) / 86_400_000;
  if (days < MIN_HISTORY_DAYS) return null;
  return Math.pow(last.value / first.value, DAYS_PER_MONTH / days) - 1;
}

export type GoalVerdict = "reached" | "on_track" | "behind" | "no_pace" | "stalled";

export interface GoalProjection {
  current: number;
  /** 0–1 share of the target already reached. */
  progress: number;
  monthsLeft: number;
  /** Monthly compound rate observed recently, null without history. */
  paceMonthly: number | null;
  /** Months to the target at the observed pace; null when the pace is ≤ 0 or unknown. */
  monthsAtPace: number | null;
  projectedDate: string | null;
  /** Monthly rate that would hit the target exactly on the target date. */
  requiredMonthly: number | null;
  verdict: GoalVerdict;
}

export function projectGoal(goal: Pick<GoalRecord, "target" | "targetDate">, current: number, paceMonthly: number | null, now: Date): GoalProjection {
  const target = goal.target;
  const monthsLeft = Math.max(0, (new Date(`${goal.targetDate}T00:00:00Z`).getTime() - now.getTime()) / 86_400_000 / DAYS_PER_MONTH);
  const progress = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  if (current >= target) {
    return { current, progress: 1, monthsLeft, paceMonthly, monthsAtPace: 0, projectedDate: now.toISOString(), requiredMonthly: 0, verdict: "reached" };
  }
  const requiredMonthly = current > 0 && monthsLeft > 0 ? Math.pow(target / current, 1 / monthsLeft) - 1 : null;
  let monthsAtPace: number | null = null;
  let projectedDate: string | null = null;
  if (paceMonthly !== null && paceMonthly > 0 && current > 0) {
    monthsAtPace = Math.log(target / current) / Math.log(1 + paceMonthly);
    projectedDate = new Date(now.getTime() + monthsAtPace * DAYS_PER_MONTH * 86_400_000).toISOString();
  }
  const verdict: GoalVerdict =
    paceMonthly === null ? "no_pace" : paceMonthly <= 0 ? "stalled" : monthsAtPace !== null && monthsAtPace <= monthsLeft ? "on_track" : "behind";
  return { current, progress, monthsLeft, paceMonthly, monthsAtPace, projectedDate, requiredMonthly, verdict };
}

export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  const pct = rate * 100;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%/mo`;
}

const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function formatMonth(iso: string): string {
  return monthYear.format(new Date(iso));
}
