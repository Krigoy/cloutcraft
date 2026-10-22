/** Pure parsing helpers shared by the platform adapters (no server-only imports so they are unit-testable). */

/** Parse ISO 8601 durations like PT1H2M3S (YouTube contentDetails.duration). */
export function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [d, h, min, s] = m.slice(1).map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** Parse Twitch's "3h20m5s" style durations. */
export function parseTwitchDuration(text: string | undefined): number {
  if (!text) return 0;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!m) return 0;
  const [h, min, s] = m.slice(1).map((x) => (x ? Number(x) : 0));
  return h * 3600 + min * 60 + s;
}

export function toInt(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function toOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}
