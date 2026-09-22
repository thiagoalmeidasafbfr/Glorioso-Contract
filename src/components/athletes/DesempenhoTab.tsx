// src/components/athletes/DesempenhoTab.tsx
// Aba "Desempenho" da ficha do atleta: jogos/gols/assistências/minutos por
// temporada e competição (ac_desempenho_atleta) + formulário de lançamento
// (upsert pela chave atleta+temporada+competição). Escrita: master e futebol.

import { useCallback, useEffect, useState } from 'react'
import { fetchDesempenho, upsertDesempenho, deleteDesempenho, type Desempenho } from '../../lib/desempenho'
import { useHasRole, ROLES } from '../../lib/roleGate'
import { modalInput, modalLabel } from '../modals/styles'

const font = "var(--font-body)"
const mono = "var(--font-label)"

const EMPTY = { temporada: String(new Date().getFullYear()), competicao: '', jogos: '', gols: '', assistencias: '', minutos: '' }

export default function DesempenhoTab({ athleteId, onChanged }: { athleteId: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<Desempenho[]>([])
  const [f, setF] = useState(EMPTY)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canWrite = useHasRole(ROLES.desempenho)

  const load = useCallback(async () => {
    try { setRows(await fetchDesempenho(athleteId)) } catch (e) { setErr((e as Error).message) }
  }, [athleteId])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga ao montar
  useEffect(() => { void load() }, [load])

  async function save() {
    if (!f.temporada.trim()) { setErr('Informe a temporada.'); return }
    setSaving(true); setErr(null)
    try {
      await upsertDesempenho({
        atleta_id: athleteId, temporada: f.temporada, competicao: f.competicao,
        jogos: Number(f.jogos) || 0, gols: Number(f.gols) || 0,
        assistencias: Number(f.assistencias) || 0, minutos: Number(f.minutos) || 0, fonte: 'MANUAL',
      })
      setF({ ...EMPTY, temporada: f.temporada })
      await load(); onChanged?.()
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
  }
  async function remove(r: Desempenho) {
    if (!window.confirm(`Excluir o desempenho ${r.temporada}${r.competicao ? ` · ${r.competicao}` : ' (total)'}?`)) return
    try { await deleteDesempenho(r.id); await load(); onChanged?.() } catch (e) { setErr((e as Error).message) }
  }
  function edit(r: Desempenho) {
    setF({ temporada: r.temporada, competicao: r.competicao, jogos: String(r.jogos), gols: String(r.gols), assistencias: String(r.assistencias), minutos: String(r.minutos) })
  }

  // Total por temporada (mesma regra da view: linha '' é o total; senão soma).
  const seasons = [...new Set(rows.map(r => r.temporada))].sort().reverse()
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: mono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)' }
  const num: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: mono }
  const numInput = (k: 'jogos' | 'gols' | 'assistencias' | 'minutos', label: string) => (
    <div><label style={modalLabel} htmlFor={`desemp-${k}`}>{label}</label>
      <input id={`desemp-${k}`} style={modalInput} inputMode="numeric" value={f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value.replace(/\D/g, '') }))} /></div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--divider-soft)', fontSize: 10, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Desempenho por temporada / competição
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Temporada</th><th style={th}>Competição</th>
              <th style={{ ...th, textAlign: 'right' }}>Jogos</th><th style={{ ...th, textAlign: 'right' }}>Gols</th>
              <th style={{ ...th, textAlign: 'right' }}>Assist.</th><th style={{ ...th, textAlign: 'right' }}>Minutos</th>
              <th style={th}>Fonte</th><th style={th} />
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Nenhum desempenho lançado. {canWrite ? 'Use o formulário abaixo ou importe uma planilha em Dados & Modelos.' : ''}</td></tr>}
              {seasons.map(s => {
                const list = rows.filter(r => r.temporada === s)
                const total = list.find(r => r.competicao === '')
                const sum = (k: 'jogos' | 'gols' | 'assistencias' | 'minutos') => total ? total[k] : list.reduce((a, r) => a + r[k], 0)
                return [
                  ...list.filter(r => r.competicao !== '').map(r => (
                    <tr key={r.id}>
                      <td style={{ ...td, fontFamily: mono }}>{r.temporada}</td><td style={td}>{r.competicao}</td>
                      <td style={num}>{r.jogos}</td><td style={num}>{r.gols}</td><td style={num}>{r.assistencias}</td><td style={num}>{r.minutos}</td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{r.fonte ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{canWrite && <><button className="btn btn-outline" style={{ padding: '3px 8px' }} onClick={() => edit(r)}>Editar</button> <button className="btn btn-outline" style={{ padding: '3px 8px', color: 'var(--neg)' }} onClick={() => void remove(r)}>✕</button></>}</td>
                    </tr>
                  )),
                  <tr key={`${s}-total`} style={{ background: 'var(--bg-subtle)' }}>
                    <td style={{ ...td, fontFamily: mono, fontWeight: 700 }}>{s}</td>
                    <td style={{ ...td, fontWeight: 700 }}>Total da temporada{total ? ' (lançado)' : ' (soma)'}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{sum('jogos')}</td><td style={{ ...num, fontWeight: 700 }}>{sum('gols')}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{sum('assistencias')}</td><td style={{ ...num, fontWeight: 700 }}>{sum('minutos')}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{total?.fonte ?? ''}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{canWrite && total && <><button className="btn btn-outline" style={{ padding: '3px 8px' }} onClick={() => edit(total)}>Editar</button> <button className="btn btn-outline" style={{ padding: '3px 8px', color: 'var(--neg)' }} onClick={() => void remove(total)}>✕</button></>}</td>
                  </tr>,
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canWrite ? (
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 10, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-secondary)', fontWeight: 700 }}>Lançar / atualizar desempenho</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <div><label style={modalLabel} htmlFor="desemp-temporada">Temporada *</label>
              <input id="desemp-temporada" style={modalInput} value={f.temporada} onChange={e => setF(p => ({ ...p, temporada: e.target.value }))} placeholder="2026" /></div>
            <div style={{ gridColumn: 'span 2' }}><label style={modalLabel} htmlFor="desemp-competicao">Competição (vazio = total da temporada)</label>
              <input id="desemp-competicao" style={modalInput} value={f.competicao} onChange={e => setF(p => ({ ...p, competicao: e.target.value }))} placeholder="Ex.: Brasileirão" /></div>
            {numInput('jogos', 'Jogos')}{numInput('gols', 'Gols')}{numInput('assistencias', 'Assistências')}{numInput('minutos', 'Minutos')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setF(EMPTY)} disabled={saving}>Limpar</button>
            <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar desempenho'}</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>Lançamento de desempenho: papéis master e futebol.</div>
      )}
      {err && <div role="alert" style={{ fontSize: 12, color: 'var(--neg)', fontFamily: font }}>{err}</div>}
    </div>
  )
}
