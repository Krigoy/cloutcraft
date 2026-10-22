import "server-only";
import type { ChannelSnapshot, Platform } from "@/lib/platforms/types";
import type { InsightReport } from "@/lib/insights/analyze";
import { followerMilestones } from "./coach-math";
import { completeJson, providerChain, ProviderError, type CoachProvider } from "./providers";
import { CoachReportSchema, type CoachReport } from "./schema";

export class CoachError extends Error {
  constructor(
    message: string,
    public readonly code: "refusal" | "unparseable" | "auth" | "rate_limit" | "api" | "network" | "unconfigured",
  ) {
    super(message);
    this.name = "CoachError";
  }
}

export interface CoachInput {
  report: InsightReport;
  snapshots: Partial<Record<Platform, ChannelSnapshot>>;
  /** Optional free-text from the creator: goals, niche, constraints. */
  creatorNotes?: string;
}

export interface CoachRunResult {
  report: CoachReport;
  provider: CoachProvider;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** Providers that were tried and failed before this one answered. */
  failedOver: string[];
  /** The exact evidence payload that was sent, stored with the run for auditability. */
  input: unknown;
}

const SYSTEM_PROMPT = `You are a growth strategist for online creators. You are given a deterministic analytics report computed from the creator's own YouTube, Twitch and TikTok data: earnings estimates, per-format baselines, cadence, timing, duration buckets and a list of numbered findings (F1, F2, ...).

Your job is to turn that evidence into a short, prioritised plan the creator can act on this week.

Rules:
- Ground every recommendation in the report. Cite finding ids or specific numbers in "evidence". Never invent metrics that are not in the report.
- Earnings labelled "modeled" or "calibrated" are estimates with wide bands; say so when a recommendation depends on them. Reported figures are reliable.
- Prefer a few high-leverage recommendations over a long list: 3 to 6, ordered by priority.
- Make actions concrete: a format, a length, a day, a count, a title pattern, a stream segment. "Post more consistently" is not an action; "Publish the two long-form videos on Tuesday and Friday and bank one spare" is.
- Use the creator's own titles when they illustrate a pattern.
- Small samples (under ~8 items) support hypotheses, not conclusions. Route those into "experiments" rather than firm recommendations.
- Be direct and specific. No filler, no motivational language.
- If "creatorNotes" contains a question or a goal (e.g. "how do I reach 1M subscribers"), that is the brief. Answer it first in "answer": size the goal against the report (current followers per platform, the window's growth, items per week), state the gap and what the present trajectory implies in months or years, and give an honest verdict — including when the goal is unrealistic on the current pace. Then make every recommendation a step toward that goal, in order of leverage. Never answer with generic advice that ignores the creator's numbers.
- For any follower/subscriber timeline, use the precomputed "followerMilestones" (months to each milestone at 2%, 5% and 10% monthly growth) and say which rate the creator's recent growth resembles. Do not do compounding arithmetic yourself.
- If "creatorNotes" is absent, set "answer" to an empty string.
- Respond with a single JSON object that matches the provided schema exactly.`;

/** Trim the report to what the model needs so the prompt stays compact. */
export function buildCoachPayload(input: CoachInput): unknown {
  const r = input.report;
  const round = (x: number, d = 2) => Number(x.toFixed(d));
  const money = (x: number) => round(x, 2);

  return {
    windowDays: r.windowDays,
    generatedAt: r.generatedAt,
    channels: Object.values(input.snapshots).map((s) => ({
      platform: s.platform,
      displayName: s.displayName,
      followers: s.followers,
      monetized: s.monetized,
      subs: s.subs,
      bitsInWindow: s.bitsInWindow,
      reportedRevenueUsdInWindow: s.reportedRevenueUsdInWindow,
      followerMilestones: followerMilestones(s.followers ?? 0),
    })),
    totals: {
      items: r.totals.items,
      views: r.totals.views,
      earningsUsd: { low: money(r.totals.earnings.low), mid: money(r.totals.earnings.mid), high: money(r.totals.earnings.high) },
      byPlatform: r.totals.byPlatform.map((p) => ({
        platform: p.platform,
        items: p.items,
        views: p.views,
        earningsMidUsd: money(p.earnings.mid),
        bySourceMidUsd: Object.fromEntries(
          Object.entries(p.bySource).map(([k, v]) => [k, money(v.mid)]),
        ),
        followers: p.followers,
      })),
    },
    growth: {
      ...r.growth,
      earningsCurrentMid: money(r.growth.earningsCurrentMid),
      earningsPreviousMid: money(r.growth.earningsPreviousMid),
      viewsChange: r.growth.viewsChange === null ? null : round(r.growth.viewsChange, 3),
      earningsChange: r.growth.earningsChange === null ? null : round(r.growth.earningsChange, 3),
    },
    baselines: r.baselines.map((b) => ({
      ...b,
      medianViews: Math.round(b.medianViews),
      p25Views: Math.round(b.p25Views),
      p75Views: Math.round(b.p75Views),
      medianEngagement: round(b.medianEngagement, 4),
      medianEarningsMid: money(b.medianEarningsMid),
    })),
    formatMix: r.formatMix.map((m) => ({
      ...m,
      shareOfItems: round(m.shareOfItems, 3),
      shareOfViews: round(m.shareOfViews, 3),
      shareOfEarnings: round(m.shareOfEarnings, 3),
      earningsPerItemMid: money(m.earningsPerItemMid),
    })),
    cadence: r.cadence.map((c) => ({
      ...c,
      perWeek: round(c.perWeek),
      prevPerWeek: round(c.prevPerWeek),
      medianGapDays: round(c.medianGapDays, 1),
      longestGapDays: round(c.longestGapDays, 1),
      daysSinceLast: round(c.daysSinceLast, 1),
    })),
    timing: r.timing
      .filter((t) => t.count >= 3)
      .map((t) => ({
        platform: t.platform,
        kind: t.kind,
        day: t.label,
        count: t.count,
        medianViews: Math.round(t.medianViews),
        lift: round(t.lift),
      })),
    durationBuckets: r.durationBuckets.filter((d) => d.count >= 2).map((d) => ({
      ...d,
      medianViews: Math.round(d.medianViews),
      medianEarningsMid: money(d.medianEarningsMid),
      earningsLift: round(d.earningsLift),
    })),
    topPerformers: r.topPerformers.map((s) => ({
      platform: s.platform,
      kind: s.kind,
      title: s.title,
      publishedAt: s.publishedAt.slice(0, 10),
      durationSec: s.durationSec,
      views: s.views,
      viewsVsBaseline: round(s.viewsVsBaseline),
      engagementRate: round(s.engagementRate, 4),
      earningsMidUsd: money(s.earningsMid),
    })),
    underperformers: r.underperformers.slice(0, 3).map((s) => ({
      platform: s.platform,
      kind: s.kind,
      title: s.title,
      views: s.views,
      viewsVsBaseline: round(s.viewsVsBaseline),
    })),
    // `detail` already carries the numbers; the raw metrics object (with
    // joined title lists) roughly doubles the token count without adding facts.
    findings: r.findings.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      platform: f.platform,
      title: f.title,
      detail: f.detail,
    })),
    creatorNotes: input.creatorNotes?.trim() || undefined,
  };
}

function describe(err: ProviderError): string {
  return `${err.provider} (${err.code}${err.status ? ` ${err.status}` : ""}): ${err.message.replace(/^\w+: /, "")}`;
}

/**
 * Ask the configured providers in order until one returns a plan that
 * validates against the schema. Failures are summarised in the error so a
 * misconfigured key or exhausted free tier is visible in the UI.
 */
export async function runCoach(input: CoachInput): Promise<CoachRunResult> {
  const chain = providerChain();
  if (chain.length === 0) {
    throw new CoachError("No coach provider is configured.", "unconfigured");
  }

  const payload = buildCoachPayload(input);
  const user = `Here is the analytics report for this creator as JSON. Produce the growth plan.\n\n${JSON.stringify(payload)}`;
  const failures: ProviderError[] = [];

  for (const cfg of chain) {
    try {
      const result = await completeJson(cfg, {
        system: SYSTEM_PROMPT,
        user,
        schema: CoachReportSchema,
        schemaName: "growth_plan",
      });
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(result.text);
      } catch {
        throw new ProviderError(cfg.id, "unparseable", "response was not valid JSON");
      }
      const validated = CoachReportSchema.safeParse(parsedJson);
      if (!validated.success) {
        throw new ProviderError(cfg.id, "unparseable", `plan did not match the schema: ${validated.error.issues[0]?.message ?? "invalid"}`);
      }
      return {
        report: validated.data,
        provider: cfg.id,
        model: result.model,
        usage: result.usage,
        failedOver: failures.map(describe),
        input: payload,
      };
    } catch (err) {
      if (err instanceof ProviderError) {
        failures.push(err);
        continue;
      }
      failures.push(new ProviderError(cfg.id, "api", err instanceof Error ? err.message : String(err)));
    }
  }

  const last = failures[failures.length - 1];
  throw new CoachError(
    failures.length === 1
      ? `${chain[0].label} failed — ${describe(last)}`
      : `All providers failed — ${failures.map(describe).join("; ")}`,
    last.code,
  );
}
