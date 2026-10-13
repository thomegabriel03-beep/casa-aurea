import type { Metadata } from "next";
import Link from "next/link";
import { getLiveCollections } from "@/lib/catalog/public-queries";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Coleções",
  description: "Coleções permanentes e de temporada da Casa Áurea, reunidas pelo mesmo olhar.",
  alternates: { canonical: "/colecoes" },
};

export default async function Collections() {
  const list = await getLiveCollections();
  return (
    <div className="ca-wrap">
      <header className="ca-head">
        <p className="ca-eyebrow">Coleções</p>
        <h1 className="ca-h1">Seleções da Casa Áurea.</h1>
        <p className="ca-lead">Coleções permanentes e de temporada, reunidas pelo mesmo olhar.</p>
      </header>
      {list.length === 0 ? <p className="ca-empty">Novas coleções em preparação.</p> : (
        <ul className="ca-grid">
          {list.map((c, i) => (
            <li key={c.id} className="ca-card ca-reveal">
              <Link href={`/colecoes/${c.slug}`}>
                <div className="ca-ph">
                  {c.coverImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.coverImage} alt="" loading={i < 2 ? "eager" : "lazy"} style={{ objectPosition: c.coverPosition ?? "50% 50%" }} />
                  )}
                </div>
                {c.eyebrow && <p className="ca-type" style={{ marginTop: "1rem" }}>{c.eyebrow}</p>}
                <h2 className="ca-name" style={{ marginTop: ".4rem" }}>{c.name}</h2>
                {c.subtitle && <p className="ca-type" style={{ textTransform: "none", letterSpacing: 0, fontSize: ".9375rem" }}>{c.subtitle}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
