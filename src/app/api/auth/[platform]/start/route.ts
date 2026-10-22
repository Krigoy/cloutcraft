import { NextResponse } from "next/server";
import { randomToken } from "@/lib/crypto";
import { createOAuthState } from "@/lib/db/repo";
import { appOrigin } from "@/lib/origin";
import { getAdapter } from "@/lib/platforms";
import { createPkcePair } from "@/lib/platforms/oauth";
import { isPlatform, PLATFORM_LABEL } from "@/lib/platforms/types";
import { getWorkspaceId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const base = appOrigin(request);
  if (!isPlatform(platform)) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent("Unknown platform")}`, base), 303);
  }
  const adapter = getAdapter(platform);
  if (!adapter.isConfigured()) {
    return NextResponse.redirect(
      new URL(
        `/settings?error=${encodeURIComponent(`${PLATFORM_LABEL[platform]} client credentials are not configured in .env.local`)}`,
        base,
      ),
      303,
    );
  }

  const workspaceId = await getWorkspaceId();
  const state = randomToken(24);
  const pkce = adapter.usesPkce ? createPkcePair() : undefined;
  createOAuthState(workspaceId, platform, state, pkce?.verifier);

  // Must match the URI registered with the platform; set APP_URL to pin it.
  const redirectUri = new URL(`/api/auth/${platform}/callback`, base).toString();
  const url = adapter.buildAuthorizeUrl({ state, redirectUri, codeChallenge: pkce?.challenge });
  return NextResponse.redirect(url, 303);
}
