import { LoginForm } from "./LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="adm-login">
      <div className="adm-card">
        <p style={{ fontFamily: "var(--font-brand, serif)", letterSpacing: ".3em", fontSize: ".875rem" }}>CASA ÁUREA</p>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "1.625rem", margin: ".5rem 0 1.25rem", fontWeight: 400 }}>Painel</h1>
        {!isSupabaseConfigured && (
          <div className="adm-alert" style={{ marginBottom: "1rem" }}>
            Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local para habilitar o acesso.
          </div>
        )}
        <LoginForm next={sp.next ?? "/admin"} notice={sp.erro === "sem-permissao" ? "Este usuário não tem acesso ao painel." : undefined} />
      </div>
    </main>
  );
}
