import "server-only";

/**
 * Workspace resolution.
 *
 * The app currently runs as a single-user, self-hosted dashboard, so every
 * request maps to one workspace. When real sign-in is added (e.g. Auth.js),
 * this is the only function that needs to change: resolve the signed-in
 * user's id here and the rest of the code base follows.
 */
export const LOCAL_WORKSPACE_ID = "local";

export async function getWorkspaceId(): Promise<string> {
  return LOCAL_WORKSPACE_ID;
}
