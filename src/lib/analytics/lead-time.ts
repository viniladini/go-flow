import { dayDifference, distribution, sumIntegers } from "./math.ts";
import { dateValue } from "./primitives.ts";
import type { LeadTimeMetric, Purchase } from "./types.ts";

export function calculateLeadTime(sku: string, purchases: readonly Purchase[], referenceDate: string, minSamples = 3): LeadTimeMetric {
  const ordered = purchases.filter((p) => p.sku === sku && dateValue(p.data_pedido) !== null && p.data_pedido <= referenceDate);
  const pending = ordered.filter((p) => p.data_recebimento === null || (dateValue(p.data_recebimento) !== null && p.data_recebimento > referenceDate));
  const days = ordered.filter((p) => p.data_recebimento !== null && dateValue(p.data_recebimento) !== null &&
    p.data_recebimento <= referenceDate && p.data_recebimento >= p.data_pedido)
    .map((p) => dayDifference(p.data_recebimento!, p.data_pedido));
  const stats = distribution(days);
  return {
    status: stats.n >= minSamples ? "sufficient" : "insufficient", sampleSize: stats.n,
    meanDays: stats.mean, medianDays: stats.median, sampleStdDevDays: stats.sampleStdDev,
    minDays: stats.min, maxDays: stats.max,
    pendingOrders: pending.length, pendingUnits: sumIntegers(pending.map((p) => p.quantidade_unidades)),
  };
}

