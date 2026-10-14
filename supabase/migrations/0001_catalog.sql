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
