import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { demoReferenceDate } from "@/lib/operations/demo-calendar";
import { createOperationalDemo } from "@/lib/operations/demo";
import { getOperationalDemo } from "@/lib/operations/service";
import { createOperationalResource } from "@/lib/operations/resource";
import type { OperationalWorker } from "@/lib/operations/resource";
import { createImportSession } from "@/lib/flow-import/session";
import { dayDifference, shiftDate } from "@/lib/analytics/math";

afterEach(() => vi.useRealTimers());
it.each([
  ["2026-11-08T02:59:59Z", "2026-11-07"],
  ["2026-11-08T03:00:00Z", "2026-11-08"],
  ["2027-01-01T02:59:59Z", "2026-12-31"],
  ["2024-03-01T02:00:00Z", "2024-02-29"],
])("captura o dia civil de Sao Paulo: %s", (instant, expected) => {
  expect(demoReferenceDate(new Date(instant))).toBe(expected);
});
it("desloca todo o ledger sem modificar quantidades, custos, lead times ou intervalos", () => {
  const before = createOperationalDemo(new Date("2032-04-01T15:00:00Z"));
  const after = createOperationalDemo(new Date("2026-11-08T15:00:00Z"));
  const hash = (rows: object[], base: string) => createHash("sha256").update(JSON.stringify(rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    key.startsWith("data") && typeof value === "string" ? dayDifference(base, value) : value,
  ]))))).digest("hex");
  for (const table of ["skus", "suppliers", "sales", "stocks", "purchases"] as const) {
    expect(hash(after.dataset[table], after.parameters.referenceDate)).toBe(hash(before.dataset[table], before.parameters.referenceDate));
  }
  expect(after.parameters.horizonStart).toBe(shiftDate(after.parameters.referenceDate, 2));
  expect(after.parameters.horizonEnd).toBe(shiftDate(after.parameters.referenceDate, 90));
  expect(after.dataset.stocks[0].data).toBe(shiftDate(after.parameters.referenceDate, -119));
  expect({ ...after.parameters, referenceDate: before.parameters.referenceDate, horizonStart: before.parameters.horizonStart, horizonEnd: before.parameters.horizonEnd }).toEqual(before.parameters);
});
it("cache publico expira na virada local sem alterar objetos anteriores", () => {
  vi.setSystemTime(new Date("2026-11-08T02:59:00Z"));
  const before = getOperationalDemo();
  expect(getOperationalDemo()).toBe(before);
  vi.setSystemTime(new Date("2026-11-08T03:01:00Z"));
  const after = getOperationalDemo();
  expect(after).not.toBe(before);
  expect(before.parameters.referenceDate).toBe("2026-11-07");
  expect(after.parameters.referenceDate).toBe("2026-11-08");
  expect(after.buying?.budget).toEqual(before.buying?.budget);
}, 15000);
it("SSR antigo e preservado para hidratacao, depois substituido pelo cenario inteiro atual", () => {
  vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
  const seed = getOperationalDemo();
  vi.setSystemTime(new Date("2026-11-08T15:00:00Z"));
  const updated = getOperationalDemo();
  const worker: OperationalWorker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
  const factory = vi.fn(() => worker);
  const resource = createOperationalResource(createImportSession(), factory, seed);
  expect(resource.getSnapshot().result).toBe(seed);
  try {
    resource.start();
    expect(resource.getSnapshot().status).toBe("loading");
    worker.onmessage?.({ data: { kind: "result", revision: 0, result: updated } } as MessageEvent);
    expect(resource.getSnapshot().result?.parameters.referenceDate).toBe("2026-11-08");
    expect(resource.getSnapshot().result?.model.referenceDate).toBe("2026-11-08");
    expect(resource.getSnapshot().result?.buying?.config.referenceDate).toBe("2026-11-08");
    expect(factory).toHaveBeenCalledTimes(1);
  } finally { resource.dispose(); }
}, 15000);
it("demo aberta atualiza o calendario depois da virada sem remontar a sessao", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-08T02:59:50Z"));
  const session = createImportSession(), snapshot = session.getSnapshot();
  const worker: OperationalWorker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
  const resource = createOperationalResource(session, () => worker, getOperationalDemo());
  resource.start();
  try {
    await vi.advanceTimersByTimeAsync(30000);
    const updated = getOperationalDemo();
    worker.onmessage?.({ data: { kind: "result", revision: 0, result: updated } } as MessageEvent);
    expect(resource.getSnapshot().result?.parameters.referenceDate).toBe("2026-11-08");
    expect(session.getSnapshot()).toBe(snapshot);
  } finally { resource.dispose(); }
}, 15000);
