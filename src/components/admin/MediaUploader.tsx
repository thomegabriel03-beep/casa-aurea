"use client";
import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { slugify } from "@/lib/catalog/slug";

type Uploaded = { url: string; path: string; type: string; width?: number; height?: number; alt?: string };

function dims(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.onloadedmetadata = () => { resolve({ width: v.videoWidth, height: v.videoHeight }); URL.revokeObjectURL(url); };
      v.onerror = () => resolve({}); v.src = url;
    } else {
      const img = new Image();
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => resolve({}); img.src = url;
    }
  });
}

/** Envia fotos e vídeos direto ao Supabase Storage (bucket e pasta definidos) com a sessão do admin
 *  e depois registra os arquivos pelo callback do servidor. */
export function MediaUploader({ bucket, folder, onSaved, accept = "image/*,video/mp4,video/webm", label = "Enviar arquivos" }: {
  bucket: string; folder: string; onSaved?: (items: Uploaded[]) => Promise<{ error: string | null }>; accept?: string; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  const uid = useId();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const done: Uploaded[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "arquivo";
      const path = `${folder}/${Date.now()}-${base}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
      if (error) { setMsg(`Falha em ${file.name}: ${error.message}`); continue; }
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      done.push({ url: data.publicUrl, path, type: file.type.startsWith("video/") ? "video" : "gallery", ...(await dims(file)) });
    }
    if (done.length && onSaved) {
      const r = await onSaved(done);
      if (r.error) setMsg(r.error);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    if (done.length) { setMsg(`${done.length} arquivo(s) enviado(s).`); start(() => router.refresh()); }
  }

  return (
    <div>
      <input ref={input} type="file" multiple accept={accept} className="sr" id={`up-${uid}`} onChange={(e) => upload(e.target.files)} />
      <label htmlFor={`up-${uid}`} className="adm-btn" aria-disabled={busy} style={busy ? { opacity: 0.6, pointerEvents: "none" } : undefined}>
        {busy ? "Enviando…" : label}
      </label>
      <p className="adm-note" style={{ marginTop: ".5rem" }}>JPG, PNG, WebP ou AVIF em alta resolução (ideal: 2400 px no lado maior). Vídeo em MP4/WebM.</p>
      {msg && <p className="adm-note" role="status" style={{ marginTop: ".5rem" }}>{msg}</p>}
    </div>
  );
}
