// src/components/PagamentoInfo.tsx
// Linha "pago por / em" de uma parcela baixada (colunas da migration 023:
// pago_por, pago_em, valor_pago_moeda, ptax_utilizada). Some quando não há dado.

import { useEffect, useState } from 'react'
import type { ClauseInstallment } from '../types/athlete-system'
import { fetchProfileNames } from '../lib/governanca'
import { useAuth } from '../context/AuthContext'
import { fmtCurrencyShort, fmtDate } from '../lib/format'

let namesPromise: Promise<Map<string, string>> | null = null
function profileNames() {
  if (!namesPromise) namesPromise = fetchProfileNames().catch(() => new Map())
  return namesPromise
}

export default function PagamentoInfo({ inst }: { inst: ClauseInstallment }) {
  const { profile } = useAuth()
  const [names, setNames] = useState<Map<string, string> | null>(null)
  useEffect(() => {
    if (!inst.pago_por) return
    let alive = true
    profileNames().then(m => { if (alive) setNames(m) })
    return () => { alive = false }
  }, [inst.pago_por])

  const who = inst.pago_por
    ? (inst.pago_por === profile?.id ? 'você' : names?.get(inst.pago_por) ?? `usuário ${inst.pago_por.slice(0, 8)}`)
    : null
  const parts: string[] = []
  if (inst.payment_date) parts.push(`Pago em ${fmtDate(inst.payment_date)}`)
  if (inst.valor_pago_moeda != null) parts.push(fmtCurrencyShort(inst.valor_pago_moeda, inst.currency))
  if (inst.ptax_utilizada != null && inst.currency !== 'BRL') parts.push(`PTAX ${inst.ptax_utilizada.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`)
  if (inst.amount_paid_brl != null && inst.currency !== 'BRL') parts.push(`= ${fmtCurrencyShort(inst.amount_paid_brl, 'BRL')}`)
  if (who) parts.push(`por ${who}`)
  if (inst.pago_em) parts.push(`registrado ${new Date(inst.pago_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`)
  if (parts.length === 0) return null
  return (
    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
      {parts.join(' · ')}
    </div>
  )
}
