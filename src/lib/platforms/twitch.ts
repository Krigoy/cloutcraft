import "server-only";
import { env } from "@/lib/env";
import { expiresAtFromSeconds, getJson, PlatformApiError, postForm } from "./oauth";
import { parseTwitchDuration, toInt } from "./parse";
import type {
  ChannelSnapshot,
  ContentItem,
  LiveSample,
  OAuthTokens,
  PlatformAdapter,
  SyncOptions,
  SyncResult,
} from "./types";

/**
 * Twitch adapter (Helix).
 *
 * Helix has no revenue endpoint at all, so earnings are modelled from the
 * signals it does expose: active subscriptions by tier, the Bits leaderboard,
 * archived broadcasts (VODs) and, while live, concurrent viewer counts.
 *
 * Archived VODs expire after 7–60 days depending on the channel's status.
 * Content items are persisted locally, so streams stay in the dashboard after
 * Twitch deletes the VOD.
 */

const AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const HELIX = "https://api.twitch.tv/helix";

const SCOPES = ["channel:read:subscriptions", "bits:read", "moderator:read:followers"] as const;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string[];
}

interface UsersResponse {
  data: {
    id: string;
    login: string;
    display_name: string;
    profile_image_url?: string;
    broadcaster_type?: "partner" | "affiliate" | "";
  }[];
}

interface FollowersResponse {
  total: number;
}

interface SubscriptionsResponse {
  data: { tier: "1000" | "2000" | "3000"; is_gift: boolean }[];
  pagination?: { cursor?: string };
  total: number;
  points: number;
}

interface BitsLeaderboardResponse {
  data: { user_id: string; score: number }[];
  date_range?: { started_at: string; ended_at: string };
  total: number;
}

interface VideosResponse {
  data: {
    id: string;
    stream_id: string | null;
    title: string;
    created_at: string;
    published_at: string;
    url: string;
    thumbnail_url: string;
    view_count: number;
    duration: string;
    type: "archive" | "highlight" | "upload";
  }[];
  pagination?: { cursor?: string };
}

interface StreamsResponse {
  data: { id: string; title: string; viewer_count: number; started_at: string; game_name?: string }[];
}

function helixHeaders(tokens: OAuthTokens): Record<string, string> {
  return { Authorization: `Bearer ${tokens.accessToken}`, "Client-Id": env().TWITCH_CLIENT_ID! };
}

async function currentUser(tokens: OAuthTokens) {
  const res = await getJson<UsersResponse>("twitch", `${HELIX}/users`, {}, helixHeaders(tokens));
  const user = res.data[0];
  if (!user) throw new PlatformApiError("twitch", 404, "Could not resolve the authenticated Twitch user.");
  return user;
}

export const twitch: PlatformAdapter = {
  platform: "twitch",
  scopes: SCOPES,
  usesPkce: false,

  isConfigured() {
    const e = env();
    return Boolean(e.TWITCH_CLIENT_ID && e.TWITCH_CLIENT_SECRET);
  },

  buildAuthorizeUrl({ state, redirectUri }) {
    const u = new URL(AUTH_URL);
    u.searchParams.set("client_id", env().TWITCH_CLIENT_ID!);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", SCOPES.join(" "));
    u.searchParams.set("state", state);
    u.searchParams.set("force_verify", "true");
    return u.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const e = env();
    const res = await postForm<TokenResponse>("twitch", TOKEN_URL, {
      client_id: e.TWITCH_CLIENT_ID!,
      client_secret: e.TWITCH_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt: expiresAtFromSeconds(res.expires_in),
      scopes: res.scope ?? [...SCOPES],
    };
  },

  async refresh(tokens) {
    if (!tokens.refreshToken) {
      throw new PlatformApiError("twitch", 401, "No refresh token stored; reconnect Twitch.");
    }
    const e = env();
    const res = await postForm<TokenResponse>("twitch", TOKEN_URL, {
      client_id: e.TWITCH_CLIENT_ID!,
      client_secret: e.TWITCH_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    // Twitch rotates refresh tokens; always store the new one.
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? tokens.refreshToken,
      expiresAt: expiresAtFromSeconds(res.expires_in),
      scopes: res.scope ?? tokens.scopes,
    };
  },

  async sync(tokens, opts: SyncOptions): Promise<SyncResult> {
    const warnings: string[] = [];
    const now = new Date();
    const since = new Date(now.getTime() - opts.lookbackDays * 86_400_000);
    const headers = helixHeaders(tokens);
    const user = await currentUser(tokens);

    /* Followers */
    let followers: number | undefined;
    try {
      const res = await getJson<FollowersResponse>(
        "twitch",
        `${HELIX}/channels/followers`,
        { broadcaster_id: user.id, first: 1 },
        headers,
      );
      followers = res.total;
    } catch (err) {
      warnings.push(`Follower count unavailable (${describeError(err)}).`);
    }

    /* Subscriptions by tier */
    let subs: ChannelSnapshot["subs"];
    try {
      const counts = { tier1: 0, tier2: 0, tier3: 0, gifted: 0 };
      let cursor: string | undefined;
      let seen = 0;
      let total = 0;
      let pages = 0;
      do {
        const res = await getJson<SubscriptionsResponse>(
          "twitch",
          `${HELIX}/subscriptions`,
          { broadcaster_id: user.id, first: 100, after: cursor },
          headers,
        );
        total = res.total;
        for (const s of res.data) {
          seen++;
          if (s.tier === "3000") counts.tier3++;
          else if (s.tier === "2000") counts.tier2++;
          else counts.tier1++;
          if (s.is_gift) counts.gifted++;
        }
        cursor = res.pagination?.cursor;
        pages++;
      } while (cursor && pages < 30);
      if (seen > 0 && total > seen) {
        // Very large channels: extrapolate the tier mix to the reported total.
        const k = total / seen;
        counts.tier1 = Math.round(counts.tier1 * k);
        counts.tier2 = Math.round(counts.tier2 * k);
        counts.tier3 = Math.round(counts.tier3 * k);
        counts.gifted = Math.round(counts.gifted * k);
        warnings.push(`Only ${seen} of ${total} subscriptions were paged; tier mix was extrapolated.`);
      }
      subs = counts;
    } catch (err) {
      if (err instanceof PlatformApiError && err.status === 400) {
        warnings.push("Subscriptions unavailable: the channel is not an Affiliate or Partner yet.");
      } else {
        warnings.push(`Subscriptions unavailable (${describeError(err)}).`);
      }
    }

    /* Bits: sum the monthly top-100 leaderboards covering the lookback window (a lower bound). */
    let bitsInWindow: number | undefined;
    try {
      let total = 0;
      const months = Math.max(1, Math.ceil(opts.lookbackDays / 30));
      for (let m = 0; m < months; m++) {
        const startedAt = new Date(now.getTime() - m * 30 * 86_400_000).toISOString();
        const res = await getJson<BitsLeaderboardResponse>(
          "twitch",
          `${HELIX}/bits/leaderboard`,
          { count: 100, period: "month", started_at: startedAt },
          headers,
        );
        total += res.data.reduce((s, r) => s + r.score, 0);
      }
      bitsInWindow = total;
      warnings.push("Bits total is the sum of the top 100 cheerers per month, so it is a lower bound.");
    } catch (err) {
      warnings.push(`Bits leaderboard unavailable (${describeError(err)}).`);
    }

    /* Archived broadcasts */
    const items: ContentItem[] = [];
    let cursor: string | undefined;
    let reachedEnd = false;
    do {
      const res = await getJson<VideosResponse>(
        "twitch",
        `${HELIX}/videos`,
        { user_id: user.id, type: "archive", first: 100, after: cursor },
        headers,
      );
      for (const v of res.data) {
        if (new Date(v.created_at) < since) {
          reachedEnd = true;
          break;
        }
        const durationSec = parseTwitchDuration(v.duration);
        items.push({
          id: `twitch:${v.id}`,
          platform: "twitch",
          externalId: v.id,
          kind: "live",
          title: v.title,
          url: v.url,
          thumbnailUrl: v.thumbnail_url?.replace("%{width}", "320").replace("%{height}", "180"),
          publishedAt: v.created_at,
          durationSec,
          views: toInt(v.view_count),
          streamId: v.stream_id ?? undefined,
        });
      }
      cursor = reachedEnd || items.length >= opts.maxItems ? undefined : res.pagination?.cursor;
    } while (cursor);

    const snapshot: ChannelSnapshot = {
      platform: "twitch",
      capturedAt: now.toISOString(),
      displayName: user.display_name,
      handle: user.login,
      avatarUrl: user.profile_image_url,
      followers,
      subs,
      bitsInWindow,
      windowDays: opts.lookbackDays,
    };

    return { channel: snapshot, items, warnings };
  },

  async pollLive(tokens): Promise<LiveSample | null> {
    const user = await currentUser(tokens);
    const res = await getJson<StreamsResponse>(
      "twitch",
      `${HELIX}/streams`,
      { user_id: user.id, first: 1 },
      helixHeaders(tokens),
    );
    const stream = res.data[0];
    if (!stream) return null;
    return {
      platform: "twitch",
      streamId: stream.id,
      capturedAt: new Date().toISOString(),
      viewerCount: stream.viewer_count,
      title: stream.title,
      startedAt: stream.started_at,
    };
  },
};

function describeError(err: unknown): string {
  if (err instanceof PlatformApiError) return `HTTP ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}
