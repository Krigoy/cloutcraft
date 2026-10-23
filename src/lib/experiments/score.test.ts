import { describe, expect, it } from "vitest";
import type { EstimatedItem } from "@/lib/earnings/estimate";
import { describeSegment, matchesSegment, scoreExperiment, type ExperimentSpec } from "./score";

const NOW = new Date("2026-10-23T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function entry(opts: { id: string; daysAgo: number; views: number; kind?: "video" | "short"; platform?: "youtube" | "tiktok"; durationSec?: number; mid?: number }): EstimatedItem {
  return {
    item: {
      id: `${opts.platform ?? "youtube"}:${opts.id}`,
      platform: opts.platform ?? "youtube",
      externalId: opts.id,
      kind: opts.kind ?? "video",
      title: opts.id,
      url: "",
      publishedAt: day(opts.daysAgo),
      durationSec: opts.durationSec ?? 600,
      views: opts.views,
      likes: Math.round(opts.views * 0.05),
    },
    estimate: { low: 0, mid: opts.mid ?? opts.views / 1000, high: 0, basis: "modeled", breakdown: [], notes: [] },
  };
}

const spec: ExperimentSpec = {
  segment: { platform: "youtube", kind: "video" },
  metric: "median_views",
  targetLift: 0.2,
  startedAt: day(14),
  endsAt: day(-14), // 4-week run, half way through
};

describe("scoreExperiment", () => {
  it("is too early with fewer than three treatment uploads", () => {
    const items = [entry({ id: "t1", daysAgo: 3, views: 500 }), entry({ id: "b1", daysAgo: 30, views: 100 })];
    const s = scoreExperiment(spec, items, NOW);
    expect(s.treatment.n).toBe(1);
    expect(s.confidence).toBe("too_early");
    expect(s.verdict).toBe("inconclusive");
    expect(s.progress).toBeCloseTo(0.5, 1);
    expect(s.daysLeft).toBe(14);
  });

  it("computes raw lift from medians and marks a win past the target", () => {
    const items = [
      ...[1, 4, 7, 10].map((d, i) => entry({ id: `t${i}`, daysAgo: d, views: 1500 })),
      ...[20, 30, 40, 50].map((d, i) => entry({ id: `b${i}`, daysAgo: d, views: 1000 })),
    ];
    const s = scoreExperiment(spec, items, NOW);
    expect(s.rawLift).toBeCloseTo(0.5);
    expect(s.control).toBeNull(); // no shorts to compare against
    expect(s.adjustedLift).toBeCloseTo(0.5);
    expect(s.confidence).toBe("early");
    expect(s.verdict).toBe("won");
  });

  it("corrects the lift by the control group's own change", () => {
    const items = [
      // Treatment doubled…
      ...[1, 4, 7, 10].map((d, i) => entry({ id: `t${i}`, daysAgo: d, views: 2000 })),
      ...[20, 30, 40, 50].map((d, i) => entry({ id: `b${i}`, daysAgo: d, views: 1000 })),
      // …but so did everything else on the channel (shorts), so the adjusted lift is ~0.
      ...[2, 5, 8].map((d, i) => entry({ id: `cs${i}`, daysAgo: d, views: 20000, kind: "short" })),
      ...[21, 31, 41].map((d, i) => entry({ id: `cb${i}`, daysAgo: d, views: 10000, kind: "short" })),
    ];
    const s = scoreExperiment(spec, items, NOW);
    expect(s.rawLift).toBeCloseTo(1);
    expect(s.control?.after.n).toBe(3);
    expect(s.adjustedLift).toBeCloseTo(0);
    expect(s.verdict).toBe("inconclusive");
  });

  it("flags a loss when the treatment falls behind", () => {
    const items = [
      ...[1, 4, 7].map((d, i) => entry({ id: `t${i}`, daysAgo: d, views: 500 })),
      ...[20, 30, 40].map((d, i) => entry({ id: `b${i}`, daysAgo: d, views: 1000 })),
    ];
    expect(scoreExperiment(spec, items, NOW).verdict).toBe("lost");
  });

  it("scores cadence as uploads per week without a control", () => {
    const cadence: ExperimentSpec = { ...spec, metric: "uploads_per_week", startedAt: day(28), endsAt: day(0) };
    const items = [
      ...[1, 3, 5, 8, 10, 12, 15, 18, 22, 25].map((d, i) => entry({ id: `t${i}`, daysAgo: d, views: 1 })), // 10 in 4 weeks
      ...[35, 50, 65, 80, 95, 110].map((d, i) => entry({ id: `b${i}`, daysAgo: d, views: 1 })), // 6 in ~13 weeks
    ];
    const s = scoreExperiment(cadence, items, NOW);
    expect(s.treatment.value).toBeCloseTo(2.5);
    expect(s.baseline.value).toBeCloseTo(6 / (90 / 7));
    expect(s.control).toBeNull();
    expect(s.ended).toBe(true);
    expect(s.verdict).toBe("won");
  });

  it("matches segments on weekday and duration", () => {
    const friday = entry({ id: "f", daysAgo: 0, views: 1, durationSec: 75, platform: "tiktok" }); // 2026-10-23 is a Friday
    expect(matchesSegment(friday, { platform: "tiktok", weekdays: [5], minDurationSec: 60 }, "UTC")).toBe(true);
    expect(matchesSegment(friday, { platform: "tiktok", weekdays: [4] }, "UTC")).toBe(false);
    expect(matchesSegment(friday, { maxDurationSec: 60 }, "UTC")).toBe(false);
    expect(describeSegment({ platform: "tiktok", kind: "video", weekdays: [5], minDurationSec: 60 })).toEqual(["TikTok", "Videos", "Fri", "≥ 1 min"]);
    expect(describeSegment({})).toEqual(["All uploads"]);
  });
});
