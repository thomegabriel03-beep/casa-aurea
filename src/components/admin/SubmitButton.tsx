"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** Botão de envio com estado de carregamento; confirmação opcional para ações destrutivas. */
export function SubmitButton({ children, variant, confirm, name, value, size }: {
  children: ReactNode; variant?: "ghost" | "danger"; confirm?: string; name?: string; value?: string; size?: "sm";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={`adm-btn ${variant ?? ""} ${size ?? ""}`}
      disabled={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending ? "Salvando…" : children}
    </button>
  );
}
