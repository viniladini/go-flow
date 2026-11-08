import assert from "node:assert/strict";
import { test } from "vitest";
import { BASE, dateValue, duplicateAnalysis, numberValue, parseCsv, purchaseState, purchaseUnits, respectsMoq, unitFactor } from "../../scripts/data-audit.mts";

test("CSV preserva campos entre aspas, espaços, quebras e campo vazio final", () => {
  assert.deepEqual(parseCsv('\uFEFFa,b,c\r\n"x,y","a""b",\r\n"linha\nnova", z,1'), [
    ["a", "b", "c"], ["x,y", 'a"b', ""], ["linha\nnova", " z", "1"],
  ]);
  assert.deepEqual(parseCsv("a\n"), [["a"]]);
  assert.deepEqual(parseCsv("a\n\n"), [["a"], [""]]);
  assert.throws(() => parseCsv('a,"ab'));
  assert.throws(() => parseCsv('a,"ab"x'));
  assert.throws(() => parseCsv('a,ab"'));
});
test("datas estritas e números não convertem ausências em zero", () => {
  assert.equal(dateValue("2026-02-29"), null);
  assert.notEqual(dateValue("2034-09-18"), null);
  assert.equal(dateValue("18/04/2037"), null);
  for (const value of ["", " ", "1,2", "NaN", "Infinity", "9007199254740992"]) assert.equal(numberValue(value), null);
  assert.equal(numberValue("-2.5"), -2.5);
  assert.equal(numberValue("0"), 0);
});
test("deduplicação exata não soma e conflitos excluem todas as variantes", () => {
  const rows = [{ sku: "A", data: BASE, n: "2" }, { sku: "A", data: BASE, n: "2" }, { sku: "B", data: BASE, n: "1" }, { sku: "B", data: BASE, n: "3" }];
  const result = duplicateAnalysis(rows, ["sku", "data"]);
  assert.equal(result.exactGroups, 1);
  assert.equal(result.exactExcess, 1);
  assert.equal(result.logicalGroups, 2);
  assert.equal(result.conflictingGroups, 1);
  assert.equal(result.unique.length, 3);
  assert.deepEqual(result.unambiguous, [rows[0]]);
  assert.equal(rows.length, 4);
});
test("caixas representam 12 unidades físicas; unidade desconhecida não é inferida", () => {
  assert.equal(unitFactor("un"), 1);
  assert.equal(unitFactor("cx 12 un"), 12);
  assert.equal(unitFactor("cx"), null);
  assert.equal(3 * unitFactor("cx 12 un"), 36);
});
test("pendências e recebimentos futuros nunca entram como recebidos na base", () => {
  const row = { data_pedido: "2037-03-21", data_recebimento: "" };
  assert.equal(purchaseState(row), "pendente_sem_recebimento");
  assert.equal(purchaseState({ ...row, data_recebimento: BASE }), "recebido_na_base");
  assert.equal(purchaseState({ ...row, data_recebimento: "2037-04-19" }), "recebimento_futuro_nao_disponivel_na_base");
  assert.equal(purchaseState({ ...row, data_recebimento: "2037-03-19" }), "recebimento_invalido");
  assert.equal(purchaseState({ ...row, data_pedido: "2037-04-20" }), "fora_da_base_ou_pedido_invalido");
});

test("MOQ aplica unidade do catálogo e rejeita quantidade fracionária ou inválida", () => {
  const sku = { unidade_compra: "cx 12 un", moq: "2" };
  assert.equal(purchaseUnits({ quantidade: "3", unidade: "cx 12 un" }), 36);
  assert.equal(respectsMoq({ quantidade: "24", unidade: "un" }, sku), true);
  assert.equal(respectsMoq({ quantidade: "36", unidade: "un" }, sku), false);
  assert.equal(respectsMoq({ quantidade: "4", unidade: "cx 12 un" }, sku), true);
  for (const quantidade of ["0", "-1", "1.5", ""]) {
    assert.equal(respectsMoq({ quantidade, unidade: "un" }, sku), null);
  }
  assert.equal(respectsMoq({ quantidade: "24", unidade: "un" }, { ...sku, moq: "0" }), null);
  assert.equal(respectsMoq({ quantidade: "24", unidade: "un" }), null);
});