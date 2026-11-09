import "server-only";
import Groq from "groq-sdk";

export type ProviderErrorFields = Partial<Record<"code" | "type" | "param", string | null>>;
export function safeBadRequestFields(error: unknown): ProviderErrorFields | undefined {
  if (!(error instanceof Groq.APIError) || error.status !== 400 || !error.error || typeof error.error !== "object") return;
  const body = error.error as Record<string, unknown>;
  // The installed SDK retains the JSON envelope in APIError.error.
  const detail = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : body;
  const allowed = {
    code: ["tool_use_failed", "tool_call_validation_failed", "invalid_tool_call", "invalid_request_error", "invalid_parameter", "unsupported_parameter", "invalid_value", "model_not_found", "model_decommissioned", "context_length_exceeded", "json_validate_failed"],
    type: ["invalid_request_error", "invalid_request", "validation_error", "invalid_parameter_error", "tool_use_error", "bad_request"],
    param: ["model", "parallel_tool_calls", "reasoning_format", "reasoning_effort", "response_format", "tool_choice", "tools", "messages", "temperature", "max_completion_tokens", "store", "include_reasoning", "tools[0].function.name", "tools[0].function.parameters"],
  };
  const fields: ProviderErrorFields = {};
  for (const field of ["code", "type", "param"] as const) {
    const value = detail[field];
    if (value === undefined) continue;
    // Even structured provider fields can echo caller content. Never log unknown values.
    fields[field] = value === null ? null : typeof value === "string" && allowed[field].includes(value) ? value : "redacted";
  }
  return Object.keys(fields).length ? fields : undefined;
}
