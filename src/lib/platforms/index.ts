import "server-only";
import { youtube } from "./youtube";
import { twitch } from "./twitch";
import { tiktok } from "./tiktok";
import type { Platform, PlatformAdapter } from "./types";

const ADAPTERS: Record<Platform, PlatformAdapter> = { youtube, twitch, tiktok };

export function getAdapter(platform: Platform): PlatformAdapter {
  return ADAPTERS[platform];
}

export function listAdapters(): PlatformAdapter[] {
  return Object.values(ADAPTERS);
}
