import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { APPEARANCE_INIT_SCRIPT, APPEARANCE_KEY, parseAppearance, resolveAppearance } from "@/lib/theme/appearance";
import { AppearanceControl } from "@/components/appearance-control";

function browser(initial: string | null = null, initiallyDark = false) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(APPEARANCE_KEY, initial);
  let dark = initiallyDark;
  const systemListeners = new Set<() => void>();
  const storageListeners = new Set<(event: StorageEvent) => void>();
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  const media = {
    get matches() { return dark; },
    addEventListener: (_type: string, listener: () => void) => systemListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => systemListeners.delete(listener),
  };
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  const window = {
    localStorage: storage, matchMedia: vi.fn(() => media),
    addEventListener: (_type: string, listener: (event: StorageEvent) => void) => storageListeners.add(listener),
    removeEventListener: (_type: string, listener: (event: StorageEvent) => void) => storageListeners.delete(listener),
  };
  const document = { documentElement: root };
  return {
    root, window, document, storage, systemListeners, storageListeners,
    boot: () => runInNewContext(APPEARANCE_INIT_SCRIPT, { window, document }),
    system: (value: boolean) => { dark = value; systemListeners.forEach((listener) => listener()); },
    event: (key: string | null, newValue: string | null) => storageListeners.forEach((listener) => listener({ key, newValue } as StorageEvent)),
  };
}
const cleanups: (() => void)[] = [];
beforeEach(() => vi.resetModules());
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); });

describe("inicialização antes da pintura", () => {
  it.each([
    [null, false, "system", "light"], [null, true, "system", "dark"],
    ["light", true, "light", "light"], ["dark", false, "dark", "dark"],
    ["system", true, "system", "dark"], ["invalido", false, "system", "light"],
    ["invalido", true, "system", "dark"],
  ])("resolve preferência %s e sistema escuro %s", (stored, osDark, preference, resolved) => {
    const env = browser(stored as string | null, osDark as boolean);
    env.boot();
    expect(env.root.dataset).toEqual({ theme: resolved, appearance: preference });
    expect(env.root.style.colorScheme).toBe(resolved);
    expect(env.storage.setItem).not.toHaveBeenCalled();
  });
  it("segue Sistema quando localStorage está bloqueado", () => {
    const env = browser(null, true);
    env.storage.getItem.mockImplementation(() => { throw new Error("Bloqueado"); });
    expect(env.boot).not.toThrow();
    expect(env.root.dataset.theme).toBe("dark");
    expect(env.root.dataset.appearance).toBe("system");
  });
});

describe("persistência e sincronização", () => {
  it.each(["light", "dark", "system"] as const)("persiste %s e restaura a preferência ao recarregar", async (preference) => {
    const env = browser(null, true);
    vi.stubGlobal("window", env.window); vi.stubGlobal("document", env.document);
    const store = await import("@/lib/theme/store");
    const unsubscribe = store.subscribeAppearance(vi.fn());
    store.setAppearance(preference);
    expect(env.storage.setItem).toHaveBeenLastCalledWith(APPEARANCE_KEY, preference);
    unsubscribe();
    env.root.dataset = {};
    env.boot(); // New page: same storage, pre-paint script executes again.
    vi.resetModules();
    const reloaded = await import("@/lib/theme/store");
    expect(reloaded.getAppearance()).toBe(preference);
    expect(env.root.dataset.theme).toBe(resolveAppearance(preference, true));
  });
  it("acompanha mudanças do sistema somente em modo Sistema", async () => {
    const env = browser();
    vi.stubGlobal("window", env.window); vi.stubGlobal("document", env.document);
    const store = await import("@/lib/theme/store");
    cleanups.push(store.subscribeAppearance(vi.fn()));
    expect(env.root.dataset.theme).toBe("light");
    env.system(true); expect(env.root.dataset.theme).toBe("dark");
    store.setAppearance("light"); env.system(true); expect(env.root.dataset.theme).toBe("light");
    store.setAppearance("dark"); env.system(false); expect(env.root.dataset.theme).toBe("dark");
    store.setAppearance("system"); expect(env.root.dataset.theme).toBe("light");
  });
  it("sincroniza outras abas e limpeza de preferências sem escrever em loop", async () => {
    const env = browser(null, true);
    vi.stubGlobal("window", env.window); vi.stubGlobal("document", env.document);
    const store = await import("@/lib/theme/store");
    const listener = vi.fn(); cleanups.push(store.subscribeAppearance(listener));
    env.event(APPEARANCE_KEY, "light");
    expect(store.getAppearance()).toBe("light"); expect(env.root.dataset.theme).toBe("light");
    env.event("outra-chave", "dark"); expect(store.getAppearance()).toBe("light");
    env.event(null, null); expect(store.getAppearance()).toBe("system"); expect(env.root.dataset.theme).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(env.storage.setItem).not.toHaveBeenCalled();
  });
  it("mantém escolha na sessão quando a persistência não está disponível", async () => {
    const env = browser();
    env.storage.getItem.mockImplementation(() => { throw new Error("Bloqueado"); });
    env.storage.setItem.mockImplementation(() => { throw new Error("Bloqueado"); });
    vi.stubGlobal("window", env.window); vi.stubGlobal("document", env.document);
    const store = await import("@/lib/theme/store");
    cleanups.push(store.subscribeAppearance(vi.fn()));
    expect(() => store.setAppearance("dark")).not.toThrow();
    expect(store.getAppearance()).toBe("dark");
    expect(env.root.dataset.theme).toBe("dark");
  });
  it("remove listeners ao desmontar e mantém snapshot SSR constante", async () => {
    const env = browser("dark");
    vi.stubGlobal("window", env.window); vi.stubGlobal("document", env.document);
    const store = await import("@/lib/theme/store");
    const unsubscribe = store.subscribeAppearance(vi.fn());
    expect(store.getServerAppearance()).toBe("system");
    expect(store.getAppearance()).toBe("dark");
    unsubscribe();
    expect(env.systemListeners.size).toBe(0); expect(env.storageListeners.size).toBe(0);
  });
  it("aceita escolha explícita mesmo sem matchMedia", async () => {
    const env = browser();
    env.window.matchMedia.mockImplementation(() => { throw new Error("Indisponível"); });
    vi.stubGlobal("window", env.window); vi.stubGlobal("document", env.document);
    const store = await import("@/lib/theme/store");
    cleanups.push(store.subscribeAppearance(vi.fn()));
    store.setAppearance("dark");
    expect(env.root.dataset.theme).toBe("dark");
  });
});

it("renderiza cápsula Sol/Lua com preferência Sistema estável para hidratação", () => {
  const html = renderToStaticMarkup(createElement(AppearanceControl));
  expect(html).toContain("Aparência");
  expect(html).toContain('role="group"');
  expect(html).toContain('data-theme-choice="light"');
  expect(html).toContain('data-theme-choice="dark"');
  expect(html).toContain('data-preference="system"');
  expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
  expect(html).toContain('aria-describedby=');
  expect(html).not.toContain('data-appearance-icon="system"');
  expect(parseAppearance("invalido")).toBe("system");
});

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
function tokens(selector: RegExp) {
  const block = css.match(selector)?.[1];
  if (!block) throw new Error("Paleta não encontrada.");
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}
const light = tokens(/:root\s*\{([^}]+)\}/);
const dark = { ...light, ...tokens(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/) };
function color(palette: Record<string, string>, token: string): string {
  const value = palette[token];
  const alias = value?.match(/^var\(--([\w-]+)\)$/)?.[1];
  return alias ? color(palette, alias) : value;
}
function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((v) => parseInt(v, 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const pairs = [
  ["foreground", "background"], ["foreground", "surface"], ["muted", "background"], ["muted", "surface"],
  ["accent", "background"], ["accent", "surface"], ["text-strong", "surface"],
  ["neutral-text", "neutral-background"], ["success-text", "success-background"],
  ["warning-text", "warning-background"], ["danger-text", "danger-background"],
  ["discontinued-text", "discontinued-background"], ["info-text", "info-background"],
  ["info-strong", "info-background"], ["phase-text", "phase-background"],
  ["demo-text", "demo-background"], ["demo-strong", "demo-background"],
  ["on-action", "action-background"], ["on-action", "action-hover"],
  ["sidebar-text", "sidebar-background"], ["sidebar-muted", "sidebar-background"],
  ["hero-text", "hero-background"], ["hero-muted", "hero-background"],
  ["on-brand", "brand-blue"], ["on-brand", "sidebar-hover"],
  ["brand-chartreuse", "brand-deep"], ["on-lime", "brand-chartreuse"],
  ["on-lime", "lime-hover"], ["foreground", "table-hover"],
  ["text-strong", "table-header-background"], ["muted", "surface-subtle"],
  ["brand-deep", "brand-pink"], ["brand-deep", "brand-chartreuse"],
  ["foreground", "brand-soft-pink"], ["muted", "brand-soft-pink"], ["text-strong", "brand-soft-pink"],
  ["foreground", "brand-soft-lime"], ["muted", "brand-soft-lime"], ["text-strong", "brand-soft-lime"],
  ["foreground", "brand-soft-blue"], ["muted", "brand-soft-blue"], ["text-strong", "brand-soft-blue"],
];
describe.each([["claro", light], ["escuro", dark]] as const)("contraste %s", (_name, palette) => {
  it.each(pairs)("texto %s sobre %s tem contraste AA", (text, background) => {
    expect(contrast(color(palette, text), color(palette, background))).toBeGreaterThanOrEqual(4.5);
  });
  it("foco e borda de controles têm contraste mínimo 3:1 com a superfície", () => {
    expect(contrast(color(palette, "focus-ring"), color(palette, "surface"))).toBeGreaterThanOrEqual(3);
    expect(contrast(color(palette, "control-border"), color(palette, "surface"))).toBeGreaterThanOrEqual(3);
  });
});
it("usa tokens nos componentes, preserva a marca e não inverte cores", () => {
  expect(css.slice(css.indexOf("@theme inline"))).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(css).not.toMatch(/filter:\s*invert/);
  expect(light.navy).toBe("#19234A"); expect(light.blue).toBe("#315EB5");
  expect(light.coral).toBe("#FF806D"); expect(light.lime).toBe("#E5F294");
  expect(dark.background).toBe("#101629"); expect(dark.surface).toBe("#1B2640");
  expect(dark.foreground).toBe("#F7F8FC"); expect(dark.muted).toBe("#B7C1D9");
});

it("preserva a paleta escura no fallback Sistema sem script de inicialização", () => {
  const fallback = tokens(/:root:not\(\[data-theme\]\)\s*\{([^}]+)\}/);
  const explicit = tokens(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/);
  expect(fallback).toEqual(explicit);
});

it("aplica aliases v4 às superfícies de marca sem substituir cores de risco", () => {
  expect(light["brand-deep"]).toBe("#101629");
  expect(light["brand-blue"]).toBe("#1761B1");
  expect(light["brand-chartreuse"]).toBe("#DCEB16");
  expect(color(light, "sidebar-background")).toBe(light["brand-deep"]);
  expect(color(light, "hero-background")).toBe(light["brand-blue"]);
  for (const palette of [light, dark]) {
    for (const status of ["success", "warning", "danger"]) {
      expect(color(palette, status)).not.toBe(palette["brand-chartreuse"]);
    }
  }
});

