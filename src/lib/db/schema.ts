/**
 * Database schema, applied idempotently at startup (see `db()`), and also
 * printable with `npm run db:schema` for the Supabase SQL editor.
 *
 * Every row is scoped by `workspace_id` (the Clerk user id). Row Level
 * Security is enabled on every table with no policies: the app connects as
 * the database owner (which bypasses RLS), while Supabase's auto-generated
 * REST API — reachable with the public anon key — sees nothing.
 *
 * Timestamps are ISO-8601 text and payloads are JSON text, matching what the
 * application code reads and writes.
 */
const TABLES = [
  `CREATE TABLE IF NOT EXISTS connections (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    tokens_enc TEXT NOT NULL,
    scopes TEXT NOT NULL,
    display_name TEXT,
    handle TEXT,
    avatar_url TEXT,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    last_synced_at TEXT,
    last_sync_error TEXT,
    UNIQUE (workspace_id, platform)
  )`,
  `CREATE TABLE IF NOT EXISTS channel_snapshots (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_ws ON channel_snapshots (workspace_id, platform, captured_at)`,
  `CREATE TABLE IF NOT EXISTS content_items (
    workspace_id TEXT NOT NULL,
    id TEXT NOT NULL,
    platform TEXT NOT NULL,
    kind TEXT NOT NULL,
    published_at TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (workspace_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_ws ON content_items (workspace_id, platform, published_at)`,
  `CREATE TABLE IF NOT EXISTS metric_snapshots (
    workspace_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    views BIGINT NOT NULL,
    likes BIGINT,
    comments BIGINT,
    shares BIGINT,
    PRIMARY KEY (workspace_id, item_id, captured_at)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_metrics_ws ON metric_snapshots (workspace_id, captured_at)`,
  `CREATE TABLE IF NOT EXISTS live_samples (
    workspace_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    stream_id TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    viewer_count INTEGER NOT NULL,
    title TEXT,
    started_at TEXT,
    PRIMARY KEY (workspace_id, platform, stream_id, captured_at)
  )`,
  `CREATE TABLE IF NOT EXISTS scheduler_runs (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ran_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    code_verifier TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rate_overrides (
    workspace_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (workspace_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS coach_runs (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    model TEXT NOT NULL,
    input TEXT NOT NULL,
    output TEXT NOT NULL,
    usage TEXT,
    thread_id INTEGER,
    question TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_coach_ws ON coach_runs (workspace_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS experiments (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    title TEXT NOT NULL,
    method TEXT,
    success_metric TEXT,
    metric TEXT NOT NULL,
    segment TEXT NOT NULL,
    target_lift DOUBLE PRECISION NOT NULL,
    started_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    closed_at TEXT,
    source_run_id INTEGER,
    source_index INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_experiments_ws ON experiments (workspace_id, status, started_at)`,
];

/** Additive migrations for existing databases (all IF NOT EXISTS). */
const MIGRATIONS = [
  `ALTER TABLE coach_runs ADD COLUMN IF NOT EXISTS thread_id INTEGER`,
  `ALTER TABLE coach_runs ADD COLUMN IF NOT EXISTS question TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_coach_thread ON coach_runs (workspace_id, thread_id, id)`,
];

const TABLE_NAMES = [
  "connections",
  "channel_snapshots",
  "content_items",
  "metric_snapshots",
  "live_samples",
  "scheduler_runs",
  "oauth_states",
  "rate_overrides",
  "coach_runs",
  "experiments",
];

export const SCHEMA_SQL: string[] = [
  ...TABLES,
  ...MIGRATIONS,
  ...TABLE_NAMES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`),
];
