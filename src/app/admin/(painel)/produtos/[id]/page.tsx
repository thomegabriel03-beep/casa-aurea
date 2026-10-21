import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Badge, Card, Field, Notice, PageHeader, QUALITY_LABELS } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { MediaUploader } from "@/components/admin/MediaUploader";
import * as A from "../actions";
import { replaceMedia } from "../../importacoes/pdf-actions";

const TABS = [["geral", "Geral"], ["comercial", "Comercial"], ["variantes", "Variantes"], ["materiais", "Materiais e acabamentos"],
  ["midia", "Mídia"], ["colecoes", "Coleções"], ["curadoria", "Curadoria"], ["origem", "Origem"], ["notas", "Pendências"]] as const;

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

export default async function ProductEditor({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; ok?: string; erro?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.aba) ? sp.aba! : "geral";
  const { supabase } = await requireAdmin();
  const { data: p } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();

  const [types, subtypes, suppliers, catalogs, variants, media, materials, finishes, tags, pMat, pFin, pTag, collections, pCol, sources, autoFlags, manualFlags, dups] = await Promise.all([
    supabase.from("product_types").select("id, code, name").order("sort_order"),
    supabase.from("product_subtypes").select("id, type_id, name").order("sort_order"),
    supabase.from("suppliers").select("id, name").order("name"),
    supabase.from("catalogs").select("id, name, year, supplier_id, suppliers(name)").order("name"),
    supabase.from("product_variants").select("*").eq("product_id", id).order("sort_order").order("seq"),
    supabase.from("product_media").select("*").eq("product_id", id).eq("status", "active").order("is_primary", { ascending: false }).order("sort_order"),
    supabase.from("materials").select("id, name").order("name"),
    supabase.from("finishes").select("id, name").order("name"),
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("product_materials").select("material_id, is_primary").eq("product_id", id),
    supabase.from("product_finishes").select("finish_id").eq("product_id", id),
    supabase.from("product_tags").select("tag_id").eq("product_id", id),
    supabase.from("collections").select("id, name, active").order("sort_order"),
    supabase.from("product_collections").select("collection_id, sort_order").eq("product_id", id),
    supabase.from("product_source_references").select("*, suppliers(name), catalogs(name, year)").eq("product_id", id).order("created_at"),
    supabase.from("product_quality_auto").select("flag").eq("product_id", id),
    supabase.from("product_quality_flags").select("flag").eq("product_id", id).eq("resolved", false),
    supabase.from("product_possible_duplicates").select("product_id, duplicate_of, reason").or(`product_id.eq.${id},duplicate_of.eq.${id}`),
  ]);

  // custo interno (migração 0009): só nesta aba; se a tabela não existir, o campo avisa em vez de quebrar
  const costRes = tab === "comercial" ? await supabase.from("product_costs").select("cost").eq("product_id", id).maybeSingle() : null;
  const costMissing = Boolean(costRes?.error);
  const costValue = costRes?.data ? str((costRes.data as { cost: number | string | null }).cost) : "";

  const flagList = [...(autoFlags.data ?? []), ...(manualFlags.data ?? [])].map((f: { flag: string }) => f.flag);
  const typeById = new Map<string, Row>((types.data ?? []).map((t: Row): [string, Row] => [t.id as string, t]));
  const matSel = new Map<string, boolean>((pMat.data ?? []).map((m: Row): [string, boolean] => [m.material_id as string, Boolean(m.is_primary)]));
  const finSel = new Set((pFin.data ?? []).map((f: Row) => f.finish_id as string));
  const tagSel = new Set((pTag.data ?? []).map((t: Row) => t.tag_id as string));
  const colSel = new Map<string, number>((pCol.data ?? []).map((c: Row): [string, number] => [c.collection_id as string, c.sort_order as number]));
  const dupIds = (dups.data ?? []).map((d: Row) => (d.product_id === id ? d.duplicate_of : d.product_id) as string);

  return (
    <>
      <PageHeader title={p.name} description={p.public_code ? `Código Casa Áurea ${p.public_code}` : "Sem código: defina o tipo para gerar."}>
        <Badge map="visibility" value={p.visibility} /> <Badge map="curation" value={p.curation_tier} />
        {p.visibility === "public" && <Link className="adm-btn ghost sm" href={`/produto/${p.slug}`} target="_blank">Ver no site</Link>}
        <Link className="adm-btn ghost sm" href={`/admin/apresentar/${id}`}>Mostrar ao cliente</Link>
        <form action={A.duplicateProduct.bind(null, id)}><SubmitButton variant="ghost" size="sm">Duplicar</SubmitButton></form>
      </PageHeader>

      {sp.ok && <Notice kind="ok">{sp.ok === "criado" ? "Produto criado como interno, no acervo." : sp.ok === "duplicado" ? "Cópia criada (interna)." : "Alterações salvas."}</Notice>}
      {sp.erro && <Notice kind="bad">{sp.erro}</Notice>}
      {dupIds.length > 0 && <Notice>Possível duplicidade com {dupIds.map((d, i) => <Link key={d} href={`/admin/produtos/${d}`}>{i ? ", " : ""}esta peça</Link>)}. A decisão de consolidar é da equipe; nada é mesclado automaticamente.</Notice>}

      <nav className="adm-tabs" aria-label="Seções do produto" style={{ marginTop: "1rem" }}>
        {TABS.map(([k, l]) => <Link key={k} href={`?aba=${k}`} aria-current={tab === k ? "page" : undefined}>{l}</Link>)}
      </nav>

      {tab === "geral" && (
        <Card>
          <form action={A.saveGeneral.bind(null, id)} className="adm-grid c2">
            <Field label="Nome"><input type="text" name="name" defaultValue={p.name} required /></Field>
            <Field label="Código Casa Áurea" hint="Gerado automaticamente; não pode ser alterado."><input type="text" value={p.public_code ?? "—"} readOnly /></Field>
            <Field label="Slug (URL)" hint={`/produto/${p.slug}`}><input type="text" name="slug" defaultValue={p.slug} /></Field>
            <Field label="Tipo"><select name="product_type_id" defaultValue={str(p.product_type_id)} required>
              <option value="" disabled>Selecione…</option>
              {(types.data ?? []).map((t: Row) => <option key={t.id as string} value={t.id as string}>{str(t.code)} · {str(t.name)}</option>)}</select></Field>
            <Field label="Subtipo"><select name="product_subtype_id" defaultValue={str(p.product_subtype_id)}>
              <option value="">—</option>
              {(subtypes.data ?? []).filter((s: Row) => !p.product_type_id || s.type_id === p.product_type_id)
                .map((s: Row) => <option key={s.id as string} value={s.id as string}>{str(typeById.get(s.type_id as string)?.code)} · {str(s.name)}</option>)}</select></Field>
            <Field label="Ambiente"><select name="environment" defaultValue={p.environment}>
              <option value="indoor">Indoor</option><option value="outdoor">Outdoor</option><option value="both">Indoor e outdoor</option></select></Field>
            <Field label="Designer"><input type="text" name="designer" defaultValue={str(p.designer)} /></Field>
            <Field label="Nome da linha no fornecedor (interno)"><input type="text" name="collection_name_original" defaultValue={str(p.collection_name_original)} /></Field>
            <div style={{ gridColumn: "1/-1" }}><Field label="Descrição curta (cards)"><input type="text" name="short_description" defaultValue={str(p.short_description)} maxLength={180} /></Field></div>
            <div style={{ gridColumn: "1/-1" }}><Field label="Descrição editorial (página da peça)"><textarea name="editorial_description" defaultValue={str(p.editorial_description)} /></Field></div>
            <div style={{ gridColumn: "1/-1" }}><Field label="Descrição técnica"><textarea name="description" defaultValue={str(p.description)} /></Field></div>
            <label className="adm-check"><input type="checkbox" name="is_configurable" defaultChecked={p.is_configurable} /> Peça configurável (módulos, medidas, acabamentos)</label>
            <div style={{ gridColumn: "1/-1" }}><h2 className="adm-note" style={{ marginTop: ".5rem" }}>SEO</h2></div>
            <Field label="Título SEO"><input type="text" name="seo_title" defaultValue={str(p.seo_title)} /></Field>
            <Field label="Imagem de compartilhamento (URL)"><input type="url" name="og_image" defaultValue={str(p.og_image)} /></Field>
            <div style={{ gridColumn: "1/-1" }}><Field label="Meta description"><input type="text" name="seo_description" defaultValue={str(p.seo_description)} maxLength={180} /></Field></div>
            <div className="adm-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Salvar</SubmitButton></div>
          </form>
        </Card>
      )}

      {tab === "comercial" && (
        <Card title="Dados comerciais (internos)">
          <form action={A.saveCommercial.bind(null, id)} className="adm-grid c2">
            <Field label="Fornecedor"><select name="supplier_id" defaultValue={str(p.supplier_id)}><option value="">—</option>
              {(suppliers.data ?? []).map((s: Row) => <option key={s.id as string} value={s.id as string}>{str(s.name)}</option>)}</select></Field>
            <Field label="Status comercial"><select name="status_commercial" defaultValue={p.status_commercial}>
              <option value="active">Ativo</option><option value="on_request">Sob consulta</option><option value="discontinued">Descontinuado</option><option value="unknown">A confirmar</option></select></Field>
            <Field label="Preço base (R$)"><input type="number" step="0.01" name="price" defaultValue={str(p.price)} /></Field>
            <Field label="Preço promocional (R$)"><input type="number" step="0.01" name="sale_price" defaultValue={str(p.sale_price)} /></Field>
            <Field label="Disponibilidade (texto público)" hint="Ex.: Pronta-entrega, Sob encomenda, Locação"><input type="text" name="availability" defaultValue={str(p.availability)} /></Field>
            <Field label="SKU interno"><input type="text" name="sku" defaultValue={str(p.sku)} /></Field>
            {costMissing
              ? <Field label="Preço de custo (interno)" hint="Rode a migração 0009_orcamento_moveis.sql no SQL Editor do Supabase para liberar este campo."><input type="text" value="—" readOnly /></Field>
              : <Field label="Preço de custo (interno)" hint="Só a equipe vê. Base do orçamento de móveis (custo + margem). Vazio = sem custo."><input type="number" step="0.01" min="0" name="cost" defaultValue={costValue} /></Field>}
            <label className="adm-check" style={{ gridColumn: "1/-1" }}><input type="checkbox" name="show_price" defaultChecked={p.show_price} /> Exibir preço no site (padrão: oculto)</label>
            <div style={{ gridColumn: "1/-1" }}><Field label="Observação pública (ex.: taxa de deslocamento)"><input type="text" name="extra_info" defaultValue={str(p.extra_info)} /></Field></div>
            <div style={{ gridColumn: "1/-1" }}><Field label="Notas internas" hint="Nunca aparecem no site."><textarea name="internal_notes" defaultValue={str(p.internal_notes)} /></Field></div>
            <div className="adm-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Salvar</SubmitButton></div>
          </form>
        </Card>
      )}

      {tab === "variantes" && (
        <>
          <Card title="Variantes">
            {(variants.data ?? []).length === 0 && <p className="adm-note">Nenhuma variante. Medidas, módulos e acabamentos do mesmo modelo entram aqui, não como novos produtos.</p>}
            {(variants.data ?? []).map((v: Row) => (
              <form key={v.id as string} action={A.updateVariant.bind(null, id, v.id as string)} className="adm-grid c4" style={{ borderTop: "1px solid var(--a-line)", paddingTop: "1rem", marginTop: "1rem" }}>
                <Field label="Código"><input type="text" value={str(v.variant_code)} readOnly /></Field>
                <Field label="Nome"><input type="text" name="name" defaultValue={str(v.name)} /></Field>
                <Field label="Largura (cm)"><input type="number" step="0.1" name="width_cm" defaultValue={str(v.width_cm)} /></Field>
                <Field label="Altura (cm)"><input type="number" step="0.1" name="height_cm" defaultValue={str(v.height_cm)} /></Field>
                <Field label="Profundidade (cm)"><input type="number" step="0.1" name="depth_cm" defaultValue={str(v.depth_cm)} /></Field>
                <Field label="Diâmetro (cm)"><input type="number" step="0.1" name="diameter_cm" defaultValue={str(v.diameter_cm)} /></Field>
                <Field label="Configuração"><input type="text" name="configuration" defaultValue={str(v.configuration)} /></Field>
                <Field label="Preço (R$)"><input type="number" step="0.01" name="price" defaultValue={str(v.price)} /></Field>
                <Field label="Código no fornecedor (interno)"><input type="text" name="supplier_variant_code" defaultValue={str(v.supplier_variant_code)} /></Field>
                <Field label="Status"><select name="commercial_status" defaultValue={str(v.commercial_status)}>
                  <option value="active">Ativo</option><option value="on_request">Sob consulta</option><option value="discontinued">Descontinuado</option><option value="unknown">A confirmar</option></select></Field>
                <Field label="Ordem"><input type="number" name="sort_order" defaultValue={str(v.sort_order)} /></Field>
                <div className="adm-actions" style={{ alignSelf: "end" }}>
                  <SubmitButton size="sm">Salvar</SubmitButton>
                  <button formAction={A.deleteVariant.bind(null, id, v.id as string)} className="adm-btn danger sm">Remover</button>
                </div>
              </form>
            ))}
          </Card>
          <Card title="Nova variante">
            <form action={A.addVariant.bind(null, id)} className="adm-grid c4">
              <Field label="Nome" hint="Ex.: 220 cm, Com chaise"><input type="text" name="name" required /></Field>
              <Field label="Largura (cm)"><input type="number" step="0.1" name="width_cm" /></Field>
              <Field label="Altura (cm)"><input type="number" step="0.1" name="height_cm" /></Field>
              <Field label="Profundidade (cm)"><input type="number" step="0.1" name="depth_cm" /></Field>
              <Field label="Diâmetro (cm)"><input type="number" step="0.1" name="diameter_cm" /></Field>
              <Field label="Configuração"><input type="text" name="configuration" /></Field>
              <Field label="Braço"><input type="text" name="arm_type" /></Field>
              <Field label="Chaise"><input type="text" name="chaise_type" /></Field>
              <Field label="Preço (R$)"><input type="number" step="0.01" name="price" /></Field>
              <Field label="Código no fornecedor (interno)"><input type="text" name="supplier_variant_code" /></Field>
              <Field label="Ordem"><input type="number" name="sort_order" defaultValue="0" /></Field>
              <div className="adm-actions" style={{ alignSelf: "end" }}><SubmitButton>Adicionar</SubmitButton></div>
            </form>
          </Card>
        </>
      )}

      {tab === "materiais" && (
        <Card>
          <form action={A.saveTaxonomy.bind(null, id)} className="adm-grid">
            <fieldset><legend className="adm-note" style={{ marginBottom: ".5rem" }}>Materiais (marque o principal ao lado)</legend>
              <div className="adm-checks">{(materials.data ?? []).map((m: Row) => (
                <span key={m.id as string} className="adm-check">
                  <input type="checkbox" name="materials" value={m.id as string} defaultChecked={matSel.has(m.id as string)} id={`m-${m.id}`} />
                  <label htmlFor={`m-${m.id}`}>{str(m.name)}</label>
                  <input type="radio" name="primary_material" value={m.id as string} defaultChecked={matSel.get(m.id as string) === true} aria-label={`${str(m.name)} como principal`} />
                </span>))}</div></fieldset>
            <fieldset><legend className="adm-note" style={{ marginBottom: ".5rem" }}>Acabamentos</legend>
              <div className="adm-checks">{(finishes.data ?? []).map((f: Row) => (
                <label key={f.id as string} className="adm-check"><input type="checkbox" name="finishes" value={f.id as string} defaultChecked={finSel.has(f.id as string)} /> {str(f.name)}</label>))}</div></fieldset>
            <fieldset><legend className="adm-note" style={{ marginBottom: ".5rem" }}>Tags</legend>
              <div className="adm-checks">{(tags.data ?? []).length === 0 ? <span className="adm-note">Cadastre tags em Taxonomia → Tags.</span> : (tags.data ?? []).map((t: Row) => (
                <label key={t.id as string} className="adm-check"><input type="checkbox" name="tags" value={t.id as string} defaultChecked={tagSel.has(t.id as string)} /> {str(t.name)}</label>))}</div></fieldset>
            <div className="adm-actions"><SubmitButton>Salvar</SubmitButton> <Link className="adm-note" href="/admin/materiais">Gerenciar listas</Link></div>
          </form>
        </Card>
      )}

      {tab === "midia" && (
        <>
          <Card title="Enviar">
            <MediaUploader bucket="produtos" folder={(p.public_code ?? p.id).toLowerCase()} onSaved={A.addMedia.bind(null, id)} label="Enviar fotos ou vídeo" />
          </Card>
          <Card title="Galeria">
            {(media.data ?? []).length === 0 ? <p className="adm-note">Sem mídia. A primeira foto enviada vira a principal.</p> : (
              <div className="adm-media">
                {(media.data ?? []).map((m: Row) => (
                  <figure key={m.id as string}>
                    {m.type === "video"
                      ? <video src={m.url as string} muted playsInline preload="metadata" />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={m.url as string} alt={str(m.alt)} loading="lazy" />}
                    <figcaption>
                      {Boolean(m.is_primary) && <span className="adm-badge gold">Principal</span>}
                      <span className="adm-note">{m.width ? `${str(m.width)}×${str(m.height)}` : ""}</span>
                      {m.quality ? <span className="adm-note">{String(m.quality)}{m.source_type ? ` · ${String(m.source_type)}` : ""}</span> : null}
                      <MediaUploader bucket="produtos" folder={`${id}/supplier`} onSaved={replaceMedia.bind(null, id, m.id as string)} label="Substituir foto" accept="image/*" />
                      <form action={A.updateMedia.bind(null, id, m.id as string)} className="adm-grid" style={{ gap: ".35rem" }}>
                        <input type="text" name="alt" defaultValue={str(m.alt)} placeholder="Texto alternativo" aria-label="Texto alternativo" />
                        <select name="type" defaultValue={str(m.type)} aria-label="Tipo de mídia">
                          <option value="gallery">Galeria</option><option value="editorial">Editorial</option><option value="ambient">Ambiente</option>
                          <option value="detail">Detalhe</option><option value="video">Vídeo</option><option value="primary">Principal</option></select>
                        <input type="text" name="focal_point" defaultValue={str(m.focal_point)} placeholder="Foco (ex.: 50% 40%)" aria-label="Ponto focal" />
                        <input type="number" name="sort_order" defaultValue={str(m.sort_order)} aria-label="Ordem" />
                        {m.type === "video" && <input type="url" name="poster_url" defaultValue={str(m.poster_url)} placeholder="Poster do vídeo (URL)" aria-label="Poster" />}
                        <label className="adm-check"><input type="checkbox" name="is_primary" defaultChecked={Boolean(m.is_primary)} /> Principal</label>
                        <div className="adm-actions" style={{ marginTop: 0 }}>
                          <SubmitButton size="sm">Salvar</SubmitButton>
                          <button formAction={A.deleteMedia.bind(null, id, m.id as string)} className="adm-btn danger sm">Excluir</button>
                        </div>
                      </form>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "colecoes" && (
        <Card title="Coleções">
          <form action={A.saveCollections.bind(null, id)} className="adm-grid">
            {(collections.data ?? []).length === 0 ? <p className="adm-note">Nenhuma coleção. <Link href="/admin/colecoes">Criar coleção</Link></p> :
              (collections.data ?? []).map((c: Row) => (
                <div key={c.id as string} className="adm-check" style={{ justifyContent: "space-between", maxWidth: "32rem" }}>
                  <label className="adm-check"><input type="checkbox" name="collections" value={c.id as string} defaultChecked={colSel.has(c.id as string)} /> {str(c.name)} {!c.active && <span className="adm-badge">inativa</span>}</label>
                  <input type="number" name={`order_${c.id}`} defaultValue={str(colSel.get(c.id as string) ?? 0)} aria-label={`Ordem em ${str(c.name)}`} style={{ width: "6rem" }} />
                </div>
              ))}
            <div className="adm-actions"><SubmitButton>Salvar</SubmitButton></div>
          </form>
        </Card>
      )}

      {tab === "curadoria" && (
        <Card title="Visibilidade e curadoria">
          <form action={A.saveCuration.bind(null, id)} className="adm-grid c2">
            <Field label="Visibilidade" hint="Pública = aparece no site. Interna = só no painel.">
              <select name="visibility" defaultValue={p.visibility}><option value="internal">Interna</option><option value="public">Pública</option><option value="hidden">Oculta</option><option value="archived">Arquivada</option></select></Field>
            <Field label="Curadoria" hint="Acervo não entra nas listagens; Signature recebe destaque editorial.">
              <select name="curation_tier" defaultValue={p.curation_tier}><option value="archive">Acervo (archive)</option><option value="curated">Curated</option><option value="signature">Signature</option></select></Field>
            <Field label="Ordem na vitrine"><input type="number" name="sort_order" defaultValue={str(p.sort_order)} /></Field>
            <label className="adm-check" style={{ alignSelf: "end" }}><input type="checkbox" name="featured" defaultChecked={p.featured} /> Destaque</label>
            <div className="adm-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Salvar</SubmitButton></div>
          </form>
          <p className="adm-note" style={{ marginTop: "1rem" }}>Para aparecer nas listagens públicas a peça precisa estar Pública e em Curated ou Signature. Peças públicas no Acervo só aparecem dentro das coleções em que estiverem.</p>
        </Card>
      )}

      {tab === "origem" && (
        <>
          <Card title="Referências de origem (internas)">
            {(sources.data ?? []).length === 0 ? <p className="adm-note">Nenhuma referência.</p> : (
              <div className="adm-table-wrap"><table className="adm-table">
                <thead><tr><th>Fornecedor</th><th>Catálogo</th><th>Página</th><th>Código original</th><th>Nome original</th><th /></tr></thead>
                <tbody>{(sources.data ?? []).map((r: Row) => (
                  <tr key={r.id as string}>
                    <td>{str((r.suppliers as Row | null)?.name) || "—"}</td>
                    <td>{(r.catalogs as Row | null) ? `${str((r.catalogs as Row).name)} ${str((r.catalogs as Row).year)}` : "—"}</td>
                    <td>{str(r.page) || "—"}</td><td className="adm-code">{str(r.original_code) || "—"}</td><td>{str(r.original_name) || "—"}</td>
                    <td><form action={A.deleteSource.bind(null, id, r.id as string)}><SubmitButton variant="danger" size="sm" confirm="Remover esta referência?">Remover</SubmitButton></form></td>
                  </tr>))}</tbody></table></div>
            )}
          </Card>
          <Card title="Nova referência">
            <form action={A.addSource.bind(null, id)} className="adm-grid c3">
              <Field label="Catálogo"><select name="catalog_id" defaultValue=""><option value="">—</option>
                {(catalogs.data ?? []).map((c: Row) => <option key={c.id as string} value={c.id as string}>{str((c.suppliers as Row | null)?.name)} · {str(c.name)} {str(c.year)}</option>)}</select></Field>
              <Field label="Fornecedor (se sem catálogo)"><select name="supplier_id" defaultValue=""><option value="">—</option>
                {(suppliers.data ?? []).map((s: Row) => <option key={s.id as string} value={s.id as string}>{str(s.name)}</option>)}</select></Field>
              <Field label="Ano"><input type="number" name="year" /></Field>
              <Field label="Página"><input type="text" name="page" /></Field>
              <Field label="Código original"><input type="text" name="original_code" /></Field>
              <Field label="Nome original"><input type="text" name="original_name" /></Field>
              <div style={{ gridColumn: "1/-1" }}><Field label="Observações"><input type="text" name="notes" /></Field></div>
              <div className="adm-actions" style={{ gridColumn: "1/-1" }}><SubmitButton>Adicionar</SubmitButton></div>
            </form>
          </Card>
        </>
      )}

      {tab === "notas" && (
        <Card title="Pendências">
          {flagList.length === 0 ? <p className="adm-note">Sem pendências.</p> : (
            <div className="adm-checks" style={{ marginBottom: "1rem" }}>{[...new Set(flagList)].map((f) => <span key={f} className="adm-badge warn">{QUALITY_LABELS[f] ?? f}</span>)}</div>
          )}
          <form action={A.saveFlags.bind(null, id)} className="adm-grid">
            <p className="adm-note">Marcações manuais de revisão:</p>
            <div className="adm-checks">
              {(["needsCopyReview", "needsCommercialReview", "possibleDuplicate"] as const).map((f) => (
                <label key={f} className="adm-check"><input type="checkbox" name="flags" value={f} defaultChecked={(manualFlags.data ?? []).some((m: { flag: string }) => m.flag === f)} /> {QUALITY_LABELS[f]}</label>
              ))}
            </div>
            <div className="adm-actions"><SubmitButton>Salvar</SubmitButton></div>
          </form>
          <div className="adm-actions" style={{ marginTop: "1.5rem", borderTop: "1px solid var(--a-line)", paddingTop: "1rem" }}>
            <form action={async () => { "use server"; await A.setVisibility(id, "hidden"); }}><SubmitButton variant="ghost" confirm="Ocultar esta peça do site?">Desativar (ocultar)</SubmitButton></form>
            <form action={async () => { "use server"; await A.setVisibility(id, "archived"); }}><SubmitButton variant="danger" confirm="Arquivar esta peça? Ela sai do site, mas nada é apagado.">Arquivar</SubmitButton></form>
          </div>
        </Card>
      )}
    </>
  );
}
