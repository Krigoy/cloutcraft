import { describe, expect, it } from "vitest";
import { parseIsoDuration, parseTwitchDuration, toInt, toOptionalInt } from "./parse";

describe("duration parsing", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT12M")).toBe(720);
    expect(parseIsoDuration("P1DT1H")).toBe(90_000);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration(undefined)).toBe(0);
    expect(parseIsoDuration("garbage")).toBe(0);
  });

  it("parses Twitch durations", () => {
    expect(parseTwitchDuration("3h20m5s")).toBe(12_005);
    expect(parseTwitchDuration("45m")).toBe(2700);
    expect(parseTwitchDuration("12s")).toBe(12);
    expect(parseTwitchDuration("")).toBe(0);
  });

  it("coerces counts", () => {
    expect(toInt("1234")).toBe(1234);
    expect(toInt(undefined)).toBe(0);
    expect(toOptionalInt("")).toBeUndefined();
    expect(toOptionalInt("7")).toBe(7);
  });
});
