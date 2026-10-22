import type { ChannelSnapshot, ContentItem, ContentKind, Platform } from "@/lib/platforms/types";
import { CONTENT_KIND_LABEL, PLATFORM_LABEL } from "@/lib/platforms/types";
import {
  addRange,
  sumRanges,
  ZERO,
  type EstimateRange,
  type EstimatedItem,
  type RevenueSource,
} from "@/lib/earnings/estimate";

/**
 * Deterministic performance analysis.
 *
 * Everything here is computed from the synced data with plain statistics, so
 * it is reproducible, explainable and available even without an Anthropic
 * key. The AI coach consumes this report as its evidence base and is told to
 * cite finding ids rather than invent numbers.
 */

export interface Baseline {
  platform: Platform;
  kind: ContentKind;
  count: number;
  medianViews: number;
  p25Views: number;
  p75Views: number;
  medianEngagement: number;
  medianEarningsMid: number;
}

export interface ScoredItem {
  id: string;
  platform: Platform;
  kind: ContentKind;
  title: string;
  url: string;
  publishedAt: string;
  durationSec: number;
  views: number;
  engagementRate: number;
  earningsMid: number;
  /** views ÷ median views for the same platform + kind. */
  viewsVsBaseline: number;
  earningsVsBaseline: number;
}

export interface CadenceStat {
  platform: Platform;
  kind: ContentKind;
  count: number;
  perWeek: number;
  prevPerWeek: number;
  medianGapDays: number;
  longestGapDays: number;
  daysSinceLast: number;
}

export interface TimingStat {
  platform: Platform;
  kind: ContentKind;
  weekday: number;
  label: string;
  count: number;
  medianViews: number;
  /** median views on this weekday ÷ median for the same platform + kind. */
  lift: number;
}

export interface DurationBucketStat {
  platform: Platform;
  kind: ContentKind;
  bucket: string;
  count: number;
  medianViews: number;
  medianEarningsMid: number;
  /** median earnings ÷ kind baseline median earnings. */
  earningsLift: number;
}

export interface FormatMixStat {
  platform: Platform;
  kind: ContentKind;
  items: number;
  shareOfItems: number;
  shareOfViews: number;
  shareOfEarnings: number;
  earningsPerItemMid: number;
}

export type FindingType =
  | "growth"
  | "format_mix"
  | "cadence"
  | "timing"
  | "duration"
  | "engagement"
  | "concentration"
  | "monetization";

export type FindingSeverity = "positive" | "opportunity" | "warning" | "info";

export interface Finding {
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  platform?: Platform;
  title: string;
  detail: string;
  metrics: Record<string, number | string>;
}

export interface PlatformTotals {
  platform: Platform;
  items: number;
  views: number;
  earnings: EstimateRange;
  bySource: Partial<Record<RevenueSource, EstimateRange>>;
  followers?: number;
}

export interface InsightReport {
  generatedAt: string;
  windowDays: number;
  totals: {
    items: number;
    views: number;
    earnings: EstimateRange;
    byPlatform: PlatformTotals[];
  };
  growth: {
    viewsCurrent: number;
    viewsPrevious: number;
    viewsChange: number | null;
    earningsCurrentMid: number;
    earningsPreviousMid: number;
    earningsChange: number | null;
    itemsCurrent: number;
    itemsPrevious: number;
  };
  baselines: Baseline[];
  topPerformers: ScoredItem[];
  underperformers: ScoredItem[];
  cadence: CadenceStat[];
  timing: TimingStat[];
  durationBuckets: DurationBucketStat[];
  formatMix: FormatMixStat[];
  findings: Finding[];
}

/**
 * Every cut-off the rule-based findings use. Defaults are deliberately
 * conservative; override per call (e.g. from a settings page) rather than
 * editing the rules.
 */
export interface InsightThresholds {
  /** Window-over-window view change that counts as notable growth/decline. */
  growthChange: number;
  /** Minimum items on a platform before the format mix is judged. */
  formatMixMinItems: number;
  /** A format with at least this share of uploads is "dominant". */
  formatMixDominantShare: number;
  /** Dominant format is flagged when its earnings share is below itemShare ÷ this. */
  formatMixEarningsDivisor: number;
  /** Cap on the earnings share needed for a minor format to "punch above its weight". */
  formatMixPunchShareCap: number;
  formatMixPunchMinItems: number;
  /** TikTok shorts: minimum count to flag unmonetised reach, and the length that counts as "nearly eligible". */
  tiktokShortMinItems: number;
  tiktokNearlyEligibleSec: number;
  /** Cadence: previous rate needed before a drop is judged, and the drop ratio. */
  cadenceMinPrevPerWeek: number;
  cadenceDropRatio: number;
  /** Stale after max(staleMinDays, medianGap × staleGapMultiple) with at least staleMinCount items. */
  staleMinDays: number;
  staleGapMultiple: number;
  staleMinCount: number;
  irregularMinDays: number;
  irregularMinCount: number;
  /** Timing: uploads per weekday needed, best-day lift, and best÷worst spread. */
  timingMinCount: number;
  timingMinLift: number;
  timingMinSpread: number;
  /** Duration buckets: items per bucket and earnings lift vs. the format median. */
  durationMinCount: number;
  durationMinLift: number;
  /** Hidden gems: items per format and engagement percentile. */
  gemMinItems: number;
  gemPercentile: number;
  /** Hit concentration: items per platform, top fraction, and share of views. */
  concentrationMinItems: number;
  concentrationTopFraction: number;
  concentrationShare: number;
  /** Twitch: subs + Bits share that marks a community-funded channel. */
  communityShare: number;
  /** Ranking: items per format before top/under performers are ranked, list length, grace days for new uploads. */
  rankMinCount: number;
  rankListSize: number;
  underperformerGraceDays: number;
}

export const DEFAULT_THRESHOLDS: InsightThresholds = {
  growthChange: 0.2,
  formatMixMinItems: 10,
  formatMixDominantShare: 0.35,
  formatMixEarningsDivisor: 3,
  formatMixPunchShareCap: 0.6,
  formatMixPunchMinItems: 3,
  tiktokShortMinItems: 5,
  tiktokNearlyEligibleSec: 40,
  cadenceMinPrevPerWeek: 0.75,
  cadenceDropRatio: 0.7,
  staleMinDays: 14,
  staleGapMultiple: 3,
  staleMinCount: 3,
  irregularMinDays: 10,
  irregularMinCount: 6,
  timingMinCount: 3,
  timingMinLift: 1.25,
  timingMinSpread: 1.4,
  durationMinCount: 3,
  durationMinLift: 1.5,
  gemMinItems: 8,
  gemPercentile: 0.9,
  concentrationMinItems: 10,
  concentrationTopFraction: 0.1,
  concentrationShare: 0.5,
  communityShare: 0.7,
  rankMinCount: 3,
  rankListSize: 5,
  underperformerGraceDays: 3,
};

export interface AnalyzeInput {
  items: EstimatedItem[];
  snapshots: Partial<Record<Platform, ChannelSnapshot>>;
  windowDays: number;
  now?: Date;
  /** IANA time zone for weekday analysis (default UTC). */
  timeZone?: string;
  thresholds?: Partial<InsightThresholds>;
}

/* ------------------------------------------------------------------ */
/* Stats helpers                                                       */
/* ------------------------------------------------------------------ */

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function change(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

function engagementRate(item: ContentItem): number {
  if (item.views <= 0) return 0;
  return ((item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0)) / item.views;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

/** 0–6 (Sunday first) for an instant, in the creator's time zone. */
function weekdayIn(iso: string, timeZone: string): number {
  let f = weekdayFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone });
    weekdayFormatters.set(timeZone, f);
  }
  const idx = WEEKDAYS_SHORT.indexOf(f.format(new Date(iso)));
  return idx === -1 ? new Date(iso).getUTCDay() : idx;
}

const DURATION_BUCKETS: Record<ContentKind, { label: string; max: number }[]> = {
  short: [
    { label: "under 15 s", max: 15 },
    { label: "15–30 s", max: 30 },
    { label: "30–60 s", max: 60 },
    { label: "60 s+", max: Infinity },
  ],
  video: [
    { label: "under 5 min", max: 300 },
    { label: "5–10 min", max: 600 },
    { label: "10–20 min", max: 1200 },
    { label: "20 min+", max: Infinity },
  ],
  live: [
    { label: "under 2 h", max: 7200 },
    { label: "2–4 h", max: 14400 },
    { label: "4 h+", max: Infinity },
  ],
};

function bucketFor(kind: ContentKind, durationSec: number): string {
  return DURATION_BUCKETS[kind].find((b) => durationSec < b.max)?.label ?? "other";
}

function groupBy<T, K extends string | number>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const times = (x: number) => `${x.toFixed(1)}×`;
const kindPlural = (kind: ContentKind) => (kind === "live" ? "live streams" : `${CONTENT_KIND_LABEL[kind].toLowerCase()}s`);

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

export function analyze(input: AnalyzeInput): InsightReport {
  const now = input.now ?? new Date();
  const { windowDays } = input;
  const timeZone = input.timeZone ?? "UTC";
  const t: InsightThresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const windowStart = now.getTime() - windowDays * 86_400_000;
  const prevStart = now.getTime() - 2 * windowDays * 86_400_000;

  const all = input.items.filter((e) => new Date(e.item.publishedAt).getTime() <= now.getTime());
  const current = all.filter((e) => new Date(e.item.publishedAt).getTime() >= windowStart);
  const previous = all.filter((e) => {
    const t = new Date(e.item.publishedAt).getTime();
    return t >= prevStart && t < windowStart;
  });

  /* Baselines per platform + kind (use the whole window) */
  const baselines: Baseline[] = [];
  const baselineKey = (e: EstimatedItem) => `${e.item.platform}:${e.item.kind}` as const;
  for (const [, group] of groupBy(current, baselineKey)) {
    const views = group.map((e) => e.item.views);
    baselines.push({
      platform: group[0].item.platform,
      kind: group[0].item.kind,
      count: group.length,
      medianViews: median(views),
      p25Views: percentile(views, 0.25),
      p75Views: percentile(views, 0.75),
      medianEngagement: median(group.map((e) => engagementRate(e.item))),
      medianEarningsMid: median(group.map((e) => e.estimate.mid)),
    });
  }
  const baselineOf = (platform: Platform, kind: ContentKind) =>
    baselines.find((b) => b.platform === platform && b.kind === kind);

  /* Score each item vs its baseline */
  const scored: ScoredItem[] = current.map((e) => {
    const b = baselineOf(e.item.platform, e.item.kind);
    return {
      id: e.item.id,
      platform: e.item.platform,
      kind: e.item.kind,
      title: e.item.title,
      url: e.item.url,
      publishedAt: e.item.publishedAt,
      durationSec: e.item.durationSec,
      views: e.item.views,
      engagementRate: engagementRate(e.item),
      earningsMid: e.estimate.mid,
      viewsVsBaseline: b && b.medianViews > 0 ? e.item.views / b.medianViews : 1,
      earningsVsBaseline: b && b.medianEarningsMid > 0 ? e.estimate.mid / b.medianEarningsMid : 1,
    };
  });
  const rankable = scored.filter((s) => (baselineOf(s.platform, s.kind)?.count ?? 0) >= t.rankMinCount);
  const topPerformers = [...rankable].sort((a, b) => b.viewsVsBaseline - a.viewsVsBaseline).slice(0, t.rankListSize);
  const underperformers = [...rankable]
    .filter((s) => new Date(s.publishedAt).getTime() < now.getTime() - t.underperformerGraceDays * 86_400_000) // give new uploads time
    .sort((a, b) => a.viewsVsBaseline - b.viewsVsBaseline)
    .slice(0, t.rankListSize);

  /* Cadence */
  const cadence: CadenceStat[] = [];
  for (const [key, group] of groupBy(current, baselineKey)) {
    const times = group.map((e) => new Date(e.item.publishedAt).getTime()).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 86_400_000);
    const prevCount = previous.filter((e) => baselineKey(e) === key).length;
    cadence.push({
      platform: group[0].item.platform,
      kind: group[0].item.kind,
      count: group.length,
      perWeek: group.length / (windowDays / 7),
      prevPerWeek: prevCount / (windowDays / 7),
      medianGapDays: median(gaps),
      longestGapDays: gaps.length ? Math.max(...gaps) : 0,
      daysSinceLast: (now.getTime() - times[times.length - 1]) / 86_400_000,
    });
  }

  /* Timing: weekday lift per platform + kind (UTC weekday) */
  const timing: TimingStat[] = [];
  for (const [, group] of groupBy(current, baselineKey)) {
    const kindMedian = median(group.map((e) => e.item.views));
    for (const [weekday, dayGroup] of groupBy(group, (e) => weekdayIn(e.item.publishedAt, timeZone))) {
      const medianViews = median(dayGroup.map((e) => e.item.views));
      timing.push({
        platform: group[0].item.platform,
        kind: group[0].item.kind,
        weekday,
        label: WEEKDAYS[weekday],
        count: dayGroup.length,
        medianViews,
        lift: kindMedian > 0 ? medianViews / kindMedian : 1,
      });
    }
  }
  timing.sort(
    (a, b) => a.platform.localeCompare(b.platform) || a.kind.localeCompare(b.kind) || a.weekday - b.weekday,
  );

  /* Duration buckets */
  const durationBuckets: DurationBucketStat[] = [];
  for (const [, group] of groupBy(current, (e) => `${baselineKey(e)}:${bucketFor(e.item.kind, e.item.durationSec)}`)) {
    const { platform, kind } = group[0].item;
    const base = baselineOf(platform, kind);
    const medianEarningsMid = median(group.map((e) => e.estimate.mid));
    durationBuckets.push({
      platform,
      kind,
      bucket: bucketFor(kind, group[0].item.durationSec),
      count: group.length,
      medianViews: median(group.map((e) => e.item.views)),
      medianEarningsMid,
      earningsLift: base && base.medianEarningsMid > 0 ? medianEarningsMid / base.medianEarningsMid : 1,
    });
  }

  /* Format mix per platform */
  const formatMix: FormatMixStat[] = [];
  for (const [platform, group] of groupBy(current, (e) => e.item.platform)) {
    const totalViews = sum(group.map((e) => e.item.views));
    const totalEarnings = sum(group.map((e) => e.estimate.mid));
    for (const [kind, kindGroup] of groupBy(group, (e) => e.item.kind)) {
      const earnings = sum(kindGroup.map((e) => e.estimate.mid));
      formatMix.push({
        platform,
        kind,
        items: kindGroup.length,
        shareOfItems: kindGroup.length / group.length,
        shareOfViews: totalViews > 0 ? sum(kindGroup.map((e) => e.item.views)) / totalViews : 0,
        shareOfEarnings: totalEarnings > 0 ? earnings / totalEarnings : 0,
        earningsPerItemMid: earnings / kindGroup.length,
      });
    }
  }

  /* Totals */
  const byPlatform: PlatformTotals[] = [];
  for (const [platform, group] of groupBy(current, (e) => e.item.platform)) {
    const bySource: Partial<Record<RevenueSource, EstimateRange>> = {};
    for (const e of group) {
      for (const line of e.estimate.breakdown) {
        bySource[line.source] = addRange(bySource[line.source] ?? ZERO, line);
      }
    }
    byPlatform.push({
      platform,
      items: group.length,
      views: sum(group.map((e) => e.item.views)),
      earnings: sumRanges(Object.values(bySource)),
      bySource,
      followers: input.snapshots[platform]?.followers,
    });
  }
  byPlatform.sort((a, b) => b.earnings.mid - a.earnings.mid);

  const growth = {
    viewsCurrent: sum(current.map((e) => e.item.views)),
    viewsPrevious: sum(previous.map((e) => e.item.views)),
    viewsChange: null as number | null,
    earningsCurrentMid: sum(current.map((e) => e.estimate.mid)),
    earningsPreviousMid: sum(previous.map((e) => e.estimate.mid)),
    earningsChange: null as number | null,
    itemsCurrent: current.length,
    itemsPrevious: previous.length,
  };
  growth.viewsChange = change(growth.viewsCurrent, growth.viewsPrevious);
  growth.earningsChange = change(growth.earningsCurrentMid, growth.earningsPreviousMid);

  const findings = buildFindings({
    now,
    windowDays,
    current,
    scored,
    baselines,
    cadence,
    timing,
    durationBuckets,
    formatMix,
    growth,
    byPlatform,
    snapshots: input.snapshots,
    t,
  });

  return {
    generatedAt: now.toISOString(),
    windowDays,
    totals: {
      items: current.length,
      views: growth.viewsCurrent,
      earnings: sumRanges(byPlatform.map((p) => p.earnings)),
      byPlatform,
    },
    growth,
    baselines,
    topPerformers,
    underperformers,
    cadence,
    timing,
    durationBuckets,
    formatMix,
    findings,
  };
}

/* ------------------------------------------------------------------ */
/* Rule-based findings                                                 */
/* ------------------------------------------------------------------ */

interface FindingContext {
  now: Date;
  windowDays: number;
  current: EstimatedItem[];
  scored: ScoredItem[];
  baselines: Baseline[];
  cadence: CadenceStat[];
  timing: TimingStat[];
  durationBuckets: DurationBucketStat[];
  formatMix: FormatMixStat[];
  growth: InsightReport["growth"];
  byPlatform: PlatformTotals[];
  snapshots: Partial<Record<Platform, ChannelSnapshot>>;
  t: InsightThresholds;
}

function buildFindings(ctx: FindingContext): Finding[] {
  const drafts: Omit<Finding, "id">[] = [];
  const add = (f: Omit<Finding, "id">) => drafts.push(f);
  const { t } = ctx;

  /* Growth window over window */
  if (ctx.growth.viewsChange !== null && ctx.growth.itemsPrevious >= t.rankMinCount) {
    const c = ctx.growth.viewsChange;
    if (Math.abs(c) >= t.growthChange) {
      add({
        type: "growth",
        severity: c > 0 ? "positive" : "warning",
        title: `Views ${c > 0 ? "up" : "down"} ${pct(Math.abs(c))} versus the previous ${ctx.windowDays} days`,
        detail: `Content published in the last ${ctx.windowDays} days has ${ctx.growth.viewsCurrent.toLocaleString()} views versus ${ctx.growth.viewsPrevious.toLocaleString()} for the period before. Older content has had longer to accumulate views, so a flat result still means recent uploads are doing better.`,
        metrics: {
          viewsCurrent: ctx.growth.viewsCurrent,
          viewsPrevious: ctx.growth.viewsPrevious,
          change: c,
          itemsCurrent: ctx.growth.itemsCurrent,
          itemsPrevious: ctx.growth.itemsPrevious,
        },
      });
    }
  }

  /* Format mix: effort vs earnings imbalance */
  for (const [platform, mix] of groupBy(ctx.formatMix, (m) => m.platform)) {
    const totalItems = sum(mix.map((m) => m.items));
    if (mix.length < 2 || totalItems < t.formatMixMinItems) continue;
    for (const m of mix) {
      // TikTok shorts can't earn by rule; the dedicated monetisation finding covers them.
      if (platform === "tiktok" && m.kind === "short") continue;
      if (m.shareOfItems >= t.formatMixDominantShare && m.shareOfEarnings <= m.shareOfItems / t.formatMixEarningsDivisor) {
        add({
          type: "format_mix",
          severity: "opportunity",
          platform,
          title: `${CONTENT_KIND_LABEL[m.kind]}s are ${pct(m.shareOfItems)} of your ${PLATFORM_LABEL[platform]} output but ${pct(m.shareOfEarnings)} of estimated earnings`,
          detail: `${m.items} ${kindPlural(m.kind)} earn about $${m.earningsPerItemMid.toFixed(2)} each on ${PLATFORM_LABEL[platform]}. They may still drive discovery (${pct(m.shareOfViews)} of views), so the question is whether they convert viewers to the formats that pay.`,
          metrics: {
            kind: m.kind,
            items: m.items,
            shareOfItems: m.shareOfItems,
            shareOfViews: m.shareOfViews,
            shareOfEarnings: m.shareOfEarnings,
            earningsPerItem: m.earningsPerItemMid,
          },
        });
      } else if (
        m.shareOfItems <= t.formatMixDominantShare &&
        m.shareOfEarnings >= Math.min(t.formatMixPunchShareCap, m.shareOfItems * 2) &&
        m.items >= t.formatMixPunchMinItems
      ) {
        add({
          type: "format_mix",
          severity: "positive",
          platform,
          title: `${CONTENT_KIND_LABEL[m.kind]}s punch above their weight on ${PLATFORM_LABEL[platform]}`,
          detail: `Only ${pct(m.shareOfItems)} of uploads but ${pct(m.shareOfEarnings)} of estimated earnings (about $${m.earningsPerItemMid.toFixed(2)} per upload).`,
          metrics: {
            kind: m.kind,
            items: m.items,
            shareOfItems: m.shareOfItems,
            shareOfEarnings: m.shareOfEarnings,
            earningsPerItem: m.earningsPerItemMid,
          },
        });
      }
    }
  }

  /* TikTok under-60s videos with strong views earn nothing */
  const tiktokShorts = ctx.current.filter((e) => e.item.platform === "tiktok" && e.item.kind === "short");
  if (tiktokShorts.length >= t.tiktokShortMinItems) {
    const views = sum(tiktokShorts.map((e) => e.item.views));
    const strong = tiktokShorts.filter((e) => e.item.durationSec >= t.tiktokNearlyEligibleSec).length;
    add({
      type: "monetization",
      severity: "opportunity",
      platform: "tiktok",
      title: `${tiktokShorts.length} TikToks under one minute collected ${views.toLocaleString()} views but are ineligible for Creator Rewards`,
      detail: `${strong} of them already run ${t.tiktokNearlyEligibleSec} s or longer. Stretching those formats past 60 s (a slower payoff, a second example, a short CTA) would make the same views payable.`,
      metrics: { items: tiktokShorts.length, views, nearlyEligible: strong },
    });
  }

  /* Cadence */
  for (const c of ctx.cadence) {
    const what = `${PLATFORM_LABEL[c.platform]} ${kindPlural(c.kind)}`;
    if (c.prevPerWeek >= t.cadenceMinPrevPerWeek && c.perWeek <= c.prevPerWeek * t.cadenceDropRatio) {
      add({
        type: "cadence",
        severity: "warning",
        platform: c.platform,
        title: `${what}: cadence dropped from ${c.prevPerWeek.toFixed(1)} to ${c.perWeek.toFixed(1)} per week`,
        detail: `Fewer uploads compound: each one feeds the recommendation systems that surface the next. Decide whether the slower pace is deliberate.`,
        metrics: { perWeek: c.perWeek, prevPerWeek: c.prevPerWeek, kind: c.kind },
      });
    }
    const staleAfter = Math.max(t.staleMinDays, c.medianGapDays * t.staleGapMultiple);
    if (c.count >= t.staleMinCount && c.daysSinceLast > staleAfter) {
      add({
        type: "cadence",
        severity: "warning",
        platform: c.platform,
        title: `No ${what} in ${Math.floor(c.daysSinceLast)} days`,
        detail: `Your typical gap is ${c.medianGapDays.toFixed(1)} days. A gap this long usually shows up as a dip in impressions for the next upload.`,
        metrics: { daysSinceLast: c.daysSinceLast, medianGapDays: c.medianGapDays, kind: c.kind },
      });
    } else if (
      c.count >= t.irregularMinCount &&
      c.longestGapDays >= Math.max(t.irregularMinDays, c.medianGapDays * t.staleGapMultiple)
    ) {
      add({
        type: "cadence",
        severity: "info",
        platform: c.platform,
        title: `${what}: longest gap was ${Math.round(c.longestGapDays)} days against a typical ${c.medianGapDays.toFixed(1)}`,
        detail: `Irregular schedules make it harder for subscribers to form a habit. A buffer of finished content smooths this out.`,
        metrics: { longestGapDays: c.longestGapDays, medianGapDays: c.medianGapDays, kind: c.kind },
      });
    }
  }

  /* Timing */
  for (const [, days] of groupBy(ctx.timing, (t) => `${t.platform}:${t.kind}`)) {
    const eligible = days.filter((d) => d.count >= t.timingMinCount);
    if (eligible.length < 2) continue;
    const best = [...eligible].sort((a, b) => b.lift - a.lift)[0];
    const worst = [...eligible].sort((a, b) => a.lift - b.lift)[0];
    if (best.lift >= t.timingMinLift && best.lift / Math.max(worst.lift, 0.01) >= t.timingMinSpread) {
      add({
        type: "timing",
        severity: "opportunity",
        platform: best.platform,
        title: `${best.label} ${kindPlural(best.kind)} on ${PLATFORM_LABEL[best.platform]} get ${times(best.lift)} the median views`,
        detail: `${best.count} uploads on ${best.label}s reached a median of ${Math.round(best.medianViews).toLocaleString()} views, versus ${times(worst.lift)} the median on ${worst.label}s (${worst.count} uploads). Small samples: treat as a hypothesis to test, not a rule.`,
        metrics: {
          kind: best.kind,
          bestDay: best.label,
          bestLift: best.lift,
          bestCount: best.count,
          worstDay: worst.label,
          worstLift: worst.lift,
          worstCount: worst.count,
        },
      });
    }
  }

  /* Duration sweet spots */
  for (const [, buckets] of groupBy(ctx.durationBuckets, (d) => `${d.platform}:${d.kind}`)) {
    const eligible = buckets.filter((b) => b.count >= t.durationMinCount);
    if (eligible.length < 2) continue;
    const best = [...eligible].sort((a, b) => b.earningsLift - a.earningsLift)[0];
    if (best.earningsLift >= t.durationMinLift && best.medianEarningsMid > 0) {
      add({
        type: "duration",
        severity: "opportunity",
        platform: best.platform,
        title: `${PLATFORM_LABEL[best.platform]} ${kindPlural(best.kind)} of ${best.bucket} earn ${times(best.earningsLift)} the median`,
        detail: `${best.count} uploads in that length band have a median estimated earning of $${best.medianEarningsMid.toFixed(2)} and ${Math.round(best.medianViews).toLocaleString()} median views.`,
        metrics: {
          kind: best.kind,
          bucket: best.bucket,
          count: best.count,
          earningsLift: best.earningsLift,
          medianViews: best.medianViews,
        },
      });
    }
  }

  /* Hidden gems: high engagement, low reach */
  for (const [key, group] of groupBy(ctx.scored, (s) => `${s.platform}:${s.kind}`)) {
    if (group.length < t.gemMinItems) continue;
    const p90 = percentile(group.map((s) => s.engagementRate), t.gemPercentile);
    const medViews = median(group.map((s) => s.views));
    const gems = group.filter((s) => s.engagementRate >= p90 && s.views < medViews && s.engagementRate > 0);
    if (gems.length === 0) continue;
    const [platform, kind] = key.split(":") as [Platform, ContentKind];
    add({
      type: "engagement",
      severity: "opportunity",
      platform,
      title: `${gems.length} ${PLATFORM_LABEL[platform]} ${kindPlural(kind)} resonated hard with a small audience`,
      detail: `Top-decile engagement (≥ ${(p90 * 100).toFixed(1)}% likes+comments per view) but below-median reach: ${gems
        .slice(0, 3)
        .map((g) => `“${g.title}”`)
        .join(", ")}. Candidates for a re-cut, a follow-up, or cross-posting.`,
      metrics: { count: gems.length, engagementThreshold: p90, titles: gems.slice(0, 5).map((g) => g.title).join(" | ") },
    });
  }

  /* Hit concentration */
  for (const [platform, group] of groupBy(ctx.scored, (s) => s.platform)) {
    if (group.length < t.concentrationMinItems) continue;
    const sorted = [...group].sort((a, b) => b.views - a.views);
    const topN = Math.max(1, Math.round(group.length * t.concentrationTopFraction));
    const total = sum(group.map((s) => s.views));
    const topShare = total > 0 ? sum(sorted.slice(0, topN).map((s) => s.views)) / total : 0;
    if (topShare >= t.concentrationShare) {
      add({
        type: "concentration",
        severity: "info",
        platform,
        title: `Your top ${topN} ${PLATFORM_LABEL[platform]} uploads drove ${pct(topShare)} of views`,
        detail: `A hit-driven channel. The outliers tell you what the algorithm already likes: ${sorted
          .slice(0, 3)
          .map((s) => `“${s.title}”`)
          .join(", ")}.`,
        metrics: { topN, topShare, titles: sorted.slice(0, 5).map((s) => s.title).join(" | ") },
      });
    }
  }

  /* Twitch revenue mix */
  const twitch = ctx.byPlatform.find((p) => p.platform === "twitch");
  if (twitch && twitch.earnings.mid > 0) {
    const community = (twitch.bySource.subs?.mid ?? 0) + (twitch.bySource.bits?.mid ?? 0);
    const share = community / twitch.earnings.mid;
    if (share >= t.communityShare) {
      add({
        type: "monetization",
        severity: "info",
        platform: "twitch",
        title: `${pct(share)} of Twitch earnings come from subs and Bits`,
        detail: `Community funding dominates, so growth levers are sub goals, gifted-sub moments and Bit incentives more than raw viewer counts.`,
        metrics: { communityShare: share, subsMid: twitch.bySource.subs?.mid ?? 0, bitsMid: twitch.bySource.bits?.mid ?? 0 },
      });
    }
  }

  /* YouTube monetary scope hint */
  const yt = ctx.snapshots.youtube;
  if (yt && yt.reportedRevenueUsdInWindow === undefined && ctx.byPlatform.some((p) => p.platform === "youtube")) {
    add({
      type: "monetization",
      severity: "info",
      platform: "youtube",
      title: "YouTube earnings are modelled, not reported",
      detail: "Reconnect YouTube with the Analytics monetary scope to replace RPM estimates with the revenue YouTube actually reports per video.",
      metrics: {},
    });
  }

  // Number the findings in display order (most urgent first) so the ids the
  // coach cites match what the reader sees top to bottom.
  const order: Record<FindingSeverity, number> = { warning: 0, opportunity: 1, positive: 2, info: 3 };
  return drafts
    .map((f, i) => ({ f, i }))
    .sort((a, b) => order[a.f.severity] - order[b.f.severity] || a.i - b.i)
    .map(({ f }, i) => ({ id: `F${i + 1}`, ...f }));
}
