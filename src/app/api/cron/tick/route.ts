import { NextResponse } from "next/server";
import { authorizeTick, tick } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!authorizeTick(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await tick();
  return NextResponse.json(summary);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
