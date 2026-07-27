// src/pages/PageWizard.tsx
// Assistente de criação — a "esteira" completa em 4 passos, do zero à obrigação
// com fluxo de parcelas lançado:
//
//   1 · O QUE      → natureza (compra, venda, empréstimo, salário, imagem, luvas,
//                    agente, bônus, solidariedade, sell-on, rescisória...)
//   2 · QUEM       → atleta (pode ser criado aqui) + contraparte (clube/agente,
//                    também criável na hora) + direção + vínculo/datas
//   3 · QUANTO     → fluxo de parcelas (abre com 4 linhas; gerador opcional)
//   4 · REVISÃO    → confere e cria
//
// Movimentações criam contrato + cláusula de transferência; fluxos criam uma
// cláusula (opcionalmente ligada a um contrato) — ambos com as parcelas do fluxo.
// No fim, abre a página da obrigação criada, já amarrada a atleta e vínculo.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAthletes, fetchAthleteContracts, createAthlete, createContract, createClause, createClauseInstallments,
} from '../lib/athleteQueries'
import type {
  Athlete, Contract, Currency, ClauseType, ContractType, ContractStatus,
} from '../types/athlete-system'
import { CONTRACT_TYPE_LABELS } from '../types/athlete-system'
import { todayISO, fmtDate, fmtCurrencyShort } from '../lib/format'
import FlowBuilder, { type FlowLine } from '../components/FlowBuilder'
import EntityPicker from '../components/EntityPicker'
import PageHero from '../components/PageHero'
import { Icon } from '../components/Icon'

const font = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"

type BenefKind = 'atleta' | 'clube' | 'agente' | 'livre'
type Dir = 'A_PAGAR' | 'A_RECEBER'

interface Nature {
  key: string
  label: string
  hint: string
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
  { key: 'COMPRA',    label: 'Compra de atleta',     hint: 'Cria o vínculo de entrada e as parcelas da transferência', group: 'Movimentações', isMovement: true, clauseType: 'TRANSFER_FEE_FIXO', contractType: 'ENTRADA',            direction: 'A_PAGAR',   benef: 'clube' },
  { key: 'VENDA',     label: 'Venda de atleta',      hint: 'Cria o vínculo de saída e as parcelas a receber',           group: 'Movimentações', isMovement: true, clauseType: 'TRANSFER_FEE_FIXO', contractType: 'SAIDA',              direction: 'A_RECEBER', benef: 'clube' },
  { key: 'EMP_ENTRA', label: 'Empréstimo (entrada)', hint: 'Atleta chega por empréstimo — taxa a pagar',                group: 'Movimentações', isMovement: true, clauseType: 'EMPRESTIMO_TAXA',   contractType: 'EMPRESTIMO_ENTRADA', direction: 'A_PAGAR',   benef: 'clube' },
  { key: 'EMP_SAI',   label: 'Empréstimo (saída)',   hint: 'Atleta sai por empréstimo — taxa a receber',                group: 'Movimentações', isMovement: true, clauseType: 'EMPRESTIMO_TAXA',   contractType: 'EMPRESTIMO_SAIDA',   direction: 'A_RECEBER', benef: 'clube' },
  // Fluxos de remuneração / obrigações (criam cláusula)
  { key: 'SALARIO',   label: 'Salário CLT',          hint: 'Folha mensal do atleta (venc. dia 5)',      group: 'Remuneração', isMovement: false, clauseType: 'SALARIO_CETD',      direction: 'A_PAGAR', benef: 'atleta', dueDay: 5 },
  { key: 'IMAGEM',    label: 'Direito de imagem',    hint: 'Parcela mensal da PJ do atleta (venc. dia 20)', group: 'Remuneração', isMovement: false, clauseType: 'DIREITO_IMAGEM', direction: 'A_PAGAR', benef: 'atleta', dueDay: 20 },
  { key: 'LUVAS',     label: 'Luvas',                hint: 'Bônus de assinatura, normalmente parcelado', group: 'Remuneração', isMovement: false, clauseType: 'LUVAS',             direction: 'A_PAGAR', benef: 'atleta' },
  { key: 'BONUS',     label: 'Bônus de performance', hint: 'Metas: gols, jogos, títulos',               group: 'Remuneração', isMovement: false, clauseType: 'BONUS_PERFORMANCE_ATLETA', direction: 'A_PAGAR', benef: 'atleta' },
  { key: 'AGENTE',    label: 'Comissão de agente',   hint: 'Intermediação — vincula o agente ao atleta', group: 'Obrigações', isMovement: false, clauseType: 'INTERMEDIACAO',     direction: 'A_PAGAR', benef: 'agente' },
  { key: 'SOLID',     label: 'Solidariedade FIFA',   hint: 'Repasse a clubes formadores',               group: 'Obrigações', isMovement: false, clauseType: 'SOLIDARIEDADE_FIFA', direction: 'A_PAGAR', benef: 'clube' },
  { key: 'SELL_PAY',  label: 'Sell-on (a pagar)',    hint: '% devido em venda futura do atleta',        group: 'Obrigações', isMovement: false, clauseType: 'SELL_ON_FEE',       direction: 'A_PAGAR', benef: 'clube' },
  { key: 'SELL_REC',  label: 'Sell-on (a receber)',  hint: '% que o Botafogo recebe em venda futura',   group: 'Obrigações', isMovement: false, clauseType: 'SELL_ON_FEE_RECEBER', direction: 'A_RECEBER', benef: 'clube' },
  { key: 'RESC',      label: 'Cláusula rescisória',  hint: 'Multa contratual',                          group: 'Obrigações', isMovement: false, clauseType: 'CLAUSULA_RESCISORIA', direction: 'A_PAGAR', benef: 'clube' },
]

const STEPS = ['O que registrar', 'Quem está envolvido', 'Fluxo de parcelas', 'Revisão']

const card: React.CSSProperties = {
  background: 'var(--cream-card)', border: '1px solid var(--divider)',
  borderRadius: 12, padding: 20, boxShadow: 'var(--shadow-hair)',
}
const lbl: React.CSSProperties = {
  fontFamily: mono, fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--text-muted)', display: 'block', marginBottom: 5,
}
const input: React.CSSProperties = {
  width: '100%', background: 'var(--cream-card)', border: '1px solid var(--input-border)',
  borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box',
}
const sectionTitle: React.CSSProperties = {
  fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--ink-secondary)',
}
const hint: React.CSSProperties = { fontFamily: font, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }

export default function PageWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [athleteId, setAthleteId] = useState('')
  const [athleteQuery, setAthleteQuery] = useState('')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [creatingAth, setCreatingAth] = useState(false)
  const [newAth, setNewAth] = useState({ full_name: '', position: '' })
  const [savingAth, setSavingAth] = useState(false)

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

  // Ao escolher natureza, aplica direção/beneficiário/moeda padrão e avança.
  function pickNature(n: Nature) {
    setNatureKey(n.key)
    setDirection(n.direction)
    const ath = athletes.find(a => a.id === athleteId)
    setBeneficiary(n.benef === 'atleta' && ath ? ath.full_name : '')
    setCurrency(n.benef === 'atleta' ? 'BRL' : 'EUR')
    setStep(1)
  }

  const athlete = athletes.find(a => a.id === athleteId) || null
  const linked = contracts.find(c => c.id === linkContractId) || null

  // Seleciona atleta; se a natureza paga ao próprio atleta, prefill do beneficiário.
  function pickAthlete(a: Athlete) {
    setAthleteId(a.id)
    if (nature?.benef === 'atleta') setBeneficiary(a.full_name)
    fetchAthleteContracts(a.id).then(setContracts)
  }

  async function createNewAthlete() {
    const full = newAth.full_name.trim()
    if (!full) return
    setSavingAth(true)
    try {
      const a = await createAthlete({
        full_name: full, short_name: full.split(' ')[0],
        position: newAth.position || null, current_status: 'ATIVO',
        birth_date: null, nationality: null, cpf: null, passport_number: null,
        agent_name: null, agent_contact: null, profile_photo_url: null, notes: null,
      })
      setAthletes(prev => [...prev, a].sort((x, y) => x.full_name.localeCompare(y.full_name)))
      setCreatingAth(false); setNewAth({ full_name: '', position: '' })
      pickAthlete(a)
    } finally { setSavingAth(false) }
  }

  const valid = lines.filter(l => l.due_date && l.value > 0)
  const total = valid.reduce((s, l) => s + l.value, 0)
  const filteredAthletes = athletes.filter(a =>
    !athleteQuery || a.full_name.toLowerCase().includes(athleteQuery.toLowerCase()))

  // Validação por passo, com a razão explícita (mostrada ao lado do botão).
  function blockedReason(): string | null {
    switch (step) {
      case 0: return nature ? null : 'Escolha o que você quer registrar.'
      case 1:
        if (!athleteId) return 'Selecione (ou crie) o atleta.'
        if (!beneficiary.trim()) return nature?.benef === 'atleta' ? 'Informe o beneficiário.' : 'Informe a contraparte.'
        if (nature?.isMovement && !startDate) return 'Informe a data de início do vínculo.'
        return null
      case 2: return valid.length > 0 ? null : 'Lance ao menos uma parcela com data e valor.'
      default: return null
    }
  }
  const blocked = blockedReason()

  async function handleSave() {
    if (!nature || !athleteId || valid.length === 0) return
    setSaving(true); setError(null)
    try {
      const isPay = direction === 'A_PAGAR'
      const creditor = isPay ? beneficiary : 'Botafogo SAF'
      const debtor = isPay ? 'Botafogo SAF' : beneficiary
      const desc = description.trim() || `${nature.label}${beneficiary ? ` — ${beneficiary}` : ''}`
      const sorted = [...valid].sort((a, b) => a.due_date.localeCompare(b.due_date))
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
      navigate(`/obrigacoes/${clause.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const groups = Array.from(new Set(NATURES.map(n => n.group)))

  return (
    <div style={{ padding: '26px 30px', maxWidth: 940, margin: '0 auto' }}>
      <PageHero title="O que você quer registrar?" subtitle="Assistente de criação · Botafogo SAF" />

      {/* Passos */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {STEPS.map((s, i) => {
          const active = i === step
          const done = i < step
          return (
            <button key={s} onClick={() => done && setStep(i)} disabled={!done && !active}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 20,
                background: active ? 'var(--accent)' : done ? 'var(--accent-tint2)' : 'transparent',
                border: `1px solid ${active || done ? 'var(--divider-strong)' : 'var(--divider)'}`,
                cursor: done ? 'pointer' : 'default',
              }}>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: active ? 'var(--accent-on)' : done ? 'var(--ink-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                {done ? <Icon name="check" size={12} /> : i + 1}
              </span>
              <span style={{ fontFamily: font, fontSize: 11.5, fontWeight: active ? 700 : 500, color: active ? 'var(--accent-on)' : done ? 'var(--ink-primary)' : 'var(--text-muted)' }}>{s}</span>
            </button>
          )
        })}
      </div>

      {/* Resumo das escolhas — mantém o contexto visível em todos os passos */}
      {nature && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <Pill label="Natureza" value={nature.label} />
          {athlete && <Pill label="Atleta" value={athlete.short_name || athlete.full_name} />}
          {beneficiary && <Pill label={direction === 'A_PAGAR' ? 'Pago a' : 'Recebido de'} value={beneficiary} />}
          {linked && <Pill label="Vínculo" value={`${CONTRACT_TYPE_LABELS[linked.type]} · ${linked.counterpart_club || '—'}`} />}
          {valid.length > 0 && <Pill label="Fluxo" value={`${valid.length}x · ${fmtCurrencyShort(total, currency)}`} />}
        </div>
      )}

      {/* 1 — Natureza */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map(g => (
            <div key={g} style={card}>
              <div style={{ ...sectionTitle, marginBottom: 12 }}>{g}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {NATURES.filter(n => n.group === g).map(n => (
                  <button key={n.key} onClick={() => pickNature(n)}
                    style={{
                      textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: font,
                      background: natureKey === n.key ? 'var(--accent-tint2)' : 'transparent',
                      border: `1px solid ${natureKey === n.key ? 'var(--accent)' : 'var(--divider-strong)'}`,
                    }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-primary)' }}>{n.label}</div>
                    <div style={{ fontFamily: font, fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>{n.hint}</div>
                    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 6 }}>
                      {n.direction === 'A_PAGAR' ? 'a pagar' : 'a receber'}{n.isMovement ? ' · cria vínculo' : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2 — Atleta + contraparte + vínculo (tudo numa tela) */}
      {step === 1 && nature && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Atleta */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
              <div style={sectionTitle}>Atleta {athlete ? '' : '*'}</div>
              <button onClick={() => setCreatingAth(v => !v)} className="btn btn-outline">
                <Icon name={creatingAth ? 'x' : 'plus'} size={14} /> {creatingAth ? 'Cancelar' : 'Novo atleta'}
              </button>
            </div>

            {creatingAth && (
              <div style={{ padding: 14, borderRadius: 9, border: '1px solid var(--divider)', background: 'var(--bg-subtle)', marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                  <div>
                    <label style={lbl}>Nome completo *</label>
                    <input style={input} autoFocus value={newAth.full_name} onChange={e => setNewAth(p => ({ ...p, full_name: e.target.value }))} placeholder="Ex: João da Silva Santos" />
                  </div>
                  <div>
                    <label style={lbl}>Posição</label>
                    <input style={input} value={newAth.position} onChange={e => setNewAth(p => ({ ...p, position: e.target.value }))} placeholder="Ex: Atacante" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={createNewAthlete} disabled={!newAth.full_name.trim() || savingAth} className="btn btn-primary">
                    {savingAth ? 'Criando...' : 'Criar e selecionar'}
                  </button>
                  <span style={hint}>Os demais dados você completa depois na ficha do atleta.</span>
                </div>
              </div>
            )}

            {athlete && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--accent-tint)', border: '1px solid var(--divider-strong)' }}>
                <Icon name="check" size={14} />
                <span style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: 'var(--ink-primary)' }}>{athlete.full_name}</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-muted)' }}>· {athlete.position || 'posição não informada'}</span>
                <button onClick={() => { setAthleteId(''); setContracts([]); setLinkContractId('') }} className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '4px 10px' }}>Trocar</button>
              </div>
            )}

            {!athlete && (<>
              <input style={{ ...input, marginBottom: 10 }} placeholder="Buscar atleta..." value={athleteQuery} onChange={e => setAthleteQuery(e.target.value)} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {filteredAthletes.map(a => (
                  <button key={a.id} onClick={() => pickAthlete(a)}
                    style={{
                      textAlign: 'left', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: font, fontSize: 13,
                      background: 'transparent', border: '1px solid var(--divider)', color: 'var(--ink-primary)',
                    }}>
                    {a.full_name} <span style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-muted)' }}>· {a.position || '—'}</span>
                  </button>
                ))}
                {filteredAthletes.length === 0 && <div style={hint}>Nenhum atleta encontrado. Use “Novo atleta” acima.</div>}
              </div>
            </>)}
          </div>

          {/* Contraparte + direção */}
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={sectionTitle}>Contraparte e direção</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Direção</label>
                <select style={input} value={direction} onChange={e => setDirection(e.target.value as Dir)}>
                  <option value="A_PAGAR">Botafogo paga (a pagar)</option>
                  <option value="A_RECEBER">Botafogo recebe (a receber)</option>
                </select>
              </div>
              <div>
                {nature.benef === 'clube' ? (
                  <EntityPicker kind="clube" label={direction === 'A_PAGAR' ? 'Clube (pago a) *' : 'Clube (recebido de) *'} value={beneficiary} onChange={(name, sub) => { setBeneficiary(name); if (sub) setCountry(sub) }} />
                ) : nature.benef === 'agente' ? (
                  <EntityPicker kind="intermediario" label="Agente *" value={beneficiary} onChange={name => setBeneficiary(name)} />
                ) : (
                  <>
                    <label style={lbl}>{direction === 'A_PAGAR' ? 'Pago a *' : 'Recebido de *'}</label>
                    <input style={input} value={beneficiary} onChange={e => setBeneficiary(e.target.value)} placeholder="Nome do beneficiário" />
                  </>
                )}
              </div>
            </div>

            {nature.isMovement ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>País da contraparte</label><input style={input} value={country} onChange={e => setCountry(e.target.value)} placeholder="Ex: Espanha" /></div>
                <div><label style={lbl}>Início do vínculo *</label><input style={input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                <div><label style={lbl}>Término</label><input style={input} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
              </div>
            ) : (
              <div>
                <label style={lbl}>Vincular a uma transação do atleta (opcional)</label>
                <select style={input} value={linkContractId} onChange={e => setLinkContractId(e.target.value)} disabled={!athleteId || contracts.length === 0}>
                  <option value="">
                    {!athleteId ? '— escolha o atleta primeiro —' : contracts.length === 0 ? '— sem vínculos cadastrados —' : '— não vinculado —'}
                  </option>
                  {contracts.map(c => (
                    <option key={c.id} value={c.id}>
                      {CONTRACT_TYPE_LABELS[c.type]} · {c.counterpart_club || '—'} · {fmtDate(c.start_date)}
                    </option>
                  ))}
                </select>
                <div style={{ ...hint, marginTop: 6 }}>
                  Vincular liga este fluxo ao contrato de compra/venda — é o que amarra agentes, luvas e cláusulas ao vínculo do atleta.
                </div>
              </div>
            )}

            <div>
              <label style={lbl}>Descrição (opcional)</label>
              <input style={input} value={description} onChange={e => setDescription(e.target.value)} placeholder={`${nature.label}${beneficiary ? ` — ${beneficiary}` : ''}`} />
            </div>
          </div>
        </div>
      )}

      {/* 3 — Fluxo */}
      {step === 2 && nature && (
        <div style={card}>
          <div style={{ ...sectionTitle, marginBottom: 4 }}>Fluxo de parcelas</div>
          <div style={{ ...hint, marginBottom: 14 }}>
            Lance cada vencimento e valor. Precisa de muitas parcelas iguais? Use “Gerar automaticamente”.
          </div>
          <FlowBuilder
            currency={currency} onCurrencyChange={setCurrency}
            lines={lines} onChange={setLines}
            defaultDueDay={nature.dueDay ?? null} defaultFirst={startDate}
            seedRows={4}
          />
        </div>
      )}

      {/* 4 — Revisão */}
      {step === 3 && nature && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: font, fontSize: 13, color: 'var(--ink-primary)' }}>
            <div style={{ ...sectionTitle, marginBottom: 6 }}>Confira antes de criar</div>
            <Row k="Natureza" v={nature.label} />
            <Row k="Atleta" v={athlete?.full_name || '—'} />
            <Row k="Direção" v={direction === 'A_PAGAR' ? 'A pagar (Botafogo paga)' : 'A receber (Botafogo recebe)'} />
            <Row k={direction === 'A_PAGAR' ? 'Pago a' : 'Recebido de'} v={beneficiary || '—'} />
            {nature.isMovement
              ? <Row k="Vínculo criado" v={`${CONTRACT_TYPE_LABELS[nature.contractType!]} · ${fmtDate(startDate)}${endDate ? ` → ${fmtDate(endDate)}` : ''}`} />
              : <Row k="Transação" v={linked ? `${CONTRACT_TYPE_LABELS[linked.type]} · ${linked.counterpart_club}` : 'Não vinculado'} />}
            <Row k="Fluxo" v={`${valid.length} parcela(s) · total ${fmtCurrencyShort(total, currency)}`} />
            <Row k="1º vencimento" v={valid.length ? fmtDate([...valid].sort((a, b) => a.due_date.localeCompare(b.due_date))[0].due_date) : '—'} />
            {error && <div style={{ marginTop: 8, color: 'var(--neg)', fontSize: 13 }}>{error}</div>}
          </div>
          <div className="card" style={{ padding: '14px 18px', overflow: 'hidden' }}>
            <div style={{ ...sectionTitle, marginBottom: 10 }}>Parcelas</div>
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...valid].sort((a, b) => a.due_date.localeCompare(b.due_date)).map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr', gap: 10, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-muted)' }}>{i + 1}</span>
                  <span style={{ fontFamily: mono, fontSize: 12 }}>{fmtDate(l.due_date)}</span>
                  <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{fmtCurrencyShort(l.value, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navegação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => step === 0 ? navigate(-1) : setStep(s => s - 1)} className="btn btn-outline">
          {step === 0 ? 'Cancelar' : '← Voltar'}
        </button>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {blocked && <span style={hint}>{blocked}</span>}
          {step < 3 ? (
            <button onClick={() => !blocked && setStep(s => s + 1)} disabled={!!blocked} className="btn btn-primary">Próximo →</button>
          ) : (
            <button onClick={handleSave} disabled={saving || valid.length === 0} className="btn btn-primary">
              {saving ? 'Criando...' : 'Criar e abrir obrigação'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
      <span style={{ color: 'var(--text-muted)', fontFamily: mono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k}</span>
      <span>{v}</span>
    </div>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7,
      background: 'var(--bg-subtle)', border: '1px solid var(--divider)', maxWidth: 320,
    }}>
      <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: 'var(--ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </span>
  )
}
