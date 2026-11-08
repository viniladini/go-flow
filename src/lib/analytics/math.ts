import { dateValue } from "./primitives.ts";

const DAY = 86_400_000;
export function dayDifference(later: string, earlier: string): number {
  const a = dateValue(later), b = dateValue(earlier);
  if (a === null || b === null) throw new Error("Data ISO inválida.");
  return (a - b) / DAY;
}
export function shiftDate(date: string, days: number): string {
  const time = dateValue(date);
  if (time === null || !Number.isSafeInteger(days)) throw new Error("Data ou deslocamento inválido.");
  return new Date(time + days * DAY).toISOString().slice(0, 10);
}
export function sumIntegers(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(total + value)) throw new Error("Inteiro fora do intervalo seguro.");
    total += value;
  }
  return total;
}
export function multiplyIntegers(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(a * b)) throw new Error("Produto fora do intervalo seguro.");
  return a * b;
}
export function distribution(values: readonly number[]) {
  if (values.some((v) => !Number.isFinite(v))) throw new Error("Amostra não finita.");
  const n = values.length;
  if (!n) return { n, mean: null, median: null, populationStdDev: null, sampleStdDev: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  // Welford avoids cancellation when values have a large shared baseline.
  let mean = 0, m2 = 0;
  values.forEach((value, i) => { const delta = value - mean; mean += delta / (i + 1); m2 += delta * (value - mean); });
  return {
    n, mean, median: n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    populationStdDev: Math.sqrt(Math.max(0, m2 / n)),
    sampleStdDev: n > 1 ? Math.sqrt(Math.max(0, m2 / (n - 1))) : null,
    min: sorted[0], max: sorted[n - 1],
  };
}

