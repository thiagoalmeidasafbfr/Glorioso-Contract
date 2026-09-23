import { useState } from 'react'
import type { Currency } from '../../types/athlete-system'
import NumberInput from '../NumberInput'
import { modalInput, modalLabel } from '../modals/styles'

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

  const inputStyle = modalInput
  const labelStyle = modalLabel

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-panel" style={{ padding: 'var(--space-6)', width: 420 }}>
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Registrar pagamento</div>
          <div style={{ fontSize: 'var(--text-subtitle-size)', fontWeight: 500, letterSpacing: '-.01em', color: 'var(--text-primary)' }}>
            {label}
          </div>
          <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', marginTop: 4 }}>
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
            <NumberInput
              value={valueCurrency || ''}
              onChange={v => setValueCurrency(v ? parseFloat(v) : 0)}
              style={inputStyle}
            />
          </div>

          {currency !== 'BRL' && (
            <div>
              <label style={labelStyle}>
                Taxa de câmbio (1 {currency} = R$)
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                  PTAX estimado: {defaultRate.toFixed(2)}
                </span>
              </label>
              <NumberInput
                decimals={4} grouping={false}
                value={rate || ''}
                onChange={v => setRate(v ? parseFloat(v) : defaultRate)}
                style={inputStyle}
              />
            </div>
          )}

          {currency !== 'BRL' && (
            <div style={{
              background: 'var(--surface-sunken)', borderRadius: 'var(--radius-control)', padding: '8px 12px',
              fontSize: 'var(--text-body-sm-size)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
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

        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-6)', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={!date || valueCurrency <= 0} className="btn btn-primary">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
