import "server-only";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import type {
  ChannelSnapshot,
  ContentItem,
  LiveSample,
  OAuthTokens,
  Platform,
} from "@/lib/platforms/types";

/* ------------------------------------------------------------------ */
/* Connections                                                         */
/* ------------------------------------------------------------------ */

export interface ConnectionSummary {
  platform: Platform;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  scopes: string[];
  isDemo: boolean;
  createdAt: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface ConnectionWithTokens extends ConnectionSummary {
  tokens: OAuthTokens;
}

interface ConnectionRow {
  platform: Platform;
  tokens_enc: string;
  scopes: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_demo: number;
  created_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

function toSummary(row: ConnectionRow): ConnectionSummary {
  return {
    platform: row.platform,
    displayName: row.display_name,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    scopes: JSON.parse(row.scopes) as string[],
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    lastSyncedAt: row.last_synced_at,
    lastSyncError: row.last_sync_error,
  };
}

export function upsertConnection(
  workspaceId: string,
  platform: Platform,
  input: {
    tokens: OAuthTokens;
    displayName?: string;
    handle?: string;
    avatarUrl?: string;
    isDemo?: boolean;
  },
): void {
  db()
    .prepare(
      `INSERT INTO connections (workspace_id, platform, tokens_enc, scopes, display_name, handle, avatar_url, is_demo, created_at)
       VALUES (@workspaceId, @platform, @tokensEnc, @scopes, @displayName, @handle, @avatarUrl, @isDemo, @createdAt)
       ON CONFLICT (workspace_id, platform) DO UPDATE SET
         tokens_enc = excluded.tokens_enc,
         scopes = excluded.scopes,
         display_name = COALESCE(excluded.display_name, connections.display_name),
         handle = COALESCE(excluded.handle, connections.handle),
         avatar_url = COALESCE(excluded.avatar_url, connections.avatar_url),
         is_demo = excluded.is_demo,
         last_sync_error = NULL`,
    )
    .run({
      workspaceId,
      platform,
      tokensEnc: encrypt(JSON.stringify(input.tokens)),
      scopes: JSON.stringify(input.tokens.scopes),
      displayName: input.displayName ?? null,
      handle: input.handle ?? null,
      avatarUrl: input.avatarUrl ?? null,
      isDemo: input.isDemo ? 1 : 0,
      createdAt: new Date().toISOString(),
    });
}

export function listConnections(workspaceId: string): ConnectionSummary[] {
  const rows = db()
    .prepare(`SELECT * FROM connections WHERE workspace_id = ? ORDER BY created_at`)
    .all(workspaceId) as ConnectionRow[];
  return rows.map(toSummary);
}

export function getConnection(
  workspaceId: string,
  platform: Platform,
): ConnectionWithTokens | null {
  const row = db()
    .prepare(`SELECT * FROM connections WHERE workspace_id = ? AND platform = ?`)
    .get(workspaceId, platform) as ConnectionRow | undefined;
  if (!row) return null;
  return {
    ...toSummary(row),
    tokens: JSON.parse(decrypt(row.tokens_enc)) as OAuthTokens,
  };
}

export function updateConnectionTokens(
  workspaceId: string,
  platform: Platform,
  tokens: OAuthTokens,
): void {
  db()
    .prepare(
      `UPDATE connections SET tokens_enc = ?, scopes = ? WHERE workspace_id = ? AND platform = ?`,
    )
    .run(encrypt(JSON.stringify(tokens)), JSON.stringify(tokens.scopes), workspaceId, platform);
}

export function updateConnectionProfile(
  workspaceId: string,
  platform: Platform,
  profile: { displayName?: string; handle?: string; avatarUrl?: string },
): void {
  db()
    .prepare(
      `UPDATE connections SET
         display_name = COALESCE(?, display_name),
         handle = COALESCE(?, handle),
         avatar_url = COALESCE(?, avatar_url)
       WHERE workspace_id = ? AND platform = ?`,
    )
    .run(
      profile.displayName ?? null,
      profile.handle ?? null,
      profile.avatarUrl ?? null,
      workspaceId,
      platform,
    );
}

export function markSynced(
  workspaceId: string,
  platform: Platform,
  error: string | null,
): void {
  if (error) {
    db()
      .prepare(`UPDATE connections SET last_sync_error = ? WHERE workspace_id = ? AND platform = ?`)
      .run(error, workspaceId, platform);
    return;
  }
  db()
    .prepare(
      `UPDATE connections SET last_synced_at = ?, last_sync_error = NULL WHERE workspace_id = ? AND platform = ?`,
    )
    .run(new Date().toISOString(), workspaceId, platform);
}

export function deleteConnection(workspaceId: string, platform: Platform): void {
  const d = db();
  d.transaction(() => {
    d.prepare(`DELETE FROM connections WHERE workspace_id = ? AND platform = ?`).run(workspaceId, platform);
    d.prepare(`DELETE FROM content_items WHERE workspace_id = ? AND platform = ?`).run(workspaceId, platform);
    d.prepare(`DELETE FROM channel_snapshots WHERE workspace_id = ? AND platform = ?`).run(workspaceId, platform);
    d.prepare(`DELETE FROM metric_snapshots WHERE workspace_id = ? AND item_id LIKE ?`).run(workspaceId, `${platform}:%`);
    d.prepare(`DELETE FROM live_samples WHERE workspace_id = ? AND platform = ?`).run(workspaceId, platform);
  })();
}

export function deleteContentItems(workspaceId: string, ids: string[]): void {
  if (ids.length === 0) return;
  const d = db();
  const del = d.prepare(`DELETE FROM content_items WHERE workspace_id = ? AND id = ?`);
  const delMetrics = d.prepare(`DELETE FROM metric_snapshots WHERE workspace_id = ? AND item_id = ?`);
  d.transaction(() => {
    for (const id of ids) {
      del.run(workspaceId, id);
      delMetrics.run(workspaceId, id);
    }
  })();
}

/* ------------------------------------------------------------------ */
/* Channel snapshots                                                   */
/* ------------------------------------------------------------------ */

export function saveSnapshot(workspaceId: string, snapshot: ChannelSnapshot): void {
  db()
    .prepare(
      `INSERT INTO channel_snapshots (workspace_id, platform, captured_at, data) VALUES (?, ?, ?, ?)`,
    )
    .run(workspaceId, snapshot.platform, snapshot.capturedAt, JSON.stringify(snapshot));
}

export function latestSnapshots(workspaceId: string): Partial<Record<Platform, ChannelSnapshot>> {
  const rows = db()
    .prepare(
      `SELECT s.data FROM channel_snapshots s
       JOIN (SELECT platform, MAX(captured_at) AS captured_at FROM channel_snapshots WHERE workspace_id = ? GROUP BY platform) m
         ON m.platform = s.platform AND m.captured_at = s.captured_at
       WHERE s.workspace_id = ?`,
    )
    .all(workspaceId, workspaceId) as { data: string }[];
  const out: Partial<Record<Platform, ChannelSnapshot>> = {};
  for (const row of rows) {
    const snap = JSON.parse(row.data) as ChannelSnapshot;
    out[snap.platform] = snap;
  }
  return out;
}

/** Follower history for sparklines: one point per snapshot. */
export function snapshotHistory(
  workspaceId: string,
  platform: Platform,
  limit = 60,
): ChannelSnapshot[] {
  const rows = db()
    .prepare(
      `SELECT data FROM channel_snapshots WHERE workspace_id = ? AND platform = ? ORDER BY captured_at DESC LIMIT ?`,
    )
    .all(workspaceId, platform, limit) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as ChannelSnapshot).reverse();
}

/* ------------------------------------------------------------------ */
/* Content items                                                       */
/* ------------------------------------------------------------------ */

export function upsertContentItems(workspaceId: string, items: ContentItem[]): void {
  const d = db();
  const stmt = d.prepare(
    `INSERT INTO content_items (id, workspace_id, platform, kind, published_at, data, updated_at)
     VALUES (@id, @workspaceId, @platform, @kind, @publishedAt, @data, @updatedAt)
     ON CONFLICT (id) DO UPDATE SET
       kind = excluded.kind,
       published_at = excluded.published_at,
       data = excluded.data,
       updated_at = excluded.updated_at`,
  );
  const now = new Date().toISOString();
  d.transaction(() => {
    for (const item of items) {
      stmt.run({
        id: item.id,
        workspaceId,
        platform: item.platform,
        kind: item.kind,
        publishedAt: item.publishedAt,
        data: JSON.stringify(item),
        updatedAt: now,
      });
    }
  })();
}

export function listContentItems(
  workspaceId: string,
  opts: { platform?: Platform; sinceIso?: string } = {},
): ContentItem[] {
  const clauses = ["workspace_id = ?"];
  const params: unknown[] = [workspaceId];
  if (opts.platform) {
    clauses.push("platform = ?");
    params.push(opts.platform);
  }
  if (opts.sinceIso) {
    clauses.push("published_at >= ?");
    params.push(opts.sinceIso);
  }
  const rows = db()
    .prepare(
      `SELECT data FROM content_items WHERE ${clauses.join(" AND ")} ORDER BY published_at DESC`,
    )
    .all(...params) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as ContentItem);
}

/* ------------------------------------------------------------------ */
/* Metric snapshots (view counts over time)                            */
/* ------------------------------------------------------------------ */

export function recordMetrics(workspaceId: string, items: ContentItem[], capturedAt: string): void {
  const d = db();
  const stmt = d.prepare(
    `INSERT OR REPLACE INTO metric_snapshots (workspace_id, item_id, captured_at, views, likes, comments, shares)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  d.transaction(() => {
    for (const item of items) {
      stmt.run(
        workspaceId,
        item.id,
        capturedAt,
        item.views,
        item.likes ?? null,
        item.comments ?? null,
        item.shares ?? null,
      );
    }
  })();
}

/**
 * For every item, the view count at the most recent snapshot taken at or
 * before `cutoffIso`. Used to compute "new views since <cutoff>".
 */
export function viewsAsOf(workspaceId: string, cutoffIso: string): Map<string, number> {
  const rows = db()
    .prepare(
      `SELECT m.item_id, m.views FROM metric_snapshots m
       WHERE m.workspace_id = ? AND m.captured_at <= ?
         AND m.captured_at = (
           SELECT MAX(captured_at) FROM metric_snapshots
           WHERE item_id = m.item_id AND captured_at <= ?
         )`,
    )
    .all(workspaceId, cutoffIso, cutoffIso) as { item_id: string; views: number }[];
  return new Map(rows.map((r) => [r.item_id, r.views]));
}

export function metricHistory(
  workspaceId: string,
  itemId: string,
  limit = 60,
): { capturedAt: string; views: number }[] {
  const rows = db()
    .prepare(
      `SELECT captured_at, views FROM metric_snapshots WHERE workspace_id = ? AND item_id = ? ORDER BY captured_at DESC LIMIT ?`,
    )
    .all(workspaceId, itemId, limit) as { captured_at: string; views: number }[];
  return rows.map((r) => ({ capturedAt: r.captured_at, views: r.views })).reverse();
}

/* ------------------------------------------------------------------ */
/* Live samples (concurrent viewers while streaming)                   */
/* ------------------------------------------------------------------ */

export function recordLiveSample(workspaceId: string, sample: LiveSample): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO live_samples (workspace_id, platform, stream_id, captured_at, viewer_count, title, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      workspaceId,
      sample.platform,
      sample.streamId,
      sample.capturedAt,
      sample.viewerCount,
      sample.title ?? null,
      sample.startedAt ?? null,
    );
}

export interface LiveStreamStats {
  streamId: string;
  samples: number;
  avgViewers: number;
  peakViewers: number;
  firstAt: string;
  lastAt: string;
  title: string | null;
  startedAt: string | null;
}

export function liveStatsByStream(
  workspaceId: string,
  platform: Platform,
): Map<string, LiveStreamStats> {
  const rows = db()
    .prepare(
      `SELECT stream_id, COUNT(*) AS samples, AVG(viewer_count) AS avg_viewers, MAX(viewer_count) AS peak_viewers,
              MIN(captured_at) AS first_at, MAX(captured_at) AS last_at, MAX(title) AS title, MAX(started_at) AS started_at
       FROM live_samples WHERE workspace_id = ? AND platform = ? GROUP BY stream_id`,
    )
    .all(workspaceId, platform) as {
    stream_id: string;
    samples: number;
    avg_viewers: number;
    peak_viewers: number;
    first_at: string;
    last_at: string;
    title: string | null;
    started_at: string | null;
  }[];
  return new Map(
    rows.map((r) => [
      r.stream_id,
      {
        streamId: r.stream_id,
        samples: r.samples,
        avgViewers: Math.round(r.avg_viewers),
        peakViewers: r.peak_viewers,
        firstAt: r.first_at,
        lastAt: r.last_at,
        title: r.title,
        startedAt: r.started_at,
      },
    ]),
  );
}

/** Streams with a sample in the last few minutes (LIVE_FRESH_MINUTES): what is live right now. */
export function currentlyLive(workspaceId: string, withinMinutes = env().LIVE_FRESH_MINUTES): LiveSample[] {
  const cutoff = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const rows = db()
    .prepare(
      `SELECT l.platform, l.stream_id, l.captured_at, l.viewer_count, l.title, l.started_at FROM live_samples l
       WHERE l.workspace_id = ? AND l.captured_at >= ?
         AND l.captured_at = (SELECT MAX(captured_at) FROM live_samples WHERE workspace_id = l.workspace_id AND platform = l.platform AND stream_id = l.stream_id)`,
    )
    .all(workspaceId, cutoff) as {
    platform: Platform;
    stream_id: string;
    captured_at: string;
    viewer_count: number;
    title: string | null;
    started_at: string | null;
  }[];
  return rows.map((r) => ({
    platform: r.platform,
    streamId: r.stream_id,
    capturedAt: r.captured_at,
    viewerCount: r.viewer_count,
    title: r.title ?? undefined,
    startedAt: r.started_at ?? undefined,
  }));
}

/* ------------------------------------------------------------------ */
/* Scheduler bookkeeping                                               */
/* ------------------------------------------------------------------ */

/** How many scheduler runs to keep for the Settings page. */
const SCHEDULER_HISTORY_LIMIT = 200;

export function recordSchedulerRun(kind: "tick" | "sync", summary: unknown): void {
  const d = db();
  d.prepare(`INSERT INTO scheduler_runs (ran_at, kind, summary) VALUES (?, ?, ?)`).run(
    new Date().toISOString(),
    kind,
    JSON.stringify(summary),
  );
  // Keep the table small.
  d.prepare(
    `DELETE FROM scheduler_runs WHERE id NOT IN (SELECT id FROM scheduler_runs ORDER BY id DESC LIMIT ?)`,
  ).run(SCHEDULER_HISTORY_LIMIT);
}

export function lastSchedulerRun(kind?: "tick" | "sync"): { ranAt: string; kind: string; summary: unknown } | null {
  const row = (
    kind
      ? db().prepare(`SELECT ran_at, kind, summary FROM scheduler_runs WHERE kind = ? ORDER BY id DESC LIMIT 1`).get(kind)
      : db().prepare(`SELECT ran_at, kind, summary FROM scheduler_runs ORDER BY id DESC LIMIT 1`).get()
  ) as { ran_at: string; kind: string; summary: string } | undefined;
  if (!row) return null;
  return { ranAt: row.ran_at, kind: row.kind, summary: JSON.parse(row.summary) as unknown };
}

/* ------------------------------------------------------------------ */
/* OAuth state (CSRF + PKCE)                                           */
/* ------------------------------------------------------------------ */

const oauthStateTtlMs = () => env().OAUTH_STATE_TTL_MINUTES * 60_000;

export function createOAuthState(
  workspaceId: string,
  platform: Platform,
  state: string,
  codeVerifier?: string,
): void {
  const d = db();
  // Opportunistic cleanup of stale states.
  d.prepare(`DELETE FROM oauth_states WHERE created_at < ?`).run(
    new Date(Date.now() - oauthStateTtlMs()).toISOString(),
  );
  d.prepare(
    `INSERT INTO oauth_states (state, workspace_id, platform, code_verifier, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(state, workspaceId, platform, codeVerifier ?? null, new Date().toISOString());
}

export function consumeOAuthState(
  state: string,
): { workspaceId: string; platform: Platform; codeVerifier: string | null } | null {
  const d = db();
  const row = d
    .prepare(`SELECT workspace_id, platform, code_verifier, created_at FROM oauth_states WHERE state = ?`)
    .get(state) as
    | { workspace_id: string; platform: Platform; code_verifier: string | null; created_at: string }
    | undefined;
  if (!row) return null;
  d.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);
  if (Date.now() - new Date(row.created_at).getTime() > oauthStateTtlMs()) return null;
  return { workspaceId: row.workspace_id, platform: row.platform, codeVerifier: row.code_verifier };
}

/* ------------------------------------------------------------------ */
/* Rate overrides                                                      */
/* ------------------------------------------------------------------ */

export function getRateOverrides(workspaceId: string): Record<string, number> {
  const rows = db()
    .prepare(`SELECT key, value FROM rate_overrides WHERE workspace_id = ?`)
    .all(workspaceId) as { key: string; value: number }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setRateOverride(workspaceId: string, key: string, value: number | null): void {
  if (value === null) {
    db().prepare(`DELETE FROM rate_overrides WHERE workspace_id = ? AND key = ?`).run(workspaceId, key);
    return;
  }
  db()
    .prepare(
      `INSERT INTO rate_overrides (workspace_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT (workspace_id, key) DO UPDATE SET value = excluded.value`,
    )
    .run(workspaceId, key, value);
}

export function clearRateOverrides(workspaceId: string): void {
  db().prepare(`DELETE FROM rate_overrides WHERE workspace_id = ?`).run(workspaceId);
}

/* ------------------------------------------------------------------ */
/* Coach runs                                                          */
/* ------------------------------------------------------------------ */

export interface CoachRunRecord<TOutput = unknown> {
  id: number;
  createdAt: string;
  model: string;
  output: TOutput;
  usage: Record<string, unknown> | null;
}

export function saveCoachRun(
  workspaceId: string,
  run: { model: string; input: unknown; output: unknown; usage?: unknown },
): number {
  const result = db()
    .prepare(
      `INSERT INTO coach_runs (workspace_id, created_at, model, input, output, usage) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      workspaceId,
      new Date().toISOString(),
      run.model,
      JSON.stringify(run.input),
      JSON.stringify(run.output),
      run.usage ? JSON.stringify(run.usage) : null,
    );
  return Number(result.lastInsertRowid);
}

export function listCoachRuns<TOutput = unknown>(
  workspaceId: string,
  limit = 10,
): CoachRunRecord<TOutput>[] {
  const rows = db()
    .prepare(
      `SELECT id, created_at, model, output, usage FROM coach_runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(workspaceId, limit) as {
    id: number;
    created_at: string;
    model: string;
    output: string;
    usage: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    model: r.model,
    output: JSON.parse(r.output) as TOutput,
    usage: r.usage ? (JSON.parse(r.usage) as Record<string, unknown>) : null,
  }));
}
