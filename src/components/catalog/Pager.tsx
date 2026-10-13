import Link from "next/link";

export function Pager({ page, total, per = 24, base }: { page: number; total: number; per?: number; base: string }) {
  if (total <= per) return null;
  return (
    <nav className="ca-pager" aria-label="Paginação">
      {page > 1 && <Link className="ca-link" href={`${base}${base.includes("?") ? "&" : "?"}p=${page - 1}`}>Anteriores</Link>}
      {page * per < total && <Link className="ca-link" href={`${base}${base.includes("?") ? "&" : "?"}p=${page + 1}`}>Mais peças</Link>}
    </nav>
  );
}
