import type { ChannelSnapshot, ContentItem, Platform } from "@/lib/platforms/types";
import type { RateRange, Rates } from "./rates";

/**
 * Earnings estimation.
 *
 * Pure functions: no I/O, so the whole model is unit-testable and can run in
 * both server components and tests.
 *
 * Three kinds of numbers come out of here and the UI labels them honestly:
 *  - reported:   the platform told us the figure (YouTube Analytics revenue).
 *  - calibrated: modelled per item, then scaled so the channel total matches a
 *                reported channel-level figure.
 *  - modeled:    views × RPM style estimate from the rate assumptions.
 */

export type RevenueSource = "ads" | "subs" | "bits" | "creator_rewards";

export const REVENUE_SOURCE_LABEL: Record<RevenueSource, string> = {
  ads: "Ads",
  subs: "Subscriptions",
  bits: "Bits",
  creator_rewards: "Creator Rewards",
};

export type EstimateRange = RateRange;

export type EstimateBasis = "reported" | "calibrated" | "modeled" | "none";

export interface BreakdownLine extends EstimateRange {
  source: RevenueSource;
  label: string;
}

export interface EarningsEstimate extends EstimateRange {
  basis: EstimateBasis;
  breakdown: BreakdownLine[];
  notes: string[];
}

export interface EstimatedItem {
  item: ContentItem;
  estimate: EarningsEstimate;
}

export interface ChannelEarnings {
  platform: Platform;
  windowDays: number;
  total: EstimateRange;
  bySource: Partial<Record<RevenueSource, EstimateRange>>;
  basis: EstimateBasis;
  notes: string[];
}

/** Tunables for scaling modelled items to a reported channel total. */
export interface CalibrationTuning {
  /** Lower bound on the scale factor, guarding against a near-zero modelled sum. */
  minFactor: number;
  /** Upper bound on the scale factor. */
  maxFactor: number;
  /** Width of the low/high band around a calibrated mid (0.3 = ±30%). */
  band: number;
}

export const DEFAULT_CALIBRATION: CalibrationTuning = { minFactor: 0.2, maxFactor: 5, band: 0.3 };

/** Average Gregorian month, used to turn monthly subscription income into a window figure. */
export const DAYS_PER_MONTH = 365.25 / 12;

/** A real payout the creator entered (YouTube Studio, Twitch payout, TikTok Rewards…). */
export interface PayoutReport {
  id: number;
  platform: Platform;
  /** Inclusive ISO dates (YYYY-MM-DD) of the period the payout covers. */
  periodStart: string;
  periodEnd: string;
  amountUsd: number;
  source: string;
  note: string | null;
}

/** How a platform's model was rescaled to match the creator's real payouts. */
export interface PayoutCalibration {
  platform: Platform;
  factor: number;
  reportedUsd: number;
  modeledUsd: number;
  /** Reports that could be matched to modelled content. */
  reports: number;
  /** Reports skipped because no modelled content fell in their period. */
  skipped: number;
  /** ± band applied around the calibrated mid. */
  band: number;
  /** Why nothing was rescaled, when `reports` is 0. */
  reason?: string;
}

export interface EstimateOptions {
  windowDays: number;
  now?: Date;
  calibration?: Partial<CalibrationTuning>;
  /** Real payouts to calibrate the per-platform model against. */
  payoutReports?: PayoutReport[];
}

export interface EstimateOutput {
  items: EstimatedItem[];
  channels: Partial<Record<Platform, ChannelEarnings>>;
  calibration: Partial<Record<Platform, PayoutCalibration>>;
}

export const ZERO: EstimateRange = { low: 0, mid: 0, high: 0 };

export function addRange(a: EstimateRange, b: EstimateRange): EstimateRange {
  return { low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high };
}

export function scaleRange(r: EstimateRange, k: number): EstimateRange {
  return { low: r.low * k, mid: r.mid * k, high: r.high * k };
}

export function sumRanges(rs: EstimateRange[]): EstimateRange {
  return rs.reduce(addRange, ZERO);
}

function exact(value: number): EstimateRange {
  return { low: value, mid: value, high: value };
}

function withinWindow(item: ContentItem, now: Date, windowDays: number): boolean {
  const t = new Date(item.publishedAt).getTime();
  return t <= now.getTime() && t >= now.getTime() - windowDays * 86_400_000;
}

/* ------------------------------------------------------------------ */
/* Per-item models                                                     */
/* ------------------------------------------------------------------ */

function youtubeItem(item: ContentItem, rates: Rates): EarningsEstimate {
  if (item.reportedRevenueUsd !== undefined) {
    const r = exact(item.reportedRevenueUsd);
    return {
      ...r,
      basis: "reported",
      breakdown: [{ source: "ads", label: "Reported revenue", ...r }],
      notes: ["Figure reported by YouTube Analytics."],
    };
  }
  const rpm =
    item.kind === "short"
      ? rates["youtube.short.rpm"]
      : item.kind === "live"
        ? rates["youtube.live.rpm"]
        : rates["youtube.video.rpm"];
  const thousands = item.views / 1000;
  const ads = scaleRange(rpm, thousands);
  const notes = [`Modelled as ${item.views.toLocaleString()} views × ${item.kind} RPM.`];
  if (item.kind === "live") {
    notes.push("Super Chat, Super Stickers and memberships are not included.");
  }
  return { ...ads, basis: "modeled", breakdown: [{ source: "ads", label: "Ad revenue", ...ads }], notes };
}

function tiktokItem(item: ContentItem, rates: Rates): EarningsEstimate {
  if (item.kind === "live") {
    return {
      ...ZERO,
      basis: "none",
      breakdown: [],
      notes: ["TikTok LIVE gifts are not exposed by the API, so LIVE earnings cannot be estimated."],
    };
  }
  if (item.durationSec < 60) {
    return {
      ...ZERO,
      basis: "none",
      breakdown: [],
      notes: ["Under one minute: not eligible for the Creator Rewards Program."],
    };
  }
  const qualified = rates["tiktok.qualified_view_ratio"];
  const rpm = rates["tiktok.video.rpm"];
  const rewards: EstimateRange = {
    low: (item.views * qualified.low * rpm.low) / 1000,
    mid: (item.views * qualified.mid * rpm.mid) / 1000,
    high: (item.views * qualified.high * rpm.high) / 1000,
  };
  return {
    ...rewards,
    basis: "modeled",
    breakdown: [{ source: "creator_rewards", label: "Creator Rewards", ...rewards }],
    notes: [
      `Modelled as ${item.views.toLocaleString()} views × qualified-view ratio × Creator Rewards RPM.`,
    ],
  };
}

/**
 * Concurrent-viewer hours for a Twitch broadcast. Helix exposes VOD view
 * counts but not historical concurrency, so without live samples we assume a
 * VOD viewer watches `watchFraction` of the broadcast (rate
 * "twitch.vod.watch_fraction").
 */
export function twitchViewerHours(
  item: ContentItem,
  watchFraction = DEFAULT_VOD_WATCH_FRACTION,
): { hours: number; approximated: boolean } {
  const durationHours = item.durationSec / 3600;
  if (item.avgViewers !== undefined && item.avgViewers > 0) {
    return { hours: item.avgViewers * durationHours, approximated: false };
  }
  return { hours: item.views * durationHours * watchFraction, approximated: true };
}

const DEFAULT_VOD_WATCH_FRACTION = 0.2;

function twitchItem(item: ContentItem, rates: Rates): EarningsEstimate {
  const { hours, approximated } = twitchViewerHours(item, rates["twitch.vod.watch_fraction"].mid);
  const impressions = rates["twitch.ad.impressions_per_viewer_hour"];
  const cpm = rates["twitch.ad.cpm"];
  const ads: EstimateRange = {
    low: (hours * impressions.low * cpm.low) / 1000,
    mid: (hours * impressions.mid * cpm.mid) / 1000,
    high: (hours * impressions.high * cpm.high) / 1000,
  };
  const notes = [
    `Ad revenue modelled from ${Math.round(hours).toLocaleString()} viewer-hours.`,
  ];
  if (approximated) {
    notes.push("Concurrent viewers were unavailable, so viewer-hours were approximated from VOD views.");
  }
  return { ...ads, basis: "modeled", breakdown: [{ source: "ads", label: "Ad revenue", ...ads }], notes };
}

export function estimateItem(item: ContentItem, rates: Rates): EarningsEstimate {
  switch (item.platform) {
    case "youtube":
      return youtubeItem(item, rates);
    case "tiktok":
      return tiktokItem(item, rates);
    case "twitch":
      return twitchItem(item, rates);
  }
}

/* ------------------------------------------------------------------ */
/* Channel-level adjustments                                           */
/* ------------------------------------------------------------------ */

/** Monthly Twitch subscription revenue from a snapshot. */
export function twitchMonthlySubs(snapshot: ChannelSnapshot, rates: Rates): EstimateRange {
  if (!snapshot.subs) return ZERO;
  const gross =
    snapshot.subs.tier1 * rates["twitch.sub.tier1_price"].mid +
    snapshot.subs.tier2 * rates["twitch.sub.tier2_price"].mid +
    snapshot.subs.tier3 * rates["twitch.sub.tier3_price"].mid;
  const share = rates["twitch.sub.creator_share"];
  return { low: gross * share.low, mid: gross * share.mid, high: gross * share.high };
}

/**
 * Twitch subs and Bits are channel-level, not per stream. We attribute the
 * window's total to each stream in proportion to its viewer-hours so that
 * per-stream rows add up to the channel figure.
 */
function allocateTwitch(
  estimated: EstimatedItem[],
  snapshot: ChannelSnapshot | undefined,
  rates: Rates,
  windowDays: number,
  now: Date,
): void {
  if (!snapshot) return;
  const inWindow = estimated.filter(
    (e) => e.item.platform === "twitch" && e.item.kind === "live" && withinWindow(e.item, now, windowDays),
  );
  if (inWindow.length === 0) return;

  const monthly = twitchMonthlySubs(snapshot, rates);
  const subsWindow = scaleRange(monthly, windowDays / DAYS_PER_MONTH);
  const bitsWindow =
    snapshot.bitsInWindow !== undefined
      ? exact(
          snapshot.bitsInWindow *
            rates["twitch.bits.usd_per_bit"].mid *
            (windowDays / (snapshot.windowDays ?? windowDays)),
        )
      : ZERO;

  const watchFraction = rates["twitch.vod.watch_fraction"].mid;
  const hours = inWindow.map((e) => twitchViewerHours(e.item, watchFraction).hours);
  const totalHours = hours.reduce((a, b) => a + b, 0);
  inWindow.forEach((e, i) => {
    const share = totalHours > 0 ? hours[i] / totalHours : 1 / inWindow.length;
    const subs = scaleRange(subsWindow, share);
    const bits = scaleRange(bitsWindow, share);
    if (subs.mid > 0) {
      e.estimate.breakdown.push({ source: "subs", label: "Subscriptions (allocated)", ...subs });
    }
    if (bits.mid > 0) {
      e.estimate.breakdown.push({ source: "bits", label: "Bits (allocated)", ...bits });
    }
    const total = sumRanges(e.estimate.breakdown);
    e.estimate.low = total.low;
    e.estimate.mid = total.mid;
    e.estimate.high = total.high;
    e.estimate.notes.push(
      `Subs and Bits are channel-level; ${(share * 100).toFixed(1)}% of the window's total was allocated to this stream by viewer-hours.`,
    );
  });
}

/**
 * If YouTube reported a channel-level revenue total for the window, scale the
 * modelled items so that reported + modelled adds up to that total.
 */
function calibrateYoutube(
  estimated: EstimatedItem[],
  snapshot: ChannelSnapshot | undefined,
  windowDays: number,
  now: Date,
  tuning: CalibrationTuning,
): void {
  const reportedTotal = snapshot?.reportedRevenueUsdInWindow;
  if (reportedTotal === undefined) return;
  if (snapshot?.windowDays !== undefined && snapshot.windowDays !== windowDays) return;

  const inWindow = estimated.filter(
    (e) => e.item.platform === "youtube" && withinWindow(e.item, now, windowDays),
  );
  const reportedSum = inWindow
    .filter((e) => e.estimate.basis === "reported")
    .reduce((s, e) => s + e.estimate.mid, 0);
  const modeled = inWindow.filter((e) => e.estimate.basis === "modeled");
  const modeledSum = modeled.reduce((s, e) => s + e.estimate.mid, 0);
  const remainder = reportedTotal - reportedSum;
  if (modeled.length === 0 || modeledSum <= 0 || remainder <= 0) return;

  const factor = Math.min(tuning.maxFactor, Math.max(tuning.minFactor, remainder / modeledSum));
  const lowK = 1 - tuning.band;
  const highK = 1 + tuning.band;
  for (const e of modeled) {
    const mid = e.estimate.mid * factor;
    e.estimate.mid = mid;
    e.estimate.low = mid * lowK;
    e.estimate.high = mid * highK;
    e.estimate.basis = "calibrated";
    e.estimate.breakdown = e.estimate.breakdown.map((b) => ({
      ...b,
      mid: b.mid * factor,
      low: b.mid * factor * lowK,
      high: b.mid * factor * highK,
    }));
    e.estimate.notes.push(
      `Scaled ×${factor.toFixed(2)} so the channel total matches YouTube's reported revenue for the period.`,
    );
  }
}

/** Scale one estimate's mid by `factor` and rebuild the band around it. */
function rescale(e: EarningsEstimate, factor: number, band: number): void {
  const mid = e.mid * factor;
  e.mid = mid;
  e.low = mid * (1 - band);
  e.high = mid * (1 + band);
  e.breakdown = e.breakdown.map((b) => ({ ...b, mid: b.mid * factor, low: b.mid * factor * (1 - band), high: b.mid * factor * (1 + band) }));
}

/**
 * Fit one factor per platform from the creator's real payouts: the sum of
 * what they were paid over the sum of what the model says for content
 * published in those periods, then rescale every modelled item on that
 * platform. Items the platform itself reported (or that were already
 * calibrated to a reported channel total) are a better signal and are left
 * alone; their amounts are subtracted from the payout before fitting.
 *
 * Publish date stands in for earning date, so the fit is only as good as
 * the period is long — the Settings page says so.
 */
export function calibrateToPayouts(
  estimated: EstimatedItem[],
  reports: PayoutReport[],
  tuning: CalibrationTuning,
): Partial<Record<Platform, PayoutCalibration>> {
  const out: Partial<Record<Platform, PayoutCalibration>> = {};
  const byPlatform = new Map<Platform, PayoutReport[]>();
  for (const r of reports) byPlatform.set(r.platform, [...(byPlatform.get(r.platform) ?? []), r]);

  for (const [platform, list] of byPlatform) {
    const modeledItems = estimated.filter((e) => e.item.platform === platform && e.estimate.basis === "modeled");
    if (modeledItems.length === 0) {
      const platformItems = estimated.filter((e) => e.item.platform === platform);
      const reason =
        platformItems.length === 0
          ? `No ${PLATFORM_NAME[platform]} uploads are synced yet, so there is nothing to calibrate.`
          : platformItems.some((e) => e.estimate.basis === "reported" || e.estimate.basis === "calibrated")
            ? `${PLATFORM_NAME[platform]} already reports its revenue for this channel, which is more precise than a payout total — the payout is kept for reference.`
            : `${PLATFORM_NAME[platform]} income can't be modelled per upload here, so a payout can't rescale it.`;
      out[platform] = { platform, factor: 1, reportedUsd: 0, modeledUsd: 0, reports: 0, skipped: list.length, band: tuning.band, reason };
      continue;
    }

    let reportedUsd = 0;
    let modeledUsd = 0;
    let matched = 0;
    const factors: number[] = [];
    for (const r of list) {
      const start = new Date(`${r.periodStart}T00:00:00Z`).getTime();
      const end = new Date(`${r.periodEnd}T23:59:59.999Z`).getTime();
      const inPeriod = (e: EstimatedItem) => {
        const t = new Date(e.item.publishedAt).getTime();
        return e.item.platform === platform && t >= start && t <= end;
      };
      const modeled = estimated.filter((e) => inPeriod(e) && e.estimate.basis === "modeled").reduce((s, e) => s + e.estimate.mid, 0);
      const known = estimated.filter((e) => inPeriod(e) && e.estimate.basis !== "modeled").reduce((s, e) => s + e.estimate.mid, 0);
      const remainder = r.amountUsd - known;
      if (modeled <= 0 || remainder <= 0) continue;
      matched++;
      reportedUsd += remainder;
      modeledUsd += modeled;
      factors.push(remainder / modeled);
    }
    if (matched === 0 || modeledUsd <= 0) {
      out[platform] = {
        platform,
        factor: 1,
        reportedUsd: 0,
        modeledUsd: 0,
        reports: 0,
        skipped: list.length,
        band: tuning.band,
        reason: `No modelled ${PLATFORM_NAME[platform]} uploads were published inside the payout period${list.length === 1 ? "" : "s"}, so no factor could be fitted.`,
      };
      continue;
    }

    const factor = Math.min(tuning.maxFactor, Math.max(tuning.minFactor, reportedUsd / modeledUsd));
    // Several payouts that disagree widen the band; one payout keeps the default.
    let band = tuning.band;
    if (factors.length > 1) {
      const mean = factors.reduce((a, b) => a + b, 0) / factors.length;
      const sd = Math.sqrt(factors.reduce((s, f) => s + (f - mean) ** 2, 0) / factors.length);
      band = Math.min(0.5, Math.max(0.15, sd / mean));
    }
    for (const e of modeledItems) {
      rescale(e.estimate, factor, band);
      e.estimate.basis = "calibrated";
      e.estimate.notes.push(
        `Scaled ×${factor.toFixed(2)} to match ${matched} real ${PLATFORM_NAME[platform]} payout${matched === 1 ? "" : "s"} you entered.`,
      );
    }
    out[platform] = { platform, factor, reportedUsd, modeledUsd, reports: matched, skipped: list.length - matched, band };
  }
  return out;
}

const PLATFORM_NAME: Record<Platform, string> = { youtube: "YouTube", twitch: "Twitch", tiktok: "TikTok" };

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function estimateAll(
  items: ContentItem[],
  snapshots: Partial<Record<Platform, ChannelSnapshot>>,
  rates: Rates,
  opts: EstimateOptions,
): EstimateOutput {
  const now = opts.now ?? new Date();
  const estimated: EstimatedItem[] = items.map((item) => ({
    item,
    estimate: estimateItem(item, rates),
  }));

  const tuning: CalibrationTuning = { ...DEFAULT_CALIBRATION, ...opts.calibration };
  allocateTwitch(estimated, snapshots.twitch, rates, opts.windowDays, now);
  calibrateYoutube(estimated, snapshots.youtube, opts.windowDays, now, tuning);
  const calibration = opts.payoutReports?.length ? calibrateToPayouts(estimated, opts.payoutReports, tuning) : {};

  const channels: Partial<Record<Platform, ChannelEarnings>> = {};
  for (const platform of ["youtube", "twitch", "tiktok"] as const) {
    const inWindow = estimated.filter(
      (e) => e.item.platform === platform && withinWindow(e.item, now, opts.windowDays),
    );
    if (inWindow.length === 0 && !snapshots[platform]) continue;

    const bySource: Partial<Record<RevenueSource, EstimateRange>> = {};
    for (const e of inWindow) {
      for (const line of e.estimate.breakdown) {
        bySource[line.source] = addRange(bySource[line.source] ?? ZERO, line);
      }
    }
    const total = sumRanges(Object.values(bySource));
    const bases = new Set(inWindow.map((e) => e.estimate.basis));
    const basis: EstimateBasis = bases.has("modeled")
      ? bases.has("reported") || bases.has("calibrated")
        ? "calibrated"
        : "modeled"
      : bases.has("calibrated")
        ? "calibrated"
        : bases.has("reported")
          ? "reported"
          : "none";

    const notes: string[] = [];
    const cal = calibration[platform];
    if (cal && cal.reports > 0) {
      notes.push(`Calibrated ×${cal.factor.toFixed(2)} to ${cal.reports} real payout${cal.reports === 1 ? "" : "s"} you entered in Settings.`);
    }
    if (platform === "twitch" && !snapshots.twitch?.subs) {
      notes.push("Connect with the subscriptions scope to include sub revenue.");
    }
    if (platform === "youtube" && snapshots.youtube && snapshots.youtube.reportedRevenueUsdInWindow === undefined) {
      notes.push("Grant the YouTube Analytics monetary scope to replace estimates with reported revenue.");
    }
    if (platform === "tiktok") {
      notes.push("TikTok does not expose payouts via API; figures model the Creator Rewards Program only.");
    }

    channels[platform] = { platform, windowDays: opts.windowDays, total, bySource, basis, notes };
  }

  return { items: estimated, channels, calibration };
}
