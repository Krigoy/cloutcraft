import "server-only";
import * as repo from "@/lib/db/repo";
import { env } from "@/lib/env";
import { secretsMatch } from "@/lib/request-guard";
import { LOCAL_WORKSPACE_ID } from "@/lib/session";
import { pollLiveAll, syncPlatform, type LivePollResult, type PlatformSyncResult } from "@/lib/sync";

/**
 * One scheduler tick. Designed to be called about once a minute by an
 * external clock (`npm run scheduler`, a cron job, or a hosting platform's
 * scheduled function):
 *
 *  - every tick: sample concurrent viewers for channels that are live now;
 *  - when a connection's last successful sync is older than
 *    SYNC_INTERVAL_HOURS: do a full re-sync of that connection, which also
 *    records a view-count snapshot for every item.
 *
 * Polling only what is cheap on every tick keeps YouTube's daily quota and
 * the other platforms' rate limits comfortable.
 */
export interface TickSummary {
  ranAt: string;
  live: LivePollResult[];
  synced: PlatformSyncResult[];
  nextFullSyncDueIn: string[];
}

export async function tick(): Promise<TickSummary> {
  const workspaceId = LOCAL_WORKSPACE_ID;
  const intervalMs = env().SYNC_INTERVAL_HOURS * 3_600_000;
  const now = Date.now();

  const live = await pollLiveAll(workspaceId);

  const connections = repo.listConnections(workspaceId);
  const due = connections.filter(
    (c) => !c.lastSyncedAt || now - new Date(c.lastSyncedAt).getTime() >= intervalMs,
  );
  const synced = await Promise.all(due.map((c) => syncPlatform(workspaceId, c.platform)));

  const nextFullSyncDueIn = connections
    .filter((c) => !due.some((d) => d.platform === c.platform))
    .map((c) => {
      const remaining = intervalMs - (now - new Date(c.lastSyncedAt!).getTime());
      return `${c.platform}: ${Math.max(0, Math.round(remaining / 60_000))} min`;
    });

  const summary: TickSummary = { ranAt: new Date(now).toISOString(), live, synced, nextFullSyncDueIn };
  repo.recordSchedulerRun(synced.length ? "sync" : "tick", {
    live: live.map((l) => ({ platform: l.platform, viewers: l.sample?.viewerCount ?? null, error: l.error })),
    synced: synced.map((s) => ({ platform: s.platform, ok: s.ok, items: s.items, error: s.error })),
  });
  return summary;
}

/** Validate the shared secret for the tick endpoint (constant-time compare). */
export function authorizeTick(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const query = new URL(request.url).searchParams.get("secret");
  return secretsMatch(bearer, secret) || secretsMatch(query, secret);
}
