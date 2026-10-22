import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

const FALLBACK = "http://localhost:3000";

/** Origin a request arrived on, honouring reverse-proxy / tunnel headers. */
export function originFromHeaders(h: Headers, requestUrl?: string): string | null {
  const forwardedHost = h.get("x-forwarded-host")?.split(",")[0].trim();
  const host = forwardedHost || h.get("host")?.split(",")[0].trim();
  if (!host) return requestUrl ? new URL(requestUrl).origin : null;
  const forwardedProto = h.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto =
    forwardedProto ||
    (requestUrl ? new URL(requestUrl).protocol.replace(":", "") : /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Public origin of the app. `APP_URL` wins when it is set (needed when the
 * OAuth redirect URI must match a registered value, e.g. behind a tunnel);
 * otherwise whatever host and port the request actually came in on, so the
 * dev server can run on any port.
 */
export function appOrigin(request: Request): string {
  const configured = env().APP_URL;
  if (configured) return new URL(configured).origin;
  return originFromHeaders(request.headers, request.url) ?? FALLBACK;
}

/** Same as `appOrigin`, for server components (reads the request headers). */
export async function appOriginFromContext(): Promise<string> {
  const configured = env().APP_URL;
  if (configured) return new URL(configured).origin;
  return originFromHeaders(await headers()) ?? FALLBACK;
}
