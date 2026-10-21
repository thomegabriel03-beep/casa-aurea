"use client";
import { useActionState } from "react";
import { importCosts, type CostImportState } from "@/app/admin/(painel)/orcamentos/custos/actions";

/** Importação da planilha de custos (código; custo) com o resultado na mesma tela. */
export function CostImportForm() {
  const [state, action, pending] = useActionState<CostImportState, FormData>(importCosts, null);
  return (
    <>
      <form action={action} className="adm-grid" style={{ maxWidth: "36rem" }}>
        <label className="adm-field">
          <span>Planilha (CSV)</span>
          <input type="file" name="arquivo" accept=".csv,.txt,text/csv,text/plain" required />
          <small>Duas colunas: código e custo. Separador ; ou , — valores como 1.234,56 ou 1234.56.</small>
        </label>
        <div className="adm-actions" style={{ marginTop: 0 }}>
          <button type="submit" className="adm-btn" disabled={pending}>{pending ? "Importando…" : "Importar custos"}</button>
        </div>
      </form>
      {state && (
        <div style={{ marginTop: "1rem" }}>
          <div className={`adm-alert ${state.ok ? "ok" : "bad"}`} role={state.ok ? "status" : "alert"}>{state.message}</div>
          {state.ambiguous.length > 0 && (
            <p className="adm-note" style={{ marginTop: ".75rem" }}>
              <b>Código em mais de uma peça (não importado):</b> {state.ambiguous.slice(0, 60).join(", ")}{state.ambiguous.length > 60 ? "…" : ""}
            </p>
          )}
          {state.notFound.length > 0 && (
            <p className="adm-note" style={{ marginTop: ".75rem" }}>
              <b>{state.notFound.length} código(s) não encontrados:</b> {state.notFound.slice(0, 80).join(", ")}{state.notFound.length > 80 ? "…" : ""}
            </p>
          )}
          {state.errors.length > 0 && (
            <ul className="adm-note" style={{ marginTop: ".75rem", paddingLeft: "1rem", listStyle: "disc" }}>
              {state.errors.slice(0, 30).map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
