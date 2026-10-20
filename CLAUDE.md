# Casa Áurea — instruções do projeto (padrão Vetra)

Responda e escreva textos de interface em português do Brasil.

## Cliente
- **Casa Áurea**: mobiliário, decoração e interiores, com showroom na Av. Valério Gomes, 42, Centro, Tijucas (SC).
- Sócios: Rafa (Rafael) Müller e Camila Santiago.
- Pacote contratado com a Vetra: **Site + Áurea IA** (site, catálogo, painel e concierge com IA).
- Desenvolvido pela Vetra (Gabriel e Monique).

## Stack
Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (banco, login do painel, storage) · Vercel (região `gru1`).
- Site público = experiência aprovada V62 em `public/site/index.html`, gerada por `scripts/build_public_site.py`
  a partir de `reference/preview/casa-aurea-preview.html`. Servida em `/` por `src/app/site-html/route.ts`, que embute
  as peças do banco e faz os ajustes técnicos de servidor (SEO, ícone, links legais).
- Rotas internas do site usam hash (`/#/moveis`, `/#/produto/slug`); `next.config.ts` redireciona `/moveis` etc.
- Painel em `/admin`; Áurea IA em `POST /api/aurea` (Claude API no servidor, modelo em `AUREA_MODEL`,
  padrão `claude-haiku-4-5-20251001`; sem chave, o site usa o motor local de respostas).

## Links
- Repositório: https://github.com/thomegabriel03-beep/casa-aurea (branch `main`)
- Vercel: projeto `casa-aurea` (`prj_aEPRO5WSYSXpOsJH9B0tD1crxwzW`), time `vetra-digital-business`
  · prévia protegida: https://casa-aurea-vetra-digital-business.vercel.app
  · atenção: `casa-aurea.vercel.app` **não** é este projeto (é outro site).
- Supabase: projeto "CASA ÁUREA", ref `orpdbmqrtokddyeopgzi` (us-east-2) · https://orpdbmqrtokddyeopgzi.supabase.co
- Domínio oficial: **acasaaurea.com.br** (comprado na Hostinger em out/2026; site em `https://www.acasaaurea.com.br`).
- Instagram: https://www.instagram.com/a.casaaurea · Linktree: https://linktr.ee/casa_aurea

## Regras que nunca mudam
1. **Visual V62 congelado.** `reference/preview/casa-aurea-preview.html` (V62) é a referência aprovada pelo cliente.
   Layout, textos (PT/EN/ES), espaçamentos e comportamento ficam iguais.
   **Nenhuma mudança visual sem autorização expressa do Gabriel.** Correções técnicas (SEO, links, segurança,
   desempenho) são permitidas desde que não alterem o que se vê; na dúvida, pergunte.
2. **Privacidade do catálogo.** O site público nunca mostra fornecedor, código original, catálogo de origem, página,
   notas internas, notas de qualidade ou custos. O público lê só as views `public_*`; RLS fecha as tabelas-base.
3. **Importação.** Toda peça importada entra **interna + acervo**. Nada é publicado automaticamente.
   Sem IA generativa em massa sobre produtos.
4. **Segredos** (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) só no servidor, nunca com prefixo `NEXT_PUBLIC_`,
   nunca no repositório.
5. **Publicação:** nada vai para produção sem aprovação do Gabriel.

Antes de cada entrega: `npm run typecheck && npm run lint && npm test && npm run build`.
Roteiro de infraestrutura: `FECHAMENTO.md`. Pendências de conteúdo do cliente: `PENDING_INFORMATION.md`.

## Pronto (15/10/2026)
- Site público V62 no Next, com peças do banco (Vitrine/Acervo controlados pelo painel, cache de 5 min).
- PT/EN/ES, filme de abertura, páginas Sobre, Curadoria, Materiais, Busca, Acervo, Móveis, Outdoor, Coleções, Natal, Produto.
- Formulário de curadoria → mensagem estruturada no WhatsApp (5548984576227). Botões de WhatsApp conferidos.
- Painel: produtos, coleções, importações, mídia, fornecedores, tipos, materiais, tags, configurações, ficha de
  apresentação e **Orçamentos** de cortinas/persianas.
- Banco: 1.097 peças importadas, 75 públicas, 1 admin; RLS ativo em todas as tabelas; cadastro público desligado;
  visitante anônimo não lê fornecedores, catálogos, referências de origem nem orçamentos (testado em 15/10/2026).
- Rodapé com crédito "Experiência digital by VETRA", links de Privacidade e Termos, mapa sem iframe do Google.
- Página inicial com canonical, Open Graph, Twitter Card e ícone (`src/app/icon.svg`).
- (18/10) Leads da Áurea: conversas registradas por `/api/aurea/registro` → função `aurea_log` (migração 0008);
  painel `/admin/leads` (status, anotações, conversa, CSV em `/admin/leads-csv`, relatório mensal).
- (18/10) Ação "Publicar peças no Acervo" (`worker/casa_aurea_import/publish_acervo.py`): publica só peças prontas
  (nome válido, tipo/código, foto CATALOG_READY sem texto/marca d'água, sem duplicidade); demais em planilha.
- (18/10) Migração 0008 aplicada; chave da Áurea na Vercel; 406 peças publicadas no Acervo (site com 477);
  campo Design limpo onde trazia fornecedor. Ação "Conferir o site no ar" (`check_site.py`) toda verde.
- (18/10) Notas de pendência só com `NEXT_PUBLIC_SHOW_PENDING=true`; search_path fixo em todas as funções.

## Pendente
- Domínio: apontar DNS da Hostinger para a Vercel e definir `NEXT_PUBLIC_SITE_URL=https://www.acasaaurea.com.br`.
- Conferir variáveis de produção na Vercel (o conector Claude/Vercel ainda não tem acesso ao time
  `vetra-digital-business`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_SITE_URL`.
- 616 peças internas para revisar no painel (planilha da ação "Publicar peças no Acervo"); rodar a ação de novo depois.
- Planos pagos antes do lançamento: Vercel Pro (uso comercial) e Supabase Pro (não pausar; proteção de senha vazada).
- Aviso de cookies (LGPD): obrigatório antes de ligar GA4/Meta Pixel/GTM; é mudança visual → precisa de autorização.
- SEO: as páginas internas usam `#/` e não são indexadas separadamente pelo Google (decisão de arquitetura).
- Supabase: endurecer avisos do linter (search_path das funções, EXECUTE de `is_catalog_admin`/`admin_search_products`,
  proteção de senha vazada no Auth).
- Conteúdo do cliente: ver `PENDING_INFORMATION.md` (CNPJ, razão social, e-mail, CEP, datas do Natal, textos legais etc.).

## Contatos
- Vetra: Gabriel (decisões, aprovação de visual e publicação) e Monique.
- Casa Áurea: Rafa Müller e Camila Santiago · WhatsApp comercial +55 48 98457-6227 · Instagram @a.casaaurea.
- E-mail do cliente e do admin do painel: **pendente**.
