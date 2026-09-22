# Glorioso-Contract

Sistema de gestão de contratos, cláusulas, remuneração e obrigações
financeiras de atletas do **Botafogo SAF**. O atleta é a figura central: todo
contrato, cláusula, parcela, gatilho salarial, passivo (clube/agente), direito
de imagem e titularidade econômica pertence a um atleta.

Principais funcionalidades:

- Cadastro de atletas, clubes, intermediários e PJs de imagem.
- Contratos (entrada, saída, empréstimos, intermediação, luvas, sell-on) com
  cláusulas e fluxo de parcelas multimoeda (PTAX do dia ou fixada).
- Fluxo mensal automático de salário CLT e direito de imagem, com pró-rata,
  gatilhos de meta e rateio de salário em empréstimos.
- Acordos e renegociações de dívidas, preservando o rastreio das parcelas
  originais; marcação de itens em Recuperação Judicial.
- Amortização do intangível, simulação de venda, relatórios (consolidado,
  sell-on, direitos econômicos, gatilhos) e importação/exportação de planilhas.

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | React 19 + TypeScript, Vite 8, react-router-dom 7 |
| Estilo / gráficos | Tailwind CSS 4, Recharts 3 |
| Planilhas | SheetJS (`xlsx`) |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Testes | Vitest |
| Hospedagem | Vercel |

## Como rodar

Requisitos: Node 22.12+ e npm.

```bash
npm install
cp .env.example .env      # e preencha as variáveis
npm run dev               # http://localhost:5173
```

### Variáveis de ambiente (`.env`)

| Variável | Descrição |
|---|---|
| `VITE_USE_SUPABASE` | `true` usa o Supabase; `false` roda em **modo local** (dados só no `localStorage` do navegador, começando vazio). |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Projeto Supabase (obrigatórias com `VITE_USE_SUPABASE=true`). |
| `VITE_ALLOW_LOCAL_BUILD` | `true` libera `npm run build` sem Supabase (demos/CI). **Nunca** use em produção. |

O build de produção **falha de propósito** quando `VITE_USE_SUPABASE` não é
`true`, para impedir publicar um app que não persiste dados no servidor.

### Banco de dados (Supabase)

Aplique as migrations de `supabase/migrations/` **em ordem numérica**, de
`001_schema.sql` até `019_seguranca_perfis.sql` (pelo SQL Editor, uma por vez,
ou com `supabase db push`). O passo a passo, incluindo a criação do primeiro
usuário `master`, está em [`SETUP_SUPABASE.md`](SETUP_SUPABASE.md).

Observação: o app usa como fonte da verdade o backbone `ac_*` da `012` mais as
tabelas-ponte da `014` (`ac_clausulas_fin`, `ac_parcelas_fin`,
`ac_gatilhos_salario`, …). Detalhes em
[`docs/ESPECIFICACOES.md`](docs/ESPECIFICACOES.md#3-modelo-de-dados).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite). |
| `npm test` | Testes unitários (Vitest) de `src/lib`. `npm run test:watch` para modo contínuo. |
| `npm run lint` | ESLint no projeto inteiro. |
| `npm run lint:lib` | ESLint estrito em `src/lib` e nas configs (bloqueante no CI). |
| `npm run build` | `tsc -b` + `vite build` (exige Supabase — ver acima). |
| `npm run preview` | Serve o build localmente. |

Build local sem Supabase (demo):

```bash
VITE_ALLOW_LOCAL_BUILD=true npm run build
```

O CI (`.github/workflows/ci.yml`) roda, em Node 22 e 24: `npm ci`, `tsc -b`,
`lint:lib`, `lint` (informativo enquanto houver erros legados em páginas e
componentes), `npm test` e `npm run build`.

## Estrutura

```
├── src/
│   ├── App.tsx            # rotas (lazy)
│   ├── pages/             # páginas de rota (atletas, cadastros, relatórios, amortização…)
│   ├── components/        # UI reutilizável (athletes/, modals/)
│   ├── context/           # AppContext (moeda/idioma), AuthContext (sessão/perfil)
│   ├── lib/               # regras de negócio e acesso a dados
│   │   ├── athleteQueries.ts   # camada de dados (Supabase ou localStore)
│   │   ├── salary.ts, salaryFlow.ts, remflow.ts, loanSalary.ts
│   │   ├── renegotiation.ts, judicialRecovery.ts, liabilityFlow.ts
│   │   ├── fx.ts, ptax.ts, format.ts, ownership.ts
│   │   ├── importCanon.ts, importHelpers.ts, importSheets.ts
│   │   └── __tests__/          # testes unitários (Vitest)
│   ├── types/             # tipos TS do domínio
│   └── i18n/
├── supabase/migrations/   # 001 → 019
├── docs/                  # especificações, plano de correção, schema, backup
└── public/
```

## Documentação

- [`docs/ESPECIFICACOES.md`](docs/ESPECIFICACOES.md) — especificação técnica e funcional.
- [`docs/PLANO_CORRECAO.md`](docs/PLANO_CORRECAO.md) — plano de correção por fases e status.
- [`docs/SCHEMA_ATLETA_CENTRAL.md`](docs/SCHEMA_ATLETA_CENTRAL.md) — schema atleta-central comentado.
- [`docs/BACKUP.md`](docs/BACKUP.md) — backup e restauração.
- [`SETUP_SUPABASE.md`](SETUP_SUPABASE.md) — provisionamento do Supabase.
- `fluxo-input-glorioso.pptx` / `.pdf` e `scratchpad-fluxo-input.html` — proposta de governança do fluxo de input.
