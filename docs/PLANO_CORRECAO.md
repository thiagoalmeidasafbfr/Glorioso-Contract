# Plano de correção — Glorioso-Contract

Origem: análise de fluxo de informação e UI/UX (set/2026). Objetivo: levar o
sistema de "ferramenta contratual do Jurídico" para **hub multissetorial de
registro, consulta e movimentação de atletas**.

Legenda de status: ✅ feito · 🚧 em andamento · ⬜ pendente

---

## Fase 1 — Base confiável (segurança e consistência)

| # | Item | Status |
|---|---|---|
| 1.1 | Papel do perfil deixa de vir do `raw_user_meta_data` no signup (escalada de privilégio) — migration 019 | ✅ |
| 1.2 | `get_my_role()` retorna `null` para perfil desativado (`ativo = false`) — migration 019 | ✅ |
| 1.3 | Usuário não pode alterar o próprio `role`/`ativo` (trigger de proteção) — migration 019 | ✅ |
| 1.4 | "Apagar toda a base" restrito a `master` (UI + guarda na função) | ✅ |
| 1.5 | Guarda `canEdit` não libera edição quando o perfil é nulo | ✅ |
| 1.6 | `deleteAthlete`: coluna correta (`clausula_fin_id`) e erros não engolidos | ✅ |
| 1.7 | Tabela de câmbio única (`src/lib/fx.ts`) substituindo as taxas duplicadas em 9+ arquivos | ✅ |
| 1.8 | Aviso visível quando o app roda em modo local (sem Supabase) | ✅ |
| 1.9 | Decidir fonte única da verdade: ponte `014` (usada pelo app) × núcleo `012` (vazio) | ✅ decidido: ponte `014` (migrations 020–029 e o app gravam só nela; colunas do núcleo em `ac_atletas` — BID/FIFA/apelido/pé/clube atual — passam a ser lidas/gravadas) |
| 1.10 | Bloquear build de produção sem `VITE_USE_SUPABASE=true` | ⬜ |
| 1.11 | PTAX histórica persistida (`ac_taxas_cambio`) + conversão por data de vencimento/pagamento | ✅ `fetchPtaxOn` (BCB CotacaoMoedaDia, recua 7 dias, cache memória+localStorage, lê/grava `ac_taxas_cambio`); usada no default do PaymentModal (data do pagamento) e na PTAX de aquisição da Amortização. Relatórios de exposição ainda usam a PTAX corrente/aproximada |

## Fase 2 — UX essencial (quick wins)

| # | Item | Status |
|---|---|---|
| 2.1 | Modais de formulário não fecham ao clicar fora (perda de dados) | ✅ |
| 2.2 | Code-splitting das rotas (`React.lazy`) — bundle inicial menor | ✅ |
| 2.3 | Layout responsivo: sidebar vira drawer em telas < 900px | ✅ |
| 2.4 | Rota órfã `/dashboard` acessível no menu | ✅ |
| 2.5 | Seletor de idioma escondido até o i18n estar ligado (hoje não faz nada) | ✅ |
| 2.6 | Rótulos com `htmlFor`, erros inline por campo, `aria-invalid` | ⬜ |
| 2.7 | Fonte mínima 12px e contraste AA (sidebar, `--text-faint`, `--icon-off`) | ⬜ |
| 2.8 | Sistema de toasts substituindo `alert()`; diálogo de confirmação próprio | ⬜ |
| 2.9 | Linhas de tabela navegáveis por teclado (links reais) | ⬜ |
| 2.10 | Ordenação e cabeçalho fixo nas tabelas de relatório | ⬜ |
| 2.11 | Aba ativa da ficha do atleta na URL; aba padrão coerente | ⬜ |

## Fase 3 — Governança multissetorial

| # | Item | Status |
|---|---|---|
| 3.1 | Papéis: `juridico`, `tesouraria`, `controladoria`, `assessor`, `futebol`, `rh`, `diretoria` + RLS por papel | ⬜ |
| 3.2 | Trilha de auditoria (tabela `ac_auditoria` + trigger genérico) e `created_by` real | ⬜ |
| 3.3 | Workflow RASCUNHO → EM_REVISÃO → APROVADO (Controladoria aprova) | ⬜ |
| 3.4 | Baixa de parcela com valor pago, PTAX efetiva e autor | ⬜ |
| 3.5 | Upload de PDF de contratos/aditivos no Supabase Storage (`ac_documentos`) | ⬜ |
| 3.6 | Metadados hoje em `notes` (empréstimo, renegociação, RJ) viram colunas | ⬜ |

## Fase 4 — Movimentação de atletas

| # | Item | Status |
|---|---|---|
| 4.1 | RPC atômica `registrar_movimentacao` (venda/compra/empréstimo/retorno/rescisão) gravando `ac_movimentacoes` (migration 026) + tela "Registrar movimentação" com prévia e "Desfazer" (master, só a mais recente) | ✅ (modo local replica os efeitos em JS, sem transação) |
| 4.2 | Efeitos automáticos: status do atleta, encerra vínculo, cancela parcelas futuras, transfere titularidade, baixa do intangível, sell-on | 🚧 status, vínculo, salário/imagem futuros e titularidade BFR ✅; baixa do intangível e geração de sell-on ainda manuais (contrato de SAÍDA continua em "Novo contrato") |
| 4.3 | Criação de contrato + cláusulas + parcelas em uma única transação (RPC) | 🚧 rollback compensatório no front (falha → apaga o contrato criado, que leva cláusulas/parcelas); RPC transacional ainda não existe |
| 4.4 | Registro BID/CBF e FIFA ID na ficha do atleta | ✅ (+ apelido, pé preferido, clube atual; status LESIONADO preservado) |

## Fase 5 — Alertas e integrações

| # | Item | Status |
|---|---|---|
| 5.1 | Geração de `ac_alertas` (pg_cron/Edge Function): parcelas a vencer, contratos expirando, gatilhos | ⬜ |
| 5.2 | Notificação por e-mail por setor | ⬜ |
| 5.3 | Alimentação de desempenho (jogos/gols) para apuração automática de gatilhos | ✅ aba Desempenho (manual) + importação XLSX em Dados & Modelos + progresso em Gatilhos (`vw_ac_gatilhos_progresso`); marcar o gatilho como atingido continua manual |
| 5.4 | Exportação contábil (ERP/SPED) | 🚧 exportação genérica de lançamentos (XLSX/CSV) com rubrica sugerida; falta de-para com plano de contas/ERP e SPED |
| 5.5 | Premissas (CFO) lendo contratos/remuneração em vez de redigitação | ✅ "Puxar dos contratos" por linha e "Sincronizar com contratos" em massa, com diff antes de gravar |
| 5.6 | Amortização persistida por competência | ✅ "Fechar competência" (master/controladoria) grava `ac_amortizacao_fechamentos`; histórico com exportação XLSX |

## Transversal

- Testes unitários para `salaryFlow`, `loanSalary`, `renegotiation`, amortização + CI (lint/build/test).
- Remover `src-backup-20260424/` e `src/App.css` morto; corrigir `docs/ESPECIFICACOES.md` (referência a `FLUXO_INPUT.md`, enum `NAO_APLICAVEL`).
