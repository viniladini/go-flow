import type { AnalysisTopic } from "./contracts";

export function analyticText(prompt: string) { return prompt.normalize("NFKD").replace(/\p{M}|\p{Cf}/gu, "").toLowerCase(); }
export function isAnalysisFollowUp(prompt: string) {
  const text = analyticText(prompt);
  if (/\b(planej\w*|propostas?|rascunhos?|todos|catalogo|geral)\b/.test(text)) return false;
  return /\b(esses|estes|desses|destes|eles|mesmos|anterior)\b|^\s*e\b|^\s*por que\s*[?.!]*$/.test(text);
}
export function analysisTopic(prompt: string, previous?: AnalysisTopic): AnalysisTopic {
  const text = analyticText(prompt);
  if (/\b(por que|porque|causas?|motivos?|expli\w*)\b/.test(text)) return "causes";
  if (/\b(lead\s*time|prazo\w*|fornecedores?)\b/.test(text)) return "lead_time";
  if (/\b(cobertura|deficit)\b/.test(text)) return "coverage";
  if (/\b(oportunidades?|capital|excesso|giro|movimentacao)\b/.test(text)) return "opportunities";
  if (/\b(prior\w*|criticos?|urgentes?|primeiro)\b/.test(text)) return "priorities";
  if (/\b(riscos?|ruptura)\b/.test(text)) return "risk";
  return previous && isAnalysisFollowUp(prompt) ? previous : "risk";
}
