import type { Platform } from "@/lib/platforms/types";

/**
 * Payout assumptions used by the estimator.
 *
 * Every value has a low / mid / high band because creator payouts vary a lot
 * by niche, audience geography and season. Users can override any band from
 * the Settings page (stored per workspace as "<key>.<band>"), and the UI
 * always shows the range rather than a single false-precision number.
 *
 * Where a platform publishes a fixed figure (a Twitch Bit is worth $0.01 to
 * the streamer; sub tier prices) the band collapses to one value.
 *
 * Defaults were last checked against public sources in October 2026.
 */
export interface RateRange {
  low: number;
  mid: number;
  high: number;
}

export const RATE_KEYS = [
  "youtube.video.rpm",
  "youtube.short.rpm",
  "youtube.live.rpm",
  "twitch.ad.cpm",
  "twitch.ad.impressions_per_viewer_hour",
  "twitch.sub.tier1_price",
  "twitch.sub.tier2_price",
  "twitch.sub.tier3_price",
  "twitch.sub.creator_share",
  "twitch.bits.usd_per_bit",
  "twitch.vod.watch_fraction",
  "tiktok.video.rpm",
  "tiktok.qualified_view_ratio",
] as const;

export type RateKey = (typeof RATE_KEYS)[number];
export type Band = keyof RateRange;
export type Rates = Record<RateKey, RateRange>;

export interface RateDefinition extends RateRange {
  key: RateKey;
  platform: Platform;
  label: string;
  unit: string;
  description: string;
  /** Where the default came from, shown in Settings. */
  source: string;
}

export const RATE_DEFINITIONS: RateDefinition[] = [
  {
    key: "youtube.video.rpm",
    platform: "youtube",
    label: "Long-form RPM",
    unit: "USD per 1,000 views",
    description:
      "What the creator keeps per 1,000 long-form views after YouTube's 45% share of ad revenue. Third-party data puts the typical range at $1–6 with a median near $2.30; education and finance channels report $15+.",
    source: "YouTube Partner Program terms (55% creator share); AIR 2026 RPM study",
    low: 1,
    mid: 2.5,
    high: 8,
  },
  {
    key: "youtube.short.rpm",
    platform: "youtube",
    label: "Shorts RPM",
    unit: "USD per 1,000 views",
    description:
      "Creator payout per 1,000 Shorts views from the Shorts ad pool (creators keep 45% of their allocation). Typically $0.07–0.20 worldwide, around $0.33 for US-heavy audiences.",
    source: "YouTube Shorts monetization policy; AIR 2026 RPM study",
    low: 0.05,
    mid: 0.1,
    high: 0.3,
  },
  {
    key: "youtube.live.rpm",
    platform: "youtube",
    label: "Live / replay RPM",
    unit: "USD per 1,000 views",
    description:
      "Ad revenue per 1,000 views on live streams and their replays. No reliable public benchmark exists, so the band is deliberately wide. Super Chat (70% to the creator), Stickers and memberships are not included because the API does not attribute them to a stream.",
    source: "Estimate; no public benchmark",
    low: 1,
    mid: 2,
    high: 5,
  },
  {
    key: "twitch.ad.cpm",
    platform: "twitch",
    label: "Ad CPM (streamer share)",
    unit: "USD per 1,000 impressions",
    description:
      "What the streamer keeps per 1,000 ad impressions. Twitch pays 55% of net ad revenue; third-party estimates put the streamer's share around $1.75–1.95 per 1,000.",
    source: "Twitch Ads Incentive Program; third-party payout reports",
    low: 1,
    mid: 1.9,
    high: 3.5,
  },
  {
    key: "twitch.ad.impressions_per_viewer_hour",
    platform: "twitch",
    label: "Ad impressions per viewer-hour",
    unit: "impressions",
    description:
      "How many ads each concurrent viewer sees per hour watched. The Ads Incentive Program baseline is 3 ad-minutes per hour; pre-rolls and ad-free subscribers push this up or down.",
    source: "Twitch Ads Incentive Program terms",
    low: 2,
    mid: 4,
    high: 6,
  },
  {
    key: "twitch.sub.tier1_price",
    platform: "twitch",
    label: "Tier 1 sub price",
    unit: "USD / month",
    description: "Gross monthly price of a Tier 1 subscription on web in the US (raised from $4.99 in July 2024). Mobile and other countries differ.",
    source: "Twitch pricing",
    low: 5.99,
    mid: 5.99,
    high: 5.99,
  },
  {
    key: "twitch.sub.tier2_price",
    platform: "twitch",
    label: "Tier 2 sub price",
    unit: "USD / month",
    description: "Gross monthly price of a Tier 2 subscription (US).",
    source: "Twitch pricing",
    low: 9.99,
    mid: 9.99,
    high: 9.99,
  },
  {
    key: "twitch.sub.tier3_price",
    platform: "twitch",
    label: "Tier 3 sub price",
    unit: "USD / month",
    description: "Gross monthly price of a Tier 3 subscription (US).",
    source: "Twitch pricing",
    low: 24.99,
    mid: 24.99,
    high: 24.99,
  },
  {
    key: "twitch.sub.creator_share",
    platform: "twitch",
    label: "Sub revenue share",
    unit: "fraction",
    description:
      "Share of subscription revenue the streamer keeps. 50% by default; the Plus Program pays 60% at 100 Plus Points and 70% at 300 Plus Points (gifted and Prime subs do not count toward points). Prime subs pay a fixed per-country rate.",
    source: "Twitch Plus Program (January 2024)",
    low: 0.5,
    mid: 0.5,
    high: 0.7,
  },
  {
    key: "twitch.bits.usd_per_bit",
    platform: "twitch",
    label: "Payout per Bit",
    unit: "USD",
    description: "Streamers receive one cent per Bit cheered in chat (Bits used through Extensions pay 80% of that).",
    source: "Twitch Bits terms",
    low: 0.01,
    mid: 0.01,
    high: 0.01,
  },
  {
    key: "twitch.vod.watch_fraction",
    platform: "twitch",
    label: "VOD watch fraction",
    unit: "fraction",
    description:
      "Only used when no live viewer samples exist for a broadcast: the share of the stream's length an average VOD viewer watches, to approximate viewer-hours from VOD views. Run the scheduler during streams to avoid this approximation.",
    source: "Estimate",
    low: 0.1,
    mid: 0.2,
    high: 0.35,
  },
  {
    key: "tiktok.video.rpm",
    platform: "tiktok",
    label: "Creator Rewards RPM",
    unit: "USD per 1,000 qualified views",
    description:
      "Creator Rewards Program payout per 1,000 qualified views on original videos longer than one minute. Third-party estimates cluster around $0.40–1.00. Videos under a minute earn nothing from the program.",
    source: "TikTok Creator Rewards Program; third-party payout reports",
    low: 0.4,
    mid: 0.7,
    high: 1,
  },
  {
    key: "tiktok.qualified_view_ratio",
    platform: "tiktok",
    label: "Qualified view ratio",
    unit: "fraction",
    description:
      "Share of total views that count as qualified: watched for 5 seconds or more, counted once per viewer, from an eligible region and not marked “not interested”.",
    source: "TikTok Creator Rewards eligibility rules",
    low: 0.5,
    mid: 0.7,
    high: 0.9,
  },
];

export function defaultRates(): Rates {
  const out = {} as Rates;
  for (const def of RATE_DEFINITIONS) {
    out[def.key] = { low: def.low, mid: def.mid, high: def.high };
  }
  return out;
}

/**
 * Apply per-workspace overrides keyed "<rateKey>.<band>" on top of the
 * defaults. Unknown keys are ignored so stale overrides can never crash the
 * estimator. If only the mid band is overridden, low/high keep their original
 * ratio to the mid so the range stays sensible.
 */
export function resolveRates(overrides: Record<string, number>): Rates {
  const rates = defaultRates();
  for (const def of RATE_DEFINITIONS) {
    const current = rates[def.key];
    const low = overrides[`${def.key}.low`];
    const mid = overrides[`${def.key}.mid`];
    const high = overrides[`${def.key}.high`];
    if (mid !== undefined && Number.isFinite(mid) && mid >= 0) {
      const lowRatio = def.mid > 0 ? def.low / def.mid : 1;
      const highRatio = def.mid > 0 ? def.high / def.mid : 1;
      current.mid = mid;
      current.low = mid * lowRatio;
      current.high = mid * highRatio;
    }
    if (low !== undefined && Number.isFinite(low) && low >= 0) current.low = low;
    if (high !== undefined && Number.isFinite(high) && high >= 0) current.high = high;
    // Keep bands ordered.
    current.low = Math.min(current.low, current.mid);
    current.high = Math.max(current.high, current.mid);
  }
  return rates;
}
