-- =====================================================================
-- CASA ÁUREA — 0008: conversas e leads da Áurea + ajustes de segurança
-- Aditiva. Não remove dados. Pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Conversas da Áurea (uma linha por conversa; vira "lead" quando a
--    pessoa deixa WhatsApp/e-mail na conversa ou clica para falar com a equipe)
-- ---------------------------------------------------------------------
create table if not exists aurea_conversations (
  id          uuid primary key,                 -- gerado no navegador (uma conversa por aba)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  lang        text not null default 'pt' check (lang in ('pt','en','es')),
  turns       jsonb not null default '[]'::jsonb,   -- [{role, content}], no máximo 60
  turn_count  int not null default 0,
  first_message text,                           -- o que a pessoa procurava (1ª mensagem)
  name        text,                             -- quando a pessoa diz o nome na conversa
  phone       text,                             -- WhatsApp/telefone digitado na conversa
  email       text,
  pieces      text[] not null default '{}',     -- peças que a Áurea indicou ("Nome · CA-XXX-0000")
  wa_clicked  boolean not null default false,   -- clicou em "Falar com a equipe no WhatsApp"
  is_lead     boolean not null default false,
  status      text not null default 'novo' check (status in ('novo','em_contato','convertido','perdido','descartado')),
  notes       text,                             -- anotações da equipe
  handled_at  timestamptz
);
create index if not exists aurea_conversations_created_idx on aurea_conversations(created_at desc);
create index if not exists aurea_conversations_lead_idx on aurea_conversations(is_lead, status, created_at desc);

alter table aurea_conversations enable row level security;
drop policy if exists admin_aurea_conversations on aurea_conversations;
create policy admin_aurea_conversations on aurea_conversations
  for all using (is_catalog_admin()) with check (is_catalog_admin());
revoke all on aurea_conversations from anon;
grant select, update, delete on aurea_conversations to authenticated;

-- ---------------------------------------------------------------------
-- 2. Registro feito pelo servidor do site (/api/aurea/registro).
--    O visitante não lê nem altera nada: a função só grava a própria conversa,
--    com limites de tamanho e um freio global contra abuso.
-- ---------------------------------------------------------------------
create or replace function aurea_log(
  p_id uuid, p_lang text, p_turns jsonb, p_wa boolean,
  p_first text, p_name text, p_phone text, p_email text, p_pieces text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  n int := coalesce(jsonb_array_length(case when jsonb_typeof(p_turns) = 'array' then p_turns end), -1);
  is_new boolean := not exists (select 1 from aurea_conversations where id = p_id);
begin
  if p_id is null or n < 1 or n > 60 or octet_length(p_turns::text) > 200000 then return; end if;
  -- freio global: no máximo 120 conversas novas por minuto
  if is_new and (select count(*) from aurea_conversations where created_at > now() - interval '1 minute') >= 120 then return; end if;
  insert into aurea_conversations as c (id, lang, turns, turn_count, first_message, name, phone, email, pieces, wa_clicked, is_lead)
  values (p_id, case when p_lang in ('pt','en','es') then p_lang else 'pt' end, p_turns, n,
          left(p_first, 500), left(p_name, 80), left(p_phone, 30), left(p_email, 120),
          coalesce(p_pieces[1:20], '{}'), coalesce(p_wa, false),
          coalesce(p_wa, false) or p_phone is not null or p_email is not null)
  on conflict (id) do update set
    updated_at    = now(),
    lang          = excluded.lang,
    turns         = excluded.turns,
    turn_count    = excluded.turn_count,
    first_message = coalesce(c.first_message, excluded.first_message),
    name          = coalesce(excluded.name, c.name),
    phone         = coalesce(excluded.phone, c.phone),
    email         = coalesce(excluded.email, c.email),
    pieces        = (select coalesce(array_agg(distinct x), '{}') from unnest(c.pieces || excluded.pieces) x),
    wa_clicked    = c.wa_clicked or excluded.wa_clicked,
    is_lead       = c.is_lead or excluded.is_lead;
end $$;
revoke execute on function aurea_log(uuid, text, jsonb, boolean, text, text, text, text, text[]) from public;
grant  execute on function aurea_log(uuid, text, jsonb, boolean, text, text, text, text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Segurança (avisos do linter do Supabase): toda função com search_path fixo
-- ---------------------------------------------------------------------
do $$ declare f record; begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proconfig is null
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_catalog', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Privacidade das fotos: o site só recebe fotos limpas
--    (sem texto do catálogo, sem marca d'água, com nota boa). As demais continuam no painel.
-- ---------------------------------------------------------------------
create or replace view public_product_media as
select m.product_id, m.type, m.url, m.alt, m.width, m.height, m.focal_point, m.poster_url, m.sort_order, m.is_primary
from product_media m join products p on p.id = m.product_id
where p.visibility = 'public' and m.status = 'active'
  and coalesce(m.has_text, false) = false
  and coalesce(m.watermark, false) = false
  and coalesce(m.quality, 'CATALOG_READY') in ('CATALOG_READY', 'DETAIL_ACCEPTABLE');
