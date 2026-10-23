import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { deleteCoachThread } from "@/lib/db/repo";
import { appOrigin } from "@/lib/origin";
import { rejectCrossSite } from "@/lib/request-guard";
import { getWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Form target from the coach sidebar: deletes one conversation (own workspace only). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;

  const { id } = await params;
  const threadId = Number(id);
  if (Number.isInteger(threadId) && threadId > 0) {
    await deleteCoachThread(await getWorkspaceId(), threadId);
    revalidatePath("/coach");
  }
  const form = await request.formData().catch(() => null);
  const windowDays = Number(form?.get("window"));
  const target = new URL("/coach", appOrigin(request));
  if (Number.isInteger(windowDays) && windowDays > 0) target.searchParams.set("window", String(windowDays));
  return NextResponse.redirect(target, 303);
}
