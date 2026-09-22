import { useEffect, useState } from 'react'
import type { Currency } from '../../types/athlete-system'
import NumberInput from '../NumberInput'
import { approxRateBRL } from '../../lib/fx'
import ModalFrame from '../ModalFrame'
import { fetchPtaxOn } from '../../lib/ptax'

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


export default function PaymentModal({ label, currency, value, onClose, onSave }: PaymentModalProps) {
  const sym = CURRENCY_SYMBOLS[currency]
  const defaultRate = approxRateBRL(currency)

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [valueCurrency, setValueCurrency] = useState(value)
  const [rate, setRate] = useState(defaultRate)
  const [notes, setNotes] = useState('')
  // PTAX da DATA DO PAGAMENTO (BCB/ac_taxas_cambio); a tabela aproximada de fx
  // é só o fallback. Não sobrescreve uma taxa digitada pelo usuário.
  const [rateTouched, setRateTouched] = useState(false)
  const [ptaxInfo, setPtaxInfo] = useState<string | null>(null)
  useEffect(() => {
    if (currency === 'BRL' || !date) return
    let alive = true
    void fetchPtaxOn(currency, date).then(r => {
      if (!alive) return
      if (r) {
        setPtaxInfo(`PTAX ${r.date.split('-').reverse().join('/')}: ${r.rate.toFixed(4)}`)
        if (!rateTouched) setRate(r.rate)
      } else setPtaxInfo(null)
    })
    return () => { alive = false }
  }, [currency, date, rateTouched])

  const valueBRL = currency === 'BRL' ? valueCurrency : valueCurrency * rate

  const handleSave = () => {
    if (!date || valueCurrency <= 0) return
    onSave({ date, valueCurrency, valueBRL, rate, notes })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7,
    padding: '8px 10px', fontSize: 13, color: 'var(--ink)',
    fontFamily: "var(--font-body)", boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-label)", fontSize: 11,
    fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
    color: 'var(--text-muted)', display: 'block', marginBottom: 4,
  }

  return (
    <ModalFrame label={`Registrar pagamento — ${label}`} onClose={onClose}
      overlayStyle={{ background: 'rgba(0,0,0,0.45)' }}
      panelStyle={{
        background: 'var(--cream-card, #faf6ed)', border: '1px solid var(--gold-line, var(--divider-strong))',
        borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 600,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--accent)', marginBottom: 4,
          }}>
            Registrar Pagamento
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600, color: 'var(--ink, #1a1410)' }}>
            {label}
          </div>
          <div style={{ fontFamily: "var(--font-label)", fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Valor previsto: {sym} {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor="paymod-data-do-pagamento" style={labelStyle}>Data do pagamento</label>
            <input id="paymod-data-do-pagamento" type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label htmlFor="paymod-valor-recebido" style={labelStyle}>Valor recebido ({sym})</label>
            <NumberInput id="paymod-valor-recebido"
              value={valueCurrency || ''}
              onChange={v => setValueCurrency(v ? parseFloat(v) : 0)}
              style={inputStyle}
            />
          </div>

          {currency !== 'BRL' && (
            <div>
              <label htmlFor="paymod-taxa-de-cambio-1-r-ptax-esti" style={labelStyle}>
                Taxa de câmbio (1 {currency} = R$)
                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
                  {ptaxInfo ?? `PTAX indisponível — estimado: ${defaultRate.toFixed(2)}`}
                </span>
              </label>
              <NumberInput id="paymod-taxa-de-cambio-1-r-ptax-esti"
                decimals={4} grouping={false}
                value={rate || ''}
                onChange={v => { setRateTouched(true); setRate(v ? parseFloat(v) : defaultRate) }}
                style={inputStyle}
              />
            </div>
          )}

          {currency !== 'BRL' && (
            <div style={{
              background: 'var(--accent-tint)', border: '1px solid var(--divider-strong)',
              borderRadius: 7, padding: '8px 12px',
              fontFamily: "var(--font-label)", fontSize: 12, color: 'var(--accent)',
            }}>
              R$ {valueBRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          )}

          <div>
            <label htmlFor="paymod-observacoes" style={labelStyle}>Observações</label>
            <textarea id="paymod-observacoes"
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
              fontFamily: "var(--font-body)", cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!date || valueCurrency <= 0}
            style={{
              background: 'var(--accent)', border: 'none', borderRadius: 7,
              padding: '8px 22px', fontSize: 12, fontWeight: 600,
              fontFamily: "var(--font-body)", cursor: 'pointer',
              color: '#fff', opacity: (!date || valueCurrency <= 0) ? 0.5 : 1,
            }}
          >
            Confirmar
          </button>
        </div>
    </ModalFrame>
  )
}
