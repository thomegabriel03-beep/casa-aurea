import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSiteItems } from "@/lib/catalog/site-feed";

/* Página inicial do site público (servida em "/" por next.config.ts).
   É a experiência aprovada (public/site/index.html) com as peças publicadas no painel
   embutidas: Vitrine e Acervo aparecem no site sem novo deploy.
   A página fica em cache e é refeita quando o painel muda uma peça (revalidatePath)
   ou, no máximo, a cada 5 minutos. */

export const revalidate = 300;

const SLOT = '<script type="application/json" id="dbFixture">[]</script>';

let template: string | null = null;

export async function GET() {
  template ??= await readFile(path.join(process.cwd(), "public", "site", "index.html"), "utf8");
  let items: Awaited<ReturnType<typeof getSiteItems>> = [];
  try {
    items = await getSiteItems();
  } catch (e) {
    console.error("site: peças do banco indisponíveis", e);
    // fora do build, falhar mantém no ar a última versão boa (em vez de sumir com as peças)
    if (process.env.NEXT_PHASE !== "phase-production-build") throw e;
  }
  const json = JSON.stringify(items).replace(/</g, "\\u003c");
  const html = template.replace(SLOT, `<script type="application/json" id="dbFixture">${json}</script>`);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
