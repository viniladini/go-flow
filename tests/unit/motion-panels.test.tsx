// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnimatedDetails } from "@/components/animated-details";

let container: HTMLDivElement, root: ReturnType<typeof createRoot>, reduce = false;
const finished: Array<() => void> = [];
const cancel = vi.fn();
const animate = vi.fn(() => ({ cancel, finished: new Promise<void>((resolve) => finished.push(resolve)) }));
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  reduce = false; finished.length = 0; animate.mockClear(); cancel.mockClear();
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: reduce }) as MediaQueryList);
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<AnimatedDetails><summary>Detalhes</summary><button>Ação preservada</button></AnimatedDetails>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete (HTMLElement.prototype as unknown as Record<string, unknown>).animate; vi.restoreAllMocks(); });
it("abre com entrada e fecha somente depois da saida, preservando o conteudo", async () => {
  const node = container.querySelector("details")!, button = container.querySelector("button");
  await act(async () => container.querySelector("summary")!.click());
  expect(node.open).toBe(true); expect(animate).toHaveBeenCalledTimes(1);
  await act(async () => container.querySelector("summary")!.click());
  expect(node.open).toBe(true);
  await act(async () => finished[1]());
  expect(node.open).toBe(false); expect(container.querySelector("button")).toBe(button);
});
it("clique durante a saida reabre sem o callback antigo fechar o painel", async () => {
  const summary = container.querySelector("summary")!;
  await act(async () => summary.click()); await act(async () => summary.click()); await act(async () => summary.click());
  await act(async () => finished[1]());
  expect(container.querySelector("details")!.open).toBe(true);
  expect(cancel).toHaveBeenCalled();
});
it("reduced motion preserva a interacao nativa sem animacao", async () => {
  reduce = true;
  await act(async () => container.querySelector("summary")!.click());
  expect(container.querySelector("details")!.open).toBe(true);
  expect(animate).not.toHaveBeenCalled();
});
