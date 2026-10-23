import { describe, expect, it } from "vitest";
import { formatRate, monthlyGrowthRate, projectGoal } from "./goals";

const NOW = new Date("2026-10-23T12:00:00.000Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("monthlyGrowthRate", () => {
  it("compounds the oldest→newest change within the pace window to a monthly rate", () => {
    const rate = monthlyGrowthRate(
      [
        { capturedAt: day(120), value: 50_000 }, // outside the 90-day window, ignored
        { capturedAt: day(60), value: 100_000 },
        { capturedAt: day(30), value: 104_000 },
        { capturedAt: day(0), value: 110_000 },
      ],
      NOW,
    );
    // 10% over 60 days ≈ 4.97%/month
    expect(rate).toBeCloseTo(Math.pow(1.1, 30.4375 / 60) - 1, 6);
  });

  it("needs at least a week of history", () => {
    expect(monthlyGrowthRate([{ capturedAt: day(3), value: 100 }, { capturedAt: day(0), value: 120 }], NOW)).toBeNull();
    expect(monthlyGrowthRate([{ capturedAt: day(0), value: 120 }], NOW)).toBeNull();
  });
});

describe("projectGoal", () => {
  const goal = { target: 1_000_000, targetDate: "2027-10-23" }; // 12 months out

  it("projects the landing date at the observed pace and the rate the deadline needs", () => {
    const p = projectGoal(goal, 500_000, 0.05, NOW);
    expect(p.progress).toBeCloseTo(0.5);
    expect(p.monthsLeft).toBeCloseTo(12, 0);
    expect(p.monthsAtPace).toBeCloseTo(Math.log(2) / Math.log(1.05), 5); // ≈ 14.2 months
    expect(p.verdict).toBe("behind");
    expect(p.requiredMonthly).toBeCloseTo(Math.pow(2, 1 / p.monthsLeft) - 1, 5); // ≈ 5.9%
    expect(p.projectedDate && new Date(p.projectedDate) > new Date("2027-10-23")).toBe(true);
  });

  it("is on track when the pace lands before the deadline, and reports reached/stalled/no-pace", () => {
    expect(projectGoal(goal, 500_000, 0.08, NOW).verdict).toBe("on_track");
    expect(projectGoal(goal, 1_200_000, 0.08, NOW).verdict).toBe("reached");
    expect(projectGoal(goal, 500_000, -0.01, NOW).verdict).toBe("stalled");
    expect(projectGoal(goal, 500_000, null, NOW)).toMatchObject({ verdict: "no_pace", monthsAtPace: null, projectedDate: null });
  });

  it("formats rates", () => {
    expect(formatRate(0.0312)).toBe("+3.1%/mo");
    expect(formatRate(0.25)).toBe("+25%/mo");
    expect(formatRate(null)).toBe("—");
  });
});
