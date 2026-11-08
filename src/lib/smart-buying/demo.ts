import { createDemoDataset } from "../dashboard/demo-dataset.ts";
import { createSmartBuyingPlan } from "./index.ts";
import type { BuyingInput } from "./types.ts";

/** Public-safe inputs only; never reads files and is not connected to any page. */
export function createDemoSmartBuyingPlan(options: Pick<BuyingInput, "budgetCents" | "scenario" | "orderDate"> = {}) {
  return createSmartBuyingPlan({ ...options, dataset: createDemoDataset(), origin: "independent_synthetic" });
}

