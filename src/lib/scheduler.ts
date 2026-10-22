import "server-only";
import * as repo from "@/lib/db/repo";
import { env } from "@/lib/env";
import { secretsMatch } from "@/lib/request-guard";
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
export interface WorkspaceTick {
  workspaceId: string;
  live: LivePollResult[];
  synced: PlatformSyncResult[];
  nextFullSyncDueIn: string[];
}

export interface TickSummary {
  ranAt: string;
  workspaces: WorkspaceTick[];
}

async function tickWorkspace(workspaceId: string, intervalMs: number, now: number): Promise<WorkspaceTick> {
  const live = await pollLiveAll(workspaceId);
  const connections = await repo.listConnections(workspaceId);
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
  return { workspaceId, live, synced, nextFullSyncDueIn };
}

/**
 * Tick every workspace that has connections. Workspaces run a few at a time
 * so one slow platform API can't stall everyone, and a failure in one
 * workspace never aborts the others.
 */
export async function tick(): Promise<TickSummary> {
  const intervalMs = env().SYNC_INTERVAL_HOURS * 3_600_000;
  const now = Date.now();
  const workspaceIds = await repo.listWorkspacesWithConnections();

  const workspaces: WorkspaceTick[] = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < workspaceIds.length; i += CONCURRENCY) {
    const batch = workspaceIds.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((id) => tickWorkspace(id, intervalMs, now)));
    results.forEach((r, j) => {
      workspaces.push(
        r.status === "fulfilled"
          ? r.value
          : { workspaceId: batch[j], live: [], synced: [], nextFullSyncDueIn: [`failed: ${String(r.reason)}`] },
      );
    });
  }

  const anySync = workspaces.some((w) => w.synced.length > 0);
  await repo.recordSchedulerRun(anySync ? "sync" : "tick", {
    workspaces: workspaces.length,
    live: workspaces.reduce((n, w) => n + w.live.filter((l) => l.sample).length, 0),
    synced: workspaces.reduce((n, w) => n + w.synced.filter((s) => s.ok).length, 0),
    failed: workspaces.reduce((n, w) => n + w.synced.filter((s) => !s.ok).length, 0),
  });
  return { ranAt: new Date(now).toISOString(), workspaces };
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
