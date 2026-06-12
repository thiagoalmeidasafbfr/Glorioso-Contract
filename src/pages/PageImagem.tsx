import React, { useState, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import PageHero from '../components/PageHero'
import SheetIO from '../components/SheetIO'
import { COLS_PARCELAS_IMAGEM } from '../lib/xlsx-utils'

const font = "'Inter', system-ui, sans-serif"
const fontLabel = "'IBM Plex Mono', 'JetBrains Mono', monospace"
const fontData = "'JetBrains Mono', ui-monospace, monospace"

// ── Inline types ──────────────────────────────────────────────────────────────

type StatusParcela = 'Pago' | 'A pagar' | 'Atrasado' | 'Parcial' | 'Aguardando condição'

interface ParcelaDireitoImagem {
  id: number
  atletaId: number
  mes: string
  valor: number
  status: StatusParcela
}

interface AtletaImagem {
  id: number
  nome: string
  statusContrato: string
  alocacao: string
  inicioContrato: string
  fimContrato: string
  direitoImagem: number
  fotoArquivo: string
}

// ── Inline helpers (previously from mockData) ─────────────────────────────────

const fmtData = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

const statusColor: Record<string, string> = {
  'Pago': '#1a7a4a',
  'A pagar': '#555',
  'Atrasado': '#c0392b',
  'Parcial': '#e67e22',
  'Aguardando condição': '#1a6fa0',
}

const statusBg: Record<string, string> = {
  'Pago': '#e6f9f0',
  'A pagar': '#f5f5f5',
  'Atrasado': '#ffeef0',
  'Parcial': '#fff3e0',
  'Aguardando condição': '#e8f4fd',
}

// ── Sort / KPI types ──────────────────────────────────────────────────────────

type SortField = 'nome' | 'statusContrato' | 'alocacao' | 'inicioContrato' | 'fimContrato' | 'parcelas' | 'direitoImagem' | 'pagas'
type SortDir = 'asc' | 'desc'

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 2 }}>↕</span>
  return <span style={{ fontSize: 9, marginLeft: 2 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
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

const contractBg: Record<string, string> = {
  'Elenco': '#e6f9f0', 'Emprestado': '#fff3e0', 'Rescindido': '#ffeef0',
}
const contractColor: Record<string, string> = {
  'Elenco': '#1a7a4a', 'Emprestado': '#e67e22', 'Rescindido': '#c0392b',
}

export default function PageImagem() {
  const { fmtMiC, symbol, t, navigateToAtleta } = useApp()

  // ── Data state ───────────────────────────────────────────────────────────────
  const [atletas, setAtletas] = useState<AtletaImagem[]>([])
  const [parcelasDireitoImagem, setParcelasDireitoImagem] = useState<ParcelaDireitoImagem[]>([])

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('Todos')
  const [sortField, setSortField] = useState<SortField>('direitoImagem')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  // ── Load from Supabase ───────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('atletas')
        .select('id, nome, status_contrato, alocacao, inicio_contrato, fim_contrato, direito_imagem, foto_arquivo, parcelas_direito_imagem(*)')
        .order('nome')

      if (error) {
        console.error(error)
        return
      }

      const atletasMapped: AtletaImagem[] = []
      const parcelasMapped: ParcelaDireitoImagem[] = []

      for (const row of data ?? []) {
        atletasMapped.push({
          id: row.id,
          nome: row.nome,
          statusContrato: row.status_contrato,
          alocacao: row.alocacao,
          inicioContrato: row.inicio_contrato,
          fimContrato: row.fim_contrato,
          direitoImagem: row.direito_imagem,
          fotoArquivo: row.foto_arquivo,
        })

        for (const p of row.parcelas_direito_imagem ?? []) {
          parcelasMapped.push({
            id: p.id,
            atletaId: row.id,
            mes: p.mes,
            valor: p.valor,
            status: p.status as StatusParcela,
          })
        }
      }

      setAtletas(atletasMapped)
      setParcelasDireitoImagem(parcelasMapped)
    }

    load()
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const filtrados = useMemo(() => atletas.filter(a => {
    const okBusca = a.nome.toLowerCase().includes(busca.toLowerCase())
    const okStatus = statusFiltro === 'Todos' || statusFiltro === t('Todos') || a.statusContrato === statusFiltro
    return okBusca && okStatus
  }), [atletas, busca, statusFiltro, t])

  const atletasComDados = useMemo(() => filtrados.map(a => {
    const parcelas = parcelasDireitoImagem.filter(p => p.atletaId === a.id)
    const totalParcelas = parcelas.length
    const pagas = parcelas.filter(p => p.status === 'Pago').length
    return { ...a, totalParcelas, pagas }
  }), [filtrados, parcelasDireitoImagem])

  const sorted = useMemo(() => [...atletasComDados].sort((a, b) => {
    let va: string | number = 0, vb: string | number = 0
    if (sortField === 'nome') { va = a.nome; vb = b.nome }
    else if (sortField === 'statusContrato') { va = a.statusContrato; vb = b.statusContrato }
    else if (sortField === 'alocacao') { va = a.alocacao; vb = b.alocacao }
    else if (sortField === 'inicioContrato') { va = a.inicioContrato; vb = b.inicioContrato }
    else if (sortField === 'fimContrato') { va = a.fimContrato; vb = b.fimContrato }
    else if (sortField === 'parcelas') { va = a.totalParcelas; vb = b.totalParcelas }
    else if (sortField === 'direitoImagem') { va = a.direitoImagem; vb = b.direitoImagem }
    else if (sortField === 'pagas') { va = a.totalParcelas > 0 ? a.pagas / a.totalParcelas : 0; vb = b.totalParcelas > 0 ? b.pagas / b.totalParcelas : 0 }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  }), [atletasComDados, sortField, sortDir])

  const filtradosIds = new Set(filtrados.map(a => a.id))
  const totalMensal = filtrados.reduce((s, a) => s + a.direitoImagem, 0)
  const totalAnual = totalMensal * 12
  const maiorImagem = filtrados.length > 0
    ? filtrados.reduce((max, a) => a.direitoImagem > max.direitoImagem ? a : max, filtrados[0])
    : null
  const totalAtrasado = parcelasDireitoImagem
    .filter(p => filtradosIds.has(p.atletaId) && p.status === 'Atrasado')
    .reduce((s, p) => s + p.valor, 0)

  const th: React.CSSProperties = {
    padding: '9px 10px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase',
    color: 'var(--table-header-color)', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--divider-strong)',
    fontFamily: fontLabel, letterSpacing: '0.14em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
    cursor: 'pointer', userSelect: 'none',
  }
  const td: React.CSSProperties = {
    padding: '12px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: fontData,
    whiteSpace: 'normal', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums',
  }
  const tdr: React.CSSProperties = { ...td, textAlign: 'right' }

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>

      <PageHero title="Direitos de Imagem" subtitle="GESTÃO DE IMAGEM">
        <SheetIO
          exportFilename="parcelas-direito-imagem.xlsx"
          exportSheets={[{ name: 'Parcelas_Imagem', cols: COLS_PARCELAS_IMAGEM, rows: parcelasDireitoImagem as unknown as Record<string, unknown>[] }]}
          onImport={sheets => {
            const rows = sheets['Parcelas_Imagem'] ?? sheets[Object.keys(sheets)[0]] ?? []
            setParcelasDireitoImagem(rows.map((r, i) => ({
              id: Number(r['ID']) || i + 1,
              atletaId: Number(r['Atleta ID']) || 0,
              mes: r['Mês (AAAA-MM)'] ?? '',
              valor: Number(r['Valor']) || 0,
              status: (r['Status'] as ParcelaDireitoImagem['status']) ?? 'A pagar',
            })))
          }}
        />
      </PageHero>

      {/* ── Filtros ── */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <input type="text" placeholder={t('Buscar atleta...')} value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ width: 220, fontSize: 12, padding: '5px 8px' }} />
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
          style={{ width: 160, fontSize: 12, padding: '5px 8px' }}>
          <option value="Todos">{t('Todos')}</option>
          <option value="Elenco">{t('Elenco')}</option>
          <option value="Emprestado">{t('Emprestado')}</option>
          <option value="Rescindido">{t('Rescindido')}</option>
        </select>
        <div style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 11, fontFamily: font }}>
          {filtrados.length} {filtrados.length !== 1 ? t('atletas') : t('atleta')}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${totalAtrasado > 0 ? 4 : 3}, 1fr)`, gap: 12, marginBottom: 12 }}>
        <KpiCard
          label={t('Valor Mensal')} value={fmtMiC(totalMensal)} sub={`(${symbol})`}
          bg="var(--gold-tint)" border="rgba(190,140,74,0.25)" labelColor="var(--gold-deep)" valueColor="var(--gold-deep)"
        />
        <KpiCard
          label={t('Valor Anual')} value={fmtMiC(totalAnual)} sub={`(${symbol})`}
          bg="rgba(190,140,74,0.08)" border="rgba(190,140,74,0.18)" labelColor="var(--ink-secondary)" valueColor="var(--ink-primary)"
        />
        <KpiCard
          label={t('Maior Direito de Imagem')} value={maiorImagem ? maiorImagem.nome : '—'} sub={maiorImagem ? fmtMiC(maiorImagem.direitoImagem) : ''}
          bg="var(--cream-canvas)" border="var(--divider-strong)" labelColor="var(--ink-secondary)" valueColor="var(--ink-primary)"
        />
        {totalAtrasado > 0 && (
          <KpiCard
            label={t('Total Atrasado')} value={fmtMiC(totalAtrasado)} sub={`(${symbol})`}
            bg="var(--neg-tint)" border="rgba(185,28,28,0.20)" labelColor="var(--neg)" valueColor="var(--neg)"
          />
        )}
      </div>

      {/* ── Galeria ── */}
      <div className="card" style={{ padding: '16px', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 12, fontFamily: font }}>
          {t('Galeria de Atletas')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
          {filtrados.map(a => (
            <div key={a.id} style={{
              borderRadius: 8, overflow: 'hidden', background: 'var(--bg-subtle2)',
              border: '1px solid var(--card-border)', transition: 'transform 0.15s, box-shadow 0.15s',
              display: 'flex', flexDirection: 'column',
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.03)'
                ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = ''
                ;(e.currentTarget as HTMLDivElement).style.boxShadow = ''
              }}>
              <img src={`/fotos/${a.fotoArquivo}`} alt={a.nome}
                style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                onError={e => {
                  const el = e.target as HTMLImageElement
                  el.style.display = 'none'
                  const parent = el.parentElement
                  if (parent && !parent.querySelector('.foto-placeholder')) {
                    const placeholder = document.createElement('div')
                    placeholder.className = 'foto-placeholder'
                    placeholder.style.cssText = 'width:100%;aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:11px;background:#f0f0f0'
                    placeholder.textContent = t('Sem foto')
                    parent.insertBefore(placeholder, el)
                  }
                }} />
              <div style={{ padding: '8px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{a.nome}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtMiC(a.direitoImagem)}</div>
                <button
                  onClick={() => navigateToAtleta(a.id)}
                  style={{
                    marginTop: 6, padding: '6px 10px', fontSize: 10, fontWeight: 600,
                    background: '#111', color: '#fff', border: 'none', borderRadius: 6,
                    cursor: 'pointer', fontFamily: font, letterSpacing: 0.3,
                    transition: 'background 0.15s', width: '100%',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#333')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#111')}
                >
                  {t('Ver Atleta')} →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: 14, color: '#111', fontFamily: font }}>
          {t('Tabela de Direitos de Imagem')}
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 'calc(100vh - 560px)' }}>
          <table style={{ tableLayout: 'auto', width: '100%' }}>
            <thead>
              <tr>
                <th style={th} onClick={() => handleSort('nome')}>
                  {t('Atleta')}<SortIcon field="nome" sortField={sortField} sortDir={sortDir} />
                </th>
                <th style={th} onClick={() => handleSort('statusContrato')}>
                  {t('Status')}<SortIcon field="statusContrato" sortField={sortField} sortDir={sortDir} />
                </th>
                <th style={th} onClick={() => handleSort('alocacao')}>
                  {t('Alocação')}<SortIcon field="alocacao" sortField={sortField} sortDir={sortDir} />
                </th>
                <th style={th} onClick={() => handleSort('inicioContrato')}>
                  {t('Início Contrato')}<SortIcon field="inicioContrato" sortField={sortField} sortDir={sortDir} />
                </th>
                <th style={th} onClick={() => handleSort('fimContrato')}>
                  {t('Fim Contrato')}<SortIcon field="fimContrato" sortField={sortField} sortDir={sortDir} />
                </th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => handleSort('parcelas')}>
                  {t('Parcelas')}<SortIcon field="parcelas" sortField={sortField} sortDir={sortDir} />
                </th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => handleSort('direitoImagem')}>
                  {t('Dir. Imagem Mensal')} ({symbol})<SortIcon field="direitoImagem" sortField={sortField} sortDir={sortDir} />
                </th>
                <th style={th} onClick={() => handleSort('pagas')}>
                  {t('Status Pagto')}<SortIcon field="pagas" sortField={sortField} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>{t('Nenhum registro encontrado')}</td></tr>
              )}
              {sorted.map(a => {
                const parcelasAtrasadas = parcelasDireitoImagem.filter(p => p.atletaId === a.id && p.status === 'Atrasado')
                const atrasadas = parcelasAtrasadas.length
                const expanded = expandedIds.has(a.id)
                const fmtMes = (m: string) => {
                  const [y, mo] = m.split('-')
                  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
                  return `${meses[parseInt(mo) - 1]}/${y}`
                }
                return (
                  <React.Fragment key={a.id}>
                  <tr style={{ background: atrasadas > 0 ? '#fffaf8' : undefined }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {atrasadas > 0 ? (
                          <button onClick={() => toggleExpand(a.id)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                            fontSize: 13, color: '#c0392b', fontWeight: 700, lineHeight: 1, flexShrink: 0,
                          }}>
                            {expanded ? '▼' : '▶'}
                          </button>
                        ) : (
                          <span style={{ width: 14, flexShrink: 0 }} />
                        )}
                        <img src={`/fotos/${a.fotoArquivo}`} alt={a.nome}
                          style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top', background: '#eee', flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
                        <span style={{ fontWeight: 600 }}>{a.nome}</span>
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{
                        background: contractBg[a.statusContrato] ?? '#f0f0f0',
                        color: contractColor[a.statusContrato] ?? '#333',
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: font,
                      }}>{t(a.statusContrato)}</span>
                    </td>
                    <td style={td}>{t(a.alocacao)}</td>
                    <td style={td}>{fmtData(a.inicioContrato)}</td>
                    <td style={td}>{fmtData(a.fimContrato)}</td>
                    <td style={tdr}>{a.totalParcelas}</td>
                    <td style={{ ...tdr, fontWeight: 600 }}>{fmtMiC(a.direitoImagem)}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{
                          background: statusBg['Pago'], color: statusColor['Pago'],
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          fontFamily: font, whiteSpace: 'nowrap', display: 'inline-block',
                        }}>
                          {a.pagas}/{a.totalParcelas} {t('pagas')}
                        </span>
                        {atrasadas > 0 && (
                          <span
                            onClick={() => toggleExpand(a.id)}
                            style={{
                              background: statusBg['Atrasado'], color: statusColor['Atrasado'],
                              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                              fontFamily: font, whiteSpace: 'nowrap', display: 'inline-block',
                              cursor: 'pointer',
                            }}>
                            {atrasadas} {t('Atrasado')}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && atrasadas > 0 && (
                    <tr key={`${a.id}-detail`} style={{ background: '#fff8f5' }}>
                      <td colSpan={8} style={{ padding: '0 12px 12px 52px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#c0392b', marginBottom: 6, fontFamily: font, paddingTop: 8 }}>
                          {t('Parcelas em Atraso')} — {a.nome}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {parcelasAtrasadas.map(p => (
                            <div key={p.id} style={{
                              background: '#ffeef0', border: '1px solid #ffb3b3',
                              borderRadius: 6, padding: '6px 12px',
                              display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#333', fontFamily: font }}>{fmtMes(p.mes)}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#8b0000', fontFamily: font }}>{fmtMiC(p.valor)}</span>
                              <span style={{
                                background: statusBg['Atrasado'], color: statusColor['Atrasado'],
                                padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700, fontFamily: font,
                              }}>{t('Atrasado')}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
