const MILESTONES = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];
const MONTHLY_RATES = [0.02, 0.05, 0.1];

/**
 * Deterministic follower-goal arithmetic: months to reach each upcoming
 * milestone at a few compound monthly growth rates. Language models get
 * compounding wrong, so the prompt tells the model to cite these.
 */
export function followerMilestones(followers: number): { target: number; monthsAt: Record<string, number> }[] {
  if (!followers || followers <= 0) return [];
  return MILESTONES.filter((m) => m > followers)
    .slice(0, 4)
    .map((target) => ({
      target,
      monthsAt: Object.fromEntries(
        MONTHLY_RATES.map((r) => [`${Math.round(r * 100)}%/month`, Math.ceil(Math.log(target / followers) / Math.log(1 + r))]),
      ),
    }));
}
