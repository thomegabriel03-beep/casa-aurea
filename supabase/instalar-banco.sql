-- =====================================================================
-- CASA ÁUREA — instalação completa do banco (migrações em ordem)
-- Cole tudo no Supabase → SQL Editor → New query → Run. Rodar uma única vez num banco novo.
-- =====================================================================

-- >>> 0001_catalog.sql
-- =====================================================================
-- CASA ÁUREA — CATÁLOGO: produtos, categorias, coleções
-- Postgres / Supabase. Na operação normal nada é apagado: usa-se status/active.
-- =====================================================================

create extension if not exists "pgcrypto";

create type product_status as enum ('draft','active','inactive');

create table categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  image_url   text,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table collections (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique,
  eyebrow            text,                      -- ex.: "Coleção de temporada"
  title_lines        text[],                    -- ex.: {'Natal','Casa Áurea'}
  subtitle           text,
  description        text,
  cover_image        text,
  mobile_cover_image text,
  cover_position     text default '50% 50%',    -- object-position da capa
  start_date         date,                      -- campanha: início (opcional)
  end_date           date,                      -- campanha: fim (opcional)
  featured           boolean not null default false,  -- destaque na Home e no menu
  active             boolean not null default true,
  sort_order         int not null default 0,
  seo_title          text,
  seo_description    text,
  og_image           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  slug              text not null unique,
  sku               text unique,
  short_description text,
  description       text,
  price             numeric(12,2),
  sale_price        numeric(12,2),
  category_id       uuid references categories(id) on delete set null,
  materials         text[],
  dimensions        text,                       -- texto livre: "L 320 × P 110 × A 75 cm"
  colors            text[],
  variants          jsonb not null default '[]'::jsonb,  -- [{name, sku?, price?, available?}]
  availability      text,                       -- ex.: "Pronta-entrega", "Sob encomenda"
  video_url         text,
  keywords          text[],
  featured          boolean not null default false,
  status            product_status not null default 'draft',
  sort_order        int not null default 0,
  whatsapp_message  text,                       -- mensagem personalizada opcional
  extra_info        text,
  seo_title         text,
  seo_description   text,
  og_image          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint sale_below_price check (sale_price is null or price is null or sale_price <= price)
);

create table product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  url         text not null,                    -- caminho no Storage (bucket "catalogo")
  alt         text,
  width       int,
  height      int,
  focal_point text default '50% 50%',
  sort_order  int not null default 0            -- 0 = foto principal
);

-- produto ↔ coleção (muitos para muitos, com ordem própria dentro de cada coleção)
create table product_collections (
  product_id    uuid not null references products(id) on delete cascade,
  collection_id uuid not null references collections(id) on delete cascade,
  sort_order    int not null default 0,
  primary key (product_id, collection_id)
);

create index products_status_idx     on products(status);
create index products_category_idx   on products(category_id);
create index product_images_prod_idx on product_images(product_id, sort_order);
create index product_coll_coll_idx   on product_collections(collection_id, sort_order);
-- busca por nome, SKU e palavras-chave (português)
-- array_to_string não é IMMUTABLE no Postgres; o índice precisa de uma versão imutável
create or replace function immutable_array_to_string(text[], text) returns text
  language sql immutable parallel safe as $$ select array_to_string($1, $2) $$;
create index products_search_idx on products using gin (
  to_tsvector('portuguese'::regconfig, coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(immutable_array_to_string(keywords,' '),''))
);

-- updated_at automático
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_categories  before update on categories  for each row execute function touch_updated_at();
create trigger t_collections before update on collections for each row execute function touch_updated_at();
create trigger t_products    before update on products    for each row execute function touch_updated_at();

-- coleção "no ar": ativa e dentro do período (datas vazias = sem limite)
create or replace view live_collections as
  select * from collections
  where active
    and (start_date is null or current_date >= start_date)
    and (end_date   is null or current_date <= end_date);

-- =====================================================================
-- SEGURANÇA (RLS): o público lê só o que está ativo; só admins escrevem.
-- Admins = usuários do Supabase Auth listados em catalog_admins.
-- =====================================================================
create table catalog_admins (user_id uuid primary key references auth.users(id) on delete cascade);
create or replace function is_catalog_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from catalog_admins where user_id = auth.uid())
$$;

alter table categories          enable row level security;
alter table collections         enable row level security;
alter table products            enable row level security;
alter table product_images      enable row level security;
alter table product_collections enable row level security;
alter table catalog_admins      enable row level security;

create policy "publico_le_categorias" on categories  for select using (active or is_catalog_admin());
create policy "publico_le_colecoes"   on collections for select using (active or is_catalog_admin());
create policy "publico_le_produtos"   on products    for select using (status = 'active' or is_catalog_admin());
create policy "publico_le_imagens"    on product_images      for select using (true);
create policy "publico_le_vinculos"   on product_collections for select using (true);

create policy "admin_categorias" on categories          for all using (is_catalog_admin()) with check (is_catalog_admin());
create policy "admin_colecoes"   on collections         for all using (is_catalog_admin()) with check (is_catalog_admin());
create policy "admin_produtos"   on products            for all using (is_catalog_admin()) with check (is_catalog_admin());
create policy "admin_imagens"    on product_images      for all using (is_catalog_admin()) with check (is_catalog_admin());
create policy "admin_vinculos"   on product_collections for all using (is_catalog_admin()) with check (is_catalog_admin());
create policy "admin_ve_admins"  on catalog_admins      for select using (is_catalog_admin());

-- Storage: criar o bucket público "catalogo" no painel do Supabase e
-- restringir upload/remoção a is_catalog_admin() nas políticas do bucket.

-- >>> 0002_catalog_architecture.sql
-- =====================================================================
-- CASA ÁUREA — MISSÃO 1: arquitetura definitiva do catálogo
-- Migração ADITIVA sobre 0001_catalog.sql. Não remove tabelas nem dados.
-- Princípio: backend = amplitude (tudo interno); frontend = curadoria (só o público).
-- =====================================================================

-- no Supabase, extensões ficam no schema "extensions"
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Enumerações
-- ---------------------------------------------------------------------
create type product_environment as enum ('indoor','outdoor','both');
create type commercial_status   as enum ('active','on_request','discontinued','unknown');
create type product_visibility  as enum ('internal','public','hidden','archived');
create type curation_tier       as enum ('archive','curated','signature');
create type media_type          as enum ('primary','gallery','editorial','ambient','detail','video','video_poster');
create type import_status       as enum ('uploaded','processing','imported','needs_review','reviewed','approved','failed');
create type quality_flag        as enum ('missingOriginalCode','missingDimensions','missingHighQualityImage','missingMaterial',
                                         'needsCopyReview','needsCommercialReview','possibleDuplicate');

-- unaccent imutável (necessário para índices)
create or replace function f_unaccent(text) returns text
  language sql immutable parallel safe strict as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- ---------------------------------------------------------------------
-- 2. Fornecedores e catálogos (administrativo; nunca exposto ao público)
-- ---------------------------------------------------------------------
create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  slug       text not null unique,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table catalogs (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete restrict,
  name        text not null,                 -- ex.: "ABIMAD 42", "Linha Basic"
  year        int,
  file_url    text,                          -- PDF/tabela de origem no Storage
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (supplier_id, name, year)
);

-- ---------------------------------------------------------------------
-- 3. Taxonomia: tipos, subtipos, materiais, acabamentos, tags
-- ---------------------------------------------------------------------
create table product_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z]{3}$'),   -- SOF, POL, MES...
  name        text not null,
  plural_name text,
  slug        text not null unique,          -- usado em /moveis/[slug]
  sort_order  int not null default 0,
  active      boolean not null default true
);

create table product_subtypes (
  id         uuid primary key default gen_random_uuid(),
  type_id    uuid not null references product_types(id) on delete cascade,
  name       text not null,
  slug       text not null,
  sort_order int not null default 0,
  active     boolean not null default true,
  unique (type_id, slug)
);

create table materials (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  slug   text not null unique,
  active boolean not null default true
);

create table finishes (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  slug   text not null unique,
  active boolean not null default true
);

create table tags (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

-- ---------------------------------------------------------------------
-- 4. Produto: evolução da tabela existente (colunas novas, nada removido)
-- ---------------------------------------------------------------------
alter table products
  add column public_code              text unique,
  add column product_type_id          uuid references product_types(id) on delete restrict,
  add column product_subtype_id       uuid references product_subtypes(id) on delete set null,
  add column environment              product_environment not null default 'indoor',
  add column editorial_description    text,
  add column supplier_id              uuid references suppliers(id) on delete set null,
  add column status_commercial        commercial_status not null default 'unknown',
  add column visibility               product_visibility not null default 'internal',
  add column curation_tier            curation_tier not null default 'archive',
  add column designer                 text,
  add column collection_name_original text,
  add column is_configurable          boolean not null default false,
  add column internal_notes           text,
  add column search_text              text;  -- desnormalizado para a busca universal (mantido por gatilho)

-- produtos já existentes (curadoria e Natal) continuam no ar: ativos viram públicos e curados
update products set visibility = 'public', curation_tier = 'curated', status_commercial = 'active'
 where status = 'active';

-- o subtipo precisa pertencer ao tipo do produto
create or replace function check_subtype_matches_type() returns trigger language plpgsql as $$
begin
  if new.product_subtype_id is not null and not exists (
    select 1 from product_subtypes s where s.id = new.product_subtype_id and s.type_id = new.product_type_id) then
    raise exception 'Subtipo não pertence ao tipo do produto';
  end if;
  return new;
end $$;
create trigger t_products_subtype before insert or update of product_type_id, product_subtype_id on products
  for each row execute function check_subtype_matches_type();

-- ---------------------------------------------------------------------
-- 5. Código Casa Áurea: CA-[TIPO]-[0000], único, gerado com trava, imutável
-- ---------------------------------------------------------------------
create table product_code_counters (
  type_id   uuid primary key references product_types(id) on delete restrict,
  last_seq  int not null default 0
);

create or replace function next_public_code(p_type_id uuid) returns text language plpgsql as $$
declare v_code text; v_seq int;
begin
  select code into v_code from product_types where id = p_type_id;
  if v_code is null then raise exception 'Tipo de produto inválido'; end if;
  insert into product_code_counters(type_id, last_seq) values (p_type_id, 1)
    on conflict (type_id) do update set last_seq = product_code_counters.last_seq + 1
    returning last_seq into v_seq;                 -- linha travada: sem corrida entre transações
  return 'CA-' || v_code || '-' || lpad(v_seq::text, 4, '0');
end $$;

create or replace function assign_public_code() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.public_code is null and new.product_type_id is not null then
      new.public_code := next_public_code(new.product_type_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.public_code is not null and new.public_code is distinct from old.public_code then
      raise exception 'O código Casa Áurea é imutável (%).', old.public_code;
    end if;
    -- produto antigo sem código recebe um quando ganhar tipo
    if old.public_code is null and new.public_code is null and new.product_type_id is not null then
      new.public_code := next_public_code(new.product_type_id);
    end if;
  end if;
  return new;
end $$;
create trigger t_products_code before insert or update on products
  for each row execute function assign_public_code();

alter table products add constraint public_code_format check (public_code is null or public_code ~ '^CA-[A-Z]{3}-[0-9]{4,}$');

-- ---------------------------------------------------------------------
-- 6. Variantes (medida, módulo, configuração, acabamento...) — não viram produtos
-- ---------------------------------------------------------------------
create table product_variants (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references products(id) on delete cascade,
  variant_code          text unique,         -- CA-SOF-0027-V01 (gerado)
  seq                   int not null,
  name                  text not null,       -- ex.: "220 cm", "Com chaise à esquerda"
  width_cm              numeric(8,1),
  height_cm             numeric(8,1),
  depth_cm              numeric(8,1),
  diameter_cm           numeric(8,1),
  configuration         text,
  arm_type              text,
  chaise_type           text,
  supplier_variant_code text,                -- administrativo
  price                 numeric(12,2),       -- opcional; exibição pública controlada pela peça
  commercial_status     commercial_status not null default 'unknown',
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (product_id, seq)
);

create or replace function assign_variant_code() returns trigger language plpgsql as $$
declare v_pc text;
begin
  if new.seq is null then
    select coalesce(max(seq),0) + 1 into new.seq from product_variants where product_id = new.product_id;
  end if;
  select public_code into v_pc from products where id = new.product_id for update;  -- serializa por produto
  if new.variant_code is null and v_pc is not null then
    new.variant_code := v_pc || '-V' || lpad(new.seq::text, 2, '0');
  end if;
  return new;
end $$;
create trigger t_variants_code before insert on product_variants
  for each row execute function assign_variant_code();

-- variantes que estavam no jsonb de 0001 viram linhas (sem apagar o jsonb)
insert into product_variants (product_id, seq, name, price)
select p.id, v.ord::int, v.item->>'name', nullif(v.item->>'price','')::numeric
from products p, jsonb_array_elements(p.variants) with ordinality as v(item, ord)
where jsonb_typeof(p.variants) = 'array' and jsonb_array_length(p.variants) > 0;

-- ---------------------------------------------------------------------
-- 7. Relações N:N: materiais, acabamentos, tags
-- ---------------------------------------------------------------------
create table product_materials (
  product_id  uuid not null references products(id) on delete cascade,
  material_id uuid not null references materials(id) on delete restrict,
  is_primary  boolean not null default false,
  primary key (product_id, material_id)
);
create table product_finishes (
  product_id uuid not null references products(id) on delete cascade,
  finish_id  uuid not null references finishes(id) on delete restrict,
  primary key (product_id, finish_id)
);
create table product_tags (
  product_id uuid not null references products(id) on delete cascade,
  tag_id     uuid not null references tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

-- ---------------------------------------------------------------------
-- 8. Mídia (substitui product_images, que é mantida e migrada)
-- ---------------------------------------------------------------------
create table product_media (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  type        media_type not null default 'gallery',
  url         text not null,
  alt         text,
  width       int,
  height      int,
  focal_point text default '50% 50%',
  poster_url  text,                          -- para vídeo
  sort_order  int not null default 0,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index product_media_one_primary on product_media(product_id) where is_primary;

insert into product_media (product_id, type, url, alt, width, height, focal_point, sort_order, is_primary)
select product_id, case when sort_order = 0 then 'primary'::media_type else 'gallery'::media_type end,
       url, alt, width, height, focal_point, sort_order, sort_order = 0
from product_images;

-- ---------------------------------------------------------------------
-- 9. Origem do produto (fornecedor/catálogo/página/código original)
-- ---------------------------------------------------------------------
create table product_source_references (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references products(id) on delete cascade,
  supplier_id            uuid references suppliers(id) on delete set null,
  catalog_id             uuid references catalogs(id) on delete set null,
  year                   int,
  page                   text,
  original_code          text,
  original_name          text,
  notes                  text,
  source_file_url        text,
  import_batch_id        uuid,               -- FK adicionada após import_batches
  created_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. Coleções: preparação para storytelling (sem efeitos agora)
-- ---------------------------------------------------------------------
alter table collections
  add column hero_media         text,
  add column hero_mobile_media  text,
  add column poster_image       text,
  add column story_enabled      boolean not null default false,
  add column story_type         text check (story_type is null or story_type in ('video_scroll','frame_sequence','sticky_story')),
  add column story_desktop_media text,
  add column story_mobile_media  text,
  add column story_height       text,        -- ex.: '600vh'
  add column theme              text,        -- ex.: 'dark', 'light'
  add column headline           text,
  add column manifesto          text;

-- destaques editoriais (Home, hero, campanhas) — signature por contexto
create table editorial_features (
  id            uuid primary key default gen_random_uuid(),
  placement     text not null,               -- 'home_hero', 'home_signature', 'collection_story'...
  product_id    uuid references products(id) on delete cascade,
  collection_id uuid references collections(id) on delete cascade,
  headline      text,
  body          text,
  media_url     text,
  sort_order    int not null default 0,
  start_date    date,
  end_date      date,
  active        boolean not null default true,
  check (product_id is not null or collection_id is not null)
);

-- ---------------------------------------------------------------------
-- 11. Importações e qualidade
-- ---------------------------------------------------------------------
create table import_batches (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete set null,
  catalog_id  uuid references catalogs(id) on delete set null,
  source_file text,
  status      import_status not null default 'uploaded',
  total_rows  int default 0,
  imported    int default 0,
  failed      int default 0,
  log         jsonb not null default '[]'::jsonb,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table product_source_references
  add constraint psr_import_batch_fk foreign key (import_batch_id) references import_batches(id) on delete set null;

-- flags manuais (revisões) e automáticas (calculadas pela view abaixo)
create table product_quality_flags (
  product_id  uuid not null references products(id) on delete cascade,
  flag        quality_flag not null,
  note        text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (product_id, flag)
);

-- pendências calculadas a partir dos dados reais
create or replace view product_quality_auto as
select p.id as product_id, f.flag
from products p
cross join lateral (values
  ('missingOriginalCode'::quality_flag,     not exists (select 1 from product_source_references r where r.product_id = p.id and r.original_code is not null)),
  ('missingDimensions'::quality_flag,       not exists (select 1 from product_variants v where v.product_id = p.id and (v.width_cm is not null or v.diameter_cm is not null))),
  ('missingHighQualityImage'::quality_flag, not exists (select 1 from product_media m where m.product_id = p.id and m.is_primary and coalesce(m.width,0) >= 1600)),
  ('missingMaterial'::quality_flag,         not exists (select 1 from product_materials pm where pm.product_id = p.id))
) as f(flag, hit)
where f.hit;

-- possível duplicidade: mesmo fornecedor + mesmo nome normalizado ou mesmo código original
-- (apenas sinaliza; consolidar é decisão humana)
create or replace view product_possible_duplicates as
select a.id as product_id, b.id as duplicate_of, 'same_supplier_name' as reason
from products a join products b
  on a.id < b.id and a.supplier_id = b.supplier_id and a.supplier_id is not null
 and lower(f_unaccent(a.name)) = lower(f_unaccent(b.name))
union
select ra.product_id, rb.product_id, 'same_original_code'
from product_source_references ra join product_source_references rb
  on ra.product_id < rb.product_id and ra.supplier_id = rb.supplier_id
 and ra.original_code is not null and ra.original_code = rb.original_code;

-- ---------------------------------------------------------------------
-- 12. Busca universal (admin): código CA, código original, nome, fornecedor,
--     catálogo, material, acabamento, tipo, subtipo, coleção, tag, ano.
-- ---------------------------------------------------------------------
create or replace function refresh_product_search_text(p_id uuid) returns void language sql as $$
  update products p set search_text = lower(f_unaccent(concat_ws(' ',
      p.public_code, p.name, p.sku, p.designer, p.collection_name_original,
      (select t.name || ' ' || coalesce(t.plural_name,'') from product_types t where t.id = p.product_type_id),
      (select s.name from product_subtypes s where s.id = p.product_subtype_id),
      (select su.name from suppliers su where su.id = p.supplier_id),
      (select string_agg(concat_ws(' ', su.name, c.name, r.year::text, r.original_code, r.original_name), ' ')
         from product_source_references r left join suppliers su on su.id = r.supplier_id left join catalogs c on c.id = r.catalog_id
        where r.product_id = p.id),
      (select string_agg(m.name, ' ') from product_materials pm join materials m on m.id = pm.material_id where pm.product_id = p.id),
      (select string_agg(f.name, ' ') from product_finishes pf join finishes f on f.id = pf.finish_id where pf.product_id = p.id),
      (select string_agg(co.name, ' ') from product_collections pc join collections co on co.id = pc.collection_id where pc.product_id = p.id),
      (select string_agg(tg.name, ' ') from product_tags pt join tags tg on tg.id = pt.tag_id where pt.product_id = p.id),
      (select string_agg(v.variant_code || ' ' || coalesce(v.supplier_variant_code,''), ' ') from product_variants v where v.product_id = p.id)
  ))) where p.id = p_id;
$$;

create or replace function trg_refresh_search() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'products' then
    if pg_trigger_depth() = 1 then perform refresh_product_search_text(new.id); end if;
  else
    perform refresh_product_search_text(coalesce(new.product_id, old.product_id));
  end if;
  return null;
end $$;
create trigger t_search_products  after insert or update on products                  for each row execute function trg_refresh_search();
create trigger t_search_variants  after insert or update or delete on product_variants for each row execute function trg_refresh_search();
create trigger t_search_sources   after insert or update or delete on product_source_references for each row execute function trg_refresh_search();
create trigger t_search_materials after insert or delete on product_materials          for each row execute function trg_refresh_search();
create trigger t_search_finishes  after insert or delete on product_finishes           for each row execute function trg_refresh_search();
create trigger t_search_colls     after insert or delete on product_collections        for each row execute function trg_refresh_search();
create trigger t_search_tags      after insert or delete on product_tags               for each row execute function trg_refresh_search();

select refresh_product_search_text(id) from products;

create index products_search_trgm on products using gin (search_text extensions.gin_trgm_ops);

-- função de busca do admin: termos combinados (todos precisam aparecer), filtros e paginação
create or replace function admin_search_products(
  q text default null,
  f_type uuid default null, f_supplier uuid default null,
  f_visibility product_visibility default null, f_curation curation_tier default null,
  f_status commercial_status default null, f_flag quality_flag default null,
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, public_code text, name text, type_name text, supplier_name text,
               status_commercial commercial_status, visibility product_visibility, curation_tier curation_tier,
               primary_image text, updated_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  if not is_catalog_admin() then raise exception 'Acesso restrito'; end if;
  return query
  with terms as (select unnest(regexp_split_to_array(lower(f_unaccent(trim(coalesce(q,'')))), '\s+')) as t),
  base as (
    select p.* from products p
    where (coalesce(q,'') = '' or not exists (select 1 from terms where t <> '' and p.search_text not like '%' || t || '%'))
      and (f_type is null or p.product_type_id = f_type)
      and (f_supplier is null or p.supplier_id = f_supplier)
      and (f_visibility is null or p.visibility = f_visibility)
      and (f_curation is null or p.curation_tier = f_curation)
      and (f_status is null or p.status_commercial = f_status)
      and (f_flag is null or exists (select 1 from product_quality_auto a where a.product_id = p.id and a.flag = f_flag)
                          or exists (select 1 from product_quality_flags m where m.product_id = p.id and m.flag = f_flag and not m.resolved))
  )
  select b.id, b.public_code, b.name, t.name, s.name, b.status_commercial, b.visibility, b.curation_tier,
         (select m.url from product_media m where m.product_id = b.id and m.is_primary limit 1),
         b.updated_at, count(*) over ()
  from base b
  left join product_types t on t.id = b.product_type_id
  left join suppliers s on s.id = b.supplier_id
  order by (b.public_code = upper(trim(coalesce(q,'')))) desc, b.updated_at desc
  limit least(p_limit, 200) offset p_offset;
end $$;

-- ---------------------------------------------------------------------
-- 13. Índices
-- ---------------------------------------------------------------------
create index products_type_idx       on products(product_type_id);
create index products_subtype_idx    on products(product_subtype_id);
create index products_supplier_idx   on products(supplier_id);
create index products_visibility_idx on products(visibility, curation_tier);
create index products_commercial_idx on products(status_commercial);
create index products_environment_idx on products(environment) where visibility = 'public';
create index variants_product_idx    on product_variants(product_id, sort_order);
create index media_product_idx       on product_media(product_id, sort_order);
create index psr_product_idx         on product_source_references(product_id);
create index psr_original_code_idx   on product_source_references(supplier_id, original_code);
create index catalogs_supplier_idx   on catalogs(supplier_id);
create index subtypes_type_idx       on product_subtypes(type_id);

-- ---------------------------------------------------------------------
-- 14. Camada pública: só o que é visibility = 'public', só campos seguros.
--     O público lê VIEWS; as tabelas-base ficam fechadas para anon.
-- ---------------------------------------------------------------------
create or replace view public_products as
select p.id, p.public_code, p.name, p.slug, p.short_description,
       coalesce(p.editorial_description, p.description) as description,
       t.code as type_code, t.name as type_name, t.slug as type_slug,
       s.name as subtype_name, s.slug as subtype_slug,
       p.environment, p.curation_tier, p.is_configurable, p.designer,
       p.seo_title, p.seo_description, p.og_image, p.sort_order, p.updated_at
from products p
left join product_types t on t.id = p.product_type_id
left join product_subtypes s on s.id = p.product_subtype_id
where p.visibility = 'public';

create or replace view public_product_variants as
select v.product_id, v.variant_code, v.name, v.width_cm, v.height_cm, v.depth_cm, v.diameter_cm,
       v.configuration, v.arm_type, v.chaise_type, v.sort_order
from product_variants v join products p on p.id = v.product_id
where p.visibility = 'public';

create or replace view public_product_media as
select m.product_id, m.type, m.url, m.alt, m.width, m.height, m.focal_point, m.poster_url, m.sort_order, m.is_primary
from product_media m join products p on p.id = m.product_id
where p.visibility = 'public';

create or replace view public_product_materials as
select pm.product_id, m.name, m.slug, pm.is_primary
from product_materials pm join materials m on m.id = pm.material_id join products p on p.id = pm.product_id
where p.visibility = 'public';

create or replace view public_product_finishes as
select pf.product_id, f.name, f.slug
from product_finishes pf join finishes f on f.id = pf.finish_id join products p on p.id = pf.product_id
where p.visibility = 'public';

create or replace view public_collection_products as
select pc.collection_id, pc.product_id, pc.sort_order
from product_collections pc join products p on p.id = pc.product_id join collections c on c.id = pc.collection_id
where p.visibility = 'public' and c.active;

-- views são lidas com os privilégios do dono (fecham as colunas internas)
grant select on public_products, public_product_variants, public_product_media,
                public_product_materials, public_product_finishes, public_collection_products,
                product_types, product_subtypes, materials, finishes to anon, authenticated;

-- tabelas-base: público não lê mais produtos/variantes/mídia diretamente
drop policy if exists "publico_le_produtos" on products;
drop policy if exists "publico_le_imagens"  on product_images;
create policy "admin_le_produtos" on products       for select using (is_catalog_admin());
create policy "admin_le_imagens"  on product_images for select using (is_catalog_admin());

-- RLS nas tabelas novas: escrita e leitura administrativa
do $$ declare t text; begin
  foreach t in array array['suppliers','catalogs','product_code_counters','product_variants','product_materials',
                           'product_finishes','product_tags','tags','product_media','product_source_references',
                           'editorial_features','import_batches','product_quality_flags'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all using (is_catalog_admin()) with check (is_catalog_admin())', 'admin_' || t, t);
  end loop;
end $$;
-- taxonomia: leitura pública, escrita admin
do $$ declare t text; begin
  foreach t in array array['product_types','product_subtypes','materials','finishes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (active or is_catalog_admin())', 'publico_le_' || t, t);
    execute format('create policy %I on %I for all using (is_catalog_admin()) with check (is_catalog_admin())', 'admin_' || t, t);
  end loop;
end $$;
-- destaques editoriais ativos são públicos (sem notas internas)
create policy "publico_le_destaques" on editorial_features for select using (active);

-- updated_at automático nas tabelas novas
create trigger t_suppliers before update on suppliers        for each row execute function touch_updated_at();
create trigger t_catalogs  before update on catalogs         for each row execute function touch_updated_at();
create trigger t_variants  before update on product_variants for each row execute function touch_updated_at();
create trigger t_imports   before update on import_batches   for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- 15. Dados iniciais: apenas taxonomia e fornecedores informados pela Casa Áurea.
--     Nenhum produto, medida, preço ou código de fornecedor é criado aqui.
-- ---------------------------------------------------------------------
insert into product_types (code, name, plural_name, slug, sort_order) values
 ('SOF','Sofá','Sofás','sofas',1), ('POL','Poltrona','Poltronas','poltronas',2), ('CAD','Cadeira','Cadeiras','cadeiras',3),
 ('BAQ','Banqueta','Banquetas','banquetas',4), ('MES','Mesa','Mesas','mesas',5), ('APA','Aparador','Aparadores','aparadores',6),
 ('BUF','Buffet','Buffets','buffets',7), ('RAC','Rack','Racks','racks',8), ('BCO','Banco','Bancos','bancos',9),
 ('PUF','Puff','Puffs','puffs',10), ('CAM','Cama','Camas','camas',11), ('COM','Cômoda','Cômodas','comodas',12),
 ('MCB','Mesa de cabeceira','Mesas de cabeceira','mesas-de-cabeceira',13), ('TAP','Tapete','Tapetes','tapetes',14),
 ('CAR','Carrinho / Bar','Carrinhos e bares','carrinhos-bar',15), ('BAL','Balanço','Balanços','balancos',16),
 ('ESP','Espreguiçadeira','Espreguiçadeiras','espreguicadeiras',17), ('OMB','Ombrelone','Ombrelones','ombrelones',18),
 ('ACC','Acessório','Acessórios','acessorios',19);

insert into product_subtypes (type_id, name, slug, sort_order)
select t.id, s.name, s.slug, s.ord from product_types t join (values
  ('MES','Jantar','jantar',1),('MES','Centro','centro',2),('MES','Lateral','lateral',3),('MES','Apoio','apoio',4),
  ('MES','Bistrô','bistro',5),('MES','Sofa table','sofa-table',6),('MES','Office','office',7),
  ('SOF','Fixo','fixo',1),('SOF','Modular','modular',2),('SOF','Retrátil','retratil',3),('SOF','Reclinável','reclinavel',4),
  ('SOF','Retrátil e reclinável','retratil-reclinavel',5),('SOF','Sofá-cama','sofa-cama',6),('SOF','Chaise','chaise',7),
  ('POL','Fixa','fixa',1),('POL','Giratória','giratoria',2),('POL','Reclinável','reclinavel',3),('POL','Elétrica','eletrica',4),('POL','Balanço','balanco',5)
) as s(type_code, name, slug, ord) on s.type_code = t.code;

insert into materials (name, slug) values
 ('Couro','couro'),('Mármore','marmore'),('Travertino','travertino'),('Pedra natural','pedra-natural'),('Nogueira','nogueira'),
 ('Carvalho','carvalho'),('Cinamomo','cinamomo'),('Eucalipto','eucalipto'),('Metal','metal'),('Alumínio','aluminio'),
 ('Vidro','vidro'),('Tecido','tecido'),('Bouclé','boucle'),('Corda náutica','corda-nautica'),('Fibra sintética','fibra-sintetica'),
 ('Tela sling','tela-sling'),('Rattan','rattan'),('Madeira maciça','madeira-macica'),('Linho','linho'),('Cerâmica','ceramica');

insert into finishes (name, slug) values
 ('Champagne','champagne'),('Grafite','grafite'),('Preto','preto'),('Fendi','fendi'),('Natural','natural'),('Imbuia','imbuia'),
 ('Castanho','castanho'),('Laca','laca'),('Brilho','brilho'),('Fosco','fosco'),('Ebanizado','ebanizado'),('Bronze','bronze'),('Cromo','cromo');

insert into suppliers (name, slug) values
 ('Brazil Contemporâneo','brazil-contemporaneo'),('UNIQ','uniq'),('Faruk','faruk'),('Di Qualitá','di-qualita'),('Tellaio','tellaio'),
 ('Linha Elleganza','linha-elleganza'),('CCL Móveis','ccl-moveis'),('Heitor Móveis','heitor-moveis'),('Aço Mobília','aco-mobilia'),
 ('Tavolo D''Oro','tavolo-doro'),('Estofados Pirâmide','estofados-piramide'),('Self Design','self-design'),
 ('Benita Casa','benita-casa'),('Móveis Cacique','moveis-cacique');
-- Catálogos (15) serão cadastrados com nome e ano reais de cada PDF; Heitor Móveis terá mais de um.

-- >>> 0003_storage_public_security.sql
-- =====================================================================
-- CASA ÁUREA — 0003: Storage, ajustes da camada pública e segurança
-- Aditiva. Não remove dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Seções de navegação dos tipos (/moveis, natal, decoração...)
-- ---------------------------------------------------------------------
alter table product_types add column section text not null default 'moveis'
  check (section in ('moveis','decoracao','natal','outros'));

-- ---------------------------------------------------------------------
-- 2. Preço público opcional (só quando a Casa Áurea decide exibir)
-- ---------------------------------------------------------------------
alter table products add column show_price boolean not null default false;

-- ---------------------------------------------------------------------
-- 3. Views públicas refeitas: preço só se show_price; nada interno
-- ---------------------------------------------------------------------
-- a lista de colunas muda no meio (type_plural, type_section…): CREATE OR REPLACE não permite, então recria
drop view if exists public_products;
create view public_products as
select p.id, p.public_code, p.name, p.slug, p.short_description,
       coalesce(p.editorial_description, p.description) as description,
       t.code as type_code, t.name as type_name, t.plural_name as type_plural, t.slug as type_slug, t.section as type_section,
       s.name as subtype_name, s.slug as subtype_slug,
       p.environment, p.curation_tier, p.is_configurable, p.designer, p.featured,
       p.availability,
       case when p.show_price then p.price end      as price,
       case when p.show_price then p.sale_price end as sale_price,
       p.seo_title, p.seo_description, p.og_image, p.sort_order, p.updated_at
from products p
left join product_types t on t.id = p.product_type_id
left join product_subtypes s on s.id = p.product_subtype_id
where p.visibility = 'public';

create or replace view public_product_variants as
select v.product_id, v.variant_code, v.name, v.width_cm, v.height_cm, v.depth_cm, v.diameter_cm,
       v.configuration, v.arm_type, v.chaise_type, v.sort_order,
       case when p.show_price then v.price end as price
from product_variants v join products p on p.id = v.product_id
where p.visibility = 'public';

-- coleções públicas (sem campos administrativos) e vínculo com peças
create or replace view public_collections as
select c.id, c.name, c.slug, c.eyebrow, c.title_lines, c.subtitle, c.description,
       c.cover_image, c.mobile_cover_image, c.cover_position, c.start_date, c.end_date, c.featured, c.sort_order,
       c.hero_media, c.hero_mobile_media, c.poster_image, c.story_enabled, c.story_type, c.story_desktop_media,
       c.story_mobile_media, c.story_height, c.theme, c.headline, c.manifesto,
       c.seo_title, c.seo_description, c.og_image,
       (c.active and (c.start_date is null or current_date >= c.start_date)
                 and (c.end_date is null or current_date <= c.end_date)) as is_live
from collections c
where c.active;

grant select on public_products, public_product_variants, public_collections to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3b. Correções de 0002 (revisão estática da Missão 1)
-- ---------------------------------------------------------------------
-- gatilho da busca: em DELETE não existe NEW; trata cada operação explicitamente
create or replace function trg_refresh_search() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'products' then
    if pg_trigger_depth() = 1 then perform refresh_product_search_text(new.id); end if;
  elsif tg_op = 'DELETE' then
    perform refresh_product_search_text(old.product_id);
  else
    perform refresh_product_search_text(new.product_id);
  end if;
  return null;
end $$;

-- busca do admin: código exato primeiro, peças sem código no fim (não no topo)
create or replace function admin_search_products(
  q text default null,
  f_type uuid default null, f_supplier uuid default null,
  f_visibility product_visibility default null, f_curation curation_tier default null,
  f_status commercial_status default null, f_flag quality_flag default null,
  p_limit int default 50, p_offset int default 0)
returns table (id uuid, public_code text, name text, type_name text, supplier_name text,
               status_commercial commercial_status, visibility product_visibility, curation_tier curation_tier,
               primary_image text, updated_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  if not is_catalog_admin() then raise exception 'Acesso restrito'; end if;
  return query
  with terms as (select unnest(regexp_split_to_array(lower(f_unaccent(trim(coalesce(q,'')))), '\s+')) as t),
  base as (
    select p.* from products p
    where (coalesce(q,'') = '' or not exists (select 1 from terms where t <> '' and coalesce(p.search_text,'') not like '%' || t || '%'))
      and (f_type is null or p.product_type_id = f_type)
      and (f_supplier is null or p.supplier_id = f_supplier)
      and (f_visibility is null or p.visibility = f_visibility)
      and (f_curation is null or p.curation_tier = f_curation)
      and (f_status is null or p.status_commercial = f_status)
      and (f_flag is null or exists (select 1 from product_quality_auto a where a.product_id = p.id and a.flag = f_flag)
                          or exists (select 1 from product_quality_flags m where m.product_id = p.id and m.flag = f_flag and not m.resolved))
  )
  select b.id, b.public_code, b.name, ty.name, s.name, b.status_commercial, b.visibility, b.curation_tier,
         (select m.url from product_media m where m.product_id = b.id and m.is_primary limit 1),
         b.updated_at, count(*) over ()
  from base b
  left join product_types ty on ty.id = b.product_type_id
  left join suppliers s on s.id = b.supplier_id
  order by (b.public_code = upper(trim(coalesce(q,'')))) desc nulls last, b.updated_at desc
  limit least(p_limit, 200) offset p_offset;
end $$;

-- vínculos produto↔coleção: o público lê pela view public_collection_products (só peças públicas);
-- a tabela-base deixa de expor ids de peças internas
drop policy if exists "publico_le_vinculos" on product_collections;
create policy "admin_le_vinculos" on product_collections for select using (is_catalog_admin());

-- ---------------------------------------------------------------------
-- 4. Segurança: views internas passam a respeitar o RLS (só admin vê)
-- ---------------------------------------------------------------------
alter view product_quality_auto        set (security_invoker = true);
alter view product_possible_duplicates set (security_invoker = true);
alter view live_collections            set (security_invoker = true);
revoke all on product_quality_auto, product_possible_duplicates from anon;

-- funções internas não podem ser chamadas pelo público
revoke execute on function next_public_code(uuid)               from public, anon;
revoke execute on function refresh_product_search_text(uuid)    from public, anon;
revoke execute on function admin_search_products(text, uuid, uuid, product_visibility, curation_tier, commercial_status, quality_flag, int, int) from public, anon;
grant  execute on function next_public_code(uuid), refresh_product_search_text(uuid) to authenticated;
grant  execute on function admin_search_products(text, uuid, uuid, product_visibility, curation_tier, commercial_status, quality_flag, int, int) to authenticated;
grant  execute on function is_catalog_admin() to anon, authenticated;

-- views públicas são somente leitura
revoke insert, update, delete on public_products, public_product_variants, public_product_media,
  public_product_materials, public_product_finishes, public_collection_products, public_collections from anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Storage: buckets públicos para leitura; escrita só para admins
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('produtos','produtos',true), ('colecoes','colecoes',true), ('showroom','showroom',true),
       ('institucional','institucional',true), ('campanhas','campanhas',true),
       ('importacoes','importacoes',false)          -- planilhas e PDFs de origem: privados
on conflict (id) do nothing;

create policy "midia_admin_insere" on storage.objects for insert to authenticated
  with check (bucket_id in ('produtos','colecoes','showroom','institucional','campanhas','importacoes') and public.is_catalog_admin());
create policy "midia_admin_altera" on storage.objects for update to authenticated
  using (bucket_id in ('produtos','colecoes','showroom','institucional','campanhas','importacoes') and public.is_catalog_admin());
create policy "midia_admin_remove" on storage.objects for delete to authenticated
  using (bucket_id in ('produtos','colecoes','showroom','institucional','campanhas','importacoes') and public.is_catalog_admin());
create policy "midia_admin_lista_importacoes" on storage.objects for select to authenticated
  using (bucket_id = 'importacoes' and public.is_catalog_admin());

-- ---------------------------------------------------------------------
-- 6. Configurações do site (editáveis no admin)
-- ---------------------------------------------------------------------
create table site_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table site_settings enable row level security;
create policy "publico_le_config" on site_settings for select using (key in ('whatsapp_number','site_url','show_pending'));
create policy "admin_config"      on site_settings for all using (is_catalog_admin()) with check (is_catalog_admin());
insert into site_settings (key, value) values ('whatsapp_number','5548984576227') on conflict do nothing;

-- ---------------------------------------------------------------------
-- 7. Primeiro administrador (rodar uma vez, com o e-mail criado no Auth):
--    insert into catalog_admins (user_id) select id from auth.users where email = 'email@casaaurea.com.br';
--    Em Authentication → Providers, desative "Allow new users to sign up".
-- ---------------------------------------------------------------------

-- >>> 0004_seed_natal_2026.sql
-- =====================================================================
-- CASA ÁUREA — 0004: Coleção Natal 2026 (dados do catálogo oficial em PDF)
-- Locação: valores por temporada, conforme o catálogo. Mídias: scripts/seed-natal-media.mjs
-- =====================================================================

insert into product_types (code, name, plural_name, slug, sort_order, section) values
  ('ARV','Árvore de Natal','Árvores de Natal','arvores-de-natal',30,'natal'),
  ('GUI','Guirlanda','Guirlandas','guirlandas',31,'natal'),
  ('ARR','Arranjo','Arranjos','arranjos',32,'natal')
on conflict (code) do nothing;

insert into collections (name, slug, eyebrow, title_lines, subtitle, description, cover_position, featured, active, sort_order)
values ('Natal Casa Áurea', 'natal', 'Coleção de Natal 2026', array['Natal','Casa Áurea'],
        'Locação e produção natalina para residências, condomínios e espaços corporativos.',
        'De árvores a arranjos, composições pensadas para receber clientes, convidados e a família, com a Casa Áurea cuidando de cada detalhe para que a única preocupação seja viver a temporada.',
        '50% 30%', true, true, 1)
on conflict (slug) do update set eyebrow = excluded.eyebrow, title_lines = excluded.title_lines,
  subtitle = excluded.subtitle, description = excluded.description, featured = true, active = true;

-- peças (o código CA-… é gerado pelo banco)
with t as (select code, id from product_types where code in ('ARV','GUI','ARR')),
ins as (
  insert into products (name, slug, product_type_id, environment, short_description, description, availability,
                        status, status_commercial, visibility, curation_tier, show_price, price, sort_order, extra_info)
  select v.name, v.slug, t.id, 'indoor', v.short, v.descr, 'Locação', 'active', 'active', 'public', 'curated', true, v.price, v.ord, v.extra
  from (values
    ('Árvore Áurea Esmeralda','arvore-aurea-esmeralda','ARV',
     'Uma composição rica, elegante e marcante, para um Natal acolhedor e cheio de personalidade.',
     'Sofisticação em cada detalhe, com uma composição rica, elegante e marcante, criando um Natal acolhedor e cheio de personalidade.',
     1490::numeric, 1, 'Festões decorados e ambientação de Natal: valores sob consulta. Consultar taxa de deslocamento.'),
    ('Árvore Áurea Diamante','arvore-aurea-diamante','ARV',
     'A expressão máxima do luxo Áurea: exuberante, imponente e cuidadosamente elaborada.',
     'A expressão máxima do luxo Áurea: exuberante, imponente e cuidadosamente elaborada para transformar o ambiente em um verdadeiro cenário de Natal.',
     2270, 2, 'Festões decorados e ambientação de Natal: valores sob consulta. Consultar taxa de deslocamento.'),
    ('Guirlandas','guirlandas-natal','GUI',
     'A primeira impressão do seu espaço: texturas e elementos nobres para receber.',
     'A guirlanda é a primeira impressão do seu espaço. Peças que combinam texturas e elementos nobres para dar as boas-vindas com elegância e o toque de magia que a sua entrada merece.',
     380, 3, 'Consultar taxa de deslocamento.'),
    ('Arranjos','arranjos-natal','ARR',
     'Para transformar mesas, aparadores e recepções em pontos de encanto.',
     'Projetados para transformar mesas, aparadores e recepções em pontos de encanto. Cada arranjo une sofisticação e harmonia visual, criando a atmosfera para celebrar momentos inesquecíveis.',
     550, 4, 'Consultar taxa de deslocamento.')
  ) as v(name, slug, type_code, short, descr, price, ord, extra)
  join t on t.code = v.type_code
  on conflict (slug) do nothing
  returning id, slug
)
insert into product_collections (product_id, collection_id, sort_order)
select ins.id, c.id, row_number() over (order by ins.slug)
from ins, collections c where c.slug = 'natal';

-- variantes (tamanhos e valores do catálogo)
insert into product_variants (product_id, seq, name, price, commercial_status, sort_order)
select p.id, v.seq, v.name, v.price, 'active', v.seq
from (values
  ('arvore-aurea-esmeralda',1,'1,5 m',1490),('arvore-aurea-esmeralda',2,'1,8 m',1980),('arvore-aurea-esmeralda',3,'2,10 m',2270),
  ('arvore-aurea-esmeralda',4,'2,40 m',2690),('arvore-aurea-esmeralda',5,'2,70 m',3190),('arvore-aurea-esmeralda',6,'3,00 m',4000),
  ('arvore-aurea-esmeralda',7,'4,00 m',6000),
  ('arvore-aurea-diamante',1,'1,5 m',2270),('arvore-aurea-diamante',2,'1,8 m',2490),('arvore-aurea-diamante',3,'2,10 m',3000),
  ('arvore-aurea-diamante',4,'2,40 m',3480),('arvore-aurea-diamante',5,'2,70 m',4500),('arvore-aurea-diamante',6,'3,00 m',6250),
  ('arvore-aurea-diamante',7,'4,00 m',7880),
  ('guirlandas-natal',1,'Pequena',380),('guirlandas-natal',2,'Média',580),('guirlandas-natal',3,'Grande',670),('guirlandas-natal',4,'Gigante',890),
  ('arranjos-natal',1,'Pequeno',550),('arranjos-natal',2,'Médio',850),('arranjos-natal',3,'Grande',1100)
) as v(slug, seq, name, price)
join products p on p.slug = v.slug
on conflict (product_id, seq) do nothing;

-- o slug público ganha o código Casa Áurea, ex.: arvore-aurea-esmeralda-ca-arv-0001
update products set slug = slug || '-' || lower(public_code)
where slug in ('arvore-aurea-esmeralda','arvore-aurea-diamante','guirlandas-natal','arranjos-natal') and public_code is not null;

-- >>> 0005_import_pipeline.sql
-- =====================================================================
-- CASA ÁUREA — 0005: pipeline de importação de catálogos (Missão 2)
-- Aditiva. Reaproveita import_batches, products, product_media, product_source_references.
-- =====================================================================

-- estados extras do lote (fila e pausa)
alter type import_status add value if not exists 'queued';
alter type import_status add value if not exists 'paused';

-- ---------------------------------------------------------------------
-- 1. Lote: arquivo, progresso e checkpoint
-- ---------------------------------------------------------------------
alter table import_batches
  add column if not exists kind              text not null default 'csv' check (kind in ('csv','json','pdf')),
  add column if not exists source_path       text,            -- caminho no bucket privado 'importacoes'
  add column if not exists catalog_year      text,
  add column if not exists notes             text,
  add column if not exists total_pages       int,
  add column if not exists processed_pages   int not null default 0,
  add column if not exists next_page         int not null default 1,   -- checkpoint: retoma daqui
  add column if not exists products_detected int not null default 0,
  add column if not exists warnings          jsonb not null default '[]'::jsonb,
  add column if not exists metrics           jsonb,                     -- relatório final do lote
  add column if not exists pause_requested   boolean not null default false,
  add column if not exists worker_id         text,
  add column if not exists heartbeat_at      timestamptz,
  add column if not exists started_at        timestamptz,
  add column if not exists finished_at       timestamptz,
  add column if not exists error             text;

-- ---------------------------------------------------------------------
-- 2. Páginas processadas (origem sempre rastreável)
-- ---------------------------------------------------------------------
create table import_pages (
  batch_id      uuid not null references import_batches(id) on delete cascade,
  page_number   int  not null,
  status        text not null default 'done' check (status in ('done','error','skipped')),
  has_text      boolean,
  images_found  int,
  render_path   text,                -- miniatura da página no Storage, para "ver página original"
  data          jsonb,               -- linhas de texto e caixas das imagens (permite remontar sem reler o PDF)
  error         text,
  processed_at  timestamptz not null default now(),
  primary key (batch_id, page_number)
);

-- ---------------------------------------------------------------------
-- 3. Itens importados: uma linha por peça detectada (fila de revisão)
-- ---------------------------------------------------------------------
create table import_items (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references import_batches(id) on delete cascade,
  product_id       uuid references products(id) on delete set null,
  supplier_id      uuid references suppliers(id) on delete set null,
  catalog_id       uuid references catalogs(id) on delete set null,
  idempotency_key  text not null,       -- fornecedor + catálogo + página + códigos (ou nome)
  title_page       int,
  pages            int[] not null default '{}',
  extracted        jsonb not null,      -- dados brutos extraídos (texto, códigos, medidas, classificação)
  flags            text[] not null default '{}',
  scores           jsonb,               -- image_quality, data_completeness, taxonomy_confidence (interno)
  review_status    text not null default 'pending' check (review_status in ('pending','reviewed','approved','rejected')),
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (catalog_id, idempotency_key)  -- reprocessar o mesmo catálogo não duplica
);
create index import_items_batch_idx on import_items(batch_id, review_status);
create index import_items_flags_idx on import_items using gin (flags);

-- ---------------------------------------------------------------------
-- 4. Mídia: origem, qualidade e hash perceptual
-- ---------------------------------------------------------------------
alter table product_media
  add column if not exists source_type     text check (source_type in ('embedded_original','page_crop','manual_upload','enhanced')),
  add column if not exists quality         text check (quality in ('GOOD','ACCEPTABLE','REVIEW','REJECTED')),
  add column if not exists quality_reasons text[],
  add column if not exists file_size       int,
  add column if not exists effective_ppi   int,
  add column if not exists sharpness       numeric,
  add column if not exists phash           text,
  add column if not exists source_page     int,
  add column if not exists import_batch_id uuid references import_batches(id) on delete set null;
create index product_media_phash_idx on product_media(phash) where phash is not null;

-- confiança da classificação automática (interno; não entra nas views públicas)
alter table products add column if not exists classification_confidence numeric;

-- ---------------------------------------------------------------------
-- 5. Segurança: tudo administrativo
-- ---------------------------------------------------------------------
alter table import_pages enable row level security;
alter table import_items enable row level security;
create policy "admin_import_pages" on import_pages for all using (is_catalog_admin()) with check (is_catalog_admin());
create policy "admin_import_items" on import_items for all using (is_catalog_admin()) with check (is_catalog_admin());

-- as views públicas (0003) listam colunas explicitamente: os campos novos de qualidade,
-- hash e lote não chegam ao site.

-- >>> 0006_pipeline_v1.sql
-- =====================================================================
-- CASA ÁUREA — 0006: ajustes do Pipeline de Importação V1 (após o piloto)
-- Aditiva. Não remove dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos encontrados no catálogo real (apenas estes quatro)
-- ---------------------------------------------------------------------
insert into product_types (code, name, plural_name, slug, sort_order, section) values
  ('GAV','Gaveteiro','Gaveteiros','gaveteiros',20,'moveis'),
  ('EST','Estante','Estantes','estantes',21,'moveis'),
  ('CRI','Cristaleira','Cristaleiras','cristaleiras',22,'moveis'),
  ('CAB','Cabideiro','Cabideiros','cabideiros',23,'moveis')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 2. Nota de imagem por uso + troca de mídia sem tocar na peça
-- ---------------------------------------------------------------------
alter table product_media drop constraint if exists product_media_quality_check;
alter table product_media add constraint product_media_quality_check
  check (quality is null or quality in ('CATALOG_READY','DETAIL_ACCEPTABLE','EDITORIAL_REVIEW','REJECTED'));
alter table product_media drop constraint if exists product_media_source_type_check;
alter table product_media add constraint product_media_source_type_check
  check (source_type is null or source_type in ('embedded_original','page_crop','manual_upload','supplier_original','enhanced'));

alter table product_media
  add column if not exists hero_ready  boolean not null default false,
  add column if not exists background  text,                 -- transparente | fundo sólido | foto com ambiente
  add column if not exists has_text    boolean,
  add column if not exists watermark   boolean,
  add column if not exists status      text not null default 'active' check (status in ('active','replaced','archived')),
  add column if not exists replaced_by uuid references product_media(id) on delete set null,
  add column if not exists replaced_at timestamptz;

-- uma única principal ATIVA por peça (a substituída sai da conta)
drop index if exists product_media_one_primary;
create unique index product_media_one_primary on product_media(product_id) where is_primary and status = 'active';

-- o site só enxerga mídia ativa (mesmas colunas da view anterior; muda apenas o filtro)
create or replace view public_product_media as
select m.product_id, m.type, m.url, m.alt, m.width, m.height, m.focal_point, m.poster_url, m.sort_order, m.is_primary
from product_media m join products p on p.id = m.product_id
where p.visibility = 'public' and m.status = 'active';

-- busca e pendências consideram só a mídia ativa
create or replace view product_quality_auto as
select p.id as product_id, f.flag
from products p
cross join lateral (values
  ('missingOriginalCode'::quality_flag,     not exists (select 1 from product_source_references r where r.product_id = p.id and r.original_code is not null)),
  ('missingDimensions'::quality_flag,       not exists (select 1 from product_variants v where v.product_id = p.id and (v.width_cm is not null or v.diameter_cm is not null))),
  ('missingHighQualityImage'::quality_flag, not exists (select 1 from product_media m where m.product_id = p.id and m.is_primary and m.status = 'active'
                                                          and (m.quality = 'CATALOG_READY' or (m.quality is null and coalesce(m.width,0) >= 800)))),
  ('missingMaterial'::quality_flag,         not exists (select 1 from product_materials pm where pm.product_id = p.id))
) as f(flag, hit)
where f.hit;
alter view product_quality_auto set (security_invoker = true);

-- ---------------------------------------------------------------------
-- 3. Catálogos grandes: o PDF não precisa ficar no Storage
-- ---------------------------------------------------------------------
alter table import_batches
  add column if not exists source_checksum   text,          -- SHA-256 do PDF (identifica reprocessamento)
  add column if not exists source_size       bigint,
  add column if not exists processing_mode   text not null default 'upload' check (processing_mode in ('upload','local')),
  add column if not exists source_deleted_at timestamptz;   -- PDF temporário removido após o processamento
create index if not exists import_batches_checksum_idx on import_batches(source_checksum);

-- miniaturas das páginas ficam no bucket privado 'importacoes' (render_path guarda o caminho; o painel gera URL assinada)

-- >>> 0007_orcamentos.sql
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
