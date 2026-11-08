import "server-only";
import { cache } from "react";
import { createDemoDashboard } from "./presentation";
import { getOperationalDemo } from "../operations/service";

// Server facade for public synthetic models only; never accepts an imported operation.
// Imported results are computed exclusively by the browser's operational resource.
export const getDashboard = cache((mode?: "operational") => mode === "operational" ? getOperationalDemo().model : createDemoDashboard());
