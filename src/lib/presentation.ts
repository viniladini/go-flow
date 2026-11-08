/** Presentation preference only. Never stores operational/session content. */
export const PRESENTATION_KEY = "go.flow.presentation.v1";
export const SCENE_TRANSITION_MS = 850;
// Frame 1 waits for explicit entry; frame 2 runs only after the CTA.
export const SPLASH_FRAME_MS = [900, 0, 1100] as const;
export const RETURNING_FRAME_MS = [250, 950] as const;
/** Circle centered on the actual brand point, large enough for every viewport corner. */
export function viewportIris(width: number, height: number, x: number, y: number) {
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  return { x, y, diameter: Math.ceil(radius * 2) + 4 };
}
export const PRESENTATION_SCENES = [
  { title: "olá.", description: "Inteligência operacional que conecta dados, decisões e ação." },
  { title: "o próximo movimento começa aqui.", description: "Conecte sua operação, descubra oportunidades e transforme análises em ação." },
  { title: "conheça o go.agent.", description: "A IA interpreta pedidos, aciona ferramentas reais e prepara propostas calculadas. Você decide, sob revisão humana. Nenhuma compra é executada." },
  { title: "como funciona.", description: "Da análise ao próximo passo, com critérios verificáveis e decisões sob seu controle." },
  { title: "como deseja começar?", description: "Operação local: arquivos privados no navegador. Demo: dados sintéticos independentes com IA integrada." },
] as const;

/** Runs before paint. A blocked storage never blocks access to the application. */
export function initializePresentation() {
  let seen = false;
  try { seen = window.localStorage.getItem("go.flow.presentation.v1") === "seen"; } catch { /* Memory-only access remains available. */ }
  document.documentElement.dataset.presentationVisit = seen ? "returning" : "first";
}
export const PRESENTATION_INIT_SCRIPT = "(" + initializePresentation.toString() + ")();";
