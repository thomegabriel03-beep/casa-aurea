-- =====================================================================
-- CASA ÁUREA — 0010: captação de contato da Áurea
-- Cartão de contato no chat (nome, WhatsApp, e-mail, cidade, perfil, consentimento),
-- origem da visita e quantas mensagens a pessoa trocou.
-- Aditiva. Não remove dados. Pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novas colunas
-- ---------------------------------------------------------------------
alter table aurea_conversations add column if not exists city        text;
alter table aurea_conversations add column if not exists profile     text;          -- cliente | arquiteto | empresa
alter table aurea_conversations add column if not exists consent_at  timestamptz;   -- aceite da linha LGPD do cartão
alter table aurea_conversations add column if not exists source      jsonb;         -- utm_*, referrer, landing, device, first_at
alter table aurea_conversations add column if not exists contact_at  timestamptz;   -- quando deixou o contato pelo cartão
alter table aurea_conversations add column if not exists user_count  int not null default 0;  -- mensagens do visitante
alter table aurea_conversations add column if not exists lead_ref    uuid;          -- conversa em que o contato foi deixado (visita anterior)

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aurea_conversations_profile_chk') then
    alter table aurea_conversations add constraint aurea_conversations_profile_chk
      check (profile is null or profile in ('cliente','arquiteto','empresa'));
  end if;
end $$;
create index if not exists aurea_conversations_profile_idx on aurea_conversations(profile, created_at desc) where profile is not null;

-- ---------------------------------------------------------------------
-- 2. Cartão de contato (/api/aurea/contato). Cria ou atualiza a conversa e a marca como lead.
--    O visitante não lê nada; limites de tamanho e validação aqui também.
-- ---------------------------------------------------------------------
create or replace function aurea_contact(
  p_id uuid, p_lang text, p_name text, p_phone text, p_email text, p_city text, p_profile text, p_source jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_name    text := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ''), 80);
  v_phone   text := left(nullif(btrim(coalesce(p_phone, '')), ''), 30);
  v_email   text := lower(left(nullif(btrim(coalesce(p_email, '')), ''), 120));
  v_city    text := left(nullif(btrim(regexp_replace(coalesce(p_city, ''), '\s+', ' ', 'g')), ''), 80);
  v_profile text := case when p_profile in ('cliente','arquiteto','empresa') then p_profile end;
  v_source  jsonb := case when jsonb_typeof(p_source) = 'object' and octet_length(p_source::text) <= 3000 then p_source end;
  v_digits  int;
  is_new    boolean;
begin
  if p_id is null or v_name is null or length(regexp_replace(v_name, '[^[:alpha:]]', '', 'g')) < 2 then return false; end if;
  v_digits := length(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'));
  if v_phone is null or v_phone !~ '^\+?[0-9() .-]+$' or v_digits < 8 or v_digits > 15 then return false; end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then v_email := null; end if;
  is_new := not exists (select 1 from aurea_conversations where id = p_id);
  -- freio global: no máximo 120 conversas novas por minuto (o mesmo da aurea_log)
  if is_new and (select count(*) from aurea_conversations where created_at > now() - interval '1 minute') >= 120 then return false; end if;
  insert into aurea_conversations as c (id, lang, name, phone, email, city, profile, source, consent_at, contact_at, is_lead)
  values (p_id, case when p_lang in ('pt','en','es') then p_lang else 'pt' end,
          v_name, v_phone, v_email, v_city, v_profile, v_source, now(), now(), true)
  on conflict (id) do update set
    updated_at = now(),
    name       = excluded.name,
    phone      = excluded.phone,
    email      = coalesce(excluded.email, c.email),
    city       = coalesce(excluded.city, c.city),
    profile    = coalesce(excluded.profile, c.profile),
    source     = coalesce(c.source, excluded.source),
    consent_at = now(),
    contact_at = now(),
    is_lead    = true;
  return true;
end $$;
revoke execute on function aurea_contact(uuid, text, text, text, text, text, text, jsonb) from public;
grant  execute on function aurea_contact(uuid, text, text, text, text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. aurea_log: agora grava também a origem da visita (desde a 1ª mensagem), quantas mensagens
--    o visitante escreveu e liga a conversa ao contato deixado numa visita anterior (p_lead).
--    Os parâmetros novos têm valor padrão: a chamada antiga (9 parâmetros) continua funcionando.
--    O contato do cartão (contact_at) vale mais que o lido do texto da conversa.
-- ---------------------------------------------------------------------
drop function if exists aurea_log(uuid, text, jsonb, boolean, text, text, text, text, text[]);
create or replace function aurea_log(
  p_id uuid, p_lang text, p_turns jsonb, p_wa boolean,
  p_first text, p_name text, p_phone text, p_email text, p_pieces text[],
  p_source jsonb default null, p_lead uuid default null, p_user_count int default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  n int := coalesce(jsonb_array_length(case when jsonb_typeof(p_turns) = 'array' then p_turns end), -1);
  is_new boolean := not exists (select 1 from aurea_conversations where id = p_id);
  v_source jsonb := case when jsonb_typeof(p_source) = 'object' and octet_length(p_source::text) <= 3000 then p_source end;
  v_users int;
begin
  if p_id is null or n < 1 or n > 60 or octet_length(p_turns::text) > 200000 then return; end if;
  -- freio global: no máximo 120 conversas novas por minuto
  if is_new and (select count(*) from aurea_conversations where created_at > now() - interval '1 minute') >= 120 then return; end if;
  v_users := greatest(
    (select count(*) from jsonb_array_elements(p_turns) e where e->>'role' = 'user')::int,
    least(coalesce(p_user_count, 0), 10000));
  insert into aurea_conversations as c (id, lang, turns, turn_count, user_count, first_message, name, phone, email, pieces, wa_clicked, is_lead, source)
  values (p_id, case when p_lang in ('pt','en','es') then p_lang else 'pt' end, p_turns, n, v_users,
          left(p_first, 500), left(p_name, 80), left(p_phone, 30), left(p_email, 120),
          coalesce(p_pieces[1:20], '{}'), coalesce(p_wa, false),
          coalesce(p_wa, false) or p_phone is not null or p_email is not null, v_source)
  on conflict (id) do update set
    updated_at    = now(),
    lang          = excluded.lang,
    turns         = excluded.turns,
    turn_count    = excluded.turn_count,
    user_count    = greatest(c.user_count, excluded.user_count),
    first_message = coalesce(c.first_message, excluded.first_message),
    name          = case when c.contact_at is not null then c.name  else coalesce(excluded.name,  c.name)  end,
    phone         = case when c.contact_at is not null then c.phone else coalesce(excluded.phone, c.phone) end,
    email         = coalesce(c.email, excluded.email),
    pieces        = (select coalesce(array_agg(distinct x), '{}') from unnest(c.pieces || excluded.pieces) x),
    wa_clicked    = c.wa_clicked or excluded.wa_clicked,
    is_lead       = c.is_lead or excluded.is_lead,
    source        = coalesce(c.source, excluded.source);

  -- visita seguinte de quem já deixou contato: a conversa nova herda o contato e vira lead
  if p_lead is not null and p_lead <> p_id then
    update aurea_conversations c set
      name       = coalesce(c.name, l.name),
      phone      = coalesce(c.phone, l.phone),
      email      = coalesce(c.email, l.email),
      city       = coalesce(c.city, l.city),
      profile    = coalesce(c.profile, l.profile),
      consent_at = coalesce(c.consent_at, l.consent_at),
      contact_at = coalesce(c.contact_at, l.contact_at),
      lead_ref   = p_lead,
      is_lead    = true
    from aurea_conversations l
    where c.id = p_id and l.id = p_lead and l.contact_at is not null and c.lead_ref is distinct from p_lead;
  end if;
end $$;
revoke execute on function aurea_log(uuid, text, jsonb, boolean, text, text, text, text, text[], jsonb, uuid, int) from public;
grant  execute on function aurea_log(uuid, text, jsonb, boolean, text, text, text, text, text[], jsonb, uuid, int) to anon, authenticated;

-- contagem das conversas que já existiam
update aurea_conversations c
set user_count = (select count(*) from jsonb_array_elements(c.turns) e where e->>'role' = 'user')
where c.user_count = 0 and jsonb_typeof(c.turns) = 'array';

-- O visitante (anon) continua sem ler nada: RLS da 0008 segue valendo e as colunas novas não mudam isso.
revoke all on aurea_conversations from anon;
