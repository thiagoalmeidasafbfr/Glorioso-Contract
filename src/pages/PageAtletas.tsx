import { useState, useMemo, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import {
  atletas, pagamentosCertos, pagamentosCondicionais, acordos,
  condicionaisSalario, passivosClube, passivosIntermediario,
  parcelasDireitoImagem,
  fmtData, idade,
  statusColor, statusBg,
  type Atleta, type StatusContrato, type Alocacao,
} from '../data/mockData'
import { useApp } from '../context/AppContext'

const STATUS_OPTS: (StatusContrato | 'Todos')[] = ['Todos', 'Elenco', 'Emprestado', 'Rescindido']
const ALOC_OPTS: (Alocacao | 'Todos')[] = ['Todos', 'Profissional', 'Base']

const font = "'Inter', 'Segoe UI', sans-serif"

function StatusBadge({ status }: { status: string }) {
  const { t } = useApp()
  return (
    <span style={{
      background: statusBg[status] ?? '#f0f0f0',
      color: statusColor[status] ?? '#333',
      padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 700, fontFamily: font,
    }}>{t(status)}</span>
  )
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <span style={{ fontSize: 10, color: '#999', fontWeight: 500, fontFamily: font }}>{label}: </span>
      <span style={{ fontSize: 11, color: '#222', fontWeight: 500, fontFamily: font }}>{value}</span>
    </div>
  )
}

function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: 12, color: '#222', fontFamily: font }}>
        {title}
      </div>
      <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 220 }}>
        {children}
      </div>
    </div>
  )
}

function KpiTop({ label: rawLabel, sub, value }: { label: string; sub?: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 12px', borderRight: '1px solid #e8e8e8', flexShrink: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font }}>{rawLabel}</div>
      {sub && <div style={{ fontSize: 9, color: '#aaa', fontFamily: font }}>{sub}</div>}
      <div style={{ fontSize: 14, fontWeight: 700, color: '#000', marginTop: 2, fontFamily: font }}>{value}</div>
    </div>
  )
}

function TFCard({ label, sub, value, bg, border, color }: { label: string; sub: string; value: string; bg: string; border: string; color: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '7px 10px', flex: 1 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#666', textTransform: 'uppercase', fontFamily: font }}>{label}</div>
      <div style={{ fontSize: 9, color: '#aaa', fontFamily: font }}>{sub}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginTop: 4, fontFamily: font }}>{value}</div>
    </div>
  )
}

function BichoChart({ atleta, fillHeight }: { atleta: Atleta; fillHeight?: boolean }) {
  const { fmtMiC, t } = useApp()

  const bicho2024 = atleta.bichos.filter(b => b.ano === 2024).reduce((s, b) => s + b.valor, 0)
  const bicho2025 = atleta.bichos.filter(b => b.ano === 2025).reduce((s, b) => s + b.valor, 0)

  // Ordenado por ano primeiro (2024 depois 2025), depois por competição
  const comps2024 = ['Brasileiro', 'Copa do Brasil', 'Libertadores']
  const comps2025 = ['Brasileiro', 'Copa do Brasil', 'Libertadores', 'Mundial']
  const merged = [
    ...comps2024.map(c => ({ label: c, valor: atleta.bichos.find(b => b.competição === c && b.ano === 2024)?.valor ?? 0, ano: 2024 })),
    ...comps2025.map(c => ({ label: c, valor: atleta.bichos.find(b => b.competição === c && b.ano === 2025)?.valor ?? 0, ano: 2025 })),
  ]

  const CustomTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text x={0} y={0} dy={6} textAnchor="end" fill="#999" fontSize={7} transform="rotate(-40)" fontFamily={font}>
        {payload?.value}
      </text>
    </g>
  )

  // Formato compacto sem símbolo de moeda para caber acima das barras
  const fmtBar = (v: number) => {
    if (v === 0) return ''
    if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mi`
    if (v >= 1_000) return `${Math.round(v / 1_000)}K`
    return String(v)
  }

  return (
    <div style={{ display: 'flex', gap: 10, height: fillHeight ? '100%' : undefined }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, fontFamily: font }}>
          {t('Bicho por Competição')}
          <span style={{ fontSize: 8, fontWeight: 400, marginLeft: 4, opacity: 0.7 }}>({t('Valores brutos')})</span>
        </div>
        <ResponsiveContainer width="100%" height={fillHeight ? undefined : 180} style={fillHeight ? { flex: 1 } : undefined}>
          <BarChart data={merged} margin={{ top: 22, right: 2, left: -28, bottom: 36 }} barSize={12}>
            <XAxis dataKey="label" tick={<CustomTick />} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={false} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v: unknown) => fmtMiC(Number(v))}
              labelStyle={{ fontSize: 10, fontFamily: font }}
              contentStyle={{ fontSize: 10, borderRadius: 6, fontFamily: font }}
            />
            <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
              {merged.map((entry, i) => (
                <Cell key={i} fill={entry.ano === 2025 ? '#222' : '#bbb'} />
              ))}
              <LabelList
                dataKey="valor"
                position="top"
                formatter={(v: unknown) => fmtBar(Number(v))}
                style={{ fontSize: 6, fill: '#555', fontFamily: font }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Rótulos de ano */}
        <div style={{ display: 'flex', marginTop: -10 }}>
          <div style={{ flex: 3, textAlign: 'center', fontSize: 8, fontWeight: 700, color: '#bbb', fontFamily: font, borderTop: '1px solid #eee', paddingTop: 2 }}>2024</div>
          <div style={{ flex: 4, textAlign: 'center', fontSize: 8, fontWeight: 700, color: '#666', fontFamily: font, borderTop: '1px solid #eee', paddingTop: 2 }}>2025</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center', minWidth: 100 }}>
        <div style={{ background: '#f8f8f8', borderRadius: 6, padding: '6px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#999', textTransform: 'uppercase', fontFamily: font }}>{t('Bicho 2024')}</div>
          <div style={{ fontSize: 9, color: '#bbb', fontFamily: font }}>{t('Valores brutos')}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#000', marginTop: 2, fontFamily: font }}>{fmtMiC(bicho2024)}</div>
        </div>
        <div style={{ background: '#f8f8f8', borderRadius: 6, padding: '6px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#999', textTransform: 'uppercase', fontFamily: font }}>{t('Bicho 2025')}</div>
          <div style={{ fontSize: 9, color: '#bbb', fontFamily: font }}>{t('Valores brutos')}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#000', marginTop: 2, fontFamily: font }}>{fmtMiC(bicho2025)}</div>
        </div>
      </div>
    </div>
  )
}

const td: React.CSSProperties = { padding: '4px 6px', fontSize: 11, color: '#333', fontFamily: font, overflow: 'hidden', whiteSpace: 'normal', verticalAlign: 'middle' }
const th: React.CSSProperties = { padding: '5px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#666', background: '#f8f8f8', borderBottom: '2px solid #eee', fontFamily: font, overflow: 'hidden', whiteSpace: 'normal' }
const trH: React.CSSProperties = { height: 48 }

export default function PageAtletas() {
  const { fmtMiC, fmtC, convert, symbol, t, openAtletaId, clearOpenAtleta } = useApp()

  const [statusFiltro, setStatusFiltro] = useState<StatusContrato | 'Todos'>('Todos')
  const [alocacaoFiltro, setAlocacaoFiltro] = useState<Alocacao | 'Todos'>('Todos')
  const [atletaId, setAtletaId] = useState(atletas[0].id)

  useEffect(() => {
    if (openAtletaId !== null) {
      setAtletaId(openAtletaId)
      clearOpenAtleta()
    }
  }, [openAtletaId])

  const atletasFiltrados = useMemo(() => atletas.filter(a => {
    const okStatus = statusFiltro === 'Todos' || a.statusContrato === statusFiltro
    const okAloc = alocacaoFiltro === 'Todos' || a.alocacao === alocacaoFiltro
    return okStatus && okAloc
  }), [statusFiltro, alocacaoFiltro])

  const a = atletas.find(x => x.id === atletaId) ?? atletas[0]

  const auxilioMensal = a.auxilioMoradiaM + a.auxilioAlimentacaoM + a.outrosAuxiliosM
  const auxilioAnual = auxilioMensal * 12 + a.auxilioViagemA
  const salarioVigente = a.salarioCLT + a.direitoImagem + auxilioMensal

  const pagCertos   = pagamentosCertos.filter(p => p.atletaId === a.id)
  const pagCond     = pagamentosCondicionais.filter(p => p.atletaId === a.id)
  const acds        = acordos.filter(p => p.atletaId === a.id)
  const condSal     = condicionaisSalario.filter(p => p.atletaId === a.id)
  const pasClube    = passivosClube.filter(p => p.atletaId === a.id)
  const pasInter    = passivosIntermediario.filter(p => p.atletaId === a.id)

  const tfTotal = a.transferFeeTotal > 0
    ? fmtMiC(convert(a.transferFeeTotal, a.transferFeeMoeda))
    : `${a.transferFeeMoeda === 'BRL' ? 'R$' : a.transferFeeMoeda} 0,0`

  // ── Cálculos de custo total ──
  const hoje = new Date()
  const inicioDate = new Date(a.inicioContrato + 'T00:00:00')
  const fimDate = new Date(a.fimContrato + 'T00:00:00')
  const mesesDecorridos = Math.max(0,
    (hoje.getFullYear() - inicioDate.getFullYear()) * 12 + (hoje.getMonth() - inicioDate.getMonth())
  )
  const mesesTotal = Math.max(1,
    (fimDate.getFullYear() - inicioDate.getFullYear()) * 12 + (fimDate.getMonth() - inicioDate.getMonth())
  )

  const salarioPago     = convert(a.salarioCLT, 'BRL') * mesesDecorridos
  const salarioPrevisto = convert(a.salarioCLT, 'BRL') * mesesTotal

  const imgParc = parcelasDireitoImagem.filter(p => p.atletaId === a.id)
  const imagemPago     = imgParc.filter(p => p.status === 'Pago').reduce((s, p) => s + convert(p.valor, 'BRL'), 0)
  const imagemPrevisto = imgParc.reduce((s, p) => s + convert(p.valor, 'BRL'), 0)

  const auxiliosPago     = convert(auxilioMensal, 'BRL') * mesesDecorridos
  const auxiliosPrevisto = convert(auxilioMensal, 'BRL') * mesesTotal

  const bonusPago      = pagCertos.filter(p => p.status === 'Pago').reduce((s, p) => s + convert(p.valor, p.moeda), 0)
  const bonusPrevisto  = pagCertos.reduce((s, p) => s + convert(p.valor, p.moeda), 0)
  const bonusAtrasado  = pagCertos.filter(p => p.status === 'Atrasado').reduce((s, p) => s + convert(p.valor, p.moeda), 0)

  const imagemAtrasado = imgParc.filter(p => p.status === 'Atrasado').reduce((s, p) => s + convert(p.valor, 'BRL'), 0)

  const tfPago     = convert(a.transferFeeQuitado, a.transferFeeMoeda)
  const tfPrevisto = convert(a.transferFeeTotal, a.transferFeeMoeda)
  const tfAtrasado = pasClube.filter(p => p.atletaId === a.id && p.status === 'Atrasado').reduce((s, p) => s + convert(p.valor, p.moeda), 0)

  const interPago     = pasInter.filter(p => p.status === 'Pago').reduce((s, p) => s + convert(p.valor, p.moeda), 0)
  const interPrevisto = pasInter.reduce((s, p) => s + convert(p.valor, p.moeda), 0)
  const interAtrasado = pasInter.filter(p => p.status === 'Atrasado').reduce((s, p) => s + convert(p.valor, p.moeda), 0)

  const custoPagoAtleta     = salarioPago + imagemPago + auxiliosPago + bonusPago
  const custoPrevistoAtleta = salarioPrevisto + imagemPrevisto + auxiliosPrevisto + bonusPrevisto
  const custoPagoTransf     = tfPago + interPago
  const custoPrevistoTransf = tfPrevisto + interPrevisto
  const custoTotalPago      = custoPagoAtleta + custoPagoTransf
  const custoTotalPrevisto  = custoPrevistoAtleta + custoPrevistoTransf
  const valorMercadoConv    = convert(a.valorMercado, a.valorMercadoMoeda)

  return (
    <div style={{ padding: '8px 12px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>

      {/* ── Barra de topo: apenas filtros ── */}
      <div className="card" style={{ padding: '6px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#666', fontFamily: font }}>{t('Status')}</span>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as typeof statusFiltro)} style={{ width: 110, fontSize: 12, padding: '4px 8px' }}>
          {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#666', fontFamily: font }}>{t('Alocação')}</span>
        <select value={alocacaoFiltro} onChange={e => setAlocacaoFiltro(e.target.value as typeof alocacaoFiltro)} style={{ width: 110, fontSize: 12, padding: '4px 8px' }}>
          {ALOC_OPTS.map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#666', fontFamily: font }}>{t('Atleta')}</span>
        <select value={atletaId} onChange={e => setAtletaId(Number(e.target.value))} style={{ width: 160, fontSize: 12, padding: '4px 8px' }}>
          {atletasFiltrados.map(at => <option key={at.id} value={at.id}>{at.nome}</option>)}
        </select>
      </div>

      {/* ── Painel principal ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>

        {/* Metade esquerda: foto + info+TF + remuneração + intermediários */}
        <div style={{ display: 'grid', gridTemplateColumns: '150px auto 1fr 160px', gap: 6 }}>

        {/* Coluna 1: Foto */}
        <div className="card" style={{ overflow: 'hidden', minHeight: 200, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={`/fotos/${a.fotoArquivo}`}
            alt={a.nome}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
            onError={e => {
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              if (el.parentElement) el.parentElement.innerHTML = `<div style="color:#ccc;font-size:11px;font-family:Inter,sans-serif;padding:20px;text-align:center">Sem foto</div>`
            }}
          />
        </div>

        {/* Coluna 2: Info contrato + Transfer Fee lado a lado */}
        <div style={{ display: 'flex', gap: 4 }}>
          {/* Info do contrato */}
          <div className="card" style={{ padding: '8px 12px', width: 165, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* Início / Fim / % SAF */}
            {[
              [t('Início Contrato'), fmtData(a.inicioContrato)],
              [t('Fim Contrato'), fmtData(a.fimContrato)],
              ['% SAF', `${a.percSAF}%`],
            ].map(([label, value], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.3, fontFamily: font }}>{label}</span>
                <span style={{ fontSize: i === 2 ? 16 : 11, fontWeight: 700, color: '#111', fontFamily: font }}>{value}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #eee' }} />
            {/* Demais informações */}
            {[
              [t('Status'), <StatusBadge key="s" status={a.statusContrato} />],
              [t('Posição'), t(a.posicao)],
              [t('Clube Anterior'), a.clubeAnterior],
              [t('País'), a.paisNascimento],
              [t('Nascimento'), `${fmtData(a.dataNascimento)} (${idade(a.dataNascimento)}a)`],
            ].map(([label, value], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.3, fontFamily: font }}>{label as string}</span>
                <span style={{ fontSize: 9, color: '#222', fontWeight: 500, fontFamily: font, lineHeight: 1.3 }}>{value as React.ReactNode}</span>
              </div>
            ))}
          </div>
          {/* Transfer Fee */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 155 }}>
            <TFCard
              label={t('Transfer Fee')} sub="(Total)"
              value={a.transferFeeTotal > 0 ? fmtMiC(convert(a.transferFeeTotal, a.transferFeeMoeda)) : '—'}
              bg="#fff" border="#e0e0e0" color="#000"
            />
            <TFCard label={t('Valor Quitado')} sub="(Transfer Fee)"
              value={a.transferFeeQuitado > 0 ? fmtMiC(convert(a.transferFeeQuitado, a.transferFeeMoeda)) : '—'}
              bg="#f0fff8" border="#b2ecd4" color="#1a7a4a"
            />
            <TFCard label={t('Valor Pendente')} sub="(Transfer Fee)"
              value={a.transferFeePendente > 0 ? fmtMiC(convert(a.transferFeePendente, a.transferFeeMoeda)) : '—'}
              bg="#fff8f0" border="#fbd5a8" color="#c07000"
            />
            <TFCard label={t('Valor em Acordo')} sub="(Transfer Fee)"
              value={a.transferFeeAcordo > 0 ? fmtMiC(convert(a.transferFeeAcordo, a.transferFeeMoeda)) : '—'}
              bg="#f0f8ff" border="#a8d0f5" color="#1a6fa0"
            />
          </div>
        </div>

        {/* Coluna 3: Remuneração */}
        <div className="card" style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font, marginBottom: 2 }}>{t('Remuneração')}</div>

          {/* Total: Salário Vigente c/ Auxílio Mensal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '3px 8px', background: '#333', borderRadius: 5 }}>
            <div>
              <div style={{ fontSize: 10, color: '#ccc', fontWeight: 700, fontFamily: font, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{t('Salário Vigente')}</div>
              <div style={{ fontSize: 8, color: '#888', fontFamily: font }}>(c/ Auxílio Mensal)</div>
            </div>
            <span style={{ fontSize: 16, color: '#fff', fontWeight: 700, fontFamily: font, whiteSpace: 'nowrap' }}>{fmtMiC(salarioVigente)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 8px', background: '#111', borderRadius: 4 }}>
            <span style={{ fontSize: 10, color: '#fff', fontWeight: 600, fontFamily: font }}>{t('Salário CLT')}</span>
            <span style={{ fontSize: 12, color: '#fff', fontWeight: 700, fontFamily: font }}>{fmtMiC(a.salarioCLT)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 8px', background: '#111', borderRadius: 4 }}>
            <span style={{ fontSize: 10, color: '#fff', fontWeight: 600, fontFamily: font }}>{t('Imagem')}</span>
            <span style={{ fontSize: 12, color: '#fff', fontWeight: 700, fontFamily: font }}>{fmtMiC(a.direitoImagem)}</span>
          </div>

          <div style={{ padding: '2px 8px', background: '#2a2a2a', borderRadius: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: '#ccc', fontWeight: 600, fontFamily: font }}>{t('Auxílios')}</span>
              <span style={{ fontSize: 11, color: '#ccc', fontWeight: 700, fontFamily: font }}>{fmtMiC(auxilioMensal)}</span>
            </div>
            <div style={{ borderTop: '1px solid #444', paddingTop: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {a.auxilioMoradiaM > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: '#888', fontFamily: font }}>{t('Auxílio Moradia (Mensal)')}</span>
                  <span style={{ fontSize: 9, color: '#888', fontFamily: font }}>{fmtMiC(a.auxilioMoradiaM)}</span>
                </div>
              )}
              {a.auxilioAlimentacaoM > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: '#888', fontFamily: font }}>{t('Auxílio Alimentação (Mensal)')}</span>
                  <span style={{ fontSize: 9, color: '#888', fontFamily: font }}>{fmtMiC(a.auxilioAlimentacaoM)}</span>
                </div>
              )}
              {a.outrosAuxiliosM > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: '#888', fontFamily: font }}>{t('Outros (Mensal)')}</span>
                  <span style={{ fontSize: 9, color: '#888', fontFamily: font }}>{fmtMiC(a.outrosAuxiliosM)}</span>
                </div>
              )}
              {a.auxilioViagemA > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2, borderTop: '1px solid #3a3a3a' }}>
                  <span style={{ fontSize: 9, color: '#888', fontFamily: font }}>{t('Auxílio Viagem (Anual)')}</span>
                  <span style={{ fontSize: 9, color: '#888', fontFamily: font }}>{fmtMiC(a.auxilioViagemA)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2, borderTop: '1px solid #3a3a3a' }}>
                <span style={{ fontSize: 9, color: '#aaa', fontWeight: 600, fontFamily: font }}>{t('Total Auxílio Anual')}</span>
                <span style={{ fontSize: 10, color: '#ccc', fontWeight: 700, fontFamily: font }}>{fmtMiC(auxilioAnual)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna 4: Intermediários / Multas / Mercado */}
        <div className="card" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            [t('Intermediários'), a.intermediarios.length > 0 ? a.intermediarios.map(i => i.nome).join(', ') : '—'],
            [t('Venda Futura'), a.intermediarios.length > 0 ? a.intermediarios.map(i => `${i.nome} ${i.percVendaFutura}%`).join(' | ') : '—'],
            [t('Valor de Mercado'), `${fmtC(convert(a.valorMercado, a.valorMercadoMoeda))} (TM)`],
            [t('Multa Int.'), a.multaInternacional],
            [t('Multa Nac.'), a.multaNacional],
            [t('Multa Comp.'), a.multaCompensatoria],
          ].map(([label, value], i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.3, fontFamily: font }}>{label}</span>
              <span style={{ fontSize: 9, color: '#222', fontWeight: 500, fontFamily: font, lineHeight: 1.3 }}>{value}</span>
            </div>
          ))}
        </div>

        </div>{/* fim metade esquerda */}

        {/* Metade direita: Custo (esq) + Bicho (dir) */}
        <div className="card" style={{ padding: '8px 10px', display: 'flex', gap: 12, overflow: 'hidden' }}>
          {/* Tabela de custo */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font, marginBottom: 4 }}>Custo do Atleta</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f8f8' }}>
                  {(['Categoria','Pago','Atrasado','Previsto'] as const).map(h => (
                    <th key={h} style={{ padding: '3px 5px', fontSize: 8, fontWeight: 700, color: '#666', textTransform: 'uppercase', fontFamily: font, textAlign: h === 'Categoria' ? 'left' : 'right', borderBottom: '2px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Salário CLT',    salarioPago,  null,           salarioPrevisto],
                  ['Imagem',         imagemPago,   imagemAtrasado, imagemPrevisto],
                  ['Auxílios',       auxiliosPago, null,           auxiliosPrevisto],
                  ['Bônus / Luvas',  bonusPago,    bonusAtrasado,  bonusPrevisto],
                  ['Transfer Fee',   tfPago,       tfAtrasado,     tfPrevisto],
                  ['Intermediários', interPago,    interAtrasado,  interPrevisto],
                ] as [string, number, number|null, number][]).map(([label, pago, atrasado, prev], i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f2f2f2' }}>
                    <td style={{ padding: '2px 5px', fontSize: 9, color: '#444', fontFamily: font }}>{label}</td>
                    <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 600, color: '#111', fontFamily: font, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMiC(pago)}</td>
                    <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 600, color: atrasado ? '#c0392b' : '#ccc', fontFamily: font, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {atrasado === null ? '—' : atrasado > 0 ? fmtMiC(atrasado) : '—'}
                    </td>
                    <td style={{ padding: '2px 5px', fontSize: 9, color: '#999', fontFamily: font, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMiC(prev)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f5f5f5', borderTop: '1px solid #ddd' }}>
                  <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 700, color: '#333', fontFamily: font }}>Total Atleta</td>
                  <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 700, color: '#111', fontFamily: font, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMiC(custoPagoAtleta)}</td>
                  <td />
                  <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 700, color: '#888', fontFamily: font, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMiC(custoPrevistoAtleta)}</td>
                </tr>
                <tr style={{ background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 700, color: '#333', fontFamily: font }}>Total Transf.</td>
                  <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 700, color: '#111', fontFamily: font, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMiC(custoPagoTransf)}</td>
                  <td />
                  <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 700, color: '#888', fontFamily: font, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMiC(custoPrevistoTransf)}</td>
                </tr>
                <tr style={{ background: '#111' }}>
                  <td style={{ padding: '3px 5px', fontSize: 10, fontWeight: 700, color: '#fff', fontFamily: font }}>Custo Total</td>
                  <td style={{ padding: '3px 5px', fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: font, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMiC(custoTotalPago)}</td>
                  <td />
                  <td style={{ padding: '3px 5px', fontSize: 11, fontWeight: 700, color: '#aaa', fontFamily: font, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMiC(custoTotalPrevisto)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Gráfico do bicho — expande em altura */}
          <div style={{ borderLeft: '1px solid #eee', paddingLeft: 12, width: 260, flexShrink: 0, display: 'flex', alignItems: 'stretch' }}>
            <div style={{ flex: 1 }}>
              <BichoChart atleta={a} fillHeight />
            </div>
          </div>
        </div>

      </div>

      {/* ── 4 tabelas menores ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>

        <TableCard title={t('Pagamentos Certos (Atleta)')}>
          <table style={{ tableLayout: 'fixed' }}>
            <thead><tr>
              {[t('Atleta'),'Despesa','Parc.','Venc.','Valor',t('Moeda'),'V.Antec.',t('Parcial'),'M.Parc.',t('Status')].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pagCertos.length === 0
                ? <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 16 }}>{t('Sem registros')}</td></tr>
                : pagCertos.map(p => (
                  <tr key={p.id} style={{ ...trH, background: p.status === 'Atrasado' ? '#fff0f0' : undefined }}>
                    <td style={td} title={a.nomeCompleto}>{a.nome}</td>
                    <td style={td}>{p.despesa}</td>
                    <td style={td}>{p.parcela}</td>
                    <td style={td}>{fmtData(p.vencimento)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.valor.toLocaleString('pt-BR')}</td>
                    <td style={td}>{p.moeda}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{p.vencAntecipado ? t('Sim') : t('Não')}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.parcial?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td style={td}>{p.moedaParcial ?? '—'}</td>
                    <td style={td}><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableCard>

        <TableCard title={t('Pagamentos Condicionais (Atleta)')}>
          <table style={{ tableLayout: 'fixed' }}>
            <thead><tr>
              {[t('Atleta'),'Despesa','Contrato',t('Condição'),'Valor',t('Moeda'),'V.Antec.','Venc.',t('Status')].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pagCond.length === 0
                ? <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 16 }}>{t('Sem registros')}</td></tr>
                : pagCond.map(p => (
                  <tr key={p.id} style={trH}>
                    <td style={td} title={a.nomeCompleto}>{a.nome}</td>
                    <td style={td}>{p.despesa}</td>
                    <td style={td}>{p.contrato}</td>
                    <td style={{ ...td, maxWidth: 160, whiteSpace: 'normal', fontSize: 10 }} title={p.detalhesCondicao}>{p.detalhesCondicao}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{typeof p.valor === 'number' ? p.valor.toLocaleString('pt-BR') : p.valor}</td>
                    <td style={td}>{p.moeda}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{p.vencAntecipado ? t('Sim') : t('Não')}</td>
                    <td style={{ ...td, fontSize: 10, whiteSpace: 'normal' }}>{p.vencimento}</td>
                    <td style={td}><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableCard>

        <TableCard title={t('Acordos')}>
          <table style={{ tableLayout: 'fixed' }}>
            <thead><tr>
              {[t('Atleta'),'Natureza','Nat. Dívida',t('Parcela'),t('Credor'),'Valor',t('Moeda'),'Venc.','Liquidação',t('Status')].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {acds.length === 0
                ? <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 16 }}>{t('Sem registros')}</td></tr>
                : acds.map(p => (
                  <tr key={p.id} style={trH}>
                    <td style={td}>{a.nome}</td>
                    <td style={td}>{p.natureza}</td>
                    <td style={td}>{p.naturezaDivida}</td>
                    <td style={td}>{p.parcela}</td>
                    <td style={td}>{p.credor}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.valor.toLocaleString('pt-BR')}</td>
                    <td style={td}>{p.moedaContrato}</td>
                    <td style={td}>{fmtData(p.vencimento)}</td>
                    <td style={td}>{p.dataLiquidacao ? fmtData(p.dataLiquidacao) : '—'}</td>
                    <td style={td}><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableCard>

        <TableCard title={t('Condicionais de Salário (Atleta)')}>
          <table style={{ tableLayout: 'fixed' }}>
            <thead><tr>
              {[t('Atleta'),t('Condição'),'Despesa','Detalhes','Valor',t('Moeda'),t('Status')].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {condSal.length === 0
                ? <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 16 }}>{t('Sem registros')}</td></tr>
                : condSal.map(p => (
                  <tr key={p.id} style={trH}>
                    <td style={td}>{a.nome}</td>
                    <td style={td}>{p.condicao}</td>
                    <td style={td}>{p.despesa}</td>
                    <td style={{ ...td, maxWidth: 200, whiteSpace: 'normal', fontSize: 10 }}>{p.detalhes}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{typeof p.valor === 'number' ? p.valor.toLocaleString('pt-BR') : p.valor}</td>
                    <td style={td}>{p.moeda}</td>
                    <td style={td}><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableCard>
      </div>

      {/* ── Passivo Clube ── */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ padding: '7px 12px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: 12, color: '#222', fontFamily: font }}>
          {t('Passivo Clube')}
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 220 }}>
          <table style={{ tableLayout: 'fixed' }}>
            <thead><tr>
              {[t('Atleta'),'Despesa',t('Credor'),t('Parcela'),'Venc.','Valor',t('Moeda'),t('Parcial'),'M.Parc.','Saldo (Contrato)',`${t('Saldo')} (R$)`,t('Condição'),'V.Antec.','Solid.',t('Status')].map(h =>
                <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pasClube.length === 0
                ? <tr><td colSpan={15} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 20 }}>{t('Sem registros')}</td></tr>
                : pasClube.map(p => (
                  <tr key={p.id} style={{ ...trH, background: p.status === 'Atrasado' ? '#fff0f0' : undefined }}>
                    <td style={td}>{a.nome}</td>
                    <td style={td}>{p.despesa}</td>
                    <td style={td}>{p.credor}</td>
                    <td style={td}>{p.parcela}</td>
                    <td style={td}>{fmtData(p.vencimento)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.valor.toLocaleString('pt-BR')}</td>
                    <td style={td}>{p.moeda}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.parcial?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td style={td}>{p.moedaParcial ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.saldoMoedaContrato.toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.saldoBRL.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                    <td style={td}>{p.condicao || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{p.vencAntecipado ? t('Sim') : t('Não')}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{p.solidariedade ? t('Sim') : t('Não')}</td>
                    <td style={td}><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Passivo Intermediários ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '7px 12px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: 12, color: '#222', fontFamily: font }}>
          {t('Passivo Intermediários')}
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 220 }}>
          <table style={{ tableLayout: 'fixed' }}>
            <thead><tr>
              {[t('Atleta'),'Despesa',t('Intermediário'),t('Parcela'),'Venc.','Valor',t('Moeda'),t('Parcial'),'M.Parc.',t('Teor da Multa'),'V.Antec.',t('Status')].map(h =>
                <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pasInter.length === 0
                ? <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 20 }}>{t('Sem registros')}</td></tr>
                : pasInter.map(p => (
                  <tr key={p.id} style={{ ...trH, background: p.status === 'Atrasado' ? '#fff0f0' : undefined }}>
                    <td style={td}>{a.nome}</td>
                    <td style={td}>{p.despesa}</td>
                    <td style={td}>{p.intermediario}</td>
                    <td style={td}>{p.parcela}</td>
                    <td style={td}>{fmtData(p.vencimento)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.valor.toLocaleString('pt-BR')}</td>
                    <td style={td}>{p.moeda}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.parcial?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td style={td}>{p.moedaParcial ?? '—'}</td>
                    <td style={{ ...td, maxWidth: 220, whiteSpace: 'normal', fontSize: 10 }}>{p.teorMulta}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{p.vencAntecipado ? t('Sim') : t('Não')}</td>
                    <td style={td}><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
