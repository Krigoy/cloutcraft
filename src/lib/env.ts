import "server-only";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

/**
 * Typed access to environment variables.
 *
 * Every platform integration is optional: when a platform's client id/secret
 * is missing the connect button for it is disabled and the app can still run
 * entirely on demo data. Only APP_ENCRYPTION_KEY is required, because OAuth
 * tokens are encrypted at rest with it.
 *
 * Operational knobs (sync depth, scheduler thresholds, coach model, analysis
 * windows) all have defaults and are documented in .env.example.
 */
const csvInts = (fallback: number[]) =>
  z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return fallback;
      const nums = s
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      return nums.length ? [...new Set(nums)].sort((a, b) => a - b) : fallback;
    });

const schema = z.object({
  /** Optional fixed public URL. When unset, the origin of each request is used (any port works). */
  APP_URL: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().url().optional()),
  APP_ENCRYPTION_KEY: z
    .string()
    .min(32, "APP_ENCRYPTION_KEY must be at least 32 characters (use `openssl rand -hex 32`)"),
  /** Postgres connection string (Supabase: the session pooler URL, *.pooler.supabase.com:5432). */
  DATABASE_URL: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().url().optional()),
  /**
   * Embedded Postgres directory used when DATABASE_URL is unset (local dev
   * only); ":memory:" for tests. Lives outside the project on purpose: the
   * dev server hot-reloads on any file change under the project root, and a
   * database writing WAL files there would reload the page on every query.
   */
  PGLITE_PATH: z.string().default(join(homedir(), ".cloutcraft", "pglite")),

  /* --- AI coach --- */
  /** Which provider answers first; "auto" = first configured in the order gemini, groq, anthropic, ollama. */
  COACH_PROVIDER: z.enum(["auto", "gemini", "groq", "anthropic", "ollama"]).default("auto"),
  /** Try the other configured providers when the primary fails or is rate-limited. */
  COACH_FALLBACK: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  COACH_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  COACH_MAX_TOKENS: z.coerce.number().int().positive().default(16000),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  /** Set to enable a local Ollama server, e.g. http://localhost:11434 */
  OLLAMA_URL: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().url().optional()),
  OLLAMA_MODEL: z.string().default("gpt-oss:20b"),

  /* --- Scheduler --- */
  /** Shared secret for the scheduler endpoint (/api/cron/tick). Required in production. */
  CRON_SECRET: z.string().optional(),
  /** How often the scheduler performs a full re-sync of every connection. */
  SYNC_INTERVAL_HOURS: z.coerce.number().positive().default(6),
  /** A channel counts as "live now" if it was sampled within this many minutes. */
  LIVE_FRESH_MINUTES: z.coerce.number().positive().default(5),
  /** A stream is treated as ended once no sample has arrived for this long. */
  LIVE_ENDED_MINUTES: z.coerce.number().positive().default(10),
  /** Minimum viewer samples before live stats are trusted for a stream. */
  LIVE_MIN_SAMPLES: z.coerce.number().int().positive().default(3),

  /* --- Sync depth --- */
  SYNC_LOOKBACK_DAYS: z.coerce.number().int().positive().default(180),
  SYNC_MAX_ITEMS: z.coerce.number().int().positive().default(300),
  /** Minutes an OAuth state (CSRF token) stays valid. */
  OAUTH_STATE_TTL_MINUTES: z.coerce.number().positive().default(10),

  /* --- Analysis --- */
  /** Selectable analysis windows, comma-separated days. */
  WINDOW_OPTIONS: csvInts([30, 90, 180]),
  DEFAULT_WINDOW_DAYS: z.coerce.number().int().positive().default(90),
  /** IANA time zone used for "best weekday" analysis; defaults to the server's zone. */
  ANALYSIS_TIMEZONE: z
    .string()
    .optional()
    .transform((tz) => tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
    .refine((tz) => {
      try {
        Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "ANALYSIS_TIMEZONE must be a valid IANA time zone"),

  /* --- Platform credentials --- */
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  if (!cached.WINDOW_OPTIONS.includes(cached.DEFAULT_WINDOW_DAYS)) {
    cached.WINDOW_OPTIONS = [...cached.WINDOW_OPTIONS, cached.DEFAULT_WINDOW_DAYS].sort((a, b) => a - b);
  }
  return cached;
}

