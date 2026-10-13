# Casa Áurea — instruções do projeto

Site + catálogo + painel da Casa Áurea (mobiliário, decoração e interiores, showroom em Tijucas, SC).
Desenvolvido pela Vetra (Gabriel e Monique). Pacote contratado: **Site + Áurea IA**.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (banco, auth do painel, storage) · Vercel.
Responda e escreva textos de interface em português do Brasil.

## Regras que nunca mudam
1. **Visual congelado.** `reference/preview/casa-aurea-preview.html` (V62) é a referência oficial aprovada pelo cliente.
   Layout, textos (PT/EN/ES), espaçamentos e comportamento devem ficar iguais. Nenhuma mudança visual sem aprovação.
2. **Privacidade do catálogo.** O site público nunca mostra fornecedor, código original, catálogo de origem, página,
   notas internas, notas de qualidade ou custos. O público lê só as views `public_*`; RLS fecha as tabelas-base.
3. **Importação.** Toda peça importada entra **interna + acervo**. Nada é publicado automaticamente.
   Sem IA generativa em massa sobre produtos.
4. Segredos (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) só no servidor, nunca com prefixo `NEXT_PUBLIC_`.

## Etapa atual: portar a prévia para a produção
O app já tem catálogo público, painel e importador. Falta trazer o que só existe na prévia.
Leia `reference/README.md` antes de começar. Ordem sugerida (um PR por item, com build verde):

1. **Design system da prévia**: tokens, tipografia e CSS globais da prévia em `src/app/globals.css`.
2. **Header + idiomas**: seletor PT/EN/ES com globo no topo (sem seletor no rodapé); dicionário da prévia (`var I18N=`).
3. **Home**: filme de abertura com scroll (`public/film/d` 1920×1080, `public/film/m` retrato; motor `rec/kindFor/pick/nearest/draw`
   na prévia), categorias, faixa de números, "Quem assina" (retratos clicáveis → `/sobre#rafa` e `/sobre#camila`) **antes** do Showroom,
   Showroom sem endereço e com botão "Agendar uma visita", rodapé com mapa (Google Maps embed) e endereço.
4. **Páginas**: `/sobre` (Rafa & Camila), `/curadoria`, `/materiais`, `/busca` (busca por descrição), alinhar `/acervo`, `/moveis`,
   `/outdoor`, `/colecoes`, `/colecoes/natal`, `/produto/[slug]` ao layout da prévia.
5. **Áurea IA**: widget de conversa da prévia; rota `POST /api/aurea` chamando a Claude API no servidor com o prompt mestre
   (`reference/aurea/conc_kb.js`) + lista de peças públicas; marcadores `[[slug]]`, `[[go:ROTA]]`, `[[wa]]`; fallback local
   (`reference/aurea/conc_local.js`) quando a API falhar. Salvar conversas e leads (nome, contato, interesse, peças) no Supabase,
   com limite de taxa por IP.
6. **Painel**: Leads da Áurea (lista, status, exportar CSV, relatório mensal) e **Orçamentos** de cortinas e persianas
   (`reference/orcamentos/`, fórmula em `reference/README.md`, conferir 1.074,46 / 2.062,07 / 1.432,76 / 2.507,22),
   com tabelas `quote_settings`, `quote_fabrics`, `quote_blind_models`, `quotes`, `quote_items` e RLS só para admins.
   Menu lateral com rolagem própria e fundo azul inteiro (corrigido na V61 da prévia).
7. **Migração** `0007_aurea_leads_orcamentos.sql`.

Antes de cada entrega: `npm run typecheck && npm run lint && npm test && npm run build`.
Depois: roteiro de infraestrutura e publicação em `FECHAMENTO.md`.
