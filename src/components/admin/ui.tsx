import type { ReactNode } from "react";

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="adm-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="adm-actions" style={{ marginTop: 0 }}>{children}</div>}
    </header>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="adm-card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="adm-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="adm-empty">{children}</div>;
}

export function Notice({ kind = "warn", children }: { kind?: "warn" | "bad" | "ok"; children: ReactNode }) {
  return <div className={`adm-alert ${kind === "warn" ? "" : kind}`} role={kind === "bad" ? "alert" : "status"}>{children}</div>;
}

const VIS: Record<string, [string, string]> = {
  public: ["Pública", "ok"], internal: ["Interna", ""], hidden: ["Oculta", "warn"], archived: ["Arquivada", "bad"],
};
const CUR: Record<string, [string, string]> = { archive: ["Acervo", ""], curated: ["Curated", "ok"], signature: ["Signature", "gold"] };
const COM: Record<string, [string, string]> = {
  active: ["Ativo", "ok"], on_request: ["Sob consulta", "warn"], discontinued: ["Descontinuado", "bad"], unknown: ["A confirmar", ""],
};

export const visibilityLabel = (v: string) => VIS[v]?.[0] ?? v;
export const curationLabel = (v: string) => CUR[v]?.[0] ?? v;
export const commercialLabel = (v: string) => COM[v]?.[0] ?? v;

export function Badge({ map, value }: { map: "visibility" | "curation" | "commercial"; value: string }) {
  const m = map === "visibility" ? VIS : map === "curation" ? CUR : COM;
  const [label, tone] = m[value] ?? [value, ""];
  return <span className={`adm-badge ${tone}`}>{label}</span>;
}

export const QUALITY_LABELS: Record<string, string> = {
  missingOriginalCode: "Sem código original",
  missingDimensions: "Sem dimensões",
  missingHighQualityImage: "Sem foto em alta",
  missingMaterial: "Sem material",
  needsCopyReview: "Revisar texto",
  needsCommercialReview: "Revisar comercial",
  possibleDuplicate: "Possível duplicidade",
};

export function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
