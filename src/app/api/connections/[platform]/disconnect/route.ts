import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { deleteConnection } from "@/lib/db/repo";
import { appOrigin } from "@/lib/origin";
import { isPlatform } from "@/lib/platforms/types";
import { rejectCrossSite } from "@/lib/request-guard";
import { getWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;

  const { platform } = await params;
  if (isPlatform(platform)) {
    deleteConnection(await getWorkspaceId(), platform);
    revalidatePath("/", "layout");
  }
  return NextResponse.redirect(new URL("/settings?disconnected=1", appOrigin(request)), 303);
}
