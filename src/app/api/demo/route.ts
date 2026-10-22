import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { installDemo, removeDemo } from "@/lib/demo/install";
import { appOrigin } from "@/lib/origin";
import { rejectCrossSite } from "@/lib/request-guard";
import { getWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Form target: `action=install` or `action=remove`. */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;

  const form = await request.formData();
  const action = String(form.get("action") ?? "install");
  const workspaceId = await getWorkspaceId();

  if (action === "remove") await removeDemo(workspaceId);
  else await installDemo(workspaceId);

  revalidatePath("/", "layout");
  const next = action === "remove" ? "/settings?demo=removed" : "/dashboard?demo=installed";
  return NextResponse.redirect(new URL(next, appOrigin(request)), 303);
}
