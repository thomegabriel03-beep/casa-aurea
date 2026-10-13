# Casa Áurea — Informações pendentes

Tudo abaixo precisa ser confirmado ou enviado pela Casa Áurea antes da publicação final.
Nenhum desses dados foi inventado no site: onde falta informação, há placeholder
marcado como **Pendente** (visível enquanto `NEXT_PUBLIC_SHOW_PENDING=true`).

Legenda de onde atualizar: 🔧 `src/config/site.ts` · 🗂 `src/data/*` · 🖼 `public/images` · ✍️ copy nos componentes

## Observação sobre a análise do Instagram
O Instagram (@a.casaaurea) bloqueia acesso automatizado, então **não foi possível analisar
o perfil nesta etapa**. Paleta, tipografia e wordmark são **provisórios**, construídos a partir
do briefing. Assim que recebermos o manual da marca (ou prints do feed), ajustamos o design system.

## Marca
| # | Item | Onde entra |
|---|------|-----------|
| 1 | Logo oficial em SVG (versões clara e escura) | `components/layout/Logo.tsx` |
| 2 | Manual da marca | design system em `app/globals.css` |
| 3 | Fontes oficiais (e licença para web) | `app/layout.tsx` |
| 4 | Paleta oficial | `@theme` em `app/globals.css` |
| 18 | Significado do nome "Casa Áurea" | 🗂 FounderSection |

## Contato e dados legais
| # | Item | Onde entra |
|---|------|-----------|
| 5 | WhatsApp oficial | `.env` → `NEXT_PUBLIC_WHATSAPP_NUMBER` |
| 6 | E-mail | 🔧 `contact.email` |
| 7 | CNPJ correto (não usar o encontrado online sem confirmação) | 🔧 `legal.cnpj` |
| 8 | Razão social | 🔧 `legal.companyName` |
| 9 | Horários confirmados (hoje: preliminares seg–sex 09h–12h / 13h30–19h; sáb 09h–13h) | 🔧 `hours` → `confirmed: true` libera no schema.org |
| — | CEP do showroom | 🔧 `address.postalCode` |
| — | Domínio oficial | `.env` → `NEXT_PUBLIC_SITE_URL` |
| 10 | Cidades atendidas | copy de Showroom / Assessoria |

## Produtos e curadoria
| # | Item | Onde entra |
|---|------|-----------|
| 11 | Categorias comercializadas (iluminação, cortinas, persianas, cama/mesa/banho estão **desativadas** até confirmar) | 🗂 `data/collections.ts` |
| 12 | Marcas comercializadas | nova seção, se fizer sentido para a marca |
| 39 | Existem produtos pronta-entrega? | copy |
| 40 | Existem produtos sob encomenda? | copy |

## Fotografia e vídeo
| # | Item | Onde entra |
|---|------|-----------|
| 13 | Fotos profissionais dos produtos (preferir em ambiente) | 🗂 `data/collections.ts` |
| 14 | Fotos do showroom — incluindo **1 foto horizontal forte para o Hero** | 🗂 `data/media.ts` |
| 15 | Vídeos do showroom | possível hero em vídeo (avaliar peso) |
| 16 | Fotos de Rafa e Camila | 🗂 `foundersMedia` |
| — | Seleção de 6 posts do Instagram (imagem + link) | 🗂 `data/instagram.ts` |

Especificação recomendada: JPG em alta, mínimo 2400px no lado maior, sem marca d'água.
O Next.js gera AVIF/WebP e todos os tamanhos responsivos automaticamente.

## História
| # | Item |
|---|------|
| 17 | História da Casa Áurea |
| 19 | Como nasceu a empresa |
| 20 | Diferencial principal, nas palavras dos fundadores |

Sugestão: entrevista de 40 minutos com Rafa e Camila, gravada, para extrair a copy da seção "Por trás da Casa Áurea".

## Comercial e operação
| # | Item |
|---|------|
| 21 | Política de entrega |
| 22 | Área de entrega |
| 23 | Montagem |
| 24 | Formas de pagamento |
| 25 | Parcelamento |
| 38 | Política de troca |

## Assessoria de ambientes (nada disso é afirmado no site hoje)
| # | Item |
|---|------|
| 26 | Como funciona a assessoria, passo a passo |
| 27 | É gratuita ou paga? |
| 28 | Existe visita ao imóvel? |
| 29 | Existe medição? |
| 30 | Existe projeto 3D? |
| 31 | Existem profissionais internos de interiores? |

## Profissionais (nada disso é mencionado no site hoje)
| # | Item |
|---|------|
| 32 | Existe atendimento dedicado a arquitetos? |
| 33 | Existe reserva técnica? |
| 34 | Existe programa de parceiros? |

## Prova social (a seção fica oculta enquanto não houver dados reais)
| # | Item | Onde entra |
|---|------|-----------|
| 35 | Depoimentos (com autorização) | 🗂 `data/testimonials.ts` |
| 36 | Projetos já realizados | 🗂 `data/environments.ts` |
| 37 | Fotos de casas de clientes (com autorização) | 🗂 `data/environments.ts` |
| — | Perfil no Google Meu Negócio (para avaliações) | — |

## Jurídico e privacidade
- Texto da Política de Privacidade (LGPD) e Termos de Uso.
- Decisão sobre banner de consentimento antes de ativar GA4 / Meta Pixel.

## Catálogo e painel (V2)
- [ ] Credenciais do Supabase em `.env.local` / Vercel (URL, anon key, service role).
- [ ] E-mails da equipe que terão acesso ao painel.
- [ ] Período da campanha de Natal (início e fim), para a coleção sair do destaque sozinha.
- [ ] Nome e ano reais de cada um dos 15 catálogos dos fornecedores.
- [ ] Planilhas ou PDFs dos catálogos, para a importação em lote.
- [ ] Decisão sobre exibir preços em peças fora do Natal (padrão: oculto).
