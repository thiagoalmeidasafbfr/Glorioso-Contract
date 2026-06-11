import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchAthlete, createContract, createClause, createInstallments } from '../lib/athleteQueries'
import type { Athlete, NewContractInput, NewClauseInput, ContractType, ContractStatus, ClauseType, Currency } from '../types/athlete-system'
import { CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS } from '../types/athlete-system'
import { todayISO } from '../lib/format'

// ── Step types ────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3

// ── Helpers ───────────────────────────────────────────────────────────────

const CURRENCIES: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']
const CONTRACT_TYPES: ContractType[] = ['SAIDA', 'ENTRADA', 'EMPRESTIMO_SAIDA', 'EMPRESTIMO_ENTRADA']
const CLAUSE_TYPES = Object.keys(CLAUSE_TYPE_LABELS) as ClauseType[]

const PAYABLE_CLAUSES: ClauseType[] = [
  'SELL_ON_FEE', 'INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA',
  'SALARIO_CETD', 'DIREITO_IMAGEM', 'LUVAS', 'BONUS_PERFORMANCE_ATLETA',
  'SOLIDARIEDADE_FIFA', 'EMPRESTIMO_TAXA', 'CLAUSULA_RESCISORIA',
]

function isSellOnConflict(clauses: Partial<NewClauseInput>[]): boolean {
  const hasSellOnPay = clauses.some(c => c.clause_type === 'SELL_ON_FEE')
  const hasSellOnReceive = clauses.some(c => c.clause_type === 'SELL_ON_FEE_RECEBER')
  return hasSellOnPay && hasSellOnReceive
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.60)',
  border: '1px solid rgba(26,20,16,0.15)', borderRadius: 7,
  padding: '8px 10px', fontSize: 13, color: '#1a1410',
  fontFamily: "'Inter', system-ui, sans-serif", boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
  fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
  color: 'rgba(26,20,16,0.50)', display: 'block', marginBottom: 4,
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(190,140,74,0.15)',
  borderRadius: 10, padding: 20,
}

// ── Main component ────────────────────────────────────────────────────────

export default function PageAthleteNewContract() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [athlete, setAthlete] = useState<Athlete | null>(null)
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — Contract
  const [contract, setContract] = useState<NewContractInput>({
    type: 'SAIDA',
    counterpart_club: '',
    counterpart_country: '',
    start_date: todayISO(),
    end_date: '',
    transfer_fee_gross: null,
    transfer_currency: 'EUR',
    description: '',
    status: 'ATIVO',
  })

  // Step 2 — Clauses
  const [clauses, setClauses] = useState<Partial<NewClauseInput>[]>([])

  useEffect(() => {
    if (id) fetchAthlete(id).then(setAthlete)
  }, [id])

  // ── Step 1 handlers ──────────────────────────────────────────────────────

  const setContractField = <K extends keyof NewContractInput>(k: K, v: NewContractInput[K]) =>
    setContract(prev => ({ ...prev, [k]: v }))

  const step1Valid = contract.counterpart_club.trim() && contract.start_date

  // ── Step 2 handlers ──────────────────────────────────────────────────────

  function addClause() {
    setClauses(prev => [
      ...prev,
      {
        clause_type: 'TRANSFER_FEE_FIXO',
        description: '',
        creditor_party: 'Botafogo SAF',
        debtor_party: contract.counterpart_club || '',
        currency: contract.transfer_currency,
        original_value: null,
        percentage_value: null,
        condition_description: '',
        due_date: contract.start_date,
        installments_total: 1,
        notes: '',
      },
    ])
  }

  function removeClause(idx: number) {
    setClauses(prev => prev.filter((_, i) => i !== idx))
  }

  function setClauseField<K extends keyof NewClauseInput>(idx: number, k: K, v: NewClauseInput[K]) {
    setClauses(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [k]: v }
      // Auto-swap creditor/debtor when type changes
      if (k === 'clause_type') {
        const t = v as ClauseType
        if (PAYABLE_CLAUSES.includes(t)) {
          next[idx].creditor_party = contract.counterpart_club || 'Contraparte'
          next[idx].debtor_party = 'Botafogo SAF'
        } else {
          next[idx].creditor_party = 'Botafogo SAF'
          next[idx].debtor_party = contract.counterpart_club || 'Contraparte'
        }
      }
      return next
    })
  }

  // ── Step 3 — save ────────────────────────────────────────────────────────

  async function handleSave() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      const savedContract = await createContract(id, contract)
      for (const cl of clauses) {
        if (!cl.clause_type || !cl.description?.trim()) continue
        const full: NewClauseInput = {
          clause_type: cl.clause_type,
          description: cl.description || '',
          creditor_party: cl.creditor_party || 'Botafogo SAF',
          debtor_party: cl.debtor_party || '',
          currency: cl.currency || 'EUR',
          original_value: cl.original_value ?? null,
          percentage_value: cl.percentage_value ?? null,
          condition_description: cl.condition_description || '',
          due_date: cl.due_date || todayISO(),
          installments_total: cl.installments_total || 1,
          notes: cl.notes || '',
        }
        const savedClause = await createClause(savedContract.id, id, full)
        if ((full.installments_total ?? 1) > 1 && full.original_value) {
          await createInstallments(savedClause.id, id, full)
        }
      }
      navigate(`/atletas/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const conflict = isSellOnConflict(clauses)

  return (
    <div style={{ padding: '32px 40px', maxWidth: 800 }}>
      {/* Breadcrumb */}
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(26,20,16,0.40)', marginBottom: 24, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Link to="/atletas" style={{ color: 'inherit', textDecoration: 'none' }}>Atletas</Link>
        <span>/</span>
        <Link to={`/atletas/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{athlete?.short_name ?? '...'}</Link>
        <span>/</span>
        <span style={{ color: '#be8c4a' }}>Novo Vínculo</span>
      </div>

      <h1 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 22, fontWeight: 700, color: '#1a1410', margin: '0 0 8px' }}>
        Novo Vínculo Contratual
      </h1>
      {athlete && (
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#be8c4a', marginBottom: 28 }}>
          {athlete.full_name}
        </div>
      )}

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32 }}>
        {([1, 2, 3] as Step[]).map((s, i) => {
          const labels = ['Contrato', 'Cláusulas', 'Revisão']
          const active = step === s
          const done = step > s
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div style={{ width: 40, height: 1, background: done ? '#be8c4a' : 'rgba(26,20,16,0.12)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? '#be8c4a' : done ? 'rgba(190,140,74,0.20)' : 'rgba(26,20,16,0.08)',
                  fontSize: 12, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
                  color: active ? '#fff' : done ? '#be8c4a' : 'rgba(26,20,16,0.35)',
                }}>
                  {done ? '✓' : s}
                </div>
                <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#1a1410' : 'rgba(26,20,16,0.45)' }}>
                  {labels[i]}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Contract ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={cardStyle}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#be8c4a', marginBottom: 16 }}>
              Dados do Vínculo
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Tipo de vínculo</label>
                <select value={contract.type} onChange={e => setContractField('type', e.target.value as ContractType)} style={inputStyle}>
                  {CONTRACT_TYPES.map(t => <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={contract.status} onChange={e => setContractField('status', e.target.value as ContractStatus)} style={inputStyle}>
                  <option value="ATIVO">Ativo</option>
                  <option value="ENCERRADO">Encerrado</option>
                  <option value="RESCINDIDO">Rescindido</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Clube / Contraparte *</label>
                <input value={contract.counterpart_club} onChange={e => setContractField('counterpart_club', e.target.value)} placeholder="Ex: Atlético de Madrid" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>País da contraparte</label>
                <input value={contract.counterpart_country} onChange={e => setContractField('counterpart_country', e.target.value)} placeholder="Ex: Espanha" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Data de início *</label>
                <input type="date" value={contract.start_date} onChange={e => setContractField('start_date', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Data de término</label>
                <input type="date" value={contract.end_date} onChange={e => setContractField('end_date', e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#be8c4a', marginBottom: 16 }}>
              Valor da Transferência
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Valor bruto (opcional)</label>
                <input
                  type="number" min={0} step={0.01}
                  value={contract.transfer_fee_gross ?? ''}
                  onChange={e => setContractField('transfer_fee_gross', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Moeda</label>
                <select value={contract.transfer_currency} onChange={e => setContractField('transfer_currency', e.target.value as Currency)} style={inputStyle}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div>
              <label style={labelStyle}>Descrição / observações</label>
              <textarea value={contract.description} onChange={e => setContractField('description', e.target.value)} rows={3} placeholder="Notas gerais sobre o vínculo..." style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Clauses ── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {conflict && (
            <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15 }}>⚠️</span>
              <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, color: '#92400e' }}>
                <strong>Atenção — conflito Sell-On:</strong> Você adicionou tanto "Sell-On Fee (a pagar)" quanto "Sell-On Fee (a receber)". Verifique se isso reflete cláusulas de contratos distintos e não um erro de cadastro.
              </div>
            </div>
          )}

          {clauses.length === 0 && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '32px 20px', color: 'rgba(26,20,16,0.40)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
              Nenhuma cláusula adicionada. Clique em "+ Cláusula" para começar.
            </div>
          )}

          {clauses.map((cl, idx) => (
            <div key={idx} style={{ ...cardStyle, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#be8c4a' }}>
                  Cláusula {idx + 1}
                </div>
                <button onClick={() => removeClause(idx)} style={{ background: 'none', border: 'none', color: 'rgba(220,38,38,0.70)', cursor: 'pointer', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>
                  Remover
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Tipo</label>
                  <select value={cl.clause_type} onChange={e => setClauseField(idx, 'clause_type', e.target.value as ClauseType)} style={inputStyle}>
                    {CLAUSE_TYPES.map(t => <option key={t} value={t}>{CLAUSE_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Descrição *</label>
                  <input value={cl.description ?? ''} onChange={e => setClauseField(idx, 'description', e.target.value)} placeholder="Descreva a cláusula..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Credor</label>
                  <input value={cl.creditor_party ?? ''} onChange={e => setClauseField(idx, 'creditor_party', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Devedor</label>
                  <input value={cl.debtor_party ?? ''} onChange={e => setClauseField(idx, 'debtor_party', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Valor</label>
                  <input type="number" min={0} step={0.01} value={cl.original_value ?? ''} onChange={e => setClauseField(idx, 'original_value', e.target.value ? parseFloat(e.target.value) : null)} placeholder="0.00" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Moeda</label>
                  <select value={cl.currency ?? 'EUR'} onChange={e => setClauseField(idx, 'currency', e.target.value as Currency)} style={inputStyle}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>% (se aplicável)</label>
                  <input type="number" min={0} max={100} step={0.01} value={cl.percentage_value ?? ''} onChange={e => setClauseField(idx, 'percentage_value', e.target.value ? parseFloat(e.target.value) : null)} placeholder="Ex: 15" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Parcelas</label>
                  <input type="number" min={1} max={60} value={cl.installments_total ?? 1} onChange={e => setClauseField(idx, 'installments_total', parseInt(e.target.value) || 1)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Vencimento / 1ª parcela</label>
                  <input type="date" value={cl.due_date ?? ''} onChange={e => setClauseField(idx, 'due_date', e.target.value)} style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Condição / gatilho</label>
                  <input value={cl.condition_description ?? ''} onChange={e => setClauseField(idx, 'condition_description', e.target.value)} placeholder="Ex: Aprovação em 25 jogos na liga" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Notas</label>
                  <input value={cl.notes ?? ''} onChange={e => setClauseField(idx, 'notes', e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addClause}
            style={{
              background: 'rgba(190,140,74,0.10)', border: '1px dashed rgba(190,140,74,0.40)',
              borderRadius: 8, padding: '12px 0', width: '100%',
              fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, fontWeight: 600,
              color: '#be8c4a', cursor: 'pointer',
            }}
          >
            + Adicionar Cláusula
          </button>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {conflict && (
            <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 15 }}>⚠️</span>
              <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, color: '#92400e' }}>
                <strong>Conflito Sell-On detectado.</strong> Revise antes de salvar.
              </div>
            </div>
          )}

          <div style={cardStyle}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#be8c4a', marginBottom: 14 }}>
              Vínculo
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, margin: 0 }}>
              <dt style={{ color: 'rgba(26,20,16,0.45)', fontWeight: 500 }}>Tipo</dt><dd style={{ margin: 0 }}>{CONTRACT_TYPE_LABELS[contract.type]}</dd>
              <dt style={{ color: 'rgba(26,20,16,0.45)', fontWeight: 500 }}>Clube</dt><dd style={{ margin: 0 }}>{contract.counterpart_club || '—'}</dd>
              <dt style={{ color: 'rgba(26,20,16,0.45)', fontWeight: 500 }}>País</dt><dd style={{ margin: 0 }}>{contract.counterpart_country || '—'}</dd>
              <dt style={{ color: 'rgba(26,20,16,0.45)', fontWeight: 500 }}>Início</dt><dd style={{ margin: 0 }}>{contract.start_date}</dd>
              <dt style={{ color: 'rgba(26,20,16,0.45)', fontWeight: 500 }}>Término</dt><dd style={{ margin: 0 }}>{contract.end_date || '—'}</dd>
              {contract.transfer_fee_gross && (
                <>
                  <dt style={{ color: 'rgba(26,20,16,0.45)', fontWeight: 500 }}>Valor</dt>
                  <dd style={{ margin: 0 }}>{contract.transfer_currency} {contract.transfer_fee_gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</dd>
                </>
              )}
            </dl>
          </div>

          {clauses.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#be8c4a', marginBottom: 14 }}>
                Cláusulas ({clauses.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {clauses.map((cl, idx) => (
                  <div key={idx} style={{ borderBottom: idx < clauses.length - 1 ? '1px solid rgba(26,20,16,0.08)' : 'none', paddingBottom: idx < clauses.length - 1 ? 10 : 0 }}>
                    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, fontWeight: 600, color: '#1a1410', marginBottom: 2 }}>
                      {CLAUSE_TYPE_LABELS[cl.clause_type!]} — {cl.description || 'sem descrição'}
                    </div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(26,20,16,0.45)', display: 'flex', gap: 16 }}>
                      {cl.original_value != null && <span>{cl.currency} {cl.original_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                      {cl.percentage_value != null && <span>{cl.percentage_value}%</span>}
                      {cl.installments_total && cl.installments_total > 1 && <span>{cl.installments_total}x</span>}
                      {cl.due_date && <span>Vence: {cl.due_date}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.30)', borderRadius: 8, padding: '10px 14px', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: '#b91c1c' }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── Navigation buttons ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
        <div>
          {step > 1 && (
            <button onClick={() => setStep(s => (s - 1) as Step)}
              style={{ background: 'transparent', border: '1px solid rgba(26,20,16,0.15)', borderRadius: 7, padding: '9px 20px', fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', color: 'rgba(26,20,16,0.55)' }}>
              ← Voltar
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/atletas/${id}`} style={{ background: 'transparent', border: '1px solid rgba(26,20,16,0.15)', borderRadius: 7, padding: '9px 20px', fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif", color: 'rgba(26,20,16,0.55)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            Cancelar
          </Link>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => (s + 1) as Step)}
              disabled={step === 1 && !step1Valid}
              style={{ background: '#be8c4a', border: 'none', borderRadius: 7, padding: '9px 24px', fontSize: 13, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', color: '#fff', opacity: (step === 1 && !step1Valid) ? 0.5 : 1 }}>
              Próximo →
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ background: '#be8c4a', border: 'none', borderRadius: 7, padding: '9px 24px', fontSize: 13, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', color: '#fff', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvando...' : 'Salvar Vínculo'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
