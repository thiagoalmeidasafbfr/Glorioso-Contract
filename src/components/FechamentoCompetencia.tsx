// src/components/FechamentoCompetencia.tsx
// Painel "Fechar competência" da calculadora de amortização (Fase 5.6):
// escolhe o mês, grava em ac_amortizacao_fechamentos os valores calculados
// para TODOS os atletas com intangível na data de corte (último dia do mês) e
// lista os fechamentos anteriores (com exportação XLSX por competência).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchFechamentos, fecharCompetencia, fimDaCompetencia, normCompetencia, type FechamentoRow } from '../lib/amortizacaoFechamento'
import { useHasRole, ROLES } from '../lib/roleGate'
import { exportWorkbook } from '../lib/xlsx-utils'
import { fmtCurrencyShort } from '../lib/format'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'

export interface ClosingCalc {
  athleteId: string
  name: string
  cost: number
  month: number
  acc: number
  net: number
  ptax: number | null
  memo: Record<string, unknown>
}

function ym(d = new Date()): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const fmtComp = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`

export default function FechamentoCompetencia({ compute, names, disabled }: {
  compute: (asOf: Date) => ClosingCalc[]
  names: Map<string, string>
  disabled?: boolean
}) {
  const [comp, setComp] = useState(ym())
  const [list, setList] = useState<FechamentoRow[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const canClose = useHasRole(ROLES.fechamentoAmortizacao)

  const load = useCallback(async () => {
    try { setList(await fetchFechamentos()) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao montar
  useEffect(() => { void load() }, [load])

  const groups = useMemo(() => {
    const m = new Map<string, FechamentoRow[]>()
    for (const r of list) m.set(r.competencia, [...(m.get(r.competencia) ?? []), r])
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [list])

  async function close() {
    const c = normCompetencia(comp)
    const rows = compute(fimDaCompetencia(c)).filter(r => r.cost > 0)
    if (rows.length === 0) { setMsg({ ok: false, text: 'Nenhum atleta com intangível para fechar.' }); return }
    const already = groups.some(([k]) => k === c)
    const total = rows.reduce((s, r) => s + r.month, 0)
    if (!window.confirm(`${already ? 'Re-fechar' : 'Fechar'} a competência ${fmtComp(c)} com ${rows.length} atleta(s)? Amortização do mês: ${fmtCurrencyShort(total, 'BRL')}.${already ? ' Os valores gravados anteriormente serão substituídos.' : ''}`)) return
    setBusy(true); setMsg(null)
    try {
      const n = await fecharCompetencia(c, rows.map(r => ({
        atleta_id: r.athleteId, valor_intangivel_brl: round2(r.cost), amortizacao_mes_brl: round2(r.month),
        amortizacao_acumulada_brl: round2(r.acc), saldo_liquido_brl: round2(r.net),
        ptax_aquisicao: r.ptax, detalhes: { ...r.memo, atleta: r.name },
      })))
      setMsg({ ok: true, text: `Competência ${fmtComp(c)} fechada: ${n} atleta(s).` })
      await load(); setOpen(c)
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }

  function exportComp(c: string, rows: FechamentoRow[]) {
    exportWorkbook([{
      name: `Amortizacao ${c.slice(0, 7)}`,
      cols: [
        { key: 'competencia', header: 'Competência' }, { key: 'atleta_id', header: 'Atleta ID' }, { key: 'atleta', header: 'Atleta' },
        { key: 'valor_intangivel_brl', header: 'Intangível (BRL)' }, { key: 'amortizacao_mes_brl', header: 'Amortização do mês (BRL)' },
        { key: 'amortizacao_acumulada_brl', header: 'Amortização acumulada (BRL)' }, { key: 'saldo_liquido_brl', header: 'Saldo líquido (BRL)' },
        { key: 'ptax_aquisicao', header: 'PTAX aquisição' }, { key: 'fechado_em', header: 'Fechado em' },
      ],
      rows: rows.map(r => ({ ...r, atleta: names.get(r.atleta_id) ?? String(r.detalhes?.atleta ?? '') })) as unknown as Record<string, string | number>[],
    }], `amortizacao-${c.slice(0, 7)}.xlsx`)
  }

  const th: React.CSSProperties = { padding: '7px 10px', fontSize: 9, fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--divider-soft)', fontWeight: 600 }
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12, fontFamily: font, color: 'var(--ink-primary)', borderBottom: '1px solid var(--divider-soft)' }
  const num: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: mono }

  return (
    <div className="card" style={{ padding: '16px 18px', marginTop: 16 }} data-testid="fechamento-competencia">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-deep)' }}>Fechamento por competência</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font, marginTop: 2 }}>Grava os valores calculados (corte no último dia do mês) para todos os atletas com intangível.</div>
        </div>
        <div>
          <label htmlFor="fech-comp" style={{ fontSize: 9, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Competência</label>
          <input id="fech-comp" type="month" value={comp} onChange={e => setComp(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: mono, color: 'var(--ink-primary)' }} />
        </div>
        {canClose
          ? <button className="btn btn-primary" onClick={() => void close()} disabled={busy || disabled || !comp}>{busy ? 'Fechando…' : 'Fechar competência'}</button>
          : <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>Fechamento: master e controladoria.</span>}
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 10, fontSize: 12, fontFamily: font, color: msg.ok ? 'var(--pos)' : 'var(--neg)' }}>{msg.text}</div>}

      <div style={{ marginTop: 14 }}>
        {groups.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>Nenhuma competência fechada ainda.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Competência</th><th style={{ ...th, textAlign: 'right' }}>Atletas</th>
              <th style={{ ...th, textAlign: 'right' }}>Intangível</th><th style={{ ...th, textAlign: 'right' }}>Amortiz. do mês</th>
              <th style={{ ...th, textAlign: 'right' }}>Acumulada</th><th style={{ ...th, textAlign: 'right' }}>Saldo líquido</th>
              <th style={th}>Fechado em</th><th style={th} />
            </tr></thead>
            <tbody>
              {groups.map(([c, rows]) => {
                const sum = (k: keyof FechamentoRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
                const last = rows.map(r => r.fechado_em ?? '').sort().pop() ?? ''
                return [
                  <tr key={c}>
                    <td style={{ ...td, fontFamily: mono, fontWeight: 700 }}>{fmtComp(c)}</td>
                    <td style={num}>{rows.length}</td>
                    <td style={num}>{fmtCurrencyShort(sum('valor_intangivel_brl'), 'BRL')}</td>
                    <td style={num}>{fmtCurrencyShort(sum('amortizacao_mes_brl'), 'BRL')}</td>
                    <td style={num}>{fmtCurrencyShort(sum('amortizacao_acumulada_brl'), 'BRL')}</td>
                    <td style={num}>{fmtCurrencyShort(sum('saldo_liquido_brl'), 'BRL')}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{last ? new Date(last).toLocaleString('pt-BR') : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-outline" style={{ padding: '3px 9px' }} onClick={() => setOpen(open === c ? null : c)}>{open === c ? 'Ocultar' : 'Ver'}</button>{' '}
                      <button className="btn btn-outline" style={{ padding: '3px 9px' }} onClick={() => exportComp(c, rows)}>Exportar XLSX</button>
                    </td>
                  </tr>,
                  open === c && rows.map(r => (
                    <tr key={`${c}-${r.atleta_id}`} style={{ background: 'var(--bg-subtle)' }}>
                      <td style={{ ...td, paddingLeft: 24 }} colSpan={2}>{names.get(r.atleta_id) ?? String(r.detalhes?.atleta ?? r.atleta_id)}</td>
                      <td style={num}>{fmtCurrencyShort(r.valor_intangivel_brl, 'BRL')}</td>
                      <td style={num}>{fmtCurrencyShort(r.amortizacao_mes_brl, 'BRL')}</td>
                      <td style={num}>{fmtCurrencyShort(r.amortizacao_acumulada_brl, 'BRL')}</td>
                      <td style={num}>{fmtCurrencyShort(r.saldo_liquido_brl, 'BRL')}</td>
                      <td style={{ ...td, fontFamily: mono, fontSize: 11 }} colSpan={2}>PTAX aquisição: {r.ptax_aquisicao != null ? Number(r.ptax_aquisicao).toFixed(4) : '—'}</td>
                    </tr>
                  )),
                ]
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
