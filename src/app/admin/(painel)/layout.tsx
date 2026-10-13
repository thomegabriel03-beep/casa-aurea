import { Suspense } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { TableLabels } from "@/components/admin/TableLabels";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { signOut } from "../(auth)/login/actions";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <AdminNav footer={
          <form action={signOut} style={{ marginTop: "1.5rem" }}>
            <p className="adm-note" style={{ color: "rgb(239 232 221/.5)", marginBottom: ".5rem", overflowWrap: "anywhere" }}>{user.email}</p>
            <button className="adm-btn ghost sm" style={{ color: "#efe8dd", borderColor: "rgb(239 232 221/.25)" }}>Sair</button>
          </form>
        } />
      </aside>
      <main className="adm-main">{children}</main>
      <Suspense fallback={null}><TableLabels /></Suspense>
    </div>
  );
}
