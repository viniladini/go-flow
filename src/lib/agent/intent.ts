import { AgentError } from "./contracts";
import { isAnalysisFollowUp } from "./analysis-topics";

/** Conservative application permission gate, not an LLM authorization decision. */
export function resolveAgentIntent(prompt: string, hasAnalysisContext = false): "analysis" | "planning" {
  const text = prompt.normalize("NFKD").replace(/\p{M}|\p{Cf}/gu, "").toLowerCase().replace(/\s+/g, " ");
  // Mixed requests are rejected as a whole. Negated/quoted execution requests may
  // require rephrasing; they never silently authorize the creation of drafts.
  if (/\b(execut\w*|comprar|compre\w*|efetiv\w*|emit\w*|envi\w*|contat\w*|contact\w*|aprove\w*|aprovar|dispens\w*|automatic\w*|bypass|purchase|place\s+orders?|send|contact|approve)\b/.test(text) ||
    /\b(realiz\w*|finaliz\w*)\b.{0,35}\b(compras?|pedidos?|aquisic\w*|transac\w*)\b/.test(text) ||
    /\b(faca|fazer|gere|gerar|crie|criar)\b.{0,25}\bpedidos?\b/.test(text) ||
    /\b(mande|mandar|buy|execute|order)\b/.test(text) ||
    /\b(sem|ignorar?|ignore|dispensar?)\b.{0,35}\b(revisao|aprovacao|validacao|regras|instrucoes)\b/.test(text) ||
    /\b(ignore|desconsidere|sobrescreva|system|developer|override)\b/.test(text)) {
    throw new AgentError("EXECUTION_NOT_AUTHORIZED", "Não posso executar compras, emitir pedidos, contatar fornecedores ou dispensar aprovação. Posso analisar a demo ou preparar uma proposta de compra para revisão humana.", 403);
  }
  if (/\b(importad\w*|privad\w*|confidencia\w*|meus dados|minha empresa)\b/.test(text)) {
    throw new AgentError("DEMO_ONLY", "Use somente a demonstração sintética. Dados importados e privados devem permanecer nas análises locais.", 403);
  }
  const request = text.replace(/^\s*(?:por favor|ola)[,.:!\s]+/, "").trim();
  const planning = (/^(?:(?:quero|preciso|gostaria de|voce pode|pode|poderia)\s+)?(planeje|planejar|elabore|elaborar|prepare|preparar|gere|gerar|crie|criar|monte|montar|faca|fazer|proponha|simule|simular)\b.{0,70}\b(compras?|reposicao)\b/.test(request) ||
    /^(quero|preciso|solicito)\s+(?:de\s+)?(?:um[ao]?\s+)?(propostas?|planos?|planejamento|rascunhos?)\s+de\s+compras?\b/.test(request)) &&
    /\b(planeje|planejar|planejamento|planos?|propostas?|proponha|rascunhos?|simulacao|simule|simular)\b/.test(text);
  const analysis = /\b(analis\w*|diagnostic\w*|expli\w*|risco|ruptura|cobertura|estoque|capital|entend\w*|prior\w*|critic\w*|causas?|motivos?|por que|lead\s*time|prazos?|oportunidades?|excesso|giro)\b/.test(text) || hasAnalysisContext && isAnalysisFollowUp(prompt);
  if (planning && !/\b(analis\w*|diagnostic\w*|expli\w*)\b/.test(text) && !/\b(nao|somente|apenas)\b.{0,30}\b(planej\w*|cri\w*|ger\w*|proposta|rascunho)\b/.test(text)) return "planning";
  // A terminal, explicitly negative constraint is compatible with read-only
  // analysis. It never changes the planning permission decision above.
  const analysisText = text.replace(/(?:^|[.!?;])\s*nao\s+(?:gere|gerar|crie|criar)\s+(?:propostas?|rascunhos?)(?:\s+de\s+compras?)?\s*[.!?]?\s*$/, "");
  if (analysis && !planning && !/\b(propostas?|rascunhos?)\b/.test(analysisText)) return "analysis";
  throw new AgentError("INTENT_AMBIGUOUS", "Esclareça o objetivo: analisar o estoque ou risco da demo, ou criar uma proposta de compra para revisão humana. Nenhuma proposta foi criada.", 422);
}
