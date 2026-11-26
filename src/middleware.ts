import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { paginaSuspensa, siteSuspenso } from "@/lib/suspensao";

export async function middleware(request: NextRequest) {
  const p = request.nextUrl.pathname;
  // site suspenso (SITE_SUSPENSO=true na Vercel): o site público mostra o aviso; o painel segue funcionando
  if (!p.startsWith("/admin")) {
    if (siteSuspenso()) return paginaSuspensa();
    return;
  }
  return updateSession(request);
}

export const config = { matcher: ["/", "/site-html", "/admin/:path*"] };
