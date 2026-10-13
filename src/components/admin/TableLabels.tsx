"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** No celular as tabelas viram cartões; cada célula recebe o rótulo da sua coluna. */
export function TableLabels() {
  const path = usePathname();
  const sp = useSearchParams();
  useEffect(() => {
    document.querySelectorAll<HTMLTableElement>(".adm-table").forEach((tb) => {
      const heads = Array.from(tb.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
      tb.querySelectorAll("tbody tr").forEach((tr) => Array.from(tr.children).forEach((td, i) => { if (heads[i]) td.setAttribute("data-label", heads[i]); }));
    });
  }, [path, sp]);
  return null;
}
