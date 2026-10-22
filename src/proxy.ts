import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Authentication gate (Next 16 "proxy", formerly middleware).
 *
 * Public: the landing page, Clerk's sign-in/up pages, and the scheduler
 * endpoint (which authenticates with CRON_SECRET instead of a session).
 * Everything else requires a signed-in user: pages redirect to sign-in,
 * API routes answer 401 JSON so clients never get an HTML login page.
 *
 * The OAuth callback stays protected on purpose: the browser returning from
 * YouTube/Twitch/TikTok carries the Clerk session cookie, and the callback
 * additionally checks the session matches the user who started the flow.
 */
const PUBLIC_PATHS = [/^\/$/, /^\/sign-in(\/.*)?$/, /^\/sign-up(\/.*)?$/, /^\/api\/cron\/tick$/];
const OAUTH_CALLBACK = /^\/api\/auth\/[^/]+\/(start|callback)$/;

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return;

  // API calls get a machine-readable 401; the OAuth start/callback are
  // browser navigations, so they get the normal sign-in redirect below.
  if (pathname.startsWith("/api/") && !OAUTH_CALLBACK.test(pathname)) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return;
  }

  await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
