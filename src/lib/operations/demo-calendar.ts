const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
/** Scenario clock only. Historical receipts keep their own captured dates. */
export function demoReferenceDate(now: Date = new Date()): string {
  const parts = localDay.formatToParts(now);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)!.value).join("-");
}
