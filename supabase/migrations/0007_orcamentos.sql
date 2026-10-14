-- =====================================================================
-- CASA ÁUREA — ORÇAMENTOS de cortinas e persianas (painel)
-- Um documento por registro: preços e regras (cfg), tecidos, modelos de persiana e orçamentos.
-- Só administradores leem e gravam. Nada disso aparece no site público.
-- =====================================================================
create table if not exists quote_docs (
  kind        text not null check (kind in ('cfg', 'tecido', 'persiana', 'orcamento')),
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (kind, id)
);

create index if not exists quote_docs_kind_idx on quote_docs (kind, updated_at desc);

create or replace function quote_docs_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
drop trigger if exists quote_docs_touch on quote_docs;
create trigger quote_docs_touch before insert or update on quote_docs for each row execute function quote_docs_touch();

alter table quote_docs enable row level security;
drop policy if exists "admin_quote_docs" on quote_docs;
create policy "admin_quote_docs" on quote_docs for all using (is_catalog_admin()) with check (is_catalog_admin());
revoke all on quote_docs from anon;
grant select, insert, update, delete on quote_docs to authenticated;
