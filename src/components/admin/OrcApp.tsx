"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";

type Row = { kind: string; id: string; data: unknown };
type Up = { kind: string; id: string; data: unknown };
type Del = { kind: string; id: string };

declare global {
  interface Window {
    __orcStore?: { rows: Row[]; sync: (up: Up[], del: Del[]) => Promise<void> };
  }
}

/* Monta o módulo de orçamentos e liga o salvamento ao banco (quote_docs). */
export function OrcApp({ rows, version }: { rows: Row[]; version: string }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const supabase = createClient();
    window.__orcStore = {
      rows,
      async sync(up, del) {
        if (up.length) {
          const { error } = await supabase.from("quote_docs").upsert(up.map((u) => ({ kind: u.kind, id: u.id, data: u.data })));
          if (error) throw new Error(error.message);
        }
        for (const d of del) {
          const { error } = await supabase.from("quote_docs").delete().eq("kind", d.kind).eq("id", d.id);
          if (error) throw new Error(error.message);
        }
      },
    };
    const s = document.createElement("script");
    s.src = `/admin-orc/orcamentos.js?v=${version}`;
    s.async = true;
    document.body.appendChild(s);
  }, [rows, version]);

  return <div id="orcRoot" className="orc-app"><p className="adm-note">Carregando orçamentos…</p></div>;
}
