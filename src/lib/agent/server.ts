import "server-only";
import Groq from "groq-sdk";
import { randomUUID } from "node:crypto";
import { signAction, verifyAction, visitor } from "./receipts";
import { protectAgent } from "./protection";
import { executeDemoAgent } from "./execution";
import { safeBadRequestFields, type ProviderErrorFields } from "./diagnostics";
import { AGENT_LIMITS, AgentError, parseAgentRequest, parseReviewRequest } from "./contracts";
import type { AgentAction, AgentReceipt } from "./contracts";

interface Config { apiKey: string; model: string }
interface Dependencies { config?: () => Config; client?: (config: Config) => Groq; now?: () => number }
type GroqFailure = "api_key_missing" | "model_config_invalid" | "authentication_or_permission" |
  "model_or_parameters_incompatible" | "model_or_resource_not_found" | "provider_rate_limit" |
  "provider_timeout" | "provider_unavailable" | "provider_connection_error" | "execution_cancelled" |
  "tool_call_invalid" | "tool_arguments_invalid" | "tool_confirmation_invalid" | "analysis_invalid" | "execution_unknown";
function logGroqFailure(reason: GroqFailure, upstreamStatus?: number, providerError?: ProviderErrorFields) {
  // eslint-disable-next-line no-console -- Fixed diagnostic categories/status only; no provider/request payloads.
  console.warn(JSON.stringify({ event: "agent_groq", reason, ...(upstreamStatus === undefined ? {} : { upstreamStatus }), ...(providerError ? { providerError } : {}) }));
}
function diagnoseGroqExecution(error: unknown, timedOut: boolean) {
  let reason: GroqFailure = "execution_unknown";
  const e = error as { status?: unknown; name?: unknown } | null;
  const status = typeof e?.status === "number" && Number.isInteger(e.status) && e.status >= 400 && e.status <= 599 ? e.status : undefined;
  if (timedOut || error instanceof Groq.APIConnectionTimeoutError || e?.name === "APIConnectionTimeoutError" || e?.name === "TimeoutError") reason = "provider_timeout";
  else if (error instanceof AgentError) {
    if (["EXECUTION_NOT_AUTHORIZED", "INTENT_AMBIGUOUS", "DEMO_ONLY"].includes(error.code)) return;
    if (error.code === "INVALID_TOOL_CALL") reason = "tool_call_invalid";
    else if (error.code === "INVALID_TOOL") reason = "tool_arguments_invalid";
    else if (error.code === "INCOMPLETE_EXECUTION") reason = "tool_confirmation_invalid";
    else if (error.code === "INVALID_ANALYSIS") reason = "analysis_invalid";
  } else if (status === 401 || status === 403) reason = "authentication_or_permission";
  else if (status === 400 || status === 422) reason = "model_or_parameters_incompatible";
  else if (status === 404) reason = "model_or_resource_not_found";
  else if (status === 429) reason = "provider_rate_limit";
  else if (status !== undefined && status >= 500) reason = "provider_unavailable";
  else if (error instanceof Groq.APIUserAbortError || e?.name === "AbortError" || e?.name === "APIUserAbortError") reason = "execution_cancelled";
  else if (error instanceof Groq.APIConnectionError) reason = "provider_connection_error";
  logGroqFailure(reason, error instanceof AgentError ? undefined : status, safeBadRequestFields(error));
}
function environment(): Config {
  const apiKey = process.env.GROQ_API_KEY?.trim(), model = process.env.GROQ_MODEL?.trim();
  if (!apiKey || !model || model.length > 120 || !/^[\w./:-]+$/.test(model)) {
    logGroqFailure(!apiKey ? "api_key_missing" : "model_config_invalid");
    throw new AgentError("NOT_CONFIGURED", "Configure GROQ_API_KEY e GROQ_MODEL no servidor. Nenhuma ação foi criada.", 503);
  }
  return { apiKey, model };
}
function response(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
async function readRequest(request: Request, maximum = AGENT_LIMITS.bodyBytes as number): Promise<unknown> {
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  let localAlias = false;
  try {
    const from = new URL(origin ?? "");
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    // NextURL canonicalizes loopback hostnames to localhost; preserve same-origin Host checks.
    localAlias = from.origin === origin && loopback.has(target.hostname) && loopback.has(from.hostname) && target.protocol === from.protocol &&
      target.port === from.port && request.headers.get("host")?.toLowerCase() === from.host;
  } catch { /* Missing/malformed origins are rejected below. */ }
  if (!origin || (origin !== target.origin && !localAlias) || request.headers.get("sec-fetch-site") === "cross-site") throw new AgentError("ORIGIN", "Origem da solicitação não permitida.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new AgentError("CONTENT_TYPE", "Envie uma solicitação JSON.", 415);
  if (Number(request.headers.get("content-length")) > maximum) throw new AgentError("TOO_LARGE", "Solicitação acima do limite permitido.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new AgentError("INVALID_INPUT", "Solicitação vazia.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new AgentError("TIMEOUT", "Tempo de leitura esgotado.", 408)); void reader.cancel().catch(() => {}); }, AGENT_LIMITS.bodyTimeoutMs);
  });
  try {
    while (true) {
      const next = await Promise.race([reader.read(), deadline]); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximum) { void reader.cancel().catch(() => {}); throw new AgentError("TOO_LARGE", "Solicitação acima do limite permitido.", 413); }
      chunks.push(next.value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  const text = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { text.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(text)); } catch { throw new AgentError("INVALID_JSON", "JSON inválido."); }
}
function errorResponse(error: unknown, timedOut = false) {
  if (error instanceof AgentError) return response({ error: { code: error.code, message: error.message } }, error.status);
  const e = error as { status?: number; name?: string } | null;
  if (timedOut || error instanceof Groq.APIConnectionTimeoutError || e?.name === "APIConnectionTimeoutError" || e?.name === "TimeoutError") return response({ error: { code: "TIMEOUT", message: "Tempo de execução esgotado. Nenhuma ação foi registrada." } }, 504);
  if (e?.status === 429) return response({ error: { code: "RATE_LIMIT", message: "Limite da Groq atingido. Aguarde e tente novamente; nenhuma ação foi criada." } }, 429);
  if (error instanceof Groq.APIUserAbortError || e?.name === "AbortError" || e?.name === "APIUserAbortError") return response({ error: { code: "CANCELLED", message: "Execução cancelada." } }, 408);
  return response({ error: { code: "UNAVAILABLE", message: "IA externa indisponível ou configuração incompatível. Nenhuma ação foi criada." } }, 503);
}
/** Signed demo receipts live in the browser. Local maps are best-effort backpressure only. */
export function createAgentHandlers(dependencies: Dependencies = {}) {
  const usedRequests = new Map<string, number>();
  let active = false, recent: number[] = [];
  const now = dependencies.now ?? Date.now;
  const cleanup = () => {
    for (const [id, expires] of usedRequests) if (expires <= now()) usedRequests.delete(id);
    recent = recent.filter((time) => time > now() - 60000);
  };
  return {
    POST: async (request: Request): Promise<Response> => {
      let timer: ReturnType<typeof setTimeout> | undefined, ownsExecution = false, timedOut = false, executingGroq = false;
      const controller = new AbortController();
      const abort = () => controller.abort();
      try {
        const input = parseAgentRequest(await readRequest(request));
        const config = (dependencies.config ?? environment)();
        if (!config.apiKey || !config.model) {
          logGroqFailure(!config.apiKey ? "api_key_missing" : "model_config_invalid");
          throw new AgentError("NOT_CONFIGURED", "Configuração do servidor incompleta.", 503);
        }
        await protectAgent(request);
        cleanup();
        if (usedRequests.has(input.requestId)) throw new AgentError("DUPLICATE", "Solicitação já recebida. Confira a Central de Ações ou inicie uma nova solicitação.", 409);
        if (active || recent.length >= 10) throw new AgentError("RATE_LIMIT", "Execução em andamento ou limite de solicitações atingido. Aguarde antes de tentar novamente.", 429);
        active = true; ownsExecution = true; recent.push(now()); usedRequests.set(input.requestId, now() + AGENT_LIMITS.ttlMs);
        request.signal.addEventListener("abort", abort, { once: true });
        if (request.signal.aborted) controller.abort();
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, AGENT_LIMITS.timeoutMs);
        controller.signal.throwIfAborted();
        executingGroq = true;
        const client = dependencies.client ? dependencies.client(config) : new Groq({ apiKey: config.apiKey, baseURL: "https://api.groq.com", maxRetries: 0, timeout: 15000, logLevel: "off" });
        const result = await executeDemoAgent(input.prompt, client, config.model, controller.signal);
        controller.signal.throwIfAborted();
        executingGroq = false;
        if ("kind" in result) return response({ analysis: result });
        const timestamp = now(), id = randomUUID();
        const action: AgentAction = { ...result, id, createdAt: new Date(timestamp).toISOString(), expiresAt: new Date(timestamp + AGENT_LIMITS.ttlMs).toISOString(),
          status: result.proposals.length ? "pending_review" : "no_proposal", reviewedAt: null };
        const session = visitor(request).create();
        const resultResponse = response({ action, reviewToken: signAction(action, session.id, config.apiKey) } satisfies AgentReceipt);
        resultResponse.headers.set("Set-Cookie", session.cookie);
        return resultResponse;
      } catch (error) { if (executingGroq) diagnoseGroqExecution(error, timedOut); return errorResponse(error, timedOut); }
      finally { if (timer) clearTimeout(timer); request.signal.removeEventListener("abort", abort); if (ownsExecution) active = false; }
    },
    PATCH: async (request: Request): Promise<Response> => {
      try {
        const input = parseReviewRequest(await readRequest(request, AGENT_LIMITS.reviewBodyBytes));
        const config = (dependencies.config ?? environment)();
        const action = verifyAction(input.reviewToken, input.id, visitor(request).id, config.apiKey, now());
        if (action.status !== "pending_review") throw new AgentError("REVIEW_CONFLICT", "Esta execução não admite nova revisão.", 409);
        // Acknowledgement only. The browser owns demo review status, never an order ledger.
        return response({ action: { ...action, status: input.decision === "approve" ? "approved" : "rejected", reviewedAt: new Date(now()).toISOString() } });
      } catch (error) { return errorResponse(error); }
    },
  };
}
// Shared local backpressure is supplemental; production also requires the platform firewall.
const processState = globalThis as typeof globalThis & { goFlowDemoAgentV1?: ReturnType<typeof createAgentHandlers> };
export const agentHandlers = processState.goFlowDemoAgentV1 ??= createAgentHandlers();
