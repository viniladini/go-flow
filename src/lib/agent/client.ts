import { AgentError, parseAgentRequest, parseReviewRequest } from "./contracts";
import type { AgentAction, AgentExecutionResponse, AgentRequest, ReviewRequest } from "./contracts";
export interface AgentTransport {
  execute(request: AgentRequest, signal: AbortSignal): Promise<AgentExecutionResponse>;
  review(request: ReviewRequest, signal: AbortSignal): Promise<AgentAction>;
}
async function json(request: object, method: "POST" | "PATCH", signal: AbortSignal) {
  const result = await fetch("/api/agente", { method, body: JSON.stringify(request), signal, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" } });
  const data = await result.json();
  if (!result.ok) throw new AgentError(typeof data.error?.code === "string" ? data.error.code : "REQUEST_FAILED", typeof data.error?.message === "string" ? data.error.message : "A execução não foi concluída.", result.status);
  return data;
}
export const agentTransport: AgentTransport = {
  execute: async (request, signal) => { const input = parseAgentRequest(request); return json(input, "POST", signal); },
  review: async (request, signal) => { const input = parseReviewRequest(request); return (await json(input, "PATCH", signal)).action; },
};
