import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSiteFeed } from "@/lib/catalog/site-feed";

/* Página inicial do site público (servida em "/" por next.config.ts).
   É a experiência aprovada (public/site/index.html) com as peças publicadas no painel
   embutidas: Vitrine e Acervo aparecem no site sem novo deploy.
   A página fica em cache e é refeita quando o painel muda uma peça (revalidatePath)
   ou, no máximo, a cada 5 minutos. */

export const revalidate = 300;

const SLOT = '<script type="application/json" id="dbFixture">[]</script>';

const LAUNCH = /(<script[^>]*id="launchFixture"[^>]*>)[\s\S]*?(<\/script>)/;

let template: string | null = null;

export async function GET() {
  template ??= await readFile(path.join(process.cwd(), "public", "site", "index.html"), "utf8");
  let feed: Awaited<ReturnType<typeof getSiteFeed>> = { items: [], linked: false };
  try {
    feed = await getSiteFeed();
  } catch (e) {
    console.error("site: peças do banco indisponíveis", e);
    // fora do build, falhar mantém no ar a última versão boa (em vez de sumir com as peças)
    if (process.env.NEXT_PHASE !== "phase-production-build") throw e;
  }
  const json = JSON.stringify(feed.items).replace(/</g, "\\u003c");
  let html = template.replace(SLOT, `<script type="application/json" id="dbFixture">${json}</script>`);
  // seleção de lançamento já ligada ao banco: o banco passa a ser a única fonte (o painel controla tudo)
  if (feed.linked) html = html.replace(LAUNCH, '$1[]$2');
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
