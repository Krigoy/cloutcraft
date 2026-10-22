import "server-only";
import { timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/origin";

/**
 * Request-level protections for the mutating API routes.
 *
 * The app has no user accounts yet, so browser-initiated state changes are
 * guarded against cross-site requests: a mutating request must come from
 * this origin (per the Fetch Metadata `Sec-Fetch-Site` header, falling back
 * to `Origin` for older clients). Non-browser callers (curl, the scheduler)
 * send neither header and are allowed, exactly as they are today.
 */
export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === appOrigin(request);
}

export function rejectCrossSite(request: Request): Response | null {
  if (isSameOriginRequest(request)) return null;
  return Response.json({ error: "cross-site request rejected" }, { status: 403 });
}

/** Resolve a safe post-redirect target: same-origin referers only, else the fallback path. */
export function safeReturnUrl(request: Request, fallbackPath: string): URL {
  const base = new URL(appOrigin(request));
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.origin === base.origin) return url;
    } catch {
      /* ignore malformed referer */
    }
  }
  return new URL(fallbackPath, base);
}

/** Constant-time comparison for shared secrets. */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
