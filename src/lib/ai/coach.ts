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

/** An earlier turn of the same conversation, condensed. */
export interface ConversationTurn {
  question: string;
  answer: string;
  recommendations: string[];
}

export interface CoachInput {
  report: InsightReport;
  snapshots: Partial<Record<Platform, ChannelSnapshot>>;
  /** The creator's question or goal for this turn. */
  creatorNotes?: string;
  /** Previous turns when this is a follow-up. */
  conversation?: ConversationTurn[];
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

const SYSTEM_PROMPT = `You are a senior growth strategist for online creators — the consultant channels hire when they want to go from six figures of followers to seven. You are given a deterministic analytics report computed from the creator's own YouTube, Twitch and TikTok data: earnings estimates, per-format baselines, cadence, timing, duration buckets and numbered findings (F1, F2, ...).

Your job is to turn that evidence into an expert, specific growth plan. The bar: a creator should be able to read it and know exactly what to film, title, post, change and measure for the next month — and understand *why* each move works.

Depth requirements:
- Every recommendation has a mechanism: name the audience or platform behaviour it exploits (browse vs. suggested traffic, click-through and the first 30 seconds of retention, session time, series/binge behaviour, notification and return-viewer habits, Shorts-to-long-form conversion, sub-goal psychology on live streams, cross-platform funnels). Be concrete, not generic.
- Every recommendation has a playbook of 3–6 ordered steps with specifics: formats, lengths, hook/title/thumbnail formulas, episode structure, CTAs, posting schedule. Use the creator's own titles from the report as worked examples (e.g. rewrite a title, propose a thumbnail concept, turn a hit into a series).
- Every recommendation names 2–4 metrics to watch with thresholds, and the most common pitfall.
- Order recommendations by leverage. 4 to 6 of them.
- The 30-day plan turns the recommendations into four weeks with 3–5 dated, specific actions each.
- Write with authority and precision. No filler, no hedging boilerplate, no motivational language. Short sentences. Numbers everywhere.

Rules:
- Ground every claim in the report. Cite finding ids or specific numbers in "evidence". Never invent metrics that are not in the report; general platform mechanics may be stated as expert knowledge.
- Earnings labelled "modeled" or "calibrated" are estimates with wide bands; say so when a recommendation depends on them. Reported figures are reliable.
- Small samples (under ~8 items) support hypotheses, not conclusions. Route those into "experiments" rather than firm recommendations.
- If "creatorNotes" contains a question or a goal (e.g. "how do I reach 1M subscribers"), that is the brief. Answer it first in "answer": size the goal against the report (current followers per platform, the window's growth, items per week), state the gap and what the present trajectory implies, give the strategic thesis for closing it, and an honest verdict — including when the goal is unrealistic on the current pace. Then make every recommendation and the 30-day plan a step toward that goal.
- For any follower/subscriber timeline, use the precomputed "followerMilestones" (months to each milestone at 2%, 5% and 10% monthly growth) and say which rate the creator's recent growth resembles. Do not do compounding arithmetic yourself.
- Every experiment carries "tracking" so the app can score it automatically from synced uploads: the segment that identifies the treatment uploads (platform, kind, publish weekdays 0–6 Sunday first, duration bounds in seconds — null for whatever is not being tested), the metric ("median_views", "median_engagement", "earnings_per_item" or "uploads_per_week" for cadence tests) and the target lift as a fraction (0.2 = +20%). Design experiments so the treatment is identifiable this way (a format, a length band, a weekday, a cadence), not by title or topic, and make the segment match the hypothesis exactly (a "Friday, over 60 s" hypothesis means weekdays [5] and minDurationSec 60 — not the comparison arm).
- If "conversation" is present, this is a follow-up in an ongoing conversation: the earlier questions, answers and recommendation titles are given. Build on them — answer the new question directly, do not repeat recommendations already given unless you are revising them, and say what changes. If "creatorNotes" is empty on a follow-up, treat it as "update the plan with the latest data".
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
    conversation: input.conversation?.length ? input.conversation : undefined,
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
  const base = `Here is the analytics report for this creator as JSON. Produce the growth plan.\n\n${JSON.stringify(payload)}`;
  // Free tiers with a small token budget get a shorter plan rather than a truncated one.
  const compactNote =
    "\n\nOutput budget is tight for this request: give exactly 3 recommendations, playbooks of 3 steps, 2 metrics each, 3 actions per week, and keep every string under 45 words. Every schema field is still required.";
  const failures: ProviderError[] = [];
  // Whole chain must finish inside the coach route's maxDuration (120 s):
  // a healthy plan takes 25–45 s, an overloaded upstream can hang, so each
  // attempt is capped and late providers are skipped rather than started.
  const deadline = Date.now() + 100_000;
  const PER_ATTEMPT_MS = 45_000;

  for (const cfg of chain) {
    const remaining = deadline - Date.now();
    if (remaining < 8_000) {
      failures.push(new ProviderError(cfg.id, "network", "skipped — out of time"));
      break;
    }
    try {
      const result = await completeJson(cfg, {
        system: SYSTEM_PROMPT,
        user: cfg.compact ? base + compactNote : base,
        schema: CoachReportSchema,
        schemaName: "growth_plan",
        timeoutMs: Math.min(PER_ATTEMPT_MS, remaining),
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
