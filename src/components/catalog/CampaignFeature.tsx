import Link from "next/link";
import { getFeaturedCollection } from "@/lib/catalog/public-queries";
import "./catalog.css";

/** Entrada editorial da coleção em destaque (ex.: Natal). Some sozinha fora do período. */
export async function CampaignFeature() {
  const c = await getFeaturedCollection().catch(() => null);
  if (!c) return null;
  const lines = c.titleLines?.length ? c.titleLines : [c.name];
  return (
    <section className="ca-camp" aria-labelledby="campanha-t">
      <div className="ca-wrap ca-camp-grid">
        {c.coverImage && (
          <Link href={`/colecoes/${c.slug}`} className="ca-camp-pic" aria-label={`Explorar a coleção ${c.name}`}>
            <div className="ca-ph">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.coverImage} alt="" loading="lazy" style={{ objectPosition: c.coverPosition ?? "50% 40%" }} />
            </div>
          </Link>
        )}
        <div className="ca-camp-txt">
          {c.eyebrow && <p className="ca-eyebrow">{c.eyebrow}</p>}
          <h2 id="campanha-t" className="ca-h2">{lines.map((l, i) => <span key={i} style={{ display: "block" }}>{l}</span>)}</h2>
          {c.subtitle && <p className="ca-lead">{c.subtitle}</p>}
          <Link className="ca-link" href={`/colecoes/${c.slug}`}>Explorar a coleção →</Link>
        </div>
      </div>
    </section>
  );
}
