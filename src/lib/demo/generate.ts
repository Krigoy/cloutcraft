import type { ChannelSnapshot, ContentItem, LiveSample } from "@/lib/platforms/types";

/**
 * Deterministic demo data so the dashboard is fully explorable before any
 * platform is connected (and so the estimator / insights have fixtures).
 *
 * The generator bakes in a few patterns the insights engine should find:
 * Tuesday uploads do better on YouTube, 10–20 minute videos out-earn the
 * rest, Shorts are most of the uploads but little of the revenue, TikToks
 * cluster just under 60 s, and the Twitch channel is sub-funded.
 */

export const DEMO_DAYS = 180;
export const DEMO_WINDOW_DAYS = 90;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed: number) {
  const rand = mulberry32(seed);
  const normal = () => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    rand,
    int: (min: number, max: number) => Math.floor(min + rand() * (max - min + 1)),
    pick: <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)],
    lognormal: (median: number, sigma: number) => median * Math.exp(sigma * normal()),
    jitter: (x: number, pct: number) => x * (1 + (rand() * 2 - 1) * pct),
  };
}

const YT_LONG_TITLES = [
  "I built a standing desk from a single sheet of plywood",
  "Why your 3D prints keep failing (and the 5 minute fix)",
  "Turning a $40 thrift-store lamp into something I'd actually buy",
  "The workshop tour nobody asked for",
  "Testing 6 budget routers so you don't have to",
  "I spent 30 days with a $150 CNC. Here's the truth",
  "Making a walnut keyboard case from scratch",
  "Every mistake I made building my first van shelf",
  "How I organise 2,000 screws (and finally stopped losing them)",
  "Building the ultimate under-$100 dust collection",
  "Restoring a 1960s hand plane to better than new",
  "The one jig that changed how I cut plywood",
  "Soundproofing a tiny apartment workshop",
  "I tried a week of 15-minute builds",
  "Finishing wood with stuff from the kitchen (surprising results)",
  "Can a $20 multimeter replace my $200 one?",
];

const YT_SHORT_TITLES = [
  "This clamp trick saves me every time",
  "Don't buy sandpaper until you see this",
  "60 seconds: perfect miter joints",
  "The $3 tool I use daily",
  "Satisfying epoxy pour",
  "Hand plane vs power planer",
  "Shop safety in 30 seconds",
  "POV: your first dovetail",
  "Cheap vs expensive drill bits",
  "One board, one hour, one shelf",
];

const YT_LIVE_TITLES = [
  "Live build: finishing the workbench (Q&A)",
  "Shop hangout: answering your tool questions",
  "Late-night design session for the next project",
  "Unboxing viewer-suggested tools live",
];

const TWITCH_TITLES = [
  "Ranked grind to Diamond | !sub goal",
  "Community games night 🎮 | drops on",
  "First playthrough — no spoilers please",
  "Speedrun practice, chill vibes",
  "Chat picks my loadout | !bits",
  "Co-op chaos with friends",
  "Cozy Sunday stream — building the base",
  "Viewer challenges all stream",
];

const TIKTOK_TITLES = [
  "the tool every beginner should own #workshop",
  "sanding hack you'll wish you knew sooner",
  "building a shelf in under a minute",
  "3 mistakes killing your woodworking",
  "epoxy river table in 59 seconds",
  "why I stopped buying expensive clamps",
  "before vs after: $40 lamp",
  "this joint needs no glue",
  "how I set up a shop in a 1-bed apartment",
  "testing viral wood finish hacks",
  "full build: walnut keyboard case (long version)",
  "everything wrong with cheap drill bits",
];

function isoAt(now: Date, daysAgo: number, hourUtc: number): string {
  const d = new Date(now.getTime() - daysAgo * 86_400_000);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

/** New uploads haven't finished accumulating views yet. */
function maturity(daysAgo: number): number {
  if (daysAgo >= 14) return 1;
  return 0.25 + 0.75 * (daysAgo / 14);
}

export interface DemoData {
  snapshots: ChannelSnapshot[];
  items: ContentItem[];
}

/**
 * What an item's view count would have been `daysBack` days ago, used to seed
 * a plausible metric history so "new views" deltas show up in demo mode.
 * Returns null when the item did not exist yet.
 */
export function backdatedViews(item: ContentItem, daysBack: number, now = new Date()): number | null {
  const ageDays = (now.getTime() - new Date(item.publishedAt).getTime()) / 86_400_000;
  const ageThen = ageDays - daysBack;
  if (ageThen < 0) return null;
  const growth = maturity(ageThen) / maturity(ageDays); // early-life ramp
  const longTail = 1 - Math.min(0.5, 0.004 * daysBack); // slow lifetime accumulation
  return Math.round(item.views * growth * longTail);
}

export function buildDemoData(now = new Date()): DemoData {
  const rng = makeRng(20261021);
  const items: ContentItem[] = [];
  let seq = 0;
  const nextId = (p: string) => `${p}-${String(++seq).padStart(3, "0")}`;

  const progress = (daysAgo: number) => 1 - daysAgo / DEMO_DAYS; // 0 = oldest, 1 = today

  /* ---------------- YouTube ---------------- */
  let ytReported90 = 0;
  for (let daysAgo = DEMO_DAYS; daysAgo >= 0; daysAgo--) {
    const date = new Date(now.getTime() - daysAgo * 86_400_000);
    const weekday = date.getUTCDay();
    const trend = 1 + 0.35 * progress(daysAgo);

    // Long-form on Tuesday and Friday; Tuesday performs better.
    if (weekday === 2 || weekday === 5) {
      const durationSec = rng.pick([rng.int(360, 540), rng.int(600, 1150), rng.int(600, 1150), rng.int(1260, 1700)]);
      const sweetSpot = durationSec >= 600 && durationSec < 1200 ? 1.5 : 1;
      const dayBoost = weekday === 2 ? 1.8 : 1;
      const views = Math.round(rng.lognormal(16000, 0.65) * trend * sweetSpot * dayBoost * maturity(daysAgo));
      const id = nextId("yt");
      const rpm = rng.lognormal(4.6, 0.25);
      const reported = daysAgo >= 3 ? Number(((views / 1000) * rpm).toFixed(2)) : undefined;
      if (reported !== undefined && daysAgo <= DEMO_WINDOW_DAYS) ytReported90 += reported;
      items.push({
        id: `youtube:${id}`,
        platform: "youtube",
        externalId: id,
        kind: "video",
        title: rng.pick(YT_LONG_TITLES),
        url: `https://www.youtube.com/watch?v=${id}`,
        publishedAt: isoAt(now, daysAgo, 15),
        durationSec,
        views,
        likes: Math.round(views * rng.jitter(0.045, 0.3)),
        comments: Math.round(views * rng.jitter(0.004, 0.4)),
        reportedRevenueUsd: reported,
      });
    }

    // Shorts Monday / Wednesday / Saturday.
    if (weekday === 1 || weekday === 3 || weekday === 6) {
      const durationSec = rng.int(18, 58);
      const views = Math.round(rng.lognormal(55000, 1.0) * trend * maturity(daysAgo));
      const id = nextId("yts");
      items.push({
        id: `youtube:${id}`,
        platform: "youtube",
        externalId: id,
        kind: "short",
        title: rng.pick(YT_SHORT_TITLES),
        url: `https://www.youtube.com/shorts/${id}`,
        publishedAt: isoAt(now, daysAgo, 17),
        durationSec,
        views,
        likes: Math.round(views * rng.jitter(0.06, 0.3)),
        comments: Math.round(views * rng.jitter(0.0015, 0.4)),
      });
      // Modelled Shorts revenue contributes to the channel's reported total.
      if (daysAgo <= DEMO_WINDOW_DAYS) ytReported90 += (views / 1000) * 0.07;
    }

    // Live every other Sunday.
    if (weekday === 0 && Math.floor(daysAgo / 7) % 2 === 0) {
      const durationSec = rng.int(5400, 9000);
      const avgViewers = Math.round(rng.lognormal(320, 0.3) * trend);
      const views = Math.round(avgViewers * rng.jitter(14, 0.3) * maturity(daysAgo));
      const id = nextId("ytl");
      items.push({
        id: `youtube:${id}`,
        platform: "youtube",
        externalId: id,
        kind: "live",
        title: rng.pick(YT_LIVE_TITLES),
        url: `https://www.youtube.com/watch?v=${id}`,
        publishedAt: isoAt(now, daysAgo, 19),
        durationSec,
        views,
        likes: Math.round(views * 0.03),
        comments: Math.round(views * 0.02),
        avgViewers,
        peakViewers: Math.round(avgViewers * rng.jitter(1.9, 0.2)),
      });
      if (daysAgo <= DEMO_WINDOW_DAYS) ytReported90 += (views / 1000) * 2.8;
    }
  }

  /* ---------------- Twitch ---------------- */
  for (let daysAgo = DEMO_DAYS; daysAgo >= 0; daysAgo--) {
    const date = new Date(now.getTime() - daysAgo * 86_400_000);
    const weekday = date.getUTCDay();
    if (!(weekday === 2 || weekday === 4 || weekday === 6)) continue;
    if (rng.rand() < 0.1) continue; // the occasional skipped stream
    const trend = 1 + 0.2 * progress(daysAgo);
    const durationSec = rng.int(3 * 3600, 5 * 3600 + 1800);
    const avgViewers = Math.round(rng.lognormal(140, 0.35) * trend * (weekday === 6 ? 1.25 : 1));
    const id = nextId("tw");
    items.push({
      id: `twitch:${id}`,
      platform: "twitch",
      externalId: id,
      kind: "live",
      title: rng.pick(TWITCH_TITLES),
      url: `https://www.twitch.tv/videos/${id}`,
      publishedAt: isoAt(now, daysAgo, 20),
      durationSec,
      views: Math.round(avgViewers * rng.jitter(9, 0.35)),
      avgViewers,
      peakViewers: Math.round(avgViewers * rng.jitter(1.8, 0.2)),
      streamId: id,
    });
  }

  /* ---------------- TikTok ---------------- */
  for (let daysAgo = DEMO_DAYS; daysAgo >= 0; daysAgo--) {
    const date = new Date(now.getTime() - daysAgo * 86_400_000);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (rng.rand() < 0.15) continue;
    const trend = 1 + 0.5 * progress(daysAgo);
    const long = rng.rand() < 0.35;
    const durationSec = long ? rng.int(61, 150) : rng.int(22, 59);
    const views = Math.round(rng.lognormal(long ? 28000 : 46000, 1.05) * trend * maturity(daysAgo));
    const id = nextId("tt");
    items.push({
      id: `tiktok:${id}`,
      platform: "tiktok",
      externalId: id,
      kind: long ? "video" : "short",
      title: rng.pick(TIKTOK_TITLES),
      url: `https://www.tiktok.com/@pixelandpine/video/${id}`,
      publishedAt: isoAt(now, daysAgo, 13),
      durationSec,
      views,
      likes: Math.round(views * rng.jitter(0.085, 0.35)),
      comments: Math.round(views * rng.jitter(0.003, 0.4)),
      shares: Math.round(views * rng.jitter(0.009, 0.4)),
    });
  }

  const capturedAt = now.toISOString();
  const snapshots: ChannelSnapshot[] = [
    {
      platform: "youtube",
      capturedAt,
      displayName: "Pixel & Pine",
      handle: "@pixelandpine",
      followers: 148_200,
      monetized: true,
      reportedRevenueUsdInWindow: Number(ytReported90.toFixed(2)),
      windowDays: DEMO_WINDOW_DAYS,
    },
    {
      platform: "twitch",
      capturedAt,
      displayName: "pixelandpine",
      handle: "pixelandpine",
      followers: 24_300,
      subs: { tier1: 212, tier2: 14, tier3: 3, gifted: 41 },
      bitsInWindow: 96_000,
      windowDays: DEMO_WINDOW_DAYS,
    },
    {
      platform: "tiktok",
      capturedAt,
      displayName: "Pixel & Pine",
      handle: "@pixelandpine",
      followers: 182_000,
      windowDays: DEMO_WINDOW_DAYS,
    },
  ];

  return { snapshots, items };
}

/**
 * Viewer-count samples for the most recent demo Twitch streams, so the
 * streams page has curves to draw: a ramp over the first 15% of the
 * broadcast, a gentle hump, a tail-off after 75%, mild noise. Each curve is
 * rescaled so its mean matches the item's avgViewers and clipped at its peak.
 */
export function demoLiveSamples(items: ContentItem[], opts: { streams?: number; stepMinutes?: number } = {}): LiveSample[] {
  const { streams = 8, stepMinutes = 5 } = opts;
  const recent = items
    .filter((i) => i.platform === "twitch" && i.kind === "live" && i.streamId && i.avgViewers)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, streams);
  const out: LiveSample[] = [];
  recent.forEach((item, idx) => {
    const rng = makeRng(777 + idx);
    const start = new Date(item.publishedAt).getTime();
    const steps = Math.max(2, Math.floor(item.durationSec / 60 / stepMinutes));
    const raw: number[] = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const ramp = Math.min(1, t / 0.15);
      const tail = t > 0.75 ? 1 - ((t - 0.75) / 0.25) * 0.45 : 1;
      const hump = 1 + 0.25 * Math.sin(Math.PI * t);
      raw.push(ramp * tail * hump * rng.jitter(1, 0.08));
    }
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
    const scale = item.avgViewers! / mean;
    raw.forEach((v, k) => {
      out.push({
        platform: "twitch",
        streamId: item.streamId!,
        capturedAt: new Date(start + k * stepMinutes * 60_000).toISOString(),
        viewerCount: Math.min(item.peakViewers ?? Infinity, Math.max(0, Math.round(v * scale))),
        title: item.title,
        startedAt: item.publishedAt,
      });
    });
  });
  return out;
}
