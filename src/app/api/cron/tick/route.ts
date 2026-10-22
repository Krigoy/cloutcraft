import { NextResponse } from "next/server";
import { authorizeTick, tick } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
// A tick may run full syncs for several users.
export const maxDuration = 60;

async function handle(request: Request) {
  if (!authorizeTick(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await tick();
  // Counts only: external pingers (cron-job.org etc.) log response bodies,
  // so per-user ids and sync errors stay server-side.
  return NextResponse.json({
    ranAt: summary.ranAt,
    workspaces: summary.workspaces.length,
    live: summary.workspaces.reduce((n, w) => n + w.live.filter((l) => l.sample).length, 0),
    synced: summary.workspaces.reduce((n, w) => n + w.synced.filter((r) => r.ok).length, 0),
    failed: summary.workspaces.reduce((n, w) => n + w.synced.filter((r) => !r.ok).length, 0),
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
