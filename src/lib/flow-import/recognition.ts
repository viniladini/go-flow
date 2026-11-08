import { COLUMNS, moneyCents } from "../analytics/normalization";
import { dateValue, numberValue, parseCsv, unitFactor } from "../analytics/primitives";
import type { FileName } from "../analytics/types";
import { IMPORT_LIMITS, type InspectedFile } from "./types";

export const FILE_TYPES = Object.keys(COLUMNS) as FileName[];
export const FILE_LABELS: Record<FileName, string> = { "skus.csv": "SKUs", "fornecedores.csv": "Fornecedores", "vendas_diarias.csv": "Vendas diárias", "estoque_diario.csv": "Estoque diário", "compras.csv": "Compras" };
function sampleValid(header: string[], rows: string[][]) {
  return rows.slice(0, 20).every((row) => row.length === header.length && header.every((field, index) => {
    const value = row[index];
    if (["data", "data_pedido", "data_recebimento"].includes(field)) return (field === "data_recebimento" && value === "") || dateValue(value) !== null;
    if (["custo_unitario", "preco_venda", "receita"].includes(field)) return moneyCents(value) !== null;
    if (["moq", "quantidade", "estoque_disponivel", "unidades_vendidas"].includes(field)) return Number.isSafeInteger(numberValue(value));
    if (["unidade", "unidade_compra"].includes(field)) return unitFactor(value) !== null;
    return !!value.trim();
  }));
}
export function inspectText(id: string, name: string, bytes: number, text: string): InspectedFile {
  const base = { id, name, bytes, candidates: [] as FileName[], assigned: null as FileName | null, sampleTypesValid: false, records: 0 };
  if (bytes > IMPORT_LIMITS.fileBytes) return { recognition: { ...base, problem: "Arquivo acima do limite de 35 MiB." }, header: [], rows: [] };
  if (text.includes("\uFFFD") || text.includes("\0")) return { recognition: { ...base, problem: "Use texto UTF-8 válido, sem bytes nulos." }, header: [], rows: [] };
  let rows: string[][];
  try { rows = parseCsv(text); } catch { return { recognition: { ...base, problem: "Sintaxe CSV inválida; confira aspas e separadores." }, header: [], rows: [] }; }
  const header = rows.shift() ?? [];
  const duplicates = new Set(header).size !== header.length;
  const candidates = duplicates ? [] : FILE_TYPES.filter((type) => COLUMNS[type].every((column) => header.includes(column)));
  const exact = candidates.filter((type) => COLUMNS[type].length === header.length);
  const valid = sampleValid(header, rows);
  const problem = rows.length > IMPORT_LIMITS.rowsPerFile ? "Limite de 500 mil registros por arquivo excedido." : duplicates ? "Há colunas repetidas no cabeçalho." : undefined;
  return { header, rows: problem ? [] : rows, recognition: { ...base, candidates, assigned: exact.length === 1 ? exact[0] : null,
    sampleTypesValid: valid, records: rows.length, problem } };
}
