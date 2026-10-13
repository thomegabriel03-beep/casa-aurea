"use client";
import { useState } from "react";

/** Celular: mostra/esconde os filtros da lista (a busca fica sempre visível). */
export function FiltersToggle({ active }: { active: number }) {
  const [on, setOn] = useState(active > 0);
  return (
    <button type="button" className="adm-btn ghost adm-ftoggle" aria-expanded={on}
      onClick={(e) => { const f = e.currentTarget.closest("form"); f?.classList.toggle("show", !on); setOn(!on); }}
      ref={(el) => { if (el && on) el.closest("form")?.classList.add("show"); }}>
      Filtros{active ? ` (${active})` : ""}
    </button>
  );
}
