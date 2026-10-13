import type { Metadata } from "next";
import { getProducts } from "@/lib/catalog/public-queries";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { Pager } from "@/components/catalog/Pager";
import { AcervoTeaser } from "@/components/catalog/AcervoTeaser";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Outdoor",
  description: "Peças da Casa Áurea pensadas para varandas, jardins e áreas externas.",
  alternates: { canonical: "/outdoor" },
};

export default async function Outdoor({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const page = Math.max(1, Number((await searchParams).p) || 1);
  const { items, total } = await getProducts({ outdoor: true, page });
  return (
    <div className="ca-wrap">
      <header className="ca-head">
        <p className="ca-eyebrow">Áreas externas</p>
        <h1 className="ca-h1">Outdoor</h1>
        <p className="ca-lead">Materiais e desenhos escolhidos para viver o lado de fora da casa.</p>
      </header>
      {items.length ? <ProductGrid items={items} /> : <p className="ca-empty">A seleção outdoor está sendo preparada.</p>}
      <Pager page={page} total={total} base="/outdoor" />
      <AcervoTeaser outdoor />
    </div>
  );
}
