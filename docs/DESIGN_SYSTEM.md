# Design system — Glorioso Finance

A interface da plataforma segue o **Glorioso Finance Design System** (pacote
`Glorioso_Finance_Design_System.zip`). Este documento explica onde cada peça do
DS vive no código, o que foi estendido e como construir telas novas sem sair do
sistema.

## Onde está cada coisa

| Arquivo | Papel |
| --- | --- |
| `src/styles/tokens.css` | Cópia **literal** dos tokens do DS (cores, tipografia, espaçamento, raios, elevação, movimento). Não editar valores aqui. |
| `src/index.css` | Camada da plataforma: extensões, aliases dos nomes antigos, base e classes de componente (`.card`, `.btn`, `.icon-btn`, `.badge`, tabelas, campos, `.seg-tabs`, `.seg-control`, `.modal-*`, shell). |
| `index.html` | Carrega a **Urbanist** (única família do DS) do Google Fonts. |
| `src/lib/tones.ts` | Tons de status do DS (`accent`, `neutral`, `inverse`, `negative`, `outline`, `warning`, `info`) e o mapa status de domínio → tom. |
| `src/components/Icon.tsx` | Todos os ícones passam por aqui — conjunto **Lucide**, traço 1.75, `currentColor`. Trocar o conjunto = remapear `ICONS`. |
| `src/components/Badge.tsx` | Badge do DS (pílula 18/24px, peso 500). |
| `src/components/Wordmark.tsx` | O nome "Glorioso Finance" composto em Urbanist. O DS **não tem logotipo**: nunca desenhar/aproximar um símbolo. `public/favicon.svg` é a forma compacta (placa creme + inicial). |
| `src/components/PageHero.tsx` | PageHeader do DS: breadcrumb, título 24px regular, legenda e ações. Props `section`, `crumbs`, `caption`. |
| `src/components/Layout.tsx` | Shell: navegação lateral + TopBar de 56px. |
| `src/components/KpiPill.tsx`, `KpiCard.tsx` | MetricCard compacto (eyebrow · valor · legenda). |
| `src/components/AthleteAvatar.tsx` | Retrato do atleta: quadrado, raio 8, placa creme com filete; iniciais sem foto. |
| `src/components/Flag.tsx` | Bandeira da nacionalidade em SVG (`country-flag-icons`) — nunca emoji. |

## Regras do DS que valem para qualquer tela

- **Urbanist** em tudo. Pesos 300 / 400 / 500 / 600 (500 = números e métricas). Nada de 700/800.
- **Letter-spacing só no eyebrow**: 10px, CAIXA-ALTA, `+.09em`, cinza `--text-muted` (classe `.eyebrow`). Botões, badges, menus e rótulos de formulário em **caixa de frase**.
- **Um acento só**: o creme `--accent` (#F2F0EB), sempre com o filete preto `--accent-line` sobre superfícies claras. A ação principal é **preta** (`.btn-primary`).
- **Cards**: branco, sem borda, raio 14, `--shadow-card`; no hover a sombra sobe (`--shadow-raised`), **sem movimento**. Variantes `.card-sunken`, `.card-inverse`, `.card-outline`.
- **Sombra OU borda**, nunca as duas. Tiles internos são *sunken* (#F7F7F8) sem filete.
- **Controles**: 36px (`--control-h-md`), raio 10 (`--radius-control`), filete `--border-subtle`, foco = borda/anel preto de 2px.
- **Estados nunca por opacidade**: hover escurece o preenchimento, press = `scale(.97)`, desabilitado = `--gray-100` + `--text-disabled`.
- **Status = preenchimento + rótulo** (nunca só ícone). Use `badgeStyle(tom)`/`<Badge tone>` de `lib/tones`.
- **Um único vermelho** para problemas (`--red-500` / `--text-negative`).
- **Gráficos**: séries em ordem fixa `--chart-1` (areia) … `--chart-5`; grade `--chart-grid`; eixos 11px `--text-muted`; tooltip no formato do InsightCallout (branco, `--shadow-pop`, raio 10).
- **Sem emoji e sem glifos como ícone** (←, →, ✕, ⚠, ✓, +): use `<Icon>`.

## Extensões da plataforma (o DS não define)

| Extensão | Por quê |
| --- | --- |
| `--amber-700`, `--lilac-700` (+ `--text-warning`, `--text-info`, `--surface-warning-soft`, `--surface-info-soft`) | O DS traz âmbar e lilás só como swatches claros de status. Foram derivados passos escuros para texto/ícone legível sobre branco, no mesmo espírito de `--sand-800`. |
| Tons `warning` e `info` em `lib/tones` | Status "atenção" (vencimento próximo, RJ, em andamento) e "informativo" (empréstimo, renegociação, parcelas). |
| `.btn-negative` | Confirmação destrutiva (ex.: "Apagar definitivamente"), com o mesmo preenchimento do Badge `negative`. |
| `.seg-control` | Seletor de opções no trilho do IconNavRail (sunken + ativo preto). |
| `.th-sort` e `table.table-dense` | Cabeçalho ordenável (o eyebrow vira botão; a coluna ativa fica preta, com `aria-sort`) e tabela larga com filete lateral de 8px — usados no ranking de salários. |
| Navegação **lateral** | O DS desenha um trilho de ícones no TopBar para ~7 destinos; a plataforma tem 17, em seções. A navegação lateral usa a mesma linguagem (ghost + ativo preto) e, recolhida, vira o próprio trilho de ícones 36×36. |
| Vocabulário de cor dos ícones de ação (`RowActions`) | Mantido, agora nos tons de status do DS: preto abrir/editar · lilás parcelas · areia pagamento · âmbar desfazer · vermelho excluir · cinza indisponível. |

## Nomes antigos → tokens do DS

Os nomes antigos continuam funcionando (aliases em `src/index.css`), mas código
novo deve usar os tokens do DS:

| Antigo | DS |
| --- | --- |
| `--ink-primary`, `--ink` | `--text-primary` |
| `--ink-secondary` | `--gray-700` |
| `--cream-page` / `--cream-card` / `--cream-inset` | `--surface-page` / `--surface-card` / `--surface-sunken` |
| `--divider`, `--divider-soft` / `--divider-strong` | `--border-subtle` / `--border-default` |
| `--pos` / `--pos-tint` | `--text-positive` / `--surface-accent` |
| `--neg` / `--neg-tint` | `--text-negative` / `--surface-negative-soft` |
| `--warn` / `--warn-tint` | `--text-warning` / `--surface-warning-soft` |
| `--info` / `--info-tint` | `--text-info` / `--surface-info-soft` |
| `--font-display/body/label/data` | `--font-core` (Urbanist) |
| `--shadow-panel` | `--shadow-pop` |

Atenção a dois nomes que **mudaram de significado**: no DS `--accent` é o
**creme** (antes era a ação preta — hoje `--action-inverse`), e `--text-muted`
(#AAA9AB) é só para eyebrow; texto de apoio legível usa `--text-secondary`.

## Checklist para uma tela nova

1. Cabeçalho com `<PageHero title section|crumbs caption>` e ações como filhos.
2. Blocos em `.card` (padding `--gutter-card`, gap `--space-5` entre cards).
3. Título de card = `.eyebrow`; métrica em `--text-metric-size` (44px) ou `--text-title-size` (24px) em grades densas; legenda em `--text-secondary`.
4. Botões `.btn .btn-primary | .btn-accent | .btn-outline | .btn-ghost | .btn-danger`, com `<Icon size={16}>`.
5. Status com `badgeStyle(TOM)` a partir de `lib/tones`.
6. Nenhuma cor em hex/rgba no componente — só `var(--token)`.

## Observação de acessibilidade

Dois valores do DS ficam abaixo de 4,5:1 sobre branco em textos pequenos:
`--text-negative` (#E8402F ≈ 4,0:1) e `--text-muted` (#AAA9AB ≈ 2,3:1, por isso
restrito ao eyebrow de 10px). Foram mantidos como no DS; se o time quiser AA
estrito em textos de 12px, o ajuste é feito uma única vez em `src/index.css`.
