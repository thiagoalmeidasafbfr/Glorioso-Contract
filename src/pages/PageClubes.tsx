import { useState, useMemo } from 'react'
import { atletas, passivosClube, fmtData, statusColor, statusBg } from '../data/mockData'
import { useApp } from '../context/AppContext'

const font = "'Inter', 'Segoe UI', sans-serif"

function StatusBadge({ status }: { status: string }) {
  const { t, isDark } = useApp()
  const darkBg: Record<string, string> = {
    'Pago': '#0d2e1e', 'Atrasado': '#2d1520', 'A pagar': '#1e2538',
    'Aguardando condição': '#1a1d27', 'Parcial': '#162010', 'Elenco': '#0d2e1e',
    'Emprestado': '#2a1e0a', 'Rescindido': '#2d1520',
  }
  const darkColor: Record<string, string> = {
    'Pago': '#4fd38c', 'Atrasado': '#f07070', 'A pagar': '#8a94b8',
    'Aguardando condição': '#8a94b8', 'Parcial': '#80c850', 'Elenco': '#4fd38c',
    'Emprestado': '#f0a050', 'Rescindido': '#f07070',
  }
  return (
    <span style={{
      background: isDark ? (darkBg[status] ?? '#1a1d27') : (statusBg[status] ?? '#f0f0f0'),
      color: isDark ? (darkColor[status] ?? '#8a94b8') : (statusColor[status] ?? '#333'),
      padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700, fontFamily: font,
    }}>{t(status)}</span>
  )
}

function FakeShield({ name }: { name: string }) {
  const initials = name.replace(/[^A-Za-z\s]/g, '').split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
  return (
    <svg width="52" height="58" viewBox="0 0 52 58" fill="none">
      <path d="M26 3L49 11V30C49 43 38 52 26 55C14 52 3 43 3 30V11Z" fill="#111" stroke="#444" strokeWidth="1.5" />
      <text x="26" y="33" textAnchor="middle" fill="white" fontSize="15" fontFamily="Inter,sans-serif" fontWeight="700">{initials}</text>
    </svg>
  )
}

function KpiCard({ label, value, sub, bg, border, labelColor, valueColor, footnote, darkBg, darkBorder, darkLabelColor, darkValueColor }: {
  label: string; value: string; sub?: string
  bg: string; border: string; labelColor: string; valueColor: string
  footnote?: string
  darkBg?: string; darkBorder?: string; darkLabelColor?: string; darkValueColor?: string
}) {
  const { isDark } = useApp()
  return (
    <div>
      <div style={{ background: isDark ? (darkBg ?? '#1a1d27') : bg, border: `1px solid ${isDark ? (darkBorder ?? '#252d42') : border}`, borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? (darkLabelColor ?? '#8a94b8') : labelColor, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: isDark ? (darkValueColor ?? '#dde4f5') : valueColor, marginTop: 8, fontFamily: font, lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: isDark ? (darkLabelColor ?? '#8a94b8') : labelColor, fontFamily: font, marginTop: 4, opacity: 0.8 }}>{sub}</div>}
      </div>
      {footnote && (
        <div style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic', fontFamily: font, marginTop: 4, paddingLeft: 2 }}>
          {footnote}
        </div>
      )}
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 2 }}>↕</span>
  return <span style={{ fontSize: 9, marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

export default function PageClubes() {
  const { fmtMiC, symbol, t, isDark } = useApp()

  const [sortField, setSortField] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const [credorFiltro, setCredorFiltro] = useState('Todos')
  const [atletaFiltro, setAtletaFiltro] = useState('Todos')
  const [condFiltro, setCondFiltro] = useState<'Todos' | 'Certo' | 'Condicional'>('Todos')

  const credores = useMemo(() =>
    [t('Todos'), ...Array.from(new Set(passivosClube.map(p => p.credor))).sort()], [t])
  const atletasOpts = useMemo(() =>
    [t('Todos'), ...atletas.map(a => a.nome)], [t])

  const filtrados = useMemo(() => passivosClube.filter(p => {
    const credorVal = credorFiltro === t('Todos') ? 'Todos' : credorFiltro
    const atletaVal = atletaFiltro === t('Todos') ? 'Todos' : atletaFiltro
    const okCred = credorVal === 'Todos' || p.credor === credorVal
    const okAtl = atletaVal === 'Todos' || atletas.find(a => a.id === p.atletaId)?.nome === atletaVal
    const okCond = condFiltro === 'Todos' || (condFiltro === 'Certo' ? !p.condicional : p.condicional)
    return okCred && okAtl && okCond
  }), [credorFiltro, atletaFiltro, condFiltro, t])

  const sorted = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      const atletaNomeA = atletas.find(x => x.id === a.atletaId)?.nome ?? ''
      const atletaNomeB = atletas.find(x => x.id === b.atletaId)?.nome ?? ''
      let va: string | number = 0, vb: string | number = 0
      if (sortField === 'credor') { va = a.credor; vb = b.credor }
      else if (sortField === 'atleta') { va = atletaNomeA; vb = atletaNomeB }
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
    })
  }, [filtrados, sortField, sortDir])

  const totalGeral  = filtrados.reduce((s, p) => s + p.saldoBRL, 0)
  const totalPago   = filtrados.filter(p => p.status === 'Pago').reduce((s, p) => s + p.saldoBRL, 0)
  const totalAcordo = filtrados.filter(p => p.status === 'Parcial').reduce((s, p) => s + (p.parcial ? p.parcial * 5.5 : 0), 0)
  const totalAPagar = filtrados.filter(p => p.status === 'A pagar' || p.status === 'Aguardando condição').reduce((s, p) => s + p.saldoBRL, 0)
  const totalAtraso = filtrados.filter(p => p.status === 'Atrasado').reduce((s, p) => s + p.saldoBRL, 0)

  const clubeNome = credorFiltro !== t('Todos') && credorFiltro !== 'Todos' ? credorFiltro : null

  const th: React.CSSProperties = {
    padding: '9px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    color: 'var(--table-header-color)', background: 'var(--table-header-bg)', borderBottom: '2px solid var(--divider)',
    fontFamily: font, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
    overflow: 'hidden', textOverflow: 'ellipsis',
    cursor: 'pointer', userSelect: 'none',
  }
  const td: React.CSSProperties = {
    padding: '14px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: font,
    whiteSpace: 'normal', verticalAlign: 'top',
  }
  const tdr: React.CSSProperties = { ...td, textAlign: 'right' }

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>

      {/* ── Topo: Filtros + Display Clube + Valor Total ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 200px', gap: 12, marginBottom: 12, alignItems: 'stretch' }}>

        {/* Filtros */}
        <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>{t('Credor')}</div>
            <select value={credorFiltro} onChange={e => setCredorFiltro(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
              {credores.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>{t('Atleta')}</div>
            <select value={atletaFiltro} onChange={e => setAtletaFiltro(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
              {atletasOpts.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>{t('Certo/Condicional')}</div>
            <select value={condFiltro} onChange={e => setCondFiltro(e.target.value as typeof condFiltro)}
              style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
              {(['Todos', 'Certo', 'Condicional'] as const).map(c => <option key={c}>{t(c)}</option>)}
            </select>
          </div>
          <div style={{ marginTop: 'auto', color: 'var(--text-faint)', fontSize: 11, fontFamily: font }}>
            {filtrados.length} {filtrados.length !== 1 ? t('parcelas') : t('parcela')}
          </div>
        </div>

        {/* Display do Clube */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', gap: 20 }}>
          {clubeNome ? (
            <>
              <div style={{ flexShrink: 0 }}>
                <FakeShield name={clubeNome} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Clube Credor')}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: font, lineHeight: 1.1 }}>{clubeNome}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, marginTop: 6 }}>
                  {t('Escudo definitivo disponível em breve')}
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('Clube Credor')}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-faint)', fontFamily: font }}>—</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginTop: 4 }}>{t('Selecione um credor para exibir')}</div>
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

      {/* ── 4 KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <KpiCard
          label={t('Valores Pagos')} value={fmtMiC(totalPago)} sub={t('Incluindo Parciais')}
          bg="#e8f9f0" border="#b8e8cc" labelColor="#1a7a4a" valueColor="#155c36"
          footnote={t('*Considerando a PTAX do Pagamento')}
          darkBg="#0d2e1e" darkBorder="#1a4a2e" darkLabelColor="#4fd38c" darkValueColor="#6feaaa"
        />
        <KpiCard
          label={t('Valores em Acordo')} value={fmtMiC(totalAcordo)} sub={`(${symbol})`}
          bg="#f4f4f4" border="#ddd" labelColor="#666" valueColor="#333"
          footnote={t('*Considerando a PTAX do Vencimento')}
          darkBg="#1a1d27" darkBorder="#252d42" darkLabelColor="#8a94b8" darkValueColor="#dde4f5"
        />
        <KpiCard
          label={t('Valores a Pagar')} value={fmtMiC(totalAPagar)} sub={`(${symbol})`}
          bg="#fffbf0" border="#ffd080" labelColor="#9a6600" valueColor="#6a4400"
          footnote={t('*Considerando a PTAX atual.')}
          darkBg="#2a1e0a" darkBorder="#4a3010" darkLabelColor="#f0a050" darkValueColor="#ffb860"
        />
        <KpiCard
          label={t('Valores em Atraso')} value={fmtMiC(totalAtraso)} sub={`(${symbol})`}
          bg="#fff0f0" border="#ffb3b3" labelColor="#c0392b" valueColor="#8b0000"
          footnote={t('*Considerando a PTAX do Vencimento')}
          darkBg="#2d1520" darkBorder="#4a1f2a" darkLabelColor="#f07070" darkValueColor="#ff9090"
        />
      </div>

      {/* ── Tabela Passivo Clubes ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider-soft)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: font }}>
          {t('Passivo Clubes')}
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 'calc(100vh - 420px)' }}>
          <table style={{ tableLayout: 'auto', width: '100%' }}>
            <thead>
              <tr>
                <th style={th} onClick={() => handleSort('credor')}>{t('Credor')}<SortIcon active={sortField==='credor'} dir={sortDir} /></th>
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
                <th style={th}>{t('Condição')}</th>
                <th style={th} onClick={() => handleSort('dataLiquidacao')}>{t('Data Liquidação')}<SortIcon active={sortField==='dataLiquidacao'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('status')}>{t('Status')}<SortIcon active={sortField==='status'} dir={sortDir} /></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan={15} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>{t('Nenhum registro encontrado')}</td></tr>
              )}
              {sorted.map(p => {
                const atletaNome = atletas.find(a => a.id === p.atletaId)?.nome ?? ''
                return (
                  <tr key={p.id} style={{ background: p.status === 'Atrasado' ? 'var(--row-late-bg)' : undefined }}>
                    <td style={td}>{p.credor}</td>
                    <td style={td}>{atletaNome}</td>
                    <td style={td}>{p.contrato}</td>
                    <td style={td}>{p.despesa}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{p.vencAntecipado ? t('Sim') : t('Não')}</td>
                    <td style={td}>{p.parcela}</td>
                    <td style={tdr}>{p.valor.toLocaleString('pt-BR')}</td>
                    <td style={td}>{p.moeda}</td>
                    <td style={td}>{fmtData(p.vencimento)}</td>
                    <td style={{ ...tdr, fontWeight: 600 }}>{p.saldoBRL.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                    <td style={tdr}>{p.parcial?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td style={td}>{p.moedaParcial ?? '—'}</td>
                    <td style={td}>{p.condicao || '—'}</td>
                    <td style={td}>{p.dataLiquidacao ? fmtData(p.dataLiquidacao) : '—'}</td>
                    <td style={td}><StatusBadge status={p.status} /></td>
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
