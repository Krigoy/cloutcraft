/** Where a real payout figure can come from; shown in Settings and stored with each report. */
export const PAYOUT_SOURCES = {
  youtube_studio: "YouTube Studio (Revenue report)",
  adsense: "AdSense payment",
  twitch_payout: "Twitch payout statement",
  tiktok_rewards: "TikTok Creator Rewards",
  other: "Other / combined",
} as const;

export type PayoutSource = keyof typeof PAYOUT_SOURCES;

export function payoutSourceLabel(source: string): string {
  return (PAYOUT_SOURCES as Record<string, string>)[source] ?? source;
}
