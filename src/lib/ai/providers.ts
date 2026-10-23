import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";
import { env } from "@/lib/env";
import { estimateTokens, toJsonSchema } from "./json-schema";

/**
 * LLM providers for the coach. Gemini, Groq and Ollama all expose an
 * OpenAI-compatible chat endpoint with JSON-schema response formatting, so
 * they share one `fetch`-based implementation; Anthropic uses its SDK's
 * structured outputs. Every provider returns raw JSON text that the caller
 * validates against the zod schema, so a misbehaving model can never leak an
 * invalid plan into the UI.
 */

export type CoachProvider = "gemini" | "groq" | "anthropic" | "ollama";

export interface ProviderConfig {
  id: CoachProvider;
  label: string;
  model: string;
  configured: boolean;
  /** Same provider, other models to try after `model` (expanded by providerChain). */
  extraModels?: string[];
  /** Ask for a shorter plan: the provider's free tier cannot fit the full one. */
  compact?: boolean;
  /** Where the request goes; shown in Settings so the privacy trade-off is visible. */
  note: string;
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: CoachProvider,
    public readonly code: "auth" | "rate_limit" | "api" | "unparseable" | "refusal" | "network",
    message: string,
    public readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }
}

const AUTO_ORDER: CoachProvider[] = ["gemini", "groq", "anthropic", "ollama"];

export function providerConfigs(): ProviderConfig[] {
  const e = env();
  return [
    {
      id: "gemini",
      label: "Google Gemini",
      model: e.GEMINI_MODEL,
      extraModels: e.GEMINI_FALLBACK_MODELS.filter((m) => m !== e.GEMINI_MODEL),
      configured: Boolean(e.GEMINI_API_KEY),
      note: "Free tier; prompts may be used to improve Google products outside the EEA/UK/CH.",
    },
    {
      id: "groq",
      label: "Groq",
      model: e.GROQ_MODEL,
      configured: Boolean(e.GROQ_API_KEY),
      compact: true,
      note: "Free tier (8k tokens/min): produces a condensed plan.",
    },
    {
      id: "anthropic",
      label: "Anthropic Claude",
      model: e.ANTHROPIC_MODEL,
      configured: Boolean(e.ANTHROPIC_API_KEY),
      note: "Paid; strongest reasoning.",
    },
    {
      id: "ollama",
      label: "Ollama (local)",
      model: e.OLLAMA_MODEL,
      configured: Boolean(e.OLLAMA_URL),
      note: "Runs on your machine; nothing leaves it.",
    },
  ];
}

/** Primary provider first, then (if COACH_FALLBACK) every other configured one in auto order. */
export function providerChain(): ProviderConfig[] {
  const e = env();
  const configs = providerConfigs();
  const configured = AUTO_ORDER.map((id) => configs.find((c) => c.id === id)!).filter((c) => c.configured);
  const primary = e.COACH_PROVIDER === "auto" ? configured[0] : configs.find((c) => c.id === e.COACH_PROVIDER);
  if (!primary || !primary.configured) return [];
  const alternates = (c: ProviderConfig): ProviderConfig[] =>
    (c.extraModels ?? []).map((model) => ({ ...c, model, extraModels: undefined }));
  if (!e.COACH_FALLBACK) return [primary, ...alternates(primary)];
  // Other providers come before a provider's own alternate models: when one
  // vendor is overloaded, a different vendor is the faster way to an answer.
  const others = configured.filter((c) => c.id !== primary.id);
  return [primary, ...others, ...alternates(primary), ...others.flatMap(alternates)];
}

export interface CoachAvailability {
  enabled: boolean;
  primary?: ProviderConfig;
  fallbacks: ProviderConfig[];
  /** Human hint when nothing is configured. */
  hint: string;
}

export function coachAvailability(): CoachAvailability {
  const chain = providerChain();
  const e = env();
  const hint =
    e.COACH_PROVIDER !== "auto" && !providerConfigs().find((c) => c.id === e.COACH_PROVIDER)?.configured
      ? `COACH_PROVIDER=${e.COACH_PROVIDER} but its credentials are missing in .env.local.`
      : "Add GEMINI_API_KEY (free at aistudio.google.com) or GROQ_API_KEY to .env.local and restart.";
  return { enabled: chain.length > 0, primary: chain[0], fallbacks: chain.slice(1), hint };
}

export interface JsonCompletionRequest<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  /** Hard cap for this attempt, including retries. */
  timeoutMs: number;
}

export interface JsonCompletionResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

interface OpenAICompatibleResponse {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string };
}

function openAiEndpoint(id: CoachProvider): { url: string; key: string } {
  const e = env();
  switch (id) {
    case "gemini":
      return { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: e.GEMINI_API_KEY! };
    case "groq":
      return { url: "https://api.groq.com/openai/v1/chat/completions", key: e.GROQ_API_KEY! };
    case "ollama":
      return { url: new URL("/v1/chat/completions", e.OLLAMA_URL!).toString(), key: "ollama" };
    default:
      throw new Error(`${id} is not an OpenAI-compatible provider`);
  }
}

/**
 * gpt-oss on Groq accepts low/medium/high. Map one step down from the
 * Anthropic-style scale: the free tier counts reasoning tokens against an
 * 8k tokens-per-minute budget, and "high" alone can spend ~9k on this task.
 */
function groqReasoningEffort(effort: string): "low" | "medium" {
  return effort === "low" || effort === "medium" ? "low" : "medium";
}

/** Groq free tier: keep prompt + completion inside the per-minute budget. */
const GROQ_MAX_TOKENS = 6000;
/** Free-tier tokens-per-minute limit (8,000) with headroom for the estimate being rough. */
const GROQ_TPM_BUDGET = 7400;
/** Below this a compact plan gets cut off; the provider then fails over instead of truncating. */
const GROQ_MIN_OUTPUT_TOKENS = 2800;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function completeOpenAiCompatible<T>(
  cfg: ProviderConfig,
  req: JsonCompletionRequest<T>,
): Promise<JsonCompletionResult> {
  const e = env();
  const { url, key } = openAiEndpoint(cfg.id);
  // Field descriptions stay in even on tight budgets: without them gpt-oss drops required fields.
  const schema = toJsonSchema(req.schema);
  // Groq's free tier counts prompt + max_tokens against an 8k tokens-per-minute
  // limit, so the output allowance is whatever the prompt leaves over.
  const promptTokens = estimateTokens(req.system, req.user, JSON.stringify(schema));
  const maxTokens =
    cfg.id === "groq"
      ? Math.max(GROQ_MIN_OUTPUT_TOKENS, Math.min(e.COACH_MAX_TOKENS, GROQ_MAX_TOKENS, GROQ_TPM_BUDGET - promptTokens))
      : e.COACH_MAX_TOKENS;
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schemaName, strict: true, schema },
    },
    max_tokens: maxTokens,
  };
  if (cfg.id === "groq" && /gpt-oss/.test(cfg.model)) body.reasoning_effort = groqReasoningEffort(e.COACH_EFFORT);

  // One quick retry on overload / rate-limit (Gemini's free tier 503s in
  // bursts); further resilience comes from the next model in the chain.
  // Every attempt is bounded so a hung upstream can't eat the whole budget.
  const started = Date.now();
  let res: Response | undefined;
  let payload: OpenAICompatibleResponse = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = req.timeoutMs - (Date.now() - started);
    if (remaining < 3000) throw new ProviderError(cfg.id, "network", "out of time");
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(remaining),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new ProviderError(cfg.id, "network", timedOut ? `no response within ${Math.round(req.timeoutMs / 1000)}s` : err instanceof Error ? err.message : "request failed");
    }
    payload = (await res.json().catch(() => ({}))) as OpenAICompatibleResponse;
    if (res.status !== 503 && res.status !== 429) break;
    if (attempt === 0) {
      // A per-minute limit tells us how long until the window clears (Groq:
      // "Please try again in 12.4s" / Retry-After). Waiting it out — inside the
      // attempt budget — is what lets a follow-up sent right after a plan succeed.
      const wait = Math.min(retryAfterMs(res, payload), req.timeoutMs - (Date.now() - started) - 3000);
      if (wait < 0) break;
      await sleep(Math.max(1500, wait));
    }
  }
  if (!res) throw new ProviderError(cfg.id, "network", "no response");

  if (!res.ok) {
    const message = payload.error?.message ?? `HTTP ${res.status}`;
    const code = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limit" : "api";
    throw new ProviderError(cfg.id, code, message, res.status);
  }
  const choice = payload.choices?.[0];
  if (choice?.message?.refusal) throw new ProviderError(cfg.id, "refusal", choice.message.refusal);
  if (choice?.finish_reason === "length") throw new ProviderError(cfg.id, "api", "response was cut off (raise COACH_MAX_TOKENS)");
  const text = choice?.message?.content;
  if (!text) throw new ProviderError(cfg.id, "unparseable", "empty response");
  return {
    text,
    model: payload.model ?? cfg.model,
    usage: { inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0 },
  };
}

/** Delay a rate-limited endpoint asked for, from Retry-After or the message body; 1.5 s when it didn't say. */
function retryAfterMs(res: Response, payload: OpenAICompatibleResponse): number {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const m = /try again in ([\d.]+)\s*(ms|s|m)\b/i.exec(payload.error?.message ?? "");
  if (!m) return 1500;
  const n = Number(m[1]);
  return m[2] === "ms" ? n : m[2] === "m" ? n * 60_000 : n * 1000;
}

async function completeAnthropic<T>(cfg: ProviderConfig, req: JsonCompletionRequest<T>): Promise<JsonCompletionResult> {
  const e = env();
  const client = new Anthropic({ apiKey: e.ANTHROPIC_API_KEY, timeout: req.timeoutMs, maxRetries: 1 });
  try {
    const response = await client.messages.parse({
      model: cfg.model,
      max_tokens: e.COACH_MAX_TOKENS,
      system: req.system,
      output_config: { effort: e.COACH_EFFORT, format: zodOutputFormat(req.schema) },
      messages: [{ role: "user", content: req.user }],
    });
    if (response.stop_reason === "refusal") {
      throw new ProviderError("anthropic", "refusal", response.stop_details?.explanation ?? "declined");
    }
    if (response.stop_reason === "max_tokens") {
      throw new ProviderError("anthropic", "api", "response was cut off (raise COACH_MAX_TOKENS)");
    }
    if (!response.parsed_output) throw new ProviderError("anthropic", "unparseable", "could not parse output");
    return {
      text: JSON.stringify(response.parsed_output),
      model: response.model,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new ProviderError("anthropic", "auth", "API key rejected", 401);
    if (err instanceof Anthropic.RateLimitError) throw new ProviderError("anthropic", "rate_limit", "rate limited", 429);
    if (err instanceof Anthropic.APIError) throw new ProviderError("anthropic", "api", err.message, err.status);
    if (err instanceof Anthropic.APIConnectionError) throw new ProviderError("anthropic", "network", err.message);
    throw new ProviderError("anthropic", "api", err instanceof Error ? err.message : String(err));
  }
}

export function completeJson<T>(cfg: ProviderConfig, req: JsonCompletionRequest<T>): Promise<JsonCompletionResult> {
  return cfg.id === "anthropic" ? completeAnthropic(cfg, req) : completeOpenAiCompatible(cfg, req);
}
