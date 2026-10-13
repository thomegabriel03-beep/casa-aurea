import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/catalog/public-queries";
import { getContact } from "@/lib/catalog/contact";
import { consultPieceMessage, whatsappUrl } from "@/lib/catalog/whatsapp";
import { formatCm, formatPrice } from "@/components/catalog/format";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return { robots: { index: false } };
  const title = p.seoTitle ?? `${p.name}${p.publicCode ? ` · ${p.publicCode}` : ""}`;
  const description = p.seoDescription ?? p.shortDescription ?? undefined;
  const image = p.ogImage ?? p.media[0]?.url;
  return { title, description, alternates: { canonical: `/produto/${p.slug}` }, openGraph: { title, description, images: image ? [image] : undefined } };
}

const dims = (v: { widthCm: number | null; heightCm: number | null; depthCm: number | null; diameterCm: number | null }) =>
  [v.widthCm && `L ${formatCm(v.widthCm)}`, v.depthCm && `P ${formatCm(v.depthCm)}`, v.heightCm && `A ${formatCm(v.heightCm)}`, v.diameterCm && `Ø ${formatCm(v.diameterCm)}`].filter(Boolean).join(" × ");

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p, contact] = await Promise.all([getProduct(slug), getContact()]);
  if (!p) notFound();
  const url = `${contact.siteUrl}/produto/${p.slug}`;
  const priced = p.variants.some((v) => v.price != null);
  const measured = p.variants.some((v) => dims(v));
  const jsonLd = p.media.length ? {
    "@context": "https://schema.org", "@type": "Product", name: p.name, url, image: p.media.filter((m) => m.type !== "video").map((m) => m.url),
    brand: { "@type": "Brand", name: "Casa Áurea" }, ...(p.publicCode && { sku: p.publicCode }), ...(p.description && { description: p.description }),
    ...(p.price != null && { offers: { "@type": "Offer", priceCurrency: "BRL", price: Number(p.salePrice ?? p.price).toFixed(2), url } }),
  } : null;

  return (
    <div className="ca-wrap">
      <article className="ca-pd">
        <div className="ca-gal" aria-label="Imagens da peça">
          {p.media.length === 0 && <div className="ca-ph" />}
          {p.media.map((m, i) => (
            <div key={m.url} className="ca-ph" style={m.width && m.height ? { aspectRatio: `${m.width}/${m.height}` } : undefined}>
              {m.type === "video"
                ? <video src={m.url} poster={m.posterUrl ?? undefined} muted playsInline loop controls preload="none" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={m.url} alt={m.alt} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} style={m.focalPoint ? { objectPosition: m.focalPoint } : undefined} />}
            </div>
          ))}
        </div>

        <div className="ca-pd-info">
          {p.typeName && <p className="ca-eyebrow">{p.typeSlug ? <Link href={`/moveis/${p.typeSlug}`} style={{ textDecoration: "none" }}>{p.typeName}</Link> : p.typeName}{p.subtypeName ? ` · ${p.subtypeName}` : ""}</p>}
          <h1>{p.name}</h1>
          {p.publicCode && <p className="ca-pd-code">{p.publicCode}</p>}
          {(p.description || p.shortDescription) && <p className="ca-pd-desc">{p.description ?? p.shortDescription}</p>}
          {p.price != null && !priced && <p className="ca-price" style={{ marginTop: "1.25rem" }}>{formatPrice(p.salePrice ?? p.price)}</p>}

          <dl className="ca-specs">
            {p.materials.length > 0 && <div><dt>Materiais</dt><dd>{p.materials.join(", ")}</dd></div>}
            {p.finishes.length > 0 && <div><dt>Acabamentos</dt><dd>{p.finishes.join(", ")}</dd></div>}
            {p.designer && <div><dt>Design</dt><dd>{p.designer}</dd></div>}
            {p.availability && <div><dt>Disponibilidade</dt><dd>{p.availability}</dd></div>}
            {p.environment !== "indoor" && <div><dt>Ambiente</dt><dd>{p.environment === "outdoor" ? "Áreas externas" : "Internas e externas"}</dd></div>}
            {p.collections.length > 0 && <div><dt>Coleções</dt><dd>{p.collections.map((c, i) => <span key={c.slug}>{i ? ", " : ""}<Link href={`/colecoes/${c.slug}`}>{c.name}</Link></span>)}</dd></div>}
          </dl>

          {p.variants.length > 0 && (priced || measured) && (
            <table className="ca-vtab">
              <caption>{priced ? "Opções e valores" : "Medidas disponíveis"}</caption>
              <tbody>{p.variants.map((v) => (
                <tr key={v.code ?? v.name}><th scope="row">{v.name}{v.configuration ? ` · ${v.configuration}` : ""}</th><td>{[dims(v), v.price != null ? formatPrice(v.price) : ""].filter(Boolean).join(" · ")}</td></tr>
              ))}</tbody>
            </table>
          )}
          {p.variants.length > 0 && !priced && !measured && (
            <dl className="ca-specs" style={{ marginTop: 0, borderTop: 0 }}><div><dt>Configurações</dt><dd>{p.variants.map((v) => v.name).join(", ")}</dd></div></dl>
          )}

          <div className="ca-pd-cta">
            {contact.whatsapp && (
              <a className="ca-btn" href={whatsappUrl(contact.whatsapp, consultPieceMessage(p, url))} target="_blank" rel="noopener noreferrer">Consultar peça</a>
            )}
            <Link className="ca-link" href="/#showroom">Ver no showroom</Link>
          </div>
          <p className="ca-pd-note">Medidas, acabamentos e configurações são confirmados com a equipe no atendimento.</p>
        </div>
      </article>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
    </div>
  );
}
