"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearRateOverrides, setRateOverrides } from "@/lib/db/repo";
import { RATE_DEFINITIONS, type Band } from "@/lib/earnings/rates";
import { getWorkspaceId } from "@/lib/session";

const BANDS: Band[] = ["low", "mid", "high"];

export async function saveRatesAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  const changes: Record<string, number | null> = {};
  for (const def of RATE_DEFINITIONS) {
    for (const band of BANDS) {
      const key = `${def.key}.${band}`;
      const raw = formData.get(key);
      const text = typeof raw === "string" ? raw.trim() : "";
      if (text === "") {
        changes[key] = null;
        continue;
      }
      const value = Number(text);
      if (!Number.isFinite(value) || value < 0) continue;
      // Only store a value when it differs from the default, so the form shows
      // "default" for untouched fields.
      changes[key] = Math.abs(value - def[band]) < 1e-9 ? null : value;
    }
  }
  await setRateOverrides(workspaceId, changes);
  revalidatePath("/", "layout");
  redirect("/settings?rates=saved#rates");
}

export async function resetRatesAction(): Promise<void> {
  await clearRateOverrides(await getWorkspaceId());
  revalidatePath("/", "layout");
  redirect("/settings?rates=reset#rates");
}
