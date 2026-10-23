import { z } from "zod";

/**
 * Shape of what the AI coach returns. Kept to plain strings, enums and arrays
 * so it maps cleanly onto the structured-output JSON schema.
 */
export const RecommendationSchema = z.object({
  title: z.string().describe("Short imperative headline, e.g. 'Turn the screw-organisation hit into a 4-part workshop series'."),
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
    .describe(
      "Why this matters for this creator specifically, grounded in the evidence (2–4 sentences, cite finding ids or numbers).",
    ),
  mechanism: z
    .string()
    .describe(
      "How it works: the audience or platform behaviour that makes this pay off (browse vs. suggested traffic, session time, click-through, retention curves, sub conversion, notification habits…). 2–3 sentences, specific.",
    ),
  playbook: z
    .array(z.string())
    .describe(
      "3–6 ordered, concrete steps a creator can execute: exact formats, lengths, hook/title/thumbnail formulas, structure, CTAs, cross-posting flow. Use the creator's own titles as worked examples where possible.",
    ),
  expectedImpact: z.string().describe("What should change, roughly by how much, and when it becomes measurable."),
  metricsToWatch: z
    .array(z.string())
    .describe("2–4 metrics that show whether it is working, each with a target or threshold (e.g. 'CTR ≥ 6% in the first 48 h')."),
  pitfall: z.string().describe("The most common way creators get this wrong, and how to avoid it."),
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

export const WeekPlanSchema = z.object({
  week: z.number().describe("1–4"),
  focus: z.string().describe("The one thing this week is about."),
  actions: z.array(z.string()).describe("3–5 dated, specific actions (what to film, post, change, measure)."),
});

export const CoachReportSchema = z.object({
  answer: z
    .string()
    .describe(
      "Direct reply to the creator's question or goal (creatorNotes), 6–10 sentences: where they are now, the gap, what the current trajectory implies (cite followerMilestones), the strategic thesis for closing it, and the honest verdict. Empty string when no question or goal was given.",
    ),
  summary: z.string().describe("Three or four sentences on where this creator stands and the single biggest lever."),
  strengths: z.array(z.string()).describe("What is already working, with numbers."),
  recommendations: z.array(RecommendationSchema),
  thirtyDayPlan: z.array(WeekPlanSchema).describe("Four weeks, turning the recommendations into a schedule."),
  experiments: z.array(ExperimentSchema).describe("Up to three tests to run over the next month."),
  caveats: z.array(z.string()).describe("Data limitations the creator should keep in mind."),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Experiment = z.infer<typeof ExperimentSchema>;
export type WeekPlan = z.infer<typeof WeekPlanSchema>;
export type CoachReport = z.infer<typeof CoachReportSchema>;
