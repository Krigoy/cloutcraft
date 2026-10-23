import { describe, expect, it } from "vitest";
import type { EstimatedItem } from "@/lib/earnings/estimate";
import { change, summarizeStreams, viewerCurve } from "./streams";

const NOW = new Date("2026-10-23T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function stream(id: string, daysAgo: number, avg: number, peak = avg * 2, durationSec = 7200, mid = 10): EstimatedItem {
  return {
    item: {
      id: `twitch:${id}`,
      platform: "twitch",
      externalId: id,
      kind: "live",
      title: `Stream ${id}`,
      url: "",
      publishedAt: day(daysAgo),
      durationSec,
      views: avg * 10,
      avgViewers: avg,
      peakViewers: peak,
      streamId: `s-${id}`,
    },
    estimate: { low: 0, mid, high: 0, basis: "modeled", breakdown: [], notes: [] },
  };
}

describe("summarizeStreams", () => {
  it("builds rows for the window, compares with the previous one, and ranks against the median", () => {
    const items = [
      stream("a", 1, 200, 500),
      stream("b", 5, 100),
      stream("c", 9, 100),
      stream("d", 40, 80, 90, 3600, 4), // previous period
      { ...stream("v", 2, 1), item: { ...stream("v", 2, 1).item, kind: "video" as const } }, // not a stream
    ];
    const { streams, kpis } = summarizeStreams(items, [], 30, NOW);
    expect(streams.map((s) => s.key)).toEqual(["twitch:a", "twitch:b", "twitch:c"]);
    expect(streams[0].vsMedian).toBeCloseTo(2); // 200 ÷ median(200,100,100)
    expect(kpis).toMatchObject({ streams: 3, streamsPrevious: 1, hours: 6, hoursPrevious: 1, medianAvgViewers: 100, medianAvgViewersPrevious: 80, earningsMid: 30, earningsPreviousMid: 4 });
    expect(kpis.bestPeak).toEqual({ viewers: 500, title: "Stream a" });
  });

  it("adds a broadcast in progress from its latest live sample", () => {
    const { streams } = summarizeStreams([stream("a", 1, 200)], [{ platform: "twitch", streamId: "now", capturedAt: NOW.toISOString(), viewerCount: 340, title: "Live!", startedAt: new Date(NOW.getTime() - 90 * 60_000).toISOString() }], 30, NOW);
    expect(streams[0].key).toBe("live:twitch:now");
    expect(streams[0].live?.viewers).toBe(340);
    expect(streams[0].durationSec).toBe(5400);
    expect(streams).toHaveLength(2);
  });
});

describe("viewerCurve / change", () => {
  it("converts samples to minutes since start", () => {
    const start = "2026-10-20T20:00:00.000Z";
    const pts = viewerCurve(
      [
        { capturedAt: "2026-10-20T20:10:00.000Z", viewerCount: 50 },
        { capturedAt: "2026-10-20T20:05:00.000Z", viewerCount: 20 },
      ],
      start,
    );
    expect(pts).toEqual([
      { minute: 5, viewers: 20 },
      { minute: 10, viewers: 50 },
    ]);
    expect(viewerCurve([], start)).toEqual([]);
    expect(change(120, 100)).toBeCloseTo(0.2);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
  });
});
