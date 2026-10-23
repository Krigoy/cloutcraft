import { beforeAll, describe, expect, it } from "vitest";
import type { ContentItem } from "@/lib/platforms/types";

/*
 * Runs the real repository SQL against an in-memory Postgres (PGlite), the
 * same engine used for local development. Covers the queries that differ
 * most from the original SQLite version: bulk upserts, DISTINCT ON reads,
 * workspace isolation and single-use OAuth state.
 */

process.env.APP_ENCRYPTION_KEY = "test-key-0123456789abcdef0123456789abcdef";
process.env.PGLITE_PATH = ":memory:";
delete process.env.DATABASE_URL;

type Repo = typeof import("./repo");
let repo: Repo;

const A = "user_alice";
const B = "user_bob";

function item(id: string, views: number, publishedAt = "2026-10-01T00:00:00.000Z"): ContentItem {
  return {
    id: `youtube:${id}`,
    platform: "youtube",
    externalId: id,
    kind: "video",
    title: `Video ${id}`,
    url: `https://www.youtube.com/watch?v=${id}`,
    publishedAt,
    durationSec: 600,
    views,
  };
}

beforeAll(async () => {
  repo = await import("./repo");
});

describe("connections", () => {
  it("encrypts tokens, upserts, and isolates workspaces", async () => {
    await repo.upsertConnection(A, "youtube", { tokens: { accessToken: "secret-a", scopes: ["s1"] }, displayName: "Alice" });
    await repo.upsertConnection(B, "youtube", { tokens: { accessToken: "secret-b", scopes: [] }, isDemo: true });
    // Upsert keeps the display name when the new value is missing.
    await repo.upsertConnection(A, "youtube", { tokens: { accessToken: "secret-a2", scopes: ["s1", "s2"] } });

    const [a] = await repo.listConnections(A);
    expect(a.displayName).toBe("Alice");
    expect(a.scopes).toEqual(["s1", "s2"]);
    expect(a.isDemo).toBe(false);
    expect((await repo.getConnection(A, "youtube"))?.tokens.accessToken).toBe("secret-a2");
    expect((await repo.listConnections(B))[0].isDemo).toBe(true);
    expect(await repo.listWorkspacesWithConnections()).toEqual([A, B]);
  });

  it("records sync status", async () => {
    await repo.markSynced(A, "youtube", "boom");
    expect((await repo.listConnections(A))[0].lastSyncError).toBe("boom");
    await repo.markSynced(A, "youtube", null);
    const [a] = await repo.listConnections(A);
    expect(a.lastSyncError).toBeNull();
    expect(a.lastSyncedAt).toBeTruthy();
  });
});

describe("content and metrics", () => {
  it("bulk-upserts items per workspace without cross-talk", async () => {
    await repo.upsertContentItems(A, [item("v1", 100), item("v2", 200, "2026-10-05T00:00:00.000Z")]);
    await repo.upsertContentItems(B, [item("v1", 999)]); // same id, other user
    await repo.upsertContentItems(A, [item("v1", 150)]); // update

    const a = await repo.listContentItems(A);
    expect(a.map((i) => [i.externalId, i.views])).toEqual([
      ["v2", 200],
      ["v1", 150],
    ]);
    expect((await repo.listContentItems(B)).map((i) => i.views)).toEqual([999]);
    expect(await repo.listContentItems(A, { sinceIso: "2026-10-03T00:00:00.000Z" })).toHaveLength(1);
  });

  it("returns the latest view count at or before a cutoff", async () => {
    await repo.recordMetrics(A, [item("v1", 100), item("v2", 50)], "2026-10-10T00:00:00.000Z");
    await repo.recordMetrics(A, [item("v1", 140)], "2026-10-11T00:00:00.000Z");
    await repo.recordMetrics(A, [item("v1", 3_000_000_000)], "2026-10-12T00:00:00.000Z"); // > int32
    await repo.recordMetrics(B, [item("v1", 7)], "2026-10-11T00:00:00.000Z");

    const asOf11 = await repo.viewsAsOf(A, "2026-10-11T12:00:00.000Z");
    expect(asOf11.get("youtube:v1")).toBe(140);
    expect(asOf11.get("youtube:v2")).toBe(50);
    expect((await repo.viewsAsOf(A, "2026-10-13T00:00:00.000Z")).get("youtube:v1")).toBe(3_000_000_000);
    expect((await repo.viewsAsOf(B, "2026-10-13T00:00:00.000Z")).get("youtube:v1")).toBe(7);
  });

  it("deletes items and their metric history", async () => {
    await repo.deleteContentItems(A, ["youtube:v2"]);
    expect((await repo.listContentItems(A)).map((i) => i.externalId)).toEqual(["v1"]);
    expect((await repo.viewsAsOf(A, "2026-10-13T00:00:00.000Z")).has("youtube:v2")).toBe(false);
  });
});

describe("snapshots, live samples and OAuth state", () => {
  it("returns the newest snapshot per platform", async () => {
    const base = { displayName: "x", windowDays: 90 } as const;
    await repo.saveSnapshot(A, { ...base, platform: "youtube", capturedAt: "2026-10-01T00:00:00Z", followers: 1 });
    await repo.saveSnapshot(A, { ...base, platform: "youtube", capturedAt: "2026-10-02T00:00:00Z", followers: 2 });
    await repo.saveSnapshot(A, { ...base, platform: "twitch", capturedAt: "2026-10-01T00:00:00Z", followers: 9 });
    const snaps = await repo.latestSnapshots(A);
    expect(snaps.youtube?.followers).toBe(2);
    expect(snaps.twitch?.followers).toBe(9);
  });

  it("aggregates live samples per stream", async () => {
    const now = Date.now();
    for (const [i, viewers] of [100, 200, 300].entries()) {
      await repo.recordLiveSample(A, {
        platform: "twitch",
        streamId: "s1",
        capturedAt: new Date(now - (2 - i) * 60_000).toISOString(),
        viewerCount: viewers,
        title: "Live",
      });
    }
    const stats = (await repo.liveStatsByStream(A, "twitch")).get("s1")!;
    expect(stats).toMatchObject({ samples: 3, avgViewers: 200, peakViewers: 300 });
    const live = await repo.currentlyLive(A, 5);
    expect(live).toHaveLength(1);
    expect(live[0].viewerCount).toBe(300);
    expect(await repo.currentlyLive(B, 5)).toHaveLength(0);
  });

  it("consumes OAuth state exactly once", async () => {
    await repo.createOAuthState(A, "twitch", "state-123", "verifier");
    expect(await repo.consumeOAuthState("state-123")).toEqual({
      workspaceId: A,
      platform: "twitch",
      codeVerifier: "verifier",
    });
    expect(await repo.consumeOAuthState("state-123")).toBeNull();
  });
});

describe("rates, coach runs and cleanup", () => {
  it("applies rate override changes transactionally", async () => {
    await repo.setRateOverrides(A, { "youtube.video.rpm.mid": 4, "tiktok.video.rpm.mid": 1 });
    await repo.setRateOverrides(A, { "tiktok.video.rpm.mid": null });
    expect(await repo.getRateOverrides(A)).toEqual({ "youtube.video.rpm.mid": 4 });
    await repo.clearRateOverrides(A);
    expect(await repo.getRateOverrides(A)).toEqual({});
  });

  it("stores coach runs as conversation threads", async () => {
    const first = await repo.saveCoachRun(A, { model: "gemini/x", input: {}, output: { summary: "s1" }, question: "How do I grow?" });
    expect(first.threadId).toBe(first.id);
    const second = await repo.saveCoachRun(A, { model: "gemini/x", input: {}, output: { summary: "s2" }, question: "And Shorts?", threadId: first.threadId });
    const other = await repo.saveCoachRun(A, { model: "groq/y", input: {}, output: { summary: "s3" } });

    const threads = await repo.listCoachThreads(A);
    expect(threads.map((x) => [x.threadId, x.title, x.turns])).toEqual([
      [other.threadId, "", 1],
      [first.threadId, "How do I grow?", 2],
    ]);
    const runs = await repo.listThreadRuns<{ summary: string }>(A, first.threadId);
    expect(runs.map((r) => [r.id, r.question, r.output.summary])).toEqual([
      [first.id, "How do I grow?", "s1"],
      [second.id, "And Shorts?", "s2"],
    ]);
    expect(await repo.latestThreadId(A)).toBe(other.threadId);
    expect(await repo.listThreadRuns(B, first.threadId)).toHaveLength(0); // other user can't read it
    await repo.deleteCoachThread(B, first.threadId); // ...or delete it
    expect(await repo.listThreadRuns(A, first.threadId)).toHaveLength(2);
    await repo.deleteCoachThread(A, first.threadId);
    expect((await repo.listCoachThreads(A)).map((x) => x.threadId)).toEqual([other.threadId]);
  });

  it("removes a connection and everything synced for it", async () => {
    await repo.deleteConnection(A, "youtube");
    expect(await repo.listConnections(A)).toHaveLength(0);
    expect(await repo.listContentItems(A)).toHaveLength(0);
    expect((await repo.viewsAsOf(A, "2026-12-31T00:00:00.000Z")).size).toBe(0);
    // Bob is untouched.
    expect(await repo.listContentItems(B)).toHaveLength(1);
  });
});

describe("experiments", () => {
  it("creates, lists, closes and deletes per workspace", async () => {
    const running = await repo.createExperiment(A, {
      title: "Friday TikToks",
      metric: "median_views",
      segment: { platform: "tiktok", weekdays: [5] },
      targetLift: 0.2,
      startedAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-29T00:00:00.000Z",
      source: { runId: 7, index: 0 },
    });
    const sooner = await repo.createExperiment(A, {
      title: "Longer videos",
      method: "Cut nothing under 10 min",
      metric: "earnings_per_item",
      segment: { platform: "youtube", kind: "video", minDurationSec: 600 },
      targetLift: 0.15,
      startedAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-15T00:00:00.000Z",
    });
    await repo.createExperiment(B, { title: "Bob's", metric: "uploads_per_week", segment: {}, targetLift: 0.1, startedAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-11-01T00:00:00.000Z" });

    let list = await repo.listExperiments(A);
    expect(list.map((x) => x.id)).toEqual([sooner, running]); // active ones, soonest to finish first
    expect(list[1].segment).toEqual({ platform: "tiktok", weekdays: [5] });
    expect(list[1].source).toEqual({ runId: 7, index: 0 });
    expect(list[0].source).toBeNull();

    await repo.setExperimentStatus(A, sooner, "won");
    list = await repo.listExperiments(A);
    expect(list.map((x) => [x.id, x.status])).toEqual([
      [running, "active"],
      [sooner, "won"],
    ]);
    expect(list[1].closedAt).toBeTruthy();

    await repo.deleteExperiment(B, running); // not Bob's → no-op
    expect(await repo.listExperiments(A)).toHaveLength(2);
    await repo.deleteExperiment(A, running);
    expect((await repo.listExperiments(A)).map((x) => x.id)).toEqual([sooner]);
    expect(await repo.listExperiments(B)).toHaveLength(1);
  });
});

describe("payout reports", () => {
  it("stores, lists newest-period first, and deletes per workspace", async () => {
    const older = await repo.addPayoutReport(A, { platform: "youtube", periodStart: "2026-08-01", periodEnd: "2026-08-31", amountUsd: 120.5, source: "youtube_studio", note: null });
    const newer = await repo.addPayoutReport(A, { platform: "twitch", periodStart: "2026-09-01", periodEnd: "2026-09-30", amountUsd: 80, source: "twitch_payout", note: "incl. bits" });
    await repo.addPayoutReport(B, { platform: "youtube", periodStart: "2026-09-01", periodEnd: "2026-09-30", amountUsd: 1, source: "other", note: null });

    const list = await repo.listPayoutReports(A);
    expect(list.map((p) => [p.id, p.platform, p.amountUsd, p.note])).toEqual([
      [newer, "twitch", 80, "incl. bits"],
      [older, "youtube", 120.5, null],
    ]);
    await repo.deletePayoutReport(B, older); // not Bob's → no-op
    expect(await repo.listPayoutReports(A)).toHaveLength(2);
    await repo.deletePayoutReport(A, older);
    expect((await repo.listPayoutReports(A)).map((p) => p.id)).toEqual([newer]);
    expect(await repo.listPayoutReports(B)).toHaveLength(1);
  });
});
