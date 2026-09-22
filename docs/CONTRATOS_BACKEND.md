# Contratos do backend — migrations 020 a 029

Este documento é o **contrato** entre o banco (Supabase/Postgres) e o front-end.
Descreve cada tabela, coluna, RPC e view criada nas migrations `020`–`029`, com
os nomes e tipos exatos, quem pode chamar e como chamar pelo `supabase-js`.
O front-end deve conseguir implementar tudo **sem ler o SQL**.

- Fonte da verdade: tabelas-ponte da migration `014` (`ac_atletas`, `ac_contratos`,
  `ac_clausulas_fin`, `ac_parcelas_fin`, …). Nada aqui muda nomes existentes.
- Ordem de execução: `019` → `020` → … → `029`. Todas são idempotentes
  (podem ser reaplicadas).
- Convenção de erros das RPCs (campo `code` do `PostgrestError`):
  - `42501` — sem permissão (papel não autorizado / perfil inativo)
  - `22023` — parâmetro/transição inválida (mensagem em português explica)
  - `P0002` — registro não encontrado

```ts
const { data, error } = await supabase.rpc('nome_da_rpc', { p_param: valor })
if (error) {
  if (error.code === '42501') toast('Sem permissão')
  else toast(error.message)
}
```

---

## 020 — Papéis setoriais e RLS

### Papéis (`profiles.role`)

`'master' | 'juridico' | 'tesouraria' | 'controladoria' | 'assessor' | 'futebol' | 'rh' | 'diretoria'`

```ts
export type UserRole =
  | 'master' | 'juridico' | 'tesouraria' | 'controladoria'
  | 'assessor' | 'futebol' | 'rh' | 'diretoria'
```

Todo novo usuário nasce `juridico` (019); só um `master` altera `role`/`ativo`.
Um perfil com `ativo = false` não lê nem grava nada (`get_my_role()` → `null`).

### Funções auxiliares

| Função | Retorno | Uso |
|---|---|---|
| `get_my_role()` | `text \| null` | papel do usuário logado; `null` se inativo/sem perfil |
| `has_role(variadic roles text[])` | `boolean` | `true` se o papel logado está na lista |

```ts
const { data: pode } = await supabase.rpc('has_role', { roles: ['master', 'tesouraria'] })
```

### Matriz de acesso (RLS)

**Leitura**: qualquer perfil **ativo**, em todas as tabelas abaixo (exceto `ac_auditoria`).

| Tabela | Escrita direta (INSERT/UPDATE/DELETE) |
|---|---|
| `ac_atletas`, `ac_entidades`, `ac_entidades_pj_imagem`, `ac_contratos`, `ac_clausulas_fin`, `ac_titularidade_economica`, `ac_passivos_clube`, `ac_passivos_agente`, `ac_direitos_imagem`, `ac_gatilhos_salario`, `ac_alertas`, tabelas do núcleo 012 | `master`, `juridico` |
| `ac_parcelas_fin` | `master`, `juridico` (tudo) · `tesouraria` (**só UPDATE**, só colunas de pagamento\*) |
| `ac_premissas_atleta` | `master`, `assessor`, `controladoria` |
| `ac_documentos` | `master`, `juridico` |
| `ac_movimentacoes` | `master` (demais via RPC `registrar_movimentacao`) |
| `ac_desempenho_atleta` | `master`, `futebol` |
| `ac_taxas_cambio` | INSERT/UPDATE: qualquer perfil ativo · DELETE: `master` |
| `ac_amortizacao_fechamentos` | `master`, `controladoria` |
| `ac_auditoria` | ninguém (leitura só `master`, `controladoria`, `diretoria`) |

\* `tesouraria` não pode alterar `clausula_fin_id`, `atleta_id`, `installment_number`,
`due_date`, `original_value`, `currency` de `ac_parcelas_fin` — o UPDATE falha com
`42501` "Tesouraria só pode registrar/estornar pagamentos".

> **Atenção (RLS silencioso)**: um UPDATE/DELETE sem permissão via PostgREST
> **não gera erro** — apenas afeta 0 linhas. Use `.select()` após o update e trate
> resposta vazia como "sem permissão", ou use as RPCs (que sempre dão erro `42501`).

---

## 021 — Auditoria e autoria

### Colunas de autoria (tabelas-ponte)

Tabelas: `ac_atletas`, `ac_entidades`, `ac_entidades_pj_imagem`,
`ac_titularidade_economica`, `ac_parcelas_fin`, `ac_passivos_clube`,
`ac_passivos_agente`, `ac_direitos_imagem`, `ac_gatilhos_salario`, `ac_premissas_atleta`:

| Coluna | Tipo | Preenchimento |
|---|---|---|
| `created_by` | `uuid` | automático (`auth.uid()` no INSERT); imutável |
| `updated_by` | `uuid \| null` | automático em todo UPDATE |

`ac_contratos` e `ac_clausulas_fin` **já tinham** `created_by text` (texto livre
gravado pelo app — continua igual). Nelas a autoria real é:

| Coluna | Tipo | Preenchimento |
|---|---|---|
| `created_by_uid` | `uuid` | automático no INSERT; imutável |
| `updated_by` | `uuid \| null` | automático em todo UPDATE |

O front **não precisa** enviar nenhuma dessas colunas.

### Tabela `ac_auditoria` (somente leitura)

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `bigint` | sequencial |
| `tabela` | `text` | ex.: `'ac_contratos'` |
| `registro_id` | `uuid \| null` | `id` da linha afetada |
| `operacao` | `'INSERT' \| 'UPDATE' \| 'DELETE'` | |
| `dados_antes` | `jsonb \| null` | linha antes (UPDATE/DELETE) |
| `dados_depois` | `jsonb \| null` | linha depois (INSERT/UPDATE) |
| `campos_alterados` | `text[] \| null` | só em UPDATE, ordem alfabética |
| `usuario_id` | `uuid \| null` | `null` = service role/cron |
| `usuario_email` | `text \| null` | |
| `ocorrido_em` | `timestamptz` | |

Tabelas auditadas: as 12 acima + `ac_documentos`, `ac_movimentacoes`,
`ac_desempenho_atleta`, `ac_amortizacao_fechamentos`. `ac_alertas` **não** é auditada.
UPDATEs em que só `updated_at`/`updated_by` mudaram não são registrados.

### View `vw_ac_auditoria_resumo` (somente leitura; `master`, `controladoria`, `diretoria`)

Colunas: `id, tabela, registro_id, operacao, campos_alterados, dados_antes,
dados_depois, usuario_id, usuario_email, usuario_nome, usuario_papel,
ocorrido_em, atleta_id (text)` — `atleta_id` é derivado de `dados_*.atleta_id`
(ou do próprio `registro_id` quando `tabela = 'ac_atletas'`). Para outros papéis
a view retorna vazio.

```ts
// histórico de um atleta
const { data } = await supabase.from('vw_ac_auditoria_resumo')
  .select('*').eq('atleta_id', athleteId).order('ocorrido_em', { ascending: false }).limit(200)

// histórico de um registro
const { data } = await supabase.from('vw_ac_auditoria_resumo')
  .select('*').eq('tabela', 'ac_contratos').eq('registro_id', contractId)
```

---

## 022 — Workflow de aprovação

### Colunas novas em `ac_contratos` e `ac_clausulas_fin`

| Coluna | Tipo | Default |
|---|---|---|
| `status_aprovacao` | `'RASCUNHO' \| 'EM_REVISAO' \| 'APROVADO' \| 'REJEITADO'` | `'APROVADO'` |
| `aprovado_por` | `uuid \| null` | preenchido ao aprovar/rejeitar |
| `aprovado_em` | `timestamptz \| null` | idem |
| `motivo_rejeicao` | `text \| null` | preenchido ao rejeitar; limpo ao aprovar |

O default `APROVADO` mantém o comportamento atual. Para usar o fluxo, crie o
registro com `status_aprovacao: 'RASCUNHO'` (INSERT normal) e use as RPCs.

Regra: via UPDATE direto, **só `master`/`controladoria`** podem mudar o status
para `APROVADO` ou `REJEITADO` (erro `42501` para os demais). Mudar para
`RASCUNHO`/`EM_REVISAO` ou editar outros campos sem mexer no status é livre
(para quem já tem escrita na tabela).

### RPCs

`p_tabela` aceita somente `'ac_contratos'` ou `'ac_clausulas_fin'`.
Todas retornam **a linha atualizada** (`jsonb` = objeto com todas as colunas da tabela).

| RPC | Parâmetros | Papéis | Transição |
|---|---|---|---|
| `enviar_para_revisao` | `p_tabela text, p_id uuid` | `master`, `juridico` | `RASCUNHO \| REJEITADO \| APROVADO` → `EM_REVISAO` (limpa `aprovado_por/_em`) |
| `aprovar_registro` | `p_tabela text, p_id uuid` | `master`, `controladoria` | `RASCUNHO \| EM_REVISAO` → `APROVADO` |
| `rejeitar_registro` | `p_tabela text, p_id uuid, p_motivo text` (obrigatório, não vazio) | `master`, `controladoria` | `RASCUNHO \| EM_REVISAO` → `REJEITADO` |

Transição fora da tabela acima → erro `22023`.

```ts
await supabase.rpc('enviar_para_revisao', { p_tabela: 'ac_contratos', p_id: contract.id })
await supabase.rpc('aprovar_registro',   { p_tabela: 'ac_contratos', p_id: contract.id })
await supabase.rpc('rejeitar_registro',  { p_tabela: 'ac_clausulas_fin', p_id: clause.id, p_motivo: 'Valor diverge do contrato' })
```

---

## 023 — Baixa de parcela

### Colunas novas em `ac_parcelas_fin`

| Coluna | Tipo | Descrição |
|---|---|---|
| `pago_por` | `uuid \| null` | quem deu a baixa |
| `pago_em` | `timestamptz \| null` | quando a baixa foi registrada |
| `valor_pago_moeda` | `numeric \| null` | valor pago na moeda da parcela |
| `ptax_utilizada` | `numeric \| null` | taxa moeda→BRL usada (`1` para BRL) |

Mantidas: `payment_status`, `payment_date`, `amount_paid_brl`, `exchange_rate`
(`exchange_rate` recebe o mesmo valor de `ptax_utilizada`).

### `baixar_parcela(p_id uuid, p_data date, p_valor_pago numeric, p_ptax numeric default null) → jsonb`

Papéis: `master`, `tesouraria`, `juridico`.

- `p_data` (obrigatório) → `payment_date`.
- `p_valor_pago`: valor na **moeda da parcela**; `null` → usa `original_value`.
- PTAX: moeda BRL → `1`; senão `p_ptax` → `fixed_exchange_rate` da parcela →
  `ptax_em(currency, p_data)` (tabela `ac_taxas_cambio`) → erro `22023` se nada encontrado.
- Grava `payment_status='PAGA'`, `valor_pago_moeda`, `ptax_utilizada`,
  `exchange_rate`, `amount_paid_brl = round(valor × ptax, 2)`, `pago_por`, `pago_em`.
- Erros: parcela já `PAGA` ou `CANCELADA` → `22023`.
- Retorno: a linha de `ac_parcelas_fin` atualizada.
- O status da cláusula-mãe (`ac_clausulas_fin.payment_status`/`installments_paid`)
  é recalculado automaticamente.

```ts
const { data: parcela } = await supabase.rpc('baixar_parcela', {
  p_id: inst.id, p_data: '2026-09-22', p_valor_pago: 500000, p_ptax: 6.2031,
})
// p_valor_pago e p_ptax podem ser null
```

### `estornar_baixa(p_id uuid) → jsonb`

Papéis: `master`, `tesouraria`. Só parcelas `PAGA`. Volta para `PENDENTE` e limpa
`payment_date, amount_paid_brl, exchange_rate, valor_pago_moeda, ptax_utilizada,
pago_por, pago_em`. Retorna a linha atualizada. (Se estiver vencida, a próxima
execução de `gerar_alertas()` a marca `EM_ATRASO`.)

```ts
await supabase.rpc('estornar_baixa', { p_id: inst.id })
```

---

## 024 — Documentos (Storage)

### Tabela `ac_documentos`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` | pk |
| `atleta_id` | `uuid` | **obrigatório** |
| `contrato_id` | `uuid \| null` | apagar o contrato apaga a linha (cascade) |
| `tipo` | `'CONTRATO' \| 'ADITIVO' \| 'OUTRO' \| null` | |
| `storage_path` | `text` | caminho no bucket `documentos` |
| `nome_arquivo` | `text` | nome original |
| `mime` | `text` | ex.: `application/pdf` |
| `tamanho_bytes` | `bigint` | |
| `descricao` | `text \| null` | |
| `url` | `text \| null` | legado (012); não usar |
| `enviado_por` | `uuid` | automático |
| `created_at`, `updated_at` | `timestamptz` | |

Escrita: `master`, `juridico`. Leitura: perfis ativos.

### Bucket `documentos` (privado)

Caminho: `<atleta_id>/<contrato_id | 'geral'>/<uuid>-<nome_arquivo>`.
Upload/remoção: `master`, `juridico`. Leitura: perfis ativos (via URL assinada).

```ts
const path = `${athleteId}/${contractId ?? 'geral'}/${crypto.randomUUID()}-${file.name}`
const up = await supabase.storage.from('documentos').upload(path, file, { contentType: file.type })
if (up.error) throw up.error
await supabase.from('ac_documentos').insert({
  atleta_id: athleteId, contrato_id: contractId ?? null, tipo: 'CONTRATO',
  storage_path: path, nome_arquivo: file.name, mime: file.type, tamanho_bytes: file.size,
})
// abrir
const { data } = await supabase.storage.from('documentos').createSignedUrl(doc.storage_path, 300)
window.open(data!.signedUrl)
// excluir: remover o objeto E a linha
await supabase.storage.from('documentos').remove([doc.storage_path])
await supabase.from('ac_documentos').delete().eq('id', doc.id)
```

---

## 025 — Metadados estruturados (saem de `notes`)

| Tabela | Coluna nova | Tipo | Equivalente atual em `notes` |
|---|---|---|---|
| `ac_gatilhos_salario` | `emprestimo_rateio` | `jsonb \| null` | `'__EMPRESTIMO__' + JSON(LoanShareMeta)` (`src/lib/loanSalary.ts`) |
| `ac_clausulas_fin` | `renegociacao` | `jsonb \| null` | `'__ACORDO__' + JSON(AcordoMeta)` (`src/lib/renegotiation.ts`) |
| `ac_clausulas_fin`, `ac_parcelas_fin`, `ac_passivos_clube`, `ac_passivos_agente` | `renegociado_acordo_id` | `uuid \| null` (FK → `ac_clausulas_fin.id`, set null) | `'… Renegociado no acordo <id> em <data>'` |
| idem | `rj_data` | `date \| null` | `'[RJ:YYYY-MM-DD]'` (`src/lib/judicialRecovery.ts`) |
| idem | `recuperacao_judicial` | `boolean` (not null, default `false`) | presença de `[RJ:…]` |

Formato dos JSON (sem o prefixo):

```ts
// emprestimo_rateio
{ __emprestimo: 1, loanContractId: string, workContractId: string, club: string,
  clubSalaryPct: number, clubImagePct: number, startDate: string, endDate: string | null,
  role: 'RATEIO' | 'RETORNO', fullSalary: number, fullImage: number }
// renegociacao
{ __acordo: 1, createdAt, originalTotal, newTotal, discount, currency, creditor, debtor,
  startDate, installmentsCount, periodicityMonths, sources: AcordoSource[], userNote }
```

**Sincronização automática** (trigger): quando `notes` muda e o marcador
extraído muda, a coluna é atualizada (ou zerada se o marcador sumiu), **exceto**
se o mesmo UPDATE também enviar a coluna (a coluna vence). No INSERT, coluna
nula + marcador presente → coluna preenchida. `rj_data` e `recuperacao_judicial`
se mantêm coerentes: mudar `rj_data` ajusta o flag; mudar só o flag para `true`
preenche `rj_data = hoje` (se vazio); `false` zera `rj_data`.
`renegociado_acordo_id` só é preenchido se o acordo existir.

Consequência: o app atual já mantém as colunas corretas sem mudança. Recomendação:

1. **Ler** das colunas (fallback para o parser de `notes` enquanto houver legado).
2. **Gravar** as duas coisas (dual-write) por enquanto; futuramente só a coluna.

```ts
await supabase.from('ac_parcelas_fin').update({ rj_data: '2026-09-22', notes: addRJTag(notes, '2026-09-22') }).eq('id', id)
const { data } = await supabase.from('ac_parcelas_fin').select('*').eq('recuperacao_judicial', true)
```

Houve backfill a partir de `notes` (nada em `notes` foi alterado).

---

## 026 — Movimentações de atletas

### Tabela `ac_movimentacoes` (leitura: perfis ativos; escrita: via RPC)

| Coluna | Tipo |
|---|---|
| `id` | `uuid` |
| `atleta_id` | `uuid` |
| `tipo` | `'VENDA' \| 'COMPRA' \| 'EMPRESTIMO_SAIDA' \| 'EMPRESTIMO_ENTRADA' \| 'RETORNO_EMPRESTIMO' \| 'RESCISAO'` |
| `data_movimentacao` | `date` |
| `clube_contraparte_id` | `uuid \| null` (→ `ac_entidades`) |
| `clube_contraparte_nome` | `text \| null` (preenchido com o nome da entidade se omitido) |
| `valor` | `numeric \| null` |
| `moeda` | `text` (default `'EUR'`) |
| `percentual_direitos` | `numeric \| null` (0–100, pontos percentuais) |
| `data_retorno_prevista` | `date \| null` |
| `opcao_compra_valor` | `numeric \| null` |
| `contrato_id` | `uuid \| null` (contrato SAIDA/EMPRESTIMO criado pelo app) |
| `observacoes` | `text \| null` |
| `efeitos` | `jsonb` (ver abaixo) |
| `desfeita_em` | `timestamptz \| null` |
| `desfeita_por` | `uuid \| null` |
| `created_by`, `created_at`, `updated_at` | |

### `registrar_movimentacao(p jsonb) → uuid`

Papéis: `master`, `juridico`, `futebol`. **Atômica** (tudo ou nada). Retorna o `id`
da movimentação.

Entrada `p`:

```ts
interface RegistrarMovimentacaoInput {
  atleta_id: string                 // obrigatório
  tipo: 'VENDA' | 'COMPRA' | 'EMPRESTIMO_SAIDA' | 'EMPRESTIMO_ENTRADA'
      | 'RETORNO_EMPRESTIMO' | 'RESCISAO'   // obrigatório
  data_movimentacao: string         // 'YYYY-MM-DD', obrigatório
  clube_contraparte_id?: string | null
  clube_contraparte_nome?: string | null
  valor?: number | null
  moeda?: string                    // default 'EUR'
  percentual_direitos?: number | null   // pontos % (ex.: 60 = 60%)
  data_retorno_prevista?: string | null
  opcao_compra_valor?: number | null
  contrato_id?: string | null
  observacoes?: string | null
  cancelar_salario?: boolean        // só vale para EMPRESTIMO_SAIDA
}
```

Efeitos aplicados:

| tipo | `ac_atletas.status` | vínculo de trabalho\* | salário/imagem futuros\*\* | titularidade BFR |
|---|---|---|---|---|
| `VENDA` | `VENDIDO` | `ENCERRADO`, `data_fim = data` | cancelados | − `percentual_direitos` (mín. 0), se informado e houver linha BFR |
| `RESCISAO` | `LIBERADO` (o app mostra `DESLIGADO`) | `RESCINDIDO`, `data_fim = data` | cancelados | — |
| `EMPRESTIMO_SAIDA` | `EMPRESTADO` | mantém `ATIVO` | cancelados só se `cancelar_salario = true` | — |
| `EMPRESTIMO_ENTRADA` | `ATIVO` | — | — | — |
| `RETORNO_EMPRESTIMO` | `ATIVO` | — | — | — |
| `COMPRA` | `ATIVO` | — | — | + `percentual_direitos` (máx. 100); cria a linha BFR se não existir |

\* Vínculo de trabalho = `ac_contratos` com `status='ATIVO'` e `subtipo_legado IN ('ENTRADA','EMPRESTIMO_ENTRADA')`
(ou sem `subtipo_legado` e `tipo='TRABALHO'`). `data_fim` nunca fica antes de `data_inicio`.
\*\* Parcelas `PENDENTE`/`EM_ATRASO` com `due_date > data_movimentacao` de cláusulas
`SALARIO_CETD` e `DIREITO_IMAGEM` → `CANCELADA`; e `ac_direitos_imagem` `PENDENTE`/`EM_ATRASO`
com `month > 'YYYY-MM'` da data → `CANCELADA`.

A RPC **não cria contratos/cláusulas** (o app continua criando o contrato de
SAIDA/EMPRESTIMO e passa o `contrato_id`).

`efeitos` (gravado na linha):

```ts
interface EfeitosMovimentacao {
  status_anterior: string               // enum ac_atleta_status
  status_novo: string
  contratos_encerrados: { id: string; status_anterior: string; data_fim_anterior: string | null }[]
  parcelas_canceladas: string[]         // ids de ac_parcelas_fin
  direitos_imagem_cancelados: string[]  // ids de ac_direitos_imagem
  titularidade: { id: string; percentual_anterior: number | null; percentual_novo: number; inserida: boolean } | null
}
```

```ts
const { data: movId, error } = await supabase.rpc('registrar_movimentacao', {
  p: { atleta_id, tipo: 'VENDA', data_movimentacao: '2026-09-22',
       clube_contraparte_id: clubId, valor: 5_000_000, moeda: 'EUR', percentual_direitos: 60,
       contrato_id: saidaContract.id },
})
```

### `desfazer_movimentacao(p_id uuid) → jsonb`

Papel: `master`. Só a movimentação **mais recente não desfeita** do atleta
(senão `22023`). Restaura status do atleta, status/`data_fim` dos contratos,
parcelas e imagem que **ainda** estejam `CANCELADA` (parcelas voltam a
`PENDENTE`, ou `EM_ATRASO` se já vencidas) e a titularidade (apaga a linha se
foi criada). Marca `desfeita_em`/`desfeita_por`.

Retorno: `{ id: string, parcelas_restauradas: number, direitos_imagem_restaurados: number }`.

```ts
await supabase.rpc('desfazer_movimentacao', { p_id: movId })
```

---

## 027 — Alertas

### Colunas novas em `ac_alertas`

| Coluna | Tipo | Descrição |
|---|---|---|
| `contrato_id` | `uuid \| null` | alerta de contrato |
| `gatilho_id` | `uuid \| null` | alerta de gatilho |
| `chave` | `text \| null` (única) | `'<REGRA>:<id>'` — só alertas automáticos |
| `setores` | `text[] \| null` | papéis destinatários |
| `data_referencia` | `date \| null` | vencimento / fim do contrato |
| `automatico` | `boolean` | `true` = gerado por `gerar_alertas()` |
| `resolvido_em` | `timestamptz \| null` | condição deixou de valer (também seta `is_read = true`) |
| `notificado_em` | `timestamptz \| null` | e-mail enviado |
| `updated_at` | `timestamptz` | |

Tipos de alerta gerados (`alert_type`) — **amplie o tipo `AlertType` do front**:

| `chave` | `alert_type` | `severity` | `setores` | Condição |
|---|---|---|---|---|
| `PARCELA_VENCIDA:<parcela>` | `EM_ATRASO` | `RED` | `{tesouraria}` | parcela vencida |
| `PARCELA_D7:<parcela>` | `VENCIMENTO_PROXIMO` | `YELLOW` | `{tesouraria}` | vence em 0–7 dias |
| `PARCELA_D30:<parcela>` | `VENCIMENTO_PROXIMO` | `GREEN` | `{tesouraria}` | vence em 8–30 dias |
| `CONTRATO_D30:<contrato>` | `CONTRATO_EXPIRANDO` | `RED` | `{juridico}` | termina em 0–30 dias |
| `CONTRATO_D90:<contrato>` | `CONTRATO_EXPIRANDO` | `YELLOW` | `{juridico}` | 31–90 dias |
| `CONTRATO_D180:<contrato>` | `CONTRATO_EXPIRANDO` | `GREEN` | `{juridico}` | 91–180 dias |
| `GATILHO_PROXIMO:<gatilho>` | `GATILHO_PROXIMO` | `YELLOW` | `{juridico,futebol}` | progresso ≥ 80% |
| `GATILHO_ATINGIDO:<gatilho>` | `ATINGIMENTO_PENDENTE` | `RED` | `{juridico,futebol}` | progresso ≥ 100% e gatilho `PENDENTE` |

```ts
export type AlertType =
  | 'VENCIMENTO_PROXIMO' | 'EM_ATRASO' | 'SELL_ON_PENDENTE_REVISAO' | 'ATINGIMENTO_PENDENTE'
  | 'CONTRATO_EXPIRANDO' | 'GATILHO_PROXIMO'
```

As parcelas consideram `payment_status IN ('PENDENTE','EM_ATRASO')` e cláusula
com `achievement_status <> 'NAO_ATINGIDA'`. Contratos: `status='ATIVO'`,
`subtipo_legado IN ('ENTRADA','EMPRESTIMO_ENTRADA','EMPRESTIMO_SAIDA')` (ou
`tipo IN ('TRABALHO','EMPRESTIMO')` sem subtipo).

Leitura recomendada (esconder os resolvidos):

```ts
const { data } = await supabase.from('ac_alertas').select('*')
  .is('resolvido_em', null).order('severity').order('created_at', { ascending: false })
```

### `gerar_alertas() → integer`

Qualquer perfil ativo (ou cron/service role). Idempotente. Passos: marca
`EM_ATRASO` as parcelas `PENDENTE` vencidas; insere os alertas que faltam;
reabre os resolvidos que voltaram a valer; resolve os automáticos que não
valem mais (inclusive troca de estágio D30 → D7 → VENCIDA). Retorna o número de
alertas inseridos/reabertos. Alertas manuais (`automatico=false`) não são tocados.

Agendado diariamente às 09:00 UTC via `pg_cron` quando a extensão existe
(job `gerar-alertas-diario`). Sem `pg_cron`: chame pela Edge Function
`notificar-alertas` (`GERAR_ANTES=true`) ou manualmente.

```ts
const { data: novos } = await supabase.rpc('gerar_alertas')
```

### `marcar_alerta_lido(p_id uuid, p_lido boolean default true) → void`

Qualquer perfil ativo. **Use esta RPC** em vez de `update ac_alertas` (o UPDATE
direto só funciona para `master`/`juridico`; para os outros papéis afeta 0 linhas).

```ts
await supabase.rpc('marcar_alerta_lido', { p_id: alert.id })
await supabase.rpc('marcar_alerta_lido', { p_id: alert.id, p_lido: false }) // marcar como não lido
```

### Edge Function `notificar-alertas`

`supabase/functions/notificar-alertas/index.ts` — envia e-mails por setor
(destinatários = `profiles` ativos com `role` = setor) via Resend e marca
`notificado_em`. Deploy/agendamento documentados no cabeçalho do arquivo.

---

## 028 — Desempenho e PTAX

### Tabela `ac_desempenho_atleta` (escrita: `master`, `futebol`)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` | |
| `atleta_id` | `uuid` | obrigatório |
| `temporada` | `text` | obrigatório, ex.: `'2026'` |
| `competicao` | `text` | default `''` = **total da temporada** |
| `jogos`, `gols`, `assistencias`, `minutos` | `int` | default 0, ≥ 0 |
| `fonte` | `text \| null` | ex.: `'MANUAL'` |
| `atualizado_em`, `updated_at` | `timestamptz` | automáticos |
| `created_by`, `updated_by` | `uuid` | automáticos |

Chave única: `(atleta_id, temporada, competicao)`.

```ts
await supabase.from('ac_desempenho_atleta').upsert(
  { atleta_id, temporada: '2026', competicao: 'Brasileirão', jogos: 20, gols: 6, assistencias: 3, minutos: 1650, fonte: 'MANUAL' },
  { onConflict: 'atleta_id,temporada,competicao' },
)
```

### Colunas novas em `ac_gatilhos_salario`

(`metric` e `threshold` já existiam e continuam sendo a métrica e o limite.)

| Coluna | Tipo | Descrição |
|---|---|---|
| `valor_atual` | `numeric \| null` | valor apurado manualmente; se preenchido, **sobrepõe** o desempenho |
| `temporada_referencia` | `text \| null` | `null` = soma de todas as temporadas |
| `competicao_referencia` | `text \| null` | `null` = total da temporada |

### `atualizar_valor_gatilho(p_id uuid, p_valor numeric) → void`

Papéis: `master`, `juridico`, `futebol` (futebol não tem escrita direta em
`ac_gatilhos_salario`). Passe `p_valor: null` para voltar a usar o desempenho.

```ts
await supabase.rpc('atualizar_valor_gatilho', { p_id: trigger.id, p_valor: 7 })
```

### View `vw_ac_gatilhos_progresso` (leitura: perfis ativos)

| Coluna | Tipo |
|---|---|
| `gatilho_id`, `atleta_id`, `contrato_id` | `uuid` |
| `description`, `metric`, `status`, `currency` | `text` |
| `threshold`, `new_salary`, `new_image_value` | `numeric` |
| `temporada_referencia`, `competicao_referencia` | `text \| null` |
| `valor_desempenho` | `numeric \| null` — agregado de `ac_desempenho_atleta` |
| `valor_atual` | `numeric \| null` — manual |
| `valor_apurado` | `numeric \| null` = `coalesce(valor_atual, valor_desempenho)` |
| `fonte_valor` | `'MANUAL' \| 'DESEMPENHO' \| null` |
| `progresso` | `numeric \| null` — fração (0.9 = 90%); `null` sem threshold |
| `atingido` | `boolean` |

Agregação: por temporada, a linha `competicao = ''` (se existir) é o total; senão
soma as competições. Com `competicao_referencia`, soma só aquela competição.
Métricas `TITULO`/`OUTRO` dependem de `valor_atual`.

```ts
const { data } = await supabase.from('vw_ac_gatilhos_progresso').select('*').eq('atleta_id', athleteId)
```

### PTAX — tabela `ac_taxas_cambio` (reaproveitada do 012)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` | |
| `moeda_codigo` | `text` | `'EUR' \| 'USD' \| 'GBP'` (FK para `ac_moedas`; outras moedas precisam ser cadastradas lá) |
| `data` | `date` | data da cotação |
| `ptax_compra` | `numeric \| null` | agora opcional |
| `ptax_venda` | `numeric` | obrigatório — é a usada nas conversões |
| `fonte` | `text` | default `'PTAX-BCB'` |

Chave única `(moeda_codigo, data)`. Insert/update: qualquer perfil ativo (cache
do front); delete: `master`.

```ts
await supabase.from('ac_taxas_cambio').upsert(
  { moeda_codigo: 'EUR', data: '2026-09-21', ptax_compra: 6.19, ptax_venda: 6.2031, fonte: 'PTAX-BCB' },
  { onConflict: 'moeda_codigo,data' },
)
```

### `ptax_em(p_moeda text, p_data date) → numeric | null`

`ptax_venda` mais recente com `data <= p_data`. `BRL` → `1`. `null` se não houver cotação.

```ts
const { data: taxa } = await supabase.rpc('ptax_em', { p_moeda: 'EUR', p_data: '2026-09-22' })
```

---

## 029 — Fechamento de amortização por competência

### Tabela `ac_amortizacao_fechamentos` (escrita: `master`, `controladoria`)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` | |
| `competencia` | `date` | normalizada para o 1º dia do mês |
| `atleta_id` | `uuid` | |
| `valor_intangivel_brl` | `numeric` | custo capitalizado total |
| `amortizacao_mes_brl` | `numeric` | |
| `amortizacao_acumulada_brl` | `numeric` | |
| `saldo_liquido_brl` | `numeric` | |
| `ptax_aquisicao` | `numeric` | |
| `detalhes` | `jsonb` | livre (memória de cálculo) |
| `fechado_por` | `uuid` | automático (atualizado em cada re-fechamento) |
| `fechado_em` | `timestamptz` | automático |

Chave única `(competencia, atleta_id)`.

```ts
await supabase.from('ac_amortizacao_fechamentos').upsert(
  rows.map(r => ({ competencia: '2026-09-01', atleta_id: r.athleteId, valor_intangivel_brl: r.cost,
                   amortizacao_mes_brl: r.month, amortizacao_acumulada_brl: r.acc,
                   saldo_liquido_brl: r.net, ptax_aquisicao: r.ptax, detalhes: r.memo })),
  { onConflict: 'competencia,atleta_id' },
)
```

---

## Checklist para o front-end

1. Ampliar `UserRole` e a UI de gestão de usuários com os 8 papéis.
2. Guardas de edição por papel seguindo a matriz da seção 020.
3. Trocar `markInstallmentPaid`/`registerInstallmentPayment`/`revertInstallment`
   pelas RPCs `baixar_parcela`/`estornar_baixa` (o UPDATE direto continua funcionando
   para master/juridico/tesouraria, mas não grava `pago_por`/`valor_pago_moeda`).
4. Trocar `markAlertRead` por `rpc('marcar_alerta_lido')` e filtrar `resolvido_em is null`.
5. Ampliar `AlertType` com `CONTRATO_EXPIRANDO` e `GATILHO_PROXIMO`.
6. Dual-write dos metadados de `notes` (seção 025) e leitura pelas colunas.
7. Tela de movimentação chamando `registrar_movimentacao` (e `desfazer_movimentacao` para master).
8. Upload de documentos (seção 024), histórico (`vw_ac_auditoria_resumo`),
   workflow de aprovação (seção 022), desempenho/gatilhos (028), fechamento de amortização (029).
