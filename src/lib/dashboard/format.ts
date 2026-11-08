const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
export const UNAVAILABLE = "Indisponível";
export function formatMoney(cents: number | null): string {
  if (cents === null || !Number.isSafeInteger(cents)) return UNAVAILABLE;
  const exact = BigInt(Math.abs(cents));
  const fraction = String(exact % BigInt(100)).padStart(2, "0");
  const formatted = money.formatToParts(exact / BigInt(100)).map((part) => part.type === "fraction" ? fraction : part.value).join("");
  return cents < 0 ? "-" + formatted : formatted;
}
export function formatPercentBps(bps: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(bps / 100) + "%";
}
export function formatNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? UNAVAILABLE : decimal.format(value);
}
export function formatDate(value: string | null): string {
  if (!value) return UNAVAILABLE;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) ? date.format(parsed) : UNAVAILABLE;
}
export function formatDays(value: number | null): string {
  return value === null || !Number.isFinite(value) ? UNAVAILABLE : formatNumber(value) + " dias";
}
