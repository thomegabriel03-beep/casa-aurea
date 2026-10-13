import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPublicCode, formatVariantCode, parsePublicCode, baseCodeOf, isPublicCode } from "../src/lib/catalog/codes";
import { productSlug } from "../src/lib/catalog/slug";
import { toPublicProduct } from "../src/lib/catalog/public-dto";
import { consultPieceMessage } from "../src/lib/catalog/whatsapp";
import { autoQualityFlags, possibleDuplicates } from "../src/lib/catalog/quality";
import { parseAdminQuery } from "../src/lib/catalog/admin-query";
import type { AdminProduct } from "../src/types/catalog-domain";

test("código Casa Áurea: formato, variante, leitura", () => {
  assert.equal(formatPublicCode("SOF", 27), "CA-SOF-0027");
  assert.equal(formatPublicCode("MES", 12345), "CA-MES-12345");
  assert.equal(formatVariantCode("CA-SOF-0027", 3), "CA-SOF-0027-V03");
  assert.deepEqual(parsePublicCode(" ca-pol-0001 "), { typeCode: "POL", seq: 1 });
  assert.equal(baseCodeOf("CA-SOF-0027-V02"), "CA-SOF-0027");
  assert.equal(isPublicCode("CA-F03-SOF-001"), false); // fornecedor nunca entra no código
  assert.throws(() => formatPublicCode("SO", 1));
  assert.throws(() => formatPublicCode("SOF", 0));
  assert.throws(() => formatVariantCode("SOF-0027", 1));
});

test("slug público com código", () => {
  assert.equal(productSlug("Sofá Moss", "CA-SOF-0027"), "sofa-moss-ca-sof-0027");
  assert.equal(productSlug("Árvore Áurea Esmeralda"), "arvore-aurea-esmeralda");
});

const base: AdminProduct = {
  id: "p1", publicCode: "CA-SOF-0027", name: "Sofá Moss", slug: "sofa-moss-ca-sof-0027", environment: "indoor",
  statusCommercial: "active", visibility: "public", curationTier: "curated", isConfigurable: true, featured: false, order: 1,
  supplierId: "sup-1", internalNotes: "margem especial", collectionNameOriginal: "Linha X",
  type: { id: "t", code: "SOF", name: "Sofá", slug: "sofas", order: 1, active: true },
  variants: [
    { id: "v2", productId: "p1", variantCode: "CA-SOF-0027-V02", seq: 2, name: "240 cm", widthCm: 240, supplierVariantCode: "PIR-240", price: 9999, commercialStatus: "active", order: 2 },
    { id: "v1", productId: "p1", variantCode: "CA-SOF-0027-V01", seq: 1, name: "220 cm", widthCm: 220, supplierVariantCode: "PIR-220", commercialStatus: "active", order: 1 },
  ],
  media: [{ type: "gallery", url: "b.jpg", order: 2, isPrimary: false }, { type: "primary", url: "a.jpg", width: 2400, order: 1, isPrimary: true }],
  materials: [{ id: "m", name: "Couro", slug: "couro" }],
  sources: [{ id: "s", productId: "p1", supplierId: "sup-1", originalCode: "PIR-001", page: "42" }],
};

test("DTO público não vaza dados internos", () => {
  const pub = toPublicProduct(base)!;
  const json = JSON.stringify(pub);
  for (const secret of ["sup-1", "margem", "PIR-", "9999", "Linha X", "supplier", "internal"]) assert.ok(!json.includes(secret), `vazou: ${secret}`);
  assert.equal(pub.variants[0].name, "220 cm"); // ordenadas
  assert.equal(pub.media[0].url, "a.jpg");     // principal primeiro
  assert.equal(pub.seo.title, "Sofá Moss · CA-SOF-0027 — Casa Áurea");
});

test("só peças públicas chegam ao site", () => {
  for (const v of ["internal", "hidden", "archived"] as const) assert.equal(toPublicProduct({ ...base, visibility: v }), null);
});

test("mensagem do WhatsApp usa o código Casa Áurea", () => {
  assert.equal(
    consultPieceMessage(base, "https://casaaurea.com.br/produto/sofa-moss-ca-sof-0027"),
    "Olá, Casa Áurea.\n\nGostaria de saber mais sobre esta peça:\n\nSofá Moss\nCódigo: CA-SOF-0027\n\nhttps://casaaurea.com.br/produto/sofa-moss-ca-sof-0027\n\nQuero entender disponibilidade e opções.",
  );
});

test("pendências de qualidade e duplicidade", () => {
  assert.deepEqual(autoQualityFlags(base), []);
  const raw: AdminProduct = { ...base, id: "p2", publicCode: null, variants: [], media: [], materials: [], sources: [] };
  assert.deepEqual(autoQualityFlags(raw), ["missingOriginalCode", "missingDimensions", "missingHighQualityImage", "missingMaterial"]);
  const dup = possibleDuplicates([base, { ...base, id: "p3", name: "sofa moss" }]);
  assert.deepEqual(dup.map((d) => d[2]).sort(), ["same_original_code", "same_supplier_name"]);
});

test("busca do admin reconhece código de variante", () => {
  assert.deepEqual(parseAdminQuery("ca-sof-0027-v02 couro"), { code: "CA-SOF-0027", terms: ["ca-sof-0027-v02", "couro"] });
  assert.deepEqual(parseAdminQuery("Pirâmide travertino"), { code: null, terms: ["piramide", "travertino"] });
});

import { parseCatalogCsv } from "../src/lib/catalog/import-parse";

test("importação: colunas em português, listas, preços, erros por linha", () => {
  const csv = [
    "nome;tipo;fornecedor;catalogo;ano;pagina;codigo_original;materiais;variacoes;ambiente",
    'Sofá Moss;sof;Estofados Pirâmide;Linha 2026;2026;42;PIR-001;Linho|Madeira maciça;220 cm=9.800,00|240 cm;externo',
    '"Mesa ""Orgânica""; centro";MES;Heitor Móveis;ABIMAD 42;2026;12;;;;',
    ";SOF;;;;;;;;",
    "Item;SOFA;;;;;;;;",
  ].join("\n");
  const r = parseCatalogCsv(csv);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.errors, ["linha 4: sem nome", "linha 5: tipo deve ter 3 letras (ex.: SOF)"]);
  const a = r.rows[0];
  assert.equal(a.typeCode, "SOF");
  assert.equal(a.environment, "outdoor");
  assert.deepEqual(a.materials, ["Linho", "Madeira maciça"]);
  assert.deepEqual(a.variants, [{ name: "220 cm", price: 9800 }, { name: "240 cm" }]);
  assert.equal(r.rows[1].name, 'Mesa "Orgânica"; centro');
});
