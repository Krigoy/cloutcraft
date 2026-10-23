"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CoachError, runCoach, type ConversationTurn } from "@/lib/ai/coach";
import { coachAvailability } from "@/lib/ai/providers";
import type { CoachReport } from "@/lib/ai/schema";
import { loadDashboard, parseWindow } from "@/lib/dashboard";
import { listThreadRuns, saveCoachRun } from "@/lib/db/repo";

export interface CoachActionState {
  status: "idle" | "ok" | "error";
  message?: string;
  runId?: number;
  threadId?: number;
}

export async function runCoachAction(
  _prev: CoachActionState,
  formData: FormData,
): Promise<CoachActionState> {
  const availability = coachAvailability();
  if (!availability.enabled) {
    return { status: "error", message: availability.hint };
  }
  const windowDays = parseWindow(String(formData.get("window") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim();
  const threadParam = Number(formData.get("threadId"));
  const threadId = Number.isInteger(threadParam) && threadParam > 0 ? threadParam : undefined;

  const data = await loadDashboard(windowDays);
  if (!data.hasData) {
    return { status: "error", message: "Connect a platform or install the demo data first." };
  }

  // Follow-up: hand the model the earlier turns of this conversation (scoped to this user).
  let conversation: ConversationTurn[] | undefined;
  if (threadId) {
    const prior = await listThreadRuns<CoachReport>(data.workspaceId, threadId);
    if (prior.length === 0) return { status: "error", message: "That conversation no longer exists." };
    conversation = prior.map((r) => ({
      question: r.question || "(general review)",
      answer: r.output.answer?.trim() || r.output.summary,
      recommendations: r.output.recommendations.map((x) => x.title),
    }));
  }
  if (!notes && !threadId) {
    // A fresh conversation with no question is a general review.
  }

  let saved: { id: number; threadId: number };
  try {
    const goals = data.goals.map(({ goal, projection, label }) => ({
      label,
      platform: goal.platform,
      metric: goal.metric,
      target: goal.target,
      targetDate: goal.targetDate,
      current: Math.round(projection.current),
      paceMonthly: projection.paceMonthly,
      requiredMonthly: projection.requiredMonthly,
      projectedDate: projection.projectedDate,
      verdict: projection.verdict,
    }));
    const startedAt = Date.now();
    const result = await runCoach({ report: data.report, snapshots: data.snapshots, creatorNotes: notes, conversation, goals });
    // One line per plan in the server log: enough to see which provider answered and how long it took, no content.
    console.info(
      `[coach] ${result.provider}/${result.model} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` +
        (result.failedOver.length ? ` after ${result.failedOver.join("; ")}` : ""),
    );
    saved = await saveCoachRun(data.workspaceId, {
      model: `${result.provider}/${result.model}`,
      input: result.input,
      output: result.report,
      question: notes,
      threadId,
      usage: {
        ...result.usage,
        provider: result.provider,
        failedOver: result.failedOver.length ? result.failedOver : undefined,
        windowDays,
        creatorNotes: notes || undefined,
      },
    });
  } catch (err) {
    const message = err instanceof CoachError ? err.message : "Unexpected error while generating the plan.";
    return { status: "error", message };
  }
  // Navigate from the server: the revalidated page swaps in the thread view and
  // remounts the form, so a client-side effect on the result would never run.
  revalidatePath("/coach");
  redirect(`/coach?window=${windowDays}&thread=${saved.threadId}#turn-${saved.id}`);
}
