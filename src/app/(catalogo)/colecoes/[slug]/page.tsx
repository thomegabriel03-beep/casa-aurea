import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCollection, getCollectionProducts } from "@/lib/catalog/public-queries";
import { getContact } from "@/lib/catalog/contact";
import { whatsappUrl } from "@/lib/catalog/whatsapp";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { Pager } from "@/components/catalog/Pager";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCollection((await params).slug);
  if (!c || !c.isLive) return { robots: { index: false } };
  const image = c.ogImage ?? c.coverImage;
  return {
    title: c.seoTitle ?? c.name,
    description: c.seoDescription ?? c.subtitle ?? undefined,
    alternates: { canonical: `/colecoes/${c.slug}` },
    openGraph: { title: c.seoTitle ?? c.name, description: c.seoDescription ?? c.subtitle ?? undefined, images: image ? [image] : undefined },
  };
}

/** Coleções editoriais, inclusive /colecoes/natal. Fora do período a coleção sai do ar (sem apagar nada). */
export default async function CollectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ p?: string }> }) {
  const { slug } = await params;
  const page = Math.max(1, Number((await searchParams).p) || 1);
  const c = await getCollection(slug);
  if (!c || !c.isLive) notFound();
  const [{ items, total }, contact] = await Promise.all([getCollectionProducts(c.id, page), getContact()]);
  const lines = c.titleLines?.length ? c.titleLines : [c.name];
  const msg = `Olá, Casa Áurea.\n\nGostaria de conversar sobre a coleção ${c.name}.\n\n${contact.siteUrl}/colecoes/${c.slug}`;
  return (
    <>
      <header className="ca-hero">
        {c.coverImage && (
          <picture>
            {c.mobileCoverImage && <source media="(max-width: 767px)" srcSet={c.mobileCoverImage} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.coverImage} alt="" fetchPriority="high" style={{ objectPosition: c.coverPosition ?? "50% 40%" }} />
          </picture>
        )}
        <div className="ca-wrap">
          {c.eyebrow && <p className="ca-eyebrow">{c.eyebrow}</p>}
          <h1 className="ca-h1">{lines.map((l, i) => <span key={i}>{l}</span>)}</h1>
          {c.subtitle && <p className="ca-lead">{c.subtitle}</p>}
        </div>
      </header>
      <div className="ca-wrap">
        <div style={{ padding: "clamp(3.5rem,7vw,6rem) 0 clamp(3rem,5vw,4.5rem)", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "2rem", alignItems: "flex-end" }}>
          {c.description && <p className="ca-lead" style={{ color: "var(--color-ink)" }}>{c.description}</p>}
          <p className="ca-type">{total} {total === 1 ? "peça" : "peças"}</p>
        </div>
        {items.length ? <ProductGrid items={items} /> : <p className="ca-empty">As peças desta coleção estão sendo preparadas.</p>}
        <Pager page={page} total={total} base={`/colecoes/${c.slug}`} />
        {contact.whatsapp && (
          <section style={{ borderTop: "1px solid var(--color-sand)", padding: "3.5rem 0 7rem", maxWidth: "40rem" }}>
            <p className="ca-h2" style={{ fontSize: "clamp(1.75rem,3vw,2.5rem)" }}>Para a sua temporada.</p>
            <p className="ca-lead" style={{ marginTop: "1rem" }}>Consulte a disponibilidade das peças e converse com a equipe sobre o seu espaço.</p>
            <p style={{ marginTop: "2rem" }}><a className="ca-btn" href={whatsappUrl(contact.whatsapp, msg)} target="_blank" rel="noopener noreferrer">Conversar sobre a coleção</a></p>
          </section>
        )}
      </div>
    </>
  );
}
