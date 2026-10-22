import { z } from "zod";

/**
 * Shape of what the AI coach returns. Kept to plain strings, enums and arrays
 * so it maps cleanly onto the structured-output JSON schema.
 */
export const RecommendationSchema = z.object({
  title: z.string().describe("Short imperative headline, e.g. 'Move long-form uploads to Tuesday'."),
  category: z.enum([
    "content_strategy",
    "format_mix",
    "cadence",
    "timing",
    "monetization",
    "audience",
    "cross_platform",
  ]),
  priority: z.enum(["high", "medium", "low"]),
  effort: z.enum(["low", "medium", "high"]),
  rationale: z
    .string()
    .describe("Why this matters for this creator specifically, grounded in the evidence."),
  action: z.string().describe("The concrete next step, specific enough to do this week."),
  expectedImpact: z.string().describe("What should change and roughly by how much if it works."),
  evidence: z
    .array(z.string())
    .describe("Finding ids (e.g. 'F3') or specific metrics from the report that support this."),
});

export const ExperimentSchema = z.object({
  hypothesis: z.string(),
  method: z.string().describe("How to run the test with the creator's actual content."),
  successMetric: z.string(),
  durationWeeks: z.number(),
});

export const CoachReportSchema = z.object({
  summary: z.string().describe("Two or three sentences on where this creator stands."),
  strengths: z.array(z.string()).describe("What is already working, with numbers."),
  recommendations: z.array(RecommendationSchema),
  experiments: z.array(ExperimentSchema).describe("Up to three tests to run over the next month."),
  caveats: z.array(z.string()).describe("Data limitations the creator should keep in mind."),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Experiment = z.infer<typeof ExperimentSchema>;
export type CoachReport = z.infer<typeof CoachReportSchema>;
