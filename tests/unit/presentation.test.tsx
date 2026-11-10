// @vitest-environment happy-dom
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Presentation, PresentationReplay } from "@/components/presentation";
import { FlowOrb } from "@/components/flow-orb";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportSessionProvider, useImportSession } from "@/components/import-session-provider";
import { PRESENTATION_INIT_SCRIPT, PRESENTATION_KEY, PRESENTATION_SCENES, PRESENTATION_PALETTE, IRIS_EXPANSION_MS, SCENE_TRANSITION_MS, viewportIris } from "@/lib/presentation";
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
  if (dialog().getAttribute("data-mode") === "splash" && dialog().getAttribute("data-frame") === "2") await tick(IRIS_EXPANSION_MS);
  if (container.querySelector(".outgoing")) await tick(SCENE_TRANSITION_MS);
  if (dialog().getAttribute("data-mode") === "handoff") await tick(container.querySelector(".workspace-iris")?.hasAttribute("data-fast") ? 120 : 720);
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
  it("textos estaticos de toda a apresentacao nao selecionam nem exibem caret/I-beam", async () => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = readFileSync(resolve("src/app/signature-motion.css"), "utf8");
    document.head.append(stylesheet);
    const outside = document.createElement("p"); document.body.append(outside);
    try {
      await mount();
      const input = document.createElement("input"); input.style.caretColor = "rgb(20, 30, 40)";
      const textarea = document.createElement("textarea");
      const editor = document.createElement("div"); editor.setAttribute("contenteditable", "true"); editor.innerHTML = "<span>Editor</span>";
      dialog().append(input, textarea, editor);
      const check = () => {
        for (const text of dialog().querySelectorAll("h1, .presentation-description, .presentation-welcome, .splash-description, .splash-wordmark, .scene-caption, .presentation-slogan, .scene-dots li")) {
          const style = getComputedStyle(text);
          expect(style.caretColor).toBe("transparent"); expect(style.userSelect).toBe("none"); expect(style.cursor).toBe("default");
        }
        expect(getComputedStyle(dialog().querySelector(".presentation-skip")!).cursor).toBe("pointer");
        expect(getComputedStyle(input).caretColor).toBe("rgb(20, 30, 40)");
        for (const field of [input, textarea, editor, editor.firstElementChild!]) {
          expect(getComputedStyle(field).userSelect).toBe("text"); expect(getComputedStyle(field).cursor).toBe("text");
        }
        expect(getComputedStyle(textarea).caretColor).toBe("auto");
        expect(getComputedStyle(outside).userSelect).not.toBe("none");
      };
      check(); await click("Conheça");
      for (const index of [0, 1, 2, 3, 4, 3, 2, 1, 0]) {
        const current = Number(dialog().dataset.scene);
        if (current !== index) await click(index > current ? current === 0 ? "Começar" : "Avançar" : "Voltar");
        const heading = dialog().querySelector<HTMLElement>("#presentation-title")!;
        expect(document.activeElement).toBe(heading); expect(heading.tabIndex).toBe(-1); check();
      }
    } finally { stylesheet.remove(); outside.remove(); }
  });
  it("skip tem um unico texto natural fora das mascaras, padding e slots vazios consistentes", async () => {
    const stylesheet = document.createElement("style");
    const globals = readFileSync(resolve("src/app/globals.css"), "utf8");
    // Exercise the real legacy cascade too. Attribute substitutes for :hover
    // test CSS specificity without claiming pointer/compositor browser coverage.
    stylesheet.textContent = (globals.slice(globals.indexOf(":root")) + readFileSync(resolve("src/app/signature-motion.css"), "utf8")).replaceAll(":hover", "[data-test-hover]");
    document.head.append(stylesheet);
    try {
      await mount();
      const skip = dialog().querySelector<HTMLButtonElement>("button.presentation-skip")!;
      Object.assign(skip.style, { fontFamily: '"Fixture Inter"', fontSize: "11px", fontWeight: "400", lineHeight: "16.5px" });
      const box = vi.spyOn(skip, "getBoundingClientRect").mockReturnValue(new DOMRect(800, 20, 160, 44));
      const check = () => {
        expect(dialog().querySelectorAll(".presentation-skip")).toHaveLength(1);
        expect(dialog().querySelector("button.presentation-skip")).toBe(skip);
        expect(skip.closest(".cinematic-stage")).toBeNull();
        expect(getComputedStyle(skip.parentElement!.parentElement!).opacity).not.toBe("0");
        const style = getComputedStyle(skip);
        expect(style.transform).toBe("none"); expect(style.animation).toBe("none");
        expect(style.paddingLeft).toBe("20px"); expect(style.paddingRight).toBe("20px");
        expect(style.paddingTop).toBe("11px"); expect(style.paddingBottom).toBe("11px");
        expect(style.borderTopWidth).toBe("1px"); expect(style.borderTopStyle).toBe("solid");
        expect(style.borderTopColor).not.toBe("transparent"); expect(style.backgroundColor).toBe("transparent");
        expect(style.borderRadius).toBe("10px"); expect(style.minHeight).toBe("44px");
        skip.setAttribute("data-test-hover", "");
        expect(getComputedStyle(skip).backgroundColor).toBe("transparent");
        skip.removeAttribute("data-test-hover");
        expect(skip.tabIndex).toBe(0); expect(skip.closest("[inert]")).toBeNull();
        expect(style.fontSize).toBe(skip.style.fontSize); expect(style.fontWeight).toBe("400");
        for (const canvas of dialog().querySelectorAll(".presentation-scene")) {
          expect(canvas.textContent).not.toContain("Pular apresentação");
          const slot = canvas.querySelector<HTMLElement>(".scene-chrome-skip-space")!;
          expect(slot.textContent).toBe(""); expect(slot.tabIndex).toBe(-1);
          expect(slot.closest("[aria-hidden=true][inert]")).not.toBeNull();
          expect(getComputedStyle(slot).width).toBe(dialog().style.getPropertyValue("--chrome-skip-width"));
        }
      };
      check(); await click("Conheça"); check();
      for (let index = 1; index < 5; index++) {
        await act(async () => dialog().querySelector<HTMLButtonElement>(".scene-next")!.click()); check();
        await tick(SCENE_TRANSITION_MS); check();
      }
      skip.style.fontSize = "10px";
      box.mockReturnValue(new DOMRect(170, 16, 140, 44));
      await act(async () => window.dispatchEvent(new Event("resize"))); check();
      expect(dialog().style.getPropertyValue("--chrome-skip-width")).toBe("140px");
      await act(async () => skip.click()); await tick(120);
      expect(dialog().open).toBe(false);
    } finally { stylesheet.remove(); }
  });
  it.each([1200, 375])("skip reutiliza a mascara computada em cinco etapas, viewport %i", async (width) => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = readFileSync(resolve("src/app/globals.css"), "utf8").match(/:root\s*\{[^}]+\}/)![0] + readFileSync(resolve("src/app/signature-motion.css"), "utf8");
    document.head.append(stylesheet);
    let clip = "inset(0 0 100% 0)";
    const nativeStyle = globalThis.getComputedStyle;
    vi.spyOn(globalThis, "getComputedStyle").mockImplementation((element) => {
      const style = nativeStyle(element);
      return element.matches(".presentation-scene:not(.outgoing)") ? new Proxy(style, {
        get(target, key) {
          if (key === "clipPath") return clip;
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) : style;
    });
    const buttonX = width - 220;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".presentation-scene")) return new DOMRect(0, 0, width, 800);
      if (this.matches(".presentation-skip")) return new DOMRect(buttonX, 20, 200, 44);
      if (this.matches(".presentation-skip-label")) return new DOMRect(buttonX + 21, 33, 158, 18);
      return new DOMRect();
    });
    try {
      await mount(); await click("Conheça");
      const skip = dialog().querySelector<HTMLButtonElement>(".presentation-skip")!;
      const label = skip.querySelector<HTMLElement>(".presentation-skip-label")!;
      const paint = () => {
        const url = skip.style.getPropertyValue("--skip-reveal-paint");
        return new DOMParser().parseFromString(decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2)), "image/svg+xml");
      };
      const inks = ["#101629", "#FFFFFF", "#FFFFFF", "#101629", "#FFFFFF"];
      let previous = 0;
      for (const next of [1, 2, 3, 4, 3, 2, 1, 0]) {
        clip = "inset(0 0 100% 0)";
        await act(async () => dialog().querySelector<HTMLButtonElement>(next > previous ? ".scene-next" : 'button[aria-label="Voltar"]')!.click());
        // These are snapshots of the browser-interpolated clip, NOT elapsed-time
        // estimates. Ellipse/circle/rounded inset use the same path unmodified.
        const masks = next === previous + 1 && next === 2
          ? ["inset(0 100% 0 0 round 0 12vw 12vw 0)", "inset(0 75% 0 0 round 0 9vw 9vw 0)", "inset(0 50% 0 0 round 0 6vw 6vw 0)", "inset(0 25% 0 0 round 0 3vw 3vw 0)", "inset(0 round 0)"]
          : next === 3 && previous === 2
            ? [0, 25, 50, 75, 100].map(p => `ellipse(${p * 1.6}% ${p * 1.6}% at 82% 46%)`)
            : next === 4 && previous === 3
              ? [0, 25, 50, 75, 100].map(p => `circle(${p * 16}px at 900px 360px)`)
              : [0, 25, 50, 75, 100].map(p => next > previous ? `inset(0 0 ${100 - p}% 0)` : `inset(0 0 0 ${100 - p}%)`);
        for (const mask of masks) {
          clip = mask; await tick(16);
          const image = paint(), rects = image.querySelectorAll("rect");
          expect(image.querySelector("parsererror")).toBeNull();
          expect(rects).toHaveLength(2); expect(image.querySelectorAll("text")).toHaveLength(0);
          expect(rects[0].getAttribute("fill")!.toUpperCase()).toBe(inks[previous]);
          expect(rects[1].getAttribute("fill")!.toUpperCase()).toBe(inks[next]);
          expect(rects[1].getAttribute("style")).toBe(`clip-path:${mask}`);
          expect(image.documentElement.getAttribute("width")).toBe("204");
          expect(image.querySelector("svg svg")!.getAttribute("x")).toBe(String(-buttonX + 2));
          expect(skip.style.getPropertyValue("--skip-label-position")).toBe("-23px -15px");
          expect(getComputedStyle(skip).backgroundColor).toBe("transparent");
          expect(getComputedStyle(label).color).toBe("transparent");
          expect(getComputedStyle(label).backgroundClip).toBe("text");
          expect(label.textContent).toBe("Pular apresentação");
          expect(dialog().querySelectorAll(".presentation-skip-label")).toHaveLength(1);
          expect(getComputedStyle(label).transform).toBe("none");
        }
        const frozen = skip.style.getPropertyValue("--skip-reveal-paint");
        await tick(100); expect(skip.style.getPropertyValue("--skip-reveal-paint")).toBe(frozen);
        // The visual mask finishes before the logical previous-scene cleanup.
        clip = "none"; await tick(16);
        expect(dialog().querySelector(".outgoing")).not.toBeNull();
        expect(skip.hasAttribute("data-revealing")).toBe(false);
        await tick(SCENE_TRANSITION_MS);
        expect(skip.hasAttribute("data-revealing")).toBe(false);
        expect(skip.style.getPropertyValue("--skip-reveal-paint")).toBe("");
        expect(getComputedStyle(skip).color.toUpperCase()).toBe(inks[next]);
        expect(getComputedStyle(skip).borderTopWidth).toBe("1px");
        expect(getComputedStyle(skip).backgroundColor).toBe("transparent");
        previous = next;
      }
    } finally { stylesheet.remove(); }
  });
  it("contorno acompanha a geometria real do circulo na chegada ao primeiro slide", async () => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = readFileSync(resolve("src/app/globals.css"), "utf8").match(/:root\s*\{[^}]+\}/)![0] + readFileSync(resolve("src/app/signature-motion.css"), "utf8");
    document.head.append(stylesheet);
    let radius = 10;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".presentation-scene")) return new DOMRect(0, 0, 1200, 800);
      if (this.matches(".presentation-iris")) return new DOMRect(600 - radius, 400 - radius, radius * 2, radius * 2);
      if (this.matches(".presentation-skip")) return new DOMRect(900, 20, 200, 44);
      if (this.matches(".presentation-skip-label")) return new DOMRect(921, 33, 158, 18);
      return new DOMRect();
    });
    try {
      await mount();
      const skip = dialog().querySelector<HTMLButtonElement>(".presentation-skip")!;
      expect(getComputedStyle(skip).borderTopWidth).toBe("1px");
      const enter = [...dialog().querySelectorAll("button")].find(b => b.textContent?.includes("Conheça"))!;
      await act(async () => enter.click());
      for (radius of [10, 250, 500, 800]) {
        await tick(16);
        const url = skip.style.getPropertyValue("--skip-reveal-paint");
        const svg = decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));
        expect(svg).toContain(`clip-path:circle(${radius}px at 600px 400px)`);
        expect(getComputedStyle(skip).backgroundColor).toBe("transparent");
      }
      await tick(IRIS_EXPANSION_MS);
      expect(skip.hasAttribute("data-revealing")).toBe(false);
      expect(getComputedStyle(skip).color.toUpperCase()).toBe("#101629");
      expect(getComputedStyle(skip).borderTopWidth).toBe("1px");
    } finally { stylesheet.remove(); }
  });
  it("interrupcao substitui a pintura anterior; pular cancela os frames sem esperar a mascara", async () => {
    await mount(); await click("Conheça");
    const nativeStyle = globalThis.getComputedStyle;
    vi.spyOn(globalThis, "getComputedStyle").mockImplementation((element) => {
      const style = nativeStyle(element);
      return element.matches(".presentation-scene:not(.outgoing)") ? new Proxy(style, {
        get(target, key) {
          if (key === "clipPath") return dialog().dataset.mode === "scenes" ? "inset(0 0 50% 0)" : "none";
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) : style;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 44));
    const skip = dialog().querySelector<HTMLButtonElement>(".presentation-skip")!;
    const frame = vi.spyOn(window, "requestAnimationFrame");
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    await act(async () => dialog().querySelector<HTMLButtonElement>(".scene-next")!.click());
    const first = frame.mock.results.at(-1)!.value;
    await act(async () => dialog().querySelector<HTMLButtonElement>(".scene-next")!.click());
    expect(cancel).toHaveBeenCalledWith(first);
    expect(skip.hasAttribute("data-revealing")).toBe(true);
    await act(async () => skip.click());
    expect(dialog().dataset.mode).toBe("handoff"); expect(skip.hasAttribute("data-revealing")).toBe(false);
    const count = frame.mock.calls.length; await tick(120);
    expect(dialog().open).toBe(false); expect(frame).toHaveBeenCalledTimes(count);
  });
  it("reduced motion usa apenas contorno e texto nativos sem pintura intermediaria", async () => {
    reduce = true; await mount(); await click("Conheça");
    const frame = vi.spyOn(window, "requestAnimationFrame");
    for (let index = 1; index < 5; index++) {
      await act(async () => dialog().querySelector<HTMLButtonElement>(".scene-next")!.click());
      const skip = dialog().querySelector<HTMLButtonElement>(".presentation-skip")!;
      expect(skip.hasAttribute("data-revealing")).toBe(false);
      expect(skip.style.getPropertyValue("--skip-reveal-paint")).toBe("");
      expect(dialog().querySelector(".outgoing")).toBeNull();
    }
    expect(frame).not.toHaveBeenCalled();
  });
  it("aviso pertence a cada canvas e conserva suas cores em todas as transicoes", async () => {
    const stylesheet = document.createElement("style");
    const globals = readFileSync(resolve("src/app/globals.css"), "utf8");
    stylesheet.textContent = globals.match(/:root\s*\{[^}]+\}/)![0] + readFileSync(resolve("src/app/signature-motion.css"), "utf8");
    document.head.append(stylesheet);
    try {
      await mount();
      const label = dialog().querySelector("[data-notice-anchor]")!.textContent;
      expect(label).toBe("Protótipo independente · Gogroup");
      await click("Conheça");
      const controls = dialog().querySelector('.presentation-footer nav');
      const pairs = [["#DCEB16", "#101629"], ["#101629", "#FFFFFF"], ["#1761B1", "#FFFFFF"], ["#F7F7F3", "#101629"], ["#101629", "#FFFFFF"]];
      const check = (notice: HTMLElement, index: number) => {
        expect(notice.textContent).toBe(label);
        expect(notice.parentElement?.dataset.scene).toBe(String(index));
        expect(notice.closest(".scene-content")).toBeNull(); // No independent exit fade.
        const style = getComputedStyle(notice);
        expect(style.backgroundColor.toUpperCase()).toBe(pairs[index][0]);
        expect(style.color.toUpperCase()).toBe(pairs[index][1]);
        expect(style.borderColor.toUpperCase()).toBe(pairs[index][1]);
        expect(style.animation).toBe("none"); expect(style.transition).toBe("none");
      };
      let index = 0;
      check(dialog().querySelector<HTMLElement>(".presentation-scene-notice")!, index);
      for (const next of [1, 2, 3, 4, 3, 2, 1, 0]) {
        const previous = dialog().querySelector<HTMLElement>(".presentation-scene:not(.outgoing) .presentation-scene-notice")!;
        const button = dialog().querySelector<HTMLButtonElement>(next > index ? ".scene-next" : 'button[aria-label="Voltar"]')!;
        await act(async () => button.click());
        expect(dialog().querySelector(".outgoing .presentation-scene-notice")).toBe(previous);
        check(previous, index);
        const current = dialog().querySelector<HTMLElement>(".presentation-scene:not(.outgoing) .presentation-scene-notice")!;
        check(current, next);
        expect(previous.getAttribute("aria-hidden")).toBe("true");
        expect(current.hasAttribute("aria-hidden")).toBe(false);
        expect(getComputedStyle(dialog().querySelector(".presentation-footer")!).backgroundColor).toBe("transparent");
        expect(getComputedStyle(dialog().querySelector("[data-notice-anchor]")!).visibility).toBe("hidden");
        expect(dialog().querySelector('.presentation-footer nav')).toBe(controls);
        await tick(SCENE_TRANSITION_MS - 1); check(previous, index); check(current, next);
        await tick(1);
        expect(dialog().querySelectorAll(".presentation-scene-notice")).toHaveLength(1);
        index = next;
      }
    } finally { stylesheet.remove(); }
  });
  it("interromper e reverter cenas mantem no maximo dois avisos sem travar os controles", async () => {
    await mount(); await click("Conheça");
    for (const next of [1, 2, 3]) {
      const button = dialog().querySelector<HTMLButtonElement>(".scene-next")!;
      expect(button.disabled).toBe(false);
      await act(async () => button.click());
      expect(dialog().dataset.scene).toBe(String(next));
      expect(dialog().querySelectorAll(".presentation-scene-notice")).toHaveLength(2);
      expect(dialog().querySelector(".outgoing .presentation-scene-notice")?.parentElement?.dataset.scene).toBe(String(next - 1));
    }
    await act(async () => dialog().querySelector<HTMLButtonElement>('button[aria-label="Voltar"]')!.click());
    expect(dialog().dataset.scene).toBe("2");
    expect(dialog().querySelectorAll(".presentation-scene-notice")).toHaveLength(2);
    await tick(SCENE_TRANSITION_MS);
    expect(dialog().querySelectorAll(".presentation-scene-notice")).toHaveLength(1);
    expect(dialog().querySelector(".presentation-scene-notice")?.parentElement?.dataset.scene).toBe("2");
  });
  it("mede o slot original e acompanha quebra de linha e resize no mobile", async () => {
    await mount();
    const footer = dialog().querySelector<HTMLElement>(".presentation-footer")!;
    const anchor = dialog().querySelector<HTMLElement>("[data-notice-anchor]")!;
    const barRect = vi.spyOn(footer, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 704, 350, 76));
    const copyRect = vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 724, 150, 28));
    await click("Conheça");
    expect(dialog().style.getPropertyValue("--notice-bar-x")).toBe("20px");
    expect(dialog().style.getPropertyValue("--notice-bar-y")).toBe("704px");
    expect(dialog().style.getPropertyValue("--notice-bar-width")).toBe("350px");
    expect(dialog().style.getPropertyValue("--notice-copy-y")).toBe("20px");
    expect(dialog().style.getPropertyValue("--notice-copy-height")).toBe("28px");
    barRect.mockReturnValue(new DOMRect(32, 420, 780, 58));
    copyRect.mockReturnValue(new DOMRect(32, 444, 188, 14));
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(dialog().style.getPropertyValue("--notice-bar-x")).toBe("32px");
    expect(dialog().style.getPropertyValue("--notice-bar-y")).toBe("420px");
    expect(dialog().style.getPropertyValue("--notice-copy-y")).toBe("24px");
    expect(dialog().style.getPropertyValue("--notice-copy-height")).toBe("14px");
    expect(footer.querySelector("[data-notice-anchor]")).toBe(anchor);
  });
  it("reduced motion mantem apenas o aviso da cena atual e preserva o aviso da abertura", async () => {
    reduce = true; await mount();
    expect(dialog().querySelector("[data-notice-anchor]")?.hasAttribute("aria-hidden")).toBe(false);
    await click("Conheça");
    for (const index of [0, 1, 2, 3, 4]) {
      expect(dialog().querySelectorAll(".presentation-scene-notice")).toHaveLength(1);
      expect(dialog().querySelector(".presentation-scene-notice")?.parentElement?.dataset.scene).toBe(String(index));
      expect(dialog().querySelector(".presentation-scene-notice")?.hasAttribute("aria-hidden")).toBe(false);
      expect(dialog().querySelector("[data-notice-anchor]")?.getAttribute("aria-hidden")).toBe("true");
      if (index < 4) await click(index === 0 ? "Começar" : "Avançar");
    }
  });
  it("mantem tinta rosa e fundo chartreuse apos a expansao, durante ociosidade e na saida", async () => {
    const stylesheet = document.createElement("style");
    const globals = readFileSync(resolve("src/app/globals.css"), "utf8");
    stylesheet.textContent = globals.match(/:root\s*\{[^}]+\}/)![0]
      + globals.match(/:root\[data-theme="dark"\]\s*\{[^}]+\}/)![0]
      + readFileSync(resolve("src/app/signature-motion.css"), "utf8");
    document.head.append(stylesheet);
    const previousTheme = document.documentElement.getAttribute("data-theme");
    try {
      await mount();
      await act(async () => dialog().querySelector<HTMLButtonElement>(".presentation-next")!.click());
      const welcome = dialog().querySelector<HTMLHeadingElement>("#presentation-title")!;
      const firstScene = welcome.closest<HTMLElement>(".presentation-scene")!;
      expect(getComputedStyle(welcome).color.toUpperCase()).toBe("#9D2458");

      // happy-dom does not model :is()'s max-arm specificity like a browser.
      // Guard the original conflict too: no body-ink rule may select this h1.
      const directInkRules = [...stylesheet.sheet!.cssRules].filter((rule) => {
        const styleRule = rule as CSSStyleRule;
        return styleRule.selectorText && styleRule.style?.color === "var(--scene-ink)" && welcome.matches(styleRule.selectorText);
      });
      expect(directInkRules).toHaveLength(0);
      expect(getComputedStyle(welcome).transition).toBe("none");

      await tick(IRIS_EXPANSION_MS);
      const snapshot = () => ({ title: getComputedStyle(welcome).color.toUpperCase(), background: getComputedStyle(firstScene).backgroundColor.toUpperCase() });
      const settled = { title: "#9D2458", background: "#DCEB16" };
      expect(snapshot()).toEqual(settled);
      for (const theme of ["light", "dark"]) {
        document.documentElement.dataset.theme = theme;
        await tick(60_000);
        expect(getComputedStyle(document.documentElement).getPropertyValue("--background").trim()).toBe(theme === "dark" ? "#101629" : "#F7F8FB");
        expect(snapshot()).toEqual(settled);
        expect(dialog().dataset.scene).toBe("0");
        expect(dialog().querySelector("#presentation-title")).toBe(welcome);
      }
      await act(async () => dialog().querySelector<HTMLButtonElement>(".scene-next")!.click());
      expect(firstScene.classList.contains("outgoing")).toBe(true);
      expect(snapshot()).toEqual(settled);
      await tick(SCENE_TRANSITION_MS - 1);
      expect(snapshot()).toEqual(settled);
    } finally {
      stylesheet.remove();
      if (previousTheme === null) document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", previousTheme);
    }
  });
  it("comeca no verde e permite redirecionar a sequencia de cores durante a transicao", async () => {
    await mount(); await click("Conheça");
    expect(dialog().getAttribute("data-palette")).toBe("lime");
    const start = [...dialog().querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Começar")!;
    await act(async () => start.click());
    // Global chrome follows the outgoing scene until its mask completes.
    expect(dialog().getAttribute("data-palette")).toBe("lime");
    expect(dialog().querySelector('.presentation-scene[data-scene="1"]')?.getAttribute("data-palette")).toBe("deep");
    const forward = dialog().querySelector<HTMLButtonElement>('[aria-label="Avançar"]')!;
    expect(forward.disabled).toBe(false);
    await act(async () => forward.click());
    expect(dialog().getAttribute("data-palette")).toBe("deep");
    expect(dialog().querySelector('.presentation-scene[data-scene="2"]')?.getAttribute("data-palette")).toBe("blue");
    expect(dialog().querySelectorAll(".outgoing")).toHaveLength(1);
    await tick(SCENE_TRANSITION_MS);
    expect(dialog().getAttribute("data-palette")).toBe("blue");
    await click("Avançar"); expect(dialog().getAttribute("data-palette")).toBe("paper");
    await click("Avançar"); expect(dialog().getAttribute("data-palette")).toBe("deep");
  });
  it("mantem o dialogo ate a iris cobrir o viewport e revela sobre uma superficie unica", async () => {
    await mount(); await lastScene();
    const button = [...dialog().querySelectorAll("button")].find((b) => b.textContent?.includes("Explorar ambiente demonstrativo"))!;
    await act(async () => button.click());
    expect(dialog().open).toBe(true);
    expect(container.querySelector(".workspace-iris")).not.toBeNull();
    expect(container.querySelector(".presentation-handoff")).toBeNull();
    await tick(719); expect(dialog().open).toBe(true);
    await tick(1); expect(dialog().open).toBe(false);
    expect(container.querySelector(".presentation-handoff")?.textContent).toBe("");
    expect(container.querySelector(".presentation-underlay")?.getAttribute("data-handoff")).toBe("true");
    expect(mounts).toBe(1);
  });
  it("não emite warnings de keys ao sobrepor cenas, voltar e rever", async () => {
    const errors = vi.spyOn(console, "error"); // Call through: warnings remain visible and fail this test.
    await mount(); await lastScene(); await click("Voltar"); await click("Avançar");
    await click("Pular apresentação"); await tick(SCENE_TRANSITION_MS); await click("Rever apresentação"); await lastScene();
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
    await click("Começar"); expect(title()).toBe(PRESENTATION_SCENES[1].title);
    await tick(600_000); expect(title()).toBe(PRESENTATION_SCENES[1].title);
  });
  it("sobrepõe as cenas sem desmontar a anterior e ignora avanço duplicado", async () => {
    await mount(); await click("Conheça");
    const previous = dialog().querySelector(".presentation-scene")!;
    const start = [...dialog().querySelectorAll("button")].find((b) => b.textContent?.includes("Começar"))!;
    await act(async () => { start.click(); start.click(); });
    expect(title()).toBe(PRESENTATION_SCENES[1].title);
    expect(dialog().querySelector(".outgoing")).toBe(previous);
    expect(previous.getAttribute("aria-hidden")).toBe("true"); expect(previous.hasAttribute("inert")).toBe(true);
    expect(dialog().querySelectorAll("#presentation-title")).toHaveLength(1);
    await tick(SCENE_TRANSITION_MS - 1); expect(dialog().querySelector(".outgoing")).toBe(previous);
    await tick(1); expect(dialog().querySelector(".outgoing")).toBeNull();
    expect(title()).toBe(PRESENTATION_SCENES[1].title);
  });
  it("mantém o mesmo slogan durante as cinco cenas e ao voltar", async () => {
    await mount(); const slogan = dialog().querySelector('[data-chrome-anchor="slogan"]')!;
    await click("Conheça");
    for (let scene = 0; scene < 5; scene++) {
      expect(dialog().querySelector('[data-chrome-anchor="slogan"]')).toBe(slogan);
      expect(dialog().querySelectorAll('[data-chrome-anchor="slogan"]')).toHaveLength(1);
      expect(slogan.textContent).toBe("From insight to action.");
      if (scene < 4) await click(scene === 0 ? "Começar" : "Avançar");
    }
    await click("Voltar"); expect(dialog().querySelector('[data-chrome-anchor="slogan"]')).toBe(slogan);
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
    expect(outgoing.style.width).toBe(""); expect(outgoing.style.height).toBe("");
    expect(outgoing.style.getPropertyValue("--scene-background")).toBe("var(--brand-canvas)");
    expect(outgoing.style.getPropertyValue("--scene-ink")).toBe("var(--brand-deep)");
    await tick(SCENE_TRANSITION_MS); expect(dialog().querySelector(".outgoing")).toBeNull();
  });
  it("preserva logo e primeira cena durante os 820 ms de expansao", async () => {
    await mount();
    const logo = dialog().querySelector(".splash-wordmark");
    await tick(620);
    expect(dialog().querySelector(".splash-wordmark")).toBe(logo);
    await act(async () => dialog().querySelector<HTMLButtonElement>(".presentation-next")!.click());
    expect(dialog().querySelector(".splash-wordmark")).toBe(logo);
    const welcome = dialog().querySelector("#presentation-title");
    expect(welcome?.textContent).toBe(PRESENTATION_SCENES[0].title);
    expect(dialog().dataset.mode).toBe("splash");
    await tick(IRIS_EXPANSION_MS - 1);
    expect(dialog().dataset.mode).toBe("splash");
    await tick(1);
    expect(dialog().dataset.mode).toBe("scenes");
    expect(dialog().querySelector("#presentation-title")).toBe(welcome);
    expect(document.activeElement).toBe(welcome);
  });
  it("mantem a paleta sem interacao e aceita cliques durante transicoes", async () => {
    await mount();
    await act(async () => dialog().querySelector<HTMLButtonElement>(".presentation-next")!.click());
    await tick(IRIS_EXPANSION_MS);
    for (const [index, palette] of PRESENTATION_PALETTE.entries()) {
      expect(dialog().querySelector(`.presentation-scene[data-scene="${index}"]`)?.getAttribute("data-palette")).toBe(palette);
      expect(dialog().dataset.palette).toBe(PRESENTATION_PALETTE[Math.max(0, index - 1)]);
      await tick(600_000);
      expect(dialog().dataset.scene).toBe(String(index));
      expect(dialog().dataset.palette).toBe(palette);
      if (index < 4) {
        await act(async () => dialog().querySelector<HTMLButtonElement>(".scene-next")!.click());
        expect(dialog().dataset.scene).toBe(String(index + 1));
      }
    }
    const back = dialog().querySelector<HTMLButtonElement>('button[aria-label="Voltar"]')!;
    await act(async () => back.click());
    await act(async () => back.click());
    expect(dialog().dataset.scene).toBe("2");
    await tick(SCENE_TRANSITION_MS);
    expect(dialog().querySelector(".outgoing")).toBeNull();
    expect(dialog().querySelectorAll("#presentation-title")).toHaveLength(1);
  });
  it("pular cancela expansao sem reabrir a apresentacao", async () => {
    await mount();
    await act(async () => dialog().querySelector<HTMLButtonElement>(".presentation-next")!.click());
    await tick(100);
    await act(async () => dialog().querySelector<HTMLButtonElement>(".presentation-skip")!.click());
    await tick(120);
    expect(dialog().open).toBe(false);
    await tick(60_000);
    expect(dialog().open).toBe(false);
    expect(dialog().dataset.mode).toBe("closed");
    expect(navigation.push).not.toHaveBeenCalled();
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
    expect(dialog().style.getPropertyValue("--iris-size")).toBe(`${viewportIris(window.innerWidth, window.innerHeight, 210, 450).diameter}px`);
    rect.mockReturnValue(new DOMRect(50, 50, 20, 60));
    await act(async () => { window.dispatchEvent(new Event("resize")); });
    expect(dialog().style.getPropertyValue("--iris-x")).toBe("60px");
    expect(dialog().querySelector(".presentation-iris")).not.toBeNull();
  });
  it("usa exatamente os cinco títulos aprovados e permite voltar", async () => {
    expect(PRESENTATION_SCENES.map((s) => s.title)).toEqual(["ol\u00e1.", "ousados. inquietos. criativos.", "o pr\u00f3ximo movimento come\u00e7a aqui.", "conhe\u00e7a o go.agent.", "como deseja come\u00e7ar?"]);
    await mount(); await click("Conheça");
    for (const scene of PRESENTATION_SCENES) {
      expect(title()).toBe(scene.title); if (scene.title !== "como deseja começar?") await click(scene.title === "olá." ? "Começar" : "Avançar");
    }
    await click("Voltar"); expect(title()).toBe(PRESENTATION_SCENES[3].title);
    expect(container.querySelector(".presentation-agent")?.textContent).toContain("Cálculo determinístico");
    expect(container.querySelector('.presentation-orb svg[role="img"]')?.getAttribute("aria-label")).toBe("Flow Orb, mascote do go.agent");
  });
  it("abre a demo e persiste somente o marcador de apresentação", async () => {
    await mount(); await lastScene(); await click("Explorar ambiente demonstrativo");
    expect(dialog().open).toBe(false); expect(session.getSnapshot().source).toBe("demo");
    expect(window.localStorage.length).toBe(1); expect(window.localStorage.getItem(PRESENTATION_KEY)).toBe("seen");
    expect(document.activeElement?.id).toBe("conteudo");
    await tick(1200); expect(container.querySelector(".presentation-handoff")).toBeNull(); expect(mounts).toBe(1);
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
    expect(surface.scrollTop).toBe(220); expect(surface.textContent).toBe("");
    expect(surface.hasAttribute("inert")).toBe(true);
    await tick(1200); expect(container.querySelector(".presentation-handoff")).toBeNull();
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
  it("visitante recorrente entra diretamente, preserva deep link e pode rever", async () => {
    navigation.pathname = "/estoque";
    window.localStorage.setItem(PRESENTATION_KEY, "seen"); await mount();
    expect(dialog().open).toBe(false);
    await tick(60_000);
    expect(dialog().open).toBe(false); expect(title()).toBeUndefined();
    expect(container.querySelector(".presentation-handoff")).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled(); expect(navigation.pathname).toBe("/estoque");
    await tick(SCENE_TRANSITION_MS);
    navigation.pathname = "/compras"; await mount(); expect(dialog().open).toBe(false); expect(mounts).toBe(1);
    await click("Rever apresentação"); expect(dialog().open).toBe(true); await tick(900); await tick(600_000); expect(title()).toBeUndefined();
    await click("Conheça"); expect(title()).toBe("olá.");
  });
  it("rever e continuar preserva a importação, parâmetros e identidade da sessão", async () => {
    window.localStorage.setItem(PRESENTATION_KEY, "seen"); await mount();
    await tick(250); await tick(950); await tick(SCENE_TRANSITION_MS);
    const files = importFixture(), operation = validateImport(files, assignmentsFor(files), syntheticParameters()).operation!;
    await act(async () => { session.commit(operation, session.getSnapshot().revision); });
    const before = session.getSnapshot();
    await click("Rever apresentação"); await lastScene();
    expect(container.textContent).toContain("Continuar operação ativa");
    await click("Continuar operação ativa"); await tick(SCENE_TRANSITION_MS);
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
    expect(title()).toBe(PRESENTATION_SCENES[1].title);
    await click("Pular apresentação"); await click("Rever apresentação"); await click("Conheça");
    expect(title()).toBe("olá."); expect(dialog().querySelectorAll(".presentation-scene")).toHaveLength(1);
    expect(errors.mock.calls.flat().map(String).join(" ")).not.toMatch(/same key|unique.*key/i);
  });
  it("teclado navega, limita as cenas e Escape encerra sem modificar a fonte", async () => {
    await mount();
    const key = async (value: string) => { await act(async () => { dialog().dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })); }); if (container.querySelector(".outgoing")) await tick(SCENE_TRANSITION_MS); };
    await key("ArrowRight"); expect(title()).toBeUndefined();
    await click("Conheça"); await key("ArrowLeft"); expect(title()).toBe("olá.");
    for (let i = 0; i < 8; i++) await key("ArrowRight"); expect(title()).toBe("como deseja começar?");
    await key("ArrowLeft"); expect(title()).toBe(PRESENTATION_SCENES[3].title);
    await act(async () => { dialog().dispatchEvent(new Event("cancel", { cancelable: true })); });
    await tick(120);
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
    await tick(250); await tick(950); await tick(SCENE_TRANSITION_MS);
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
  await click("Voltar"); expect(title()).toBe(PRESENTATION_SCENES[3].title);
});
