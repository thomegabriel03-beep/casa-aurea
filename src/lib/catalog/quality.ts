import type { AdminProduct, QualityFlag } from "../../types/catalog-domain";

/** Pendências automáticas (mesma regra da view product_quality_auto). */
export function autoQualityFlags(p: AdminProduct): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (!(p.sources ?? []).some((s) => s.originalCode)) flags.push("missingOriginalCode");
  if (!(p.variants ?? []).some((v) => v.widthCm != null || v.diameterCm != null)) flags.push("missingDimensions");
  if (!(p.media ?? []).some((m) => m.isPrimary && (m.width ?? 0) >= 1600)) flags.push("missingHighQualityImage");
  if (!(p.materials ?? []).length) flags.push("missingMaterial");
  return flags;
}

const norm = (s?: string | null) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** Possível duplicidade: mesmo fornecedor + mesmo nome, ou mesmo fornecedor + mesmo código original.
 *  Apenas sinaliza; nunca mescla. */
export function possibleDuplicates(products: AdminProduct[]): [string, string, "same_supplier_name" | "same_original_code"][] {
  const out: [string, string, "same_supplier_name" | "same_original_code"][] = [];
  for (let i = 0; i < products.length; i++) for (let j = i + 1; j < products.length; j++) {
    const a = products[i], b = products[j];
    if (a.supplierId && a.supplierId === b.supplierId && norm(a.name) === norm(b.name)) out.push([a.id, b.id, "same_supplier_name"]);
    const codesA = new Set((a.sources ?? []).filter((s) => s.originalCode).map((s) => `${s.supplierId}|${s.originalCode}`));
    if ((b.sources ?? []).some((s) => s.originalCode && codesA.has(`${s.supplierId}|${s.originalCode}`))) out.push([a.id, b.id, "same_original_code"]);
  }
  return out;
}
