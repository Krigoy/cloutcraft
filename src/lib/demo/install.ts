import "server-only";
import * as repo from "@/lib/db/repo";
import { PLATFORMS, type Platform } from "@/lib/platforms/types";
import { syncPlatform } from "@/lib/sync";
import { backdatedViews, buildDemoData } from "./generate";

/**
 * Connect the three demo channels and seed a short metric history so the
 * "new views" numbers have something to compare against.
 */
export async function installDemo(workspaceId: string): Promise<void> {
  const now = new Date();
  const data = buildDemoData(now);

  for (const platform of PLATFORMS) {
    const snapshot = data.snapshots.find((s) => s.platform === platform)!;
    repo.upsertConnection(workspaceId, platform, {
      tokens: { accessToken: "demo", scopes: [] },
      displayName: snapshot.displayName,
      handle: snapshot.handle,
      isDemo: true,
    });
  }

  // Backdated snapshots first so they sort before the live one.
  for (const daysBack of [7, 1]) {
    const capturedAt = new Date(now.getTime() - daysBack * 86_400_000).toISOString();
    const historical = data.items.flatMap((item) => {
      const views = backdatedViews(item, daysBack, now);
      return views === null ? [] : [{ ...item, views }];
    });
    repo.recordMetrics(workspaceId, historical, capturedAt);
  }

  for (const platform of PLATFORMS) {
    await syncPlatform(workspaceId, platform);
  }
}

export function removeDemo(workspaceId: string): Platform[] {
  const removed: Platform[] = [];
  for (const conn of repo.listConnections(workspaceId)) {
    if (!conn.isDemo) continue;
    repo.deleteConnection(workspaceId, conn.platform);
    removed.push(conn.platform);
  }
  return removed;
}

export function hasDemo(workspaceId: string): boolean {
  return repo.listConnections(workspaceId).some((c) => c.isDemo);
}
