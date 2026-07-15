import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHero from '../components/PageHero'
import SheetIO from '../components/SheetIO'
import { COLS_IMAGE_RIGHTS } from '../lib/xlsx-utils'
import { fmtCurrencyShort, fmtDate } from '../lib/format'
import {
  fetchAllImageRights, fetchAthletes, createImageRight,
} from '../lib/athleteQueries'
import {
  LIABILITY_STATUS_LABELS,
  type ImageRight, type NewImageRightInput, type Athlete,
  type Currency, type LiabilityStatus,
} from '../types/athlete-system'

const font = "'Inter', system-ui, sans-serif"
const fontLabel = "'IBM Plex Mono', 'JetBrains Mono', monospace"
const fontData = "'JetBrains Mono', ui-monospace, monospace"

const CURRENCIES: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']
const STATUSES: LiabilityStatus[] = ['PENDENTE', 'PAGA', 'EM_ATRASO', 'CANCELADA']

// Conversão aproximada p/ BRL (somente exibição de KPIs).
const APPROX_BRL: Record<Currency, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }

const ATHLETE_STATUS_LABELS: Record<Athlete['current_status'], string> = {
  ATIVO: 'Ativo', EMPRESTADO: 'Emprestado', VENDIDO: 'Vendido', DESLIGADO: 'Desligado',
}

const statusBadge: Record<LiabilityStatus, { bg: string; color: string }> = {
  PENDENTE:  { bg: '#fff3e0', color: '#e67e22' },
  PAGA:      { bg: '#e6f9f0', color: '#1a7a4a' },
  EM_ATRASO: { bg: '#ffeef0', color: '#c0392b' },
  CANCELADA: { bg: '#f0f0f0', color: '#777' },
}

function KpiCard({ label, value, sub, bg, border, labelColor, valueColor }: {
  label: string; value: string; sub?: string
  bg: string; border: string; labelColor: string; valueColor: string
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 9, fontWeight: 500, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: fontLabel }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: valueColor, marginTop: 8, fontFamily: fontData, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: labelColor, fontFamily: font, marginTop: 4, opacity: 0.8 }}>{sub}</div>}
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface NewRow {
  athleteId: string
  month: string
  amount: string
  currency: Currency
  status: LiabilityStatus
  notes: string
}

const EMPTY_ROW: NewRow = { athleteId: '', month: '', amount: '', currency: 'BRL', status: 'PENDENTE', notes: '' }

export default function PageImagem() {
  const navigate = useNavigate()

  const [imageRights, setImageRights] = useState<ImageRight[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<NewRow>(EMPTY_ROW)

  const refresh = useCallback(async () => {
    const [rights, ath] = await Promise.all([fetchAllImageRights(), fetchAthletes()])
    setImageRights(rights)
    setAthletes(ath)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([fetchAllImageRights(), fetchAthletes()])
      .then(([rights, ath]) => {
        if (!active) return
        setImageRights(rights)
        setAthletes(ath)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const athleteById = useMemo(() => {
    const m = new Map<string, Athlete>()
    for (const a of athletes) m.set(a.id, a)
    return m
  }, [athletes])

  // Agrupa direitos de imagem por atleta.
  const grouped = useMemo(() => {
    const m = new Map<string, ImageRight[]>()
    for (const r of imageRights) {
      const arr = m.get(r.athlete_id)
      if (arr) arr.push(r)
      else m.set(r.athlete_id, [r])
    }
    return m
  }, [imageRights])

  const summary = useMemo(() => {
    const rows = Array.from(grouped.entries()).map(([athleteId, rights]) => {
      const athlete = athleteById.get(athleteId) ?? null
      const paidCount = rights.filter(r => r.status === 'PAGA').length
      const total = rights.reduce((s, r) => s + r.amount, 0)
      const totalBRL = rights.reduce((s, r) => s + r.amount * (APPROX_BRL[r.currency] ?? 1), 0)
      // Moeda predominante do atleta (para exibir o total).
      const currency: Currency = rights[0]?.currency ?? 'BRL'
      return {
        athleteId, athlete, rights,
        parcelas: rights.length, paidCount, total, totalBRL, currency,
      }
    })
    rows.sort((a, b) => b.totalBRL - a.totalBRL)
    return rows
  }, [grouped, athleteById])

  // ── KPIs (aproximados em BRL) ──
  const totalMensalBRL = useMemo(
    () => imageRights.reduce((s, r) => s + r.amount * (APPROX_BRL[r.currency] ?? 1), 0),
    [imageRights],
  )
  const totalAnualBRL = totalMensalBRL * 12
  const maiorAtleta = summary.length > 0 ? summary[0] : null
  const totalAtrasadoBRL = useMemo(
    () => imageRights
      .filter(r => r.status === 'EM_ATRASO')
      .reduce((s, r) => s + r.amount * (APPROX_BRL[r.currency] ?? 1), 0),
    [imageRights],
  )

  const th: React.CSSProperties = {
    padding: '9px 10px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase',
    color: 'var(--table-header-color)', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--divider-strong)',
    fontFamily: fontLabel, letterSpacing: '0.14em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
    userSelect: 'none',
  }
  const td: React.CSSProperties = {
    padding: '12px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: fontData,
    whiteSpace: 'normal', verticalAlign: 'middle', fontVariantNumeric: 'tabular-nums',
  }
  const tdr: React.CSSProperties = { ...td, textAlign: 'right' }

  // ── Export rows (linhas cruas) ──
  const exportRows = useMemo(
    () => imageRights.map(r => ({
      id: r.id,
      athlete_id: r.athlete_id,
      month: r.month,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      paid_date: r.paid_date ?? '',
      notes: r.notes ?? '',
    })) as unknown as Record<string, unknown>[],
    [imageRights],
  )

  const handleImport = useCallback(async (sheets: Record<string, Record<string, string>[]>) => {
    const firstKey = Object.keys(sheets)[0]
    const rows = firstKey ? (sheets[firstKey] ?? []) : []
    for (const r of rows) {
      const atletaId = String(r['Atleta ID'] ?? '').trim()
      if (!atletaId) continue // pula linhas sem Atleta ID
      const currencyRaw = String(r['Moeda'] ?? 'BRL').trim().toUpperCase()
      const currency: Currency = (CURRENCIES as string[]).includes(currencyRaw) ? (currencyRaw as Currency) : 'BRL'
      const statusRaw = String(r['Status'] ?? 'PENDENTE').trim().toUpperCase()
      const status: LiabilityStatus = (STATUSES as string[]).includes(statusRaw) ? (statusRaw as LiabilityStatus) : 'PENDENTE'
      const input: NewImageRightInput = {
        month: String(r['Mês (AAAA-MM)'] ?? '').trim(),
        amount: Number(r['Valor']) || 0,
        currency,
        status,
        notes: String(r['Observações'] ?? ''),
      }
      await createImageRight(atletaId, input)
    }
    await refresh()
  }, [refresh])

  async function handleCreate() {
    if (!form.athleteId) return
    setSaving(true)
    try {
      const input: NewImageRightInput = {
        month: form.month.trim(),
        amount: Number(form.amount) || 0,
        currency: form.currency,
        status: form.status,
        notes: form.notes,
      }
      await createImageRight(form.athleteId, input)
      await refresh()
      setShowModal(false)
      setForm(EMPTY_ROW)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 10px', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.14em',
    color: 'var(--ink-secondary)', fontFamily: fontLabel, marginBottom: 4, display: 'block',
  }

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>

      <PageHero title="Direitos de Imagem" subtitle="GESTÃO DE IMAGEM">
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'rgba(190,140,74,0.15)', color: '#be8c4a',
            border: '1px solid rgba(190,140,74,0.40)', borderRadius: 999,
            padding: '8px 18px', fontFamily: fontLabel, fontSize: 10, fontWeight: 500,
            letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          + Nova Parcela
        </button>
        <SheetIO
          exportFilename="direitos-imagem.xlsx"
          exportSheets={[{ name: 'Direitos_Imagem', cols: COLS_IMAGE_RIGHTS, rows: exportRows }]}
          onImport={handleImport}
        />
      </PageHero>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${totalAtrasadoBRL > 0 ? 4 : 3}, 1fr)`, gap: 12, marginBottom: 12 }}>
        <KpiCard
          label="Total Mensal" value={fmtCurrencyShort(totalMensalBRL, 'BRL')} sub="≈ BRL (aprox.)"
          bg="var(--gold-tint)" border="rgba(190,140,74,0.25)" labelColor="var(--gold-deep)" valueColor="var(--gold-deep)"
        />
        <KpiCard
          label="Total Anual" value={fmtCurrencyShort(totalAnualBRL, 'BRL')} sub="≈ BRL (aprox.)"
          bg="rgba(190,140,74,0.08)" border="rgba(190,140,74,0.18)" labelColor="var(--ink-secondary)" valueColor="var(--ink-primary)"
        />
        <KpiCard
          label="Atleta c/ Maior Imagem"
          value={maiorAtleta?.athlete?.short_name ?? maiorAtleta?.athlete?.full_name ?? '—'}
          sub={maiorAtleta ? `${fmtCurrencyShort(maiorAtleta.totalBRL, 'BRL')} ≈ BRL` : ''}
          bg="var(--cream-canvas)" border="var(--divider-strong)" labelColor="var(--ink-secondary)" valueColor="var(--ink-primary)"
        />
        {totalAtrasadoBRL > 0 && (
          <KpiCard
            label="Total em Atraso" value={fmtCurrencyShort(totalAtrasadoBRL, 'BRL')} sub="≈ BRL (aprox.)"
            bg="var(--neg-tint)" border="rgba(185,28,28,0.20)" labelColor="var(--neg)" valueColor="var(--neg)"
          />
        )}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontFamily: font }}>
          Carregando…
        </div>
      ) : imageRights.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontFamily: font }}>
          Nenhum direito de imagem cadastrado.
        </div>
      ) : (
        <>
          {/* ── Galeria ── */}
          <div className="card" style={{ padding: '16px', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 12, fontFamily: font }}>
              Galeria de Atletas
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
              {summary.map(s => (
                <div key={s.athleteId} style={{
                  borderRadius: 8, overflow: 'hidden', background: 'var(--bg-subtle2)',
                  border: '1px solid var(--card-border)',
                  display: 'flex', flexDirection: 'column',
                }}>
                  {s.athlete?.profile_photo_url ? (
                    <img src={s.athlete.profile_photo_url} alt={s.athlete.full_name}
                      style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                  ) : (
                    <div style={{
                      width: '100%', aspectRatio: '3/4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#1a1410', color: '#dcc89a', fontSize: 28, fontWeight: 700, fontFamily: fontData,
                    }}>
                      {initials(s.athlete?.full_name ?? '?')}
                    </div>
                  )}
                  <div style={{ padding: '8px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {s.athlete?.short_name ?? s.athlete?.full_name ?? '(atleta removido)'}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {fmtCurrencyShort(s.total, s.currency)}
                    </div>
                    {s.athlete && (
                      <button
                        onClick={() => navigate(`/atletas/${s.athleteId}`)}
                        style={{
                          marginTop: 6, padding: '6px 10px', fontSize: 10, fontWeight: 600,
                          background: '#111', color: '#fff', border: 'none', borderRadius: 6,
                          cursor: 'pointer', fontFamily: font, letterSpacing: 0.3, width: '100%',
                        }}
                      >
                        Ver Atleta →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Tabela resumo por atleta ── */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider-strong)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: font }}>
              Resumo por Atleta
            </div>
            <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: 'calc(100vh - 480px)' }}>
              <table style={{ tableLayout: 'auto', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Atleta</th>
                    <th style={th}>Status</th>
                    <th style={th}>Posição</th>
                    <th style={{ ...th, textAlign: 'right' }}>Parcelas</th>
                    <th style={{ ...th, textAlign: 'right' }}>Pagas</th>
                    <th style={{ ...th, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.athleteId}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {s.athlete?.profile_photo_url ? (
                            <img src={s.athlete.profile_photo_url} alt={s.athlete.full_name}
                              style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', background: '#eee', flexShrink: 0 }} />
                          ) : (
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                              background: '#1a1410', color: '#dcc89a', fontSize: 10, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontData,
                            }}>
                              {initials(s.athlete?.full_name ?? '?')}
                            </div>
                          )}
                          <span style={{ fontWeight: 600 }}>
                            {s.athlete?.full_name ?? '(atleta removido)'}
                          </span>
                        </div>
                      </td>
                      <td style={td}>
                        {s.athlete ? ATHLETE_STATUS_LABELS[s.athlete.current_status] : '—'}
                      </td>
                      <td style={td}>{s.athlete?.position ?? '—'}</td>
                      <td style={tdr}>{s.parcelas}</td>
                      <td style={tdr}>
                        <span style={{
                          background: statusBadge.PAGA.bg, color: statusBadge.PAGA.color,
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          fontFamily: font, whiteSpace: 'nowrap', display: 'inline-block',
                        }}>
                          {s.paidCount}/{s.parcelas}
                        </span>
                      </td>
                      <td style={{ ...tdr, fontWeight: 600 }}>{fmtCurrencyShort(s.total, s.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Tabela detalhada de parcelas ── */}
          <div className="card" style={{ overflow: 'hidden', marginTop: 12 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider-strong)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: font }}>
              Parcelas de Direito de Imagem
            </div>
            <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: 'calc(100vh - 480px)' }}>
              <table style={{ tableLayout: 'auto', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Atleta</th>
                    <th style={th}>Mês</th>
                    <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                    <th style={th}>Status</th>
                    <th style={th}>Data Pagto</th>
                    <th style={th}>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {imageRights.map(r => {
                    const a = athleteById.get(r.athlete_id)
                    const badge = statusBadge[r.status]
                    return (
                      <tr key={r.id}>
                        <td style={td}>{a?.short_name ?? a?.full_name ?? '(atleta removido)'}</td>
                        <td style={td}>{r.month}</td>
                        <td style={{ ...tdr, fontWeight: 600 }}>{fmtCurrencyShort(r.amount, r.currency)}</td>
                        <td style={td}>
                          <span style={{
                            background: badge.bg, color: badge.color,
                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                            fontFamily: font, whiteSpace: 'nowrap', display: 'inline-block',
                          }}>
                            {LIABILITY_STATUS_LABELS[r.status]}
                          </span>
                        </td>
                        <td style={td}>{fmtDate(r.paid_date)}</td>
                        <td style={{ ...td, fontFamily: font }}>{r.notes ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Nova Parcela ── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.80)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
        }}>
          <div style={{
            background: 'var(--cream-page, #f9f7f2)', borderRadius: 14, width: '100%', maxWidth: 520,
            maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.40)',
          }}>
            <div style={{
              background: '#1a1410', padding: '18px 28px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.3rem', fontWeight: 700, color: '#f5f2ec' }}>
                Nova Parcela de Imagem
              </div>
              <button onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(243,238,226,0.45)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>
                ✕
              </button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Atleta *</label>
                <select value={form.athleteId} onChange={e => setForm(f => ({ ...f, athleteId: e.target.value }))} style={inputStyle}>
                  <option value="">Selecione um atleta…</option>
                  {athletes.map(a => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Mês</label>
                  <input type="text" placeholder="AAAA-MM" value={form.month}
                    onChange={e => setForm(f => ({ ...f, month: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Valor</label>
                  <input type="number" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Moeda</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as Currency }))} style={inputStyle}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as LiabilityStatus }))} style={inputStyle}>
                    {STATUSES.map(s => <option key={s} value={s}>{LIABILITY_STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Observações</label>
                <textarea value={form.notes} rows={3}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: font }} />
              </div>
            </div>

            <div style={{
              padding: '16px 24px', borderTop: '1px solid var(--divider-strong)',
              display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#f0ede6',
            }}>
              <button onClick={() => setShowModal(false)}
                style={{
                  background: 'transparent', color: '#888', border: '1px solid #ccc8c0', borderRadius: 999,
                  padding: '8px 18px', fontFamily: fontLabel, fontSize: 10, fontWeight: 500,
                  letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
                }}>
                Cancelar
              </button>
              <button onClick={handleCreate} disabled={saving || !form.athleteId}
                style={{
                  background: '#1a1410', color: '#dcc89a', border: 'none', borderRadius: 999,
                  padding: '8px 18px', fontFamily: fontLabel, fontSize: 10, fontWeight: 500,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: (saving || !form.athleteId) ? 'not-allowed' : 'pointer',
                  opacity: (saving || !form.athleteId) ? 0.5 : 1,
                }}>
                {saving ? 'Salvando…' : 'Criar Parcela'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
