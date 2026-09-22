// src/pages/PageAuditoria.tsx
// Trilha de auditoria global (migration 021) com filtros por tabela, usuário e
// período. Visível para master, controladoria e diretoria.

import { useEffect, useMemo, useState } from 'react'
import PageHero from '../components/PageHero'
import { AuditoriaLista } from '../components/HistoricoAuditoria'
import { useAuth } from '../context/AuthContext'
import { USE_SUPABASE } from '../lib/supabase'
import { fetchAuditoria, TABELA_LABELS, mensagemErro, type FiltroAuditoria } from '../lib/governanca'
import { fetchAthletes } from '../lib/athleteQueries'
import { addDays, todayISO } from '../lib/format'
import type { AuditoriaRow } from '../types/governanca'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'
const lbl: React.CSSProperties = { fontFamily: mono, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }

export default function PageAuditoria() {
  const { can } = useAuth()
  const [tabela, setTabela] = useState('')
  const [usuario, setUsuario] = useState('')
  const [de, setDe] = useState(() => addDays(todayISO(), -30))
  const [ate, setAte] = useState(() => todayISO())
  const [filtro, setFiltro] = useState<FiltroAuditoria>(() => ({ de: addDays(todayISO(), -30), ate: todayISO(), limit: 500 }))
  const [rows, setRows] = useState<AuditoriaRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!USE_SUPABASE) return
    let alive = true
    fetchAuditoria(filtro)
      .then(r => { if (alive) { setRows(r); setErr(null) } })
      .catch(e => { if (alive) setErr(mensagemErro(e)) })
    return () => { alive = false }
  }, [filtro])

  useEffect(() => {
    let alive = true
    fetchAthletes().then(a => { if (alive) setNames(new Map(a.map(x => [x.id, x.short_name || x.full_name]))) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const tabelas = useMemo(() => Object.entries(TABELA_LABELS).sort((a, b) => a[1].localeCompare(b[1])), [])

  function aplicar(e?: React.FormEvent) {
    e?.preventDefault()
    setRows(null)
    setFiltro({ tabela: tabela || undefined, usuario: usuario.trim() || undefined, de: de || undefined, ate: ate || undefined, limit: 500 })
  }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Auditoria" subtitle="Administração · quem alterou o quê e quando" />

      {!USE_SUPABASE ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>
          Trilha de auditoria disponível apenas com Supabase.
        </div>
      ) : !can('verAuditoria') ? (
        <div className="card" role="alert" style={{ padding: 32, textAlign: 'center', color: 'var(--neg)', fontFamily: font }}>
          A auditoria é visível apenas para Master, Controladoria e Diretoria.
        </div>
      ) : (
        <>
          <form onSubmit={aplicar} className="card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label htmlFor="aud-tabela" style={lbl}>Tabela</label>
              <select id="aud-tabela" value={tabela} onChange={e => setTabela(e.target.value)}>
                <option value="">Todas</option>
                {tabelas.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="aud-user" style={lbl}>Usuário (e-mail ou nome)</label>
              <input id="aud-user" type="text" value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="ex.: tesouraria@" />
            </div>
            <div>
              <label htmlFor="aud-de" style={lbl}>De</label>
              <input id="aud-de" type="date" value={de} onChange={e => setDe(e.target.value)} />
            </div>
            <div>
              <label htmlFor="aud-ate" style={lbl}>Até</label>
              <input id="aud-ate" type="date" value={ate} onChange={e => setAte(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary">Filtrar</button>
          </form>

          <div className="card" style={{ padding: '8px 18px' }}>
            {err ? (
              <div role="alert" style={{ padding: 16, color: 'var(--neg)', fontFamily: font }}>Não foi possível carregar a auditoria: {err}</div>
            ) : rows === null ? (
              <div role="status" style={{ padding: 16, color: 'var(--text-muted)', fontFamily: font }}>Carregando…</div>
            ) : (
              <>
                <div style={{ fontFamily: font, fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
                  {rows.length} registro{rows.length === 1 ? '' : 's'}{rows.length >= 500 ? ' (limite — refine os filtros)' : ''}
                </div>
                <AuditoriaLista rows={rows} showAtleta atletaNome={id => names.get(id)} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
