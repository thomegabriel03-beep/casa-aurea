import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, PageHeader } from "@/components/admin/ui";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { CopyButton } from "@/components/admin/CopyButton";

const PUBLIC_BUCKETS = ["produtos", "colecoes", "showroom", "institucional", "campanhas"];

export default async function MediaLibrary({ searchParams }: { searchParams: Promise<{ b?: string; pasta?: string }> }) {
  const sp = await searchParams;
  const bucket = PUBLIC_BUCKETS.includes(sp.b ?? "") ? sp.b! : "produtos";
  const folder = (sp.pasta ?? "").replace(/[^a-z0-9/_-]/gi, "");
  const { supabase } = await requireAdmin();
  const { data } = await supabase.storage.from(bucket).list(folder || undefined, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  const items = data ?? [];
  const url = (name: string) => supabase.storage.from(bucket).getPublicUrl(folder ? `${folder}/${name}` : name).data.publicUrl;
  return (
    <>
      <PageHeader title="Mídia" description="Arquivos gerenciáveis ficam no Supabase Storage, organizados por área." />
      <nav className="adm-tabs" aria-label="Áreas">
        {PUBLIC_BUCKETS.map((b) => <a key={b} href={`?b=${b}`} aria-current={b === bucket ? "page" : undefined}>{b}</a>)}
      </nav>
      <Card title={`Enviar para ${bucket}${folder ? `/${folder}` : ""}`}>
        <MediaUploader bucket={bucket} folder={folder || "geral"} label="Enviar arquivos" />
      </Card>
      <Card title={folder ? `/${folder}` : "Arquivos"}>
        {folder && <p style={{ marginBottom: ".75rem" }}><a href={`?b=${bucket}`} className="adm-note">← voltar</a></p>}
        {items.length === 0 ? <p className="adm-note">Vazio.</p> : (
          <div className="adm-media">
            {items.map((f) => f.id === null ? (
              <a key={f.name} href={`?b=${bucket}&pasta=${folder ? `${folder}/` : ""}${f.name}`} className="adm-card" style={{ textDecoration: "none" }}>📁 {f.name}</a>
            ) : (
              <figure key={f.name}>
                {/\.(mp4|webm)$/i.test(f.name)
                  ? <video src={url(f.name)} muted playsInline preload="metadata" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={url(f.name)} alt="" loading="lazy" />}
                <figcaption><span className="adm-note" style={{ overflowWrap: "anywhere" }}>{f.name}</span><CopyButton text={url(f.name)} /></figcaption>
              </figure>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
