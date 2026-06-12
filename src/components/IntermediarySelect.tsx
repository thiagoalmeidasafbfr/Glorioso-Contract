// src/components/IntermediarySelect.tsx
// Reusable dropdown for selecting (or creating) an intermediary.

import { useEffect, useRef, useState } from 'react'
import {
  fetchIntermediaries,
  createIntermediary,
  type Intermediary,
  type NewIntermediaryInput,
} from '../lib/intermediaryQueries'

// ── Types ─────────────────────────────────────────────────────────────────

interface IntermediarySelectProps {
  value: string | null   // intermediary id or null
  onChange: (id: string | null) => void
  disabled?: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────

const GOLD      = '#be8c4a'
const CREAM     = '#f3eee2'
const BG_DARK   = '#1a1410'
const BG_FIELD  = 'rgba(255,255,255,0.06)'
const BORDER    = '1px solid rgba(255,255,255,0.12)'
const RADIUS    = 7

const labelStyle: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'rgba(190,140,74,0.85)',
  marginBottom: 4,
  display: 'block',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: BG_FIELD,
  border: BORDER,
  borderRadius: RADIUS,
  padding: '8px 10px',
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 13,
  color: CREAM,
  outline: 'none',
  boxSizing: 'border-box',
}

const fieldWrap: React.CSSProperties = {
  marginBottom: 14,
}

// ── Empty form state ──────────────────────────────────────────────────────

function emptyForm(): NewIntermediaryInput {
  return {
    full_name: '',
    company_name: null,
    email: null,
    phone: null,
    country: 'Brasil',
    license_number: null,
    notes: null,
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function IntermediarySelect({ value, onChange, disabled }: IntermediarySelectProps) {
  const [intermediaries, setIntermediaries] = useState<Intermediary[]>([])
  const [loading, setLoading]               = useState(true)
  const [showModal, setShowModal]           = useState(false)
  const [form, setForm]                     = useState<NewIntermediaryInput>(emptyForm())
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const overlayRef                          = useRef<HTMLDivElement>(null)

  // Load intermediaries on mount
  useEffect(() => {
    let cancelled = false
    fetchIntermediaries()
      .then(list => { if (!cancelled) setIntermediaries(list) })
      .catch(() => { /* ignore — select stays empty */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Close modal on overlay click
  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === overlayRef.current) setShowModal(false)
  }

  function openModal() {
    setForm(emptyForm())
    setError(null)
    setShowModal(true)
  }

  function setField(key: keyof NewIntermediaryInput, raw: string) {
    setForm(prev => ({ ...prev, [key]: raw === '' ? null : raw }))
  }

  async function handleSave() {
    if (!form.full_name.trim()) {
      setError('Nome completo é obrigatório.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createIntermediary({ ...form, full_name: form.full_name.trim() })
      setIntermediaries(prev => [...prev, created].sort((a, b) => a.full_name.localeCompare(b.full_name)))
      onChange(created.id)
      setShowModal(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar intermediário.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Select + Add button ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
          disabled={disabled || loading}
          style={{
            flex: 1,
            background: BG_FIELD,
            border: BORDER,
            borderRadius: RADIUS,
            padding: '8px 10px',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 13,
            color: loading ? 'rgba(243,238,226,0.35)' : CREAM,
            outline: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          <option value="" style={{ background: BG_DARK }}>
            {loading ? 'Carregando…' : 'Nenhum / Sem intermediário'}
          </option>
          {intermediaries.map(i => (
            <option key={i.id} value={i.id} style={{ background: BG_DARK }}>
              {i.full_name}{i.company_name ? ` — ${i.company_name}` : ''}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={openModal}
          disabled={disabled}
          title="Adicionar novo intermediário"
          style={{
            flexShrink: 0,
            background: 'rgba(190,140,74,0.15)',
            border: '1px solid rgba(190,140,74,0.35)',
            borderRadius: RADIUS,
            padding: '7px 10px',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            color: GOLD,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.55 : 1,
            lineHeight: 1,
          }}
          onMouseEnter={e => {
            if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(190,140,74,0.25)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(190,140,74,0.15)'
          }}
        >(+)</button>
      </div>

      {/* ── Mini Modal ── */}
      {showModal && (
        <div
          ref={overlayRef}
          onClick={handleOverlayClick}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Novo Intermediário"
            style={{
              background: '#1e1a14',
              border: '1px solid rgba(190,140,74,0.25)',
              borderRadius: 12,
              padding: '28px 28px 24px',
              width: '100%',
              maxWidth: 480,
              boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 22,
            }}>
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11, fontWeight: 600,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                color: GOLD,
              }}>
                Novo Intermediário
              </span>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none', border: 'none', color: 'rgba(243,238,226,0.40)',
                  fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px',
                }}
                aria-label="Fechar"
              >×</button>
            </div>

            {/* Fields */}
            <div style={fieldWrap}>
              <label style={labelStyle}>Nome Completo *</label>
              <input
                style={inputStyle}
                type="text"
                value={form.full_name}
                onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="Nome do intermediário"
                autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Empresa</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={form.company_name ?? ''}
                  onChange={e => setField('company_name', e.target.value)}
                  placeholder="Agência / empresa"
                />
              </div>
              <div>
                <label style={labelStyle}>País</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={form.country ?? 'Brasil'}
                  onChange={e => setField('country', e.target.value)}
                  placeholder="Brasil"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>E-mail</label>
                <input
                  style={inputStyle}
                  type="email"
                  value={form.email ?? ''}
                  onChange={e => setField('email', e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <label style={labelStyle}>Telefone</label>
                <input
                  style={inputStyle}
                  type="tel"
                  value={form.phone ?? ''}
                  onChange={e => setField('phone', e.target.value)}
                  placeholder="+55 21 99999-9999"
                />
              </div>
            </div>

            <div style={fieldWrap}>
              <label style={labelStyle}>Licença FIFA</label>
              <input
                style={inputStyle}
                type="text"
                value={form.license_number ?? ''}
                onChange={e => setField('license_number', e.target.value)}
                placeholder="Número de licença FIFA"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Observações</label>
              <textarea
                style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
                value={form.notes ?? ''}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Notas adicionais…"
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: 'rgba(185,28,28,0.15)',
                border: '1px solid rgba(185,28,28,0.35)',
                borderRadius: 7, padding: '8px 12px',
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 12, color: '#f87171',
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={saving}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 7, padding: '8px 20px',
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 13, fontWeight: 500,
                  color: 'rgba(243,238,226,0.60)',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  background: saving ? 'rgba(190,140,74,0.30)' : 'rgba(190,140,74,0.20)',
                  border: '1px solid rgba(190,140,74,0.45)',
                  borderRadius: 7, padding: '8px 24px',
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 13, fontWeight: 600,
                  color: saving ? 'rgba(190,140,74,0.50)' : GOLD,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={e => {
                  if (!saving) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(190,140,74,0.30)'
                }}
                onMouseLeave={e => {
                  if (!saving) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(190,140,74,0.20)'
                }}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
