import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { operationalFixture } from "../fixtures/operational";
import type { OperationalRequest, OperationalResponse } from "@/lib/operations/operations.worker";
describe("protocolo real do Worker operacional", () => {
  const messages: OperationalResponse[] = [];
  const scope = { postMessage: (message: OperationalResponse) => messages.push(message), onmessage: null as ((event: MessageEvent<OperationalRequest>) => void) | null };
  beforeEach(async () => {
    messages.length = 0; vi.resetModules(); vi.stubGlobal("self", scope);
    vi.stubGlobal("fetch", () => { throw new Error("Rede proibida"); });
    await import("@/lib/operations/operations.worker");
  });
  afterEach(() => vi.unstubAllGlobals());
  it("calcula a importação e devolve revisão e DTOs, sem dataset bruto", () => {
    scope.onmessage!({ data: { kind: "compute", revision: 7, operation: operationalFixture() } } as MessageEvent<OperationalRequest>);
    const message = messages[0]; expect(message.kind).toBe("result"); expect(message.revision).toBe(7);
    if (message.kind === "result") {
      expect(message.result.model.rows.map((row) => row.sku)).toEqual(["IMPORT-TESTE-A"]);
      expect(message.result.source).toBe("imported_local");
      expect(message.result).not.toHaveProperty("dataset");
      expect(JSON.stringify(message.result.model)).not.toContain('"records"');
    }
  });
  it("falha sem divulgar o conteúdo do registro na mensagem de erro", () => {
    const operation = operationalFixture(); operation.dataset.referenceDate = "INVALIDO-SINTETICO";
    scope.onmessage!({ data: { kind: "compute", revision: 8, operation } } as MessageEvent<OperationalRequest>);
    expect(messages[0]).toMatchObject({ kind: "error", revision: 8 });
    expect(JSON.stringify(messages[0])).not.toContain("INVALIDO-SINTETICO");
  });
});
