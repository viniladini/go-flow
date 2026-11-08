// @vitest-environment happy-dom
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { Presentation, PresentationReplay } from "@/components/presentation";
import { FlowOrb } from "@/components/flow-orb";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportSessionProvider, useImportSession } from "@/components/import-session-provider";
import { PRESENTATION_INIT_SCRIPT, PRESENTATION_KEY, PRESENTATION_SCENES, viewportIris } from "@/lib/presentation";
import type { ImportSession } from "@/lib/flow-import/session";
import { validateImport } from "@/lib/flow-import/validation";
import { assignmentsFor, importFixture, syntheticParameters } from "../fixtures/flow-import";
import { operationalFixture } from "../fixtures/operational";
import { computeOperation, type OperationalResult } from "@/lib/operations/service";

const navigation = vi.hoisted(() => ({ pathname: "/", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useRouter: () => ({ push: navigation.push }) }));
let root: Root, container: HTMLDivElement, session: ImportSession, mounts: number, reduce: boolean;
// Small independent seed: presentation tests do not benchmark the 500-SKU generator.
const synthetic = computeOperation(operationalFixture());
const initialDemo: OperationalResult = { ...synthetic, source: "demo", model: { ...synthetic.model,
  origin: { ...synthetic.model.origin, kind: "independent_synthetic", id: "goflow-demo-v1" } } };
function Content() {
  const current = useImportSession();
  useEffect(() => { mounts++; session = current.session; }, [current.session]);
  return <main id="conteudo" tabIndex={-1}><h1>Aplicação {navigation.pathname}</h1><PresentationReplay /><span data-source={current.snapshot.source} /></main>;
}
function View() { return <ImportSessionProvider initialDemo={initialDemo}><Presentation><Content /></Presentation></ImportSessionProvider>; }
async function mount() { await act(async () => root.render(<View />)); }
async function tick(ms: number) { await act(async () => vi.advanceTimersByTime(ms)); }
function dialog() { return container.querySelector<HTMLDialogElement>(".presentation-dialog")!; }
function title() { return container.querySelector("#presentation-title")?.textContent; }
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
  if (dialog().getAttribute("data-mode") === "splash" && dialog().getAttribute("data-frame") === "2") await tick(1100);
  if (container.querySelector(".outgoing")) await tick(850);
}
async function lastScene() { await click("Conheça"); await click("Começar"); for (let i = 0; i < 3; i++) await click("Avançar"); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); window.localStorage.clear();
  delete document.documentElement.dataset.presentationBooted;
  delete document.documentElement.dataset.presentationVisit;
  navigation.pathname = "/"; navigation.push.mockReset(); mounts = 0; reduce = false;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Presentation must not use the network"); }));
  vi.stubGlobal("Worker", class { postMessage() {} terminate() {} });
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function(this: HTMLDialogElement) { this.setAttribute("open", ""); });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function(this: HTMLDialogElement) { this.removeAttribute("open"); });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  navigation.push.mockImplementation((path: string) => { navigation.pathname = path; root.render(<View />); });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("experiência de apresentação", () => {
  it("não emite warnings de keys ao sobrepor cenas, voltar e rever", async () => {
    const errors = vi.spyOn(console, "error"); // Call through: warnings remain visible and fail this test.
    await mount(); await lastScene(); await click("Voltar"); await click("Avançar");
    await click("Pular apresentação"); await tick(850); await click("Rever apresentação"); await lastScene();
    expect(errors.mock.calls.flat().map(String).join(" ")).not.toMatch(/same key|unique.*key/i);
  });
  it("forma go.flow e só chega ao olá. após Conheça o go.flow", async () => {
    await mount(); expect(dialog().open).toBe(true);
    expect(container.querySelector("#conteudo")).not.toBeNull();
    expect(container.querySelector(".splash-wordmark")?.getAttribute("data-frame")).toBe("0");
    await tick(900); expect(container.querySelector(".splash-wordmark")?.getAttribute("data-frame")).toBe("1");
    await tick(600_000); expect(container.querySelector(".splash-wordmark")?.getAttribute("data-frame")).toBe("1");
    expect(title()).toBeUndefined();
    await click("Conheça"); expect(title()).toBe("olá."); expect(document.activeElement?.id).toBe("presentation-title");
  });
  it("mantém o wordmark completo antes do Color Flow e aguarda Começar sem temporizador", async () => {
    await mount(); await tick(900); await tick(700); // flow finishes its 700ms entrance
    await tick(600_000); expect(container.querySelector(".splash-wordmark")?.getAttribute("data-frame")).toBe("1");
    await click("Conheça"); expect(title()).toBe("olá.");
    await tick(600_000); expect(title()).toBe("olá.");
    expect([...dialog().querySelectorAll("button")].filter((b) => b.textContent?.includes("Começar"))).toHaveLength(1);
    expect(dialog().querySelector(".presentation-scene button")).toBeNull();
    await click("Começar"); expect(title()).toBe("o próximo movimento começa aqui.");
    await tick(600_000); expect(title()).toBe("o próximo movimento começa aqui.");
  });
  it("sobrepõe as cenas sem desmontar a anterior e ignora avanço duplicado", async () => {
    await mount(); await click("Conheça");
    const previous = dialog().querySelector(".presentation-scene")!;
    const start = [...dialog().querySelectorAll("button")].find((b) => b.textContent?.includes("Começar"))!;
    await act(async () => { start.click(); start.click(); });
    expect(title()).toBe("o próximo movimento começa aqui.");
    expect(dialog().querySelector(".outgoing")).toBe(previous);
    expect(previous.getAttribute("aria-hidden")).toBe("true"); expect(previous.hasAttribute("inert")).toBe(true);
    expect(dialog().querySelectorAll("#presentation-title")).toHaveLength(1);
    await tick(849); expect(dialog().querySelector(".outgoing")).toBe(previous);
    await tick(1); expect(dialog().querySelector(".outgoing")).toBeNull();
    expect(title()).toBe("o próximo movimento começa aqui.");
  });
  it("mantém o mesmo slogan durante as cinco cenas e ao voltar", async () => {
    await mount(); const slogan = dialog().querySelector(".presentation-slogan")!;
    await click("Conheça");
    for (let scene = 0; scene < 5; scene++) {
      expect(dialog().querySelector(".presentation-slogan")).toBe(slogan);
      expect(dialog().querySelectorAll(".presentation-slogan")).toHaveLength(1);
      expect(slogan.textContent).toBe("From insight to action.");
      if (scene < 4) await click(scene === 0 ? "Começar" : "Avançar");
    }
    await click("Voltar"); expect(dialog().querySelector(".presentation-slogan")).toBe(slogan);
  });
  it("preserva geometria e identidade da cena de saída enquanto a próxima entra", async () => {
    await mount(); await click("Conheça"); await click("Começar"); await click("Avançar"); await click("Avançar");
    const scene = dialog().querySelector<HTMLElement>('.presentation-scene:not(.outgoing)')!;
    vi.spyOn(scene, "getBoundingClientRect").mockReturnValue(new DOMRect(110, 180, 1000, 420));
    vi.spyOn(scene.parentElement!, "getBoundingClientRect").mockReturnValue(new DOMRect(70, 140, 1080, 500));
    const forward = [...dialog().querySelectorAll("button")].find((b) => b.textContent?.includes("Avançar"))!;
    await act(async () => forward.click());
    const outgoing = dialog().querySelector<HTMLElement>(".outgoing")!;
    expect(outgoing).toBe(scene); expect(outgoing.dataset.scene).toBe("3");
    expect(outgoing.style.width).toBe("1000px"); expect(outgoing.style.height).toBe("420px");
    expect(outgoing.style.left).toBe("40px"); expect(outgoing.style.top).toBe("40px");
    await tick(850); expect(dialog().querySelector(".outgoing")).toBeNull();
  });
  it("foco do handoff usa preventScroll e corrige somente salto nativo do diálogo", async () => {
    await mount(); await click("Conheça");
    const main = container.querySelector<HTMLElement>("#conteudo")!;
    const focus = vi.spyOn(main, "focus");
    let y = 120;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(dialog(), "close").mockImplementation(() => { dialog().removeAttribute("open"); y = 900; });
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await click("Pular apresentação");
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scroll).toHaveBeenCalledExactlyOnceWith(0, 120);
  });
  it("posiciona a iris no ponto real e atualiza sua geometria no resize", async () => {
    await mount(); await tick(900);
    const point = dialog().querySelector(".splash-dot")!;
    const rect = vi.spyOn(point, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 420, 20, 60));
    await act(async () => { dialog().querySelector<HTMLButtonElement>(".presentation-next")!.click(); });
    expect(dialog().style.getPropertyValue("--iris-x")).toBe("210px");
    expect(dialog().style.getPropertyValue("--iris-size")).toBe(`${viewportIris(window.innerWidth, window.innerHeight, 210, 471).diameter}px`);
    rect.mockReturnValue(new DOMRect(50, 50, 20, 60));
    await act(async () => { window.dispatchEvent(new Event("resize")); });
    expect(dialog().style.getPropertyValue("--iris-x")).toBe("60px");
    expect(dialog().querySelector(".presentation-iris")).not.toBeNull();
  });
  it("usa exatamente os cinco títulos aprovados e permite voltar", async () => {
    expect(PRESENTATION_SCENES.map((s) => s.title)).toEqual(["olá.", "o próximo movimento começa aqui.", "conheça o go.agent.", "como funciona.", "como deseja começar?"]);
    await mount(); await click("Conheça");
    for (const scene of PRESENTATION_SCENES) {
      expect(title()).toBe(scene.title); if (scene.title !== "como deseja começar?") await click(scene.title === "olá." ? "Começar" : "Avançar");
    }
    await click("Voltar"); expect(title()).toBe("como funciona.");
    await click("Voltar");
    expect(container.querySelector(".presentation-agent")?.textContent).toContain("Cálculo determinístico");
    expect(container.querySelector('.presentation-orb svg[role="img"]')?.getAttribute("aria-label")).toBe("Flow Orb, mascote do go.agent");
  });
  it("abre a demo e persiste somente o marcador de apresentação", async () => {
    await mount(); await lastScene(); await click("Explorar ambiente demonstrativo");
    expect(dialog().open).toBe(false); expect(session.getSnapshot().source).toBe("demo");
    expect(window.localStorage.length).toBe(1); expect(window.localStorage.getItem(PRESENTATION_KEY)).toBe("seen");
    expect(document.activeElement?.id).toBe("conteudo");
    await tick(850); expect(container.querySelector(".presentation-handoff")).toBeNull(); expect(mounts).toBe(1);
  });
  it("navega ao Flow Import antes de encerrar o handoff sem remontar a sessão", async () => {
    await mount(); const before = session; await lastScene(); await click("Analisar operação local");
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/importar"); expect(navigation.pathname).toBe("/importar");
    expect(session).toBe(before); expect(mounts).toBe(1); expect(dialog().open).toBe(false);
  });
  it("mantém conteúdo e rolagem da apresentação na superfície do handoff", async () => {
    await mount(); await lastScene(); dialog().scrollTop = 220;
    await click("Explorar ambiente demonstrativo");
    const surface = container.querySelector<HTMLElement>(".presentation-handoff")!;
    expect(surface.scrollTop).toBe(220); expect(surface.textContent).toContain("como deseja começar?");
    expect(surface.textContent).toContain("Analisar operação local");
    expect(surface.hasAttribute("inert")).toBe(true);
    await tick(850); expect(container.querySelector(".presentation-handoff")).toBeNull();
  });
  it("não inicia handoff até o destino estar montado", async () => {
    navigation.push.mockImplementation(() => {});
    await mount(); await lastScene(); await click("Analisar operação local");
    expect(dialog().open).toBe(true); expect(container.querySelector(".presentation-handoff")).toBeNull();
    await tick(3000); expect(dialog().open).toBe(true);
    navigation.pathname = "/importar"; await mount(); expect(dialog().open).toBe(false);
  });
  it("pula imediatamente, inclusive durante splash, sem trocar de página", async () => {
    await mount(); await click("Pular apresentação");
    expect(dialog().open).toBe(false); expect(navigation.push).not.toHaveBeenCalled();
    await tick(3000); expect(dialog().open).toBe(false);
  });
  it("visitante recorrente vê abertura curta, preserva deep link e pode rever", async () => {
    navigation.pathname = "/estoque";
    window.localStorage.setItem(PRESENTATION_KEY, "seen"); await mount();
    expect(dialog().open).toBe(true);
    expect(dialog().querySelectorAll("button, header, footer, p, .cinematic-guide, .presentation-curves")).toHaveLength(0);
    expect(dialog().textContent).toBe("go.flow");
    await tick(250); expect(container.querySelector(".splash-wordmark")?.getAttribute("data-frame")).toBe("1");
    await tick(950); expect(dialog().open).toBe(false); expect(title()).toBeUndefined();
    expect(container.querySelector(".presentation-handoff")?.textContent).toBe("go.flow");
    expect(navigation.push).not.toHaveBeenCalled(); expect(navigation.pathname).toBe("/estoque");
    await tick(850);
    navigation.pathname = "/compras"; await mount(); expect(dialog().open).toBe(false); expect(mounts).toBe(1);
    await click("Rever apresentação"); expect(dialog().open).toBe(true); await tick(900); await tick(600_000); expect(title()).toBeUndefined();
    await click("Conheça"); expect(title()).toBe("olá.");
  });
  it("rever e continuar preserva a importação, parâmetros e identidade da sessão", async () => {
    window.localStorage.setItem(PRESENTATION_KEY, "seen"); await mount();
    await tick(250); await tick(950); await tick(850);
    const files = importFixture(), operation = validateImport(files, assignmentsFor(files), syntheticParameters()).operation!;
    await act(async () => { session.commit(operation, session.getSnapshot().revision); });
    const before = session.getSnapshot();
    await click("Rever apresentação"); await lastScene();
    expect(container.textContent).toContain("Continuar operação ativa");
    await click("Continuar operação ativa"); await tick(850);
    expect(session.getSnapshot()).toBe(before); expect(session.getSnapshot().operation).toBe(operation);
    expect(mounts).toBe(1); expect(window.localStorage.length).toBe(1); expect(fetch).not.toHaveBeenCalled();
  });
  it("permite rever novamente durante o handoff sem o timer anterior fechar a apresentação", async () => {
    await mount(); await click("Pular apresentação"); await click("Rever apresentação"); await tick(1000);
    expect(dialog().open).toBe(true); expect(container.querySelector(".splash-wordmark")?.getAttribute("data-frame")).toBe("1");
  });
  it("transições rápidas e replay durante a saída não duplicam cenas nem keys", async () => {
    const errors = vi.spyOn(console, "error");
    await mount(); await click("Conheça");
    const start = [...dialog().querySelectorAll("button")].find((b) => b.textContent?.includes("Começar"))!;
    await act(async () => { start.click(); start.click(); dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(title()).toBe("o próximo movimento começa aqui.");
    await click("Pular apresentação"); await click("Rever apresentação"); await click("Conheça");
    expect(title()).toBe("olá."); expect(dialog().querySelectorAll(".presentation-scene")).toHaveLength(1);
    expect(errors.mock.calls.flat().map(String).join(" ")).not.toMatch(/same key|unique.*key/i);
  });
  it("teclado navega, limita as cenas e Escape encerra sem modificar a fonte", async () => {
    await mount();
    const key = async (value: string) => { await act(async () => { dialog().dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })); }); if (container.querySelector(".outgoing")) await tick(850); };
    await key("ArrowRight"); expect(title()).toBeUndefined();
    await click("Conheça"); await key("ArrowLeft"); expect(title()).toBe("olá.");
    for (let i = 0; i < 8; i++) await key("ArrowRight"); expect(title()).toBe("como deseja começar?");
    await key("ArrowLeft"); expect(title()).toBe("como funciona.");
    await act(async () => { dialog().dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(dialog().open).toBe(false); expect(session.getSnapshot().source).toBe("demo");
  });
  it("reduced-motion mantém avanço manual sem expansão ou handoff animado", async () => {
    reduce = true; await mount(); await tick(0); expect(title()).toBeUndefined();
    await click("Conheça"); expect(title()).toBe("olá.");
    await click("Pular apresentação"); expect(dialog().open).toBe(false); expect(container.querySelector(".presentation-handoff")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("visita recorrente com reduced-motion entra sem splash temporizado", async () => {
    reduce = true; window.localStorage.setItem(PRESENTATION_KEY, "seen"); navigation.pathname = "/acoes";
    await mount(); await tick(0);
    expect(dialog().open).toBe(false); expect(title()).toBeUndefined();
    expect(navigation.push).not.toHaveBeenCalled(); expect(navigation.pathname).toBe("/acoes");
  });
  it("storage bloqueado não impede conhecer ou entrar na aplicação", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
    await mount(); await click("Pular apresentação"); expect(dialog().open).toBe(false);
  });
  it("bloqueia cliques duplicados de escolha e não dispara chamadas de IA", async () => {
    await mount(); await lastScene();
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Analisar operação local"))!;
    await act(async () => { button.click(); button.click(); });
    expect(navigation.push).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  });
  it("permite sair mesmo se a navegação de destino não concluir", async () => {
    navigation.push.mockImplementation(() => {});
    await mount(); await lastScene(); await click("Analisar operação local");
    await click("Voltar à aplicação"); expect(dialog().open).toBe(false);
    expect(session.getSnapshot().source).toBe("demo");
  });
  it("devolve foco ao controle de origem após rever e pular", async () => {
    window.localStorage.setItem(PRESENTATION_KEY, "seen"); await mount();
    await tick(250); await tick(950); await tick(850);
    const replay = container.querySelector<HTMLButtonElement>(".presentation-replay")!; replay.focus();
    await click("Rever apresentação"); await click("Conheça");
    expect(document.activeElement?.id).toBe("presentation-title");
    await click("Pular apresentação"); expect(document.activeElement).toBe(replay);
  });
});

it.each([[360, 800, 120, 400], [1440, 900, 600, 500], [2560, 1440, 0, 0], [844, 390, 700, 100]])("iris cobre os quatro cantos de %sx%s", (width, height, x, y) => {
  const { diameter } = viewportIris(width, height, x, y);
  for (const [cx, cy] of [[0, 0], [0, height], [width, 0], [width, height]]) {
    expect(diameter / 2).toBeGreaterThan(Math.hypot(cx - x, cy - y));
  }
});

it.each(["compact", "expanded"] as const)("Flow Orb %s é SVG acessível original, sem ativos externos", (variant) => {
  const html = renderToStaticMarkup(<FlowOrb variant={variant} />);
  expect(html).toContain('role="img"'); expect(html).toContain('aria-label="Flow Orb, mascote do go.agent"');
  expect(html).toContain(`data-variant="${variant}"`);
  expect(html).toContain("orb-eye"); expect(html).toContain("orb-ribbon"); expect(html).toContain("orb-pink");
  expect(html).not.toMatch(/<image|https?:|<script/);
});

it.each([null, "seen", "invalid", "blocked"])("bootstrap seguro para preferência %s sem gravar dados", (value) => {
  const dataset = {}, storage = { getItem: vi.fn(() => { if (value === "blocked") throw new Error("blocked"); return value; }), setItem: vi.fn() };
  runInNewContext(PRESENTATION_INIT_SCRIPT, { window: { localStorage: storage }, document: { documentElement: { dataset } } });
  expect(dataset).toEqual({ presentationVisit: value === "seen" ? "returning" : "first" });
  expect(storage.getItem).toHaveBeenCalledWith(PRESENTATION_KEY); expect(storage.setItem).not.toHaveBeenCalled();
});

it("reduced-motion mantém as cinco cenas e ambas as escolhas disponíveis", async () => {
  reduce = true; await mount(); await tick(0);
  await click("Conheça");
  await click("Começar"); for (let i = 0; i < 3; i++) await click("Avançar");
  expect(title()).toBe("como deseja começar?");
  expect([...container.querySelectorAll(".presentation-choice")].map((b) => b.textContent)).toEqual([
    expect.stringContaining("Explorar ambiente demonstrativo"), expect.stringContaining("Analisar operação local"),
  ]);
  await click("Voltar"); expect(title()).toBe("como funciona.");
});
