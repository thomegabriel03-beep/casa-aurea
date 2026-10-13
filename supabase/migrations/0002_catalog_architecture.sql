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
