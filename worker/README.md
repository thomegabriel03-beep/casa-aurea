# Worker de importação de catálogos (Missão 2)

Transforma o PDF do fornecedor em peças estruturadas da Casa Áurea, sempre como **interno + acervo**,
preservando a origem (fornecedor, catálogo, página, código original).

## Requisitos
- Python 3.11+ e `poppler-utils` (`pdfimages`, `pdftoppm`)
- `pip install -r worker/requirements.txt`

## Produção (fila do painel)
1. Aplique `supabase/migrations/0005_import_pipeline.sql`.
2. No painel, em **Importações → Novo catálogo (PDF)**, escolha fornecedor e catálogo e envie o PDF.
   O arquivo vai para o bucket privado `importacoes` e o lote entra na fila.
3. Rode o worker num servidor ou máquina com acesso à internet:
   ```bash
   cd worker
   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python -m casa_aurea_import.sink --loop
   ```
   - Processa por blocos de páginas e grava o checkpoint a cada página.
   - "Pausar" no painel para entre páginas. "Retomar" continua da próxima página, sem recomeçar.
   - Se o worker cair, outro worker retoma o lote depois de 10 minutos sem sinal de vida.
   - A gravação é idempotente: reprocessar o mesmo catálogo não duplica peças.
4. Revise as exceções em **Importações → Fila de revisão**.

O processamento roda fora da Vercel de propósito, porque um catálogo de centenas de páginas não cabe
numa requisição HTTP. Qualquer máquina com Python serve: um servidor pequeno, um container ou o computador do escritório.

## Catálogos grandes (acima de 45 MB)
O PDF não precisa ficar no Supabase. No painel, envie o arquivo normalmente: acima de 45 MB, ele **não sobe**.
O lote é criado e o painel mostra o comando para rodar na máquina onde está o PDF:
```bash
python -m casa_aurea_import.sink --batch <id-do-lote> --file catalogo.pdf
```
Ao Supabase vão só as peças, os dados, as imagens extraídas, as miniaturas legíveis das páginas usadas (100 dpi,
no bucket privado `importacoes`), o SHA-256 e o tamanho do arquivo. PDFs pequenos enviados pelo painel são apagados
do Storage ao fim do processamento.

## Trocar fotos pelas originais do fornecedor
Coloque as fotos numa pasta com o código original no nome do arquivo (ex.: `10810.jpg`, `BC_10810_frente.png`):
```bash
python -m casa_aurea_import.sink --replace-images ./fotos-brazil --supplier-id <uuid> --dry-run   # confere antes
python -m casa_aurea_import.sink --replace-images ./fotos-brazil --supplier-id <uuid>
```
Só a mídia muda. Peça, código Casa Áurea, slug, coleções, origem, variantes e dados ficam como estão; a foto antiga
fica guardada como "substituída". No painel, cada foto também tem o botão **Substituir foto**.

## Reclassificar sem reimportar
Depois de cadastrar tipos novos:
```bash
python -m casa_aurea_import.sink --batch <id-do-lote> --reclassify
```
Ajusta só os itens com tipo ausente ou incerto que ninguém revisou. A peça recebe o código Casa Áurea no momento em que ganha o tipo.

## Piloto local (sem banco)
```bash
python -m casa_aurea_import.worker --pdf catalogo.pdf --supplier "Fornecedor" --catalog "Catálogo 2026" --year 2026 --out ./saida
```
O comando gera `saida/batch.json` (peças, mídias, pendências e métricas) e `saida/media/` (imagens extraídas).

## Regras
- **Imagens:** primeiro o objeto incorporado no PDF, com os bytes originais e a máscara de transparência
  quando existe. O recorte da página só entra se não houver objeto. Nenhuma IA generativa é usada.
- **Texto:** texto nativo do PDF. Códigos, medidas, designer, materiais e acabamentos são lidos como estão no catálogo; nada é inventado.
- **Classificação:** sai com nível de confiança. Abaixo de 80%, a peça é criada **sem tipo e sem código**, com a sugestão guardada para a revisão.
- **Nota de imagem por uso:**
  - Pronta para catálogo: ≥ 800 px, nítida e limpa.
  - Miniatura/detalhe: 500–799 px.
  - Conferir imagem: tem texto, marca ou pouca nitidez.
  - Rejeitada: menor que 500 px.
  - "Apta para destaque" exige ≥ 2000 px.
- **Relações entre itens:** mesmo produto/mesmo código, variação real, mesmo nome/produto diferente e possível duplicidade. Nunca mescla.
- **Pendências:**
  - Bloqueantes: precisam de intervenção humana.
  - Observações: não impedem a curadoria.
  - Cada peça cai em um único grupo: pronta, pronta com observação, intervenção ou página informativa.

## Piloto real (validação completa no Supabase)
Com as migrações aplicadas (`supabase db push --dry-run` e depois `supabase db push`):
```bash
cd worker
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… \
python -m casa_aurea_import.pilot_real --pdf /caminho/2026_CAT_BRAZIL_CONTEMPORANEO.pdf
```
O script cria o lote real em modo local e força uma pausa na página 40, depois retoma. Em seguida verifica,
nesta ordem:
- produtos, códigos, variantes, imagens e Storage;
- página original, classificação, duplicidade e pendências;
- reprocessa o mesmo catálogo (idempotência) e troca a foto de uma peça;
- testa a privacidade com a chave pública.

No fim, imprime o relatório ✅/❌ e as métricas reais, e grava `amostra-piloto-real.html` com 20 peças.
Nada é publicado.

## Catálogos já processados (pacotes de importação)
Cada catálogo processado na fase de prototipagem vira um pacote `.zip` com:
- `batch.json`: peças, variantes, códigos, pendências e métricas;
- `media/`: imagens extraídas, em WebP sem perda;
- `pages/`: miniaturas das páginas.

No fechamento técnico, os pacotes vão direto para o Supabase, sem reprocessar o PDF:
```bash
python -m casa_aurea_import.sink --import-package catalogos/faruk-agosto-2025.zip --supplier-id <uuid> --catalog-id <uuid>
```
A gravação é a mesma do lote normal: interno + acervo, idempotente, e o código Casa Áurea é gerado pelo banco.
