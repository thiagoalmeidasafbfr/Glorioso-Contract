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

- **Urbanist** em tudo. Texto de interface em **400**; **500** só para ênfase (nome na linha, total, valor em destaque); **300** no título de página. Subtítulos (18px) e títulos (24px) em 400, como no DS. Nada de 600/700 na interface.
- **Letter-spacing só no eyebrow**: 10px, CAIXA-ALTA, `+.09em`, cinza `--text-muted` (classe `.eyebrow`). Botões, badges, menus e rótulos de formulário em **caixa de frase**.
- **Um acento só**: o creme `--accent` (#F2F0EB), sempre com filete sobre superfícies claras — em badges, retratos, placas e no botão creme o filete é o areia `--accent-line-soft` (o preto `--accent-line` pesava demais em elementos pequenos). A ação principal é **preta** (`.btn-primary`).
- **Cards**: branco, sem borda, raio 14, `--shadow-card`; no hover a sombra sobe (`--shadow-raised`), **sem movimento**. Variantes `.card-sunken`, `.card-inverse`, `.card-outline`.
- **Sombra OU borda**, nunca as duas. Tiles internos são *sunken* (#F7F7F8) sem filete.
- **Densidade de ferramenta de dados** (o DS indica 12px para o "chrome de dashboard"): texto de interface `--ui-text-size` (13px), tabelas 12px, legendas 11px, eyebrow 10px. **Controles** (botões, campos, selects, ícones) com `--ui-control-h` (30px), raio `--ui-control-radius` (8px), filete `--border-subtle`, foco = borda preta. Título de página `--page-title-size` (28px, peso 300).
- **Tabelas**: células `8px 12px` (linha de ~34px), cabeçalho em eyebrow, filete de 1px entre linhas.
- **Barra de filtros**: rótulo em eyebrow sobre o campo; KPIs (`<KpiPill>`) com a mesma anatomia (eyebrow + linha de 30px, filete à esquerda, sem caixa), agrupados em `.kpi-group` à direita.
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
| Densidade (`--ui-text-size`, `--ui-control-h`, `--ui-control-radius`, `--page-title-size`) | Refino pedido para aproximar a plataforma da ferramenta de controladoria que usa o mesmo DS: interface em 13px, controles de 30px, título leve. Os tokens do DS continuam intactos em `tokens.css`. |
| `.kpi-group` | Mantém os KPIs juntos e à direita na barra de filtros (quebram de linha como bloco). |
| `.th-sort` e `table.table-dense` | Cabeçalho ordenável (o eyebrow vira botão; a coluna ativa fica preta, com `aria-sort`) e tabela larga com filete lateral de 8px — usados no ranking de salários. |
| Navegação **lateral** | O DS desenha um trilho de ícones no TopBar para ~7 destinos; a plataforma tem 17, em seções. A navegação lateral usa a mesma linguagem (ghost + ativo preto) e, recolhida, vira o próprio trilho de ícones 32×32 (itens de 32px, texto de 13px, ícones de 16px). |
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
2. Blocos em `.card` (padding `--gutter-card`, ou `--gutter-card-sm` em cards compactos; gap `--space-5` entre cards).
3. Título de card = `.eyebrow`; métrica em `--text-metric-size` (44px) ou `--text-title-size` (24px) em grades densas, peso 400; legenda em `--text-secondary`.
4. Botões `.btn .btn-primary | .btn-accent | .btn-outline | .btn-ghost | .btn-danger` (o ícone é reduzido para 14px pelo CSS).
5. Status com `badgeStyle(TOM)` a partir de `lib/tones`.
6. Campos sem estilo inline de tamanho/borda — o CSS global já aplica 30px, raio 8 e 13px. Se precisar de cor de fundo num `select`, use `backgroundColor` (o atalho `background` apaga a seta).
7. Nenhuma cor em hex/rgba no componente — só `var(--token)`.

## Observação de acessibilidade

Dois valores do DS ficam abaixo de 4,5:1 sobre branco em textos pequenos:
`--text-negative` (#E8402F ≈ 4,0:1) e `--text-muted` (#AAA9AB ≈ 2,3:1, por isso
restrito ao eyebrow de 10px). Foram mantidos como no DS; se o time quiser AA
estrito em textos de 12px, o ajuste é feito uma única vez em `src/index.css`.
