// src/pages/PagePremissas.tsx
// RELATÓRIO consolidado de premissas por atleta (Fase 1 → Fase 2 do modelo do CFO).
//
// As premissas são EDITADAS na página de cada atleta (aba "Venda & Simulação").
// Esta página apenas CONSOLIDA todas elas e mostra, por atleta, o impacto
// contábil (competência) e de caixa de uma eventual venda, além do que se evita
// em folha/amortização. É read-only: para alterar, abra o atleta.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import PageHero from '../components/PageHero'
import KpiPill from '../components/KpiPill'
import RefLink from '../components/RefLink'
import { Icon } from '../components/Icon'
import { fetchPremissas } from '../lib/premissasQueries'
import {
  fetchAthletes, fetchAllContracts, fetchAllClauses, fetchAllEconomicRights,
} from '../lib/athleteQueries'
import { fetchPtaxRates } from '../lib/ptax'
import { deriveCadastro, simularPremissa, type SimulacaoResultado } from '../lib/premissaSimulacao'
import { DECISAO_LABELS } from '../types/premissas'
import type { PremissaAtleta, PremissaDecisao } from '../types/premissas'
import type { Athlete } from '../types/athlete-system'
import { fmtCurrencyShort, todayISO } from '../lib/format'
import { exportWorkbook } from '../lib/xlsx-utils'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'

interface RowSim {
  premissa: PremissaAtleta
  nome: string
  res: SimulacaoResultado
}

const DECISAO_FILTERS: (('TODOS') | PremissaDecisao)[] = [
  'TODOS', 'MANTER', 'RENOVAR', 'VENDER', 'RESCINDIR', 'NOVA_CONTRATACAO',
]

const DECISAO_COLOR: Record<PremissaDecisao, { bg: string; fg: string }> = {
  MANTER:           { bg: 'var(--pos-tint)', fg: 'var(--pos)' },
  RENOVAR:          { bg: 'var(--accent-tint2)', fg: '#7a6244' },
  VENDER:           { bg: 'rgba(91,107,122,0.18)', fg: '#3c4a58' },
  RESCINDIR:        { bg: 'var(--neg-tint)', fg: 'var(--neg)' },
  NOVA_CONTRATACAO: { bg: 'rgba(190,140,74,0.20)', fg: '#8a5a1e' },
}

export default function PagePremissas() {
  const [rows, setRows] = useState<RowSim[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'TODOS' | PremissaDecisao>('TODOS')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [ptax, premissas, athletes, contracts, clauses, rights] = await Promise.all([
        fetchPtaxRates().catch(() => ({} as Record<string, number>)),
        fetchPremissas(),
        fetchAthletes(), fetchAllContracts(), fetchAllClauses(), fetchAllEconomicRights(),
      ])
      const byId = new Map<string, Athlete>(athletes.map(a => [a.id, a]))
      const hoje = todayISO()
      const built = premissas.map(p => {
        const nome = (p.atleta_id && byId.get(p.atleta_id)?.full_name) || p.nome || '—'
        const cad = deriveCadastro(p.atleta_id ?? '', contracts, clauses, rights, ptax, hoje)
        return { premissa: p, nome, res: simularPremissa(p, cad, ptax, hoje) }
      })
      setRows(built)
    } catch (e) {
      setErr(explainError(e))
    } finally { setLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'TODOS' && r.premissa.decisao !== filter) return false
      if (!q) return true
      return r.nome.toLowerCase().includes(q) || (r.premissa.posicao ?? '').toLowerCase().includes(q)
    })
  }, [rows, filter, search])

  // Totais só das premissas de VENDA (as demais não têm resultado de venda).
  const totals = useMemo(() => {
    const vendas = filtered.filter(r => r.premissa.decisao === 'VENDER')
    return {
      count: vendas.length,
      resultado: vendas.reduce((s, r) => s + r.res.resultadoContabilBRL, 0),
      caixa: vendas.reduce((s, r) => s + r.res.caixaLiquidoBRL, 0),
      folhaEvitada: vendas.reduce((s, r) => s + r.res.folhaFuturaEvitadaBRL, 0),
    }
  }, [filtered])

  function exportXlsx() {
    const cols = [
      { key: 'atleta', header: 'Atleta' },
      { key: 'decisao', header: 'Decisão' },
      { key: 'dataDecisao', header: 'Data-alvo' },
      { key: 'vendaBRL', header: 'Venda (BRL)' },
      { key: 'residual', header: 'Baixa residual (BRL)' },
      { key: 'maisValia', header: 'Mais-valia (BRL)' },
      { key: 'resultado', header: 'Resultado contábil (BRL)' },
      { key: 'despFin', header: 'Desp. antecipação (BRL)' },
      { key: 'caixa', header: 'Caixa líquido (BRL)' },
      { key: 'repasses', header: 'Repasses a terceiros (BRL)' },
      { key: 'folhaEvitada', header: 'Folha evitada (BRL)' },
      { key: 'amortEvitada', header: 'Amortização evitada (BRL)' },
    ]
    const data = filtered.map(r => ({
      atleta: r.nome,
      decisao: DECISAO_LABELS[r.premissa.decisao],
      dataDecisao: r.premissa.decisao_data ?? '',
      vendaBRL: round(r.res.vendaBRL),
      residual: round(r.res.baixaResidualBRL),
      maisValia: round(r.res.maisValiaBRL),
      resultado: round(r.res.resultadoContabilBRL),
      despFin: round(r.res.despesaFinanceiraBRL),
      caixa: round(r.res.caixaLiquidoBRL),
      repasses: round(r.res.repasses.reduce((s, x) => s + x.valorBRL, 0)),
      folhaEvitada: round(r.res.folhaFuturaEvitadaBRL),
      amortEvitada: round(r.res.amortizacaoFuturaEvitadaBRL),
    }))
    exportWorkbook([{ name: 'Premissas', cols, rows: data }], 'premissas-simulacao.xlsx')
  }

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: mono, letterSpacing: '0.12em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Premissas & Simulação de venda" subtitle="Modelo financeiro — consolidado por atleta">
        <button onClick={exportXlsx} className="btn btn-outline" style={{ padding: '8px 14px' }}>
          <Icon name="download" size={14} /> Exportar
        </button>
      </PageHero>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por atleta ou posição"
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)', minWidth: 240 }} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {DECISAO_FILTERS.map(d => (
            <button key={d} onClick={() => setFilter(d)} style={{
              padding: '6px 10px', border: '1px solid var(--divider-strong)', borderRadius: 6,
              fontFamily: mono, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
              background: filter === d ? 'var(--ink-primary)' : 'var(--cream-card)',
              color: filter === d ? '#fff' : 'var(--ink-secondary)',
            }}>{d === 'TODOS' ? 'Todos' : DECISAO_LABELS[d]}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <KpiPill label={`Resultado contábil (${totals.count} vendas)`} value={fmtCurrencyShort(totals.resultado, 'BRL')} tone={totals.resultado >= 0 ? 'pos' : 'neg'} />
          <KpiPill label="Caixa líquido" value={fmtCurrencyShort(totals.caixa, 'BRL')} tone={totals.caixa >= 0 ? 'pos' : 'neg'} />
          <KpiPill label="Folha evitada" value={fmtCurrencyShort(totals.folhaEvitada, 'BRL')} tone="neutral" />
        </div>
      </div>

      {err && (
        <div style={{ padding: '12px 16px', border: '1px solid var(--neg)', background: 'var(--neg-tint)', borderRadius: 8, color: 'var(--neg)', fontFamily: font, fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 32 }} aria-label="Expandir" />
                <th style={{ ...th, minWidth: 180 }}>Atleta</th>
                <th style={{ ...th, minWidth: 120 }}>Decisão</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 120 }}>Venda (BRL)</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 130 }}>Resultado contábil</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 120 }}>Caixa líquido</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 120 }}>Folha evitada</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando premissas e PTAX…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                  Nenhuma premissa. Abra um atleta e use a aba <b>Venda &amp; Simulação</b> para criar.
                </td></tr>
              )}
              {!loading && filtered.map(r => {
                const isOpen = expanded === r.premissa.id
                const c = DECISAO_COLOR[r.premissa.decisao]
                const isVenda = r.premissa.decisao === 'VENDER'
                return (
                  <Fragment key={r.premissa.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : r.premissa.id)}>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} />
                      </td>
                      <td style={td}>
                        {r.premissa.atleta_id
                          ? <RefLink to={`/atletas/${r.premissa.atleta_id}`}>{r.nome}</RefLink>
                          : r.nome}
                        {r.premissa.posicao && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> · {r.premissa.posicao}</span>}
                      </td>
                      <td style={td}>
                        <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase', background: c.bg, color: c.fg }}>
                          {DECISAO_LABELS[r.premissa.decisao]}
                        </span>
                      </td>
                      <td style={tdNum}>{isVenda ? fmtCurrencyShort(r.res.vendaBRL, 'BRL') : '—'}</td>
                      <td style={{ ...tdNum, color: isVenda ? (r.res.resultadoContabilBRL >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined }}>
                        {isVenda ? fmtCurrencyShort(r.res.resultadoContabilBRL, 'BRL') : '—'}
                      </td>
                      <td style={{ ...tdNum, color: isVenda ? (r.res.caixaLiquidoBRL >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined }}>
                        {isVenda ? fmtCurrencyShort(r.res.caixaLiquidoBRL, 'BRL') : '—'}
                      </td>
                      <td style={tdNum}>{fmtCurrencyShort(r.res.folhaFuturaEvitadaBRL, 'BRL')}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ ...td, background: 'var(--bg-subtle)', padding: '16px 20px' }}>
                          <DetalheSim r={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ marginTop: 12, fontFamily: mono, fontSize: 10, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
        Receita de venda, sell-on, solidariedade e intermediação reconhecidos na competência (na cabeça); o cronograma define o efeito caixa. Valor residual e amortização vêm do cadastro (contrato de entrada). Edite cada premissa na aba <b>Venda &amp; Simulação</b> do atleta.
      </p>
    </div>
  )
}

function DetalheSim({ r }: { r: RowSim }) {
  const { res } = r
  if (r.premissa.decisao !== 'VENDER') {
    return (
      <div style={{ fontFamily: font, fontSize: 13, color: 'var(--ink-secondary)' }}>
        Decisão <b>{DECISAO_LABELS[r.premissa.decisao]}</b>. Custo mensal mantendo o atleta:{' '}
        <b>{fmtCurrencyShort(res.custoMensalTotalBRL, 'BRL')}</b> (folha {fmtCurrencyShort(res.folhaMensalBRL, 'BRL')} + amortização {fmtCurrencyShort(res.amortizacaoMensalBRL, 'BRL')}).
        {' '}Folha futura evitada até o fim do contrato: <b>{fmtCurrencyShort(res.folhaFuturaEvitadaBRL, 'BRL')}</b>.
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
      <MiniBloco titulo="Resultado contábil (competência)">
        <Linha l="Receita de venda" v={res.vendaBRL} />
        <Linha l="(−) Solidariedade" v={-res.solidariedadeBRL} />
        <Linha l="(−) Baixa residual" v={-res.baixaResidualBRL} />
        <Linha l="= Mais-valia" v={res.maisValiaBRL} muted />
        <Linha l="(−) Sell-on" v={-res.sellOnBRL} />
        <Linha l="(−) Comissão" v={-res.comissaoBRL} />
        <Linha l="(−) Intermediação" v={-res.intermedCadastradaBRL} />
        <Linha l="Resultado" v={res.resultadoContabilBRL} strong />
      </MiniBloco>
      <MiniBloco titulo="Efeito caixa">
        <Linha l="Recebimento (nominal)" v={res.totalRecebimentoNominalBRL} />
        {res.antecipar && <Linha l="(−) Desp. antecipação" v={-res.despesaFinanceiraBRL} />}
        <Linha l="Entrada líquida" v={res.caixaEntradaLiquidaBRL} muted />
        <Linha l="(−) Repasses" v={-res.totalSaidasBRL} />
        <Linha l="Caixa líquido" v={res.caixaLiquidoBRL} strong />
      </MiniBloco>
      <MiniBloco titulo="A quem repassar">
        {res.repasses.length === 0
          ? <div style={{ fontFamily: font, fontSize: 12, color: 'var(--text-muted)' }}>Nenhum repasse a terceiros.</div>
          : res.repasses.map((rp, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: font, fontSize: 12, padding: '3px 0' }}>
              <span>{rp.party} <span style={{ color: 'var(--text-muted)' }}>· {rp.motivo}</span></span>
              <span style={{ fontFamily: mono }}>{fmtCurrencyShort(rp.valorBRL, 'BRL')}</span>
            </div>
          ))}
      </MiniBloco>
    </div>
  )
}

function MiniBloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 8 }}>{titulo}</div>
      {children}
    </div>
  )
}

function Linha({ l, v, strong, muted }: { l: string; v: number; strong?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', fontFamily: font, fontSize: strong ? 13 : 12, fontWeight: strong ? 700 : 400, color: muted ? 'var(--ink-secondary)' : 'var(--ink-primary)', borderTop: strong ? '1px solid var(--divider-strong)' : undefined, marginTop: strong ? 4 : undefined, paddingTop: strong ? 6 : 3 }}>
      <span>{l}</span>
      <span style={{ fontFamily: mono, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: strong ? (v >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined }}>{fmtCurrencyShort(v, 'BRL')}</span>
    </div>
  )
}

function round(n: number): number { return Math.round(n * 100) / 100 }

function explainError(e: unknown): string {
  const msg = (e as Error)?.message ?? 'Falha ao carregar premissas.'
  const code = (e as { code?: string })?.code
  if (code === 'PGRST205' || /schema cache/i.test(msg) || /ac_premissas_atleta/i.test(msg)) {
    return 'A tabela de premissas ainda não existe no banco. Rode a migration "018_premissas_atleta.sql" no Supabase e recarregue a página. Detalhe técnico: ' + msg
  }
  return msg
}
