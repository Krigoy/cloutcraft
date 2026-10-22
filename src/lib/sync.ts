import "server-only";
import * as repo from "@/lib/db/repo";
import { getAdapter } from "@/lib/platforms";
import { isExpired, PlatformApiError } from "@/lib/platforms/oauth";
import type { ContentItem, LiveSample, OAuthTokens, Platform, SyncResult } from "@/lib/platforms/types";
import { buildDemoData } from "@/lib/demo/generate";
import { env } from "@/lib/env";

/** How far back a sync pulls content (SYNC_LOOKBACK_DAYS). Analysis windows are capped to this. */
export function lookbackDays(): number {
  return env().SYNC_LOOKBACK_DAYS;
}

export interface PlatformSyncResult {
  platform: Platform;
  ok: boolean;
  items: number;
  warnings: string[];
  error?: string;
}

function describeError(err: unknown): string {
  if (err instanceof PlatformApiError) {
    if (err.status === 401 || err.status === 403) return `${err.message} — reconnect the account if this persists.`;
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

async function freshTokens(
  workspaceId: string,
  conn: repo.ConnectionWithTokens,
): Promise<OAuthTokens> {
  if (!isExpired(conn.tokens.expiresAt)) return conn.tokens;
  const refreshed = await getAdapter(conn.platform).refresh(conn.tokens);
  repo.updateConnectionTokens(workspaceId, conn.platform, refreshed);
  return refreshed;
}

function demoSync(platform: Platform): SyncResult {
  const data = buildDemoData(new Date());
  const channel = data.snapshots.find((s) => s.platform === platform);
  if (!channel) throw new Error(`No demo data for ${platform}`);
  return {
    channel,
    items: data.items.filter((i) => i.platform === platform),
    warnings: ["Demo data: generated locally, not pulled from the platform."],
  };
}

/**
 * Twitch: join archived VODs with the viewer samples the scheduler recorded
 * while the stream was live, and synthesise entries for streams whose VOD
 * was never published (or has already expired).
 */
function enrichTwitchWithLiveStats(workspaceId: string, items: ContentItem[]): ContentItem[] {
  const stats = repo.liveStatsByStream(workspaceId, "twitch");
  if (stats.size === 0) return items;
  const { LIVE_MIN_SAMPLES: minSamples, LIVE_ENDED_MINUTES: endedMinutes } = env();

  const matched = new Set<string>();
  for (const item of items) {
    const s = item.streamId ? stats.get(item.streamId) : undefined;
    if (!s || s.samples < minSamples) continue;
    item.avgViewers = s.avgViewers;
    item.peakViewers = s.peakViewers;
    matched.add(s.streamId);
  }

  // A VOD now exists for streams we previously synthesised: drop the stand-ins.
  repo.deleteContentItems(
    workspaceId,
    [...matched].map((id) => `twitch:stream-${id}`),
  );

  const endedBefore = Date.now() - endedMinutes * 60_000;
  const synthesized: ContentItem[] = [];
  for (const s of stats.values()) {
    if (matched.has(s.streamId) || s.samples < minSamples) continue;
    if (new Date(s.lastAt).getTime() > endedBefore) continue; // still live
    const startedAt = s.startedAt ?? s.firstAt;
    synthesized.push({
      id: `twitch:stream-${s.streamId}`,
      platform: "twitch",
      externalId: `stream-${s.streamId}`,
      kind: "live",
      title: s.title ?? "Live stream",
      url: "https://www.twitch.tv/",
      publishedAt: startedAt,
      durationSec: Math.max(60, Math.round((new Date(s.lastAt).getTime() - new Date(startedAt).getTime()) / 1000)),
      views: 0,
      avgViewers: s.avgViewers,
      peakViewers: s.peakViewers,
      streamId: s.streamId,
    });
  }
  return [...items, ...synthesized];
}

export async function syncPlatform(workspaceId: string, platform: Platform): Promise<PlatformSyncResult> {
  const conn = repo.getConnection(workspaceId, platform);
  if (!conn) return { platform, ok: false, items: 0, warnings: [], error: "Not connected" };

  try {
    let result: SyncResult;
    if (conn.isDemo) {
      result = demoSync(platform);
    } else {
      const tokens = await freshTokens(workspaceId, conn);
      result = await getAdapter(platform).sync(tokens, {
        lookbackDays: env().SYNC_LOOKBACK_DAYS,
        maxItems: env().SYNC_MAX_ITEMS,
      });
    }

    let items = result.items;
    if (platform === "twitch" && !conn.isDemo) items = enrichTwitchWithLiveStats(workspaceId, items);

    const capturedAt = new Date().toISOString();
    repo.saveSnapshot(workspaceId, result.channel);
    repo.upsertContentItems(workspaceId, items);
    repo.recordMetrics(workspaceId, items, capturedAt);
    repo.updateConnectionProfile(workspaceId, platform, {
      displayName: result.channel.displayName,
      handle: result.channel.handle,
      avatarUrl: result.channel.avatarUrl,
    });
    repo.markSynced(workspaceId, platform, null);
    return { platform, ok: true, items: items.length, warnings: result.warnings };
  } catch (err) {
    const message = describeError(err);
    repo.markSynced(workspaceId, platform, message);
    return { platform, ok: false, items: 0, warnings: [], error: message };
  }
}

export async function syncAll(workspaceId: string): Promise<PlatformSyncResult[]> {
  const connections = repo.listConnections(workspaceId);
  return Promise.all(connections.map((c) => syncPlatform(workspaceId, c.platform)));
}

export interface LivePollResult {
  platform: Platform;
  sample: LiveSample | null;
  error?: string;
}

/** Record one viewer-count sample for every connected channel that is live right now. */
export async function pollLiveAll(workspaceId: string): Promise<LivePollResult[]> {
  const results: LivePollResult[] = [];
  for (const summary of repo.listConnections(workspaceId)) {
    if (summary.isDemo) continue;
    const adapter = getAdapter(summary.platform);
    if (!adapter.pollLive) continue;
    const conn = repo.getConnection(workspaceId, summary.platform);
    if (!conn) continue;
    try {
      const tokens = await freshTokens(workspaceId, conn);
      const sample = await adapter.pollLive(tokens);
      if (sample) repo.recordLiveSample(workspaceId, sample);
      results.push({ platform: summary.platform, sample });
    } catch (err) {
      results.push({ platform: summary.platform, sample: null, error: describeError(err) });
    }
  }
  return results;
}
