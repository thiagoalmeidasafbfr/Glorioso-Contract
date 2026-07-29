// src/pages/PageCadastroDetail.tsx
// Página de um clube ou agente. Reúne, num só lugar, TUDO que liga a entidade ao
// resto do sistema:
//   • dados/escudo (editáveis);
//   • VÍNCULOS (contratos) em que a entidade é a contraparte — com link p/ atleta;
//   • OBRIGAÇÕES (parcelas de cláusulas + passivos flat), cada linha editável
//     direto aqui (parcela, obrigação, fluxo de parcelas) por ícones;
//   • criação de nova obrigação JÁ COM O FLUXO e de novo contrato.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  fetchClub, updateClub, fetchIntermediary, updateIntermediary, deleteClub, deleteIntermediary,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities, fetchAthletes,
  fetchAllClauses, fetchAllInstallments, fetchAllContracts, fetchAthleteContracts,
  markInstallmentPaid, revertInstallment, registerInstallmentPayment,
} from '../lib/athleteQueries'
import type {
  Athlete, Clause, ClauseInstallment, ClubLiability, IntermediaryLiability,
  Contract, ContractType, Currency,
} from '../types/athlete-system'
import {
  ACCESSORY_CONTRACT_TYPES, CONTRACT_TYPE_LABELS, CLAUSE_TYPE_LABELS,
} from '../types/athlete-system'
import {
  buildEntityObligations, contractsOfEntity, isOpenStatus, type EntityObligation,
} from '../lib/entityObligations'
import PageHero from '../components/PageHero'
import ImageUpload from '../components/ImageUpload'
import RefLink from '../components/RefLink'
import { Icon, IconButton } from '../components/Icon'
import RowActions, { ActionLegend } from '../components/RowActions'
import PaymentModal from '../components/athletes/PaymentModal'
import { promoteLiabilityToClause } from '../lib/liabilityFlow'
import {
  InstallmentEditModal, ClauseEditModal, ClauseFlowModal, LiabilityEditModal, ModalShell,
} from '../components/modals/EditModals'
import { modalInput, modalLabel } from '../components/modals/styles'
import NewObligationModal from '../components/modals/NewObligationModal'
import { fmtCurrencyShort, fmtDate, isOverdue } from '../lib/format'
import { parseRJ, toggleItemRJ } from '../lib/judicialRecovery'
import { useAuth } from '../context/AuthContext'

const fontBody = "var(--font-body)"
const fontMono = "var(--font-label)"

type Kind = 'clube' | 'intermediario'

const STATUS_TONE: Record<string, { l: string; t: 'pos' | 'neg' | 'neutral' }> = {
  PENDENTE: { l: 'Pendente', t: 'neutral' }, PAGA: { l: 'Paga', t: 'pos' },
  PARCIALMENTE_PAGA: { l: 'Parcial', t: 'neutral' }, EM_ATRASO: { l: 'Em atraso', t: 'neg' },
  VENCIDA: { l: 'Vencida', t: 'neg' }, CANCELADA: { l: 'Cancelada', t: 'neutral' },
}

const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }

export default function PageCadastroDetail({ kind }: { kind: Kind }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = !profile || profile.role === 'master' || profile.role === 'juridico'
  const isClube = kind === 'clube'
  const basePath = isClube ? '/clubes' : '/intermediarios'

  const [name, setName] = useState('')
  const [sub, setSub] = useState<string | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [rows, setRows] = useState<EntityObligation[]>([])
  const [clauses, setClauses] = useState<Clause[]>([])
  const [installments, setInstallments] = useState<ClauseInstallment[]>([])
  const [clubLiabs, setClubLiabs] = useState<ClubLiability[]>([])
  const [intermLiabs, setIntermLiabs] = useState<IntermediaryLiability[]>([])
  const [entityContracts, setEntityContracts] = useState<Contract[]>([])
  const [nameOf, setNameOf] = useState<Map<string, string>>(new Map())
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showNewContract, setShowNewContract] = useState(false)
  const [showNewObl, setShowNewObl] = useState(false)
  const [onlyOpen, setOnlyOpen] = useState(false)

  // Alvos de edição (uma modal por vez).
  const [editInstId, setEditInstId] = useState<string | null>(null)
  const [payInstId, setPayInstId] = useState<string | null>(null)
  const [editClauseId, setEditClauseId] = useState<string | null>(null)
  const [flowClauseId, setFlowClauseId] = useState<string | null>(null)
  const [editLiab, setEditLiab] = useState<{ kind: 'club' | 'agent'; liab: ClubLiability | IntermediaryLiability } | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [athletesList, cls, insts, contracts, cLiabs, iLiabs] = await Promise.all([
      fetchAthletes(), fetchAllClauses(), fetchAllInstallments(), fetchAllContracts(),
      fetchAllClubLiabilities(), fetchAllIntermediaryLiabilities(),
    ])
    setAthletes(athletesList)
    setNameOf(new Map(athletesList.map((a: Athlete) => [a.id, a.short_name || a.full_name])))
    setClauses(cls); setInstallments(insts); setClubLiabs(cLiabs); setIntermLiabs(iLiabs)

    const entity = isClube ? await fetchClub(id) : await fetchIntermediary(id)
    if (!entity) { setNotFound(true); setLoading(false); return }
    const entityName = entity.name
    setName(entityName)
    setSub(isClube ? (entity as { country: string | null }).country : (entity as { contact: string | null }).contact)
    setLogo(entity.logo_url); setNotes(entity.notes)

    setRows(buildEntityObligations({
      entityName, kind, clauses: cls, installments: insts,
      clubLiabs: cLiabs, intermLiabs: iLiabs, labels: CLAUSE_TYPE_LABELS,
    }))
    setEntityContracts(contractsOfEntity(entityName, contracts))
    setLoading(false)
  }, [id, isClube, kind])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de dados no mount
  useEffect(() => { load() }, [load])

  async function saveLogo(url: string | null) {
    setLogo(url)
    if (!id) return
    if (isClube) await updateClub(id, { logo_url: url })
    else await updateIntermediary(id, { logo_url: url })
  }

  async function saveMeta() {
    if (!id || !name.trim()) return
    setSaving(true)
    try {
      if (isClube) await updateClub(id, { name: name.trim(), country: sub, notes })
      else await updateIntermediary(id, { name: name.trim(), contact: sub, notes })
      setEditing(false)
      await load()
    } finally { setSaving(false) }
  }

  const visible = useMemo(() => onlyOpen ? rows.filter(r => isOpenStatus(r.status)) : rows, [rows, onlyOpen])

  // Totais por moeda/direção (em aberto) — o que realmente falta pagar/receber.
  const totals = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const r of rows) if (isOpenStatus(r.status)) {
      const k = `${r.direction}|${r.currency}`
      acc[k] = (acc[k] ?? 0) + r.amount
    }
    return Object.entries(acc).sort()
  }, [rows])
  const openBRL = rows.reduce((s, r) => isOpenStatus(r.status) ? s + r.amount * (APPROX_BRL[r.currency] ?? 1) : s, 0)

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: fontMono, fontSize: 12 }}>CARREGANDO...</div>
  if (notFound) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: fontBody }}>
      <div style={{ color: 'var(--text-muted)' }}>Registro não encontrado.</div>
      <button onClick={() => navigate(basePath)} className="btn btn-outline" style={{ marginTop: 16 }}>← Voltar</button>
    </div>
  )

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono, letterSpacing: '0.14em', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: fontBody, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }

  const editInst = editInstId ? installments.find(i => i.id === editInstId) ?? null : null
  const editClause = editClauseId ? clauses.find(c => c.id === editClauseId) ?? null : null
  const flowClause = flowClauseId ? clauses.find(c => c.id === flowClauseId) ?? null : null

  async function quickPay(instId: string) { await markInstallmentPaid(instId, new Date().toISOString().slice(0, 10)); await load() }
  async function quickRevert(instId: string) { await revertInstallment(instId); await load() }
  async function toggleRJ(l: EntityObligation) {
    await toggleItemRJ({ kind: l.kind, id: l.id }, l.notes)
    await load()
  }
  async function handleDeleteEntity() {
    if (!id) return
    const label = isClube ? 'clube' : 'agente'
    const blocking = entityContracts.length + rows.length
    const extra = blocking > 0
      ? `\n\nATENÇÃO: existem ${entityContracts.length} contrato(s) e ${rows.length} obrigação/parcela(s) apontando para este ${label}. Exclusão só será permitida se nada mais estiver vinculado.`
      : ''
    if (!window.confirm(`Excluir permanentemente este ${label}? Esta ação não pode ser desfeita.${extra}`)) return
    try {
      if (isClube) await deleteClub(id); else await deleteIntermediary(id)
      navigate(basePath)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      window.alert(`Não foi possível excluir o ${label}. Verifique se há contratos ou obrigações vinculados.\n\n${msg}`)
    }
  }
  async function registerPayment(instId: string, pmt: { date: string; valueCurrency: number; valueBRL: number; rate: number; notes: string }) {
    await registerInstallmentPayment(instId, {
      payment_date: pmt.date, amount_paid_currency: pmt.valueCurrency,
      amount_paid_brl: pmt.valueBRL, exchange_rate: pmt.rate, notes: pmt.notes,
    })
    setPayInstId(null); await load()
  }

  // Passivo flat → obrigação com parcelas: promove e abre o editor de fluxo.
  async function generateFlowFor(kind: 'club' | 'agent', liab: ClubLiability | IntermediaryLiability) {
    const clause = await promoteLiabilityToClause(kind, liab)
    await load()
    setFlowClauseId(clause.id)
  }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title={name} subtitle={isClube ? 'Clube · Botafogo SAF' : 'Agente · Botafogo SAF'} />
      <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-muted)', fontFamily: fontBody }}>
        <Link to={basePath} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{isClube ? 'Clubes' : 'Agentes'}</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--ink-primary)' }}>{name}</span>
      </div>

      {/* Cabeçalho com logo */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 16, display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ImageUpload value={logo} onChange={saveLogo} fallbackText={name} size={92} rounded={!isClube} editable={canEdit} />
        <div style={{ flex: 1, minWidth: 240 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" aria-label="Nome"
                style={{ ...modalInput, fontSize: 16, fontWeight: 600 }} />
              <input value={sub ?? ''} onChange={e => setSub(e.target.value)} placeholder={isClube ? 'País' : 'Contato'} aria-label={isClube ? 'País' : 'Contato'}
                style={modalInput} />
              <textarea value={notes ?? ''} onChange={e => setNotes(e.target.value)} placeholder="Observações" aria-label="Observações"
                style={{ ...modalInput, minHeight: 48, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveMeta} disabled={saving || !name.trim()} className="btn btn-primary">{saving ? 'Salvando...' : 'Salvar'}</button>
                <button onClick={() => { setEditing(false); load() }} className="btn btn-outline">Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontFamily: fontBody, fontSize: 23, fontWeight: 700, color: 'var(--ink-primary)', margin: 0 }}>{name}</h1>
                {canEdit && <IconButton icon="edit" label="Editar cadastro" onClick={() => setEditing(true)} />}
                {canEdit && <IconButton icon="trash" label={`Excluir ${isClube ? 'clube' : 'agente'}`} tone="danger" onClick={handleDeleteEntity} />}
              </div>
              {sub && <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: fontBody, marginTop: 2 }}>{isClube ? sub : `Contato: ${sub}`}</div>}
              {notes && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', fontFamily: fontBody, background: 'var(--bg-subtle)', borderRadius: 6, padding: '6px 10px' }}>{notes}</div>}
            </>
          )}
        </div>

        {/* Indicadores + ações */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Kpi label="Obrigações" value={String(rows.length)} />
            <Kpi label="Vínculos" value={String(entityContracts.length)} />
            <Kpi label="Em aberto (aprox.)" value={fmtCurrencyShort(openBRL, 'BRL')} />
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewObl(true)} className="btn btn-primary">
                <Icon name="plus" size={14} /> Nova obrigação
              </button>
              <button onClick={() => setShowNewContract(true)} className="btn btn-outline">
                <Icon name="plus" size={14} /> Novo contrato
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Totais por moeda em aberto */}
      {totals.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {totals.map(([k, v]) => {
            const [dir, moeda] = k.split('|')
            const pay = dir === 'A_PAGAR'
            return (
              <div key={k} style={{ padding: '10px 14px', borderRadius: 9, background: pay ? 'var(--neg-tint)' : 'var(--pos-tint)', border: `1px solid ${pay ? 'rgba(138,53,36,0.22)' : 'rgba(47,107,58,0.22)'}` }}>
                <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: pay ? 'var(--neg)' : 'var(--pos)', marginBottom: 4 }}>
                  {pay ? 'A pagar' : 'A receber'} · {moeda} (em aberto)
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: fontMono, color: pay ? 'var(--neg)' : 'var(--pos)' }}>{fmtCurrencyShort(v, moeda as Currency)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Vínculos (contratos) em que a entidade é contraparte */}
      {entityContracts.length > 0 && (
        <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-primary)', fontFamily: fontBody }}>Vínculos com {isClube ? 'este clube' : 'este agente'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>{entityContracts.length} contrato(s)</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Atleta</th><th style={th}>Tipo</th><th style={th}>Início</th><th style={th}>Término</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th><th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Ações</th>
              </tr></thead>
              <tbody>
                {entityContracts.map(ct => (
                  <tr key={ct.id}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      <RefLink to={`/atletas/${ct.athlete_id}`} title="Abrir atleta">{nameOf.get(ct.athlete_id) ?? '—'}</RefLink>
                    </td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11 }}>{CONTRACT_TYPE_LABELS[ct.type]}</td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11 }}>{fmtDate(ct.start_date)}</td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11 }}>{ct.end_date ? fmtDate(ct.end_date) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: fontMono }}>{ct.transfer_fee_gross != null ? fmtCurrencyShort(ct.transfer_fee_gross, ct.transfer_currency) : '—'}</td>
                    <td style={td}><Badge label={ct.status.toLowerCase()} tone={ct.status === 'ATIVO' ? 'pos' : 'neutral'} /></td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <RowActions open={{ to: `/atletas/${ct.athlete_id}`, label: 'Abrir o vínculo na ficha do atleta' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Obrigações vinculadas */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-primary)', fontFamily: fontBody }}>Obrigações vinculadas</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, fontFamily: fontBody, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />
              Só em aberto
            </label>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>{visible.length} linha(s)</span>
          </div>
        </div>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--divider-soft)', background: 'var(--bg-subtle)' }}>
          <ActionLegend items={['open', 'edit', 'schedule', 'generate', 'markPaid', 'pay', 'revert', 'rj']} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th style={th}>Atleta</th>
                <th style={th}>Natureza</th>
                <th style={th}>Descrição</th>
                <th style={th}>Direção</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                <th style={th}>Vencimento</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                  Nenhuma obrigação vinculada a este {isClube ? 'clube' : 'agente'}.
                  {canEdit && <> Use <strong>Nova obrigação</strong> para lançar valores e parcelas.</>}
                </td></tr>
              )}
              {visible.map(l => {
                const tone = STATUS_TONE[l.status]?.t ?? 'neutral'
                const late = isOverdue(l.due_date, l.status)
                const liab = l.kind === 'club' ? clubLiabs.find(x => x.id === l.id)
                  : l.kind === 'agent' ? intermLiabs.find(x => x.id === l.id) : null
                const inst = l.kind === 'inst' ? installments.find(i => i.id === l.id) : null
                return (
                  <tr key={`${l.kind}:${l.id}`} style={{ background: parseRJ(l.notes) ? 'var(--warn-tint, #fff4e0)' : late ? 'var(--row-late-bg)' : undefined }}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      <RefLink to={`/atletas/${l.athlete_id}`} title="Abrir atleta">{nameOf.get(l.athlete_id) ?? '—'}</RefLink>
                    </td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11 }}>
                      {l.natureza}
                      {parseRJ(l.notes) && <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'var(--warn)', color: '#fff', fontFamily: fontMono, fontSize: 8, fontWeight: 700, letterSpacing: '0.10em' }} title={`Em RJ desde ${fmtDate(parseRJ(l.notes)!.filedAt)}`}>RJ</span>}
                    </td>
                    <td style={{ ...td, color: 'var(--text-secondary)', maxWidth: 330 }}>
                      {l.clauseId
                        ? <RefLink to={`/obrigacoes/${l.clauseId}`} title="Abrir a obrigação">{l.description}</RefLink>
                        : l.description}
                    </td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: l.direction === 'A_PAGAR' ? 'var(--neg)' : 'var(--pos)' }}>
                      {l.direction === 'A_PAGAR' ? 'a pagar' : 'a receber'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 600 }}>{fmtCurrencyShort(l.amount, l.currency)}</td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--text-secondary)', fontWeight: late ? 700 : 400 }}>{l.due_date ? fmtDate(l.due_date) : '—'}</td>
                    <td style={td}><Badge label={STATUS_TONE[l.status]?.l ?? l.status} tone={tone} /></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <RowActions
                        open={{ to: l.clauseId ? `/obrigacoes/${l.clauseId}` : null, reason: 'passivo importado — gere as parcelas para criar a obrigação' }}
                        edit={{
                          onClick: !canEdit ? undefined
                            : l.kind === 'inst' ? () => setEditInstId(l.id)
                            : l.kind === 'clause' ? () => setEditClauseId(l.id)
                            : liab ? () => setEditLiab({ kind: l.kind as 'club' | 'agent', liab }) : undefined,
                          reason: 'sem permissão de edição',
                        }}
                        schedule={l.clauseId ? { onClick: canEdit ? () => setFlowClauseId(l.clauseId!) : undefined, reason: 'sem permissão de edição' } : undefined}
                        generate={!l.clauseId && liab ? { onClick: canEdit ? () => generateFlowFor(l.kind as 'club' | 'agent', liab) : undefined, reason: 'sem permissão de edição' } : undefined}
                        markPaid={{
                          onClick: canEdit && inst && inst.payment_status !== 'PAGA' && inst.payment_status !== 'CANCELADA' ? () => quickPay(inst.id) : undefined,
                          reason: !inst ? 'gere as parcelas para dar baixa' : inst.payment_status === 'PAGA' ? 'parcela já paga' : 'parcela cancelada',
                        }}
                        pay={{
                          onClick: canEdit && inst && inst.payment_status !== 'PAGA' && inst.payment_status !== 'CANCELADA' ? () => setPayInstId(inst.id) : undefined,
                          reason: !inst ? 'gere as parcelas para registrar o pagamento' : inst.payment_status === 'PAGA' ? 'parcela já paga' : 'parcela cancelada',
                        }}
                        revert={{
                          onClick: canEdit && inst && inst.payment_status === 'PAGA' ? () => quickRevert(inst.id) : undefined,
                          reason: 'a parcela não está paga',
                        }}
                        rj={canEdit && l.direction === 'A_PAGAR' ? { onClick: () => toggleRJ(l), marked: !!parseRJ(l.notes) } : undefined}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modais */}
      {showNewObl && (
        <NewObligationModal entityName={name} kind={kind} athletes={athletes}
          onClose={() => setShowNewObl(false)}
          onSaved={clauseId => { setShowNewObl(false); navigate(`/obrigacoes/${clauseId}`) }} />
      )}
      {showNewContract && (
        <NewContractFromEntityModal entityName={name} kind={kind} athletes={athletes} onClose={() => setShowNewContract(false)} />
      )}
      {payInstId && (() => {
        const inst = installments.find(i => i.id === payInstId)
        return inst ? (
          <PaymentModal label={`Parcela ${inst.installment_number}`} currency={inst.currency} value={inst.original_value}
            onClose={() => setPayInstId(null)} onSave={pmt => registerPayment(inst.id, pmt)} />
        ) : null
      })()}
      {editInst && <InstallmentEditModal inst={editInst} onClose={() => setEditInstId(null)} onSaved={() => { setEditInstId(null); load() }} />}
      {editClause && <ClauseEditModal clause={editClause} onClose={() => setEditClauseId(null)} onSaved={() => { setEditClauseId(null); load() }} />}
      {flowClause && <ClauseFlowModal clause={flowClause} onClose={() => setFlowClauseId(null)} onSaved={() => { setFlowClauseId(null); load() }} />}
      {editLiab && (
        <LiabilityEditModal kind={editLiab.kind} liab={editLiab.liab}
          onClose={() => setEditLiab(null)}
          onSaved={() => { setEditLiab(null); load() }}
          onPromoted={async clauseId => { setEditLiab(null); await load(); setFlowClauseId(clauseId) }} />
      )}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, fontFamily: fontMono, color: 'var(--ink-primary)' }}>{value}</div>
    </div>
  )
}

function Badge({ label, tone }: { label: string; tone: 'pos' | 'neg' | 'neutral' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 9, fontWeight: 600,
      fontFamily: fontMono, letterSpacing: '0.08em', textTransform: 'uppercase',
      background: tone === 'pos' ? 'var(--pos-tint)' : tone === 'neg' ? 'var(--neg-tint)' : 'var(--cream-inset)',
      color: tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--ink-secondary)',
    }}>{label}</span>
  )
}

// ── Novo contrato a partir da página do clube/agente ─────────────────────────
// Escolhe o atleta e (opcionalmente) o vínculo ao qual o contrato se atrela,
// depois abre o cadastro de contrato já com a contraparte e o tipo preenchidos.
function NewContractFromEntityModal({ entityName, kind, athletes, onClose }: {
  entityName: string; kind: Kind; athletes: Athlete[]; onClose: () => void
}) {
  const navigate = useNavigate()
  const isClube = kind === 'clube'
  const [athleteId, setAthleteId] = useState('')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [relId, setRelId] = useState('')
  const [tipo, setTipo] = useState<ContractType>(isClube ? 'ENTRADA' : 'INTERMEDIACAO')

  useEffect(() => {
    if (!athleteId) return
    let alive = true
    fetchAthleteContracts(athleteId).then(cs => { if (alive) setContracts(cs) })
    return () => { alive = false }
  }, [athleteId])

  function chooseAthlete(nextId: string) {
    setAthleteId(nextId)
    setRelId('')
    if (!nextId) setContracts([])
  }

  function go() {
    if (!athleteId) return
    const params = new URLSearchParams()
    params.set('tipo', tipo)
    if (isClube) params.set('clube', entityName)
    else params.set('agente', entityName)
    if (relId) params.set('rel', relId)
    navigate(`/atletas/${athleteId}/contratos/novo?${params.toString()}`)
  }

  const clabel = (c: Contract) => `${CONTRACT_TYPE_LABELS[c.type]} · ${c.counterpart_club || '—'}${c.start_date ? ' · ' + fmtDate(c.start_date) : ''}`
  const sortedAthletes = [...athletes].sort((a, b) => (a.short_name || a.full_name).localeCompare(b.short_name || b.full_name))
  const tipos: ContractType[] = isClube
    ? ['ENTRADA', 'SAIDA', 'EMPRESTIMO_ENTRADA', 'EMPRESTIMO_SAIDA', ...ACCESSORY_CONTRACT_TYPES]
    : [...ACCESSORY_CONTRACT_TYPES]

  return (
    <ModalShell title="Novo contrato" width={560} onClose={onClose}
      subtitle={`${isClube ? 'clube' : 'agente'}: ${entityName}`}
      footer={<>
        <button onClick={onClose} className="btn btn-outline">Cancelar</button>
        <button onClick={go} className="btn btn-primary" disabled={!athleteId}>Continuar →</button>
      </>}>
      <div><label style={modalLabel}>Atleta *</label>
        <select style={modalInput} value={athleteId} onChange={e => chooseAthlete(e.target.value)}>
          <option value="">— selecione o atleta —</option>
          {sortedAthletes.map(a => <option key={a.id} value={a.id}>{a.short_name || a.full_name}</option>)}
        </select>
      </div>
      <div><label style={modalLabel}>Atrelar a um vínculo do atleta (opcional)</label>
        <select style={modalInput} value={relId} onChange={e => setRelId(e.target.value)} disabled={!athleteId || contracts.length === 0}>
          <option value="">{!athleteId ? '— escolha o atleta primeiro —' : contracts.length === 0 ? '— sem vínculos cadastrados —' : '— nenhum (contrato independente) —'}</option>
          {contracts.map(c => <option key={c.id} value={c.id}>{clabel(c)}</option>)}
        </select>
      </div>
      <div><label style={modalLabel}>Tipo de contrato</label>
        <select style={modalInput} value={tipo} onChange={e => setTipo(e.target.value as ContractType)}>
          {tipos.map(t => <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: fontBody }}>
        No cadastro do contrato você já define os valores e o <strong>fluxo de parcelas</strong> — a contraparte vem preenchida.
      </div>
    </ModalShell>
  )
}
