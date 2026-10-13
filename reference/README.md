# Referências para a produção

A prévia aprovada (`preview/casa-aurea-preview.html`, V62 de 11/10/2026) é a **referência visual oficial**.
Visual congelado: o que está nela é o que vai ao ar. Esta pasta guarda o que ainda só existe na prévia,
para ser portado ao app Next.js.

| Pasta | O que é | Destino na produção |
|---|---|---|
| `preview/` | Prévia HTML completa (site, catálogo, painel, Áurea, orçamentos) | Referência de layout, textos PT/EN/ES e comportamento |
| `aurea/` | Prompt mestre da Áurea (`conc_kb.js`) e motor de respostas sem IA (`conc_local.js`) | Rota `POST /api/aurea` (Claude API no servidor) + fallback local |
| `orcamentos/` | Módulo de orçamentos de cortinas e persianas + planilha original da Camila | `/admin/orcamentos` + tabelas `quote_*` no Supabase |
| `../public/film/` | Quadros do filme de abertura (desktop 1920×1080 e retrato para celular) | Hero com scroll |

## Regras que não mudam
- O site público nunca mostra fornecedor, código original, catálogo, página, notas internas ou origem.
- Toda peça importada entra **interna + acervo**; nada é publicado automaticamente.
- Sem IA generativa em massa nos produtos.

## Orçamentos — fórmula (igual à planilha)
- Altura total = altura + barra + entretela e sobra (0,22).
- Tecido (m) = largura × altura total. Forro (m) = igual.
- Blackout (m) = arredondar para cima(largura × 1,5 ÷ 2,80) × altura total.
- Custo de cada camada = preço/m × metros + (mão de obra + instalação + presilhas + trilho) × largura.
- Venda = custo × (1 + % da loja) × (1 + RT). Opções: só cortina, cortina + forro, só blackout, blackout + cortina.
- Motor: kit + instalação + diferença do trilho motorizado, por camada motorizada.
- Persiana: max(largura × altura, área mínima) × preço/m² + bandô/m + motor + instalação, × (1 + %) × (1 + RT).
- Conferência: 2,66 × 3,20, barra 0,50, linho R$ 24,90 → 1.074,46 / 2.062,07 / 1.432,76 / 2.507,22.
