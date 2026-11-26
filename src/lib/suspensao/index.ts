/* Suspensão do site (decisão comercial da Vetra, ex.: pagamento em atraso).
   Liga com a variável SITE_SUSPENSO=true na Vercel (Production) + Redeploy; desliga apagando a variável + Redeploy.
   Só o site público e a Áurea ficam suspensos: o painel /admin, as páginas legais e os dados da loja seguem intactos. */

export const siteSuspenso = (): boolean => (process.env.SITE_SUSPENSO || "").trim().toLowerCase() === "true";

const VETRA_WA = "5547988305889";

export function paginaSuspensa(): Response {
  const html = `<!doctype html>
<html lang="pt-BR" style="color-scheme:dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Site temporariamente suspenso</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{display:grid;place-items:center;padding:24px;background:#0f1628;color:#efe8dd;
       font-family:"Jost","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
  main{max-width:520px;text-align:center}
  .line{width:56px;height:1px;background:#cfae82;margin:0 auto 28px;opacity:.8}
  .eb{margin:0 0 18px;font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#cfae82}
  h1{margin:0;font-family:"Bodoni Moda","Didot","Times New Roman",serif;font-weight:400;
     font-size:clamp(30px,6vw,44px);line-height:1.1;letter-spacing:-.01em}
  p{margin:20px 0 0;font-size:15px;line-height:1.7;color:rgb(239 232 221/.72)}
  a{color:#efe8dd;text-underline-offset:4px;text-decoration-color:rgb(207 174 130/.6)}
  small{display:block;margin-top:44px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgb(239 232 221/.4)}
</style>
</head>
<body>
<main>
  <div class="line"></div>
  <p class="eb">Aviso</p>
  <h1>Site temporariamente suspenso</h1>
  <p>Este site está fora do ar no momento.</p>
  <p>Se você é responsável por este site, entre em contato com a
     <a href="https://wa.me/${VETRA_WA}" rel="noopener">Vetra pelo WhatsApp</a> para regularizar.</p>
  <small>Vetra · Digital Business Company</small>
</main>
</body>
</html>`;
  // 503 + Retry-After: o Google entende que é temporário e não tira o site do índice de imediato
  return new Response(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "retry-after": "86400", "cache-control": "no-store" },
  });
}
