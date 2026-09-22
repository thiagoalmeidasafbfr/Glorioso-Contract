// src/lib/exportContabil.ts
// Exportação de LANÇAMENTOS CONTÁBEIS (Fase 5.4) a partir das cláusulas e
// parcelas cadastradas. LAYOUT GENÉRICO — ajustar ao plano de contas / ERP do
// clube antes de importar (não há conta contábil nem centro de custo aqui).
//
// Uma linha por PARCELA; cláusulas sem parcelas geram uma linha única (com a
// data de vencimento da cláusula). Cláusulas de valor apenas percentual (sem
// valor monetário) ficam de fora — não há o que lançar até a apuração.
//
// Valor em BRL (coluna "Valor BRL"), em ordem de preferência:
//   1. valor efetivamente pago em BRL (amount_paid_brl) — parcela/cláusula PAGA;
//   2. valor × taxa registrada no pagamento (exchange_rate);
//   3. valor × PTAX fixada no contrato (fixed_exchange_rate);
//   4. valor × câmbio de referência APROXIMADO (src/lib/fx.ts) — marcado como tal.
//
// Rubrica sugerida por tipo de cláusula (CPC 04/IAS 38 — direitos federativos):
//   • CAPITALIZAR  — custo de AQUISIÇÃO do atleta, compõe o intangível (mesmo
//     critério de PageAmortizacao): TRANSFER_FEE_FIXO/VARIAVEL, INTERMEDIACAO e
//     LUVAS quando o Botafogo paga; SOLIDARIEDADE_FIFA paga na aquisição.
//   • DESPESA      — custo do período / da venda: SALARIO_CETD, DIREITO_IMAGEM,
//     BONUS_PERFORMANCE_ATLETA, EMPRESTIMO_TAXA a pagar, SELL_ON_FEE (a pagar
//     ao antigo clube na revenda), INTERMEDIACAO_VENDA_FUTURA, CLAUSULA_RESCISORIA
//     e PERCENTUAL_VENDA_ATLETA quando o Botafogo paga.
//   • RECEITA      — qualquer tipo em que o Botafogo é o CREDOR (venda de
//     direitos, sell-on a receber, taxa de empréstimo recebida, multa recebida).
//   • BAIXA_PASSIVO — ACORDO_RENEGOCIACAO: liquida obrigações já reconhecidas
//     (não é custo novo; a contrapartida é a conta do passivo renegociado).
// A decisão final é da Controladoria — a coluna é apenas uma sugestão.

import {
  fetchAthletes, fetchAllClauses, fetchAllInstallments,
} from './athleteQueries'
import { isBFRParty } from './direction'
import { approxRateBRL } from './fx'
import { exportWorkbook, type ColDef } from './xlsx-utils'
import { CLAUSE_TYPE_LABELS } from '../types/athlete-system'
import type { Clause, ClauseType } from '../types/athlete-system'

export type Rubrica = 'CAPITALIZAR' | 'DESPESA' | 'RECEITA' | 'BAIXA_PASSIVO'

const CAPITALIZAVEIS = new Set<ClauseType>(['TRANSFER_FEE_FIXO', 'TRANSFER_FEE_VARIAVEL', 'INTERMEDIACAO', 'LUVAS', 'SOLIDARIEDADE_FIFA'])

export function rubricaSugerida(type: ClauseType, direcao: 'A_PAGAR' | 'A_RECEBER'): Rubrica {
  if (type === 'ACORDO_RENEGOCIACAO') return 'BAIXA_PASSIVO'
  if (direcao === 'A_RECEBER') return 'RECEITA'
  return CAPITALIZAVEIS.has(type) ? 'CAPITALIZAR' : 'DESPESA'
}

export interface Lancamento {
  data: string
  data_pagamento: string
  atleta: string
  atleta_id: string
  contraparte: string
  natureza: string
  tipo_clausula: ClauseType
  descricao: string
  parcela: string
  direcao: 'A_PAGAR' | 'A_RECEBER'
  moeda: string
  valor: number
  valor_brl: number
  taxa_brl: number
  base_taxa: 'BRL' | 'PAGO' | 'TAXA_PAGAMENTO' | 'PTAX_FIXADA' | 'APROXIMADA'
  status: string
  rubrica: Rubrica
  clausula_id: string
  parcela_id: string
}

function brlOf(value: number, currency: string, paidBRL: number | null | undefined, paidRate: number | null | undefined, fixed: number | null | undefined, paid: boolean) {
  if (currency === 'BRL') return { brl: paid && paidBRL ? paidBRL : value, rate: 1, base: 'BRL' as const }
  if (paid && paidBRL != null && paidBRL > 0) return { brl: paidBRL, rate: value ? paidBRL / value : 0, base: 'PAGO' as const }
  if (paid && paidRate) return { brl: value * paidRate, rate: paidRate, base: 'TAXA_PAGAMENTO' as const }
  if (fixed) return { brl: value * fixed, rate: fixed, base: 'PTAX_FIXADA' as const }
  const r = approxRateBRL(currency)
  return { brl: value * r, rate: r, base: 'APROXIMADA' as const }
}

export async function buildLancamentos(): Promise<Lancamento[]> {
  const [athletes, clauses, installments] = await Promise.all([fetchAthletes(), fetchAllClauses(), fetchAllInstallments()])
  const nameOf = new Map(athletes.map(a => [a.id, a.full_name]))
  const clauseById = new Map(clauses.map(c => [c.id, c]))
  const withInst = new Set(installments.map(i => i.clause_id))
  const out: Lancamento[] = []
  const base = (c: Clause) => {
    const direcao: 'A_PAGAR' | 'A_RECEBER' = isBFRParty(c.debtor_party) ? 'A_PAGAR' : 'A_RECEBER'
    return {
      atleta: nameOf.get(c.athlete_id) ?? '', atleta_id: c.athlete_id,
      contraparte: direcao === 'A_PAGAR' ? c.creditor_party : c.debtor_party,
      natureza: CLAUSE_TYPE_LABELS[c.clause_type] ?? c.clause_type, tipo_clausula: c.clause_type,
      descricao: c.description, direcao, rubrica: rubricaSugerida(c.clause_type, direcao), clausula_id: c.id,
    }
  }
  for (const i of installments) {
    const c = clauseById.get(i.clause_id); if (!c) continue
    const paid = i.payment_status === 'PAGA'
    const b = brlOf(i.original_value, i.currency, i.amount_paid_brl, i.exchange_rate, i.fixed_exchange_rate ?? c.fixed_exchange_rate, paid)
    out.push({
      ...base(c), data: i.due_date, data_pagamento: i.payment_date ?? '',
      parcela: `${i.installment_number}/${c.installments_total || '?'}`,
      moeda: i.currency, valor: i.original_value, valor_brl: round2(b.brl), taxa_brl: round6(b.rate), base_taxa: b.base,
      status: i.payment_status, parcela_id: i.id,
    })
  }
  for (const c of clauses) {
    if (withInst.has(c.id) || !c.original_value) continue
    const paid = c.payment_status === 'PAGA'
    const b = brlOf(c.original_value, c.currency, c.amount_paid_brl, c.exchange_rate, c.fixed_exchange_rate, paid)
    out.push({
      ...base(c), data: c.due_date ?? '', data_pagamento: c.payment_date ?? '', parcela: 'única',
      moeda: c.currency, valor: c.original_value, valor_brl: round2(b.brl), taxa_brl: round6(b.rate), base_taxa: b.base,
      status: c.payment_status, parcela_id: '',
    })
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.atleta.localeCompare(b.atleta))
}

export const COLS_LANCAMENTOS: ColDef[] = [
  { key: 'data', header: 'Data (vencimento)' },
  { key: 'data_pagamento', header: 'Data pagamento' },
  { key: 'atleta', header: 'Atleta' },
  { key: 'contraparte', header: 'Contraparte' },
  { key: 'natureza', header: 'Natureza' },
  { key: 'tipo_clausula', header: 'Tipo (código)' },
  { key: 'descricao', header: 'Descrição' },
  { key: 'parcela', header: 'Parcela' },
  { key: 'direcao', header: 'Direção' },
  { key: 'moeda', header: 'Moeda' },
  { key: 'valor', header: 'Valor (moeda)' },
  { key: 'taxa_brl', header: 'Taxa BRL' },
  { key: 'base_taxa', header: 'Base da taxa' },
  { key: 'valor_brl', header: 'Valor BRL' },
  { key: 'status', header: 'Status' },
  { key: 'rubrica', header: 'Rubrica sugerida' },
  { key: 'atleta_id', header: 'Atleta ID' },
  { key: 'clausula_id', header: 'Cláusula ID' },
  { key: 'parcela_id', header: 'Parcela ID' },
]

const LEIA_ME = [
  'LAYOUT GENÉRICO — ajustar ao plano de contas / ERP do clube antes de importar.',
  'Uma linha por parcela; cláusulas sem parcelas geram linha única. Cláusulas só com % (sem valor) ficam de fora.',
  'Valor BRL: pago em BRL > taxa do pagamento > PTAX fixada no contrato > câmbio APROXIMADO (coluna "Base da taxa").',
  'Rubrica sugerida: CAPITALIZAR = custo de aquisição (transfer fee, intermediação, luvas, solidariedade pagos pelo Botafogo);',
  'DESPESA = salário, imagem, bônus, taxa de empréstimo, sell-on/intermediação de venda futura, multas pagas;',
  'RECEITA = Botafogo credor; BAIXA_PASSIVO = acordo de renegociação (liquida passivo já reconhecido).',
  'A classificação final é da Controladoria.',
]

export async function exportLancamentosXLSX(): Promise<number> {
  const rows = await buildLancamentos()
  exportWorkbook([
    { name: 'Lancamentos', cols: COLS_LANCAMENTOS, rows: rows as unknown as Record<string, unknown>[] },
    { name: 'Leia-me', cols: [{ key: 't', header: 'Observações' }], rows: LEIA_ME.map(t => ({ t })) },
  ], `lancamentos-contabeis-${new Date().toISOString().slice(0, 10)}.xlsx`)
  return rows.length
}

export async function exportLancamentosCSV(): Promise<number> {
  const rows = await buildLancamentos()
  const esc = (v: unknown) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '')
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [COLS_LANCAMENTOS.map(c => esc(c.header)).join(';'),
    ...rows.map(r => COLS_LANCAMENTOS.map(c => esc((r as unknown as Record<string, unknown>)[c.key])).join(';'))]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `lancamentos-contabeis-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return rows.length
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round6(n: number): number { return Math.round(n * 1e6) / 1e6 }
