import { describe, expect, it } from "vitest";
import { followerMilestones } from "./coach-math";
import { toJsonSchema } from "./json-schema";
import { CoachReportSchema } from "./schema";

describe("toJsonSchema", () => {
  it("produces a closed object schema without the $schema header", () => {
    const json = toJsonSchema(CoachReportSchema) as {
      $schema?: string;
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, { type?: string; items?: { properties?: Record<string, unknown> } }>;
    };
    expect(json.$schema).toBeUndefined();
    expect(json.type).toBe("object");
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual(["answer", "summary", "strengths", "recommendations", "thirtyDayPlan", "experiments", "caveats"]);
    expect(json.properties.recommendations.type).toBe("array");
    expect(Object.keys(json.properties.recommendations.items?.properties ?? {})).toContain("evidence");
  });

  it("round-trips a valid report through the zod schema", () => {
    const sample = {
      answer: "",
      summary: "s",
      strengths: ["a"],
      recommendations: [
        {
          title: "t",
          category: "timing",
          priority: "high",
          effort: "low",
          rationale: "r",
          mechanism: "m",
          playbook: ["p1", "p2"],
          expectedImpact: "i",
          metricsToWatch: ["CTR ≥ 6%"],
          pitfall: "x",
          evidence: ["F1"],
        },
      ],
      thirtyDayPlan: [{ week: 1, focus: "f", actions: ["a"] }],
      experiments: [
        {
          hypothesis: "h",
          method: "m",
          successMetric: "s",
          durationWeeks: 2,
          tracking: { platform: "tiktok", kind: null, weekdays: [5], minDurationSec: 60, maxDurationSec: null, metric: "median_views", targetLift: 0.2 },
        },
      ],
      caveats: [],
    };
    expect(CoachReportSchema.safeParse(sample).success).toBe(true);
    expect(CoachReportSchema.safeParse({ ...sample, recommendations: [{ title: "x" }] }).success).toBe(false);
  });
});

describe("followerMilestones", () => {
  it("computes months to each upcoming milestone", () => {
    const m = followerMilestones(148_200);
    expect(m.map((x) => x.target)).toEqual([250_000, 500_000, 1_000_000, 2_000_000]);
    const toMillion = m.find((x) => x.target === 1_000_000)!;
    // ln(1e6/148200) / ln(1.05) = 39.1 → 40 months
    expect(toMillion.monthsAt["5%/month"]).toBe(40);
    expect(toMillion.monthsAt["2%/month"]).toBe(97);
    expect(followerMilestones(0)).toEqual([]);
  });
});
