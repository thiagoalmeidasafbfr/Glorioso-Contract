import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import PageHero from '../components/PageHero'
import SheetIO from '../components/SheetIO'
import { COLS_PASSIVOS_INTERMEDIARIO } from '../lib/xlsx-utils'
import {
  fetchIntermediaries, createIntermediary, updateIntermediary,
  type Intermediary, type NewIntermediaryInput,
} from '../lib/intermediaryQueries'

const font = "'Inter', system-ui, sans-serif"
const fontLabel = "'IBM Plex Mono', 'JetBrains Mono', monospace"
const fontData = "'JetBrains Mono', ui-monospace, monospace"

type Moeda = 'BRL' | 'USD' | 'EUR'
type StatusParcela = 'A pagar' | 'Atrasado' | 'Pago' | 'Parcial' | 'Aguardando condição'

interface PassivoIntermediario {
  id: number; atletaId: number; atleta: string; contrato: string; despesa: string
  intermediario: string; condicional: boolean; parcela: string; vencimento: string
  valor: number; moeda: Moeda; parcial: number | null; moedaParcial: Moeda | null
  saldoBRL: number; condicao: string; teorMulta: string; vencAntecipado: boolean
  dataLiquidacao: string | null; status: StatusParcela
}

function mapPassivo(r: Record<string, unknown>): PassivoIntermediario {
  return {
    id: r.id as number, atletaId: r.atleta_id as number,
    atleta: (r.atletas as Record<string, unknown> | null)?.nome as string ?? '',
    contrato: (r.contrato as string) ?? '', despesa: (r.despesa as string) ?? '',
    intermediario: (r.intermediario as string) ?? '',
    condicional: Boolean(r.condicional), parcela: (r.parcela as string) ?? '',
    vencimento: (r.vencimento as string) ?? '', valor: Number(r.valor) || 0,
    moeda: (r.moeda as Moeda) ?? 'BRL',
    parcial: r.parcial != null ? Number(r.parcial) : null,
    moedaParcial: (r.moeda_parcial as Moeda) || null,
    saldoBRL: Number(r.saldo_brl) || 0, condicao: (r.condicao as string) ?? '',
    teorMulta: (r.teor_multa as string) ?? '', vencAntecipado: Boolean(r.venc_antecipado),
    dataLiquidacao: (r.data_liquidacao as string) || null,
    status: (r.status as StatusParcela) ?? 'A pagar',
  }
}

const fmtData = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'
const statusBg: Record<string, string> = {
  'Pago': '#e6f9f0', 'A pagar': '#fff8e1', 'Atrasado': '#fff0f0',
  'Parcial': '#e8f4fd', 'Aguardando condição': '#f5f5f5',
}
const statusColor: Record<string, string> = {
  'Pago': '#1a7a4a', 'A pagar': '#b8860b', 'Atrasado': '#c0392b',
  'Parcial': '#1a6fa8', 'Aguardando condição': '#666',
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useApp()
  return (
    <span style={{
      background: statusBg[status] ?? '#f0f0f0', color: statusColor[status] ?? '#3a2e1c',
      padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 500, fontFamily: fontLabel,
      textTransform: 'uppercase', letterSpacing: '0.10em',
    }}>{t(status)}</span>
  )
}

function FakeShield({ name }: { name: string }) {
  const initials = name.replace(/[^A-Za-z\s]/g, '').split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
  return (
    <svg width="52" height="58" viewBox="0 0 52 58" fill="none">
      <path d="M26 3L49 11V30C49 43 38 52 26 55C14 52 3 43 3 30V11Z" fill="#1a1410" stroke="rgba(190,140,74,0.4)" strokeWidth="1.5" />
      <text x="26" y="33" textAnchor="middle" fill="white" fontSize="15" fontFamily="Inter,sans-serif" fontWeight="700">{initials}</text>
    </svg>
  )
}

function KpiCard({ label, value, sub, bg, border, labelColor, valueColor, footnote }: {
  label: string; value: string; sub?: string; bg: string; border: string
  labelColor: string; valueColor: string; footnote?: string
}) {
  return (
    <div>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 9, fontWeight: 500, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: fontLabel }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 500, color: valueColor, marginTop: 8, fontFamily: fontData, lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: labelColor, fontFamily: font, marginTop: 4, opacity: 0.8 }}>{sub}</div>}
      </div>
      {footnote && <div style={{ fontSize: 9, color: 'var(--text-faint)', fontStyle: 'italic', fontFamily: fontLabel, marginTop: 4, paddingLeft: 2 }}>{footnote}</div>}
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 2 }}>↕</span>
  return <span style={{ fontSize: 9, marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

// ── Intermediary CRUD Modal ───────────────────────────────────────────────

function IntermediaryModal({
  initial, onSave, onClose,
}: {
  initial?: Intermediary | null
  onSave: (i: Intermediary) => void
  onClose: () => void
}) {
  const [f, setF] = useState<NewIntermediaryInput>({
    full_name: initial?.full_name ?? '',
    company_name: initial?.company_name ?? null,
    email: initial?.email ?? null,
    phone: initial?.phone ?? null,
    country: initial?.country ?? 'Brasil',
    license_number: initial?.license_number ?? null,
    notes: initial?.notes ?? null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
    background: 'var(--cream-canvas,#faf6ed)', border: '1px solid rgba(26,20,16,0.15)',
    color: '#1a1410', fontFamily: font, boxSizing: 'border-box',
  }

  async function handleSave() {
    if (!f.full_name.trim()) return
    setSaving(true); setError(null)
    try {
      let result: Intermediary
      if (initial?.id) result = await updateIntermediary(initial.id, f)
      else result = await createIntermediary(f)
      onSave(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card,#faf6ed)', borderRadius: 12, padding: 28, width: 520, maxWidth: '96vw', border: '1px solid rgba(190,140,74,0.25)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1410', fontFamily: font, marginBottom: 18 }}>
          {initial ? 'Editar Intermediário' : 'Novo Intermediário'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            ['Nome Completo *', 'full_name', false],
            ['Empresa / Agência', 'company_name', false],
            ['Email', 'email', false],
            ['Telefone', 'phone', false],
            ['País', 'country', false],
            ['Licença FIFA', 'license_number', false],
          ].map(([label, key]) => (
            <div key={key as string}>
              <div style={{ fontSize: 9, fontWeight: 600, fontFamily: fontLabel, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(26,20,16,0.50)', marginBottom: 3 }}>{label as string}</div>
              <input style={inp} value={(f[key as keyof NewIntermediaryInput] as string) ?? ''}
                onChange={e => setF(p => ({ ...p, [key as string]: e.target.value || null }))} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, fontFamily: fontLabel, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(26,20,16,0.50)', marginBottom: 3 }}>Notas</div>
          <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.notes ?? ''}
            onChange={e => setF(p => ({ ...p, notes: e.target.value || null }))} />
        </div>
        {error && <div style={{ marginTop: 8, padding: '6px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#dc2626', fontFamily: font }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid rgba(26,20,16,0.15)', background: 'transparent', color: 'rgba(26,20,16,0.55)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving || !f.full_name.trim()}
            style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: '#be8c4a', color: '#fff', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function PageIntermediarios() {
  const { fmtMiC, symbol, t } = useApp()

  const [passivosIntermediario, setPassivosIntermediario] = useState<PassivoIntermediario[]>([])
  const [intermediaries, setIntermediaries] = useState<Intermediary[]>([])
  const [activeTab, setActiveTab] = useState<'passivos' | 'cadastro'>('passivos')
  const [showModal, setShowModal] = useState(false)
  const [editIntermediary, setEditIntermediary] = useState<Intermediary | null>(null)

  const [sortField, setSortField] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const [interFiltro, setInterFiltro] = useState('Todos')
  const [atletaFiltro, setAtletaFiltro] = useState('Todos')
  const [condFiltro, setCondFiltro] = useState<'Todos' | 'Certo' | 'Condicional'>('Todos')

  useEffect(() => {
    supabase.from('passivos_intermediario').select('*, atletas(nome)').order('vencimento')
      .then(({ data, error }) => {
        if (!error && data) setPassivosIntermediario(data.map(r => mapPassivo(r as unknown as Record<string, unknown>)))
      })
    fetchIntermediaries().then(setIntermediaries).catch(console.error)
  }, [])

  const intermediariosOpts = useMemo(() =>
    ['Todos', ...Array.from(new Set(passivosIntermediario.map(p => p.intermediario))).sort()], [passivosIntermediario])
  const atletasOpts = useMemo(() =>
    ['Todos', ...Array.from(new Set(passivosIntermediario.map(p => p.atleta))).filter(Boolean).sort()], [passivosIntermediario])

  const filtrados = useMemo(() => passivosIntermediario.filter(p => {
    const okInter = interFiltro === 'Todos' || p.intermediario === interFiltro
    const okAtl = atletaFiltro === 'Todos' || p.atleta === atletaFiltro
    const okCond = condFiltro === 'Todos' || (condFiltro === 'Certo' ? !p.condicional : p.condicional)
    return okInter && okAtl && okCond
  }), [interFiltro, atletaFiltro, condFiltro, passivosIntermediario])

  const sorted = useMemo(() => [...filtrados].sort((a, b) => {
    let va: string | number = 0, vb: string | number = 0
    if (sortField === 'intermediario') { va = a.intermediario; vb = b.intermediario }
    else if (sortField === 'atleta') { va = a.atleta; vb = b.atleta }
    else if (sortField === 'contrato') { va = a.contrato; vb = b.contrato }
    else if (sortField === 'despesa') { va = a.despesa; vb = b.despesa }
    else if (sortField === 'vencimento') { va = a.vencimento; vb = b.vencimento }
    else if (sortField === 'saldoBRL') { va = a.saldoBRL; vb = b.saldoBRL }
    else if (sortField === 'valor') { va = a.valor; vb = b.valor }
    else if (sortField === 'status') { va = a.status; vb = b.status }
    else if (sortField === 'dataLiquidacao') { va = a.dataLiquidacao ?? ''; vb = b.dataLiquidacao ?? '' }
    else return 0
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  }), [filtrados, sortField, sortDir])

  const totalGeral  = filtrados.reduce((s, p) => s + p.saldoBRL, 0)
  const totalPago   = filtrados.filter(p => p.status === 'Pago').reduce((s, p) => s + p.saldoBRL, 0)
  const totalAcordo = filtrados.filter(p => p.status === 'Parcial').reduce((s, p) => s + (p.parcial ?? 0), 0)
  const totalAPagar = filtrados.filter(p => p.status === 'A pagar' || p.status === 'Aguardando condição').reduce((s, p) => s + p.saldoBRL, 0)
  const totalAtraso = filtrados.filter(p => p.status === 'Atrasado').reduce((s, p) => s + p.saldoBRL, 0)
  const interNome = interFiltro !== 'Todos' ? interFiltro : null

  const th: React.CSSProperties = {
    padding: '9px 10px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase',
    color: 'var(--table-header-color)', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--divider-strong)',
    fontFamily: fontLabel, letterSpacing: '0.14em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
    cursor: 'pointer', userSelect: 'none',
  }
  const td: React.CSSProperties = {
    padding: '14px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: fontData,
    whiteSpace: 'normal', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums',
  }
  const tdr: React.CSSProperties = { ...td, textAlign: 'right' }

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>

      <PageHero title="Intermediários" subtitle="PASSIVO — INTERMEDIÁRIOS">
        <SheetIO
          exportFilename="passivos-intermediarios.xlsx"
          exportSheets={[{ name: 'Passivos_Intermediarios', cols: COLS_PASSIVOS_INTERMEDIARIO, rows: passivosIntermediario as unknown as Record<string, unknown>[] }]}
          onImport={sheets => {
            const rows = sheets['Passivos_Intermediarios'] ?? sheets[Object.keys(sheets)[0]] ?? []
            setPassivosIntermediario(rows.map((r, i) => ({
              id: Number(r['ID']) || i + 1, atletaId: Number(r['Atleta ID']) || 0,
              atleta: (r['Atleta'] as string) ?? '',
              contrato: r['Contrato'] as string ?? '', despesa: r['Despesa'] as string ?? '',
              intermediario: r['Intermediário'] as string ?? '',
              condicional: r['Condicional'] === 'true', parcela: r['Parcela'] as string ?? '',
              vencimento: r['Vencimento'] as string ?? '', valor: Number(r['Valor']) || 0,
              moeda: (r['Moeda'] as Moeda) ?? 'BRL',
              parcial: r['Parcial'] ? Number(r['Parcial']) : null,
              moedaParcial: (r['Moeda Parcial'] as Moeda) || null,
              saldoBRL: Number(r['Saldo BRL']) || 0, condicao: r['Condição'] as string ?? '',
              teorMulta: r['Teor Multa'] as string ?? '', vencAntecipado: r['Venc Antecipado'] === 'true',
              dataLiquidacao: r['Data Liquidação'] as string || null,
              status: (r['Status'] as PassivoIntermediario['status']) ?? 'A pagar',
            })))
          }}
        />
      </PageHero>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--divider)' }}>
        {(['passivos', 'cadastro'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 20px', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid #be8c4a' : '2px solid transparent',
            fontFamily: fontLabel, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: activeTab === tab ? '#be8c4a' : 'var(--text-muted)', cursor: 'pointer', marginBottom: -1,
          }}>
            {tab === 'passivos' ? 'Passivos' : 'Cadastro de Agentes'}
          </button>
        ))}
      </div>

      {/* ── Tab: Cadastro ── */}
      {activeTab === 'cadastro' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={() => { setEditIntermediary(null); setShowModal(true) }}
              style={{ background: '#be8c4a', border: 'none', borderRadius: 7, padding: '8px 20px', fontFamily: font, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
              + Novo Intermediário
            </button>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Nome', 'Empresa', 'Email', 'Telefone', 'País', 'Licença', ''].map(h => (
                    <th key={h} style={{ ...th, cursor: 'default' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {intermediaries.length === 0 && (
                  <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>Nenhum intermediário cadastrado</td></tr>
                )}
                {intermediaries.map(i => (
                  <tr key={i.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{i.full_name}</td>
                    <td style={td}>{i.company_name ?? '—'}</td>
                    <td style={td}>{i.email ?? '—'}</td>
                    <td style={td}>{i.phone ?? '—'}</td>
                    <td style={td}>{i.country ?? '—'}</td>
                    <td style={td}>{i.license_number ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => { setEditIntermediary(i); setShowModal(true) }}
                        style={{ background: 'none', border: '1px solid rgba(26,20,16,0.15)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontFamily: font, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Passivos ── */}
      {activeTab === 'passivos' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 200px', gap: 12, marginBottom: 12, alignItems: 'stretch' }}>
            {/* Filtros */}
            <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>{t('Intermediário')}</div>
                <select value={interFiltro} onChange={e => setInterFiltro(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
                  {intermediariosOpts.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>{t('Atleta')}</div>
                <select value={atletaFiltro} onChange={e => setAtletaFiltro(e.target.value)} style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
                  {atletasOpts.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>{t('Certo/Condicional')}</div>
                <select value={condFiltro} onChange={e => setCondFiltro(e.target.value as typeof condFiltro)} style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
                  {(['Todos', 'Certo', 'Condicional'] as const).map(c => <option key={c}>{t(c)}</option>)}
                </select>
              </div>
              <div style={{ marginTop: 'auto', color: 'var(--text-faint)', fontSize: 11, fontFamily: font }}>
                {filtrados.length} {filtrados.length !== 1 ? t('parcelas') : t('parcela')}
              </div>
            </div>

            {/* Display do Intermediário */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', gap: 20 }}>
              {interNome ? (
                <>
                  <div style={{ flexShrink: 0 }}><FakeShield name={interNome} /></div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Intermediário')}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: font, lineHeight: 1.1 }}>{interNome}</div>
                    {intermediaries.find(i => i.full_name === interNome) && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, marginTop: 4 }}>
                        {intermediaries.find(i => i.full_name === interNome)?.company_name ?? ''}
                        {intermediaries.find(i => i.full_name === interNome)?.email ? ` · ${intermediaries.find(i => i.full_name === interNome)?.email}` : ''}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Intermediário')}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-faint)', fontFamily: font }}>—</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginTop: 4 }}>{t('Selecione um intermediário para exibir')}</div>
                </div>
              )}
            </div>

            {/* Valor Total */}
            <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '4px solid #111' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font }}>{t('Valor Total')} ({symbol})</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', marginTop: 10, fontFamily: font, lineHeight: 1 }}>{fmtMiC(totalGeral)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: font, marginTop: 6 }}>{t('Saldo total filtrado')}</div>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
            <KpiCard label={t('Valores Pagos')} value={fmtMiC(totalPago)} sub={t('Incluindo Parciais')} bg="var(--pos-tint)" border="rgba(22,101,52,0.20)" labelColor="var(--pos)" valueColor="var(--pos)" footnote={t('*Considerando a PTAX do Pagamento')} />
            <KpiCard label={t('Valores em Acordo')} value={fmtMiC(totalAcordo)} sub={`(${symbol})`} bg="var(--cream-canvas)" border="var(--divider-strong)" labelColor="var(--ink-secondary)" valueColor="var(--ink-primary)" footnote={t('*Considerando a PTAX do Vencimento')} />
            <KpiCard label={t('Valores a Pagar')} value={fmtMiC(totalAPagar)} sub={`(${symbol})`} bg="var(--warn-tint)" border="rgba(184,138,42,0.25)" labelColor="var(--warn)" valueColor="var(--gold-deep)" footnote={t('*Considerando a PTAX atual.')} />
            <KpiCard label={t('Valores em Atraso')} value={fmtMiC(totalAtraso)} sub={`(${symbol})`} bg="var(--neg-tint)" border="rgba(185,28,28,0.20)" labelColor="var(--neg)" valueColor="var(--neg)" footnote={t('*Considerando a PTAX do Vencimento')} />
          </div>

          {/* Tabela */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider-soft)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: font }}>{t('Passivo Intermediários')}</div>
            <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 'calc(100vh - 420px)' }}>
              <table style={{ tableLayout: 'auto', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th} onClick={() => handleSort('intermediario')}>{t('Intermediário')}<SortIcon active={sortField==='intermediario'} dir={sortDir} /></th>
                    <th style={th} onClick={() => handleSort('atleta')}>{t('Atleta')}<SortIcon active={sortField==='atleta'} dir={sortDir} /></th>
                    <th style={th} onClick={() => handleSort('contrato')}>{t('Contrato')}<SortIcon active={sortField==='contrato'} dir={sortDir} /></th>
                    <th style={th} onClick={() => handleSort('despesa')}>{t('Despesa')}<SortIcon active={sortField==='despesa'} dir={sortDir} /></th>
                    <th style={{ ...th, textAlign: 'center' }}>{t('V.A')}</th>
                    <th style={th}>{t('Parcela')}</th>
                    <th style={{ ...th, textAlign: 'right' }} onClick={() => handleSort('valor')}>{t('Valor Contrato')}<SortIcon active={sortField==='valor'} dir={sortDir} /></th>
                    <th style={th}>{t('Moeda')}</th>
                    <th style={th} onClick={() => handleSort('vencimento')}>{t('Vencimento')}<SortIcon active={sortField==='vencimento'} dir={sortDir} /></th>
                    <th style={{ ...th, textAlign: 'right' }} onClick={() => handleSort('saldoBRL')}>{t('Saldo')} (R$)<SortIcon active={sortField==='saldoBRL'} dir={sortDir} /></th>
                    <th style={{ ...th, textAlign: 'right' }}>{t('Parcial')}</th>
                    <th style={th}>{t('Moeda Parc.')}</th>
                    <th style={th}>{t('Teor da Multa')}</th>
                    <th style={th} onClick={() => handleSort('dataLiquidacao')}>{t('Data Liquidação')}<SortIcon active={sortField==='dataLiquidacao'} dir={sortDir} /></th>
                    <th style={th} onClick={() => handleSort('status')}>{t('Status')}<SortIcon active={sortField==='status'} dir={sortDir} /></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 && <tr><td colSpan={15} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>{t('Nenhum registro encontrado')}</td></tr>}
                  {sorted.map(p => (
                    <tr key={p.id} style={{ background: p.status === 'Atrasado' ? 'var(--row-late-bg)' : undefined }}>
                      <td style={td}>{p.intermediario}</td>
                      <td style={td}>{p.atleta}</td>
                      <td style={td}>{p.contrato}</td>
                      <td style={td}>{t(p.despesa)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{p.vencAntecipado ? t('Sim') : t('Não')}</td>
                      <td style={td}>{p.parcela}</td>
                      <td style={tdr}>{p.valor.toLocaleString('pt-BR')}</td>
                      <td style={td}>{p.moeda}</td>
                      <td style={td}>{fmtData(p.vencimento)}</td>
                      <td style={{ ...tdr, fontWeight: 600 }}>{p.saldoBRL.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                      <td style={tdr}>{p.parcial?.toLocaleString('pt-BR') ?? '—'}</td>
                      <td style={td}>{p.moedaParcial ?? '—'}</td>
                      <td style={td}>{p.teorMulta || '—'}</td>
                      <td style={td}>{p.dataLiquidacao ? fmtData(p.dataLiquidacao) : '—'}</td>
                      <td style={td}><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showModal && (
        <IntermediaryModal
          initial={editIntermediary}
          onSave={saved => {
            setIntermediaries(prev => {
              const idx = prev.findIndex(i => i.id === saved.id)
              if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
              return [...prev, saved].sort((a, b) => a.full_name.localeCompare(b.full_name))
            })
            setShowModal(false)
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
