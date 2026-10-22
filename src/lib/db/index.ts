import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "@/lib/env";

/**
 * SQLite connection singleton. Stored on globalThis so Next's dev-server HMR
 * does not open a new handle on every module reload.
 */
declare global {
  var __influencerDb: Database.Database | undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  tokens_enc TEXT NOT NULL,
  scopes TEXT NOT NULL,
  display_name TEXT,
  handle TEXT,
  avatar_url TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_synced_at TEXT,
  last_sync_error TEXT,
  UNIQUE (workspace_id, platform)
);

CREATE TABLE IF NOT EXISTS channel_snapshots (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_ws ON channel_snapshots (workspace_id, platform, captured_at);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  kind TEXT NOT NULL,
  published_at TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_ws ON content_items (workspace_id, platform, published_at);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  workspace_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  views INTEGER NOT NULL,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  PRIMARY KEY (item_id, captured_at)
);
CREATE INDEX IF NOT EXISTS idx_metrics_ws ON metric_snapshots (workspace_id, captured_at);

CREATE TABLE IF NOT EXISTS live_samples (
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  viewer_count INTEGER NOT NULL,
  title TEXT,
  started_at TEXT,
  PRIMARY KEY (workspace_id, platform, stream_id, captured_at)
);

CREATE TABLE IF NOT EXISTS scheduler_runs (
  id INTEGER PRIMARY KEY,
  ran_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  code_verifier TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_overrides (
  workspace_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS coach_runs (
  id INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  model TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL,
  usage TEXT
);
CREATE INDEX IF NOT EXISTS idx_coach_ws ON coach_runs (workspace_id, created_at);
`;

export function db(): Database.Database {
  if (globalThis.__influencerDb) return globalThis.__influencerDb;

  const configured = env().DATABASE_PATH;
  let conn: Database.Database;
  if (configured === ":memory:") {
    conn = new Database(":memory:");
  } else {
    // turbopackIgnore: the path comes from config, not from a bundled asset.
    const path = resolve(/* turbopackIgnore: true */ process.cwd(), configured);
    mkdirSync(dirname(path), { recursive: true });
    conn = new Database(path);
    conn.pragma("journal_mode = WAL");
  }
  conn.pragma("foreign_keys = ON");
  conn.exec(SCHEMA);
  globalThis.__influencerDb = conn;
  return conn;
}
