/**
 * Platform-agnostic data model. Every adapter in src/lib/platforms normalises
 * its API responses into these shapes so the earnings estimator, insights and
 * UI never have to know which platform the data came from.
 *
 * This file is imported by client components too, so it must stay free of
 * server-only imports.
 */

export const PLATFORMS = ["youtube", "twitch", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  tiktok: "TikTok",
};

/**
 * Content kinds across platforms.
 *  - video: long-form on-demand video (YouTube ≥ 3 min, TikTok ≥ 1 min)
 *  - short: short-form vertical video (YouTube Shorts, TikTok < 1 min)
 *  - live:  a live stream (Twitch broadcast, YouTube live). For Twitch this is
 *           the archived VOD of the broadcast; for YouTube it is the live
 *           video entry itself.
 */
export type ContentKind = "video" | "short" | "live";

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  video: "Video",
  short: "Short",
  live: "Live",
};

export interface ContentItem {
  /** Stable id: `${platform}:${externalId}` */
  id: string;
  platform: Platform;
  externalId: string;
  kind: ContentKind;
  title: string;
  url: string;
  thumbnailUrl?: string;
  publishedAt: string; // ISO 8601
  durationSec: number;
  views: number;
  likes?: number;
  comments?: number;
  shares?: number;
  /** Live-only: average and peak concurrent viewers. */
  avgViewers?: number;
  peakViewers?: number;
  /** Twitch: the broadcast id behind an archived VOD, used to join live viewer samples. */
  streamId?: string;
  /**
   * Revenue the platform itself reported for this item (e.g. YouTube
   * Analytics `estimatedRevenue`). When present the estimator uses it as the
   * mid value with basis "reported" instead of modelling it.
   */
  reportedRevenueUsd?: number;
}

/**
 * Channel-level numbers that are not attributable to a single piece of
 * content but matter for earnings (Twitch subs/bits, follower counts, etc.).
 */
export interface ChannelSnapshot {
  platform: Platform;
  capturedAt: string; // ISO 8601
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  followers?: number;
  /** YouTube only: whether the channel is in the YouTube Partner Program as far as we can tell. */
  monetized?: boolean;
  /** Twitch: active subscriptions by tier. */
  subs?: { tier1: number; tier2: number; tier3: number; gifted: number };
  /** Twitch: bits cheered in the lookback window. */
  bitsInWindow?: number;
  /** YouTube: channel-level reported revenue for the lookback window, when the monetary scope was granted. */
  reportedRevenueUsdInWindow?: number;
  /** Days covered by *InWindow fields. */
  windowDays?: number;
}

export interface SyncResult {
  channel: ChannelSnapshot;
  items: ContentItem[];
  warnings: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** ISO 8601 expiry of the access token. */
  expiresAt?: string;
  scopes: string[];
}

/** One reading of a live broadcast's concurrent viewers. */
export interface LiveSample {
  platform: Platform;
  streamId: string;
  capturedAt: string;
  viewerCount: number;
  title?: string;
  startedAt?: string;
}

export interface SyncOptions {
  lookbackDays: number;
  maxItems: number;
}

export interface PlatformAdapter {
  platform: Platform;
  /** False when the operator has not configured client credentials. */
  isConfigured(): boolean;
  /** Scopes requested at connect time, for display in the UI. */
  scopes: readonly string[];
  /** Whether the authorization-code flow needs PKCE. */
  usesPkce: boolean;
  buildAuthorizeUrl(params: { state: string; redirectUri: string; codeChallenge?: string }): string;
  exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<OAuthTokens>;
  refresh(tokens: OAuthTokens): Promise<OAuthTokens>;
  /** Pull the channel snapshot and recent content. */
  sync(tokens: OAuthTokens, opts: SyncOptions): Promise<SyncResult>;
  /**
   * Cheap "is the channel live right now?" probe used by the scheduler. Returns
   * null when the platform has no live concept or nothing is live.
   */
  pollLive?(tokens: OAuthTokens): Promise<LiveSample | null>;
}
