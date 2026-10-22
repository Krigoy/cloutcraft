import "server-only";
import { env } from "@/lib/env";
import { expiresAtFromSeconds, getJson, PlatformApiError, postForm, postJson } from "./oauth";
import { toInt, toOptionalInt } from "./parse";
import type {
  ChannelSnapshot,
  ContentItem,
  OAuthTokens,
  PlatformAdapter,
  SyncOptions,
  SyncResult,
} from "./types";

/**
 * TikTok adapter (Login Kit + Display API v2).
 *
 * TikTok exposes no earnings, qualified-view or LIVE gift data via API, so
 * everything is modelled from public video stats. Notes for setup:
 *  - The redirect URI must be a static HTTPS URL with no query string, so
 *    local development needs a tunnel (ngrok, cloudflared) in front of
 *    /api/auth/tiktok/callback.
 *  - Access tokens last 24 h; refresh tokens last a year and may rotate.
 */

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const API = "https://open.tiktokapis.com/v2";

const SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"] as const;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  open_id?: string;
  error?: string;
  error_description?: string;
}

interface TikTokEnvelope<T> {
  data: T;
  error: { code: string; message: string; log_id?: string };
}

interface UserInfo {
  user: {
    open_id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
    follower_count?: number;
    likes_count?: number;
    video_count?: number;
  };
}

interface VideoList {
  videos: {
    id: string;
    create_time: number;
    cover_image_url?: string;
    share_url?: string;
    video_description?: string;
    duration?: number;
    title?: string;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
    view_count?: number;
  }[];
  cursor: number;
  has_more: boolean;
}

function unwrap<T>(res: TikTokEnvelope<T>): T {
  if (res.error && res.error.code !== "ok") {
    throw new PlatformApiError("tiktok", 400, `${res.error.code}: ${res.error.message}`, res.error);
  }
  return res.data;
}

function authHeaders(tokens: OAuthTokens): Record<string, string> {
  return { Authorization: `Bearer ${tokens.accessToken}` };
}

export const tiktok: PlatformAdapter = {
  platform: "tiktok",
  scopes: SCOPES,
  usesPkce: false,

  isConfigured() {
    const e = env();
    return Boolean(e.TIKTOK_CLIENT_KEY && e.TIKTOK_CLIENT_SECRET);
  },

  buildAuthorizeUrl({ state, redirectUri }) {
    const u = new URL(AUTH_URL);
    u.searchParams.set("client_key", env().TIKTOK_CLIENT_KEY!);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", SCOPES.join(","));
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    return u.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const e = env();
    const res = await postForm<TokenResponse>("tiktok", TOKEN_URL, {
      client_key: e.TIKTOK_CLIENT_KEY!,
      client_secret: e.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    if (res.error) throw new PlatformApiError("tiktok", 400, res.error_description ?? res.error, res);
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      expiresAt: expiresAtFromSeconds(res.expires_in),
      scopes: res.scope ? res.scope.split(",") : [...SCOPES],
    };
  },

  async refresh(tokens) {
    if (!tokens.refreshToken) {
      throw new PlatformApiError("tiktok", 401, "No refresh token stored; reconnect TikTok.");
    }
    const e = env();
    const res = await postForm<TokenResponse>("tiktok", TOKEN_URL, {
      client_key: e.TIKTOK_CLIENT_KEY!,
      client_secret: e.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    if (res.error) throw new PlatformApiError("tiktok", 401, res.error_description ?? res.error, res);
    return {
      accessToken: res.access_token,
      refreshToken: res.refresh_token ?? tokens.refreshToken,
      expiresAt: expiresAtFromSeconds(res.expires_in),
      scopes: res.scope ? res.scope.split(",") : tokens.scopes,
    };
  },

  async sync(tokens, opts: SyncOptions): Promise<SyncResult> {
    const warnings: string[] = [];
    const now = new Date();
    const since = now.getTime() - opts.lookbackDays * 86_400_000;
    const headers = authHeaders(tokens);

    const info = unwrap(
      await getJson<TikTokEnvelope<UserInfo>>(
        "tiktok",
        `${API}/user/info/`,
        { fields: "open_id,display_name,username,avatar_url,follower_count,likes_count,video_count" },
        headers,
      ),
    );

    const items: ContentItem[] = [];
    let cursor: number | undefined;
    let hasMore = true;
    let pages = 0;
    const fields =
      "id,create_time,cover_image_url,share_url,video_description,duration,title,like_count,comment_count,share_count,view_count";
    while (hasMore && items.length < opts.maxItems && pages < 50) {
      const page = unwrap(
        await postJson<TikTokEnvelope<VideoList>>(
          "tiktok",
          `${API}/video/list/?fields=${encodeURIComponent(fields)}`,
          cursor === undefined ? { max_count: 20 } : { max_count: 20, cursor },
          headers,
        ),
      );
      pages++;
      for (const v of page.videos ?? []) {
        const publishedMs = v.create_time * 1000;
        if (publishedMs < since) {
          hasMore = false;
          break;
        }
        const durationSec = toInt(v.duration);
        items.push({
          id: `tiktok:${v.id}`,
          platform: "tiktok",
          externalId: v.id,
          kind: durationSec >= 60 ? "video" : "short",
          title: (v.title || v.video_description || "Untitled").slice(0, 140),
          url: v.share_url ?? `https://www.tiktok.com/@${info.user.username ?? ""}/video/${v.id}`,
          thumbnailUrl: v.cover_image_url,
          publishedAt: new Date(publishedMs).toISOString(),
          durationSec,
          views: toInt(v.view_count),
          likes: toOptionalInt(v.like_count),
          comments: toOptionalInt(v.comment_count),
          shares: toOptionalInt(v.share_count),
        });
      }
      hasMore = hasMore && page.has_more;
      cursor = page.cursor;
    }
    warnings.push("TikTok only lists public videos and does not expose Creator Rewards or LIVE gift earnings.");

    const snapshot: ChannelSnapshot = {
      platform: "tiktok",
      capturedAt: now.toISOString(),
      displayName: info.user.display_name ?? info.user.username ?? "TikTok",
      handle: info.user.username ? `@${info.user.username}` : undefined,
      avatarUrl: info.user.avatar_url,
      followers: info.user.follower_count,
      windowDays: opts.lookbackDays,
    };

    return { channel: snapshot, items, warnings };
  },
};
