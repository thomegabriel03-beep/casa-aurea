# Casa Áurea — aplicação oficial (site + catálogo + painel)

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4. Sem Framer Motion: todas as
animações são CSS + um único IntersectionObserver compartilhado.

## Primeira configuração (uma vez)

1. **Supabase**: crie o projeto e copie `URL`, `anon key` e `service_role key` para `.env.local` (modelo em `.env.example`).
2. **Banco**: aplique as migrações em ordem, sem pular nenhuma:
   ```bash
   supabase link --project-ref <ref>
   supabase db push          # 0001 → 0002 → 0003 → 0004
   ```
   (ou cole cada arquivo de `supabase/migrations/` no SQL Editor, na ordem.)
3. **Acesso ao painel**: em Authentication → Users crie o usuário da equipe; em Providers → Email desative
   “Allow new users to sign up”. Depois, no SQL Editor:
   ```sql
   insert into catalog_admins (user_id) select id from auth.users where email = 'email@casaaurea.com.br';
   ```
4. **Fotos do Natal** (pasta `originais` do pacote de mídia):
   ```bash
   npm run seed:natal -- caminho/para/originais
   ```
5. **Rodar**:
   ```bash
   npm install
   npm run dev                  # http://localhost:3000  ·  painel em /admin
   npm run typecheck && npm run lint && npm test && npm run build
   ```

## Validação de ponta a ponta (Missão 1)

Com o banco migrado, o usuário admin criado e o app rodando (`npm run build && npm start`):

```bash
ADMIN_EMAIL=… ADMIN_PASSWORD=… APP_URL=http://localhost:3000 npm run validate
```

O script testa migrações, conexão, autenticação (admin, não-admin, redirecionamento), o ciclo completo do
produto, Storage, privacidade (tabelas e HTML público), coleções, Natal, busca, pendências, duplicidade e
as rotas públicas. Cria só registros “[TESTE-M1]” e os remove no final.

## Catálogo

- **Backend = amplitude, frontend = curadoria.** Toda peça nasce *interna* e no *acervo*. Ela só
  aparece no site quando fica **Pública** e em **Curated/Signature**. Dentro de uma coleção, basta estar pública.
- **Código Casa Áurea** `CA-[TIPO]-0000`: gerado pelo banco a partir do tipo, único e imutável.
  As variantes recebem `-V01`, `-V02`…
- **Privacidade:** o site lê só as views `public_*`. Fornecedor, catálogo, código original, custos e
  notas internas nunca saem do banco para o público (o RLS fecha as tabelas-base para visitantes).
- **Rotas públicas:** `/moveis`, `/moveis/[tipo]`, `/outdoor`, `/colecoes`, `/colecoes/[slug]` (inclui `/colecoes/natal`) e `/produto/[slug]`.
- **Painel** `/admin`: dashboard, produtos (abas: geral, comercial, variantes, materiais, mídia, coleções,
  curadoria, origem, pendências), coleções, importações (CSV), mídia, fornecedores, catálogos, tipos/subtipos,
  materiais, acabamentos, tags e configurações.
- **Coleção em destaque:** ativa + destaque + dentro do período ⇒ aparece na Home e no topo de `/colecoes`.
  Fora do período ela sai do site sozinha; nada é apagado.

Enquanto `NEXT_PUBLIC_WHATSAPP_NUMBER` estiver vazio, todos os botões de WhatsApp abrem o
formulário de qualificação, que mostra a mensagem que será enviada. Com o número preenchido,
o formulário abre o WhatsApp com a mensagem estruturada.

Para esconder as marcações de conteúdo pendente: `NEXT_PUBLIC_SHOW_PENDING=false`.

## Estrutura

```
src/
  app/            layout, home, privacidade, termos, sitemap, robots, OG image
  config/site.ts  dados da empresa (endereço, contato, horários, legais)
  data/           conteúdo editável: mídia, ambientes, coleções, instagram, depoimentos, formulário
  lib/            whatsapp, analytics (eventos), schema.org, utilitários
  components/
    layout/       Header, MobileMenu, Footer, WhatsAppButton, Logo, Analytics
    sections/     Hero, Manifesto, AmbientGallery, ProductCategories, ConsultingSection,
                  ShowroomSection, FounderSection, SocialProof, ProfessionalSection, InstagramSection
    lead/         LeadFormProvider (contexto) e LeadDialog (carregado sob demanda)
    ui/           Media, DoorReveal, Pending, WhatsAppLink
```

## Como adicionar o material real

- **Fotos:** salve em `public/images/` e preencha `src` no item correspondente em `src/data/`.
  O placeholder some automaticamente.
- **Categorias:** `active: true` em `src/data/collections.ts`.
- **Ambientes:** preencha `category` em `src/data/environments.ts`; os filtros aparecem sozinhos
  quando houver 2+ categorias.
- **Depoimentos:** `src/data/testimonials.ts`; a seção aparece sozinha.
- **Horários:** `confirmed: true` em `src/config/site.ts` libera no schema.org.
- **CMS (Sanity/Supabase):** os tipos em `src/data/*` já são o contrato. Basta trocar os imports
  por funções `async` que busquem do CMS nas seções (que já são Server Components, exceto
  as interativas).

## Eventos de analytics

`click_whatsapp`, `lead_started`, `lead_completed`, `showroom_directions`, `instagram_click`,
`professional_contact` — disparados via `track()` em `src/lib/analytics.ts` para GTM, GA4 e Meta
Pixel (só carregam se os IDs estiverem no `.env`).

Veja `PENDING_INFORMATION.md` para tudo que falta receber.
