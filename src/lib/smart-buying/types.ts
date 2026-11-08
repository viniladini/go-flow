import type { Dataset, LeadTimeMetric, RiskMetric, Sku } from "../analytics/types.ts";

export type Campaign = "black_friday" | "christmas";
export interface BuyingScenario {
  name: string;
  blackFridayMultiplierBps: number;
  christmasMultiplierBps: number;
  safetyStock: "normal_independent" | "none";
}
export interface BuyingInput {
  dataset: Dataset;
  origin: "independent_synthetic" | "provided_dataset";
  budgetCents?: number;
  orderDate?: string;
  demandWindowDays?: 30 | 60 | 90;
  scenario?: Partial<BuyingScenario>;
  policy?: OperationalBuyingPolicy;
}
export interface OperationalBuyingPolicy {
  referenceDate: string; horizonStart: string; horizonEnd: string; budgetCents: number;
  demandWindowDays: 30 | 60 | 90; serviceBps: number; annualCapitalBps: number;
  monthlyStorageBps: number; maxDiscountBps: number;
}
export interface BuyingConfig {
  referenceDate: string; horizonStart: string; horizonEnd: string; orderDate: string;
  budgetCents: number; demandWindowDays: 30 | 60 | 90; scenario: BuyingScenario;
  operational?: OperationalBuyingPolicy;
}
export interface BuyingAlert { code: string; message: string; sku?: string }
export interface CampaignProjection {
  campaign: Campaign; start: string; end: string;
  demandUnits: number; servedUnits: number; unservedUnits: number;
  arrivalBeforeStart: boolean; arrivalWithinCampaign: boolean;
}
export interface Projection {
  start: string; end: string; demandUnits: number; servedUnits: number; unservedUnits: number;
  servedMicroUnits: number; endingStockMicroUnits: number; remediableUnservedMicroUnits: number;
  endingStockUnits: number; firstUnservedDate: string | null;
  firstRemediableShortfallDate: string | null;
  campaigns: CampaignProjection[];
  carryingCostCents: number; capitalCostCents: number; storageCostCents: number;
}
export interface DemandDay { date: string; microUnits: number; campaign: Campaign | null }
export interface EligibleNeed {
  sku: Sku; risk: RiskMetric["level"]; coverageDays: number | null;
  observedDailySales: number; observedDailyStdDev: number;
  leadTime: LeadTimeMetric; leadTimeDays: number; arrivalDate: string;
  usableStockUnits: number; safetyStockUnits: number; targetPurchaseUnits: number;
  calendar: DemandDay[]; baseline: Projection; priorityDate: string;
  warnings: BuyingAlert[];
}
export type NeedStatus = "eligible" | "insufficient_data" | "invalid_constraints" | "negative_stock" | "discontinued" | "zero_observed_demand" | "no_need" | "arrival_after_horizon";
export interface NeedAssessment {
  sku: string; status: NeedStatus; reason: string; risk: RiskMetric["level"];
  selectionStatus: "selected" | "financial_infeasible" | "budget_competition" | "not_applicable";
  targetPurchaseUnits: number | null; safetyStockUnits: number | null;
  pendingOrdersNotCredited: number; pendingUnitsNotCredited: number;
  baseline: Projection | null;
}
export interface PurchaseBenefit {
  additionalServedUnits: number; addedSafetyBufferUnits: number;
  additionalServedMicroUnits: number; addedSafetyMicroUnits: number;
  /** Conditional scenario delta; never an observed lost-sale estimate. */
  interpretation: "conditional_scenario_improvement";
}
export interface PurchaseAlternative {
  id: string; sku: string; supplier: string; orderDate: string;
  purchaseUnit: Sku["unidade_compra"]; quantityPurchaseUnits: number; physicalUnits: number;
  estimatedCostCents: number; lotCount: number;
  leadTimeDays: number; estimatedArrivalDate: string;
  leadTimeEvidence: Pick<LeadTimeMetric, "sampleSize" | "meanDays" | "sampleStdDevDays">;
  risk: RiskMetric["level"]; urgency: "before_replenishment" | "within_horizon";
  priorityDate: string; benefit: PurchaseBenefit; projection: Projection;
  confidence: "conditional"; assumptions: string[]; explanation: string;
}
export interface PurchaseProposal extends PurchaseAlternative { status: "draft"; humanApprovalRequired: true }
export type RejectionReason = "financial_infeasible" | "budget_competition" | "superseded_for_sku" | "no_estimable_benefit";
export interface AlternativeDecision { alternative: PurchaseAlternative; selected: boolean; reason: "selected" | RejectionReason; explanation: string }
export interface BuyingResult {
  version: 1; origin: BuyingInput["origin"]; config: BuyingConfig;
  methodology: "deterministic_greedy_upgrades_v1"; globallyOptimal: false; requiresHumanApproval: true;
  budget: { totalCents: number; usedCents: number; remainingCents: number; scope: "new_proposals_only"; existingOrdersDeductedCents: 0 };
  proposals: PurchaseProposal[]; alternatives: AlternativeDecision[];
  assessments: NeedAssessment[]; alerts: BuyingAlert[];
  dispositionOpportunities: { sku: string; usableUnits: number | null; valueCents: number | null; action: "manual_disposition_review" }[];
  limitations: string[];
}

