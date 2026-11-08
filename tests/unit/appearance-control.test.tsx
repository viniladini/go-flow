// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AppearanceControl } from "@/components/appearance-control";
import { setAppearance } from "@/lib/theme/store";
import { APPEARANCE_KEY } from "@/lib/theme/appearance";

let container: HTMLDivElement, root: Root, dark: boolean;
const listeners = new Set<() => void>();
function button(value: string) { return container.querySelector<HTMLButtonElement>(`button[data-theme-choice="${value}"]`)!; }
async function key(value: string) { await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); }); }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); dark = false; listeners.clear();
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ get matches() { return dark; }, addEventListener: (_event: string, listener: () => void) => listeners.add(listener), removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener) }) as unknown as MediaQueryList);
  setAppearance("system"); window.localStorage.clear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<AppearanceControl />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

it("cliques fixam Claro/Escuro; repetir o ícone selecionado restaura Sistema", async () => {
  expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  for (const value of ["light", "dark"]) {
    await act(async () => button(value).click());
    expect(button(value).getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe(value);
    await act(async () => button(value).click());
    expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe("system");
    expect(document.documentElement.dataset.appearance).toBe("system");
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  }
});
it("setas, Home e End movem foco sem fixar tema; botões nativos mantêm teclado", async () => {
  button("light").focus(); await key("ArrowRight"); expect(document.activeElement).toBe(button("dark"));
  await key("Home"); expect(document.activeElement).toBe(button("light"));
  await key("End"); expect(document.activeElement).toBe(button("dark"));
  expect(document.documentElement.dataset.appearance).toBe("system");
  expect(container.querySelectorAll('button[type="button"]')).toHaveLength(2);
  expect(button("dark").querySelector('[role="tooltip"]')?.textContent).toContain("seguir o sistema");
});
it("Escape dispensa o tooltip sem mudar a preferência", async () => {
  await act(async () => button("light").focus());
  await key("Escape");
  expect(container.querySelector(".appearance-segments")?.getAttribute("data-tooltip-dismissed")).toBe("true");
  expect(document.documentElement.dataset.appearance).toBe("system");
  await act(async () => button("dark").focus());
  expect(container.querySelector(".appearance-segments")?.hasAttribute("data-tooltip-dismissed")).toBe(false);
});
it("Sistema acompanha o dispositivo e eventos de outra aba atualizam o indicador", async () => {
  dark = true; await act(async () => listeners.forEach((listener) => listener()));
  expect(document.documentElement.dataset.theme).toBe("dark"); expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: APPEARANCE_KEY, newValue: "light" })));
  expect(button("light").getAttribute("aria-pressed")).toBe("true"); expect(document.documentElement.dataset.theme).toBe("light");
  expect(container.querySelector(".appearance-segments")?.getAttribute("data-preference")).toBe("light");
});
