import { describe, expect, it } from "vitest";
import type { ContentItem } from "@/lib/platforms/types";
import { defaultRates } from "@/lib/earnings/rates";
import { estimateAll } from "@/lib/earnings/estimate";
import { buildDemoData } from "@/lib/demo/generate";
import { analyze, median, percentile } from "./analyze";

const NOW = new Date("2026-10-21T12:00:00Z");
const rates = defaultRates();

/** Build an item published `daysAgo` days before NOW. */
function item(
  daysAgo: number,
  partial: Partial<ContentItem> & Pick<ContentItem, "platform" | "kind" | "externalId">,
): ContentItem {
  const publishedAt = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return {
    id: `${partial.platform}:${partial.externalId}`,
    title: `Item ${partial.externalId}`,
    url: "https://example.com",
    publishedAt: publishedAt.toISOString(),
    durationSec: 600,
    views: 10_000,
    ...partial,
  };
}

function run(items: ContentItem[], windowDays = 90) {
  const { items: estimated } = estimateAll(items, {}, rates, { windowDays, now: NOW });
  return analyze({ items: estimated, snapshots: {}, windowDays, now: NOW });
}

/** Days ago for the n-th most recent occurrence of a UTC weekday (0 = Sunday). */
function daysAgoForWeekday(weekday: number, n: number): number {
  const today = NOW.getUTCDay();
  const first = (today - weekday + 7) % 7 || 7; // never today, so uploads are "mature"
  return first + 7 * n;
}

describe("stats helpers", () => {
  it("computes median and percentiles", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(median([])).toBe(0);
  });
});

describe("analyze findings", () => {
  it("detects a weekday lift within a format", () => {
    const items: ContentItem[] = [];
    for (let n = 0; n < 6; n++) {
      items.push(item(daysAgoForWeekday(2, n), { platform: "youtube", kind: "video", externalId: `tue${n}`, views: 20_000 }));
      items.push(item(daysAgoForWeekday(5, n), { platform: "youtube", kind: "video", externalId: `fri${n}`, views: 10_000 }));
    }
    const report = run(items);
    const timing = report.findings.find((f) => f.type === "timing");
    expect(timing).toBeDefined();
    expect(timing?.metrics.bestDay).toBe("Tuesday");
    expect(timing?.metrics.kind).toBe("video");
  });

  it("flags a format that dominates uploads but not earnings", () => {
    const items: ContentItem[] = [];
    for (let n = 0; n < 12; n++) {
      items.push(item(3 + n * 5, { platform: "youtube", kind: "short", externalId: `s${n}`, durationSec: 30, views: 50_000 }));
    }
    for (let n = 0; n < 6; n++) {
      items.push(item(5 + n * 12, { platform: "youtube", kind: "video", externalId: `v${n}`, views: 20_000 }));
    }
    const report = run(items);
    const mix = report.findings.find((f) => f.type === "format_mix" && f.metrics.kind === "short");
    expect(mix).toBeDefined();
    expect(mix?.severity).toBe("opportunity");
    const shorts = report.formatMix.find((m) => m.kind === "short")!;
    expect(shorts.shareOfItems).toBeCloseTo(12 / 18, 6);
    expect(shorts.shareOfEarnings).toBeLessThan(0.2);
  });

  it("flags TikToks under a minute as unmonetised reach", () => {
    const items = Array.from({ length: 6 }, (_, n) =>
      item(2 + n * 7, { platform: "tiktok", kind: "short", externalId: `t${n}`, durationSec: 45 + n, views: 80_000 }),
    );
    const report = run(items);
    const f = report.findings.find((x) => x.type === "monetization" && x.platform === "tiktok");
    expect(f).toBeDefined();
    expect(f?.metrics.items).toBe(6);
  });

  it("warns when a regular schedule goes quiet", () => {
    const items = Array.from({ length: 8 }, (_, n) =>
      item(40 + n * 3, { platform: "twitch", kind: "live", externalId: `l${n}`, durationSec: 7200, avgViewers: 100 }),
    );
    const report = run(items);
    const stale = report.findings.find((f) => f.type === "cadence" && /No Twitch live streams in/.test(f.title));
    expect(stale).toBeDefined();
    const cadence = report.cadence.find((c) => c.platform === "twitch")!;
    expect(cadence.medianGapDays).toBeCloseTo(3, 6);
    expect(cadence.daysSinceLast).toBeGreaterThan(39);
  });

  it("surfaces high-engagement, low-reach items", () => {
    const items = Array.from({ length: 10 }, (_, n) =>
      item(2 + n * 4, {
        platform: "youtube",
        kind: "video",
        externalId: `e${n}`,
        views: n === 0 ? 4_000 : 10_000 + n * 100,
        likes: n === 0 ? 800 : 300,
        comments: 20,
      }),
    );
    const report = run(items);
    const gem = report.findings.find((f) => f.type === "engagement");
    expect(gem).toBeDefined();
    expect(String(gem?.metrics.titles)).toContain("Item e0");
  });

  it("reports growth versus the previous window", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, n) => item(5 + n * 10, { platform: "youtube", kind: "video", externalId: `cur${n}`, views: 30_000 })),
      ...Array.from({ length: 5 }, (_, n) => item(95 + n * 10, { platform: "youtube", kind: "video", externalId: `prev${n}`, views: 10_000 })),
    ];
    const report = run(items);
    expect(report.growth.viewsCurrent).toBe(150_000);
    expect(report.growth.viewsPrevious).toBe(50_000);
    expect(report.growth.viewsChange).toBeCloseTo(2, 6);
    expect(report.findings.some((f) => f.type === "growth" && f.severity === "positive")).toBe(true);
  });
});

describe("analyze on demo data", () => {
  it("produces baselines for every platform and format and sensible totals", () => {
    const demo = buildDemoData(NOW);
    const snapshots = Object.fromEntries(demo.snapshots.map((s) => [s.platform, s]));
    const { items } = estimateAll(demo.items, snapshots, rates, { windowDays: 90, now: NOW });
    const report = analyze({ items, snapshots, windowDays: 90, now: NOW });

    const keys = report.baselines.map((b) => `${b.platform}:${b.kind}`).sort();
    expect(keys).toEqual(
      ["tiktok:short", "tiktok:video", "twitch:live", "youtube:live", "youtube:short", "youtube:video"].sort(),
    );
    expect(report.totals.items).toBeGreaterThan(100);
    expect(report.totals.earnings.low).toBeLessThanOrEqual(report.totals.earnings.mid);
    expect(report.totals.earnings.mid).toBeLessThanOrEqual(report.totals.earnings.high);
    expect(report.findings.length).toBeGreaterThan(3);
    expect(new Set(demo.items.map((i) => i.id)).size).toBe(demo.items.length);
  });
});
