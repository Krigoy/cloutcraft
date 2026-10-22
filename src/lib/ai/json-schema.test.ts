import { describe, expect, it } from "vitest";
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
    expect(json.required).toEqual(["summary", "strengths", "recommendations", "experiments", "caveats"]);
    expect(json.properties.recommendations.type).toBe("array");
    expect(Object.keys(json.properties.recommendations.items?.properties ?? {})).toContain("evidence");
  });

  it("round-trips a valid report through the zod schema", () => {
    const sample = {
      summary: "s",
      strengths: ["a"],
      recommendations: [
        {
          title: "t",
          category: "timing",
          priority: "high",
          effort: "low",
          rationale: "r",
          action: "a",
          expectedImpact: "i",
          evidence: ["F1"],
        },
      ],
      experiments: [{ hypothesis: "h", method: "m", successMetric: "s", durationWeeks: 2 }],
      caveats: [],
    };
    expect(CoachReportSchema.safeParse(sample).success).toBe(true);
    expect(CoachReportSchema.safeParse({ ...sample, recommendations: [{ title: "x" }] }).success).toBe(false);
  });
});
