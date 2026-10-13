# Casa Áurea — Fechamento técnico (roteiro)

Tudo abaixo roda **no seu computador** (ou num servidor), com internet. Cada passo pode ser
repetido sem estragar nada.

## 0. O que ter em mãos
- Esta pasta do projeto (`casa-aurea`) e a pasta `catalogos/` com os 15 pacotes `.zip`.
- Projeto criado no Supabase: **Project URL**, **anon key** e **service_role key**
  (Supabase → Project Settings → API).
- Node 20+ e Python 3.11+. No Mac: `brew install poppler supabase/tap/supabase`.
- E-mail do administrador do painel.

## 1. Variáveis de ambiente
Crie `.env.local` na raiz do projeto:
```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_WHATSAPP_NUMBER=5548984576227
NEXT_PUBLIC_SITE_URL=https://SEU-DOMINIO
```
A `service_role` nunca vai para o navegador nem para a Vercel com prefixo `NEXT_PUBLIC_`.

## 2. Instalar e verificar o código
```bash
npm install
npm run typecheck && npm run lint && npm test && npm run build
```

## 3. Banco (migrações 0001–0006)
```bash
supabase login
supabase link --project-ref SEU-PROJECT-REF
supabase db push --dry-run     # confira a lista
supabase db push
```

## 4. Primeiro administrador
1. Supabase → Authentication → Users → **Add user** (e-mail + senha).
2. SQL Editor:
```sql
insert into catalog_admins (user_id)
select id from auth.users where email = 'EMAIL@DO-ADMIN';
```

## 5. Validação da Missão 1
```bash
npm run dev    # em outro terminal
ADMIN_EMAIL=... ADMIN_PASSWORD=... APP_URL=http://localhost:3000 npm run validate
```

## 6. Importar os 15 catálogos (sem reprocessar PDF)
```bash
cd worker
pip install -r requirements.txt
export SUPABASE_URL=https://SEU-PROJETO.supabase.co SUPABASE_SERVICE_ROLE_KEY=...
python -m casa_aurea_import.import_all --dir ../catalogos --dry-run   # confere: 15 pacotes
python -m casa_aurea_import.import_all --dir ../catalogos
```
Tudo entra como **interno + acervo**. Rodar de novo pula o que já foi importado.

## 7. Publicar a seleção da curadoria
O Rafa marca as peças no painel de curadoria e clica **Copiar seleção**. Cole o texto num arquivo
`import/selecao-rafa.txt` (enquanto ele não manda, use `import/selecao-lancamento-sugerido.txt`).
```bash
python -m casa_aurea_import.publish --selection ../import/selecao-rafa.txt --dry-run
python -m casa_aurea_import.publish --selection ../import/selecao-rafa.txt
```
- `SITE` → público na vitrine; `DESTAQUE` → vitrine em destaque; `ACERVO` → público em /acervo e na busca, fora da vitrine.
- No painel (Produtos), cada peça tem os botões **Vitrine | Acervo | Oculta**, e o botão **Liberar no acervo as peças com foto boa** libera de uma vez as peças internas com tipo confirmado e foto principal aprovada.
- Peças sem tipo confirmado não são publicadas: defina o tipo no painel e rode de novo.
- Antes de publicar, revise no painel os **nomes** das peças que vieram de páginas de coleção
  (ex.: "Sofás (Coleção Ger)", "Poltrona -PLT040 (Coleção Belgin)") e dê um nome de vitrine.

## 8. Publicar o site (Vercel)
1. Suba o projeto para um repositório no GitHub.
2. Vercel → New Project → importe o repositório.
3. Environment Variables: as mesmas do `.env.local` (com `NEXT_PUBLIC_SITE_URL` = domínio final).
4. Deploy. Depois, aponte o domínio em Vercel → Domains.

## 9. Conferência final
- Site: Home, Móveis, Outdoor, Coleções, uma página de peça e o botão de WhatsApp.
- Painel: login, Produtos, Fila de revisão (com "Ver página original").
- Nenhum fornecedor, código original ou catálogo aparece no site público.
