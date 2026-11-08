import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRESENTATION_COLORS, PRESENTATION_PALETTE, SCENE_TRANSITION_MS, IRIS_EXPANSION_MS, WELCOME_OVERLAP_MS, LOGO_FLOW_DELAY_MS, LOGO_FLOW_MS, LOGO_GO_MS, LOGO_READY_MS } from "@/lib/presentation";
import { MOTION, routeFrames, routeMotion } from "@/lib/motion";

const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const motion = readFileSync(new URL("../../src/app/signature-motion.css", import.meta.url), "utf8");
const tokens = Object.fromEntries([...globals.match(/:root\s*\{([^}]+)\}/)![1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
function resolve(token: string): string {
  const value = tokens[token];
  const alias = value?.match(/^var\(--([\w-]+)\)$/)?.[1];
  return alias ? resolve(alias) : value;
}
function luminance(token: string) {
  const value = resolve(token);
  expect(value).toMatch(/^#[\da-f]{6}$/i);
  const [r, g, b] = value.slice(1).match(/../g)!.map((v) => parseInt(v, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return r * .2126 + g * .7152 + b * .0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
describe.each(PRESENTATION_PALETTE.map((palette, index) => [index + 1, palette] as const))("contraste da cena %i (%s)", (_index, palette) => {
  const c = PRESENTATION_COLORS[palette];
  it.each([
    ["texto principal/secundario e links", c.ink, c.background, 4.5],
    ["titulo editorial", c.title, c.background, 3],
    ["destaques", c.accent, c.background, 4.5],
    ["CTA principal", c.buttonInk, c.button, 4.5],
    ["CTA em hover", c.buttonInk, c.hover, 4.5],
    ["CTA secundario e seu hover invertido", c.ink, c.background, 4.5],
    ["borda funcional e indicador de foco", c.ink, c.background, 3],
    ["limite do CTA principal", c.button, c.background, 3],
  ] as const)("%s", (_name, foreground, background, minimum) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
  });
});
it("mantem o ponto, a expansao e a primeira cena no chartreuse exato", () => {
  expect(resolve("brand-chartreuse")).toBe("#DCEB16");
  expect(PRESENTATION_COLORS.lime.background).toBe("brand-chartreuse");
  expect(globals).toMatch(/\.presentation-iris\s*\{[^}]*background:\s*var\(--brand-chartreuse\)/);
  expect(globals).toMatch(/\.splash-dot\s*\{[^}]*color:\s*var\(--brand-chartreuse\)/);
});
it("mantem contraste por canvas em vez de interpolar fundos sob o texto", () => {
  expect(motion).toContain("background: var(--scene-background); color: var(--scene-ink)");
  expect(motion).toContain("#goflow-presentation[data-palette] { transition: none; }");
  for (const animation of ["signature-type-mask", "signature-direction", "signature-composition", "signature-orb-expand"]) {
    const frames = motion.slice(motion.indexOf(`@keyframes ${animation}`)).split("\n")[0];
    expect(frames).toContain("clip-path:"); expect(frames).not.toContain("opacity:");
  }
});
it("usa variacoes semanticas e movimentos curtos, sem alterar dados", () => {
  expect(routeMotion("/", "/estoque")).toBe("lateral");
  expect(routeMotion("/estoque", "/compras")).toBe("planning");
  expect(routeMotion("/", "/oportunidades")).toBe("analysis");
  expect(routeMotion("/compras", "/agente")).toBe("agent");
  expect(routeMotion("/agente", "/acoes")).toBe("review");
  expect(new Set(["lateral", "planning", "analysis", "agent", "review", "return"].map((kind) => routeFrames(kind as Parameters<typeof routeFrames>[0])[0].transform)).size).toBe(6);
});
it("mantem shell vivo fora dos snapshots e oferece reduced motion e hover condicional", () => {
  expect(motion).toContain("html { view-transition-name: none; }");
  expect(motion).toContain("@media (prefers-reduced-motion: reduce)");
  expect(motion).toContain("@media (hover: hover) and (pointer: fine)");
  expect(motion).toContain("clip-path: none !important");
  expect(motion).not.toMatch(/#[\da-f]{6}\b/i);
});
it("preserva contraste da sidebar antes, durante e depois do indicador chegar", () => {
  for (const background of ["sidebar-background", "sidebar-hover"]) {
    expect(contrast("on-brand", background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("sidebar-text", background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("brand-chartreuse", background)).toBeGreaterThanOrEqual(3);
  }
});
it("sincroniza CSS e timers sem pausas entre as etapas e sem keyframes de cor", () => {
  for (const name of ["quick", "standard", "spatial", "editorial"] as const) {
    expect(globals).toContain(`--motion-${name}: ${MOTION[name]}ms;`);
  }
  expect(SCENE_TRANSITION_MS).toBe(MOTION.editorial);
  expect(IRIS_EXPANSION_MS).toBeGreaterThanOrEqual(750);
  expect(IRIS_EXPANSION_MS).toBeLessThanOrEqual(900);
  expect(WELCOME_OVERLAP_MS).toBeGreaterThan(0);
  expect(LOGO_FLOW_DELAY_MS).toBeLessThan(LOGO_GO_MS);
  expect(LOGO_READY_MS).toBe(LOGO_FLOW_DELAY_MS + LOGO_FLOW_MS);
  const keyframes = motion.match(/@keyframes[^{}]+\{(?:[^{}]|\{[^{}]*\})*\}/g)!;
  expect(keyframes.length).toBeGreaterThan(0);
  for (const frame of keyframes) expect(frame).not.toMatch(/(?:^|[;{\s])(?:color|background(?:-color)?)\s*:/);
});
it("aviso usa a paleta do canvas, sem animacao ou delay independente", () => {
  const notice = motion.match(/#goflow-presentation \.presentation-scene-notice\s*\{([^}]+)\}/)![1];
  expect(notice).toContain("background: var(--scene-background)");
  expect(notice).toContain("color: var(--scene-ink)");
  expect(notice).toContain("border-color: var(--scene-ink)");
  expect(notice).toContain("animation: none");
  expect(notice).toContain("transition: none");
  expect(notice).toContain("pointer-events: none");
  expect(notice).not.toMatch(/\b(?:animation|transition)-delay\s*:/);
});
