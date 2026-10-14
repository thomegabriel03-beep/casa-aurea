import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFicha } from "@/lib/catalog/ficha";

/* Dados da ficha de apresentação (só campos visíveis ao cliente). Exige administrador. */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "login" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_catalog_admin");
  if (!isAdmin) return NextResponse.json({ error: "sem-permissao" }, { status: 403 });
  const ficha = await getFicha(supabase, id);
  if (!ficha) return NextResponse.json({ error: "nao-encontrada" }, { status: 404 });
  return NextResponse.json(ficha, { headers: { "Cache-Control": "private, max-age=60" } });
}
