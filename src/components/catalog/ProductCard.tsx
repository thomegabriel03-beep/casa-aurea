import Link from "next/link";
import type { CardProduct } from "@/lib/catalog/public-queries";
import { formatPrice } from "./format";

/** Cartão editorial: foto protagonista, nome, código Casa Áurea e tipo. Sem fornecedor, sem selos. */
export function ProductCard({ p, priority = false }: { p: CardProduct; priority?: boolean }) {
  return (
    <li className="ca-card ca-reveal">
      <Link href={`/produto/${p.slug}`}>
        <div className="ca-ph">
          {p.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image.url} alt={p.image.alt} loading={priority ? "eager" : "lazy"} decoding="async"
              style={p.image.focalPoint ? { objectPosition: p.image.focalPoint } : undefined} />
          )}
        </div>
        <div className="ca-meta">
          <h3 className="ca-name">{p.name}</h3>
          {p.publicCode && <span className="ca-code">{p.publicCode}</span>}
        </div>
        {(p.subtypeName || p.typeName) && <p className="ca-type">{p.subtypeName ? `${p.typeName ?? ""} · ${p.subtypeName}` : p.typeName}</p>}
        {p.price != null && <p className="ca-price"><small>A partir de</small> {formatPrice(p.price)}</p>}
      </Link>
    </li>
  );
}

export function ProductGrid({ items }: { items: CardProduct[] }) {
  return <ul className="ca-grid">{items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} />)}</ul>;
}
