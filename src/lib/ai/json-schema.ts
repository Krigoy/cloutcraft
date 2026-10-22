import { z, type ZodType } from "zod";

/**
 * JSON Schema for a zod type in the shape OpenAI-compatible `response_format`
 * endpoints expect: no `$schema` header, objects closed with
 * `additionalProperties: false` and every property required (which zod's
 * converter already emits for non-optional fields).
 */
export function toJsonSchema(schema: ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
