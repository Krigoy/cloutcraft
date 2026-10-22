import "server-only";
import { randomToken, sha256Base64Url } from "@/lib/crypto";

/** Thrown by adapters when a platform API responds with an error. */
export class PlatformApiError extends Error {
  constructor(
    public readonly platform: string,
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(`${platform} API ${status}: ${message}`);
    this.name = "PlatformApiError";
  }
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  return { verifier, challenge: sha256Base64Url(verifier) };
}

export function expiresAtFromSeconds(expiresIn: number | undefined): string | undefined {
  if (!expiresIn || !Number.isFinite(expiresIn)) return undefined;
  // Refresh a minute early to avoid racing the expiry.
  return new Date(Date.now() + Math.max(0, expiresIn - 60) * 1000).toISOString();
}

export function isExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function describe(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const nested = b.error && typeof b.error === "object" ? (b.error as Record<string, unknown>) : null;
    return String(
      b.error_description ??
        b.message ??
        nested?.message ??
        (typeof b.error === "string" ? b.error : undefined) ??
        JSON.stringify(body).slice(0, 300),
    );
  }
  return String(body ?? "").slice(0, 300) || "request failed";
}

/** POST application/x-www-form-urlencoded and parse JSON. */
export async function postForm<T>(
  platform: string,
  url: string,
  params: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  const body = await parseBody(res);
  if (!res.ok) throw new PlatformApiError(platform, res.status, describe(body), body);
  return body as T;
}

/** POST a JSON body and parse JSON. */
export async function postJson<T>(
  platform: string,
  url: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const body = await parseBody(res);
  if (!res.ok) throw new PlatformApiError(platform, res.status, describe(body), body);
  return body as T;
}

/** GET with query params and parse JSON. */
export async function getJson<T>(
  platform: string,
  url: string,
  query: Record<string, string | number | undefined>,
  headers: Record<string, string> = {},
): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  }
  const res = await fetch(u, { headers, cache: "no-store" });
  const body = await parseBody(res);
  if (!res.ok) throw new PlatformApiError(platform, res.status, describe(body), body);
  return body as T;
}

