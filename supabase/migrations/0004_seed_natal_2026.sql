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
