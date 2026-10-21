-- =====================================================================
-- CASA ÁUREA — 0009: orçamento de móveis (custo interno + margem por orçamento)
-- * product_costs: preço de CUSTO de cada peça, em tabela separada (nunca coluna em products),
--   para que nenhuma view pública consiga expor o custo. Só administradores leem e gravam.
-- * quote_docs passa a aceitar kind 'moveis' (orçamentos de móveis do painel).
-- Idempotente: pode rodar mais de uma vez no SQL Editor.
-- =====================================================================

-- 1. Custo interno por peça ------------------------------------------------
create table if not exists product_costs (
  product_id  uuid primary key references products(id) on delete cascade,
  cost        numeric(12,2) not null check (cost >= 0),
  source      text,                                  -- 'painel' | 'planilha'
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

create or replace function product_costs_touch() returns trigger language plpgsql
set search_path = public, pg_catalog as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
drop trigger if exists product_costs_touch on product_costs;
create trigger product_costs_touch before insert or update on product_costs
  for each row execute function product_costs_touch();

alter table product_costs enable row level security;
drop policy if exists "admin_product_costs" on product_costs;
create policy "admin_product_costs" on product_costs for all
  using (is_catalog_admin()) with check (is_catalog_admin());
-- visitante anônimo não tem nenhum acesso (nem com RLS): o Supabase concede por padrão, aqui retiramos
revoke all on product_costs from anon, public;
grant select, insert, update, delete on product_costs to authenticated;

-- 2. Orçamentos de móveis no mesmo armazenamento dos demais (só admin, RLS de 0007) --
alter table quote_docs drop constraint if exists quote_docs_kind_check;
alter table quote_docs add constraint quote_docs_kind_check
  check (kind in ('cfg', 'tecido', 'persiana', 'orcamento', 'moveis'));
revoke all on quote_docs from anon, public;

-- 3. Trava de segurança: nenhuma view pública pode ler product_costs ----------------
do $$
begin
  if exists (select 1 from information_schema.view_table_usage
             where table_schema = 'public' and table_name = 'product_costs') then
    raise exception 'Alguma view lê product_costs. O custo é interno e não pode aparecer em views.';
  end if;
  if exists (select 1 from information_schema.columns c
             where c.table_schema = 'public' and c.table_name like 'public\_%' and c.column_name ilike '%cost%') then
    raise exception 'Uma view public_* tem coluna de custo. Revise antes de continuar.';
  end if;
end $$;
