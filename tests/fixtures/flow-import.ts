import { COLUMNS } from "@/lib/analytics/normalization";
import { templateCsv } from "@/lib/flow-import/templates";
import { FILE_TYPES, inspectText } from "@/lib/flow-import/recognition";
import type { FileName } from "@/lib/analytics/types";
import type { ParameterForm } from "@/lib/flow-import/types";

export const syntheticParameters = (): ParameterForm => ({
  operation: "Operação de teste independente", referenceDate: "2032-04-01", horizonStart: "2032-04-03", horizonEnd: "2032-05-18",
  budget: "4567,89", servicePercent: "95", annualCapitalPercent: "9.75", monthlyStoragePercent: "0.35", maxDiscountPercent: "27", demandWindowDays: "30",
});
export function importFixture(changes: Partial<Record<FileName, string>> = {}) {
  return FILE_TYPES.map((type, index) => {
    const text = changes[type] ?? templateCsv(type);
    return inspectText("test-" + index, "renomeado-" + index + ".csv", new TextEncoder().encode(text).byteLength, text);
  });
}
export const assignmentsFor = (files: ReturnType<typeof importFixture>) => Object.fromEntries(files.map((f) => [f.recognition.id, f.recognition.assigned]));
export function syntheticCsv(file: FileName, rows: string[][]) {
  const escape = (v: string) => '"' + v.replace(/"/g, '""') + '"';
  return [COLUMNS[file].join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}
