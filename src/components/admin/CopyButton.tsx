"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copiar URL" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="adm-btn ghost sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { window.prompt("Copie o endereço:", text); }
    }}>{done ? "Copiado" : label}</button>
  );
}
