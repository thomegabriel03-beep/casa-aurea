import type { AdminProduct, PublicProduct } from "../../types/catalog-domain";

/** Serializa SOMENTE campos públicos. Fornecedor, catálogo, códigos originais, notas e preços de custo
 *  nunca saem daqui, mesmo que estejam no objeto recebido. Retorna null para peças não públicas. */
export function toPublicProduct(p: AdminProduct): PublicProduct | null {
  if (p.visibility !== "public") return null;
  const media = [...(p.media ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.order - b.order);
  const num = (v?: number | null) => (v == null ? undefined : v);
  const desc = p.editorialDescription || p.description || null;
  return {
    publicCode: p.publicCode ?? null,
    name: p.name,
    slug: p.slug,
    shortDescription: p.shortDescription ?? null,
    description: desc,
    type: p.type ? { code: p.type.code, name: p.type.name, slug: p.type.slug } : null,
    subtype: p.subtype ? { name: p.subtype.name, slug: p.subtype.slug } : null,
    environment: p.environment,
    curationTier: p.curationTier,
    isConfigurable: p.isConfigurable,
    designer: p.designer ?? null,
    variants: [...(p.variants ?? [])].sort((a, b) => a.order - b.order).map((v) => ({
      code: v.variantCode ?? null, name: v.name,
      ...(v.widthCm != null && { widthCm: num(v.widthCm) }), ...(v.heightCm != null && { heightCm: num(v.heightCm) }),
      ...(v.depthCm != null && { depthCm: num(v.depthCm) }), ...(v.diameterCm != null && { diameterCm: num(v.diameterCm) }),
      ...(v.configuration && { configuration: v.configuration }),
    })),
    media: media.map((m) => ({
      type: m.type, url: m.url, alt: m.alt || p.name,
      ...(m.width && { width: m.width }), ...(m.height && { height: m.height }),
      ...(m.focalPoint && { focalPoint: m.focalPoint }), ...(m.posterUrl && { posterUrl: m.posterUrl }),
    })),
    materials: (p.materials ?? []).map((m) => m.name),
    finishes: (p.finishes ?? []).map((f) => f.name),
    seo: {
      title: p.seoTitle || `${p.name}${p.publicCode ? ` · ${p.publicCode}` : ""} — Casa Áurea`,
      description: p.seoDescription || p.shortDescription || null,
      image: p.ogImage || media[0]?.url || null,
    },
  };
}
