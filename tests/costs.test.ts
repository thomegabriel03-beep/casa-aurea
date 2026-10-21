import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCostCsv, parseMoney } from "../src/lib/catalog/costs";

test("custo: valores no formato brasileiro e internacional", () => {
  assert.equal(parseMoney("R$ 1.234,56"), 1234.56);
  assert.equal(parseMoney("1234,5"), 1234.5);
  assert.equal(parseMoney("1234.50"), 1234.5);
  assert.equal(parseMoney("2.500"), 2500);
  assert.equal(parseMoney("1,234.56"), 1234.56);
  assert.equal(parseMoney("890"), 890);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("abc"), null);
});

test("planilha de custos: cabeçalho, separador e erros", () => {
  const r = parseCostCsv("\uFEFFCódigo;Preço de custo\nCA-MES-0167;R$ 3.450,00\nca-sof-0027 ; 8900\n;10\nCA-POL-0001;x\nCA-MES-0167;3500\n");
  assert.deepEqual(r.rows.map((x) => [x.code, x.cost]), [["CA-MES-0167", 3500], ["CA-SOF-0027", 8900]]);
  assert.equal(r.errors.length, 2);
});

test("planilha de custos: sem cabeçalho, vírgula e aspas", () => {
  const r = parseCostCsv('ABC-12,"1.200,50"\nXYZ 9,300\n');
  assert.deepEqual(r.rows.map((x) => [x.code, x.cost]), [["ABC-12", 1200.5], ["XYZ 9", 300]]);
});

test("planilha de custos: colunas em outra ordem", () => {
  const r = parseCostCsv("descricao;custo;sku\nMesa;100,00;M-1\n");
  assert.deepEqual(r.rows.map((x) => [x.code, x.cost]), [["M-1", 100]]);
});
