// src/components/athletes/GatilhosProgresso.tsx
// Progresso dos gatilhos salariais do atleta (vw_ac_gatilhos_progresso, seção
// 028): barra "x de y jogos — 90%", origem do valor (desempenho × manual) e,
// para quem pode (master/juridico/futebol), o ajuste manual do valor apurado.

import { useCallback, useEffect, useState } from 'react'
import { fetchGatilhosProgresso, atualizarValorGatilho, type GatilhoProgresso } from '../../lib/desempenho'
import { useHasRole, ROLES } from '../../lib/roleGate'
import { TRIGGER_METRIC_LABELS } from '../../types/athlete-system'

const font = "var(--font-body)"
const mono = "var(--font-label)"

export default function GatilhosProgresso({ athleteId, refreshKey }: { athleteId: string; refreshKey: number }) {
  const [rows, setRows] = useState<GatilhoProgresso[]>([])
  const [err, setErr] = useState<string | null>(null)
  const canSet = useHasRole(ROLES.gatilhoValor)

  const load = useCallback(async () => {
    try { setRows(await fetchGatilhosProgresso(athleteId)); setErr(null) } catch (e) { setErr((e as Error).message) }
  }, [athleteId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao montar / após mudanças
  useEffect(() => { void load() }, [load, refreshKey])

  async function setManual(g: GatilhoProgresso) {
    const raw = window.prompt(`Valor apurado manualmente para "${g.description}" (deixe vazio para voltar a usar o desempenho):`, g.valor_atual != null ? String(g.valor_atual) : '')
    if (raw === null) return
    const v = raw.trim() === '' ? null : Number(raw.replace(',', '.'))
    if (v != null && !Number.isFinite(v)) return
    try { await atualizarValorGatilho(g.gatilho_id, v); await load() } catch (e) { setErr((e as Error).message) }
  }

  if (rows.length === 0 && !err) return null
  return (
    <div className="card" style={{ padding: '18px 20px' }} data-testid="gatilhos-progresso">
      <div style={{ marginBottom: 10, fontSize: 10, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Progresso dos gatilhos (desempenho)</div>
      {err && <div role="alert" style={{ color: 'var(--neg)', fontSize: 12, fontFamily: font, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(g => {
          const pct = g.progresso != null ? Math.max(0, g.progresso) : null
          const unit = (TRIGGER_METRIC_LABELS[g.metric] ?? g.metric).toLowerCase()
          const color = pct == null ? 'var(--text-muted)' : pct >= 1 ? 'var(--pos)' : pct >= 0.8 ? 'var(--warn)' : 'var(--accent)'
          return (
            <div key={g.gatilho_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12, fontFamily: font, color: 'var(--ink-primary)' }}>
                <span style={{ fontWeight: 600 }}>{g.description}</span>
                <span style={{ fontFamily: mono, color }}>
                  {g.threshold == null ? 'sem meta numérica'
                    : g.valor_apurado == null ? `sem dados de ${unit} — meta ${g.threshold}`
                    : `${g.valor_apurado} de ${g.threshold} ${unit} — ${Math.round((pct ?? 0) * 100)}%`}
                  {g.fonte_valor === 'MANUAL' && ' (manual)'}
                  {g.atingido && g.status === 'PENDENTE' && ' · meta atingida — marque o gatilho'}
                </span>
              </div>
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct != null ? Math.round(Math.min(1, pct) * 100) : undefined}
                aria-label={`Progresso de ${g.description}`}
                style={{ height: 8, borderRadius: 4, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)', overflow: 'hidden', marginTop: 4 }}>
                <div style={{ width: `${Math.min(1, pct ?? 0) * 100}%`, height: '100%', background: color }} />
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-muted)', fontFamily: mono, marginTop: 3 }}>
                <span>{g.temporada_referencia ? `temporada ${g.temporada_referencia}` : 'todas as temporadas'}{g.competicao_referencia ? ` · ${g.competicao_referencia}` : ''}</span>
                {canSet && <button onClick={() => void setManual(g)} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontFamily: mono }}>ajustar valor manual</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
