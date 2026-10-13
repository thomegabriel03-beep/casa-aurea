import Link from "next/link";
import { countAcervo } from "@/lib/catalog/public-queries";

/** Convite ao fim da vitrine: a curadoria fica em destaque, mas todo o acervo liberado continua a um clique. */
export async function AcervoTeaser({ typeSlug, outdoor }: { typeSlug?: string; outdoor?: boolean }) {
  const total = await countAcervo(outdoor ? { outdoor: true } : typeSlug ? { typeSlug } : { section: "moveis" });
  if (!total) return null;
  const qs = new URLSearchParams();
  if (typeSlug) qs.set("tipo", typeSlug);
  if (outdoor) qs.set("ambiente", "externo");
  const href = `/acervo${qs.toString() ? `?${qs}` : ""}`;
  return (
    <section className="ca-acv-teaser">
      <p className="ca-eyebrow">Acervo completo</p>
      <p className="ca-h3">Além da vitrine, todo o acervo à disposição.</p>
      <p className="ca-lead">Todas as peças disponíveis para consulta, com filtros por tipo e material.</p>
      <p><Link className="ca-btn ca-btn-secondary" href={href}>Ver todo o acervo <span className="ca-acv-n">({total})</span></Link></p>
    </section>
  );
}
