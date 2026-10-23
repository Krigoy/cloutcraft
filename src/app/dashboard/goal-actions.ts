"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createGoal, deleteGoal, listGoals, setGoalStatus } from "@/lib/db/repo";
import { GOAL_METRICS, type GoalMetric, type GoalStatus } from "@/lib/goals";
import { isPlatform } from "@/lib/platforms/types";
import { getWorkspaceId } from "@/lib/session";

const MAX_ACTIVE_GOALS = 5;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function fail(message: string): never {
  redirect(`/dashboard?error=${encodeURIComponent(message)}#goals`);
}

export async function createGoalAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const metricRaw = text(formData, "metric");
  if (!(GOAL_METRICS as readonly string[]).includes(metricRaw)) fail("Pick what the goal measures.");
  const metric = metricRaw as GoalMetric;
  const platformRaw = text(formData, "platform");
  const platform = isPlatform(platformRaw) ? platformRaw : null;
  const target = Number(text(formData, "target").replace(/[,$kKmM\s]/g, (m) => (m.toLowerCase() === "k" ? "e3" : m.toLowerCase() === "m" ? "e6" : "")));
  if (!Number.isFinite(target) || target <= 0) fail("Enter a target number (e.g. 250000 or 250k).");
  const targetDate = text(formData, "targetDate");
  if (!ISO_DATE.test(targetDate)) fail("Pick a target date.");
  if (Date.parse(targetDate) <= Date.now() + 6 * 86_400_000) fail("Give the goal at least a week.");

  const active = (await listGoals(workspaceId)).filter((g) => g.status === "active");
  if (active.length >= MAX_ACTIVE_GOALS) fail(`Keep it to ${MAX_ACTIVE_GOALS} active goals — archive one first.`);

  await createGoal(workspaceId, { platform, metric, target: Math.round(target), targetDate });
  revalidatePath("/", "layout");
  redirect("/dashboard?goal=saved#goals");
}

export async function setGoalStatusAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const id = Number(formData.get("id"));
  const status = text(formData, "status") as GoalStatus;
  if (Number.isInteger(id) && id > 0 && ["active", "reached", "archived"].includes(status)) {
    await setGoalStatus(workspaceId, id, status);
    revalidatePath("/", "layout");
  }
  redirect("/dashboard?goal=updated#goals");
}

export async function deleteGoalAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) {
    await deleteGoal(workspaceId, id);
    revalidatePath("/", "layout");
  }
  redirect("/dashboard?goal=deleted#goals");
}
