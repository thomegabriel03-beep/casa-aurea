"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* Ficha de apresentação em janela: abre na hora por cima da lista de produtos.
   ← → passam de peça, Esc fecha, deslizar o dedo também troca de peça no celular.
   Os detalhes (todas as fotos, medidas, materiais) chegam de /admin/ficha/[id] e ficam em cache. */

export type FichaItem = { id: string; name: string; code: string | null; img: string | null };

type Ficha = {
  id: string; name: string; code: string | null; type: string | null; outdoor: boolean; text: string | null; designer: string | null;
  photos: { url: string; alt: string }[]; sizes: string[]; materials: string[]; finishes: string[];
};

const cache = new Map<string, Ficha>();
const pending = new Map<string, Promise<Ficha | null>>();

function load(id: string): Promise<Ficha | null> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const p = pending.get(id);
  if (p) return p;
  const req = fetch(`/admin/ficha/${id}`, { credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<Ficha>) : null))
    .then((f) => {
      if (f) {
        cache.set(id, f);
        f.photos.slice(0, 2).forEach((ph) => { const im = new Image(); im.src = ph.url; });
      }
      pending.delete(id);
      return f;
    })
    .catch(() => { pending.delete(id); return null; });
  pending.set(id, req);
  return req;
}

export function FichaViewer({ items }: { items: FichaItem[] }) {
  const [idx, setIdx] = useState<number | null>(null);
  const [photo, setPhoto] = useState(0);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [failed, setFailed] = useState(false);
  const touch = useRef<number | null>(null);
  const closeBtn = useRef<HTMLButtonElement | null>(null);

  const item = idx == null ? null : items[idx];

  const go = useCallback((d: number) => {
    setIdx((i) => (i == null ? i : (i + d + items.length) % items.length));
  }, [items.length]);

  // abrir pelo clique na foto ou em "Mostrar ao cliente" (Ctrl/⌘ + clique abre em aba)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.("[data-ficha]") as HTMLElement | null;
      if (!el || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      const i = items.findIndex((x) => x.id === el.dataset.ficha);
      if (i < 0) return;
      e.preventDefault();
      setIdx(i);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [items]);

  // carregar a peça atual e já adiantar as vizinhas
  useEffect(() => {
    if (!item) return;
    setPhoto(0);
    setFailed(false);
    setFicha(cache.get(item.id) ?? null);
    let alive = true;
    load(item.id).then((f) => { if (!alive) return; if (f) setFicha(f); else setFailed(true); });
    if (idx != null && items.length > 1) {
      [items[(idx + 1) % items.length], items[(idx - 1 + items.length) % items.length]].forEach((x) => { if (x) load(x.id); });
    }
    return () => { alive = false; };
  }, [item, idx, items]);

  // teclado, rolagem travada e foco
  useEffect(() => {
    if (idx == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIdx(null);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [idx, go]);

  if (!item) return null;

  const photos = ficha?.photos.length ? ficha.photos : item.img ? [{ url: item.img, alt: item.name }] : [];
  const cur = photos[Math.min(photo, photos.length - 1)];
  const wa = `https://wa.me/?text=${encodeURIComponent(`Casa Áurea · ${item.name}${item.code ? ` (${item.code})` : ""}`)}`;

  return (
    <div className="fv" role="dialog" aria-modal="true" aria-label={`Ficha de ${item.name}`}
      onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const x0 = touch.current; touch.current = null;
        const x1 = e.changedTouches[0]?.clientX;
        if (x0 != null && x1 != null && Math.abs(x1 - x0) > 60) go(x1 < x0 ? 1 : -1);
      }}>
      <div className="apr-bar">
        <button ref={closeBtn} type="button" className="fv-x" onClick={() => setIdx(null)}>← Voltar à lista</button>
        <span className="apr-brand">CASA ÁUREA</span>
        <span className="fv-tools">
          <span className="fv-count">{(idx ?? 0) + 1} / {items.length}</span>
          <a className="apr-wa" href={wa} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
        </span>
      </div>
      <div className="apr-card fv-card">
        <div className="apr-media">
          {cur ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={cur.url} className="apr-main fv-main" src={cur.url} alt={cur.alt}
              onClick={() => photos.length > 1 && setPhoto((p) => (p + 1) % photos.length)} />
          ) : (
            <div className="apr-nophoto">Sem foto</div>
          )}
          {photos.length > 1 && (
            <div className="apr-thumbs" role="group" aria-label="Fotos da peça">
              {photos.map((ph, k) => (
                <button key={ph.url + k} type="button" aria-pressed={k === photo} aria-label={`Foto ${k + 1}`} onClick={() => setPhoto(k)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="apr-info">
          {(ficha?.type) && <p className="apr-eyebrow">{ficha.type}{ficha.outdoor ? " · área externa" : ""}</p>}
          <h2 className="fv-title">{item.name}</h2>
          {item.code && <p className="apr-code">{item.code}</p>}
          {ficha?.text && <p className="apr-desc">{ficha.text}</p>}
          {ficha ? (
            <dl className="apr-specs">
              {ficha.sizes.length > 0 && <div><dt>{ficha.sizes.length > 1 ? "Medidas" : "Medida"}</dt><dd>{ficha.sizes.map((s, k) => <span key={k}>{s}</span>)}</dd></div>}
              {ficha.materials.length > 0 && <div><dt>Materiais</dt><dd>{ficha.materials.join(", ")}</dd></div>}
              {ficha.finishes.length > 0 && <div><dt>Acabamentos</dt><dd>{ficha.finishes.join(", ")}</dd></div>}
              {ficha.designer && <div><dt>Design</dt><dd>{ficha.designer}</dd></div>}
            </dl>
          ) : (
            <p className="adm-note">{failed ? "Não foi possível carregar os detalhes. Tente de novo." : "Carregando detalhes…"}</p>
          )}
          <p className="apr-note">Medidas, tecidos e acabamentos podem ser ajustados sob encomenda. Valores e prazos sob consulta.</p>
          {items.length > 1 && (
            <div className="fv-nav">
              <button type="button" className="adm-btn ghost" onClick={() => go(-1)}>← Anterior</button>
              <button type="button" className="adm-btn" onClick={() => go(1)}>Próxima →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
