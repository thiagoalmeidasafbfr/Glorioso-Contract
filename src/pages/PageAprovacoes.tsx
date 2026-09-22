// src/pages/PageAprovacoes.tsx
// Fila de aprovação (migration 022): contratos e cláusulas EM_REVISAO para a
// Controladoria aprovar/rejeitar. Opcionalmente mostra rascunhos e rejeitados
// (útil ao Jurídico para reenviar).

import { useEffect, useMemo, useState } from 'react'
import PageHero from '../components/PageHero'
import RefLink from '../components/RefLink'
import AprovacaoStatus from '../components/AprovacaoStatus'
import { useAuth } from '../context/AuthContext'
import { fetchAthletes } from '../lib/athleteQueries'
import { fetchPendenciasAprovacao, mensagemErro, type PendenciasAprovacao } from '../lib/governanca'
import { fmtCurrencyShort, fmtDate } from '../lib/format'
import { CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS } from '../types/athlete-system'
import type { StatusAprovacao } from '../types/governanca'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'

export default function PageAprovacoes() {
  const { can } = useAuth()
  const [incluirOutros, setIncluirOutros] = useState(false)
  const [data, setData] = useState<PendenciasAprovacao | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    const st: StatusAprovacao[] = incluirOutros ? ['EM_REVISAO', 'RASCUNHO', 'REJEITADO'] : ['EM_REVISAO']
    Promise.all([fetchPendenciasAprovacao(st), fetchAthletes()])
      .then(([p, a]) => {
        if (!alive) return
        setData(p); setErr(null)
        setNames(new Map(a.map(x => [x.id, x.short_name || x.full_name])))
      })
      .catch(e => { if (alive) setErr(mensagemErro(e)) })
    return () => { alive = false }
  }, [incluirOutros, reload])

  const refresh = () => setReload(r => r + 1)
  const total = (data?.contracts.length ?? 0) + (data?.clauses.length ?? 0)
  const contracts = useMemo(() => [...(data?.contracts ?? [])].sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? '')), [data])
  const clauses = useMemo(() => [...(data?.clauses ?? [])].sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? '')), [data])

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Aprovações" subtitle={`Workflow Rascunho → Em revisão → Aprovado · ${total} item${total === 1 ? '' : 's'}`} />

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14, fontFamily: font, fontSize: 13, flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={incluirOutros} onChange={e => setIncluirOutros(e.target.checked)} />
          Incluir rascunhos e rejeitados
        </label>
        {!can('aprovar') && <span style={{ color: 'var(--text-muted)' }}>Somente Controladoria e Master aprovam ou rejeitam.</span>}
      </div>

      {err && <div role="alert" className="card" style={{ padding: 20, color: 'var(--neg)', fontFamily: font }}>Não foi possível carregar: {err}</div>}
      {!err && data === null && <div role="status" style={{ padding: 20, color: 'var(--text-muted)', fontFamily: font }}>Carregando…</div>}
      {!err && data !== null && total === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>
          Nada aguardando aprovação.
        </div>
      )}

      {contracts.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2 style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-secondary)', margin: '0 0 8px' }}>Contratos</h2>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <th style={{ textAlign: 'left' }}>Atleta</th><th style={{ textAlign: 'left' }}>Tipo</th>
                <th style={{ textAlign: 'left' }}>Contraparte</th><th style={{ textAlign: 'left' }}>Vigência</th>
                <th style={{ textAlign: 'right' }}>Transfer fee</th><th style={{ textAlign: 'left' }}>Status / ações</th>
              </tr></thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}><RefLink to={`/atletas/${c.athlete_id}`}>{names.get(c.athlete_id) ?? 'Atleta'}</RefLink></td>
                    <td>{CONTRACT_TYPE_LABELS[c.type]}</td>
                    <td>{c.counterpart_club || '—'}</td>
                    <td style={{ fontFamily: mono }}>{fmtDate(c.start_date)}{c.end_date ? ` – ${fmtDate(c.end_date)}` : ''}</td>
                    <td style={{ textAlign: 'right', fontFamily: mono }}>{c.transfer_fee_gross ? fmtCurrencyShort(c.transfer_fee_gross, c.transfer_currency) : '—'}</td>
                    <td><AprovacaoStatus tabela="ac_contratos" row={c} titulo={`${CONTRACT_TYPE_LABELS[c.type]} · ${c.counterpart_club}`} onChanged={refresh} hideAprovado={false} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {clauses.length > 0 && (
        <section>
          <h2 style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-secondary)', margin: '0 0 8px' }}>Cláusulas</h2>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <th style={{ textAlign: 'left' }}>Atleta</th><th style={{ textAlign: 'left' }}>Tipo</th>
                <th style={{ textAlign: 'left' }}>Descrição</th><th style={{ textAlign: 'left' }}>Credor → Devedor</th>
                <th style={{ textAlign: 'right' }}>Valor</th><th style={{ textAlign: 'left' }}>Status / ações</th>
              </tr></thead>
              <tbody>
                {clauses.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}><RefLink to={`/atletas/${c.athlete_id}`}>{names.get(c.athlete_id) ?? 'Atleta'}</RefLink></td>
                    <td>{CLAUSE_TYPE_LABELS[c.clause_type]}</td>
                    <td><RefLink to={`/obrigacoes/${c.id}`}>{c.description}</RefLink></td>
                    <td>{c.creditor_party} → {c.debtor_party}</td>
                    <td style={{ textAlign: 'right', fontFamily: mono }}>{c.original_value != null ? fmtCurrencyShort(c.original_value, c.currency) : '—'}</td>
                    <td><AprovacaoStatus tabela="ac_clausulas_fin" row={c} titulo={c.description} onChanged={refresh} hideAprovado={false} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
