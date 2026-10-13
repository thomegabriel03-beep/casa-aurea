"use client";
import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="adm-grid" style={{ gap: ".9rem" }}>
      <input type="hidden" name="next" value={next} />
      <label className="adm-field"><span>E-mail</span><input type="email" name="email" autoComplete="username" required /></label>
      <label className="adm-field"><span>Senha</span><input type="password" name="password" autoComplete="current-password" required /></label>
      {(state?.error || notice) && <div className="adm-alert bad" role="alert">{state?.error ?? notice}</div>}
      <button className="adm-btn" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
