"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createExperiment, deleteExperiment, setExperimentStatus } from "@/lib/db/repo";
import {
  EXPERIMENT_METRICS,
  EXPERIMENT_STATUSES,
  type ExperimentMetric,
  type ExperimentSegment,
  type ExperimentStatus,
} from "@/lib/experiments/score";
import { isPlatform, type ContentKind } from "@/lib/platforms/types";
import { getWorkspaceId } from "@/lib/session";

const KINDS: ContentKind[] = ["video", "short", "live"];
const MIN_DAYS = 1;
const MAX_DAYS = 26 * 7;

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function number(formData: FormData, key: string): number | undefined {
  const t = text(formData, key);
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function back(formData: FormData, flash: string): never {
  const windowDays = number(formData, "window");
  const qs = new URLSearchParams({ experiment: flash });
  if (windowDays) qs.set("window", String(windowDays));
  redirect(`/coach/experiments?${qs}`);
}

/**
 * Starts tracking an experiment — from the "Track" button on a coach plan
 * (hidden fields carry the coach's tracking spec) or from the manual form.
 */
export async function startExperimentAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const title = text(formData, "title").slice(0, 200);
  if (!title) redirect("/coach/experiments?error=" + encodeURIComponent("Give the experiment a hypothesis."));

  const metricRaw = text(formData, "metric");
  const metric: ExperimentMetric = (EXPERIMENT_METRICS as readonly string[]).includes(metricRaw) ? (metricRaw as ExperimentMetric) : "median_views";

  const segment: ExperimentSegment = {};
  const platform = text(formData, "platform");
  if (isPlatform(platform)) segment.platform = platform;
  const kind = text(formData, "kind");
  if (KINDS.includes(kind as ContentKind)) segment.kind = kind as ContentKind;
  // Checkboxes send one value each; the coach form sends one comma-separated field.
  const weekdays = formData
    .getAll("weekdays")
    .flatMap((v) => String(v).split(","))
    .map((v) => Number(v.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (weekdays.length && weekdays.length < 7) segment.weekdays = [...new Set(weekdays)].sort();
  const minSec = number(formData, "minDurationSec");
  const maxSec = number(formData, "maxDurationSec");
  if (minSec !== undefined && minSec > 0) segment.minDurationSec = Math.round(minSec);
  if (maxSec !== undefined && maxSec > 0) segment.maxDurationSec = Math.round(maxSec);

  // Target lift arrives as a fraction (coach) or a percentage (manual form).
  const liftFraction = number(formData, "targetLift");
  const liftPercent = number(formData, "targetLiftPercent");
  const targetLift = Math.min(5, Math.max(0.01, liftFraction ?? (liftPercent !== undefined ? liftPercent / 100 : 0.2)));
  // Duration: the manual form sends a value + unit (days/weeks); the coach's Track button sends weeks.
  const durationValue = number(formData, "durationValue");
  const unit = text(formData, "durationUnit") === "days" ? 1 : 7;
  const requestedDays = durationValue !== undefined ? durationValue * unit : (number(formData, "durationWeeks") ?? 4) * 7;
  const days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(requestedDays)));

  const runId = number(formData, "runId");
  const index = number(formData, "index");
  const now = new Date();
  await createExperiment(workspaceId, {
    title,
    method: text(formData, "method").slice(0, 1000) || undefined,
    successMetric: text(formData, "successMetric").slice(0, 300) || undefined,
    metric,
    segment,
    targetLift,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    source: runId && index !== undefined ? { runId, index } : undefined,
  });
  revalidatePath("/coach", "layout");
  back(formData, "started");
}

export async function setExperimentStatusAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const id = number(formData, "id");
  const status = text(formData, "status") as ExperimentStatus;
  if (id && (EXPERIMENT_STATUSES as readonly string[]).includes(status)) {
    await setExperimentStatus(workspaceId, id, status);
    revalidatePath("/coach", "layout");
  }
  back(formData, status === "active" ? "reopened" : "closed");
}

export async function deleteExperimentAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const id = number(formData, "id");
  if (id) {
    await deleteExperiment(workspaceId, id);
    revalidatePath("/coach", "layout");
  }
  back(formData, "deleted");
}
