import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Badge, Card, Field, Notice, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { addProductsByCode, saveCollection, saveCollectionProducts } from "../actions";

const str = (v: unknown) => (v == null ? "" : String(v));

export default async function CollectionEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: c } = await supabase.from("collections").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const { data: links } = await supabase.from("product_collections")
    .select("product_id, sort_order, products(name, public_code, visibility, curation_tier)").eq("collection_id", id).order("sort_order");

  return (
    <>
      <PageHeader title={c.name} description={`/colecoes/${c.slug}`}>
        {c.active && <Link className="adm-btn ghost sm" href={`/colecoes/${c.slug}`} target="_blank">Ver no site</Link>}
      </PageHeader>
      {sp.ok && <Notice kind="ok">Alterações salvas.</Notice>}
      {sp.erro && <Notice kind="bad">{sp.erro}</Notice>}

      <Card title="Apresentação">
        <form action={saveCollection.bind(null, id)} className="adm-grid c2">
          <Field label="Nome"><input type="text" name="name" defaultValue={c.name} required /></Field>
          <Field label="Slug"><input type="text" name="slug" defaultValue={c.slug} /></Field>
          <Field label="Sobretítulo"><input type="text" name="eyebrow" defaultValue={str(c.eyebrow)} /></Field>
          <Field label="Título em linhas (uma por linha)"><textarea name="title_lines" defaultValue={(c.title_lines ?? []).join("\n")} style={{ minHeight: "4rem" }} /></Field>
          <div style={{ gridColumn: "1/-1" }}><Field label="Subtítulo"><input type="text" name="subtitle" defaultValue={str(c.subtitle)} /></Field></div>
          <div style={{ gridColumn: "1/-1" }}><Field label="Descrição"><textarea name="description" defaultValue={str(c.description)} /></Field></div>
          <Field label="Capa (URL)" hint="Envie abaixo e cole o endereço."><input type="url" name="cover_image" defaultValue={str(c.cover_image)} /></Field>
          <Field label="Capa no celular (URL)"><input type="url" name="mobile_cover_image" defaultValue={str(c.mobile_cover_image)} /></Field>
          <Field label="Foco da capa" hint="Ex.: 50% 30% mantém o topo"><input type="text" name="cover_position" defaultValue={str(c.cover_position)} /></Field>
          <Field label="Ordem"><input type="number" name="sort_order" defaultValue={str(c.sort_order)} /></Field>
          <Field label="Início da campanha"><input type="date" name="start_date" defaultValue={str(c.start_date)} /></Field>
          <Field label="Fim da campanha"><input type="date" name="end_date" defaultValue={str(c.end_date)} /></Field>
          <label className="adm-check"><input type="checkbox" name="active" defaultChecked={c.active} /> Ativa</label>
          <label className="adm-check"><input type="checkbox" name="featured" defaultChecked={c.featured} /> Destaque (Home e menu, dentro do período)</label>
          <details style={{ gridColumn: "1/-1" }}>
            <summary className="adm-note" style={{ cursor: "pointer" }}>Storytelling e SEO (preparado para experiências futuras)</summary>
            <div className="adm-grid c2" style={{ marginTop: "1rem" }}>
              <Field label="Headline"><input type="text" name="headline" defaultValue={str(c.headline)} /></Field>
              <Field label="Tema"><select name="theme" defaultValue={str(c.theme)}><option value="">Padrão</option><option value="light">Claro</option><option value="dark">Escuro</option></select></Field>
              <div style={{ gridColumn: "1/-1" }}><Field label="Manifesto"><textarea name="manifesto" defaultValue={str(c.manifesto)} /></Field></div>
              <label className="adm-check"><input type="checkbox" name="story_enabled" defaultChecked={c.story_enabled} /> Story habilitada</label>
              <Field label="Tipo de story"><select name="story_type" defaultValue={str(c.story_type)}><option value="">—</option><option value="video_scroll">Vídeo pelo scroll</option><option value="frame_sequence">Sequência de frames</option><option value="sticky_story">Sticky storytelling</option></select></Field>
              <Field label="Mídia story desktop (URL)"><input type="url" name="story_desktop_media" defaultValue={str(c.story_desktop_media)} /></Field>
              <Field label="Mídia story mobile (URL)"><input type="url" name="story_mobile_media" defaultValue={str(c.story_mobile_media)} /></Field>
              <Field label="Altura da story"><input type="text" name="story_height" defaultValue={str(c.story_height)} placeholder="600vh" /></Field>
              <Field label="Hero (URL)"><input type="url" name="hero_media" defaultValue={str(c.hero_media)} /></Field>
              <Field label="Hero mobile (URL)"><input type="url" name="hero_mobile_media" defaultValue={str(c.hero_mobile_media)} /></Field>
              <Field label="Poster (URL)"><input type="url" name="poster_image" defaultValue={str(c.poster_image)} /></Field>
              <Field label="Título SEO"><input type="text" name="seo_title" defaultValue={str(c.seo_title)} /></Field>
              <Field label="Imagem de compartilhamento (URL)"><input type="url" name="og_image" defaultValue={str(c.og_image)} /></Field>
              <div style={{ gridColumn: "1/-1" }}><Field label="Meta description"><input type="text" name="seo_description" defaultValue={str(c.seo_description)} /></Field></div>
            </div>
          </details>
          <div className="adm-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Salvar coleção</SubmitButton></div>
        </form>
      </Card>

      <Card title="Imagens da coleção">
        <MediaUploader bucket="colecoes" folder={c.slug} label="Enviar imagem" accept="image/*,video/mp4,video/webm" />
        <p className="adm-note" style={{ marginTop: ".5rem" }}>Após o envio, copie o endereço em Mídia → colecoes e cole no campo de capa.</p>
      </Card>

      <Card title={`Peças da coleção (${(links ?? []).length})`}>
        <form action={addProductsByCode.bind(null, id)} className="adm-actions" style={{ marginTop: 0, marginBottom: "1rem" }}>
          <input type="text" name="codes" placeholder="Adicionar por código: CA-SOF-0001, CA-MES-0003" aria-label="Códigos" style={{ maxWidth: "28rem" }} />
          <SubmitButton variant="ghost">Adicionar</SubmitButton>
        </form>
        {(links ?? []).length === 0 ? <p className="adm-note">Nenhuma peça. Adicione pelo código ou pela aba Coleções do produto.</p> : (
          <form action={saveCollectionProducts.bind(null, id)}>
            <div className="adm-table-wrap"><table className="adm-table">
              <thead><tr><th>Manter</th><th>Ordem</th><th>Código</th><th>Peça</th><th>Visibilidade</th><th>Curadoria</th></tr></thead>
              <tbody>{(links ?? []).map((l: { product_id: string; sort_order: number; products: { name: string; public_code: string | null; visibility: string; curation_tier: string } | null }) => (
                <tr key={l.product_id}>
                  <td><input type="checkbox" name="keep" value={l.product_id} defaultChecked aria-label="Manter na coleção" /></td>
                  <td><input type="number" name={`order_${l.product_id}`} defaultValue={l.sort_order} style={{ width: "5rem" }} aria-label="Ordem" /></td>
                  <td className="adm-code">{l.products?.public_code ?? "—"}</td>
                  <td><Link href={`/admin/produtos/${l.product_id}`}>{l.products?.name}</Link></td>
                  <td>{l.products && <Badge map="visibility" value={l.products.visibility} />}</td>
                  <td>{l.products && <Badge map="curation" value={l.products.curation_tier} />}</td>
                </tr>))}</tbody></table></div>
            <div className="adm-actions"><SubmitButton>Salvar ordem e remoções</SubmitButton><span className="adm-note">Desmarque para retirar a peça da coleção (a peça não é apagada).</span></div>
          </form>
        )}
      </Card>
    </>
  );
}
