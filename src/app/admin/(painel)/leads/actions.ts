"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin-guard";
import { STATUS_KEYS } from "@/lib/aurea/leads-admin";

/** Atualiza status e anotações de um lead (só administradores). */
export async function saveLead(id: string, form: FormData) {
  const { supabase } = await requireAdmin();
  const status = String(form.get("status") ?? "");
  const notes = String(form.get("notes") ?? "").slice(0, 4000);
  const back = String(form.get("back") ?? "");
  const patch: Record<string, unknown> = { notes: notes.trim() || null };
  if (STATUS_KEYS.includes(status)) {
    patch.status = status;
    patch.handled_at = status === "novo" ? null : new Date().toISOString();
  }
  await supabase.from("aurea_conversations").update(patch).eq("id", id);
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${id}`);
  redirect(back.startsWith("/admin/leads") ? back : `/admin/leads/${id}?salvo=1`);
}

/** Muda só o status (botões rápidos da lista). */
export async function setLeadStatus(form: FormData) {
  const { supabase } = await requireAdmin();
  const [id, status] = String(form.get("st") ?? "").split("|");
  const back = String(form.get("back") ?? "/admin/leads");
  if (id && STATUS_KEYS.includes(status)) {
    await supabase.from("aurea_conversations")
      .update({ status, handled_at: status === "novo" ? null : new Date().toISOString() }).eq("id", id);
  }
  revalidatePath("/admin/leads");
  redirect(back.startsWith("/admin/leads") ? back : "/admin/leads");
}

/** Apaga a conversa (pedido do cliente pela LGPD, teste ou spam). */
export async function deleteLead(id: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("aurea_conversations").delete().eq("id", id);
  revalidatePath("/admin/leads");
  redirect("/admin/leads?apagado=1");
}
