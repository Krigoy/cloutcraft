import { describe, expect, it } from "vitest";
import type { ChannelSnapshot, ContentItem } from "@/lib/platforms/types";
import { defaultRates } from "./rates";
import { DAYS_PER_MONTH, estimateAll, estimateItem, twitchViewerHours } from "./estimate";

const NOW = new Date("2026-10-21T12:00:00Z");
const rates = defaultRates();

function item(partial: Partial<ContentItem> & Pick<ContentItem, "platform" | "kind">): ContentItem {
  const id = partial.externalId ?? Math.random().toString(36).slice(2);
  return {
    id: `${partial.platform}:${id}`,
    externalId: id,
    title: "t",
    url: "https://example.com",
    publishedAt: "2026-10-01T00:00:00Z",
    durationSec: 600,
    views: 10_000,
    ...partial,
  };
}

describe("estimateItem", () => {
  it("uses reported revenue when YouTube provides it", () => {
    const e = estimateItem(item({ platform: "youtube", kind: "video", reportedRevenueUsd: 42.5 }), rates);
    expect(e.basis).toBe("reported");
    expect(e.low).toBe(42.5);
    expect(e.high).toBe(42.5);
  });

  it("models YouTube long-form from views × RPM", () => {
    const e = estimateItem(item({ platform: "youtube", kind: "video", views: 10_000 }), rates);
    expect(e.basis).toBe("modeled");
    expect(e.mid).toBeCloseTo(25, 5);
    expect(e.low).toBeCloseTo(10, 5);
    expect(e.high).toBeCloseTo(80, 5);
  });

  it("gives TikToks under a minute nothing and longer ones Creator Rewards", () => {
    const short = estimateItem(item({ platform: "tiktok", kind: "short", durationSec: 45, views: 1_000_000 }), rates);
    expect(short.basis).toBe("none");
    expect(short.mid).toBe(0);

    const long = estimateItem(item({ platform: "tiktok", kind: "video", durationSec: 90, views: 100_000 }), rates);
    expect(long.basis).toBe("modeled");
    expect(long.mid).toBeCloseTo((100_000 * 0.7 * 0.7) / 1000, 5);
  });

  it("models Twitch ads from viewer-hours and falls back to VOD views", () => {
    const withAvg = item({ platform: "twitch", kind: "live", durationSec: 7200, avgViewers: 100, views: 900 });
    expect(twitchViewerHours(withAvg)).toEqual({ hours: 200, approximated: false });
    const e = estimateItem(withAvg, rates);
    expect(e.mid).toBeCloseTo((200 * 4 * 1.9) / 1000, 5);

    const withoutAvg = item({ platform: "twitch", kind: "live", durationSec: 7200, views: 900 });
    expect(twitchViewerHours(withoutAvg).approximated).toBe(true);
    expect(twitchViewerHours(withoutAvg, 0.5).hours).toBeCloseTo(900 * 2 * 0.5, 6);
    expect(estimateItem(withoutAvg, rates).notes.join(" ")).toMatch(/approximated/);
  });
});

describe("estimateAll", () => {
  it("allocates Twitch subs and Bits across streams by viewer-hours", () => {
    const snapshot: ChannelSnapshot = {
      platform: "twitch",
      capturedAt: NOW.toISOString(),
      displayName: "demo",
      subs: { tier1: 100, tier2: 0, tier3: 0, gifted: 0 },
      bitsInWindow: 10_000,
      windowDays: 90,
    };
    const a = item({ platform: "twitch", kind: "live", externalId: "a", durationSec: 7200, avgViewers: 100, publishedAt: "2026-10-10T00:00:00Z" });
    const b = item({ platform: "twitch", kind: "live", externalId: "b", durationSec: 3600, avgViewers: 100, publishedAt: "2026-10-12T00:00:00Z" });
    const { items, channels } = estimateAll([a, b], { twitch: snapshot }, rates, { windowDays: 90, now: NOW });

    const expectedSubs = 100 * 5.99 * 0.5 * (90 / DAYS_PER_MONTH);
    const subsLines = items.flatMap((e) => e.estimate.breakdown.filter((l) => l.source === "subs"));
    expect(subsLines.reduce((s, l) => s + l.mid, 0)).toBeCloseTo(expectedSubs, 6);
    // 2/3 of the viewer-hours belong to stream a.
    expect(subsLines[0].mid / expectedSubs).toBeCloseTo(2 / 3, 6);

    expect(channels.twitch?.bySource.bits?.mid).toBeCloseTo(100, 6);
    expect(channels.twitch?.total.mid).toBeCloseTo(
      expectedSubs + 100 + items.reduce((s, e) => s + (e.estimate.breakdown.find((l) => l.source === "ads")?.mid ?? 0), 0),
      6,
    );
  });

  it("calibrates modelled YouTube items to the reported channel total", () => {
    const snapshot: ChannelSnapshot = {
      platform: "youtube",
      capturedAt: NOW.toISOString(),
      displayName: "demo",
      reportedRevenueUsdInWindow: 100,
      windowDays: 90,
    };
    const reported = item({ platform: "youtube", kind: "video", externalId: "r", reportedRevenueUsd: 40 });
    const modeled = item({ platform: "youtube", kind: "short", externalId: "m", durationSec: 30, views: 250_000 }); // mid = 25
    const { items, channels } = estimateAll([reported, modeled], { youtube: snapshot }, rates, { windowDays: 90, now: NOW });

    const m = items.find((e) => e.item.externalId === "m")!;
    expect(m.estimate.basis).toBe("calibrated");
    expect(m.estimate.mid).toBeCloseTo(60, 6);
    expect(channels.youtube?.total.mid).toBeCloseTo(100, 6);
    expect(channels.youtube?.basis).toBe("calibrated");
  });

  it("excludes items outside the window from channel totals", () => {
    const recent = item({ platform: "youtube", kind: "video", externalId: "new", publishedAt: "2026-10-15T00:00:00Z" });
    const old = item({ platform: "youtube", kind: "video", externalId: "old", publishedAt: "2026-01-01T00:00:00Z" });
    const { channels } = estimateAll([recent, old], {}, rates, { windowDays: 30, now: NOW });
    expect(channels.youtube?.total.mid).toBeCloseTo(25, 6);
  });
});
