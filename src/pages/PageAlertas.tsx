// src/pages/PageAlertas.tsx
// Central de alertas (migration 027): alertas abertos (resolvido_em nulo),
// agrupados por setor e tipo, com filtro de setor, link ao atleta e
// "marcar como lido". Master pode disparar gerar_alertas() na hora.

import { useEffect, useMemo, useState } from 'react'
import PageHero from '../components/PageHero'
import RefLink from '../components/RefLink'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/toast-context'
import { USE_SUPABASE } from '../lib/supabase'
import { markAlertRead } from '../lib/athleteQueries'
import {
  fetchAlertasAbertos, gerarAlertas, marcarAlertaNaoLido, setoresDoAlerta, mensagemErro,
  ALERT_TYPE_LABELS, SETOR_LABELS, type SetorAlerta,
} from '../lib/governanca'
import { fmtDate } from '../lib/format'
import type { AlertType, AlertWithDetails } from '../types/athlete-system'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'
const SEV_ORDER = { RED: 0, YELLOW: 1, GREEN: 2 } as const
const SEV_STYLE = {
  RED:    { label: 'Crítico', bg: 'var(--neg-tint)', fg: 'var(--neg)' },
  YELLOW: { label: 'Atenção', bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  GREEN:  { label: 'Informativo', bg: 'var(--pos-tint)', fg: 'var(--pos)' },
} as const

type FiltroSetor = 'todos' | 'meu' | SetorAlerta

export default function PageAlertas() {
  const { isMaster, role } = useAuth()
  const toast = useToast()
  const [alerts, setAlerts] = useState<AlertWithDetails[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [setor, setSetor] = useState<FiltroSetor>('todos')
  const [soNaoLidos, setSoNaoLidos] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchAlertasAbertos()
      .then(a => { if (alive) { setAlerts(a); setErr(null) } })
      .catch(e => { if (alive) setErr(mensagemErro(e)) })
    return () => { alive = false }
  }, [reload])

  const filtered = useMemo(() => {
    if (!alerts) return []
    return alerts.filter(a => {
      if (soNaoLidos && a.is_read) return false
      if (setor === 'todos') return true
      const s = setoresDoAlerta(a)
      if (setor === 'meu') return !!role && (role === 'master' || s.includes(role))
      return s.includes(setor)
    })
  }, [alerts, setor, soNaoLidos, role])

  // Agrupa por setor principal → tipo.
  const groups = useMemo(() => {
    const m = new Map<string, Map<AlertType, AlertWithDetails[]>>()
    for (const a of filtered) {
      const s = setoresDoAlerta(a)
      const key = setor !== 'todos' && setor !== 'meu' ? setor : (s[0] ?? 'geral')
      if (!m.has(key)) m.set(key, new Map())
      const byType = m.get(key)!
      if (!byType.has(a.alert_type)) byType.set(a.alert_type, [])
      byType.get(a.alert_type)!.push(a)
    }
    for (const byType of m.values()) for (const list of byType.values()) {
      list.sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity] || (x.data_referencia ?? x.created_at).localeCompare(y.data_referencia ?? y.created_at))
    }
    return m
  }, [filtered, setor])

  const naoLidos = (alerts ?? []).filter(a => !a.is_read).length

  async function toggleRead(a: AlertWithDetails) {
    try {
      if (a.is_read) await marcarAlertaNaoLido(a.id)
      else await markAlertRead(a.id)
      setAlerts(prev => prev?.map(x => x.id === a.id ? { ...x, is_read: !a.is_read } : x) ?? prev)
      window.dispatchEvent(new Event('alertas-changed'))
    } catch (e) { toast.error('Não foi possível concluir a ação.', { detail: mensagemErro(e) }) }
  }
  async function handleGerar() {
    setBusy(true); setMsg(null)
    try {
      const n = await gerarAlertas()
      setMsg(`${n} alerta${n === 1 ? '' : 's'} novo${n === 1 ? '' : 's'} ou reaberto${n === 1 ? '' : 's'}.`)
      setReload(r => r + 1)
      window.dispatchEvent(new Event('alertas-changed'))
    } catch (e) { setMsg(`Falha ao gerar alertas: ${mensagemErro(e)}`) } finally { setBusy(false) }
  }

  const setorOpts: { v: FiltroSetor; label: string }[] = [
    { v: 'todos', label: 'Todos os setores' },
    ...(USE_SUPABASE && role && role !== 'master' ? [{ v: 'meu' as FiltroSetor, label: 'Meu setor' }] : []),
    ...(Object.keys(SETOR_LABELS) as SetorAlerta[]).map(s => ({ v: s as FiltroSetor, label: SETOR_LABELS[s] })),
  ]

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Alertas" subtitle={`Central de alertas · ${naoLidos} não lido${naoLidos === 1 ? '' : 's'}`}>
        {isMaster && (
          <button className="btn btn-outline" onClick={handleGerar} disabled={busy}
            title={USE_SUPABASE ? 'Executa gerar_alertas() agora (também roda diariamente às 09:00 UTC)' : 'Modo local: aplica as regras de parcelas e contratos sobre os dados deste navegador'}>
            {busy ? 'Gerando…' : 'Gerar alertas agora'}
          </button>
        )}
      </PageHero>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', fontFamily: font, fontSize: 13 }}>
        <label htmlFor="filtro-setor" style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Setor</label>
        <select id="filtro-setor" value={setor} onChange={e => setSetor(e.target.value as FiltroSetor)}>
          {setorOpts.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={soNaoLidos} onChange={e => setSoNaoLidos(e.target.checked)} /> Só não lidos
        </label>
        {msg && <span role="status" style={{ color: 'var(--ink-secondary)' }}>{msg}</span>}
        {!USE_SUPABASE && <span style={{ color: 'var(--text-muted)' }}>Modo local: alertas de gatilhos e e-mails por setor exigem Supabase.</span>}
      </div>

      {err && <div role="alert" className="card" style={{ padding: 20, color: 'var(--neg)', fontFamily: font }}>Não foi possível carregar os alertas: {err}</div>}
      {!err && alerts === null && <div role="status" style={{ padding: 20, color: 'var(--text-muted)', fontFamily: font }}>Carregando…</div>}
      {!err && alerts !== null && filtered.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>
          Nenhum alerta aberto{setor !== 'todos' ? ' para este filtro' : ''}.
          {isMaster && ' Use “Gerar alertas agora” para aplicar as regras de vencimento e fim de contrato.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {[...groups.entries()].map(([sKey, byType]) => (
          <section key={sKey} aria-label={`Alertas — ${SETOR_LABELS[sKey as SetorAlerta] ?? sKey}`}>
            <h2 style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-secondary)', margin: '0 0 8px' }}>
              {SETOR_LABELS[sKey as SetorAlerta] ?? 'Geral'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[...byType.entries()].map(([type, list]) => (
                <div key={type} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', fontFamily: font, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{ALERT_TYPE_LABELS[type] ?? type}</span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-muted)' }}>{list.length}</span>
                  </div>
                  {list.map(a => {
                    const sev = SEV_STYLE[a.severity]
                    return (
                      <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 16px', borderTop: '1px solid var(--divider-soft)', fontFamily: font, fontSize: 13, opacity: a.is_read ? 0.6 : 1, flexWrap: 'wrap' }}>
                        <span className="chip" style={{ background: sev.bg, color: sev.fg, minWidth: 74, textAlign: 'center' }}>{sev.label}</span>
                        <span style={{ fontWeight: 600, minWidth: 140 }}>
                          <RefLink to={`/atletas/${a.athlete_id}`} title="Abrir ficha do atleta">{a.athlete_name ?? 'Atleta'}</RefLink>
                        </span>
                        <span style={{ flex: 1, minWidth: 200, color: 'var(--ink-secondary)' }}>
                          {a.clause_id ? <RefLink to={`/obrigacoes/${a.clause_id}`} title="Abrir a obrigação">{a.message}</RefLink> : a.message}
                        </span>
                        {a.data_referencia && <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(a.data_referencia)}</span>}
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleRead(a)}>{a.is_read ? 'Marcar como não lido' : 'Marcar como lido'}</button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
