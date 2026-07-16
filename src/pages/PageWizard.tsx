// src/pages/PageWizard.tsx
// Assistente (wizard) genérico de criação. Guia o usuário por:
//   I.   Natureza (compra, venda, empréstimo, salário, imagem, luvas, agente,
//        bônus, solidariedade, sell-on, rescisória...)
//   II.  Atleta
//   III. Beneficiário / direção (pago a quem, ou de quem se recebe)
//   IV.  Fluxo de pagamento (regular OU linhas manuais/irregulares)
//   V.   Vínculo com transação existente (para fluxos)
//   VI.  Revisão e gravação
// Movimentações criam contrato + cláusula de transferência; fluxos criam uma
// cláusula (opcionalmente ligada a um contrato) — ambos com parcelas do fluxo.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAthletes, fetchAthleteContracts, createContract, createClause, createClauseInstallments,
} from '../lib/athleteQueries'
import type {
  Athlete, Contract, Currency, ClauseType, ContractType, ContractStatus,
} from '../types/athlete-system'
import { CONTRACT_TYPE_LABELS } from '../types/athlete-system'
import { todayISO } from '../lib/format'
import FlowBuilder, { type FlowLine } from '../components/FlowBuilder'
import EntityPicker from '../components/EntityPicker'

const font = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"

type BenefKind = 'atleta' | 'clube' | 'agente' | 'livre'
type Dir = 'A_PAGAR' | 'A_RECEBER'

interface Nature {
  key: string
  label: string
  group: string
  isMovement: boolean
  clauseType: ClauseType
  contractType?: ContractType
  direction: Dir
  benef: BenefKind
  dueDay?: number
}

const NATURES: Nature[] = [
  // Movimentações de atleta (criam contrato/vínculo)
  { key: 'COMPRA',    label: 'Compra de atleta',     group: 'Movimentações', isMovement: true, clauseType: 'TRANSFER_FEE_FIXO', contractType: 'ENTRADA',            direction: 'A_PAGAR',   benef: 'clube' },
  { key: 'VENDA',     label: 'Venda de atleta',      group: 'Movimentações', isMovement: true, clauseType: 'TRANSFER_FEE_FIXO', contractType: 'SAIDA',              direction: 'A_RECEBER', benef: 'clube' },
  { key: 'EMP_ENTRA', label: 'Empréstimo (entrada)', group: 'Movimentações', isMovement: true, clauseType: 'EMPRESTIMO_TAXA',   contractType: 'EMPRESTIMO_ENTRADA', direction: 'A_PAGAR',   benef: 'clube' },
  { key: 'EMP_SAI',   label: 'Empréstimo (saída)',   group: 'Movimentações', isMovement: true, clauseType: 'EMPRESTIMO_TAXA',   contractType: 'EMPRESTIMO_SAIDA',   direction: 'A_RECEBER', benef: 'clube' },
  // Fluxos de remuneração / obrigações (criam cláusula)
  { key: 'SALARIO',   label: 'Salário CLT',          group: 'Remuneração',   isMovement: false, clauseType: 'SALARIO_CETD',      direction: 'A_PAGAR', benef: 'atleta', dueDay: 5 },
  { key: 'IMAGEM',    label: 'Direito de imagem',    group: 'Remuneração',   isMovement: false, clauseType: 'DIREITO_IMAGEM',    direction: 'A_PAGAR', benef: 'atleta', dueDay: 20 },
  { key: 'LUVAS',     label: 'Luvas',                group: 'Remuneração',   isMovement: false, clauseType: 'LUVAS',             direction: 'A_PAGAR', benef: 'atleta' },
  { key: 'BONUS',     label: 'Bônus de performance', group: 'Remuneração',   isMovement: false, clauseType: 'BONUS_PERFORMANCE_ATLETA', direction: 'A_PAGAR', benef: 'atleta' },
  { key: 'AGENTE',    label: 'Comissão de agente',   group: 'Obrigações',    isMovement: false, clauseType: 'INTERMEDIACAO',     direction: 'A_PAGAR', benef: 'agente' },
  { key: 'SOLID',     label: 'Solidariedade FIFA',   group: 'Obrigações',    isMovement: false, clauseType: 'SOLIDARIEDADE_FIFA', direction: 'A_PAGAR', benef: 'clube' },
  { key: 'SELL_PAY',  label: 'Sell-on (a pagar)',    group: 'Obrigações',    isMovement: false, clauseType: 'SELL_ON_FEE',       direction: 'A_PAGAR', benef: 'clube' },
  { key: 'SELL_REC',  label: 'Sell-on (a receber)',  group: 'Obrigações',    isMovement: false, clauseType: 'SELL_ON_FEE_RECEBER', direction: 'A_RECEBER', benef: 'clube' },
  { key: 'RESC',      label: 'Cláusula rescisória',  group: 'Obrigações',    isMovement: false, clauseType: 'CLAUSULA_RESCISORIA', direction: 'A_PAGAR', benef: 'clube' },
]

const STEPS = ['Natureza', 'Atleta', 'Beneficiário', 'Fluxo', 'Vínculo', 'Revisão']

const card: React.CSSProperties = {
  background: 'var(--surface, rgba(255,255,255,0.6))', border: '1px solid var(--divider, rgba(190,140,74,0.18))',
  borderRadius: 12, padding: 22,
}
const lbl: React.CSSProperties = {
  fontFamily: mono, fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--text-muted, rgba(26,20,16,0.5))', display: 'block', marginBottom: 5,
}
const input: React.CSSProperties = {
  width: '100%', background: 'var(--surface, #fff)', border: '1px solid var(--divider-strong, rgba(26,20,16,0.15))',
  borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--ink-primary, #1a1410)', fontFamily: font, boxSizing: 'border-box',
}

export default function PageWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [athleteId, setAthleteId] = useState('')
  const [athleteQuery, setAthleteQuery] = useState('')
  const [contracts, setContracts] = useState<Contract[]>([])

  const [natureKey, setNatureKey] = useState('')
  const nature = NATURES.find(n => n.key === natureKey) || null

  const [direction, setDirection] = useState<Dir>('A_PAGAR')
  const [beneficiary, setBeneficiary] = useState('')
  const [country, setCountry] = useState('')

  const [currency, setCurrency] = useState<Currency>('BRL')
  const [lines, setLines] = useState<FlowLine[]>([])

  // Movimentação: datas do contrato. Fluxo: vínculo com contrato existente.
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState('')
  const [linkContractId, setLinkContractId] = useState('')

  const [description, setDescription] = useState('')

  useEffect(() => { fetchAthletes().then(setAthletes) }, [])

  // Ao escolher natureza, aplica direção/beneficiário padrão.
  function pickNature(n: Nature) {
    setNatureKey(n.key)
    setDirection(n.direction)
    const ath = athletes.find(a => a.id === athleteId)
    setBeneficiary(n.benef === 'atleta' && ath ? ath.full_name : '')
    setStep(1)
  }

  const athlete = athletes.find(a => a.id === athleteId) || null

  // Seleciona atleta; se a natureza paga ao próprio atleta, prefill do beneficiário.
  function pickAthlete(a: Athlete) {
    setAthleteId(a.id)
    if (nature?.benef === 'atleta') setBeneficiary(a.full_name)
    fetchAthleteContracts(a.id).then(setContracts)
  }

  const total = lines.reduce((s, l) => s + (l.value || 0), 0)
  const filteredAthletes = athletes.filter(a =>
    !athleteQuery || a.full_name.toLowerCase().includes(athleteQuery.toLowerCase()))

  function canNext(): boolean {
    switch (step) {
      case 0: return !!nature
      case 1: return !!athleteId
      case 2: return !!beneficiary.trim()
      case 3: return lines.length > 0 && (!nature?.isMovement || (!!startDate))
      case 4: return true
      default: return true
    }
  }

  async function handleSave() {
    if (!nature || !athleteId) return
    setSaving(true); setError(null)
    try {
      const isPay = direction === 'A_PAGAR'
      const creditor = isPay ? beneficiary : 'Botafogo SAF'
      const debtor = isPay ? 'Botafogo SAF' : beneficiary
      const desc = description.trim() || `${nature.label}${beneficiary ? ` — ${beneficiary}` : ''}`
      const sorted = [...lines].sort((a, b) => a.due_date.localeCompare(b.due_date))
      const firstDue = sorted[0]?.due_date || todayISO()

      let contractId: string | null = linkContractId || null

      // Movimentação → cria o contrato/vínculo.
      if (nature.isMovement && nature.contractType) {
        const c = await createContract(athleteId, {
          type: nature.contractType,
          counterpart_club: beneficiary,
          counterpart_country: country,
          start_date: startDate,
          end_date: endDate,
          status: 'ATIVO' as ContractStatus,
          transfer_fee_gross: total,
          transfer_currency: currency,
          base_salary: null, salary_currency: 'BRL',
          image_value: null, other_value: null,
          description: desc,
        })
        contractId = c.id
      }

      const clause = await createClause(contractId, athleteId, {
        clause_type: nature.clauseType,
        description: desc,
        creditor_party: creditor,
        debtor_party: debtor,
        currency,
        original_value: total,
        percentage_value: null,
        condition_description: '',
        due_date: firstDue,
        installments_total: sorted.length,
        notes: '',
      })
      if (sorted.length > 1) {
        await createClauseInstallments(clause.id, athleteId, sorted.map((l, i) => ({
          installment_number: i + 1, due_date: l.due_date, original_value: l.value, currency,
        })))
      }
      navigate(`/atletas/${athleteId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const groups = Array.from(new Set(NATURES.map(n => n.group)))

  return (
    <div style={{ padding: '28px 32px', maxWidth: 920, margin: '0 auto' }}>
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 6 }}>Assistente de criação</div>
      <h1 style={{ fontFamily: font, fontSize: 24, fontWeight: 700, color: 'var(--ink-primary)', margin: '0 0 4px' }}>O que você quer registrar?</h1>
      <div style={{ height: 2, width: 38, background: 'var(--gold)', borderRadius: 2, marginBottom: 20 }} />

      {/* Passos */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
        {STEPS.map((s, i) => (
          <div key={s} onClick={() => i < step && setStep(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 20,
              background: i === step ? 'var(--gold)' : i < step ? 'var(--gold-tint, rgba(190,140,74,0.15))' : 'transparent',
              border: `1px solid ${i <= step ? 'rgba(190,140,74,0.4)' : 'var(--divider-strong, rgba(26,20,16,0.12))'}`,
              cursor: i < step ? 'pointer' : 'default',
            }}>
            <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: i === step ? '#fff' : i < step ? '#be8c4a' : 'var(--text-muted)' }}>{i + 1}</span>
            <span style={{ fontFamily: font, fontSize: 11, fontWeight: i === step ? 700 : 500, color: i === step ? '#fff' : 'var(--text-secondary)' }}>{s}</span>
          </div>
        ))}
      </div>

      {/* I — Natureza */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groups.map(g => (
            <div key={g} style={card}>
              <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#be8c4a', marginBottom: 12 }}>{g}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {NATURES.filter(n => n.group === g).map(n => (
                  <button key={n.key} onClick={() => pickNature(n)}
                    style={{
                      textAlign: 'left', padding: '12px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: font,
                      background: natureKey === n.key ? 'var(--gold-tint, rgba(190,140,74,0.15))' : 'transparent',
                      border: `1px solid ${natureKey === n.key ? 'rgba(190,140,74,0.5)' : 'var(--divider-strong, rgba(26,20,16,0.12))'}`,
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-primary)' }}>{n.label}</div>
                    <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>{n.direction === 'A_PAGAR' ? 'a pagar' : 'a receber'}{n.isMovement ? ' · cria vínculo' : ''}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* II — Atleta */}
      {step === 1 && (
        <div style={card}>
          <label style={lbl}>Atleta</label>
          <input style={{ ...input, marginBottom: 10 }} placeholder="Buscar atleta..." value={athleteQuery} onChange={e => setAthleteQuery(e.target.value)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
            {filteredAthletes.map(a => (
              <button key={a.id} onClick={() => pickAthlete(a)}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: font, fontSize: 13,
                  background: athleteId === a.id ? 'var(--gold-tint, rgba(190,140,74,0.15))' : 'transparent',
                  border: `1px solid ${athleteId === a.id ? 'rgba(190,140,74,0.5)' : 'var(--divider-strong, rgba(26,20,16,0.1))'}`,
                  color: 'var(--ink-primary)',
                }}>
                {a.full_name} <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-muted)' }}>· {a.position || '—'}</span>
              </button>
            ))}
            {filteredAthletes.length === 0 && <div style={{ fontFamily: mono, fontSize: 12, color: 'var(--text-muted)' }}>Nenhum atleta encontrado.</div>}
          </div>
        </div>
      )}

      {/* III — Beneficiário / direção */}
      {step === 2 && nature && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lbl}>Direção</label>
            <select style={input} value={direction} onChange={e => setDirection(e.target.value as Dir)}>
              <option value="A_PAGAR">Botafogo paga (a pagar)</option>
              <option value="A_RECEBER">Botafogo recebe (a receber)</option>
            </select>
          </div>
          <div>
            <label style={lbl}>{direction === 'A_PAGAR' ? 'Pago a quem?' : 'Recebido de quem?'}</label>
            {nature.benef === 'clube' ? (
              <EntityPicker kind="clube" label="" value={beneficiary} onChange={(name, sub) => { setBeneficiary(name); if (sub) setCountry(sub) }} />
            ) : nature.benef === 'agente' ? (
              <EntityPicker kind="intermediario" label="" value={beneficiary} onChange={name => setBeneficiary(name)} />
            ) : (
              <input style={input} value={beneficiary} onChange={e => setBeneficiary(e.target.value)} placeholder="Nome do beneficiário" />
            )}
          </div>
          <div>
            <label style={lbl}>Descrição (opcional)</label>
            <input style={input} value={description} onChange={e => setDescription(e.target.value)} placeholder={`${nature.label}${beneficiary ? ` — ${beneficiary}` : ''}`} />
          </div>
        </div>
      )}

      {/* IV — Fluxo */}
      {step === 3 && nature && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {nature.isMovement && (
            <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>País da contraparte</label><input style={input} value={country} onChange={e => setCountry(e.target.value)} placeholder="Ex: Espanha" /></div>
              <div><label style={lbl}>Início do vínculo</label><input style={input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
              <div><label style={lbl}>Término</label><input style={input} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            </div>
          )}
          <div style={card}>
            <FlowBuilder
              currency={currency} onCurrencyChange={setCurrency}
              lines={lines} onChange={setLines}
              defaultDueDay={nature.dueDay ?? null} defaultFirst={startDate}
            />
          </div>
        </div>
      )}

      {/* V — Vínculo */}
      {step === 4 && nature && (
        <div style={card}>
          {nature.isMovement ? (
            <div style={{ fontFamily: font, fontSize: 13, color: 'var(--text-secondary)' }}>
              Esta natureza <strong>cria um novo vínculo/transação</strong> automaticamente. Nada a vincular aqui.
            </div>
          ) : (
            <>
              <label style={lbl}>Já está vinculado a alguma transação?</label>
              <select style={input} value={linkContractId} onChange={e => setLinkContractId(e.target.value)}>
                <option value="">Não vinculado</option>
                {contracts.map(c => (
                  <option key={c.id} value={c.id}>
                    {CONTRACT_TYPE_LABELS[c.type]} · {c.counterpart_club || '—'} · {c.start_date}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 8, fontFamily: mono, fontSize: 11, color: 'var(--text-muted)' }}>
                Vincular liga este fluxo a um contrato existente do atleta. Deixe "Não vinculado" para um fluxo avulso.
              </div>
            </>
          )}
        </div>
      )}

      {/* VI — Revisão */}
      {step === 5 && nature && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: font, fontSize: 13, color: 'var(--ink-primary)' }}>
          <Row k="Natureza" v={nature.label} />
          <Row k="Atleta" v={athlete?.full_name || '—'} />
          <Row k="Direção" v={direction === 'A_PAGAR' ? 'A pagar (Botafogo paga)' : 'A receber (Botafogo recebe)'} />
          <Row k={direction === 'A_PAGAR' ? 'Pago a' : 'Recebido de'} v={beneficiary || '—'} />
          {nature.isMovement && <Row k="Vínculo" v={`${startDate}${endDate ? ` → ${endDate}` : ''}`} />}
          {!nature.isMovement && <Row k="Transação" v={contracts.find(c => c.id === linkContractId) ? `${CONTRACT_TYPE_LABELS[contracts.find(c => c.id === linkContractId)!.type]} · ${contracts.find(c => c.id === linkContractId)!.counterpart_club}` : 'Não vinculado'} />}
          <Row k="Fluxo" v={`${lines.length} parcela(s) · total ${currency} ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
          {error && <div style={{ marginTop: 8, color: 'var(--neg, #b91c1c)', fontSize: 13 }}>{error}</div>}
        </div>
      )}

      {/* Navegação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button onClick={() => step === 0 ? navigate(-1) : setStep(s => s - 1)}
          style={{ background: 'transparent', border: '1px solid var(--divider-strong, rgba(26,20,16,0.15))', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontFamily: font, cursor: 'pointer', color: 'var(--text-secondary)' }}>
          {step === 0 ? 'Cancelar' : '← Voltar'}
        </button>
        {step < 5 ? (
          <button onClick={() => canNext() && setStep(s => s + 1)} disabled={!canNext()}
            style={{ background: '#be8c4a', border: 'none', borderRadius: 8, padding: '9px 26px', fontSize: 13, fontWeight: 600, fontFamily: font, cursor: canNext() ? 'pointer' : 'default', color: '#fff', opacity: canNext() ? 1 : 0.5 }}>
            Próximo →
          </button>
        ) : (
          <button onClick={handleSave} disabled={saving || lines.length === 0}
            style={{ background: '#be8c4a', border: 'none', borderRadius: 8, padding: '9px 26px', fontSize: 13, fontWeight: 600, fontFamily: font, cursor: 'pointer', color: '#fff', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Criar'}
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
      <span style={{ color: 'var(--text-muted, rgba(26,20,16,0.5))', fontFamily: mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</span>
      <span>{v}</span>
    </div>
  )
}
