import { useState } from 'react'
import type { Currency } from '../../types/athlete-system'

interface PaymentModalProps {
  label: string
  currency: Currency
  value: number
  onClose: () => void
  onSave: (p: {
    date: string
    valueCurrency: number
    valueBRL: number
    rate: number
    notes: string
  }) => void
}

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  BRL: 'R$', EUR: '€', USD: '$', GBP: '£',
}

const DEFAULT_RATES: Record<Currency, number> = {
  BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10,
}

export default function PaymentModal({ label, currency, value, onClose, onSave }: PaymentModalProps) {
  const sym = CURRENCY_SYMBOLS[currency]
  const defaultRate = DEFAULT_RATES[currency]

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [valueCurrency, setValueCurrency] = useState(value)
  const [rate, setRate] = useState(defaultRate)
  const [notes, setNotes] = useState('')

  const valueBRL = currency === 'BRL' ? valueCurrency : valueCurrency * rate

  const handleSave = () => {
    if (!date || valueCurrency <= 0) return
    onSave({ date, valueCurrency, valueBRL, rate, notes })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7,
    padding: '8px 10px', fontSize: 13, color: 'var(--ink)',
    fontFamily: "'Inter', system-ui, sans-serif", boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
    fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
    color: 'rgba(26,20,16,0.50)', display: 'block', marginBottom: 4,
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--cream-card, #faf6ed)', border: '1px solid var(--gold-line, rgba(190,140,74,0.25))',
        borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: '#be8c4a', marginBottom: 4,
          }}>
            Registrar Pagamento
          </div>
          <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--ink, #1a1410)' }}>
            {label}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: 'rgba(26,20,16,0.55)', marginTop: 2 }}>
            Valor previsto: {sym} {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Data do pagamento</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Valor recebido ({sym})</label>
            <input
              type="number" min={0} step={0.01}
              value={valueCurrency}
              onChange={e => setValueCurrency(parseFloat(e.target.value) || 0)}
              style={inputStyle}
            />
          </div>

          {currency !== 'BRL' && (
            <div>
              <label style={labelStyle}>
                Taxa de câmbio (1 {currency} = R$)
                <span style={{ fontWeight: 400, color: 'rgba(26,20,16,0.40)', marginLeft: 6 }}>
                  PTAX estimado: {defaultRate.toFixed(2)}
                </span>
              </label>
              <input
                type="number" min={0} step={0.0001}
                value={rate}
                onChange={e => setRate(parseFloat(e.target.value) || defaultRate)}
                style={inputStyle}
              />
            </div>
          )}

          {currency !== 'BRL' && (
            <div style={{
              background: 'rgba(190,140,74,0.08)', border: '1px solid rgba(190,140,74,0.20)',
              borderRadius: 7, padding: '8px 12px',
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#be8c4a',
            }}>
              R$ {valueBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          )}

          <div>
            <label style={labelStyle}>Observações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Referência bancária, anotações..."
              style={{ ...inputStyle, resize: 'vertical' as const }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid rgba(26,20,16,0.15)',
              borderRadius: 7, padding: '8px 18px', fontSize: 12,
              fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer',
              color: 'rgba(26,20,16,0.55)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!date || valueCurrency <= 0}
            style={{
              background: '#be8c4a', border: 'none', borderRadius: 7,
              padding: '8px 22px', fontSize: 12, fontWeight: 600,
              fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer',
              color: '#fff', opacity: (!date || valueCurrency <= 0) ? 0.5 : 1,
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
