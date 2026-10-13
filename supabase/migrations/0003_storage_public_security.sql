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
