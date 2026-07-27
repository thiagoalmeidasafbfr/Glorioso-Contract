// src/components/modals/NewObligationModal.tsx
// Cria uma OBRIGAÇÃO já com o FLUXO DE PARCELAS na mesma tela — sem precisar
// salvar e voltar depois para lançar os vencimentos. Usada nas páginas de clube e
// de agente (a contraparte já vem preenchida) e amarra sempre:
//   atleta  →  vínculo (contrato, opcional)  →  obrigação  →  parcelas.

import { useEffect, useState } from 'react'
import type {
  Athlete, Contract, ClauseType, Currency, LiabilityDirection,
} from '../../types/athlete-system'
import { CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS } from '../../types/athlete-system'
import { createClause, createClauseInstallments, fetchAthleteContracts } from '../../lib/athleteQueries'
import { CLUB_CLAUSE_TYPES, AGENT_CLAUSE_TYPES, type EntityKind } from '../../lib/entityObligations'
import { fmtDate, todayISO } from '../../lib/format'
import FlowBuilder, { type FlowLine } from '../FlowBuilder'
import { ModalShell } from './EditModals'
import { modalInput, modalLabel } from './styles'

const font = "'Inter', system-ui, sans-serif"

const contractLabel = (c: Contract) =>
  `${CONTRACT_TYPE_LABELS[c.type]} · ${c.counterpart_club || '—'}${c.start_date ? ` · ${fmtDate(c.start_date)}` : ''}`

export default function NewObligationModal({ entityName, kind, athletes, onClose, onSaved }: {
  entityName: string
  kind: EntityKind
  athletes: Athlete[]
  onClose: () => void
  /** Recebe o id da obrigação criada (para abrir a página dela, se quiser). */
  onSaved: (clauseId: string) => void
}) {
  const isClube = kind === 'clube'
  const types = isClube ? CLUB_CLAUSE_TYPES : AGENT_CLAUSE_TYPES
  const [athleteId, setAthleteId] = useState('')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractId, setContractId] = useState('')
  const [clauseType, setClauseType] = useState<ClauseType>(isClube ? 'TRANSFER_FEE_FIXO' : 'INTERMEDIACAO')
  const [direction, setDirection] = useState<LiabilityDirection>('A_PAGAR')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState<Currency>(isClube ? 'EUR' : 'BRL')
  const [lines, setLines] = useState<FlowLine[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!athleteId) return
    let alive = true
    fetchAthleteContracts(athleteId).then(cs => { if (alive) setContracts(cs) })
    return () => { alive = false }
  }, [athleteId])

  // Trocar de atleta descarta o vínculo escolhido (ele pertence ao atleta anterior).
  function chooseAthlete(nextId: string) {
    setAthleteId(nextId)
    setContractId('')
    if (!nextId) setContracts([])
  }

  const valid = lines.filter(l => l.due_date && l.value > 0)
  const total = valid.reduce((s, l) => s + l.value, 0)
  const canSave = !!athleteId && valid.length > 0 && !saving
  const sortedAthletes = [...athletes].sort((a, b) =>
    (a.short_name || a.full_name).localeCompare(b.short_name || b.full_name))

  async function save() {
    if (!canSave) return
    setSaving(true); setError(null)
    try {
      const payable = direction === 'A_PAGAR'
      const sorted = [...valid].sort((a, b) => a.due_date.localeCompare(b.due_date))
      const clause = await createClause(contractId || null, athleteId, {
        clause_type: clauseType,
        description: description.trim() || `${CLAUSE_TYPE_LABELS[clauseType]} — ${entityName}`,
        creditor_party: payable ? entityName : 'Botafogo SAF',
        debtor_party: payable ? 'Botafogo SAF' : entityName,
        currency,
        original_value: total,
        percentage_value: null,
        condition_description: '',
        due_date: sorted[0]?.due_date || todayISO(),
        installments_total: sorted.length,
        notes: '',
      })
      if (sorted.length > 0) {
        await createClauseInstallments(clause.id, athleteId, sorted.map((l, i) => ({
          installment_number: i + 1, due_date: l.due_date, original_value: l.value, currency,
        })))
      }
      onSaved(clause.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Nova obrigação" width={700} onClose={onClose}
      subtitle={`contraparte: ${entityName}`}
      footer={<>
        {error && <span style={{ marginRight: 'auto', color: 'var(--neg)', fontSize: 12, fontFamily: font }}>{error}</span>}
        <button onClick={onClose} className="btn btn-outline">Cancelar</button>
        <button onClick={save} className="btn btn-primary" disabled={!canSave}>
          {saving ? 'Salvando…' : `Criar com ${valid.length} parcela${valid.length === 1 ? '' : 's'}`}
        </button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={modalLabel}>Atleta *</label>
          <select style={modalInput} value={athleteId} onChange={e => chooseAthlete(e.target.value)}>
            <option value="">— selecione o atleta —</option>
            {sortedAthletes.map(a => <option key={a.id} value={a.id}>{a.short_name || a.full_name}</option>)}
          </select>
        </div>
        <div>
          <label style={modalLabel}>Vínculo do atleta (opcional)</label>
          <select style={modalInput} value={contractId} onChange={e => setContractId(e.target.value)} disabled={!athleteId || contracts.length === 0}>
            <option value="">
              {!athleteId ? '— escolha o atleta primeiro —' : contracts.length === 0 ? '— sem vínculos cadastrados —' : '— nenhum (obrigação independente) —'}
            </option>
            {contracts.map(c => <option key={c.id} value={c.id}>{contractLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label style={modalLabel}>Natureza</label>
          <select style={modalInput} value={clauseType} onChange={e => setClauseType(e.target.value as ClauseType)}>
            {types.map(t => <option key={t} value={t}>{CLAUSE_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={modalLabel}>Direção</label>
          <select style={modalInput} value={direction} onChange={e => setDirection(e.target.value as LiabilityDirection)}>
            <option value="A_PAGAR">Botafogo paga (a pagar)</option>
            <option value="A_RECEBER">Botafogo recebe (a receber)</option>
          </select>
        </div>
      </div>
      <div>
        <label style={modalLabel}>Descrição</label>
        <input style={modalInput} value={description} onChange={e => setDescription(e.target.value)}
          placeholder={`${CLAUSE_TYPE_LABELS[clauseType]} — ${entityName}`} />
      </div>
      <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 14 }}>
        <FlowBuilder currency={currency} onCurrencyChange={setCurrency} lines={lines} onChange={setLines}
          seedRows={4} title="Fluxo de parcelas" />
      </div>
    </ModalShell>
  )
}
