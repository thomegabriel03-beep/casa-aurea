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
