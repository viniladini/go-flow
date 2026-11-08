import "server-only";
import Groq from "groq-sdk";
import type { ChatCompletionCreateParamsNonStreaming } from "groq-sdk/resources/chat/completions";
import { createOperationalDemo } from "../operations/demo";
import { createOperationalBuyingPlan } from "../smart-buying/index";
import { formatMoney, formatNumber } from "../dashboard/format";
import { AGENT_TOOL, AGENT_LIMITS, AgentError, parseToolArguments } from "./contracts";
import type { AgentAction } from "./contracts";

function isToolUseFailed(error: unknown): boolean {
  if (!(error instanceof Groq.APIError) || error.status !== 400 || !error.error || typeof error.error !== "object") return false;
  const body = error.error as Record<string, unknown>;
  const detail = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : body;
  return detail.code === "tool_use_failed";
}

export async function executeDemoAgent(prompt: string, client: Groq, model: string, signal: AbortSignal): Promise<Omit<AgentAction, "id" | "status" | "createdAt" | "expiresAt" | "reviewedAt">> {
  let retryAvailable = true;
  const complete = async (body: ChatCompletionCreateParamsNonStreaming): Promise<Groq.Chat.Completions.ChatCompletion> => {
    signal.throwIfAborted();
    try {
      // Leave room for a colder retry; never enable the SDK's automatic retries.
      return await client.chat.completions.create({ ...body, temperature: retryAvailable ? 0.2 : 0 }, { signal, maxRetries: 0 });
    } catch (error) {
      if (!retryAvailable || !isToolUseFailed(error)) throw error;
      signal.throwIfAborted();
      retryAvailable = false;
      // Only ask for a fresh response. Never parse/replay failed_generation.
      return await client.chat.completions.create({ ...body, temperature: 0 }, { signal, maxRetries: 0 });
    }
  };
  const { dataset, parameters } = createOperationalDemo();
  const tool: Groq.Chat.Completions.ChatCompletionTool = { type: "function", function: { name: AGENT_TOOL,
    description: "Calcula rascunhos de compras exclusivamente para a demonstração independente do go.flow. Não executa pedidos. Quantidades e custos são calculados pelo Smart Buying, nunca pelo modelo.",
    parameters: { type: "object", additionalProperties: false, required: ["budgetCents", "skuCodes"], properties: {
      budgetCents: { type: "integer", minimum: 0, maximum: parameters.budgetCents, description: "Orçamento de aquisição em centavos, respeitando o limite pedido pelo usuário e o teto da demo." },
      skuCodes: { type: "array", maxItems: AGENT_LIMITS.selectedSkus, uniqueItems: true, items: { type: "string" }, description: "Códigos demonstrativos solicitados; lista vazia significa todo o catálogo. Não invente códigos." },
    } } } };
  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: "Você é go.agent, planejador de compras da demonstração sintética do go.flow. Interprete a solicitação usando somente a ferramenta autorizada. Não calcule nem invente quantidades, custos, fornecedores, recomendações ou resultados. Não altere o escopo para dados importados. Se não houver orçamento explícito, use o orçamento da demonstração. Valores monetários da ferramenta são centavos. A saída operacional será exclusivamente validada pela aplicação. Contexto público sintético: " + JSON.stringify({ budgetCents: parameters.budgetCents, referenceDate: parameters.referenceDate, horizonStart: parameters.horizonStart, horizonEnd: parameters.horizonEnd, skuCount: dataset.skus.length, skuExamples: dataset.skus.slice(0, 20).map((s) => s.sku), skuPattern: "DEMO-FLOW-0001 até DEMO-FLOW-0500" }) },
    { role: "user", content: prompt },
  ];
  const reasoning = model.startsWith("openai/gpt-oss-") ? { reasoning_effort: "low" as const } : {};
  const first = await complete({ model, messages, tools: [tool], tool_choice: { type: "function", function: { name: AGENT_TOOL } },
    parallel_tool_calls: false, store: false, max_completion_tokens: 2048, ...reasoning });
  const choice = first?.choices?.[0], calls = choice?.message?.tool_calls;
  if (choice?.finish_reason !== "tool_calls" || !Array.isArray(calls) || calls.length !== 1 || calls[0]?.type !== "function" || calls[0]?.function?.name !== AGENT_TOOL || typeof calls[0].id !== "string" || !calls[0].id || calls[0].id.length > 200) throw new AgentError("INVALID_TOOL_CALL", "O modelo não devolveu uma única chamada operacional válida. Nenhuma ação foi criada.", 422);
  const call = calls[0], args = parseToolArguments(call.function.arguments, parameters.budgetCents, new Set(dataset.skus.map((s) => s.sku)));
  signal.throwIfAborted();
  const selected = new Set(args.skuCodes), all = selected.size === 0;
  const scoped = all ? dataset : { ...dataset, skus: dataset.skus.filter((s) => selected.has(s.sku)), sales: dataset.sales.filter((s) => selected.has(s.sku)), stocks: dataset.stocks.filter((s) => selected.has(s.sku)), purchases: dataset.purchases.filter((s) => selected.has(s.sku)) };
  const plan = createOperationalBuyingPlan({ dataset: scoped, origin: "independent_synthetic", policy: { ...parameters, budgetCents: args.budgetCents } });
  const executedAt = new Date().toISOString();
  signal.throwIfAborted();
  const toolSummary = { source: "independent_synthetic", proposalCount: plan.proposals.length, budget: plan.budget,
    exampleProposals: plan.proposals.slice(0, 5).map((p) => ({ sku: p.sku, purchaseUnit: p.purchaseUnit, quantity: p.quantityPurchaseUnits, physicalUnits: p.physicalUnits, costCents: p.estimatedCostCents })),
    caveats: ["Rascunhos sujeitos a revisão humana", "Nenhum pedido enviado", "Projeções condicionais", "Pendências não creditadas", "Sem buffer calibrado ou campanhas inferidas"], };
  const second = await complete({ model, messages: [...messages,
    { role: "assistant", content: null, tool_calls: [{ id: call.id, type: "function", function: { name: AGENT_TOOL, arguments: JSON.stringify(args) } }] },
    { role: "tool", tool_call_id: call.id, content: JSON.stringify(toolSummary) },
    { role: "system", content: "Confirme brevemente a conclusão da ferramenta, sem propor outras operações. A aplicação exibirá os números exclusivamente do resultado determinístico, não do seu texto." }],
    tools: [tool], tool_choice: "none", parallel_tool_calls: false, store: false, max_completion_tokens: 1024, ...reasoning });
  const confirmation = second?.choices?.[0];
  if (confirmation?.finish_reason !== "stop" || confirmation?.message?.tool_calls?.length || typeof confirmation?.message?.content !== "string" || !confirmation.message.content.trim()) throw new AgentError("INCOMPLETE_EXECUTION", "A confirmação da ferramenta não foi concluída. Nenhuma ação foi registrada.", 502);
  signal.throwIfAborted();
  // LLM prose is deliberately not displayed: every numeric statement comes from the engine.
  return { source: "demo", model, tool: { name: AGENT_TOOL, arguments: args, executedAt },
    referenceDate: parameters.referenceDate, horizonStart: parameters.horizonStart, horizonEnd: parameters.horizonEnd,
    budget: plan.budget, proposals: plan.proposals, alerts: plan.alerts.map((a) => (a.sku ? a.sku + " · " : "") + a.message), alertDetails: plan.alerts, alertCount: plan.alerts.length,
    limitations: plan.limitations, explanation: `${formatNumber(plan.proposals.length)} rascunhos calculados por ${AGENT_TOOL}. Orçamento ${formatMoney(plan.budget.totalCents)}; aquisição ${formatMoney(plan.budget.usedCents)}; saldo ${formatMoney(plan.budget.remainingCents)}. Benefícios e chegadas são estimativas condicionais. Pendências não são recebimentos. Nenhuma compra foi executada.` };
}
