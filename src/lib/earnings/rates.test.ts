import { describe, expect, it } from "vitest";
import { defaultRates, RATE_DEFINITIONS, RATE_KEYS, resolveRates } from "./rates";

describe("rates", () => {
  it("defines every key with ordered bands", () => {
    const rates = defaultRates();
    for (const key of RATE_KEYS) {
      const r = rates[key];
      expect(r.low).toBeLessThanOrEqual(r.mid);
      expect(r.mid).toBeLessThanOrEqual(r.high);
    }
    expect(RATE_DEFINITIONS.map((d) => d.key).sort()).toEqual([...RATE_KEYS].sort());
  });

  it("scales low/high proportionally when only mid is overridden", () => {
    const rates = resolveRates({ "youtube.video.rpm.mid": 5 });
    expect(rates["youtube.video.rpm"]).toEqual({ low: 2, mid: 5, high: 16 });
  });

  it("honours explicit low/high and keeps bands ordered", () => {
    const rates = resolveRates({
      "twitch.ad.cpm.low": 3, // above the default mid: clamps to mid
      "twitch.ad.cpm.high": 1, // below the default mid: clamps to mid
    });
    expect(rates["twitch.ad.cpm"].low).toBe(1.9);
    expect(rates["twitch.ad.cpm"].high).toBe(1.9);
  });

  it("ignores unknown or invalid overrides", () => {
    const rates = resolveRates({ "nope.mid": 3, "tiktok.video.rpm.mid": -1, "tiktok.video.rpm.high": NaN });
    expect(rates["tiktok.video.rpm"]).toEqual(defaultRates()["tiktok.video.rpm"]);
  });
});
