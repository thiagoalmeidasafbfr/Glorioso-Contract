# Glorioso-Contract — Especificações do Projeto

Sistema de gestão de contratos, cláusulas, remuneração e obrigações
financeiras de atletas para SAF (Sociedade Anônima do Futebol). Este
documento consolida a especificação técnica e funcional do produto:
propósito, arquitetura, modelo de dados, regras de negócio, telas,
integrações e governança.

Última atualização: 2026-08-12
Branch de trabalho: `claude/analise-fluxo-input-kfqe6d`

---

## 1. Visão geral

### 1.1 Propósito

Centralizar em um único sistema toda a informação contratual e financeira
relacionada a atletas — do contrato assinado até o pagamento das parcelas —
com o **atleta como figura central**. Toda linha de dinheiro tem dono
(atleta), cláusulas têm condição e efeito formalizados, remuneração é
versionada e obrigações são separadas entre passivo firme e contingente.

### 1.2 Domínios cobertos

| Domínio | O que resolve |
|---|---|
| Cadastro do atleta | Identidade, categoria, PJ de imagem, nacionalidades, agente |
| Contratos | Trabalho, imagem, aquisição, venda, empréstimo, representação, aditivos |
| Cláusulas | Condição→Efeito→Avaliação (gatilhos esportivos, financeiros, mais-valia, reajuste) |
| Remuneração | Salário, imagem, luvas, bônus — versionada sem sobreposição |
| Obrigações financeiras | Transferência, salário, imagem, comissão, solidariedade, gatilho, luvas, bônus, sell-on |
| Parcelas | Cronograma, multimoeda, PTAX, índice de correção, status |
| Direitos econômicos | Ownership por detentor (BFR, clube, agente, atleta, terceiro) |
| Ativos intangíveis | Capitalização e amortização contábil |
| Recuperação judicial | Passivo firme × contingente |
| Relatórios | Consolidado, Sell-on, Direitos Econômicos, Gatilhos, Visão Atletas |

### 1.3 Público-alvo (papéis)

- **Jurídico** — carrega contratos, cláusulas e remuneração contratada.
- **Tesouraria** — opera parcelas, câmbio, PTAX, baixas e gatilhos financeiros.
- **Controladoria** — reconcilia contabilmente, define rubrica, conta,
  centro de custo, amortização.
- **Assessor Financeiro** — analisa exposição, cenários, mais-valia.

Detalhamento da governança em `docs/FLUXO_INPUT.md` (proposta) e no deck
`fluxo-input-glorioso.pptx`.

---

## 2. Arquitetura

### 2.1 Stack

| Camada | Tecnologia |
|---|---|
| Front-end | React 19 + TypeScript, Vite 8 |
| Router | react-router-dom 7 |
| Estilo | Tailwind CSS 4 + CSS custom no `index.css` |
| Gráficos | Recharts 3 |
| Planilhas | SheetJS (`xlsx`) — importação/exportação |
| Estado | Context API (`AppContext`, `AuthContext`) + `localStore` |
| Backend | Supabase (PostgreSQL 16 + Auth + RLS) |
| Hospedagem | Vercel (`vercel.json`) |

### 2.2 Organização do repositório

```
Glorioso-Contract/
├── src/
│   ├── App.tsx                # rotas
│   ├── main.tsx
│   ├── components/            # UI reutilizável
│   │   ├── athletes/          # modais específicos de atleta
│   │   └── modals/            # modais compartilhados
│   ├── context/               # AppContext (dados), AuthContext (sessão)
│   ├── lib/                   # regras de negócio, queries, importadores
│   ├── pages/                 # 19 páginas de rota
│   ├── types/                 # tipos TS espelhando o schema
│   ├── i18n/
│   └── assets/
├── supabase/
│   └── migrations/            # 17 migrations (001 → 017)
├── docs/                      # documentação
├── public/
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### 2.3 Configuração

- `.env.example` documenta as variáveis exigidas (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`).
- `USE_SUPABASE` em `src/lib/supabase.ts` habilita o modo remoto; sem as
  variáveis o app roda com `localStore` (persistência em `localStorage`).
- Setup completo do banco em `SETUP_SUPABASE.md`.

### 2.4 Build e desenvolvimento

```bash
npm install
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run preview      # preview do build
```

---

## 3. Modelo de dados

O modelo canônico é o **schema atleta-central** (`ac_*`), introduzido pela
migration `012_schema_robusto_atleta_central.sql`. A modelagem anterior
(em inglês) coexiste via bridge (`014_bridge_app_atleta_central.sql`).

### 3.1 Princípios de modelagem

1. **Atleta central** — `atleta_id` **NOT NULL** em toda tabela de fato,
   inclusive `ac_obrigacoes_financeiras`.
2. **Financeiro polimórfico** — todo dinheiro em `ac_obrigacoes_financeiras`
   + `ac_parcelas`, com `natureza` discriminando a origem.
3. **Contrapartes unificadas** — `ac_entidades` + extensões 1:1
   (`_clube`, `_agente`, `_pj_imagem`, `_fundo`).
4. **Cláusula Condição→Efeito** — `ac_clausulas` →
   `ac_clausula_condicoes` (métrica/operador/limite/janela/escopo) →
   `ac_clausula_efeitos` (gerar obrigação / alterar remuneração / gerar
   receita) → `ac_clausula_avaliacoes`.
5. **Remuneração versionada** — `ac_remuneracoes` com
   `vigencia_inicio`/`vigencia_fim` e restrição `EXCLUDE` anti-sobreposição
   por (atleta, componente), usando `btree_gist`.
6. **Integração contábil** — `ac_obrigacoes_financeiras` carrega `rubrica`,
   `tratamento_contabil` (CAPITALIZAR/DESPESA), `conta_contabil_id`,
   `centro_custo_id`, `ativo_intangivel_id`.
7. **Multimoeda + correção** — `ac_moedas`, `ac_taxas_cambio` (PTAX) e
   `indice_correcao` por parcela.
8. **Contingência** — `ac_obrigacoes_financeiras.contingente` separa
   passivo firme de contingente.
9. **Auditoria + aditivos** — `created_at`/`updated_at` em tudo,
   `ac_aditivos` versiona contratos.

### 3.2 Enums principais

| Enum | Valores |
|---|---|
| `ac_atleta_status` | ATIVO, EMPRESTADO, VENDIDO, DESLIGADO |
| `ac_contrato_tipo` | TRABALHO, IMAGEM, AQUISICAO, VENDA, EMPRESTIMO, REPRESENTACAO |
| `ac_contrato_status` | ATIVO, ENCERRADO, RESCINDIDO |
| `ac_transferencia_tipo` | ENTRADA, SAIDA, EMPRESTIMO_ENTRADA, EMPRESTIMO_SAIDA |
| `ac_obrigacao_direcao` | A_PAGAR, A_RECEBER |
| `ac_obrigacao_natureza` | TRANSFERENCIA, SALARIO, IMAGEM, INTERMEDIACAO, SOLIDARIEDADE, MAIS_VALIA, GATILHO, LUVAS, BONUS, SELL_ON |
| `ac_parcela_status` | PENDENTE, PARCIALMENTE_PAGA, PAGA, VENCIDA, CANCELADA |
| `ac_tratamento_contabil` | CAPITALIZAR, DESPESA |
| `ac_remuneracao_componente` | SALARIO, IMAGEM, LUVAS, BONUS |
| `ac_condicao_metrica` | JOGOS, GOLS, ASSISTENCIAS, MINUTOS, TITULOS, VENDA_VALOR, ... |
| `ac_condicao_operador` | =, ≥, ≤, >, <, ENTRE |
| `ac_condicao_janela` | TEMPORADA, CONTRATO, COMPETICAO |
| `ac_condicao_escopo` | PROPRIO_ATLETA, RELATIVO_AO_CLUBE |
| `ac_efeito_tipo` | GERAR_OBRIGACAO, ALTERAR_REMUNERACAO, GERAR_RECEITA |
| `ac_avaliacao_status` | PENDENTE, APLICADA, NAO_APLICAVEL |
| `ac_indice_correcao` | NENHUM, SELIC, CDI, IGPM, IPCA |
| `HolderType` (TS) | BFR, CLUBE, AGENTE, ATLETA, TERCEIRO |

### 3.3 Tabelas — visão de conjunto

| Tabela | Papel | Caminho até `atleta_id` |
|---|---|---|
| `ac_atletas` | Núcleo do atleta | (é o atleta) |
| `ac_atleta_nacionalidades` | 0..N nacionalidades | `atleta_id` direto |
| `ac_entidades` (+ 4 extensões) | Contrapartes (dimensão) | via satélites |
| `ac_contratos` | Trabalho, imagem, aquisição, venda, empréstimo, representação | `atleta_id` direto |
| `ac_aditivos` | Versionamento de contrato | via `contrato_id` |
| `ac_transferencias` | Compra/venda/empréstimo | `atleta_id` direto |
| `ac_remuneracoes` | Salário/imagem/luvas/bônus versionados | `atleta_id` direto |
| `ac_obrigacoes_financeiras` | **Todo fluxo de dinheiro** | `atleta_id` NOT NULL |
| `ac_parcelas` | Cronograma de vencimentos | via `obrigacao_id` |
| `ac_clausulas` / `_condicoes` / `_efeitos` / `_avaliacoes` | Gatilhos e efeitos | `atleta_id` direto |
| `ac_eventos_desempenho` | Jogos/gols/assistências agregados | `atleta_id` direto |
| `ac_ativos_intangiveis` | Direito econômico capitalizado | `atleta_id` direto |
| `ac_amortizacoes` | Cronograma de amortização | via `ativo_intangivel_id` |
| `ac_documentos` | Anexos PDF | `atleta_id` NOT NULL |
| `ac_moedas` / `ac_taxas_cambio` / `ac_indices_correcao_valores` / `ac_contas_contabeis` / `ac_centros_custo` | Suporte / dimensão | referenciadas por fatos |

Detalhamento com DDL comentado em `docs/SCHEMA_ATLETA_CENTRAL.md`.

### 3.4 Diagrama textual

```
                         ┌──────────────────┐
                         │   ac_atletas     │  ◄── figura central
                         └──────────────────┘
        ┌───────────────┬───────┴────────┬──────────────┬───────────────┐
        ▼               ▼                ▼              ▼               ▼
 ac_contratos    ac_transferencias  ac_remuneracoes  ac_clausulas   ac_eventos_
   │  └─ ac_aditivos     │           (versionada)      │              desempenho
   │                     ▼                             ▼
   │             ac_ativos_intangiveis        ac_clausula_condicoes
   │                     │                    ac_clausula_efeitos
   │                     ▼                    ac_clausula_avaliacoes
   │             ac_amortizacoes                     │  (gera)
   │                                                 │
   └──────────────► ac_obrigacoes_financeiras ◄──────┘  (atleta_id NOT NULL)
                            │  (contraparte → ac_entidades)
                            ▼
                       ac_parcelas  (multimoeda + PTAX + índice)
```

### 3.5 Migrations

| # | Arquivo | Escopo |
|---|---|---|
| 001 | `001_schema.sql` | Schema base inicial |
| 002 | `002_rls.sql` | Row Level Security |
| 003 | `003_clausulas_venda.sql` | Cláusulas de venda |
| 004 | `004_athletes_system.sql` | Sistema de atletas (legado) |
| 005 | `005_economic_rights.sql` | Direitos econômicos |
| 006 | `006_athlete_central.sql` | Primeiro esboço atleta-central |
| 007 | `007_clubs_intermediaries.sql` | Clubes e intermediários |
| 008 | `008_economic_holder_agente.sql` | Detentor agente |
| 009 | `009_remuneracao_agente_vinculo.sql` | Remuneração/agente |
| 010 | `010_external_ids.sql` | IDs externos |
| 011 | `011_athlete_pj_and_category.sql` | PJ de imagem e categoria |
| 012 | `012_schema_robusto_atleta_central.sql` | **Schema `ac_*` definitivo** |
| 013 | `013_seed_joao.sql` | Seed do caso de aceitação JOÃO |
| 014 | `014_bridge_app_atleta_central.sql` | Bridge legado ↔ `ac_*` |
| 015 | `015_contrato_vinculo_relacionado.sql` | Vínculo entre contratos |
| 016 | `016_gatilho_imagem.sql` | Gatilhos aplicados a imagem |
| 017 | `017_ptax_fixada.sql` | PTAX fixada por parcela |

---

## 4. Regras de negócio críticas

### 4.1 Atleta central (invariante estrutural)

Toda linha de `ac_obrigacoes_financeiras` tem `atleta_id NOT NULL`.
Obrigações puramente institucionais (sem atleta) **não são suportadas
neste domínio** — é uma decisão consciente.

### 4.2 Remuneração versionada (sem sobreposição)

`ac_remuneracoes` usa `EXCLUDE USING gist (atleta_id WITH =, componente
WITH =, daterange(vigencia_inicio, vigencia_fim, '[)') WITH &&)`. Um
gatilho de aumento é obrigado a **fechar** o registro anterior antes de
abrir o novo. Requer a extensão `btree_gist`.

### 4.3 Cláusula Condição→Efeito→Avaliação

- Uma cláusula pode ter N condições combinadas por lógica **E/OU**.
- Cada condição tem `metrica`, `operador`, `valor_limite`, `janela` e
  `escopo` (próprio atleta ou relativo a um clube).
- Efeitos suportados: gerar obrigação, alterar remuneração, gerar receita.
- Avaliação (`ac_clausula_avaliacoes`) fecha o ciclo com status
  PENDENTE / APLICADA / NAO_APLICAVEL.

### 4.4 Passivo firme × contingente

`ac_obrigacoes_financeiras.contingente = false` é passivo firme; `true` é
contingente (gatilho ainda não apurado). Relatório de Recuperação
Judicial soma separadamente.

### 4.5 Multimoeda + PTAX

- `ac_parcelas.moeda_codigo` refere `ac_moedas`.
- `ac_taxas_cambio` guarda PTAX diária.
- `017_ptax_fixada.sql` permite **fixar** a PTAX de uma parcela específica
  (não usar a curva por padrão).
- `ac_indices_correcao_valores` guarda SELIC/CDI/IGPM/IPCA e o campo
  `indice_correcao` por parcela aplica a correção.

### 4.6 Contabilização e intangível

- Toda obrigação carrega `tratamento_contabil` (CAPITALIZAR/DESPESA),
  `rubrica`, `conta_contabil_id`, `centro_custo_id`.
- Se `CAPITALIZAR`, a obrigação integra `ac_ativos_intangiveis`
  (vida útil em meses, valor de aquisição, amortização mensal em
  `ac_amortizacoes`).

### 4.7 Direitos econômicos (ownership)

Ownership do atleta é distribuída entre `HolderType` (BFR / CLUBE /
AGENTE / ATLETA / TERCEIRO). Somatório = 100 %. Base da mais-valia e da
solidariedade FIFA em cima disso.

### 4.8 Sell-on

Cláusulas `SELL_ON_FEE` (pagar) e `SELL_ON_FEE_RECEBER` (receber),
base `MAIS_VALIA` ou `VALOR_TOTAL`. Relatório específico em
`PageRelSellOn`.

---

## 5. Front-end

### 5.1 Rotas (`src/App.tsx`)

| Rota | Página | Papel |
|---|---|---|
| `/` | redirect → `/atletas` | — |
| `/atletas` | `PageAthletesList` | listagem |
| `/atletas/:id` | `PageAthleteDetail` | ficha do atleta |
| `/atletas/:id/contratos/novo` | `PageAthleteNewContract` | novo contrato |
| `/criar` | `PageWizard` | funil único de entrada |
| `/dashboard` | `PageDashboard` | KPIs por atleta |
| `/dashboards` | `PageDashboards` | dashboards consolidados |
| `/album` | `PageAlbum` | álbum visual |
| `/obrigacoes/:clauseId` | `PageClauseDetail` | detalhe de cláusula |
| `/clubes` · `/clubes/:id` | `PageCadastros` · `PageCadastroDetail` | cadastro de clubes |
| `/intermediarios` · `/intermediarios/:id` | idem | cadastro de intermediários |
| `/relatorios/visao-atletas` | `PageVisaoAtletas` | visão consolidada |
| `/relatorios/consolidado` | `PageConsolidado` | consolidado financeiro |
| `/relatorios/acordos` | `PageAcordos` | acordos e renegociações |
| `/relatorios/sell-on` | `PageRelSellOn` | sell-on |
| `/relatorios/direitos-economicos` | `PageRelDirEconomicos` | ownership |
| `/relatorios/gatilhos` | `PageRelGatilhos` | gatilhos ativos |
| `/relatorios/recuperacao-judicial` | `PageRecuperacaoJudicial` | firme × contingente |
| `/dados` · `/dados/planilhas` | `PageDados` · `PageImportarPlanilhas` | import/export |
| `/login` | `PageLogin` | autenticação Supabase |

### 5.2 Componentes reutilizáveis

Em `src/components/`:

- `Layout.tsx` — shell com navegação lateral
- `EntityPicker.tsx` — seletor de contraparte
- `FlowBuilder.tsx` — builder de fluxo de parcelas
- `Icon.tsx`, `ImageUpload.tsx`, `KpiCard.tsx`, `KpiPill.tsx`
- `OwnershipBar.tsx` — distribuição de direitos econômicos
- `NumberInput.tsx`, `PageHero.tsx`, `RefLink.tsx`
- `RemunerationChart.tsx` — timeline de remuneração
- `RowActions.tsx`, `SheetIO.tsx`
- `athletes/PaymentModal.tsx`
- `modals/` — `EditModals`, `LoanShareModal`, `NewObligationModal`,
  `RenegotiationEditModal`

### 5.3 Contextos

- `AuthContext` — sessão Supabase; loading + gate no `App.tsx`.
- `AppContext` — carrega e cacheia entidades, atletas, contratos,
  parcelas para consumo pelas páginas.

### 5.4 Camada de dados (`src/lib/`)

| Módulo | Responsabilidade |
|---|---|
| `supabase.ts` | Cliente + flag `USE_SUPABASE` |
| `localStore.ts` | Persistência em `localStorage` (fallback) |
| `athleteQueries.ts` | Queries de atleta |
| `athleteOverview.ts`, `athleteConsolidado.ts` | Consolidados por atleta |
| `entityObligations.ts` | Obrigações por contraparte |
| `judicialRecovery.ts` | Cálculo firme × contingente |
| `liabilityFlow.ts`, `salaryFlow.ts`, `remflow.ts` | Fluxos de passivo/salário/remuneração |
| `loanSalary.ts` | Salário em empréstimo |
| `ownership.ts` | Direitos econômicos |
| `ptax.ts` | Câmbio |
| `renegotiation.ts` | Renegociação |
| `reportPorters.ts` | Adapters para relatórios |
| `salary.ts` | Regras de salário |
| `format.ts` | Formatação de moeda/data |
| `image.ts` | PJ de imagem |
| `importCanon.ts`, `importHelpers.ts`, `importSheets.ts` | Importação de planilhas |
| `xlsx-utils.ts` | Wrapper SheetJS |

---

## 6. Import / Export

- **Importação de planilhas** — `PageImportarPlanilhas` + `importSheets.ts`
  normaliza colunas via `importCanon.ts`. Aceita XLSX. Usado para
  bootstrap do backlog contratual.
- **Exportação** — `SheetIO.tsx` gera XLSX para relatórios.

---

## 7. Autenticação e segurança

- Supabase Auth (email/senha) via `AuthContext`.
- Sessão bloqueia rotas — `App.tsx` mostra `PageLogin` quando
  `USE_SUPABASE` está ativo e não há sessão.
- **RLS** (`002_rls.sql`) — política inicial existente; expansão
  proposta na governança de fluxo (roles: `juridico`, `tesouraria`,
  `controladoria`, `assessor`).

---

## 8. Governança de dados (proposta)

Owner do input × operador × consumidores, resumido:

| Módulo | Jurídico | Tesouraria | Controladoria | Assessor |
|---|---|---|---|---|
| Cadastro de atleta/contrapartes | **R** | I | C | I |
| Contratos e aditivos | **R** | I | C | I |
| Cláusulas condição→efeito | **R** | C | C | I |
| Remuneração contratada | **R** | I | C | I |
| Obrigações financeiras | C | **R** | A | I |
| Parcelas, câmbio, PTAX | I | **R** | C | I |
| Avaliação de gatilho | C | **R** | I | I |
| Contabilização e amortização | I | C | **R** | I |
| Recuperação judicial | C | C | **R** | I |
| Relatórios estratégicos | I | I | C | **R** |

R = responsável · A = aprova · C = consultado · I = informado.

Detalhamento no deck `fluxo-input-glorioso.pptx` e no artefato HTML
`scratchpad-fluxo-input.html`.

---

## 9. Deploy

- **Vercel** (`vercel.json`) — build automático a partir da branch
  principal.
- **Supabase** — migrations aplicadas via CLI, ordem numérica.
- **Variáveis** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (documentadas em `.env.example`).

---

## 10. Roadmap sugerido

1. Perfis + RLS por área (juridico, tesouraria, controladoria, assessor).
2. Trilha de auditoria por parcela (quem baixou, quando, com qual PTAX).
3. Alertas de vencimento e de gatilhos a apurar.
4. Módulo de reconciliação orçado × realizado no nível de rubrica.
5. Exportação contábil (SPED/lançamentos) a partir de
   `ac_obrigacoes_financeiras`.
6. API pública read-only (relatórios) para consumo do Assessor.

---

## 11. Referências internas

- `README.md` — instruções de setup do template Vite.
- `SETUP_SUPABASE.md` — provisionamento do banco.
- `docs/SCHEMA_ATLETA_CENTRAL.md` — DDL comentado.
- `docs/BACKUP.md` — procedimentos de backup.
- `scratchpad-fluxo-input.html` / `fluxo-input-glorioso.pptx` —
  proposta de governança do fluxo de input.
