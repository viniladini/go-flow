export type RawRow = Record<string, string>;
type Row = RawRow;
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  let active = false;
  function endCell() { row.push(cell); cell = ""; closed = false; }
  function endRow() { endCell(); records.push(row); row = []; active = false; }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
      continue;
    }
    if (c === ",") { endCell(); active = true; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else if (c === '"' && cell === "" && !closed) { quoted = true; active = true; }
    else {
      if (closed || c === '"') throw new Error("Sintaxe CSV inválida.");
      cell += c; active = true;
    }
  }
  if (quoted) throw new Error("Campo CSV com aspas não fechadas.");
  if (active || row.length) endRow();
  return records;
}

export function numberValue(value: string): number | null {
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n : null;
}
export function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const n = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null;
}

export function unitFactor(unit: string): number | null { return unit === "un" ? 1 : unit === "cx 12 un" ? 12 : null; }
export function keyOf(row: Row, fields: string[]) { return JSON.stringify(fields.map((field) => row[field])); }
export function duplicateAnalysis(rows: Row[], fields: string[]) {
  const exact = new Map<string, { row: Row; count: number }>();
  for (const row of rows) {
    const key = JSON.stringify(row);
    const existing = exact.get(key);
    if (existing) existing.count++;
    else exact.set(key, { row, count: 1 });
  }
  const logical = new Map<string, { rows: number; variants: Map<string, Row> }>();
  for (const { row, count } of exact.values()) {
    const key = keyOf(row, fields);
    const group = logical.get(key) ?? { rows: 0, variants: new Map<string, Row>() };
    group.rows += count; group.variants.set(JSON.stringify(row), row); logical.set(key, group);
  }
  const repeatGroups = [...exact.values()].filter((v) => v.count > 1);
  const logicGroups = [...logical.values()].filter((v) => v.rows > 1);
  const conflicts = [...logical.values()].filter((v) => v.variants.size > 1);
  return {
    exactGroups: repeatGroups.length,
    exactRowsInGroups: repeatGroups.reduce((s, v) => s + v.count, 0),
    exactExcess: rows.length - exact.size,
    logicalGroups: logicGroups.length,
    logicalRowsInGroups: logicGroups.reduce((s, v) => s + v.rows, 0),
    logicalExcess: rows.length - logical.size,
    conflictingGroups: conflicts.length,
    conflictingRowsAfterExactDedup: conflicts.reduce((s, v) => s + v.variants.size, 0),
    unique: [...exact.values()].map((v) => v.row),
    unambiguous: [...logical.values()].filter((v) => v.variants.size === 1).map((v) => [...v.variants.values()][0]),
  };
}
