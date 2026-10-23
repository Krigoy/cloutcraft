"use server";

import { revalidatePath } from "next/cache";
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

  try {
    const result = await runCoach({ report: data.report, snapshots: data.snapshots, creatorNotes: notes, conversation });
    const saved = await saveCoachRun(data.workspaceId, {
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
    revalidatePath("/coach");
    return { status: "ok", runId: saved.id, threadId: saved.threadId };
  } catch (err) {
    const message = err instanceof CoachError ? err.message : "Unexpected error while generating the plan.";
    return { status: "error", message };
  }
}
