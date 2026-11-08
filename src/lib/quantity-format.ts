const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
/** Presentation only: calculations retain their original micro-unit precision. */
export function formatQuantity(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Indisponível";
  if (value !== 0 && Math.abs(value) < .001) return value > 0 ? "<0,001" : ">−0,001";
  return quantity.format(Object.is(value, -0) ? 0 : value);
}
