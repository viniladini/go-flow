import { shiftDate, dayDifference } from "@/lib/analytics/math";
import { validateParameters } from "@/lib/flow-import/parameters";
import { buyingFixture } from "./buying";
import { syntheticParameters } from "./flow-import";
import type { ImportedOperation, OperationalParameters } from "@/lib/flow-import/types";
export function operationalFixture(id = "IMPORT-TESTE-A", changes: Partial<OperationalParameters> = {}, box = false): ImportedOperation {
  const dataset = buyingFixture([{ id, stock: 1, unit: box ? "cx 12 un" : "un", moq: box ? 2 : 1 }]);
  const parameters = { ...validateParameters(syntheticParameters()).parameters!, ...changes };
  const days = dayDifference(parameters.referenceDate, dataset.referenceDate);
  dataset.referenceDate = parameters.referenceDate;
  dataset.sales.forEach((r) => { r.data = shiftDate(r.data, days); });
  dataset.stocks.forEach((r) => { r.data = shiftDate(r.data, days); });
  dataset.purchases.forEach((r) => { r.data_pedido = shiftDate(r.data_pedido, days); if (r.data_recebimento) r.data_recebimento = shiftDate(r.data_recebimento, days); });
  return { source: "imported_local", contractVersion: "goflow-operational-csv/v1", parameters, dataset,
    metadata: { files: [], warnings: 0, duplicatePolicy: dataset.policy } };
}
