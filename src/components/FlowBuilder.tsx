// src/components/FlowBuilder.tsx
// Editor de FLUXO DE PAGAMENTO reutilizável. A fonte da verdade é uma lista de
// linhas { due_date, value }. O usuário pode:
//   • Gerar um fluxo REGULAR (valor total ou por parcela × nº × periodicidade,
//     1ª data e dia de vencimento) — anexa ou substitui as linhas; e/ou
//   • Adicionar/editar/remover linhas MANUALMENTE (fluxos irregulares).
// Nem todo fluxo é regular — por isso as linhas ficam sempre editáveis.

import { useState } from 'react'
import type { Currency } from '../types/athlete-system'
import { addMonths } from '../lib/format'

export interface FlowLine { due_date: string; value: number }

const CURRENCIES: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']
type Period = 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
const PERIOD_STEP: Record<Period, number> = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 }
const PERIOD_LABEL: Record<Period, string> = {
  MENSAL: 'Mensal', BIMESTRAL: 'Bimestral', TRIMESTRAL: 'Trimestral', SEMESTRAL: 'Semestral', ANUAL: 'Anual',
}

const font = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"

const input: React.CSSProperties = {
  width: '100%', background: 'var(--surface, #fff)', border: '1px solid var(--divider-strong, rgba(26,20,16,0.15))',
  borderRadius: 7, padding: '7px 9px', fontSize: 13, color: 'var(--ink-primary, #1a1410)', fontFamily: font, boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  fontFamily: mono, fontSize: 9, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text-muted, rgba(26,20,16,0.5))', display: 'block', marginBottom: 3,
}

// competência = 1ª data + i×passo; se dueDay definido, força o dia do vencimento.
function withDay(iso: string, day: number | null): string {
  if (!day) return iso
  const [y, m] = iso.split('-')
  return `${y}-${m}-${String(day).padStart(2, '0')}`
}

export default function FlowBuilder({
  currency, onCurrencyChange, lines, onChange, defaultDueDay = null, defaultFirst = '',
}: {
  currency: Currency
  onCurrencyChange?: (c: Currency) => void
  lines: FlowLine[]
  onChange: (lines: FlowLine[]) => void
  defaultDueDay?: number | null
  defaultFirst?: string
}) {
  const [mode, setMode] = useState<'total' | 'parcela'>('total')
  const [amount, setAmount] = useState('')          // total OU valor por parcela
  const [count, setCount] = useState(12)
  const [period, setPeriod] = useState<Period>('MENSAL')
  const [first, setFirst] = useState(defaultFirst)
  const [dueDay, setDueDay] = useState<string>(defaultDueDay ? String(defaultDueDay) : '')

  const total = lines.reduce((s, l) => s + (l.value || 0), 0)

  function generate(replace: boolean) {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || count < 1 || !first) return
    const per = mode === 'total' ? amt / count : amt
    const day = dueDay ? parseInt(dueDay) : null
    const step = PERIOD_STEP[period]
    const gen: FlowLine[] = Array.from({ length: count }, (_, i) => ({
      due_date: withDay(addMonths(first, i * step), day),
      value: Math.round(per * 100) / 100,
    }))
    onChange(replace ? gen : [...lines, ...gen])
  }
  function addLine() {
    const last = lines[lines.length - 1]
    const next = last ? addMonths(last.due_date, 1) : (first || new Date().toISOString().slice(0, 10))
    onChange([...lines, { due_date: withDay(next, dueDay ? parseInt(dueDay) : null), value: 0 }])
  }
  function setLine(i: number, patch: Partial<FlowLine>) {
    onChange(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  function removeLine(i: number) { onChange(lines.filter((_, idx) => idx !== i)) }

  const box: React.CSSProperties = {
    border: '1px solid var(--divider, rgba(190,140,74,0.20))', borderRadius: 10, padding: 14,
    background: 'var(--gold-tint, rgba(190,140,74,0.05))',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Gerador regular */}
      <div style={box}>
        <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold-deep, #8a6a34)', marginBottom: 10 }}>
          Gerar fluxo regular
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr 0.7fr 1fr 1.1fr 0.8fr', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={lbl}>Base</label>
            <select style={input} value={mode} onChange={e => setMode(e.target.value as 'total' | 'parcela')}>
              <option value="total">Valor total</option>
              <option value="parcela">Valor / parcela</option>
            </select>
          </div>
          <div>
            <label style={lbl}>{mode === 'total' ? 'Valor total' : 'Valor por parcela'}</label>
            <input style={input} type="number" min={0} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label style={lbl}>Nº parcelas</label>
            <input style={input} type="number" min={1} max={600} value={count} onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
          <div>
            <label style={lbl}>Periodicidade</label>
            <select style={input} value={period} onChange={e => setPeriod(e.target.value as Period)}>
              {(Object.keys(PERIOD_LABEL) as Period[]).map(p => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>1ª parcela</label>
            <input style={input} type="date" value={first} onChange={e => setFirst(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Dia venc.</label>
            <input style={input} type="number" min={1} max={28} value={dueDay} onChange={e => setDueDay(e.target.value)} placeholder="—" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => generate(true)} style={btn('solid')}>Gerar (substituir)</button>
          <button type="button" onClick={() => generate(false)} style={btn('outline')}>Gerar (adicionar)</button>
          {onCurrencyChange && (
            <select style={{ ...input, width: 'auto' }} value={currency} onChange={e => onCurrencyChange(e.target.value as Currency)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Linhas (sempre editáveis) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold-deep, #8a6a34)' }}>
            Parcelas ({lines.length})
          </span>
          <button type="button" onClick={addLine} style={btn('outline')}>+ Adicionar linha</button>
        </div>

        {lines.length === 0 ? (
          <div style={{ padding: '18px 12px', textAlign: 'center', fontFamily: mono, fontSize: 12, color: 'var(--text-muted, rgba(26,20,16,0.4))', border: '1px dashed var(--divider-strong, rgba(26,20,16,0.15))', borderRadius: 8 }}>
            Nenhuma parcela. Gere um fluxo regular acima ou adicione linhas manualmente.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 70px', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-muted, rgba(26,20,16,0.45))', textAlign: 'right' }}>{i + 1}</span>
                <input style={input} type="date" value={l.due_date} onChange={e => setLine(i, { due_date: e.target.value })} />
                <input style={input} type="number" min={0} step={0.01} value={l.value || ''} onChange={e => setLine(i, { value: parseFloat(e.target.value) || 0 })} placeholder="0,00" />
                <button type="button" onClick={() => removeLine(i)} style={{ ...btn('ghost'), color: 'var(--neg, #dc2626)' }}>remover</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, textAlign: 'right', fontFamily: mono, fontSize: 12, color: 'var(--ink-primary, #1a1410)' }}>
          Total: <strong>{currency} {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> em {lines.length} parcela{lines.length === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  )
}

function btn(kind: 'solid' | 'outline' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = { padding: '7px 13px', borderRadius: 7, fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }
  if (kind === 'solid') return { ...base, background: '#be8c4a', color: '#fff', border: 'none' }
  if (kind === 'outline') return { ...base, background: 'transparent', border: '1px solid rgba(190,140,74,0.45)', color: '#be8c4a' }
  return { ...base, background: 'transparent', border: 'none', fontSize: 11 }
}
