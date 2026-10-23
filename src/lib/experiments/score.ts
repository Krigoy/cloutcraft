import type { EstimatedItem } from "@/lib/earnings/estimate";
import { median } from "@/lib/insights/analyze";
import { CONTENT_KIND_LABEL, PLATFORM_LABEL, type ContentKind, type Platform } from "@/lib/platforms/types";

/**
 * Experiment scoring.
 *
 * An experiment names a *segment* of uploads (the treatment: e.g. "TikTok
 * videos of 60 s or more posted on Fridays") and a metric. Scoring is pure
 * arithmetic over the synced items, so it is reproducible and runs on every
 * page load:
 *
 *   treatment  = segment uploads published since the experiment started
 *   baseline   = segment uploads in the BASELINE_DAYS before the start
 *   control    = everything else on the same platform, in both periods
 *
 * The control cancels two things the raw comparison can't: channel-wide
 * trend, and the fact that newer uploads have simply had less time to
 * collect views. "Adjusted lift" is the headline; the raw lift is shown too.
 *
 * This file is imported by client-safe code, so it stays free of server-only
 * imports.
 */

export const EXPERIMENT_METRICS = ["median_views", "median_engagement", "earnings_per_item", "uploads_per_week"] as const;
export type ExperimentMetric = (typeof EXPERIMENT_METRICS)[number];

export const METRIC_LABEL: Record<ExperimentMetric, string> = {
  median_views: "Median views per upload",
  median_engagement: "Median engagement rate",
  earnings_per_item: "Estimated earnings per upload",
  uploads_per_week: "Uploads per week",
};

export interface ExperimentSegment {
  platform?: Platform;
  kind?: ContentKind;
  /** 0–6, Sunday first, in the analysis time zone. */
  weekdays?: number[];
  minDurationSec?: number;
  maxDurationSec?: number;
}

export const EXPERIMENT_STATUSES = ["active", "won", "lost", "inconclusive", "abandoned"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export interface ExperimentSpec {
  segment: ExperimentSegment;
  metric: ExperimentMetric;
  /** Fractional lift that counts as a win (0.2 = +20%). */
  targetLift: number;
  startedAt: string;
  endsAt: string;
}

export type Confidence = "too_early" | "early" | "solid";

export interface GroupStat {
  n: number;
  value: number | null;
}

export interface ExperimentScore {
  treatment: GroupStat;
  baseline: GroupStat;
  control: { before: GroupStat; after: GroupStat } | null;
  /** treatment ÷ baseline − 1, null until both groups have a value. */
  rawLift: number | null;
  /** Raw lift corrected by the control group's own change; equals rawLift when there is no usable control. */
  adjustedLift: number | null;
  confidence: Confidence;
  /** 0–1 share of the planned duration that has elapsed. */
  progress: number;
  daysLeft: number;
  ended: boolean;
  /** What the data says so far; only final once `ended`. */
  verdict: "won" | "lost" | "inconclusive";
  caveats: string[];
}

export const BASELINE_DAYS = 90;
/** Treatment uploads needed before a result is more than a hint. */
export const MIN_SAMPLE = 3;
export const SOLID_SAMPLE = 8;
export const MIN_CONTROL = 3;

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

function weekdayIn(iso: string, timeZone: string): number {
  let f = weekdayFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone });
    weekdayFormatters.set(timeZone, f);
  }
  const idx = WEEKDAYS_SHORT.indexOf(f.format(new Date(iso)));
  return idx === -1 ? new Date(iso).getUTCDay() : idx;
}

export function matchesSegment(e: EstimatedItem, s: ExperimentSegment, timeZone: string): boolean {
  const { item } = e;
  if (s.platform && item.platform !== s.platform) return false;
  if (s.kind && item.kind !== s.kind) return false;
  if (s.weekdays?.length && !s.weekdays.includes(weekdayIn(item.publishedAt, timeZone))) return false;
  if (s.minDurationSec !== undefined && item.durationSec < s.minDurationSec) return false;
  if (s.maxDurationSec !== undefined && item.durationSec > s.maxDurationSec) return false;
  return true;
}

function engagement(e: EstimatedItem): number {
  const { item } = e;
  if (item.views <= 0) return 0;
  return ((item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0)) / item.views;
}

function metricValue(metric: ExperimentMetric, group: EstimatedItem[], periodDays: number): number | null {
  if (metric === "uploads_per_week") return periodDays > 0 ? group.length / (periodDays / 7) : null;
  if (group.length === 0) return null;
  switch (metric) {
    case "median_views":
      return median(group.map((e) => e.item.views));
    case "median_engagement":
      return median(group.map(engagement));
    case "earnings_per_item":
      return group.reduce((s, e) => s + e.estimate.mid, 0) / group.length;
  }
}

function ratio(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b <= 0) return null;
  return a / b;
}

export function scoreExperiment(
  spec: ExperimentSpec,
  items: EstimatedItem[],
  now: Date,
  timeZone = "UTC",
): ExperimentScore {
  const start = new Date(spec.startedAt).getTime();
  const plannedEnd = new Date(spec.endsAt).getTime();
  const ended = now.getTime() >= plannedEnd;
  const end = Math.min(now.getTime(), plannedEnd);
  const treatDays = Math.max(0, (end - start) / 86_400_000);
  const baseStart = start - BASELINE_DAYS * 86_400_000;

  const published = (e: EstimatedItem) => new Date(e.item.publishedAt).getTime();
  const inTreat = (e: EstimatedItem) => published(e) >= start && published(e) <= end;
  const inBase = (e: EstimatedItem) => published(e) >= baseStart && published(e) < start;
  const inSeg = (e: EstimatedItem) => matchesSegment(e, spec.segment, timeZone);
  // Control: the same platform (or everything, for a cross-platform segment) minus the segment.
  const inControlPool = (e: EstimatedItem) => (!spec.segment.platform || e.item.platform === spec.segment.platform) && !inSeg(e);

  const treatItems = items.filter((e) => inSeg(e) && inTreat(e));
  const baseItems = items.filter((e) => inSeg(e) && inBase(e));
  const ctrlAfter = items.filter((e) => inControlPool(e) && inTreat(e));
  const ctrlBefore = items.filter((e) => inControlPool(e) && inBase(e));

  const treatment: GroupStat = { n: treatItems.length, value: metricValue(spec.metric, treatItems, treatDays) };
  const baseline: GroupStat = { n: baseItems.length, value: metricValue(spec.metric, baseItems, BASELINE_DAYS) };

  const caveats: string[] = [];
  let control: ExperimentScore["control"] = null;
  // Cadence is a count, not a per-upload outcome: a control adds nothing.
  if (spec.metric !== "uploads_per_week" && ctrlAfter.length >= MIN_CONTROL && ctrlBefore.length >= MIN_CONTROL) {
    control = {
      before: { n: ctrlBefore.length, value: metricValue(spec.metric, ctrlBefore, BASELINE_DAYS) },
      after: { n: ctrlAfter.length, value: metricValue(spec.metric, ctrlAfter, treatDays) },
    };
  } else if (spec.metric !== "uploads_per_week") {
    caveats.push("No control group yet: the lift is not corrected for channel-wide trend or the age of the uploads.");
  }

  const rawRatio = ratio(treatment.value, baseline.value);
  const rawLift = rawRatio === null ? null : rawRatio - 1;
  const ctrlRatio = control ? ratio(control.after.value, control.before.value) : null;
  const adjustedLift = rawRatio === null ? null : ctrlRatio !== null && ctrlRatio > 0 ? rawRatio / ctrlRatio - 1 : rawLift;

  const effectiveN = spec.metric === "uploads_per_week" ? Math.round(treatDays / 7) : treatment.n;
  const confidence: Confidence = effectiveN < MIN_SAMPLE ? "too_early" : effectiveN < SOLID_SAMPLE ? "early" : "solid";
  if (treatment.n > 0 && baseline.n < MIN_SAMPLE) caveats.push(`Only ${baseline.n} baseline upload${baseline.n === 1 ? "" : "s"} to compare against.`);
  if (spec.metric === "median_views" || spec.metric === "earnings_per_item") {
    caveats.push("Recent uploads are still accumulating views; the control adjustment offsets this but does not remove it.");
  }

  const headline = adjustedLift;
  const verdict: ExperimentScore["verdict"] =
    headline === null || confidence === "too_early" ? "inconclusive" : headline >= spec.targetLift ? "won" : headline < 0 ? "lost" : "inconclusive";

  const totalDays = Math.max(1, (plannedEnd - start) / 86_400_000);
  return {
    treatment,
    baseline,
    control,
    rawLift,
    adjustedLift,
    confidence,
    progress: Math.min(1, Math.max(0, (now.getTime() - start) / 86_400_000 / totalDays)),
    daysLeft: Math.max(0, Math.ceil((plannedEnd - now.getTime()) / 86_400_000)),
    ended,
    verdict,
    caveats,
  };
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

export function describeSegment(s: ExperimentSegment): string[] {
  const parts: string[] = [];
  if (s.platform) parts.push(PLATFORM_LABEL[s.platform]);
  if (s.kind) parts.push(`${CONTENT_KIND_LABEL[s.kind]}s`);
  if (s.weekdays?.length) parts.push(s.weekdays.map((d) => WEEKDAYS_SHORT[d]).join("/"));
  if (s.minDurationSec !== undefined && s.maxDurationSec !== undefined) parts.push(`${fmtDur(s.minDurationSec)}–${fmtDur(s.maxDurationSec)}`);
  else if (s.minDurationSec !== undefined) parts.push(`≥ ${fmtDur(s.minDurationSec)}`);
  else if (s.maxDurationSec !== undefined) parts.push(`≤ ${fmtDur(s.maxDurationSec)}`);
  return parts.length ? parts : ["All uploads"];
}

function fmtDur(sec: number): string {
  if (sec >= 3600) return `${(sec / 3600).toFixed(sec % 3600 ? 1 : 0)} h`;
  if (sec >= 60) return `${Math.round(sec / 60)} min`;
  return `${sec} s`;
}

export function formatMetricValue(metric: ExperimentMetric, value: number | null): string {
  if (value === null) return "—";
  switch (metric) {
    case "median_views":
      return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : Math.round(value).toLocaleString();
    case "median_engagement":
      return `${(value * 100).toFixed(1)}%`;
    case "earnings_per_item":
      return `$${value.toFixed(2)}`;
    case "uploads_per_week":
      return value.toFixed(1);
  }
}
