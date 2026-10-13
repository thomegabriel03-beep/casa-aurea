import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { Card, PageHeader, QUALITY_LABELS } from "@/components/admin/ui";

export default async function Dashboard() {
  const { supabase } = await requireAdmin();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const head = { count: "exact" as const, head: true };
  const [total, pub, internal, signature, suppliers, catalogs, liveCollections, flags, dups, imports] = await Promise.all([
    count(supabase.from("products").select("id", head)),
    count(supabase.from("products").select("id", head).eq("visibility", "public")),
    count(supabase.from("products").select("id", head).eq("visibility", "internal")),
    count(supabase.from("products").select("id", head).eq("curation_tier", "signature")),
    count(supabase.from("suppliers").select("id", head)),
    count(supabase.from("catalogs").select("id", head)),
    supabase.from("live_collections").select("name, slug, featured"),
    supabase.from("product_quality_auto").select("flag"),
    count(supabase.from("product_possible_duplicates").select("product_id", head)),
    supabase.from("import_batches").select("id, source_file, status, imported, failed, created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const byFlag = new Map<string, number>();
  (flags.data ?? []).forEach((f: { flag: string }) => byFlag.set(f.flag, (byFlag.get(f.flag) ?? 0) + 1));

  return (
    <>
      <PageHeader title="Dashboard" description="Visão geral do acervo e da vitrine.">
        <Link className="adm-btn" href="/admin/produtos/novo">Novo produto</Link>
      </PageHeader>
      <div className="adm-grid c4">
        {[["Peças no acervo", total, "/admin/produtos"], ["Públicas", pub, "/admin/produtos?visibilidade=public"],
          ["Internas", internal, "/admin/produtos?visibilidade=internal"], ["Signature", signature, "/admin/produtos?curadoria=signature"]].map(([l, n, href]) => (
          <Link key={l as string} href={href as string} className="adm-card" style={{ textDecoration: "none" }}>
            <p className="adm-note">{l}</p><p className="adm-stat">{n as number}</p>
          </Link>
        ))}
      </div>
      <div className="adm-grid c2" style={{ marginTop: "1rem" }}>
        <Card title="Pendências de qualidade">
          {byFlag.size === 0 && dups === 0 ? <p className="adm-note">Nenhuma pendência.</p> : (
            <ul style={{ display: "grid", gap: ".4rem" }}>
              {[...byFlag.entries()].map(([f, n]) => (
                <li key={f}><Link href={`/admin/produtos?pendencia=${f}`}>{QUALITY_LABELS[f] ?? f}</Link> <span className="adm-badge warn">{n}</span></li>
              ))}
              {dups > 0 && <li><Link href="/admin/produtos?pendencia=possibleDuplicate">Possível duplicidade</Link> <span className="adm-badge bad">{dups}</span></li>}
            </ul>
          )}
        </Card>
        <Card title="Coleções no ar">
          {(liveCollections.data ?? []).length === 0 ? <p className="adm-note">Nenhuma coleção ativa no período.</p> : (
            <ul style={{ display: "grid", gap: ".4rem" }}>
              {(liveCollections.data ?? []).map((c: { name: string; slug: string; featured: boolean }) => (
                <li key={c.slug}>{c.name} {c.featured && <span className="adm-badge gold">Destaque</span>}</li>
              ))}
            </ul>
          )}
          <p className="adm-note" style={{ marginTop: ".75rem" }}>{suppliers} fornecedores · {catalogs} catálogos</p>
        </Card>
      </div>
      <Card title="Últimas importações">
        {(imports.data ?? []).length === 0 ? <p className="adm-note">Nenhuma importação ainda.</p> : (
          <ul style={{ display: "grid", gap: ".4rem" }}>
            {(imports.data ?? []).map((b: { id: string; source_file: string | null; status: string; imported: number; failed: number }) => (
              <li key={b.id}>{b.source_file ?? "Planilha"} · {b.status} · {b.imported} importadas, {b.failed} com erro</li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
