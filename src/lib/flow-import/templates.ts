import { COLUMNS } from "../analytics/normalization";
import type { FileName } from "../analytics/types";
// Authored independently. No files are read; these are deliberately tiny format examples.
const fictional: Record<FileName, string[][]> = {
  "skus.csv": [["EXEMPLO-01", "Marca fictícia", "Produto fictício", "Exemplo", "ativo", "3.17", "8.43", "FICTICIO-01", "cx 12 un", "2"]],
  "fornecedores.csv": [["FICTICIO-01", "Fornecedor fictício independente"]],
  "vendas_diarias.csv": [["EXEMPLO-01", "2032-04-01", "3", "25.29"]],
  "estoque_diario.csv": [["EXEMPLO-01", "2032-04-01", "47"]],
  "compras.csv": [["PEDIDO-FICTICIO-01", "FICTICIO-01", "EXEMPLO-01", "2032-03-21", "2032-03-30", "2", "cx 12 un"]],
};
export function templateCsv(type: FileName): string {
  const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';
  return [COLUMNS[type].join(","), ...fictional[type].map((row) => row.map(quote).join(","))].join("\r\n") + "\r\n";
}
