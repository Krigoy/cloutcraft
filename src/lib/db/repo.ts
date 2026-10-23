import "server-only";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { PayoutReport } from "@/lib/earnings/estimate";
import type { ExperimentMetric, ExperimentSegment, ExperimentStatus } from "@/lib/experiments/score";
import type {
  ChannelSnapshot,
  ContentItem,
  LiveSample,
  OAuthTokens,
  Platform,
} from "@/lib/platforms/types";

/*
 * Data access. Every function is scoped by workspace id (the Clerk user id).
 * Bulk writes send one JSON parameter expanded with `jsonb_to_recordset`, so
 * a sync is a handful of round trips instead of one per row. BIGINT columns
 * are read back as `::float8` so both drivers return plain numbers.
 *
 * JSON parameters are always cast `$n::text::jsonb`, never `$n::jsonb`:
 * postgres.js JSON-encodes any parameter whose inferred type is jsonb, so a
 * pre-stringified array would arrive as a JSON *string* ("cannot call
 * jsonb_to_recordset on a non-array"). PGlite doesn't, which is why the
 * local tests can't catch this — keep the `::text` hop.
 */

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
  [key: string]: unknown;
  platform: Platform;
  tokens_enc: string;
  scopes: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  is_demo: boolean;
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
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    lastSyncedAt: row.last_synced_at,
    lastSyncError: row.last_sync_error,
  };
}

export async function upsertConnection(
  workspaceId: string,
  platform: Platform,
  input: {
    tokens: OAuthTokens;
    displayName?: string;
    handle?: string;
    avatarUrl?: string;
    isDemo?: boolean;
  },
): Promise<void> {
  await (await db()).query(
    `INSERT INTO connections (workspace_id, platform, tokens_enc, scopes, display_name, handle, avatar_url, is_demo, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (workspace_id, platform) DO UPDATE SET
       tokens_enc = excluded.tokens_enc,
       scopes = excluded.scopes,
       display_name = COALESCE(excluded.display_name, connections.display_name),
       handle = COALESCE(excluded.handle, connections.handle),
       avatar_url = COALESCE(excluded.avatar_url, connections.avatar_url),
       is_demo = excluded.is_demo,
       last_sync_error = NULL`,
    [
      workspaceId,
      platform,
      encrypt(JSON.stringify(input.tokens)),
      JSON.stringify(input.tokens.scopes),
      input.displayName ?? null,
      input.handle ?? null,
      input.avatarUrl ?? null,
      Boolean(input.isDemo),
      new Date().toISOString(),
    ],
  );
}

export async function listConnections(workspaceId: string): Promise<ConnectionSummary[]> {
  const rows = await (await db()).query<ConnectionRow>(
    `SELECT * FROM connections WHERE workspace_id = $1 ORDER BY created_at`,
    [workspaceId],
  );
  return rows.map(toSummary);
}

/** Every workspace that has at least one connection — the scheduler's work list. */
export async function listWorkspacesWithConnections(): Promise<string[]> {
  const rows = await (await db()).query<{ workspace_id: string }>(
    `SELECT DISTINCT workspace_id FROM connections ORDER BY workspace_id`,
  );
  return rows.map((r) => r.workspace_id);
}

export async function getConnection(
  workspaceId: string,
  platform: Platform,
): Promise<ConnectionWithTokens | null> {
  const [row] = await (await db()).query<ConnectionRow>(
    `SELECT * FROM connections WHERE workspace_id = $1 AND platform = $2`,
    [workspaceId, platform],
  );
  if (!row) return null;
  return { ...toSummary(row), tokens: JSON.parse(decrypt(row.tokens_enc)) as OAuthTokens };
}

export async function updateConnectionTokens(
  workspaceId: string,
  platform: Platform,
  tokens: OAuthTokens,
): Promise<void> {
  await (await db()).query(
    `UPDATE connections SET tokens_enc = $1, scopes = $2 WHERE workspace_id = $3 AND platform = $4`,
    [encrypt(JSON.stringify(tokens)), JSON.stringify(tokens.scopes), workspaceId, platform],
  );
}

export async function updateConnectionProfile(
  workspaceId: string,
  platform: Platform,
  profile: { displayName?: string; handle?: string; avatarUrl?: string },
): Promise<void> {
  await (await db()).query(
    `UPDATE connections SET
       display_name = COALESCE($1, display_name),
       handle = COALESCE($2, handle),
       avatar_url = COALESCE($3, avatar_url)
     WHERE workspace_id = $4 AND platform = $5`,
    [profile.displayName ?? null, profile.handle ?? null, profile.avatarUrl ?? null, workspaceId, platform],
  );
}

export async function markSynced(workspaceId: string, platform: Platform, error: string | null): Promise<void> {
  const d = await db();
  if (error) {
    await d.query(`UPDATE connections SET last_sync_error = $1 WHERE workspace_id = $2 AND platform = $3`, [
      error,
      workspaceId,
      platform,
    ]);
    return;
  }
  await d.query(
    `UPDATE connections SET last_synced_at = $1, last_sync_error = NULL WHERE workspace_id = $2 AND platform = $3`,
    [new Date().toISOString(), workspaceId, platform],
  );
}

export async function deleteConnection(workspaceId: string, platform: Platform): Promise<void> {
  await (await db()).transaction(async (tx) => {
    await tx.query(`DELETE FROM connections WHERE workspace_id = $1 AND platform = $2`, [workspaceId, platform]);
    await tx.query(`DELETE FROM content_items WHERE workspace_id = $1 AND platform = $2`, [workspaceId, platform]);
    await tx.query(`DELETE FROM channel_snapshots WHERE workspace_id = $1 AND platform = $2`, [workspaceId, platform]);
    await tx.query(`DELETE FROM metric_snapshots WHERE workspace_id = $1 AND item_id LIKE $2`, [
      workspaceId,
      `${platform}:%`,
    ]);
    await tx.query(`DELETE FROM live_samples WHERE workspace_id = $1 AND platform = $2`, [workspaceId, platform]);
  });
}

export async function deleteContentItems(workspaceId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await (await db()).transaction(async (tx) => {
    await tx.query(`DELETE FROM content_items WHERE workspace_id = $1 AND id = ANY(SELECT jsonb_array_elements_text($2::text::jsonb))`, [
      workspaceId,
      JSON.stringify(ids),
    ]);
    await tx.query(
      `DELETE FROM metric_snapshots WHERE workspace_id = $1 AND item_id = ANY(SELECT jsonb_array_elements_text($2::text::jsonb))`,
      [workspaceId, JSON.stringify(ids)],
    );
  });
}

/* ------------------------------------------------------------------ */
/* Channel snapshots                                                   */
/* ------------------------------------------------------------------ */

export async function saveSnapshot(workspaceId: string, snapshot: ChannelSnapshot): Promise<void> {
  await (await db()).query(
    `INSERT INTO channel_snapshots (workspace_id, platform, captured_at, data) VALUES ($1, $2, $3, $4)`,
    [workspaceId, snapshot.platform, snapshot.capturedAt, JSON.stringify(snapshot)],
  );
}

export async function latestSnapshots(workspaceId: string): Promise<Partial<Record<Platform, ChannelSnapshot>>> {
  const rows = await (await db()).query<{ data: string }>(
    `SELECT DISTINCT ON (platform) data FROM channel_snapshots
     WHERE workspace_id = $1 ORDER BY platform, captured_at DESC`,
    [workspaceId],
  );
  const out: Partial<Record<Platform, ChannelSnapshot>> = {};
  for (const row of rows) {
    const snap = JSON.parse(row.data) as ChannelSnapshot;
    out[snap.platform] = snap;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Content items                                                       */
/* ------------------------------------------------------------------ */

export async function upsertContentItems(workspaceId: string, items: ContentItem[]): Promise<void> {
  if (items.length === 0) return;
  const now = new Date().toISOString();
  const rows = items.map((item) => ({
    id: item.id,
    platform: item.platform,
    kind: item.kind,
    published_at: item.publishedAt,
    data: JSON.stringify(item),
  }));
  await (await db()).query(
    `INSERT INTO content_items (workspace_id, id, platform, kind, published_at, data, updated_at)
     SELECT $1, r.id, r.platform, r.kind, r.published_at, r.data, $3
     FROM jsonb_to_recordset($2::text::jsonb) AS r(id text, platform text, kind text, published_at text, data text)
     ON CONFLICT (workspace_id, id) DO UPDATE SET
       kind = excluded.kind,
       published_at = excluded.published_at,
       data = excluded.data,
       updated_at = excluded.updated_at`,
    [workspaceId, JSON.stringify(rows), now],
  );
}

export async function listContentItems(
  workspaceId: string,
  opts: { platform?: Platform; sinceIso?: string } = {},
): Promise<ContentItem[]> {
  const clauses = ["workspace_id = $1"];
  const params: unknown[] = [workspaceId];
  if (opts.platform) {
    params.push(opts.platform);
    clauses.push(`platform = $${params.length}`);
  }
  if (opts.sinceIso) {
    params.push(opts.sinceIso);
    clauses.push(`published_at >= $${params.length}`);
  }
  const rows = await (await db()).query<{ data: string }>(
    `SELECT data FROM content_items WHERE ${clauses.join(" AND ")} ORDER BY published_at DESC`,
    params,
  );
  return rows.map((r) => JSON.parse(r.data) as ContentItem);
}

/* ------------------------------------------------------------------ */
/* Metric snapshots (view counts over time)                            */
/* ------------------------------------------------------------------ */

export async function recordMetrics(workspaceId: string, items: ContentItem[], capturedAt: string): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map((item) => ({
    item_id: item.id,
    views: item.views,
    likes: item.likes ?? null,
    comments: item.comments ?? null,
    shares: item.shares ?? null,
  }));
  await (await db()).query(
    `INSERT INTO metric_snapshots (workspace_id, item_id, captured_at, views, likes, comments, shares)
     SELECT $1, r.item_id, $3, r.views, r.likes, r.comments, r.shares
     FROM jsonb_to_recordset($2::text::jsonb) AS r(item_id text, views bigint, likes bigint, comments bigint, shares bigint)
     ON CONFLICT (workspace_id, item_id, captured_at) DO UPDATE SET
       views = excluded.views, likes = excluded.likes, comments = excluded.comments, shares = excluded.shares`,
    [workspaceId, JSON.stringify(rows), capturedAt],
  );
}

/**
 * For every item, the view count at the most recent snapshot taken at or
 * before `cutoffIso`. Used to compute "new views since <cutoff>".
 */
export async function viewsAsOf(workspaceId: string, cutoffIso: string): Promise<Map<string, number>> {
  const rows = await (await db()).query<{ item_id: string; views: number }>(
    `SELECT DISTINCT ON (item_id) item_id, views::float8 AS views FROM metric_snapshots
     WHERE workspace_id = $1 AND captured_at <= $2
     ORDER BY item_id, captured_at DESC`,
    [workspaceId, cutoffIso],
  );
  return new Map(rows.map((r) => [r.item_id, Number(r.views)]));
}

/* ------------------------------------------------------------------ */
/* Live samples (concurrent viewers while streaming)                   */
/* ------------------------------------------------------------------ */

export async function recordLiveSample(workspaceId: string, sample: LiveSample): Promise<void> {
  await (await db()).query(
    `INSERT INTO live_samples (workspace_id, platform, stream_id, captured_at, viewer_count, title, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (workspace_id, platform, stream_id, captured_at) DO UPDATE SET viewer_count = excluded.viewer_count`,
    [
      workspaceId,
      sample.platform,
      sample.streamId,
      sample.capturedAt,
      sample.viewerCount,
      sample.title ?? null,
      sample.startedAt ?? null,
    ],
  );
}

/** Bulk form of `recordLiveSample` (demo seeding, backfills). */
export async function recordLiveSamples(workspaceId: string, samples: LiveSample[]): Promise<void> {
  if (samples.length === 0) return;
  const rows = samples.map((s) => ({
    platform: s.platform,
    stream_id: s.streamId,
    captured_at: s.capturedAt,
    viewer_count: s.viewerCount,
    title: s.title ?? null,
    started_at: s.startedAt ?? null,
  }));
  await (await db()).query(
    `INSERT INTO live_samples (workspace_id, platform, stream_id, captured_at, viewer_count, title, started_at)
     SELECT $1, r.platform, r.stream_id, r.captured_at, r.viewer_count, r.title, r.started_at
     FROM jsonb_to_recordset($2::text::jsonb) AS r(platform text, stream_id text, captured_at text, viewer_count int, title text, started_at text)
     ON CONFLICT (workspace_id, platform, stream_id, captured_at) DO UPDATE SET viewer_count = excluded.viewer_count`,
    [workspaceId, JSON.stringify(rows)],
  );
}

/** Every sample of one broadcast, oldest first. */
export async function liveSamplesForStream(
  workspaceId: string,
  platform: Platform,
  streamId: string,
): Promise<{ capturedAt: string; viewerCount: number }[]> {
  const rows = await (await db()).query<{ captured_at: string; viewer_count: number }>(
    `SELECT captured_at, viewer_count FROM live_samples WHERE workspace_id = $1 AND platform = $2 AND stream_id = $3 ORDER BY captured_at`,
    [workspaceId, platform, streamId],
  );
  return rows.map((r) => ({ capturedAt: r.captured_at, viewerCount: Number(r.viewer_count) }));
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

export async function liveStatsByStream(workspaceId: string, platform: Platform): Promise<Map<string, LiveStreamStats>> {
  const rows = await (await db()).query<{
    stream_id: string;
    samples: number;
    avg_viewers: number;
    peak_viewers: number;
    first_at: string;
    last_at: string;
    title: string | null;
    started_at: string | null;
  }>(
    `SELECT stream_id, COUNT(*)::int AS samples, AVG(viewer_count)::float8 AS avg_viewers, MAX(viewer_count)::int AS peak_viewers,
            MIN(captured_at) AS first_at, MAX(captured_at) AS last_at, MAX(title) AS title, MAX(started_at) AS started_at
     FROM live_samples WHERE workspace_id = $1 AND platform = $2 GROUP BY stream_id`,
    [workspaceId, platform],
  );
  return new Map(
    rows.map((r) => [
      r.stream_id,
      {
        streamId: r.stream_id,
        samples: Number(r.samples),
        avgViewers: Math.round(Number(r.avg_viewers)),
        peakViewers: Number(r.peak_viewers),
        firstAt: r.first_at,
        lastAt: r.last_at,
        title: r.title,
        startedAt: r.started_at,
      },
    ]),
  );
}

/** Streams with a sample in the last few minutes (LIVE_FRESH_MINUTES): what is live right now. */
export async function currentlyLive(workspaceId: string, withinMinutes = env().LIVE_FRESH_MINUTES): Promise<LiveSample[]> {
  const cutoff = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const rows = await (await db()).query<{
    platform: Platform;
    stream_id: string;
    captured_at: string;
    viewer_count: number;
    title: string | null;
    started_at: string | null;
  }>(
    `SELECT DISTINCT ON (platform, stream_id) platform, stream_id, captured_at, viewer_count, title, started_at
     FROM live_samples WHERE workspace_id = $1 AND captured_at >= $2
     ORDER BY platform, stream_id, captured_at DESC`,
    [workspaceId, cutoff],
  );
  return rows.map((r) => ({
    platform: r.platform,
    streamId: r.stream_id,
    capturedAt: r.captured_at,
    viewerCount: Number(r.viewer_count),
    title: r.title ?? undefined,
    startedAt: r.started_at ?? undefined,
  }));
}

/* ------------------------------------------------------------------ */
/* Scheduler bookkeeping (global, not per workspace)                   */
/* ------------------------------------------------------------------ */

/** How many scheduler runs to keep for the Settings page. */
const SCHEDULER_HISTORY_LIMIT = 200;

export async function recordSchedulerRun(kind: "tick" | "sync", summary: unknown): Promise<void> {
  const d = await db();
  await d.query(`INSERT INTO scheduler_runs (ran_at, kind, summary) VALUES ($1, $2, $3)`, [
    new Date().toISOString(),
    kind,
    JSON.stringify(summary),
  ]);
  await d.query(
    `DELETE FROM scheduler_runs WHERE id NOT IN (SELECT id FROM scheduler_runs ORDER BY id DESC LIMIT $1)`,
    [SCHEDULER_HISTORY_LIMIT],
  );
}

export async function lastSchedulerRun(): Promise<{ ranAt: string; kind: string } | null> {
  const [row] = await (await db()).query<{ ran_at: string; kind: string }>(
    `SELECT ran_at, kind FROM scheduler_runs ORDER BY id DESC LIMIT 1`,
  );
  return row ? { ranAt: row.ran_at, kind: row.kind } : null;
}

/* ------------------------------------------------------------------ */
/* OAuth state (CSRF + PKCE)                                           */
/* ------------------------------------------------------------------ */

const oauthStateTtlMs = () => env().OAUTH_STATE_TTL_MINUTES * 60_000;

export async function createOAuthState(
  workspaceId: string,
  platform: Platform,
  state: string,
  codeVerifier?: string,
): Promise<void> {
  const d = await db();
  // Opportunistic cleanup of stale states.
  await d.query(`DELETE FROM oauth_states WHERE created_at < $1`, [
    new Date(Date.now() - oauthStateTtlMs()).toISOString(),
  ]);
  await d.query(
    `INSERT INTO oauth_states (state, workspace_id, platform, code_verifier, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [state, workspaceId, platform, codeVerifier ?? null, new Date().toISOString()],
  );
}

/** Single-use: the state row is deleted atomically as it is read. */
export async function consumeOAuthState(
  state: string,
): Promise<{ workspaceId: string; platform: Platform; codeVerifier: string | null } | null> {
  const [row] = await (await db()).query<{
    workspace_id: string;
    platform: Platform;
    code_verifier: string | null;
    created_at: string;
  }>(`DELETE FROM oauth_states WHERE state = $1 RETURNING workspace_id, platform, code_verifier, created_at`, [state]);
  if (!row) return null;
  if (Date.now() - new Date(row.created_at).getTime() > oauthStateTtlMs()) return null;
  return { workspaceId: row.workspace_id, platform: row.platform, codeVerifier: row.code_verifier };
}

/* ------------------------------------------------------------------ */
/* Rate overrides                                                      */
/* ------------------------------------------------------------------ */

export async function getRateOverrides(workspaceId: string): Promise<Record<string, number>> {
  const rows = await (await db()).query<{ key: string; value: number }>(
    `SELECT key, value FROM rate_overrides WHERE workspace_id = $1`,
    [workspaceId],
  );
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
}

export async function setRateOverrides(workspaceId: string, changes: Record<string, number | null>): Promise<void> {
  await (await db()).transaction(async (tx) => {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        await tx.query(`DELETE FROM rate_overrides WHERE workspace_id = $1 AND key = $2`, [workspaceId, key]);
      } else {
        await tx.query(
          `INSERT INTO rate_overrides (workspace_id, key, value) VALUES ($1, $2, $3)
           ON CONFLICT (workspace_id, key) DO UPDATE SET value = excluded.value`,
          [workspaceId, key, value],
        );
      }
    }
  });
}

export async function clearRateOverrides(workspaceId: string): Promise<void> {
  await (await db()).query(`DELETE FROM rate_overrides WHERE workspace_id = $1`, [workspaceId]);
}

/* ------------------------------------------------------------------ */
/* Coach runs & conversations                                          */
/* ------------------------------------------------------------------ */

/*
 * A conversation ("thread") is a chain of runs: the first run's id is the
 * thread id and follow-ups carry it in thread_id. Rows written before
 * threads existed have NULL thread_id and are treated as one-turn threads.
 */

export interface CoachRunRecord<TOutput = unknown> {
  id: number;
  threadId: number;
  createdAt: string;
  model: string;
  question: string;
  output: TOutput;
  usage: Record<string, unknown> | null;
}

export interface CoachThreadSummary {
  threadId: number;
  /** First question of the thread, or empty for a general review. */
  title: string;
  startedAt: string;
  lastAt: string;
  turns: number;
}

interface CoachRunRow {
  [key: string]: unknown;
  id: number;
  thread_id: number;
  created_at: string;
  model: string;
  question: string;
  output: string;
  usage: string | null;
}

const RUN_COLUMNS = `id, COALESCE(thread_id, id) AS thread_id, created_at, model,
  COALESCE(question, NULLIF(usage::jsonb->>'creatorNotes', ''), '') AS question, output, usage`;

function toRun<TOutput>(r: CoachRunRow): CoachRunRecord<TOutput> {
  return {
    id: Number(r.id),
    threadId: Number(r.thread_id),
    createdAt: r.created_at,
    model: r.model,
    question: r.question,
    output: JSON.parse(r.output) as TOutput,
    usage: r.usage ? (JSON.parse(r.usage) as Record<string, unknown>) : null,
  };
}

export async function saveCoachRun(
  workspaceId: string,
  run: { model: string; input: unknown; output: unknown; usage?: unknown; question?: string; threadId?: number },
): Promise<{ id: number; threadId: number }> {
  const d = await db();
  const [row] = await d.query<{ id: number }>(
    `INSERT INTO coach_runs (workspace_id, created_at, model, input, output, usage, thread_id, question)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      workspaceId,
      new Date().toISOString(),
      run.model,
      JSON.stringify(run.input),
      JSON.stringify(run.output),
      run.usage ? JSON.stringify(run.usage) : null,
      run.threadId ?? null,
      run.question?.trim() || null,
    ],
  );
  const id = Number(row.id);
  const threadId = run.threadId ?? id;
  if (run.threadId === undefined) {
    await d.query(`UPDATE coach_runs SET thread_id = $1 WHERE workspace_id = $2 AND id = $1`, [id, workspaceId]);
  }
  return { id, threadId };
}

export async function listCoachThreads(workspaceId: string, limit = 50): Promise<CoachThreadSummary[]> {
  const rows = await (await db()).query<{ thread_id: number; title: string; started_at: string; last_at: string; turns: number }>(
    `WITH runs AS (SELECT ${RUN_COLUMNS} FROM coach_runs WHERE workspace_id = $1)
     SELECT thread_id,
            (SELECT question FROM runs r2 WHERE r2.thread_id = r.thread_id ORDER BY id ASC LIMIT 1) AS title,
            MIN(created_at) AS started_at, MAX(created_at) AS last_at, COUNT(*)::int AS turns
     FROM runs r GROUP BY thread_id ORDER BY MAX(created_at) DESC, thread_id DESC LIMIT $2`,
    [workspaceId, limit],
  );
  return rows.map((r) => ({
    threadId: Number(r.thread_id),
    title: r.title ?? "",
    startedAt: r.started_at,
    lastAt: r.last_at,
    turns: Number(r.turns),
  }));
}

/** All turns of one conversation, oldest first. Empty if the thread isn't this workspace's. */
export async function listThreadRuns<TOutput = unknown>(workspaceId: string, threadId: number): Promise<CoachRunRecord<TOutput>[]> {
  const rows = await (await db()).query<CoachRunRow>(
    `SELECT ${RUN_COLUMNS} FROM coach_runs WHERE workspace_id = $1 AND COALESCE(thread_id, id) = $2 ORDER BY id ASC`,
    [workspaceId, threadId],
  );
  return rows.map((r) => toRun<TOutput>(r));
}

export async function latestThreadId(workspaceId: string): Promise<number | null> {
  const [row] = await (await db()).query<{ thread_id: number }>(
    `SELECT COALESCE(thread_id, id) AS thread_id FROM coach_runs WHERE workspace_id = $1 ORDER BY id DESC LIMIT 1`,
    [workspaceId],
  );
  return row ? Number(row.thread_id) : null;
}

export async function deleteCoachThread(workspaceId: string, threadId: number): Promise<void> {
  await (await db()).query(`DELETE FROM coach_runs WHERE workspace_id = $1 AND COALESCE(thread_id, id) = $2`, [workspaceId, threadId]);
}

/* ------------------------------------------------------------------ */
/* Experiments                                                         */
/* ------------------------------------------------------------------ */

export interface ExperimentRecord {
  id: number;
  createdAt: string;
  title: string;
  method: string | null;
  successMetric: string | null;
  metric: ExperimentMetric;
  segment: ExperimentSegment;
  targetLift: number;
  startedAt: string;
  endsAt: string;
  status: ExperimentStatus;
  closedAt: string | null;
  /** Coach run and experiment index this was started from, if any. */
  source: { runId: number; index: number } | null;
}

interface ExperimentRow {
  [key: string]: unknown;
  id: number;
  created_at: string;
  title: string;
  method: string | null;
  success_metric: string | null;
  metric: ExperimentMetric;
  segment: string;
  target_lift: number;
  started_at: string;
  ends_at: string;
  status: ExperimentStatus;
  closed_at: string | null;
  source_run_id: number | null;
  source_index: number | null;
}

function toExperiment(r: ExperimentRow): ExperimentRecord {
  return {
    id: Number(r.id),
    createdAt: r.created_at,
    title: r.title,
    method: r.method,
    successMetric: r.success_metric,
    metric: r.metric,
    segment: JSON.parse(r.segment) as ExperimentSegment,
    targetLift: Number(r.target_lift),
    startedAt: r.started_at,
    endsAt: r.ends_at,
    status: r.status,
    closedAt: r.closed_at,
    source: r.source_run_id !== null ? { runId: Number(r.source_run_id), index: Number(r.source_index) } : null,
  };
}

export async function createExperiment(
  workspaceId: string,
  input: {
    title: string;
    method?: string;
    successMetric?: string;
    metric: ExperimentMetric;
    segment: ExperimentSegment;
    targetLift: number;
    startedAt: string;
    endsAt: string;
    source?: { runId: number; index: number };
  },
): Promise<number> {
  const [row] = await (await db()).query<{ id: number }>(
    `INSERT INTO experiments (workspace_id, created_at, title, method, success_metric, metric, segment, target_lift, started_at, ends_at, status, source_run_id, source_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $12) RETURNING id`,
    [
      workspaceId,
      new Date().toISOString(),
      input.title.trim(),
      input.method?.trim() || null,
      input.successMetric?.trim() || null,
      input.metric,
      JSON.stringify(input.segment),
      input.targetLift,
      input.startedAt,
      input.endsAt,
      input.source?.runId ?? null,
      input.source?.index ?? null,
    ],
  );
  return Number(row.id);
}

/** Active first (soonest to finish on top), then closed ones newest first. */
export async function listExperiments(workspaceId: string): Promise<ExperimentRecord[]> {
  const rows = await (await db()).query<ExperimentRow>(
    `SELECT * FROM experiments WHERE workspace_id = $1
     ORDER BY (status = 'active') DESC, CASE WHEN status = 'active' THEN ends_at END ASC, COALESCE(closed_at, created_at) DESC, id DESC`,
    [workspaceId],
  );
  return rows.map(toExperiment);
}

export async function setExperimentStatus(workspaceId: string, id: number, status: ExperimentStatus): Promise<void> {
  await (await db()).query(
    `UPDATE experiments SET status = $1, closed_at = $2 WHERE workspace_id = $3 AND id = $4`,
    [status, status === "active" ? null : new Date().toISOString(), workspaceId, id],
  );
}

export async function deleteExperiment(workspaceId: string, id: number): Promise<void> {
  await (await db()).query(`DELETE FROM experiments WHERE workspace_id = $1 AND id = $2`, [workspaceId, id]);
}

/* ------------------------------------------------------------------ */
/* Real payouts (calibration)                                          */
/* ------------------------------------------------------------------ */

interface PayoutRow {
  [key: string]: unknown;
  id: number;
  platform: Platform;
  period_start: string;
  period_end: string;
  amount_usd: number;
  source: string;
  note: string | null;
}

export async function addPayoutReport(
  workspaceId: string,
  input: Omit<PayoutReport, "id">,
): Promise<number> {
  const [row] = await (await db()).query<{ id: number }>(
    `INSERT INTO payout_reports (workspace_id, platform, period_start, period_end, amount_usd, source, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [workspaceId, input.platform, input.periodStart, input.periodEnd, input.amountUsd, input.source, input.note, new Date().toISOString()],
  );
  return Number(row.id);
}

/** Newest period first. */
export async function listPayoutReports(workspaceId: string): Promise<PayoutReport[]> {
  const rows = await (await db()).query<PayoutRow>(
    `SELECT id, platform, period_start, period_end, amount_usd, source, note FROM payout_reports
     WHERE workspace_id = $1 ORDER BY period_end DESC, id DESC`,
    [workspaceId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    platform: r.platform,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    amountUsd: Number(r.amount_usd),
    source: r.source,
    note: r.note,
  }));
}

export async function deletePayoutReport(workspaceId: string, id: number): Promise<void> {
  await (await db()).query(`DELETE FROM payout_reports WHERE workspace_id = $1 AND id = $2`, [workspaceId, id]);
}
