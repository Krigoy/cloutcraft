"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addPayoutReport, deletePayoutReport } from "@/lib/db/repo";
import { PAYOUT_SOURCES } from "@/lib/earnings/payouts";
import { isPlatform } from "@/lib/platforms/types";
import { getWorkspaceId } from "@/lib/session";

const MIN_PERIOD_DAYS = 7;
const MAX_PERIOD_DAYS = 400;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function fail(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}#payouts`);
}

export async function addPayoutAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const platform = text(formData, "platform");
  if (!isPlatform(platform)) fail("Pick the platform the payout came from.");
  const periodStart = text(formData, "periodStart");
  const periodEnd = text(formData, "periodEnd");
  if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) fail("Enter the period as two dates.");
  const days = (Date.parse(periodEnd) - Date.parse(periodStart)) / 86_400_000 + 1;
  if (!Number.isFinite(days) || days < MIN_PERIOD_DAYS) fail(`The period must cover at least ${MIN_PERIOD_DAYS} days.`);
  if (days > MAX_PERIOD_DAYS) fail("The period is too long — enter payouts month by month or quarter by quarter.");
  if (Date.parse(periodEnd) > Date.now()) fail("The period cannot end in the future.");
  const amountUsd = Number(text(formData, "amountUsd").replace(/[$,]/g, ""));
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) fail("Enter the amount you were paid, in USD.");
  const source = text(formData, "source");
  const note = text(formData, "note").slice(0, 200);

  await addPayoutReport(workspaceId, {
    platform,
    periodStart,
    periodEnd,
    amountUsd: Math.round(amountUsd * 100) / 100,
    source: source in PAYOUT_SOURCES ? source : "other",
    note: note || null,
  });
  revalidatePath("/", "layout");
  redirect("/settings?payout=saved#payouts");
}

export async function deletePayoutAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) {
    await deletePayoutReport(workspaceId, id);
    revalidatePath("/", "layout");
  }
  redirect("/settings?payout=deleted#payouts");
}
