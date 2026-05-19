import { useState, useMemo } from 'react'
import { atletas, fmtData, fmtMi, type StatusContrato } from '../data/mockData'
import { useApp } from '../context/AppContext'

const STATUS_OPTS: (StatusContrato | 'Todos')[] = ['Todos', 'Elenco', 'Emprestado', 'Rescindido']
const POSICOES = ['Todos', 'Goleiro', 'Zagueiro', 'Lateral Direito', 'Lateral Esquerdo', 'Volante', 'Meia', 'Meia-atacante', 'Atacante']

const font = "'Inter', 'Segoe UI', sans-serif"

// Cálculos encargos
const fgts = (clt: number) => clt * 0.08
const inss = (clt: number) => clt * 0.05
const feriasAnual = (clt: number) => clt / 3
const decimoTerceiro = (clt: number) => clt

const custoMensal = (a: ReturnType<typeof atletas[0]['salarioCLT']['toFixed']> extends string ? never : (typeof atletas)[number]) =>
  a.salarioCLT + a.direitoImagem + a.auxilioMoradiaM + a.auxilioAlimentacaoM + a.outrosAuxiliosM
  + fgts(a.salarioCLT) + inss(a.salarioCLT)

const custoAnual = (a: (typeof atletas)[number]) =>
  custoMensal(a) * 12 + a.auxilioViagemA + feriasAnual(a.salarioCLT) + decimoTerceiro(a.salarioCLT)

function StripKpi({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 20px',
      borderLeft: first ? 'none' : '1px solid rgba(255,255,255,0.12)',
      minWidth: 0, flexShrink: 0,
    }}>
      <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font, whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2, fontFamily: font, whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 2 }}>↕</span>
  return <span style={{ fontSize: 9, marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function PageConsolidado() {
  const { fmtMiC, t } = useApp()

  const [sortField, setSortField] = useState<string>('custoAnual')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const [statusFiltro, setStatusFiltro] = useState<StatusContrato | 'Todos'>('Elenco')
  const [posicaoFiltro, setPosicaoFiltro] = useState('Todos')

  const filtrados = useMemo(() => atletas.filter(a => {
    const okStatus = statusFiltro === 'Todos' || a.statusContrato === statusFiltro
    const okPos = posicaoFiltro === 'Todos' || a.posicao === posicaoFiltro
    return okStatus && okPos
  }), [statusFiltro, posicaoFiltro])

  const sorted = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      let va: string | number = 0, vb: string | number = 0
      if (sortField === 'nome') { va = a.nome; vb = b.nome }
      else if (sortField === 'posicao') { va = a.posicao; vb = b.posicao }
      else if (sortField === 'status') { va = a.statusContrato; vb = b.statusContrato }
      else if (sortField === 'inicioContrato') { va = a.inicioContrato; vb = b.inicioContrato }
      else if (sortField === 'fimContrato') { va = a.fimContrato; vb = b.fimContrato }
      else if (sortField === 'salarioCLT') { va = a.salarioCLT; vb = b.salarioCLT }
      else if (sortField === 'direitoImagem') { va = a.direitoImagem; vb = b.direitoImagem }
      else if (sortField === 'totalMensal') { va = custoMensal(a); vb = custoMensal(b) }
      else if (sortField === 'custoAnual') { va = custoAnual(a); vb = custoAnual(b) }
      else return 0
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtrados, sortField, sortDir])

  // Totais anuais do strip
  const totalCLT     = filtrados.reduce((s, a) => s + a.salarioCLT * 12, 0)
  const totalImagem  = filtrados.reduce((s, a) => s + a.direitoImagem * 12, 0)
  const totalMoradia = filtrados.reduce((s, a) => s + a.auxilioMoradiaM * 12, 0)
  const totalViagem  = filtrados.reduce((s, a) => s + a.auxilioViagemA, 0)
  const totalFGTS    = filtrados.reduce((s, a) => s + fgts(a.salarioCLT) * 12, 0)
  const totalFerias  = filtrados.reduce((s, a) => s + feriasAnual(a.salarioCLT), 0)
  const total13      = filtrados.reduce((s, a) => s + decimoTerceiro(a.salarioCLT), 0)
  const totalINSS    = filtrados.reduce((s, a) => s + inss(a.salarioCLT) * 12, 0)
  const totalGeral   = filtrados.reduce((s, a) => s + custoAnual(a), 0)

  const th: React.CSSProperties = {
    padding: '9px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    color: '#555', background: '#f8f8f8', borderBottom: '2px solid #e8e8e8',
    fontFamily: font, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
    cursor: 'pointer', userSelect: 'none',
  }
  const td: React.CSSProperties = {
    padding: '8px 10px', fontSize: 12, color: '#333', fontFamily: font,
    whiteSpace: 'nowrap',
  }
  const tdr: React.CSSProperties = { ...td, textAlign: 'right' }

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>

      {/* ── Filtros + Strip KPIs ── */}
      <div style={{
        background: '#111', borderRadius: 10, marginBottom: 14,
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 0, flexWrap: 'wrap',
      }}>
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingRight: 20, borderRight: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 3, fontFamily: font }}>{t('Status')}</div>
            <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as typeof statusFiltro)}
              style={{ background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: font, width: 110 }}>
              {STATUS_OPTS.map(s => <option key={s} style={{ background: '#222' }}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 3, fontFamily: font }}>{t('Posição')}</div>
            <select value={posicaoFiltro} onChange={e => setPosicaoFiltro(e.target.value)}
              style={{ background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: font, width: 130 }}>
              {POSICOES.map(p => <option key={p} style={{ background: '#222' }}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* KPIs */}
        <StripKpi label={t('Custo Total Anual')} value={fmtMiC(totalGeral)} />
        <StripKpi label={t('CLT')} value={fmtMiC(totalCLT)} />
        <StripKpi label={t('Imagem')} value={fmtMiC(totalImagem)} />
        <StripKpi label={t('Auxílio Moradia')} value={fmtMiC(totalMoradia)} />
        <StripKpi label={t('Auxílio Viagem')} value={fmtMiC(totalViagem)} />
        <StripKpi label={t('FGTS')} value={fmtMiC(totalFGTS)} />
        <StripKpi label={t('Férias')} value={fmtMiC(totalFerias)} />
        <StripKpi label={t('13º')} value={fmtMiC(total13)} />
        <StripKpi label={t('INSS')} value={fmtMiC(totalINSS)} />

        <div style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.35)', fontSize: 11, paddingLeft: 16, fontFamily: font, flexShrink: 0 }}>
          {filtrados.length} {filtrados.length !== 1 ? t('atletas') : t('atleta')}
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: 14, color: '#111', fontFamily: font }}>
          {t('Consolidado Atletas')}
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 'calc(100vh - 260px)' }}>
          <table style={{ tableLayout: 'auto', width: '100%' }}>
            <thead>
              <tr>
                <th style={th} onClick={() => handleSort('nome')}>{t('Nome')}<SortIcon active={sortField==='nome'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('posicao')}>{t('Posição')}<SortIcon active={sortField==='posicao'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('status')}>{t('Status')}<SortIcon active={sortField==='status'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('inicioContrato')}>{t('Data Início Contrato')}<SortIcon active={sortField==='inicioContrato'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('fimContrato')}>{t('Data Fim Contrato')}<SortIcon active={sortField==='fimContrato'} dir={sortDir} /></th>
                <th style={th}>{t('Data de Rescisão')}</th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => handleSort('salarioCLT')}>{t('CLT')}<SortIcon active={sortField==='salarioCLT'} dir={sortDir} /></th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => handleSort('direitoImagem')}>{t('Imagem')}<SortIcon active={sortField==='direitoImagem'} dir={sortDir} /></th>
                <th style={{ ...th, textAlign: 'right' }}>{t('Auxílio Moradia (Mensal)')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('FGTS Mensal')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('INSS (Mensal)')}</th>
                <th style={{ ...th, textAlign: 'right', background: '#eff4ff', color: '#1a4fa0' }} onClick={() => handleSort('totalMensal')}>{t('Total Mensal')}<SortIcon active={sortField==='totalMensal'} dir={sortDir} /></th>
                <th style={{ ...th, textAlign: 'right' }}>{t('Auxílio Viagem (Anual)')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('Férias Anual')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{t('13º (Anual)')}</th>
                <th style={{ ...th, textAlign: 'right', background: '#f0f8f0', color: '#1a5a1a' }} onClick={() => handleSort('custoAnual')}>{t('Custo Anual')}<SortIcon active={sortField==='custoAnual'} dir={sortDir} /></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan={16} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>{t('Nenhum atleta encontrado')}</td></tr>
              )}
              {sorted.map(a => {
                const totalM = a.salarioCLT + a.direitoImagem + a.auxilioMoradiaM + a.auxilioAlimentacaoM + a.outrosAuxiliosM + fgts(a.salarioCLT) + inss(a.salarioCLT)
                const totalA = custoAnual(a)
                return (
                  <tr key={a.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{a.nome}</td>
                    <td style={{ ...td, color: '#666' }}>{t(a.posicao)}</td>
                    <td style={td}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: font,
                        background: a.statusContrato === 'Elenco' ? '#e6f9f0' : a.statusContrato === 'Emprestado' ? '#fff3e0' : '#ffeef0',
                        color: a.statusContrato === 'Elenco' ? '#1a7a4a' : a.statusContrato === 'Emprestado' ? '#e67e22' : '#c0392b',
                      }}>{t(a.statusContrato)}</span>
                    </td>
                    <td style={{ ...td, color: '#666' }}>{fmtData(a.inicioContrato)}</td>
                    <td style={{ ...td, color: '#666' }}>{fmtData(a.fimContrato)}</td>
                    <td style={{ ...td, color: '#aaa' }}>—</td>
                    <td style={tdr}>{fmtMi(a.salarioCLT)}</td>
                    <td style={tdr}>{fmtMi(a.direitoImagem)}</td>
                    <td style={tdr}>{a.auxilioMoradiaM > 0 ? fmtMi(a.auxilioMoradiaM) : '—'}</td>
                    <td style={tdr}>{fmtMi(fgts(a.salarioCLT))}</td>
                    <td style={tdr}>{fmtMi(inss(a.salarioCLT))}</td>
                    <td style={{ ...tdr, fontWeight: 700, background: '#f5f8ff' }}>{fmtMi(totalM)}</td>
                    <td style={tdr}>{a.auxilioViagemA > 0 ? fmtMi(a.auxilioViagemA) : '—'}</td>
                    <td style={tdr}>{fmtMi(feriasAnual(a.salarioCLT))}</td>
                    <td style={tdr}>{fmtMi(decimoTerceiro(a.salarioCLT))}</td>
                    <td style={{ ...tdr, fontWeight: 700, background: '#f5fcf5' }}>{fmtMi(totalA)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
