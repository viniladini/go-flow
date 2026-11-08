import { moneyCents } from "../analytics/normalization";
import { dateValue } from "../analytics/primitives";
import { dayDifference } from "../analytics/math";
import type { ImportIssue, OperationalParameters, ParameterForm } from "./types";

export const emptyParameterForm = (): ParameterForm => ({ operation: "", referenceDate: "", horizonStart: "", horizonEnd: "", budget: "", servicePercent: "", annualCapitalPercent: "", monthlyStoragePercent: "", maxDiscountPercent: "", demandWindowDays: "" });
export function validateParameters(form: ParameterForm): { parameters: OperationalParameters | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const fail = (field: keyof ParameterForm, message: string) => issues.push({ severity: "error", code: "invalid_parameter", field, message });
  const decimal = (field: keyof ParameterForm, percent = false): number => {
    const text = form[field];
    const value = typeof text === "string" && /^\d+(?:[.,]\d{1,2})?$/.test(text) ? moneyCents(text.replace(",", ".")) : null;
    if (value === null || (percent && value > 10000)) { fail(field, "Informe um valor não negativo, sem separador de milhar, com até duas casas decimais" + (percent ? " e no máximo 100%." : ".")); return 0; }
    return value;
  };
  for (const key of ["referenceDate", "horizonStart", "horizonEnd"] as const) if (dateValue(form[key]) === null || form[key] < "1900-01-01") fail(key, "Informe uma data válida, a partir de 1900, no formato ISO.");
  if (!issues.length && (form.horizonStart <= form.referenceDate || form.horizonEnd < form.horizonStart || dayDifference(form.horizonEnd, form.horizonStart) >= 366)) fail("horizonEnd", "O horizonte deve iniciar após a referência, terminar após o início e conter no máximo 366 dias.");
  if (typeof form.operation !== "string" || !form.operation.trim() || form.operation.length > 120) fail("operation", "Informe o nome da operação, com até 120 caracteres.");
  if (!["30", "60", "90"].includes(form.demandWindowDays)) fail("demandWindowDays", "Escolha explicitamente a janela de vendas observadas.");
  const budgetCents = decimal("budget"), serviceBps = decimal("servicePercent", true);
  const annualCapitalBps = decimal("annualCapitalPercent", true), monthlyStorageBps = decimal("monthlyStoragePercent", true), maxDiscountBps = decimal("maxDiscountPercent", true);
  if (serviceBps === 0) fail("servicePercent", "A meta de serviço deve ser maior que zero; é objetivo, não garantia.");
  return { issues, parameters: issues.length ? null : { operation: form.operation.trim(), referenceDate: form.referenceDate,
    horizonStart: form.horizonStart, horizonEnd: form.horizonEnd, budgetCents, serviceBps, annualCapitalBps, monthlyStorageBps, maxDiscountBps,
    demandWindowDays: Number(form.demandWindowDays) as 30 | 60 | 90 } };
}
