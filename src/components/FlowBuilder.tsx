// src/components/FlowBuilder.tsx
// Editor de FLUXO DE PAGAMENTO reutilizável — usado em TODA criação/edição de
// obrigação (novo contrato, nova cláusula, luvas, agentes, assistente, página da
// obrigação, página do clube/agente).
//
// A fonte da verdade é uma lista de linhas { due_date, value }:
//   • as LINHAS vêm primeiro e são sempre editáveis (fluxos irregulares são a
//     regra, não a exceção) — `seedRows` já abre N linhas em branco;
//   • "+ Adicionar parcela" fica logo abaixo das linhas;
//   • o gerador automático (valor total ÷ nº parcelas × periodicidade) é um
//     painel opcional, recolhido por padrão, para não poluir a tela.

import { useEffect, useRef, useState } from 'react'
import type { Currency } from '../types/athlete-system'
import { addMonths, todayISO } from '../lib/format'
import NumberInput from './NumberInput'
import { Icon, IconButton } from './Icon'

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
  width: '100%', background: 'var(--cream-card)', border: '1px solid var(--input-border)',
  borderRadius: 7, padding: '7px 9px', fontSize: 13, color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box',
}
const lbl: React.CSSProperties = {
  fontFamily: mono, fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--text-muted)', display: 'block', marginBottom: 3,
}
const sectionLbl: React.CSSProperties = {
  fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--ink-secondary)',
}

// competência = 1ª data + i×passo; se dueDay definido, força o dia do vencimento.
function withDay(iso: string, day: number | null): string {
  if (!day) return iso
  const [y, m] = iso.split('-')
  return `${y}-${m}-${String(day).padStart(2, '0')}`
}

export default function FlowBuilder({
  currency, onCurrencyChange, lines, onChange, defaultDueDay = null, defaultFirst = '',
  seedRows = 0, periodicity = 'MENSAL', title = 'Parcelas', showGenerator = true,
}: {
  currency: Currency
  onCurrencyChange?: (c: Currency) => void
  lines: FlowLine[]
  onChange: (lines: FlowLine[]) => void
  defaultDueDay?: number | null
  defaultFirst?: string
  /** Abre N linhas em branco quando o fluxo começa vazio (ex.: 4 na criação). */
  seedRows?: number
  /** Periodicidade usada ao semear/adicionar linhas. */
  periodicity?: Period
  title?: string
  /** Esconde o gerador automático (telas que já têm o próprio, ex.: transferência). */
  showGenerator?: boolean
}) {
  const [mode, setMode] = useState<'total' | 'parcela'>('total')
  const [amount, setAmount] = useState('')          // total OU valor por parcela
  const [count, setCount] = useState(12)
  const [period, setPeriod] = useState<Period>(periodicity)
  const [first, setFirst] = useState(defaultFirst)
  const [dueDay, setDueDay] = useState<string>(defaultDueDay ? String(defaultDueDay) : '')
  const [genOpen, setGenOpen] = useState(false)

  const total = lines.reduce((s, l) => s + (l.value || 0), 0)
  const step = PERIOD_STEP[period]

  // Semeia as primeiras linhas em branco (datas sugeridas) na primeira renderização.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || seedRows <= 0 || lines.length > 0) return
    seeded.current = true
    const base = defaultFirst || todayISO()
    const gen = Array.from({ length: seedRows }, (_, i) => ({
      due_date: withDay(addMonths(base, i * PERIOD_STEP[periodicity]), defaultDueDay),
      value: 0,
    }))
    onChange(gen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function generate(replace: boolean) {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || count < 1 || !first) return
    const per = mode === 'total' ? amt / count : amt
    const day = dueDay ? parseInt(dueDay) : null
    const gen: FlowLine[] = Array.from({ length: count }, (_, i) => ({
      due_date: withDay(addMonths(first, i * step), day),
      value: Math.round(per * 100) / 100,
    }))
    // Substituir descarta linhas em branco automaticamente (as semeadas).
    onChange(replace ? gen : [...lines.filter(l => l.value > 0 || l.due_date), ...gen])
    setGenOpen(false)
  }
  function addLine() {
    const last = lines[lines.length - 1]
    const next = last?.due_date ? addMonths(last.due_date, step) : (first || defaultFirst || todayISO())
    onChange([...lines, { due_date: withDay(next, dueDay ? parseInt(dueDay) : defaultDueDay), value: 0 }])
  }
  function setLine(i: number, patch: Partial<FlowLine>) {
    onChange(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }
  function removeLine(i: number) { onChange(lines.filter((_, idx) => idx !== i)) }
  /** Divide o total informado igualmente entre as linhas já existentes. */
  function splitAcrossLines() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || lines.length === 0) return
    const per = Math.round((amt / lines.length) * 100) / 100
    const last = Math.round((amt - per * (lines.length - 1)) * 100) / 100
    onChange(lines.map((l, i) => ({ ...l, value: i === lines.length - 1 ? last : per })))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Cabeçalho: título, moeda e atalho do gerador */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={sectionLbl}>{title} ({lines.length})</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {onCurrencyChange && (
            <select aria-label="Moeda das parcelas" style={{ ...input, width: 'auto', padding: '5px 8px', fontSize: 12 }}
              value={currency} onChange={e => onCurrencyChange(e.target.value as Currency)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {showGenerator && <button type="button" onClick={() => setGenOpen(o => !o)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
              border: '1px solid var(--divider-strong)', background: genOpen ? 'var(--accent-tint)' : 'transparent',
              color: 'var(--ink-primary)', fontFamily: font, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
            }}>
            <Icon name={genOpen ? 'chevronDown' : 'chevronRight'} size={13} />
            Gerar automaticamente
          </button>}
        </div>
      </div>

      {/* Gerador regular (recolhido por padrão) */}
      {showGenerator && genOpen && (
        <div style={{ border: '1px solid var(--divider)', borderRadius: 10, padding: 12, background: 'var(--bg-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={lbl}>Base</label>
              <select style={input} value={mode} onChange={e => setMode(e.target.value as 'total' | 'parcela')}>
                <option value="total">Valor total</option>
                <option value="parcela">Valor / parcela</option>
              </select>
            </div>
            <div>
              <label style={lbl}>{mode === 'total' ? 'Valor total' : 'Valor por parcela'}</label>
              <NumberInput style={input} value={amount} onChange={v => setAmount(v)} placeholder="0,00" />
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
            <button type="button" onClick={() => generate(true)} className="btn btn-primary" style={{ padding: '6px 14px' }}>Gerar (substituir)</button>
            <button type="button" onClick={() => generate(false)} className="btn btn-outline" style={{ padding: '6px 14px' }}>Gerar (adicionar)</button>
            {lines.length > 0 && (
              <button type="button" onClick={splitAcrossLines} className="btn btn-ghost" style={{ padding: '6px 12px' }}
                title="Divide o valor informado entre as parcelas que já estão na lista">
                Dividir nas {lines.length} linhas
              </button>
            )}
          </div>
        </div>
      )}

      {/* Linhas (sempre editáveis) */}
      <div>
        {lines.length === 0 ? (
          <div style={{ padding: '16px 12px', textAlign: 'center', fontFamily: font, fontSize: 12.5, color: 'var(--text-muted)', border: '1px dashed var(--divider-strong)', borderRadius: 8 }}>
            Nenhuma parcela ainda. Use o botão abaixo para lançar linha por linha{showGenerator ? ' ou “Gerar automaticamente”' : ''}.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr 30px', gap: 8, padding: '0 0 4px' }}>
              <span />
              <span style={lbl}>Vencimento</span>
              <span style={lbl}>Valor ({currency})</span>
              <span />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {lines.map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr 30px', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{i + 1}</span>
                  <input style={input} type="date" aria-label={`Vencimento da parcela ${i + 1}`}
                    value={l.due_date} onChange={e => setLine(i, { due_date: e.target.value })} />
                  <NumberInput style={{ ...input, fontFamily: mono }} value={l.value || ''} placeholder="0,00"
                    onChange={v => setLine(i, { value: v ? parseFloat(v) : 0 })} />
                  <IconButton icon="x" label={`Remover parcela ${i + 1}`} tone="danger" small onClick={() => removeLine(i)} />
                </div>
              ))}
            </div>
          </>
        )}

        <button type="button" onClick={addLine}
          style={{
            marginTop: 8, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '9px 0', borderRadius: 8, border: '1px dashed var(--divider-strong)', background: 'transparent',
            color: 'var(--ink-primary)', fontFamily: font, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          }}>
          <Icon name="plus" size={14} /> Adicionar parcela
        </button>

        <div style={{ marginTop: 8, textAlign: 'right', fontFamily: mono, fontSize: 12, color: 'var(--ink-primary)' }}>
          Total: <strong>{currency} {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> em {lines.length} parcela{lines.length === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  )
}
