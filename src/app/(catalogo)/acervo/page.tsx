import type { Metadata } from "next";
import Link from "next/link";
import { getAcervo, getAcervoMaterials, getAcervoTypes } from "@/lib/catalog/public-queries";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { Pager } from "@/components/catalog/Pager";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Acervo completo",
  description: "Todas as peças da Casa Áurea disponíveis para consulta, em Tijucas, SC: sofás, poltronas, mesas, cadeiras e áreas externas.",
  alternates: { canonical: "/acervo" },
};

type SP = { tipo?: string; material?: string; ambiente?: string; p?: string };

function href(sp: SP, key: keyof SP, value: string) {
  const n: SP = { tipo: sp.tipo, material: sp.material, ambiente: sp.ambiente };
  n[key] = n[key] === value ? undefined : value;
  if (key === "tipo" && value === "") n.tipo = undefined;
  const qs = new URLSearchParams(Object.entries(n).filter(([, v]) => v) as [string, string][]).toString();
  return `/acervo${qs ? `?${qs}` : ""}`;
}

export default async function Acervo({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.p) || 1);
  const [types, materials, { items, total }] = await Promise.all([
    getAcervoTypes("moveis"),
    getAcervoMaterials(),
    getAcervo({ typeSlug: sp.tipo, material: sp.material, outdoor: sp.ambiente === "externo", page }),
  ]);
  const baseQs = new URLSearchParams(Object.entries({ tipo: sp.tipo, material: sp.material, ambiente: sp.ambiente }).filter(([, v]) => v) as [string, string][]).toString();
  const base = `/acervo${baseQs ? `?${baseQs}` : ""}`;
  const filtered = Boolean(sp.tipo || sp.material || sp.ambiente);
  return (
    <div className="ca-wrap">
      <header className="ca-head">
        <p className="ca-eyebrow">Acervo completo</p>
        <h1 className="ca-h1">Todo o acervo.</h1>
        <p className="ca-lead">Todas as peças disponíveis para consulta, além da seleção da vitrine. Filtre por tipo, material e ambiente.</p>
      </header>
      <div className="ca-acv-f">
        <nav className="ca-chips" aria-label="Tipo">
          <Link href={href(sp, "tipo", "")} aria-current={!sp.tipo ? "page" : undefined}>Todos</Link>
          {types.map((t) => <Link key={t.slug} href={href(sp, "tipo", t.slug)} aria-current={sp.tipo === t.slug ? "page" : undefined}>{t.plural}</Link>)}
          <Link href={href(sp, "ambiente", "externo")} aria-current={sp.ambiente === "externo" ? "page" : undefined}>Área externa</Link>
        </nav>
        {materials.length > 0 && (
          <nav className="ca-chips ca-chips-sub" aria-label="Material">
            <span>Material</span>
            {materials.map((m) => <Link key={m} href={href(sp, "material", m)} aria-current={sp.material === m ? "page" : undefined}>{m}</Link>)}
          </nav>
        )}
        <p className="ca-acv-count">{total} {total === 1 ? "peça" : "peças"}{filtered && <> · <Link href="/acervo">Limpar filtros</Link></>}</p>
      </div>
      {items.length ? <ProductGrid items={items} /> : <p className="ca-empty">Nenhuma peça com essa combinação. Fale com a equipe: podemos encomendar ou desenvolver a peça.</p>}
      <Pager page={page} total={total} base={base} />
    </div>
  );
}
