import { z, type ZodType } from "zod";

/**
 * JSON Schema for a zod type in the shape OpenAI-compatible `response_format`
 * endpoints expect: no `$schema` header, objects closed with
 * `additionalProperties: false` and every property required (which zod's
 * converter already emits for non-optional fields).
 */
export function toJsonSchema(schema: ZodType, opts: { stripDescriptions?: boolean } = {}): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  if (opts.stripDescriptions) stripDescriptions(json);
  return json;
}

/** Field descriptions are prompt guidance; on tight token budgets the system prompt carries it instead. */
function stripDescriptions(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(stripDescriptions);
    return;
  }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    delete o.description;
    Object.values(o).forEach(stripDescriptions);
  }
}

/** Rough token count for budgeting requests against per-minute limits (≈3.5 chars per token for JSON-heavy English). */
export function estimateTokens(...parts: string[]): number {
  return Math.ceil(parts.reduce((n, p) => n + p.length, 0) / 3.5);
}
