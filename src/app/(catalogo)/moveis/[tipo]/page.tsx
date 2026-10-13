import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProducts, getTypeBySlug, getTypesWithProducts } from "@/lib/catalog/public-queries";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { Pager } from "@/components/catalog/Pager";
import { AcervoTeaser } from "@/components/catalog/AcervoTeaser";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ tipo: string }> }): Promise<Metadata> {
  const t = await getTypeBySlug((await params).tipo);
  if (!t) return {};
  return { title: t.plural, description: `${t.plural} selecionados pela Casa Áurea, em Tijucas, SC.`, alternates: { canonical: `/moveis/${t.slug}` } };
}

export default async function TypePage({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: Promise<{ p?: string }> }) {
  const { tipo } = await params;
  const page = Math.max(1, Number((await searchParams).p) || 1);
  const t = await getTypeBySlug(tipo);
  if (!t) notFound();
  const [types, { items, total }] = await Promise.all([getTypesWithProducts(t.section), getProducts({ typeSlug: t.slug, page })]);
  return (
    <div className="ca-wrap">
      <header className="ca-head">
        <p className="ca-eyebrow"><Link href="/moveis" style={{ textDecoration: "none" }}>Móveis</Link></p>
        <h1 className="ca-h1">{t.plural}</h1>
      </header>
      {types.length > 1 && (
        <nav className="ca-chips" aria-label="Tipos">
          <Link href="/moveis">Todos</Link>
          {types.map((x) => <Link key={x.slug} href={`/moveis/${x.slug}`} aria-current={x.slug === t.slug ? "page" : undefined}>{x.plural}</Link>)}
        </nav>
      )}
      {items.length ? <ProductGrid items={items} /> : <p className="ca-empty">Ainda não há peças publicadas nesta seleção.</p>}
      <Pager page={page} total={total} base={`/moveis/${t.slug}`} />
      <AcervoTeaser typeSlug={t.slug} />
    </div>
  );
}
