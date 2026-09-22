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
| 1.9 | Decidir fonte única da verdade: ponte `014` (usada pelo app) × núcleo `012` (vazio) | ⬜ decisão |
| 1.10 | Bloquear build de produção sem `VITE_USE_SUPABASE=true` (`vite.config.ts`; escape `VITE_ALLOW_LOCAL_BUILD=true` p/ demo/CI) | ✅ |
| 1.11 | PTAX histórica persistida (`ac_taxas_cambio`) + conversão por data de vencimento/pagamento | ⬜ |

## Fase 2 — UX essencial (quick wins)

| # | Item | Status |
|---|---|---|
| 2.1 | Modais de formulário não fecham ao clicar fora (perda de dados) | ✅ |
| 2.2 | Code-splitting das rotas (`React.lazy`) — bundle inicial menor | ✅ |
| 2.3 | Layout responsivo: sidebar vira drawer em telas < 900px | ✅ |
| 2.4 | Rota órfã `/dashboard` acessível no menu | ✅ |
| 2.5 | Seletor de idioma escondido até o i18n estar ligado (hoje não faz nada) | ✅ |
| 2.6 | Rótulos com `htmlFor`, erros inline por campo, `aria-invalid` — `Field.tsx`; todos os `<label>` associados; erro inline + "o que falta" no Novo contrato, Assistente, Novo atleta e modais da ficha | ✅ |
| 2.7 | Fonte mínima 12px e contraste AA (sidebar, `--text-faint`, `--icon-off`) — texto ≥ 12px, micro-rótulos maiúsculos ≥ 11px; sidebar ≥ 6,7:1, `--text-faint` 5,3:1, `--icon-off` ≥ 3:1 | ✅ |
| 2.8 | Sistema de toasts substituindo `alert()`; diálogo de confirmação próprio — `Toast.tsx`/`useToast`, `ConfirmDialog.tsx`/`useConfirm`; nenhum `alert`/`confirm` nativo restante | ✅ |
| 2.9 | Linhas de tabela navegáveis por teclado (links reais) — célula principal é `<Link>`; modais com `role=dialog`, Esc, foco inicial/preso/restaurado (`useDialogA11y`, `ModalFrame`) | ✅ |
| 2.10 | Ordenação e cabeçalho fixo nas tabelas de relatório — `useSortable` + `SortHeader` (`aria-sort`, ▲▼) em 7 relatórios + lista de atletas | ✅ |
| 2.11 | Aba ativa da ficha do atleta na URL; aba padrão coerente — `?aba=`, Consolidado primeiro, tablist ARIA com setas; h1 único | ✅ |

## Fase 3 — Governança multissetorial

| # | Item | Status |
|---|---|---|
| 3.1 | Papéis: `juridico`, `tesouraria`, `controladoria`, `assessor`, `futebol`, `rh`, `diretoria` + RLS por papel | 🚧 back (020) + front: `UserRole` com 8 papéis, `can()` por papel (`src/lib/permissoes.ts`), papel real no rodapé, tela `/admin/usuarios`. Falta validar em Supabase real e aplicar `can()` nas demais telas (a maioria ainda usa `canEdit`) |
| 3.2 | Trilha de auditoria (tabela `ac_auditoria` + trigger genérico) e `created_by` real | ✅ back (021) + front: aba "Histórico" na ficha do atleta e `/admin/auditoria` com filtros (tabela, usuário, período). Não testado contra Supabase real |
| 3.3 | Workflow RASCUNHO → EM_REVISÃO → APROVADO (Controladoria aprova) | ✅ back (022) + front: chip + ações em contratos/cláusulas da ficha (aba Transferências), fila `/aprovacoes`, opção "Salvar como rascunho" no novo contrato. Não testado contra Supabase real |
| 3.4 | Baixa de parcela com valor pago, PTAX efetiva e autor | ✅ back (023) + front: baixa/estorno via RPC, "pago por/em" na página da obrigação, Tesouraria dá baixa na página da obrigação. Não testado contra Supabase real; demais telas ainda escondem os botões de quem não tem `canEdit` |
| 3.5 | Upload de PDF de contratos/aditivos no Supabase Storage (`ac_documentos`) | ✅ back (024) + front: aba "Documentos" na ficha (upload, URL assinada, exclusão). Só com Supabase. Não testado contra Supabase real |
| 3.6 | Metadados hoje em `notes` (empréstimo, renegociação, RJ) viram colunas | 🚧 back (025, trigger sincroniza as colunas a partir de `notes`) + front lendo as colunas com fallback para `notes` (`src/lib/metadados.ts`). Gravação ainda só em `notes` (o trigger preenche as colunas) |

## Fase 4 — Movimentação de atletas

| # | Item | Status |
|---|---|---|
| 4.1 | RPC atômica `registrar_transferencia` (venda/empréstimo/retorno) gravando `ac_transferencias` | ⬜ |
| 4.2 | Efeitos automáticos: status do atleta, encerra vínculo, cancela parcelas futuras, transfere titularidade, baixa do intangível, sell-on | ⬜ |
| 4.3 | Criação de contrato + cláusulas + parcelas em uma única transação (RPC) | ⬜ |
| 4.4 | Registro BID/CBF e FIFA ID na ficha do atleta | ⬜ |

## Fase 5 — Alertas e integrações

| # | Item | Status |
|---|---|---|
| 5.1 | Geração de `ac_alertas` (pg_cron/Edge Function): parcelas a vencer, contratos expirando, gatilhos | ✅ back (027) + front: central `/alertas` (por setor/tipo, marcar lido, "Gerar alertas agora" p/ master) e contador no menu; em modo local as regras de parcela/contrato rodam no navegador. Não testado contra Supabase real |
| 5.2 | Notificação por e-mail por setor | 🚧 Edge Function `notificar-alertas` pronta (back); falta deploy/agendamento e configurar Resend. Nenhuma mudança de front necessária |
| 5.3 | Alimentação de desempenho (jogos/gols) para apuração automática de gatilhos | ⬜ |
| 5.4 | Exportação contábil (ERP/SPED) | ⬜ |
| 5.5 | Premissas (CFO) lendo contratos/remuneração em vez de redigitação | ⬜ |
| 5.6 | Amortização persistida por competência | ⬜ |

## Transversal

| # | Item | Status |
|---|---|---|
| T.1 | Testes unitários (Vitest, `npm test`) para `salaryFlow`, `loanSalary`, `renegotiation`, `salary`, `remflow`, `liabilityFlow`, `ownership`, `judicialRecovery`, `format`, `fx`/`ptax`, `importCanon`, `importHelpers` — `src/lib/__tests__/` | ✅ |
| T.2 | Testes da amortização — a matemática está dentro de `PageAmortizacao.tsx`; extrair para `src/lib/amortization.ts` e testar | ⬜ |
| T.3 | CI (`.github/workflows/ci.yml`): Node 20/22, `tsc -b`, lint, test, build | ✅ |
| T.4 | Lint do projeto inteiro bloqueante no CI (hoje informativo: 11 erros legados em `src/pages`, `src/components`, `src/context`) | ⬜ |
| T.5 | Remover `src-backup-20260424/` e `src/App.css` morto | ✅ |
| T.6 | Corrigir `docs/ESPECIFICACOES.md` (referência a `FLUXO_INPUT.md`, enum `ac_avaliacao_status`, migrations 018/019, papéis, estado atual × proposta) e README real | ✅ |

Bugs encontrados pelos testes e corrigidos em `src/lib`:

- `format.addMonths`: 31/01 + 1 mês virava 03/03 (overflow do `Date`), pulando
  fevereiro em fluxos de parcelas e renegociações; agora limita ao último dia do mês.
- `renegotiation` (`splitEqual`): divisão igual feita em ponto flutuante gerava
  parcelas desiguais (ex.: 1.009,80 em 10x → 9 × 100,97 + 101,07); agora em centavos.
- `importCanon.normAthleteRef`: CPF formatado (`012.345.678-90`) gerava chave
  diferente do CPF numérico; agora normaliza para 11 dígitos.

Pendências observadas (não corrigidas — exigem mudança de UI ou de regra):

- `loanSalary`: o rateio usa `base_salary`/`image_value` do contrato como valor
  integral, ignorando degraus de gatilhos já atingidos antes do empréstimo (a
  prévia do `LoanShareModal` faz o mesmo). Um gatilho atingido durante o
  empréstimo também sobrepõe o rateio.
- `renegotiation.createRenegotiation`: sobrescreve o `notes` original da
  parcela/cláusula de origem (ex.: perde uma marca `[RJ:…]`); o desfazer não o recupera.
- `salaryFlow`: parcelas de salário/imagem `CANCELADA` (renegociadas) não
  contam como "pagas" e são recriadas ao regenerar o fluxo.
- `importCanon.num`: texto sem dígitos (ex.: "a definir") vira `0`, não `null`
  (mantido: entra no `source_key` e mudar quebraria a idempotência).
