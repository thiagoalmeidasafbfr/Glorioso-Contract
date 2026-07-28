// src/components/modals/LoanShareModal.tsx
// Rateio de salário em EMPRÉSTIMO: escolhe quanto o clube que recebe o atleta
// assume (do CLT e da imagem) e mostra, antes de salvar, exatamente quanto sobra
// para o Botafogo por mês. Ao salvar, o fluxo mensal é regerado a partir da data
// do empréstimo (parcelas pagas preservadas) e volta ao integral no fim dele.

import { useState } from 'react'
import type {
  Contract, Clause, ClauseInstallment, SalaryTrigger, AthletePJ,
} from '../../types/athlete-system'
import {
  applyLoanSalaryShare, removeLoanSalaryShare, splitLoanSalary,
  loanShareTriggers, decodeLoanShare,
} from '../../lib/loanSalary'
import { fmtCurrencyShort, fmtDate } from '../../lib/format'
import NumberInput from '../NumberInput'
import { ModalShell } from './EditModals'
import { modalInput, modalLabel } from './styles'

const font = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"

/** Atalhos dos casos mais comuns na prática. */
const PRESETS: { label: string; salary: number; image: number }[] = [
  { label: 'Clube arca com tudo', salary: 100, image: 100 },
  { label: 'Só o CLT', salary: 100, image: 0 },
  { label: 'Metade do CLT', salary: 50, image: 0 },
  { label: 'Botafogo arca com tudo', salary: 0, image: 0 },
]

export default function LoanShareModal({
  workContract, loanContract, triggers, clauses, installments, pjs, athleteName, onClose, onSaved,
}: {
  workContract: Contract
  loanContract: Contract
  triggers: SalaryTrigger[]
  clauses: Clause[]
  installments: ClauseInstallment[]
  pjs: AthletePJ[]
  athleteName: string
  onClose: () => void
  onSaved: () => void
}) {
  const existing = loanShareTriggers(triggers, loanContract.id)
  const current = existing.map(t => decodeLoanShare(t.notes)).find(m => m?.role === 'RATEIO') ?? null

  const [salaryPct, setSalaryPct] = useState(String(current?.clubSalaryPct ?? 0))
  const [imagePct, setImagePct] = useState(String(current?.clubImagePct ?? 0))
  const [restoreAtEnd, setRestoreAtEnd] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fullSalary = workContract.base_salary ?? 0
  const fullImage = workContract.image_value ?? 0
  const currency = workContract.salary_currency ?? 'BRL'
  const sPct = Math.min(100, Math.max(0, parseFloat(salaryPct) || 0))
  const iPct = Math.min(100, Math.max(0, parseFloat(imagePct) || 0))
  const split = splitLoanSalary(fullSalary, fullImage, sPct, iPct)
  const botafogoTotal = split.botafogoSalary + split.botafogoImage
  const clubTotal = split.clubSalary + split.clubImage

  async function save() {
    setSaving(true); setError(null)
    try {
      await applyLoanSalaryShare({
        workContract, loanContract,
        clubSalaryPct: sPct, clubImagePct: iPct, restoreAtEnd,
        triggers, clauses, installments, pjs, athleteName,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao aplicar o rateio')
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!window.confirm('Remover o rateio? A remuneração volta ao valor integral do contrato e o fluxo é regerado.')) return
    setSaving(true); setError(null)
    try {
      await removeLoanSalaryShare({
        workContract, loanContractId: loanContract.id,
        triggers, clauses, installments, pjs, athleteName,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover o rateio')
    } finally { setSaving(false) }
  }

  const cell = (label: string, value: string, hi?: boolean) => (
    <div style={{ padding: '10px 14px', borderRadius: 9, background: hi ? 'var(--pos-tint)' : 'var(--bg-subtle)', border: `1px solid ${hi ? 'rgba(47,107,58,0.25)' : 'var(--divider)'}` }}>
      <div style={{ fontSize: 9, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase', color: hi ? 'var(--pos)' : 'var(--text-muted)', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, fontFamily: mono, color: hi ? 'var(--pos)' : 'var(--ink-primary)' }}>{value}</div>
    </div>
  )

  return (
    <ModalShell title="Rateio de salário no empréstimo" width={640} onClose={onClose}
      subtitle={`${loanContract.counterpart_club || 'clube'} · ${fmtDate(loanContract.start_date)}${loanContract.end_date ? ` → ${fmtDate(loanContract.end_date)}` : ''}`}
      footer={<>
        {existing.length > 0 && (
          <button onClick={remove} className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={saving}>
            Remover rateio
          </button>
        )}
        {error && <span style={{ color: 'var(--neg)', fontSize: 12, fontFamily: font }}>{error}</span>}
        <button onClick={onClose} className="btn btn-outline">Cancelar</button>
        <button onClick={save} className="btn btn-primary" disabled={saving}>
          {saving ? 'Aplicando…' : existing.length > 0 ? 'Atualizar rateio' : 'Aplicar rateio'}
        </button>
      </>}>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: font, lineHeight: 1.5 }}>
        Informe quanto o <strong>{loanContract.counterpart_club || 'clube que recebe o atleta'}</strong> assume.
        O que sobrar continua com o Botafogo e o fluxo mensal é regerado a partir de
        <strong> {fmtDate(loanContract.start_date)}</strong> — as parcelas já pagas não são tocadas.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRESETS.map(p => {
          const active = sPct === p.salary && iPct === p.image
          return (
            <button key={p.label} onClick={() => { setSalaryPct(String(p.salary)); setImagePct(String(p.image)) }}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}`}>{p.label}</button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={modalLabel}>Clube arca com (% do CLT)</label>
          <NumberInput style={modalInput} decimals={2} grouping={false} value={salaryPct}
            onChange={v => setSalaryPct(v)} placeholder="0" />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: mono, marginTop: 4 }}>
            CLT integral {fmtCurrencyShort(fullSalary, currency)}/mês
          </div>
        </div>
        <div>
          <label style={modalLabel}>Clube arca com (% da imagem)</label>
          <NumberInput style={modalInput} decimals={2} grouping={false} value={imagePct}
            onChange={v => setImagePct(v)} placeholder="0" />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: mono, marginTop: 4 }}>
            Imagem integral {fmtCurrencyShort(fullImage, currency)}/mês
          </div>
        </div>
      </div>

      {/* Prévia do rateio */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {cell('Botafogo — CLT', fmtCurrencyShort(split.botafogoSalary, currency))}
        {cell('Botafogo — imagem', fmtCurrencyShort(split.botafogoImage, currency))}
        {cell('Botafogo — total/mês', fmtCurrencyShort(botafogoTotal, currency), true)}
        {cell(`${loanContract.counterpart_club || 'Clube'} — total/mês`, fmtCurrencyShort(clubTotal, currency))}
      </div>

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: loanContract.end_date ? 'pointer' : 'default', opacity: loanContract.end_date ? 1 : 0.6 }}>
        <input type="checkbox" checked={restoreAtEnd && !!loanContract.end_date} disabled={!loanContract.end_date}
          onChange={e => setRestoreAtEnd(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--accent)', width: 16, height: 16 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: font }}>
          {loanContract.end_date
            ? <>Voltar à remuneração integral após <strong>{fmtDate(loanContract.end_date)}</strong> (fim do empréstimo).</>
            : <>Informe a <strong>data de término</strong> do empréstimo para voltar automaticamente ao valor integral.</>}
        </span>
      </label>

      {existing.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: font, padding: '9px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider)' }}>
          Rateio já aplicado: {existing.length} degrau(s) na linha do tempo de remuneração
          (aba <strong>Gatilhos</strong>). Atualizar recalcula o fluxo; remover devolve o valor integral.
        </div>
      )}
    </ModalShell>
  )
}
