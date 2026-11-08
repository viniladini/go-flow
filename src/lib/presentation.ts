import { MOTION } from "./motion";

/** Presentation preference only. Never stores operational/session content. */
export const PRESENTATION_KEY = "go.flow.presentation.v1";
export const SCENE_TRANSITION_MS = MOTION.editorial;
export const LOGO_GO_MS = 520;
export const LOGO_FLOW_MS = 600;
export const LOGO_FLOW_DELAY_MS = 140;
export const LOGO_READY_MS = LOGO_FLOW_DELAY_MS + LOGO_FLOW_MS;
export const IRIS_EXPANSION_MS = 820;
export const WELCOME_OVERLAP_MS = 220;
export const WELCOME_ENTER_MS = 580;
// Frame 1 waits for explicit entry; frame 2 runs only after the CTA.
export const SPLASH_FRAME_MS = [LOGO_READY_MS, 0, IRIS_EXPANSION_MS] as const;
export const PRESENTATION_PALETTE = ["lime", "deep", "blue", "paper", "deep"] as const;
/** Theme-independent pairs: each scene carries its surface with its ink during reveals. */
export const PRESENTATION_COLORS = {
  lime: { background: "brand-chartreuse", ink: "brand-deep", title: "presentation-welcome-pink", accent: "brand-deep", button: "brand-deep", buttonInk: "on-brand", hover: "brand-blue" },
  deep: { background: "brand-deep", ink: "on-brand", title: "on-brand", accent: "brand-chartreuse", button: "brand-chartreuse", buttonInk: "brand-deep", hover: "on-brand" },
  blue: { background: "brand-blue", ink: "on-brand", title: "on-brand", accent: "brand-chartreuse", button: "on-brand", buttonInk: "brand-deep", hover: "brand-chartreuse" },
  paper: { background: "brand-canvas", ink: "brand-deep", title: "brand-deep", accent: "brand-blue", button: "brand-blue", buttonInk: "on-brand", hover: "brand-deep" },
} as const;
export function presentationColors(index: number) {
  const colors = PRESENTATION_COLORS[PRESENTATION_PALETTE[index]];
  return Object.fromEntries(Object.entries(colors).map(([key, token]) => [`--scene-${key}`, `var(--${token})`]));
}
/** Circle centered on the actual brand point, large enough for every viewport corner. */
export function viewportIris(width: number, height: number, x: number, y: number) {
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  return { x, y, diameter: Math.ceil(radius * 2) + 4 };
}
export const PRESENTATION_SCENES = [
  { title: "olá.", description: "Inteligência operacional que conecta dados, decisões e ação." },
  { title: "ousados. inquietos. criativos.", description: "Expressivos por natureza. Precisos por design. Uma nova forma de conectar dados, decisões e ação." },
  { title: "o próximo movimento começa aqui.", description: "Dados → inteligência → ação. Conecte sua operação, descubra oportunidades e transforme análises em decisões verificáveis." },
  { title: "conheça o go.agent.", description: "A IA interpreta pedidos, aciona ferramentas reais e prepara propostas calculadas. Você decide, sob revisão humana. Nenhuma compra é executada." },
  { title: "como deseja começar?", description: "Operação local: arquivos privados no navegador. Demo: dados sintéticos independentes com IA integrada." },
] as const;

/** Runs before paint. A blocked storage never blocks access to the application. */
export function initializePresentation() {
  let seen = false;
  try { seen = window.localStorage.getItem("go.flow.presentation.v1") === "seen"; } catch { /* Memory-only access remains available. */ }
  document.documentElement.dataset.presentationVisit = seen ? "returning" : "first";
}
export const PRESENTATION_INIT_SCRIPT = "(" + initializePresentation.toString() + ")();";
