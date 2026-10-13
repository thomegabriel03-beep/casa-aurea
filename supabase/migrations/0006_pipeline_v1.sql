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
