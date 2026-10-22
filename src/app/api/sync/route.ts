import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { rejectCrossSite, safeReturnUrl } from "@/lib/request-guard";
import { getWorkspaceId } from "@/lib/session";
import { syncAll } from "@/lib/sync";

export const dynamic = "force-dynamic";

/** Manual "Sync now". Returns JSON for fetch callers, redirects for forms. */
export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;

  const workspaceId = await getWorkspaceId();
  const results = await syncAll(workspaceId);
  revalidatePath("/", "layout");

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    return NextResponse.json({ results });
  }
  const failed = results.filter((r) => !r.ok);
  const target = safeReturnUrl(request, "/settings");
  target.search = failed.length
    ? `error=${encodeURIComponent(failed.map((f) => `${f.platform}: ${f.error}`).join("; "))}`
    : "synced=1";
  return NextResponse.redirect(target, 303);
}
