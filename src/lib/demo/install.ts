import "server-only";
import * as repo from "@/lib/db/repo";
import { PLATFORMS, type Platform } from "@/lib/platforms/types";
import { syncPlatform } from "@/lib/sync";
import { backdatedViews, buildDemoData, demoLiveSamples } from "./generate";

/**
 * Connect the three demo channels and seed a short metric history so the
 * "new views" numbers have something to compare against.
 */
export async function installDemo(workspaceId: string): Promise<void> {
  const now = new Date();
  const data = buildDemoData(now);

  for (const platform of PLATFORMS) {
    const snapshot = data.snapshots.find((s) => s.platform === platform)!;
    await repo.upsertConnection(workspaceId, platform, {
      tokens: { accessToken: "demo", scopes: [] },
      displayName: snapshot.displayName,
      handle: snapshot.handle,
      isDemo: true,
    });
  }

  // Follower history (the demo channels grow at different monthly rates) so goals have a pace to project from.
  const monthlyGrowth: Record<Platform, number> = { youtube: 0.035, twitch: 0.02, tiktok: 0.06 };
  for (const daysBack of [90, 60, 30, 7]) {
    for (const snapshot of data.snapshots) {
      const followers = Math.round((snapshot.followers ?? 0) / Math.pow(1 + monthlyGrowth[snapshot.platform], daysBack / 30.44));
      await repo.saveSnapshot(workspaceId, {
        ...snapshot,
        followers,
        capturedAt: new Date(now.getTime() - daysBack * 86_400_000).toISOString(),
      });
    }
  }

  // Backdated snapshots first so they sort before the live one.
  for (const daysBack of [7, 1]) {
    const capturedAt = new Date(now.getTime() - daysBack * 86_400_000).toISOString();
    const historical = data.items.flatMap((item) => {
      const views = backdatedViews(item, daysBack, now);
      return views === null ? [] : [{ ...item, views }];
    });
    await repo.recordMetrics(workspaceId, historical, capturedAt);
  }

  for (const platform of PLATFORMS) {
    await syncPlatform(workspaceId, platform);
  }

  // Viewer curves for the latest Twitch streams, as if the scheduler had sampled them.
  await repo.recordLiveSamples(workspaceId, demoLiveSamples(data.items));
}

export async function removeDemo(workspaceId: string): Promise<Platform[]> {
  const removed: Platform[] = [];
  for (const conn of await repo.listConnections(workspaceId)) {
    if (!conn.isDemo) continue;
    await repo.deleteConnection(workspaceId, conn.platform);
    removed.push(conn.platform);
  }
  return removed;
}

export async function hasDemo(workspaceId: string): Promise<boolean> {
  return (await repo.listConnections(workspaceId)).some((c) => c.isDemo);
}
