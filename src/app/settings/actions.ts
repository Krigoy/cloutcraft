"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearRateOverrides, setRateOverride } from "@/lib/db/repo";
import { RATE_DEFINITIONS, type Band } from "@/lib/earnings/rates";
import { getWorkspaceId } from "@/lib/session";

const BANDS: Band[] = ["low", "mid", "high"];

export async function saveRatesAction(formData: FormData): Promise<void> {
  const workspaceId = await getWorkspaceId();
  for (const def of RATE_DEFINITIONS) {
    for (const band of BANDS) {
      const key = `${def.key}.${band}`;
      const raw = formData.get(key);
      const text = typeof raw === "string" ? raw.trim() : "";
      if (text === "") {
        setRateOverride(workspaceId, key, null);
        continue;
      }
      const value = Number(text);
      if (!Number.isFinite(value) || value < 0) continue;
      // Only store a value when it differs from the default, so the form shows
      // "default" for untouched fields.
      if (Math.abs(value - def[band]) < 1e-9) setRateOverride(workspaceId, key, null);
      else setRateOverride(workspaceId, key, value);
    }
  }
  revalidatePath("/", "layout");
  redirect("/settings?rates=saved#rates");
}

export async function resetRatesAction(): Promise<void> {
  clearRateOverrides(await getWorkspaceId());
  revalidatePath("/", "layout");
  redirect("/settings?rates=reset#rates");
}
