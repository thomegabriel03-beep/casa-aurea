"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "./BrandMark";

const GROUPS: { title?: string; items: [string, string][] }[] = [
  { items: [["/admin", "Dashboard"]] },
  { title: "Vendas", items: [["/admin/orcamentos", "Orçamentos"]] },
  { title: "Catálogo", items: [["/admin/produtos", "Produtos"], ["/admin/colecoes", "Coleções"], ["/admin/importacoes", "Importações"], ["/admin/midia", "Mídia"]] },
  { title: "Origem", items: [["/admin/fornecedores", "Fornecedores"], ["/admin/catalogos", "Catálogos"]] },
  { title: "Taxonomia", items: [["/admin/tipos", "Tipos e subtipos"], ["/admin/materiais", "Materiais"], ["/admin/acabamentos", "Acabamentos"], ["/admin/tags", "Tags"]] },
  { title: "Sistema", items: [["/admin/configuracoes", "Configurações"]] },
];
const TABBAR: [string, string][] = [["/admin", "Início"], ["/admin/produtos", "Produtos"], ["/admin/orcamentos", "Orçamentos"], ["/admin/colecoes", "Coleções"]];

/** Desktop: barra lateral. Celular: barra superior com menu em gaveta + atalhos fixos no rodapé. */
export function AdminNav({ footer }: { footer?: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const active = (href: string) =>
    href === "/admin" ? path === "/admin" : href === "/admin/produtos" ? path.startsWith(href) && path !== "/admin/produtos/novo" : path.startsWith(href);
  return (
    <>
      <div className="adm-top">
        <Link href="/admin" className="brand" style={{ textDecoration: "none" }} aria-label="Casa Áurea · Painel"><BrandMark size={26} /></Link>
        <button type="button" className="adm-menu-btn" aria-expanded={open} aria-controls="adm-drawer" onClick={() => setOpen((o) => !o)}>Menu</button>
      </div>
      <div className={`adm-drawer${open ? " is-open" : ""}`} id="adm-drawer">
        <nav className="adm-nav" aria-label="Painel">
          {GROUPS.map((g, i) => (
            <div key={i} style={{ display: "contents" }}>
              {g.title && <span className="grp">{g.title}</span>}
              {g.items.map(([href, label]) => (
                <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}>{label}</Link>
              ))}
            </div>
          ))}
        </nav>
        {footer}
      </div>
      <nav className="adm-tabbar" aria-label="Atalhos do painel">
        {TABBAR.map(([href, label]) => <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}>{label}</Link>)}
        <button type="button" aria-controls="adm-drawer" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Mais</button>
      </nav>
    </>
  );
}
