import "server-only";
import { env } from "@/lib/env";
import { expiresAtFromSeconds, getJson, PlatformApiError, postForm } from "./oauth";
import { parseIsoDuration, toInt, toOptionalInt } from "./parse";
import type {
  ChannelSnapshot,
  ContentItem,
  ContentKind,
  OAuthTokens,
  PlatformAdapter,
  SyncOptions,
  SyncResult,
} from "./types";

/**
 * YouTube adapter.
 *
 *  - Data API v3 lists the channel, its uploads playlist and video stats
 *    (1 quota unit per call against a 10,000/day default).
 *  - Analytics API v2 provides `creatorContentType` (SHORTS / LIVE_STREAM /
 *    VIDEO_ON_DEMAND) to classify videos and, for channels in the Partner
 *    Program that granted the monetary scope, `estimatedRevenue` per video.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://www.googleapis.com/youtube/v3";
const ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2/reports";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
] as const;

/** Uploads since October 2024 can be Shorts at up to 3 minutes. */
const SHORTS_MAX_SECONDS = 180;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

interface ChannelsResponse {
  items?: {
    id: string;
    snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } };
    statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }[];
}

interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: { contentDetails: { videoId: string; videoPublishedAt?: string } }[];
}

interface VideosResponse {
  items?: {
    id: string;
    snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string }; default?: { url: string } } };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string; concurrentViewers?: string };
  }[];
}

interface AnalyticsResponse {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
}

function authHeaders(tokens: OAuthTokens): Record<string, string> {
  return { Authorization: `Bearer ${tokens.accessToken}` };
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

async function analyticsQuery(
  tokens: OAuthTokens,
  params: Record<string, string | number | undefined>,
): Promise<{ headers: string[]; rows: (string | number)[][] }> {
  const res = await getJson<AnalyticsResponse>("youtube", ANALYTICS_API, { ids: "channel==MINE", ...params }, authHeaders(tokens));
  return { headers: (res.columnHeaders ?? []).map((h) => h.name), rows: res.rows ?? [] };
}

export const youtube: PlatformAdapter = {
  platform: "youtube",
  scopes: SCOPES,
  usesPkce: false,

  isConfigured() {
    const e = env();
    return Boolean(e.YOUTUBE_CLIENT_ID && e.YOUTUBE_CLIENT_SECRET);
  },

  buildAuthorizeUrl({ state, redirectUri }) {
    const u = new URL(AUTH_URL);
    u.searchParams.set("client_id", env().YOUTUBE_CLIENT_ID!);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", SCOPES.join(" "));
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("include_granted_scopes", "true");
    u.searchParams.set("state", state);
    return u.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const e = env();
    const res = await postForm<TokenResponse>("youtube", TOKEN_URL, {
      code,
      client_id: e.YOUTUBE_CLIENT_ID!,
      client_secret: e.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt: expiresAtFromSeconds(res.expires_in),
      scopes: res.scope ? res.scope.split(" ") : [...SCOPES],
    };
  },

  async refresh(tokens) {
    if (!tokens.refreshToken) {
      throw new PlatformApiError("youtube", 401, "No refresh token stored; reconnect YouTube.");
    }
    const e = env();
    const res = await postForm<TokenResponse>("youtube", TOKEN_URL, {
      refresh_token: tokens.refreshToken,
      client_id: e.YOUTUBE_CLIENT_ID!,
      client_secret: e.YOUTUBE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    });
    return {
      accessToken: res.access_token,
      refreshToken: tokens.refreshToken,
      expiresAt: expiresAtFromSeconds(res.expires_in),
      scopes: res.scope ? res.scope.split(" ") : tokens.scopes,
    };
  },

  async sync(tokens, opts: SyncOptions): Promise<SyncResult> {
    const warnings: string[] = [];
    const now = new Date();
    const since = new Date(now.getTime() - opts.lookbackDays * 86_400_000);
    const headers = authHeaders(tokens);

    /* Channel */
    const channels = await getJson<ChannelsResponse>(
      "youtube",
      `${DATA_API}/channels`,
      { part: "snippet,statistics,contentDetails", mine: "true" },
      headers,
    );
    const channel = channels.items?.[0];
    if (!channel) throw new PlatformApiError("youtube", 404, "No YouTube channel is attached to this Google account.");
    const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;

    /* Uploads */
    const videoIds: string[] = [];
    let pageToken: string | undefined;
    if (uploadsPlaylist) {
      do {
        const page = await getJson<PlaylistItemsResponse>(
          "youtube",
          `${DATA_API}/playlistItems`,
          { part: "contentDetails", playlistId: uploadsPlaylist, maxResults: 50, pageToken },
          headers,
        );
        let reachedEnd = false;
        for (const item of page.items ?? []) {
          const published = item.contentDetails.videoPublishedAt;
          if (published && new Date(published) < since) {
            reachedEnd = true;
            break;
          }
          videoIds.push(item.contentDetails.videoId);
        }
        pageToken = reachedEnd || videoIds.length >= opts.maxItems ? undefined : page.nextPageToken;
      } while (pageToken);
    }

    /* Video details */
    const items: ContentItem[] = [];
    const rawById = new Map<string, NonNullable<VideosResponse["items"]>[number]>();
    for (const ids of chunk(videoIds.slice(0, opts.maxItems), 50)) {
      const res = await getJson<VideosResponse>(
        "youtube",
        `${DATA_API}/videos`,
        { part: "snippet,contentDetails,statistics,liveStreamingDetails", id: ids.join(","), maxResults: 50 },
        headers,
      );
      for (const v of res.items ?? []) rawById.set(v.id, v);
    }

    /* Analytics: content type + revenue per video */
    const contentType = new Map<string, ContentKind>();
    const revenueById = new Map<string, number>();
    let monetized: boolean | undefined;
    let reportedRevenueUsdInWindow: number | undefined;
    const startDate = dateOnly(since);
    const endDate = dateOnly(now);

    for (const ids of chunk([...rawById.keys()], 200)) {
      try {
        const { headers: cols, rows } = await analyticsQuery(tokens, {
          startDate,
          endDate,
          metrics: "views",
          dimensions: "video,creatorContentType",
          filters: `video==${ids.join(",")}`,
          sort: "-views",
          maxResults: 200,
        });
        const vi = cols.indexOf("video");
        const ti = cols.indexOf("creatorContentType");
        for (const row of rows) {
          const type = String(row[ti]);
          contentType.set(
            String(row[vi]),
            type === "SHORTS" ? "short" : type === "LIVE_STREAM" ? "live" : "video",
          );
        }
      } catch (err) {
        warnings.push(`Could not classify videos via YouTube Analytics (${describeError(err)}); using duration heuristics.`);
        break;
      }
    }

    for (const ids of chunk([...rawById.keys()], 200)) {
      try {
        const { headers: cols, rows } = await analyticsQuery(tokens, {
          startDate,
          endDate,
          metrics: "estimatedRevenue",
          dimensions: "video",
          filters: `video==${ids.join(",")}`,
          sort: "-estimatedRevenue",
          maxResults: 200,
        });
        const vi = cols.indexOf("video");
        const ri = cols.indexOf("estimatedRevenue");
        for (const row of rows) revenueById.set(String(row[vi]), Number(row[ri]) || 0);
        monetized = true;
      } catch (err) {
        monetized = false;
        warnings.push(
          `Per-video revenue unavailable (${describeError(err)}). Either the channel is not in the Partner Program or the monetary scope was not granted; earnings are modelled instead.`,
        );
        break;
      }
    }

    if (monetized) {
      try {
        const { headers: cols, rows } = await analyticsQuery(tokens, {
          startDate,
          endDate,
          metrics: "estimatedRevenue",
        });
        const ri = cols.indexOf("estimatedRevenue");
        reportedRevenueUsdInWindow = rows.length ? Number(rows[0][ri]) || 0 : 0;
      } catch (err) {
        warnings.push(`Channel revenue total unavailable (${describeError(err)}).`);
      }
    }

    /* Normalise */
    for (const v of rawById.values()) {
      const durationSec = parseIsoDuration(v.contentDetails?.duration);
      const isLive = Boolean(v.liveStreamingDetails?.actualStartTime);
      const kind: ContentKind =
        contentType.get(v.id) ?? (isLive ? "live" : durationSec > 0 && durationSec <= SHORTS_MAX_SECONDS ? "short" : "video");
      const liveDuration =
        v.liveStreamingDetails?.actualStartTime && v.liveStreamingDetails.actualEndTime
          ? (new Date(v.liveStreamingDetails.actualEndTime).getTime() - new Date(v.liveStreamingDetails.actualStartTime).getTime()) / 1000
          : 0;
      items.push({
        id: `youtube:${v.id}`,
        platform: "youtube",
        externalId: v.id,
        kind,
        title: v.snippet.title,
        url: kind === "short" ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
        thumbnailUrl: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url,
        publishedAt: v.liveStreamingDetails?.actualStartTime ?? v.snippet.publishedAt,
        durationSec: durationSec || Math.round(liveDuration),
        views: toInt(v.statistics?.viewCount),
        likes: toOptionalInt(v.statistics?.likeCount),
        comments: toOptionalInt(v.statistics?.commentCount),
        reportedRevenueUsd: revenueById.get(v.id),
      });
    }
    if (contentType.size === 0 && items.length > 0) {
      warnings.push("Shorts were identified by duration (≤ 3 minutes), which can misclassify very short regular uploads.");
    }
    if (monetized && items.some((i) => i.reportedRevenueUsd === undefined)) {
      // Analytics returns nothing for videos with zero revenue in the window; treat them as $0 reported.
      for (const i of items) if (i.reportedRevenueUsd === undefined) i.reportedRevenueUsd = 0;
    }

    const snapshot: ChannelSnapshot = {
      platform: "youtube",
      capturedAt: now.toISOString(),
      displayName: channel.snippet.title,
      handle: channel.snippet.customUrl,
      avatarUrl: channel.snippet.thumbnails?.default?.url,
      followers: toOptionalInt(channel.statistics?.subscriberCount),
      monetized,
      reportedRevenueUsdInWindow,
      windowDays: opts.lookbackDays,
    };

    return { channel: snapshot, items, warnings };
  },
};

function describeError(err: unknown): string {
  if (err instanceof PlatformApiError) return `HTTP ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}
