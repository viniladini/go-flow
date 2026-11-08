import { dateValue, unitFactor } from "../analytics/primitives.ts";
import { dayDifference, multiplyIntegers } from "../analytics/math.ts";
import type { Sku, Dataset } from "../analytics/types.ts";
import type { BuyingConfig, BuyingInput } from "./types.ts";

/** Independent fictional example. Never defaults for an imported operation. */
export const SYNTHETIC_RULES = Object.freeze({
  referenceDate: "2037-04-18", horizonStart: "2037-04-20", horizonEnd: "2037-07-18",
  maxBudgetCents: 86400000, targetServiceBps: 9650,
  annualCapitalBps: 1350, monthlyStorageBps: 85, maxLiquidationDiscountBps: 2750,
  blackFriday: Object.freeze({ start: "2037-06-10", end: "2037-06-18", event: "2037-06-14" }),
  christmas: Object.freeze({ start: "2037-07-01", end: "2037-07-14" }),
});
export const MICRO_UNITS = 1_000_000;
export const stableCompare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function safeNumber(value: bigint): number {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Resultado fora do intervalo inteiro seguro.");
  return Number(value);
}
export function ceilRatio(numerator: bigint, denominator: bigint): number {
  if (numerator < BigInt(0) || denominator <= BigInt(0)) throw new Error("Razão inválida.");
  return safeNumber((numerator + denominator - BigInt(1)) / denominator);
}
export function toMicro(value: number): number {
  const n = Math.round(value * MICRO_UNITS);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(n)) throw new Error("Quantidade projetada fora do intervalo seguro.");
  return n;
}
export function resolveBuyingConfig(input: BuyingInput): BuyingConfig {
  if (Object.prototype.hasOwnProperty.call(input, "policy")) return resolveOperationalBuyingConfig(input);
  // Only omission selects the default. An explicit null must never unlock the synthetic budget.
  const budget = input.budgetCents === undefined ? SYNTHETIC_RULES.maxBudgetCents : input.budgetCents;
  const orderDate = input.orderDate ?? SYNTHETIC_RULES.horizonStart;
  const scenario = { name: "Proxy constante sem crescimento de campanha", blackFridayMultiplierBps: 10000, christmasMultiplierBps: 10000, safetyStock: "normal_independent" as const, ...input.scenario };
  if (input.scenario?.name === undefined && (scenario.blackFridayMultiplierBps !== 10000 || scenario.christmasMultiplierBps !== 10000)) scenario.name = "Cenário hipotético de campanhas";
  if (input.dataset.referenceDate !== SYNTHETIC_RULES.referenceDate || !Number.isSafeInteger(budget) || budget < 0 || budget > SYNTHETIC_RULES.maxBudgetCents ||
      dateValue(orderDate) === null || orderDate < SYNTHETIC_RULES.horizonStart || orderDate > SYNTHETIC_RULES.horizonEnd ||
      ![30, 60, 90].includes(input.demandWindowDays ?? 30) || !scenario.name.trim() ||
      !["normal_independent", "none"].includes(scenario.safetyStock) ||
      [scenario.blackFridayMultiplierBps, scenario.christmasMultiplierBps].some((v) => !Number.isSafeInteger(v) || v < 0)) {
    throw new Error("Configuração de compras inválida ou fora das restrições do exemplo sintético.");
  }
  return { referenceDate: SYNTHETIC_RULES.referenceDate, horizonStart: SYNTHETIC_RULES.horizonStart, horizonEnd: SYNTHETIC_RULES.horizonEnd,
    orderDate, budgetCents: budget, demandWindowDays: input.demandWindowDays ?? 30, scenario };
}
function resolveOperationalBuyingConfig(input: BuyingInput): BuyingConfig {
  const p = input.policy;
  if (!p || [p.referenceDate, p.horizonStart, p.horizonEnd].some((date) => dateValue(date) === null) ||
      input.dataset.referenceDate !== p.referenceDate || p.horizonStart <= p.referenceDate || p.horizonEnd < p.horizonStart ||
      dayDifference(p.horizonEnd, p.referenceDate) > 366 || ![30, 60, 90].includes(p.demandWindowDays) ||
      !Number.isSafeInteger(p.budgetCents) || p.budgetCents < 0 ||
      [p.serviceBps, p.annualCapitalBps, p.monthlyStorageBps, p.maxDiscountBps].some((v) => !Number.isSafeInteger(v) || v < 0 || v > 10000) || p.serviceBps === 0 ||
      (input.budgetCents !== undefined && input.budgetCents !== p.budgetCents) ||
      (input.demandWindowDays !== undefined && input.demandWindowDays !== p.demandWindowDays)) throw new Error("Política operacional explícita inválida ou incompleta.");
  const orderDate = input.orderDate === undefined ? p.horizonStart : input.orderDate;
  if (dateValue(orderDate) === null || orderDate < p.horizonStart || orderDate > p.horizonEnd || input.scenario !== undefined) throw new Error("Emissão inválida ou cenário não suportado na operação importada.");
  return { referenceDate: p.referenceDate, horizonStart: p.horizonStart, horizonEnd: p.horizonEnd, orderDate,
    budgetCents: p.budgetCents, demandWindowDays: p.demandWindowDays, operational: { ...p },
    scenario: { name: "Proxy constante explícita, sem campanhas inferidas e sem buffer calibrado", blackFridayMultiplierBps: 10000,
      christmasMultiplierBps: 10000, safetyStock: "none" } };
}
export function purchaseQuantities(sku: Sku, lots: number) {
  const factor = unitFactor(sku.unidade_compra);
  if (factor === null) throw new Error("Unidade de compra desconhecida.");
  if (!Number.isSafeInteger(sku.moq) || sku.moq < 1 || !Number.isSafeInteger(lots) || lots < 1 ||
      !Number.isSafeInteger(sku.custo_unitario_centavos) || sku.custo_unitario_centavos <= 0) throw new Error("MOQ, quantidade ou custo inválido.");
  const quantityPurchaseUnits = multiplyIntegers(lots, sku.moq);
  const physicalUnits = multiplyIntegers(quantityPurchaseUnits, factor);
  return { quantityPurchaseUnits, physicalUnits, costCents: multiplyIntegers(physicalUnits, sku.custo_unitario_centavos) };
}
export function assertNormalizedInput(data: Dataset) {
  if (data.policy !== "exploratory_exact_dedup_conflict_quarantine") throw new Error("Política de normalização não reconhecida.");
  const unique = <T>(rows: T[], key: (row: T) => string) => { if (new Set(rows.map(key)).size !== rows.length) throw new Error("Normalize e resolva duplicatas antes do planejamento."); };
  unique(data.skus, (s) => s.sku); unique(data.suppliers, (s) => s.fornecedor);
  unique(data.sales, (s) => JSON.stringify([s.sku, s.data])); unique(data.stocks, (s) => JSON.stringify([s.sku, s.data]));
  unique(data.purchases, (s) => JSON.stringify([s.po_id, s.sku]));
  const skuIds = new Set(data.skus.map((s) => s.sku));
  const supplierIds = new Set(data.suppliers.map((s) => s.fornecedor));
  const requireKey = (key: string) => {
    if (typeof key !== "string" || !key.trim()) throw new Error("Chave obrigatória ausente; normalize as origens.");
  };
  for (const supplier of data.suppliers) requireKey(supplier.fornecedor);
  for (const sku of data.skus) {
    requireKey(sku.sku); requireKey(sku.fornecedor);
    if (unitFactor(sku.unidade_compra) === null) throw new Error("Unidade de compra desconhecida.");
    if (!["ativo", "descontinuado"].includes(sku.status)) throw new Error("Status de SKU inválido.");
    if (![sku.custo_unitario_centavos, sku.preco_venda_centavos].every((v) => Number.isSafeInteger(v) && v >= 0) ||
        !Number.isSafeInteger(sku.moq) || sku.moq < 1) throw new Error("Cadastro de SKU não normalizado: custo, preço ou MOQ inválido.");
    if (!supplierIds.has(sku.fornecedor)) throw new Error("Referência de fornecedor não resolvida.");
  }
  for (const row of [...data.sales, ...data.stocks, ...data.purchases]) {
    if (!skuIds.has(row.sku)) throw new Error("Referência de SKU não resolvida.");
  }
  for (const sale of data.sales) if (!Number.isSafeInteger(sale.unidades_vendidas) || sale.unidades_vendidas < 0 || !Number.isSafeInteger(sale.receita_centavos) || sale.receita_centavos < 0) throw new Error("Venda não normalizada.");
  for (const stock of data.stocks) if (!Number.isSafeInteger(stock.estoque_disponivel)) throw new Error("Estoque não normalizado.");
  for (const row of [...data.sales, ...data.stocks]) if (dateValue(row.data) === null) throw new Error("Data inválida; normalize as origens.");
  for (const po of data.purchases) {
    requireKey(po.po_id);
    if (!supplierIds.has(po.fornecedor)) throw new Error("Referência de fornecedor da compra não resolvida.");
    const factor = unitFactor(po.unidade);
    if (factor === null || !Number.isSafeInteger(po.quantidade) || po.quantidade <= 0 ||
        multiplyIntegers(po.quantidade, factor) !== po.quantidade_unidades ||
        dateValue(po.data_pedido) === null || (po.data_recebimento !== null &&
        (dateValue(po.data_recebimento) === null || po.data_recebimento < po.data_pedido))) throw new Error("Compra não normalizada.");
  }
}

