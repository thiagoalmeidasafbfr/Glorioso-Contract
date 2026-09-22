// src/components/athletes/MovimentacoesPanel.tsx
// Lista das movimentações do atleta (ac_movimentacoes) no topo do "Histórico de
// Transferências", com o resumo dos efeitos e "Desfazer" (somente master e
// somente a mais recente não desfeita — mesma regra da RPC desfazer_movimentacao).

import { useCallback, useEffect, useState } from 'react'
import { useConfirm } from '../confirm-context'
import { useToast } from '../toast-context'
import {
  fetchMovimentacoes, desfazerMovimentacao, latestUndoableId, MOVIMENTACAO_LABELS,
  type Movimentacao, type EfeitosMovimentacao,
} from '../../lib/movimentacao'
import { fmtDate, fmtCurrencyShort } from '../../lib/format'
import { useHasRole, ROLES } from '../../lib/roleGate'

const font = "var(--font-body)"
const mono = "var(--font-label)"

export default function MovimentacoesPanel({ athleteId, refreshKey, onChanged }: {
  athleteId: string; refreshKey: number; onChanged: () => void
}) {
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const canUndo = useHasRole(ROLES.desfazerMovimentacao)
  const confirm = useConfirm()
  const toast = useToast()

  const load = useCallback(async () => {
    try { setMovs(await fetchMovimentacoes(athleteId)); setErr(null) }
    catch (e) { setErr((e as Error).message) }
  }, [athleteId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao montar / após mudanças
  useEffect(() => { void load() }, [load, refreshKey])

  async function undo(m: Movimentacao) {
    if (!await confirm({ title: `Desfazer a movimentação "${MOVIMENTACAO_LABELS[m.tipo]}" de ${fmtDate(m.data_movimentacao)}?`, message: 'O status do atleta, os vínculos, as parcelas canceladas e a titularidade voltam ao estado anterior.', confirmLabel: 'Desfazer', danger: true })) return
    setBusy(m.id)
    try {
      const r = await desfazerMovimentacao(m.id)
      await load()
      onChanged()
      toast.success('Movimentação desfeita.', { detail: `Parcelas restauradas: ${r.parcelas_restauradas}; direitos de imagem restaurados: ${r.direitos_imagem_restaurados}.` })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  if (movs.length === 0 && !err) return null
  const undoId = latestUndoableId(movs)
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: mono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'top' }

  return (
    <div className="card" style={{ overflow: 'hidden' }} data-testid="movimentacoes-panel">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider-soft)', fontSize: 11, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        Movimentações registradas
      </div>
      {err && <div role="alert" style={{ padding: '8px 18px', color: 'var(--neg)', fontSize: 12, fontFamily: font }}>{err}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Data</th><th style={th}>Tipo</th><th style={th}>Contraparte</th>
            <th style={{ ...th, textAlign: 'right' }}>Valor</th><th style={th}>Efeitos</th><th style={th}>Situação</th><th style={th} />
          </tr></thead>
          <tbody>
            {movs.map(m => {
              const e = m.efeitos as Partial<EfeitosMovimentacao>
              const undone = !!m.desfeita_em
              return (
                <tr key={m.id} style={{ opacity: undone ? 0.55 : 1 }}>
                  <td style={{ ...td, fontFamily: mono, whiteSpace: 'nowrap' }}>{fmtDate(m.data_movimentacao)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{MOVIMENTACAO_LABELS[m.tipo] ?? m.tipo}</td>
                  <td style={td}>{m.clube_contraparte_nome || '—'}{m.data_retorno_prevista ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>retorno prev. {fmtDate(m.data_retorno_prevista)}</div> : null}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: mono }}>
                    {m.valor != null ? fmtCurrencyShort(m.valor, m.moeda) : '—'}
                    {m.percentual_direitos != null && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.percentual_direitos}% dos direitos</div>}
                  </td>
                  <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)' }}>
                    {e.status_anterior && e.status_novo ? `${e.status_anterior} → ${e.status_novo}` : '—'}
                    {(e.contratos_encerrados?.length ?? 0) > 0 && <div>{e.contratos_encerrados!.length} vínculo(s) encerrado(s)</div>}
                    {(e.parcelas_canceladas?.length ?? 0) > 0 && <div>{e.parcelas_canceladas!.length} parcela(s) cancelada(s)</div>}
                    {(e.direitos_imagem_cancelados?.length ?? 0) > 0 && <div>{e.direitos_imagem_cancelados!.length} imagem(ns) cancelada(s)</div>}
                    {e.titularidade && <div>BFR {e.titularidade.percentual_anterior ?? 0}% → {e.titularidade.percentual_novo}%</div>}
                  </td>
                  <td style={{ ...td, fontSize: 11 }}>{undone ? `Desfeita em ${fmtDate(m.desfeita_em!.slice(0, 10))}` : 'Vigente'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {canUndo && m.id === undoId && (
                      <button className="btn btn-outline" style={{ padding: '4px 10px' }} disabled={busy === m.id} onClick={() => void undo(m)}>
                        {busy === m.id ? 'Desfazendo…' : 'Desfazer'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
