# CloutCraft

A self-hosted dashboard for creators that connects to **YouTube, Twitch and TikTok**, estimates what each video, Short and live stream earned, tracks how views grow over time, and uses an LLM (free Gemini/Groq tiers, Claude, or a local Ollama model) to turn the numbers into a concrete growth plan.

## What it does

**Routes**: `/` is the animated introduction (anime.js entrance, scroll-reveal and parallax; headlines laid out line-by-line with Pretext); the dashboard lives at `/dashboard`, with `/content`, `/coach` and `/settings` alongside.

- **Earnings per item and per channel**, always as a *low / mid / high* band and labelled by how solid it is:
  - **Reported** – the platform told us (YouTube Analytics revenue, for Partner Program channels that grant the monetary scope).
  - **Calibrated** – modelled per item, then scaled so the channel total matches a figure the platform reported.
  - **Estimated** – views × payout assumptions (Twitch and TikTok expose no payout data at all).
- **View velocity**: every scheduled sync stores a view-count snapshot per item, so you get “new views in the last 24 h / 7 d” per video and overall.
- **Live monitoring (Twitch)**: while a channel is live the scheduler samples concurrent viewers once a minute, which gives real average/peak viewers per broadcast (Helix doesn’t expose that after the fact) and keeps streams whose VOD expires or was never saved.
- **Deterministic insights**: per-format baselines, best weekday per format, duration sweet spots, cadence gaps, format-mix vs earnings, hidden gems (high engagement, low reach), hit concentration, platform-specific monetisation gaps. Each is a numbered finding with the metrics behind it.
- **AI growth coach**: an LLM (Gemini 3.5 Flash by default, with Groq `gpt-oss-120b` as fallback; Claude and local Ollama also supported) reads the findings and returns prioritised recommendations with actions, expected impact and the finding ids used as evidence, plus a 30-day plan, experiments and caveats. Ask it a question or set a goal and it answers first; follow-ups continue the conversation, and past conversations live in a sidebar. Only the analytics summary is sent, never tokens or raw credentials.
- **Demo mode**: three generated channels with realistic patterns so the whole app works before any platform approves your developer app.

## Quick start

```bash
npm install
npm run setup          # writes .env.local with a fresh encryption key + cron secret
# add your Clerk keys to .env.local (see "Auth and database" below)
npm run dev            # http://localhost:3000 → sign up → Settings → “Install demo channels”
```

Locally the database is an embedded Postgres stored in `~/.cloutcraft/pglite` (outside the repo, so `next dev`'s file watcher never reacts to its writes); set `DATABASE_URL` to use Supabase instead.

Optional, in a second terminal:

```bash
npm run scheduler      # hits /api/cron/tick every minute (live sampling + 6-hourly full sync)
```

Add a free `GEMINI_API_KEY` (aistudio.google.com) and/or `GROQ_API_KEY` to `.env.local` to enable the coach; `ANTHROPIC_API_KEY` or a local `OLLAMA_URL` work too. `COACH_PROVIDER` picks the primary, the rest are automatic fallbacks.

### Scripts

| Command | What |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests (estimator, insights, rates, parsers) |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm run scheduler` | Development scheduler loop |

## Connecting real accounts

All redirect URIs are `<your app origin>/api/auth/<platform>/callback`. The app runs on any port (`next dev -p 4000`) and builds its own links from the request; set `APP_URL` only to pin a fixed public origin (tunnels, production).

| Platform | Where | Notes |
| --- | --- | --- |
| **Twitch** | [dev.twitch.tv/console](https://dev.twitch.tv/console) → Register application | Fastest to set up. Scopes: `channel:read:subscriptions`, `bits:read`, `moderator:read:followers`. |
| **YouTube** | Google Cloud Console → OAuth client (Web) + enable *YouTube Data API v3* and *YouTube Analytics API* | Revenue needs the channel to be in the Partner Program; otherwise earnings are modelled. Default quota 10,000 units/day is plenty (a full sync is ~10–20 units). |
| **TikTok** | [developers.tiktok.com](https://developers.tiktok.com) → Login Kit + Display API | Redirect URI must be **HTTPS** with no query string, so use a tunnel (`ngrok http 3000`) and set `APP_URL` to it. Only public videos are listed; no payout or LIVE-gift data exists in the API. |

Tokens are encrypted at rest (AES-256-GCM, key from `APP_ENCRYPTION_KEY`). Removing a connection deletes its data.

## How estimates work

Defaults live in [`src/lib/earnings/rates.ts`](src/lib/earnings/rates.ts) and can be overridden per band in **Settings → Payout assumptions**. Checked against public sources in October 2026:

| Platform | Model |
| --- | --- |
| YouTube long-form | views × RPM (default $1 / $2.50 / $8 per 1k; creators keep 55% of ad revenue) |
| YouTube Shorts | views × RPM ($0.05 / $0.10 / $0.30 per 1k) |
| YouTube live | views × RPM ($1 / $2 / $5); Super Chat & memberships not attributable via API |
| Twitch ads | viewer-hours × impressions/hour × CPM to streamer ($1 / $1.90 / $3.50 per 1k) |
| Twitch subs | tier counts × price ($5.99 / $9.99 / $24.99) × creator share (50% default, 60–70% Plus) × window; allocated to streams by viewer-hours |
| Twitch Bits | $0.01 per Bit (leaderboard top-100 per month, so a lower bound) |
| TikTok ≥ 1 min | views × qualified-view ratio × Creator Rewards RPM ($0.40 / $0.70 / $1.00 per 1k) |
| TikTok < 1 min, TikTok LIVE | not estimable ($0, flagged as a monetisation gap) |

When YouTube reports a channel total for the period, modelled items (e.g. Shorts) are scaled so everything adds up and marked *Calibrated*.

## Motion & UI

shadcn/ui (Base UI primitives) with Tailwind v4. Entrance animations, count-up figures, the sliding nav indicator and the income meters use [anime.js v4](https://animejs.com) (`src/components/motion/`); the hero earnings figure is sized to its card with [Pretext](https://github.com/chenglou/pretext), which measures text off-DOM so resizing never triggers layout reflow. Everything is server-rendered with final values first, `[data-reveal]` elements are only pre-hidden when JavaScript is running (with a CSS safety timer), and all motion is skipped under `prefers-reduced-motion`.

## Configuration

Everything operational is an environment variable with a default (see [.env.example](.env.example)): sync depth (`SYNC_LOOKBACK_DAYS`, `SYNC_MAX_ITEMS`), scheduler thresholds (`SYNC_INTERVAL_HOURS`, `LIVE_FRESH_MINUTES`, `LIVE_ENDED_MINUTES`, `LIVE_MIN_SAMPLES`), analysis windows (`WINDOW_OPTIONS`, `DEFAULT_WINDOW_DAYS`, `ANALYSIS_TIMEZONE`), the coach (`COACH_MODEL`, `COACH_EFFORT`, `COACH_MAX_TOKENS`) and `OAUTH_STATE_TTL_MINUTES`. Payout assumptions are edited in the UI; the estimator's calibration tuning (`DEFAULT_CALIBRATION`) and the insight rule thresholds (`DEFAULT_THRESHOLDS`) are exported objects that callers can override.

## Security notes

- Every page except the landing page and sign-in/up requires a Clerk session (`src/proxy.ts`); each user only ever sees their own workspace, and the OAuth callback refuses to link an account to anyone but the user who started the flow.
- Supabase tables have Row Level Security enabled with no policies, so the auto-generated REST API (public anon key) can read nothing; the app connects directly as the database owner.
- OAuth tokens are encrypted at rest; only the derived analytics summary is ever sent to the LLM provider (or nothing leaves the machine with Ollama).
- Mutating routes (`/api/sync`, `/api/demo`, disconnect) reject cross-site browser requests via Fetch Metadata / `Origin`; `/api/cron/tick` requires `CRON_SECRET` in production (constant-time compared); post-action redirects only follow same-origin referers.
- OAuth `state` is single-use with a TTL. TikTok, Twitch and YouTube flows use the authorization-code grant with the client secret kept server-side.
- `npm audit` currently reports only a `braces` ReDoS advisory reachable through the `shadcn` CLI (a build-time dev dependency needed for `shadcn/tailwind.css`); it is not part of the runtime bundle and no patched `braces` release exists yet.

## Architecture

```
src/lib/platforms/   adapters: youtube.ts, twitch.ts, tiktok.ts → common ContentItem / ChannelSnapshot
src/lib/earnings/    rates.ts (assumptions) · estimate.ts (pure estimator)
src/lib/insights/    analyze.ts (pure statistics → InsightReport with findings)
src/lib/ai/          coach.ts (provider chain + validation) · providers.ts (Gemini/Groq/Ollama via OpenAI-compatible API, Anthropic SDK) · schema.ts (zod)
src/lib/sync.ts      token refresh → adapter.sync → store snapshot, items, metric history
src/lib/scheduler.ts tick(): live sampling + periodic full sync
src/lib/db/          Postgres (Supabase via postgres.js, or embedded PGlite in ~/.cloutcraft locally) · schema.ts · repo.ts
src/lib/session.ts   Clerk user id → workspace id
src/proxy.ts         Clerk auth gate (Next 16 proxy)
src/app/             overview · content · coach · settings · API routes (auth, sync, demo, cron)
```

## Auth and database

- **Clerk**: create an application at [dashboard.clerk.com](https://dashboard.clerk.com) and copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Sign-in lives at `/sign-in`, sign-up at `/sign-up`; after either you land on `/dashboard`.
- **Supabase**: create a project, then **Connect → Session pooler** (`*.pooler.supabase.com:5432`) → `DATABASE_URL`. Don't use the direct connection (IPv6-only, Vercel can't reach it) or the transaction pooler on 6543 (it intermittently drops queries with postgres.js, leaving pages loading forever). The schema is created automatically on first request (idempotent, with Row Level Security enabled); nothing to run by hand.

## Deploying to Vercel

1. Import the GitHub repo at vercel.com/new (Next.js is detected automatically).
2. Environment variables: `APP_URL` (your production URL), `APP_ENCRYPTION_KEY` (generate a new one for production and never change it, or stored tokens become unreadable), `CRON_SECRET`, `DATABASE_URL`, the two Clerk keys (use a Clerk **production** instance for your real domain), and your coach / platform keys.
3. Register `https://<your-domain>/api/auth/<platform>/callback` with YouTube, Twitch and TikTok.
4. Keep **Fluid compute** enabled (the default for new projects): the coach route declares `maxDuration = 120`, which Hobby only allows under Fluid compute.
5. `vercel.json` schedules a daily full sync. Live viewer sampling needs a ping every minute, which the Hobby plan's cron can't do: point a free pinger (e.g. cron-job.org) at `POST https://<your-domain>/api/cron/tick` with `Authorization: Bearer <CRON_SECRET>`, or use per-minute Vercel Cron on Pro. The endpoint returns only counts, so nothing user-specific ends up in the pinger's logs.

## Roadmap ideas

- Kick (public API with subscription webhooks) and Instagram (Instagram API with Instagram Login) adapters.
- YouTube Super Chat attribution via `superChatEvents.list` matched to stream windows.
- Twitch EventSub instead of polling; YouTube live polling via `liveBroadcasts`.
- Multi-user sign-in and per-user timezones for the timing analysis.

## License

[MIT](LICENSE) © 2026 Krishna Goyal
