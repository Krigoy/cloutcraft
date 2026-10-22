import type { EstimatedItem } from "@/lib/earnings/estimate";
import type { Platform } from "@/lib/platforms/types";

export interface TimelinePoint {
  /** ISO date of the Monday starting the bucket. */
  weekStart: string;
  label: string;
  youtube: number;
  twitch: number;
  tiktok: number;
}

function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d;
}

const labelFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Estimated earnings (mid) by publish week and platform. Earnings are
 * attributed to the week the content was published, not when cash arrives.
 */
export function buildTimeline(items: EstimatedItem[], windowDays: number, now: Date): TimelinePoint[] {
  const start = mondayOf(new Date(now.getTime() - windowDays * 86_400_000));
  const end = mondayOf(now);
  const buckets = new Map<string, TimelinePoint>();
  for (let t = start.getTime(); t <= end.getTime(); t += 7 * 86_400_000) {
    const d = new Date(t);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { weekStart: key, label: labelFormat.format(d), youtube: 0, twitch: 0, tiktok: 0 });
  }
  for (const { item, estimate } of items) {
    const key = mondayOf(new Date(item.publishedAt)).toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket[item.platform as Platform] += estimate.mid;
  }
  return [...buckets.values()];
}
