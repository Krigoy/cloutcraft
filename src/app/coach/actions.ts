"use server";

import { revalidatePath } from "next/cache";
import { CoachError, runCoach } from "@/lib/ai/coach";
import { coachAvailability } from "@/lib/ai/providers";
import { loadDashboard, parseWindow } from "@/lib/dashboard";
import { saveCoachRun } from "@/lib/db/repo";

export interface CoachActionState {
  status: "idle" | "ok" | "error";
  message?: string;
  runId?: number;
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
  const notes = String(formData.get("notes") ?? "");

  const data = await loadDashboard(windowDays);
  if (!data.hasData) {
    return { status: "error", message: "Connect a platform or install the demo data first." };
  }

  try {
    const result = await runCoach({ report: data.report, snapshots: data.snapshots, creatorNotes: notes });
    const runId = await saveCoachRun(data.workspaceId, {
      model: `${result.provider}/${result.model}`,
      input: result.input,
      output: result.report,
      usage: {
        ...result.usage,
        provider: result.provider,
        failedOver: result.failedOver.length ? result.failedOver : undefined,
        windowDays,
        creatorNotes: notes || undefined,
      },
    });
    revalidatePath("/coach");
    return { status: "ok", runId };
  } catch (err) {
    const message = err instanceof CoachError ? err.message : "Unexpected error while generating the plan.";
    return { status: "error", message };
  }
}
