import type { Metadata } from "next";
import Link from "next/link";
import { getProducts, getTypesWithProducts } from "@/lib/catalog/public-queries";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { Pager } from "@/components/catalog/Pager";
import { AcervoTeaser } from "@/components/catalog/AcervoTeaser";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Móveis",
  description: "Sofás, poltronas, mesas e cadeiras selecionados pela Casa Áurea pelo desenho, pela matéria e pela proporção.",
  alternates: { canonical: "/moveis" },
};

export default async function Moveis({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const page = Math.max(1, Number((await searchParams).p) || 1);
  const [types, { items, total }] = await Promise.all([getTypesWithProducts("moveis"), getProducts({ page })]);
  return (
    <div className="ca-wrap">
      <header className="ca-head">
        <p className="ca-eyebrow">Curadoria</p>
        <h1 className="ca-h1">Móveis</h1>
        <p className="ca-lead">Peças escolhidas pelo desenho, pela matéria e pela forma como conversam entre si.</p>
      </header>
      {types.length > 0 && (
        <nav className="ca-chips" aria-label="Tipos">
          <Link href="/moveis" aria-current="page">Todos</Link>
          {types.map((t) => <Link key={t.slug} href={`/moveis/${t.slug}`}>{t.plural}</Link>)}
        </nav>
      )}
      {items.length ? <ProductGrid items={items} /> : <p className="ca-empty">A seleção está sendo preparada. Enquanto isso, conheça o showroom ou fale com a equipe.</p>}
      <Pager page={page} total={total} base="/moveis" />
      <AcervoTeaser />
    </div>
  );
}
