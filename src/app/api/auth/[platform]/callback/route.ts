import { NextResponse } from "next/server";
import { consumeOAuthState, upsertConnection } from "@/lib/db/repo";
import { appOrigin } from "@/lib/origin";
import { getAdapter } from "@/lib/platforms";
import { isPlatform, PLATFORM_LABEL } from "@/lib/platforms/types";
import { getOptionalWorkspaceId } from "@/lib/session";
import { syncPlatform } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const base = appOrigin(request);
  const url = new URL(request.url);
  const back = (path: string) => NextResponse.redirect(new URL(path, base), 303);
  const fail = (message: string) => back(`/settings?error=${encodeURIComponent(message)}`);

  if (!isPlatform(platform)) return fail("Unknown platform");
  const label = PLATFORM_LABEL[platform];

  const providerError = url.searchParams.get("error");
  if (providerError) {
    const description = url.searchParams.get("error_description") ?? providerError;
    return fail(`${label} authorization failed: ${description}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail(`${label} returned no authorization code.`);

  const pending = await consumeOAuthState(state);
  if (!pending || pending.platform !== platform) {
    return fail(`${label} authorization state did not match (expired or tampered). Try again.`);
  }
  // The account must land in the workspace of whoever is signed in now, and
  // that must be the user who started the flow (blocks login-CSRF account linking).
  const currentUser = await getOptionalWorkspaceId();
  if (currentUser !== pending.workspaceId) {
    return fail(`${label} authorization was started by a different signed-in user. Try again.`);
  }

  try {
    const adapter = getAdapter(platform);
    const redirectUri = new URL(`/api/auth/${platform}/callback`, base).toString();
    const tokens = await adapter.exchangeCode({
      code,
      redirectUri,
      codeVerifier: pending.codeVerifier ?? undefined,
    });
    await upsertConnection(pending.workspaceId, platform, { tokens, isDemo: false });
  } catch (err) {
    return fail(`${label} token exchange failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = await syncPlatform(pending.workspaceId, platform);
  if (!result.ok) {
    return fail(`${label} connected, but the first sync failed: ${result.error}`);
  }
  return back(`/settings?connected=${platform}`);
}
