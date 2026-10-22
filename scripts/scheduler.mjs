#!/usr/bin/env node
/**
 * Development scheduler: hits /api/cron/tick once a minute.
 *
 * In production point any clock at that endpoint instead (system cron,
 * GitHub Actions, your host's scheduled functions) with
 * `Authorization: Bearer $CRON_SECRET`.
 *
 *   npm run scheduler            # every 60 s against http://localhost:3000
 *   PORT=4000 npm run scheduler  # dev server on another port
 *   TICK_SECONDS=30 npm run scheduler
 */
import { readFileSync, existsSync } from "node:fs";

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv(".env.local");
loadDotEnv(".env");

// APP_URL if set, else the local dev server on PORT (default 3000).
const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
const secret = process.env.CRON_SECRET;
const everyMs = Number(process.env.TICK_SECONDS ?? 60) * 1000;

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(new URL("/api/cron/tick", base), {
      method: "POST",
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    const live = (body.live ?? [])
      .map((l) => `${l.platform}=${l.sample ? `${l.sample.viewerCount} viewers` : l.error ? `error` : "offline"}`)
      .join(", ");
    const synced = (body.synced ?? []).map((s) => `${s.platform}:${s.ok ? `${s.items} items` : `FAILED ${s.error}`}`).join(", ");
    console.log(
      `[${new Date().toISOString()}] ${res.status} in ${Date.now() - started}ms` +
        (live ? ` | live: ${live}` : "") +
        (synced ? ` | synced: ${synced}` : "") +
        (res.status === 401 ? " | set CRON_SECRET to match the server" : ""),
    );
  } catch (err) {
    console.log(`[${new Date().toISOString()}] tick failed: ${err.message}`);
  }
}

console.log(`Scheduler: ticking ${base}/api/cron/tick every ${everyMs / 1000}s`);
await tick();
setInterval(tick, everyMs);
