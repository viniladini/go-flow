import { shiftDate } from "../analytics/math.ts";
import { SYNTHETIC_RULES, MICRO_UNITS, ceilRatio, safeNumber, toMicro } from "./policy.ts";
import type { BuyingConfig, Campaign, DemandDay, Projection } from "./types.ts";

export function campaignAt(date: string, config?: BuyingConfig): Campaign | null {
  if (config?.operational) return null; // No dates or seasonal growth inferred for imported operations.
  if (date >= SYNTHETIC_RULES.blackFriday.start && date <= SYNTHETIC_RULES.blackFriday.end) return "black_friday";
  if (date >= SYNTHETIC_RULES.christmas.start && date <= SYNTHETIC_RULES.christmas.end) return "christmas";
  return null;
}
export function scenarioCalendar(dailyProxy: number, config: BuyingConfig): DemandDay[] {
  const rate = BigInt(toMicro(dailyProxy));
  const result: DemandDay[] = [];
  // Bridge consumes the known closing balance after BASE, but is not counted in the 90-day objective.
  for (let date = shiftDate(config.referenceDate, 1); date <= config.horizonEnd; date = shiftDate(date, 1)) {
    const campaign = campaignAt(date, config);
    const bps = campaign === "black_friday" ? config.scenario.blackFridayMultiplierBps :
      campaign === "christmas" ? config.scenario.christmasMultiplierBps : 10000;
    result.push({ date, campaign, microUnits: safeNumber((rate * BigInt(bps) + BigInt(5000)) / BigInt(10000)) });
  }
  return result;
}
export function projectPurchase(calendar: readonly DemandDay[], initialStockUnits: number, physicalUnits: number,
  arrivalDate: string, unitCostCents: number, config: BuyingConfig): Projection {
  let stock = BigInt(toMicro(initialStockUnits)), baselineStock = stock;
  let demand = BigInt(0), served = BigInt(0), unserved = BigInt(0), remediable = BigInt(0), inventoryMicroDays = BigInt(0);
  let firstUnservedDate: string | null = null, firstRemediableShortfallDate: string | null = null;
  const campaigns = new Map<Campaign, { demand: bigint; served: bigint; unserved: bigint }>();
  if (!config.operational) for (const id of ["black_friday", "christmas"] as const) campaigns.set(id, { demand: BigInt(0), served: BigInt(0), unserved: BigInt(0) });
  for (const day of calendar) {
    if (day.date === arrivalDate) stock += BigInt(toMicro(physicalUnits));
    const requested = BigInt(day.microUnits);
    const fulfilled = stock < requested ? stock : requested;
    const baselineFulfilled = baselineStock < requested ? baselineStock : requested;
    stock -= fulfilled; baselineStock -= baselineFulfilled;
    if (day.date < config.horizonStart) continue;
    const missing = requested - fulfilled;
    demand += requested; served += fulfilled; unserved += missing;
    inventoryMicroDays += stock - baselineStock;
    if (missing > BigInt(0)) {
      firstUnservedDate ??= day.date;
      if (day.date >= arrivalDate) { firstRemediableShortfallDate ??= day.date; remediable += missing; }
    }
    if (day.campaign) {
      const aggregate = campaigns.get(day.campaign)!;
      aggregate.demand += requested; aggregate.served += fulfilled; aggregate.unserved += missing;
    }
  }
  const capitalCostCents = ceilRatio(inventoryMicroDays * BigInt(unitCostCents) * BigInt(config.operational ? config.operational.annualCapitalBps : SYNTHETIC_RULES.annualCapitalBps),
    BigInt(MICRO_UNITS) * BigInt(10000) * BigInt(365));
  const storageCostCents = ceilRatio(inventoryMicroDays * BigInt(unitCostCents) * BigInt(config.operational ? config.operational.monthlyStorageBps : SYNTHETIC_RULES.monthlyStorageBps),
    BigInt(MICRO_UNITS) * BigInt(10000) * BigInt(30));
  const units = (value: bigint) => safeNumber(value) / MICRO_UNITS;
  return {
    start: config.horizonStart, end: config.horizonEnd, demandUnits: units(demand), servedUnits: units(served), unservedUnits: units(unserved),
    servedMicroUnits: safeNumber(served), endingStockMicroUnits: safeNumber(stock), remediableUnservedMicroUnits: safeNumber(remediable),
    endingStockUnits: units(stock), firstUnservedDate, firstRemediableShortfallDate,
    capitalCostCents, storageCostCents, carryingCostCents: safeNumber(BigInt(capitalCostCents) + BigInt(storageCostCents)),
    campaigns: [...campaigns].map(([campaign, aggregate]) => {
      const period = campaign === "black_friday" ? SYNTHETIC_RULES.blackFriday : SYNTHETIC_RULES.christmas;
      return { campaign, start: period.start, end: period.end, demandUnits: units(aggregate.demand), servedUnits: units(aggregate.served), unservedUnits: units(aggregate.unserved),
        arrivalBeforeStart: arrivalDate <= period.start, arrivalWithinCampaign: arrivalDate >= period.start && arrivalDate <= period.end };
    }),
  };
}

