import "server-only";
import { auth } from "@clerk/nextjs/server";

/**
 * Workspace resolution: one workspace per Clerk user.
 *
 * `proxy.ts` already guarantees a signed-in session on every protected route,
 * so `getWorkspaceId` throwing means a route was left out of the proxy's
 * protection rules — a bug, not a user error.
 */
export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthenticatedError";
  }
}

export async function getWorkspaceId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new UnauthenticatedError();
  return userId;
}

/** For public pages that adapt to a signed-in visitor (e.g. the landing page). */
export async function getOptionalWorkspaceId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}
