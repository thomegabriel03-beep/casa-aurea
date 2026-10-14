import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { getFicha } from "@/lib/catalog/ficha";

/* Ficha de apresentação em página própria (link direto). Na lista de produtos ela abre em janela. */
export const dynamic = "force-dynamic";

export default async function Apresentar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ foto?: string; de?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const f = await getFicha(supabase, id);
  if (!f) notFound();
  const i = Math.min(Math.max(0, Number(sp.foto) || 0), Math.max(0, f.photos.length - 1));
  const back = sp.de && sp.de.startsWith("/admin") ? sp.de : `/admin/produtos/${id}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`Casa Áurea · ${f.name}${f.code ? ` (${f.code})` : ""}`)}`;
  const de = sp.de ? `&de=${encodeURIComponent(sp.de)}` : "";

  return (
    <main className="apr">
      <div className="apr-bar">
        <Link className="apr-back" href={back}>← Voltar ao painel</Link>
        <span className="apr-brand">CASA ÁUREA</span>
        <a className="apr-wa" href={wa} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
      </div>
      <article className="apr-card">
        <div className="apr-media">
          {f.photos.length ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="apr-main" src={f.photos[i].url} alt={f.photos[i].alt} />
              {f.photos.length > 1 && (
                <nav className="apr-thumbs" aria-label="Fotos da peça">
                  {f.photos.map((m, k) => (
                    <Link key={m.url + k} href={`?foto=${k}${de}`} aria-current={k === i ? "true" : undefined} scroll={false}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt={`Foto ${k + 1}`} loading="lazy" />
                    </Link>
                  ))}
                </nav>
              )}
            </>
          ) : (
            <div className="apr-nophoto">Sem foto</div>
          )}
        </div>
        <div className="apr-info">
          {f.type && <p className="apr-eyebrow">{f.type}{f.outdoor ? " · área externa" : ""}</p>}
          <h1>{f.name}</h1>
          {f.code && <p className="apr-code">{f.code}</p>}
          {f.text && <p className="apr-desc">{f.text}</p>}
          <dl className="apr-specs">
            {f.sizes.length > 0 && <div><dt>{f.sizes.length > 1 ? "Medidas" : "Medida"}</dt><dd>{f.sizes.map((s, k) => <span key={k}>{s}</span>)}</dd></div>}
            {f.materials.length > 0 && <div><dt>Materiais</dt><dd>{f.materials.join(", ")}</dd></div>}
            {f.finishes.length > 0 && <div><dt>Acabamentos</dt><dd>{f.finishes.join(", ")}</dd></div>}
            {f.designer && <div><dt>Design</dt><dd>{f.designer}</dd></div>}
          </dl>
          <p className="apr-note">Medidas, tecidos e acabamentos podem ser ajustados sob encomenda. Valores e prazos sob consulta.</p>
        </div>
      </article>
    </main>
  );
}
