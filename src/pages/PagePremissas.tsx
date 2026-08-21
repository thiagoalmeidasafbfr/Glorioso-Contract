// src/pages/PagePremissas.tsx
// Aba centralizada de PREMISSAS por atleta — Fase 1 do modelo do CFO.
// Uma linha por atleta (ativo, futuro contratado ou em decisão). Todo o
// motor de projeção puxa exclusivamente dessa aba (Fase 2 em diante).

import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHero from '../components/PageHero'
import { IconButton } from '../components/Icon'
import { fetchAthletes } from '../lib/athleteQueries'
import {
  fetchPremissas, createPremissa, updatePremissa, deletePremissa,
} from '../lib/premissasQueries'
import { ENCARGOS_DEFAULT, ANTECIPACAO_DEFAULT, DECISAO_LABELS } from '../types/premissas'
import type { PremissaAtleta, PremissaDecisao } from '../types/premissas'
import type { Athlete } from '../types/athlete-system'
import { useAuth } from '../context/AuthContext'

const fontBody = "var(--font-body)"
const fontMono = "var(--font-label)"

interface Row extends PremissaAtleta {
  // Se a premissa foi criada apenas em memória (ainda não gravada). Nunca
  // deixamos o usuário sair da página sem salvar — no blur/commit gravamos.
  _dirty?: boolean
}

const DECISAO_OPTIONS: PremissaDecisao[] = [
  'MANTER', 'RENOVAR', 'VENDER', 'RESCINDIR', 'NOVA_CONTRATACAO',
]

const DECISAO_COLOR: Record<PremissaDecisao, { bg: string; fg: string }> = {
  MANTER:            { bg: 'var(--pos-tint)',    fg: 'var(--pos)' },
  RENOVAR:           { bg: 'var(--accent-tint2)', fg: '#7a6244' },
  VENDER:            { bg: 'rgba(91,107,122,0.18)', fg: '#3c4a58' },
  RESCINDIR:         { bg: 'var(--neg-tint)',    fg: 'var(--neg)' },
  NOVA_CONTRATACAO:  { bg: 'rgba(190,140,74,0.20)', fg: '#8a5a1e' },
}

// Wrap padrão de célula editável.
function Cell(props: {
  children: React.ReactNode; align?: 'left' | 'right' | 'center'; width?: number | string
}) {
  return (
    <td style={{
      padding: '6px 8px',
      textAlign: props.align ?? 'left',
      borderBottom: '1px solid var(--rule)',
      background: 'var(--surface)',
      minWidth: props.width,
      fontFamily: fontBody, fontSize: 13,
      color: 'var(--ink-primary)',
      whiteSpace: 'nowrap',
    }}>{props.children}</td>
  )
}

function Head(props: { children: React.ReactNode; width?: number | string; sticky?: boolean }) {
  return (
    <th style={{
      padding: '10px 8px',
      textAlign: 'left',
      fontFamily: fontMono, fontSize: 10, fontWeight: 600,
      letterSpacing: '0.10em', textTransform: 'uppercase',
      color: 'var(--ink-secondary)',
      background: 'var(--cream-inset)',
      borderBottom: '1px solid var(--rule)',
      position: props.sticky ? 'sticky' as const : undefined,
      left: props.sticky ? 0 : undefined,
      zIndex: props.sticky ? 3 : undefined,
      minWidth: props.width,
      whiteSpace: 'nowrap',
    }}>{props.children}</th>
  )
}

// Input compacto — usado em todas as células editáveis. Comita no blur / Enter.
function CellInput(props: {
  value: string | number | null | undefined
  type?: 'text' | 'number' | 'date'
  onCommit: (v: string) => void
  align?: 'left' | 'right'
  width?: number | string
  step?: string
  disabled?: boolean
  placeholder?: string
}) {
  const [v, setV] = useState<string>(props.value == null ? '' : String(props.value))
  useEffect(() => { setV(props.value == null ? '' : String(props.value)) }, [props.value])
  return (
    <input
      value={v}
      type={props.type ?? 'text'}
      step={props.step}
      disabled={props.disabled}
      placeholder={props.placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== (props.value == null ? '' : String(props.value))) props.onCommit(v) }}
      onKeyDown={e => {
        if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() }
        if (e.key === 'Escape') { setV(props.value == null ? '' : String(props.value)); (e.target as HTMLInputElement).blur() }
      }}
      style={{
        width: props.width ?? '100%',
        minWidth: 80,
        padding: '4px 6px',
        border: '1px solid transparent',
        borderRadius: 4,
        background: 'transparent',
        fontFamily: fontBody, fontSize: 13,
        textAlign: props.align ?? 'left',
        color: 'var(--ink-primary)',
        outline: 'none',
      }}
      onFocus={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.border = '1px solid var(--rule-strong)' }}
      onBlurCapture={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.border = '1px solid transparent' }}
    />
  )
}

function toNum(s: string): number | null {
  if (s === '' || s == null) return null
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function toPct(s: string): number | null {
  const n = toNum(s)
  if (n == null) return null
  // Aceita "20" (=20%) ou "0.20". Se > 1 assumimos que veio em pontos %.
  return n > 1 ? n / 100 : n
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return ''
  return (n * 100).toFixed(2)
}

export default function PagePremissas() {
  const { profile } = useAuth()
  const canEdit = !profile || profile.role === 'master'

  const [rows, setRows] = useState<Row[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'TODOS' | PremissaDecisao>('TODOS')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [ps, as] = await Promise.all([fetchPremissas(), fetchAthletes()])
      setRows(ps as Row[]); setAthletes(as)
    } catch (e) {
      setErr((e as Error).message ?? 'Falha ao carregar premissas.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  // Persistência otimista — atualiza o state, dispara PATCH, reverte se falhar.
  const patch = useCallback(async (id: string, p: Partial<PremissaAtleta>) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...p } : r))
    try { await updatePremissa(id, p) } catch (e) {
      setErr((e as Error).message ?? 'Falha ao salvar.')
      await load()
    }
  }, [load])

  const addNew = useCallback(async (kind: 'ATLETA_EXISTENTE' | 'NOVA_CONTRATACAO') => {
    try {
      const base = kind === 'NOVA_CONTRATACAO'
        ? { decisao: 'NOVA_CONTRATACAO' as PremissaDecisao, nome: 'Nova contratação' }
        : { decisao: 'MANTER' as PremissaDecisao }
      const created = await createPremissa(base)
      setRows(rs => [created as Row, ...rs])
    } catch (e) { setErr((e as Error).message ?? 'Falha ao criar linha.') }
  }, [])

  const removeRow = useCallback(async (id: string) => {
    if (!confirm('Excluir esta linha de premissas?')) return
    try { await deletePremissa(id); setRows(rs => rs.filter(r => r.id !== id)) }
    catch (e) { setErr((e as Error).message ?? 'Falha ao excluir.') }
  }, [])

  // Nome exibido: se tem atleta_id vinculado, puxa do cadastro; senão usa o campo.
  const nameOf = useCallback((r: Row): string => {
    if (r.atleta_id) {
      const a = athletes.find(x => x.id === r.atleta_id)
      if (a) return a.full_name
    }
    return r.nome ?? '—'
  }, [athletes])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'TODOS' && r.decisao !== filter) return false
      if (!q) return true
      return nameOf(r).toLowerCase().includes(q) || (r.posicao ?? '').toLowerCase().includes(q)
    })
  }, [rows, filter, search, nameOf])

  const totalEncargos = (r: Row) =>
    (r.inss_patronal_pct ?? 0) + (r.fgts_pct ?? 0) +
    (r.decimo_terceiro_pct ?? 0) + (r.ferias_pct ?? 0) + (r.outros_encargos_pct ?? 0)

  // Vincular a um atleta existente.
  const linkToAthlete = useCallback((r: Row, athleteId: string) => {
    const a = athletes.find(x => x.id === athleteId)
    void patch(r.id, {
      atleta_id: athleteId || null,
      nome: a?.full_name ?? r.nome,
      data_nascimento: a?.birth_date ?? r.data_nascimento,
      posicao: a?.position ?? r.posicao,
    })
  }, [athletes, patch])

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 32px)', maxWidth: '100%' }}>
      <PageHero
        title="Premissas por atleta"
        subtitle="Modelo financeiro — Fase 1"
      >
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void addNew('ATLETA_EXISTENTE')} style={btn()}>
              + Atleta existente
            </button>
            <button onClick={() => void addNew('NOVA_CONTRATACAO')} style={btn('accent')}>
              + Nova contratação
            </button>
          </div>
        )}
      </PageHero>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por atleta ou posição"
          style={{
            padding: '8px 10px', border: '1px solid var(--rule)', borderRadius: 6,
            background: 'var(--surface)', fontFamily: fontBody, fontSize: 13, minWidth: 240,
          }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['TODOS', ...DECISAO_OPTIONS] as const).map(d => (
            <button key={d} onClick={() => setFilter(d)} style={{
              padding: '6px 10px', border: '1px solid var(--rule)',
              borderRadius: 6, fontFamily: fontMono, fontSize: 10, letterSpacing: '0.10em',
              background: filter === d ? 'var(--ink-primary)' : 'var(--surface)',
              color: filter === d ? '#fff' : 'var(--ink-secondary)',
              cursor: 'pointer', textTransform: 'uppercase',
            }}>{d === 'TODOS' ? 'Todos' : DECISAO_LABELS[d as PremissaDecisao]}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: fontMono, fontSize: 10, color: 'var(--ink-secondary)' }}>
          {filtered.length} {filtered.length === 1 ? 'linha' : 'linhas'}
        </span>
      </div>

      {err && (
        <div style={{
          padding: '10px 14px', border: '1px solid var(--neg)', background: 'var(--neg-tint)',
          borderRadius: 6, color: 'var(--neg)', fontFamily: fontBody, fontSize: 13, marginBottom: 12,
        }}>{err}</div>
      )}

      <div style={{
        overflowX: 'auto', border: '1px solid var(--rule)', borderRadius: 8,
        background: 'var(--surface)',
      }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 2400 }}>
          <thead>
            <tr>
              <Head sticky width={220}>Atleta</Head>
              <Head width={110}>Nascimento</Head>
              <Head width={110}>Posição</Head>
              <Head width={130}>Valor merc. (EUR)</Head>
              <Head width={110}>Contrato início</Head>
              <Head width={110}>Contrato fim</Head>
              <Head width={110}>Salário (BRL)</Head>
              <Head width={110}>Imagem (BRL)</Head>
              <Head width={90}>INSS %</Head>
              <Head width={90}>FGTS %</Head>
              <Head width={90}>13º %</Head>
              <Head width={90}>Férias %</Head>
              <Head width={90}>Outros %</Head>
              <Head width={70}>Σ enc.</Head>
              <Head width={130}>Luvas total (BRL)</Head>
              <Head width={140}>Intermediação (BRL)</Head>
              <Head width={150}>Decisão</Head>
              <Head width={120}>Data decisão</Head>
              <Head width={130}>Venda (EUR)</Head>
              <Head width={90}>Comis. %</Head>
              <Head width={90}>Solid. %</Head>
              <Head width={80}>Antec.?</Head>
              <Head width={100}>Antec. modo</Head>
              <Head width={90}>Antec. %/vlr</Head>
              <Head width={90}>CDI a.a.</Head>
              <Head width={90}>Spread a.a.</Head>
              <Head width={130}>Renov. salário</Head>
              <Head width={130}>Renov. imagem</Head>
              <Head width={130}>Renov. luvas</Head>
              <Head width={90}>Renov. m</Head>
              <Head width={60}>{' '}</Head>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={31} style={{ padding: 20, textAlign: 'center', color: 'var(--ink-secondary)', fontFamily: fontMono, fontSize: 11 }}>Carregando...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={31} style={{ padding: 32, textAlign: 'center', color: 'var(--ink-secondary)', fontFamily: fontBody, fontSize: 13 }}>
                Nenhuma premissa cadastrada. Clique em <b>+ Atleta existente</b> ou <b>+ Nova contratação</b> para começar.
              </td></tr>
            )}
            {filtered.map(r => {
              const disabled = !canEdit
              return (
                <tr key={r.id}>
                  {/* Atleta — sticky */}
                  <td style={{
                    padding: '6px 8px', borderBottom: '1px solid var(--rule)',
                    background: 'var(--surface)', position: 'sticky', left: 0, zIndex: 2,
                    borderRight: '1px solid var(--rule)', minWidth: 220,
                  }}>
                    {r.atleta_id ? (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <select
                          disabled={disabled}
                          value={r.atleta_id ?? ''}
                          onChange={e => linkToAthlete(r, e.target.value)}
                          style={selectStyle()}
                        >
                          <option value="">— sem vínculo —</option>
                          {athletes.map(a => (
                            <option key={a.id} value={a.id}>{a.full_name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <CellInput
                          value={r.nome ?? ''}
                          onCommit={v => void patch(r.id, { nome: v || null })}
                          placeholder="Nome (nova contratação)"
                          disabled={disabled}
                        />
                        <select
                          disabled={disabled}
                          value=""
                          onChange={e => e.target.value && linkToAthlete(r, e.target.value)}
                          style={{ ...selectStyle(), fontSize: 11, color: 'var(--ink-secondary)' }}
                        >
                          <option value="">vincular a atleta existente...</option>
                          {athletes.map(a => (
                            <option key={a.id} value={a.id}>{a.full_name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </td>
                  <Cell><CellInput type="date" value={r.data_nascimento ?? ''} disabled={disabled}
                    onCommit={v => void patch(r.id, { data_nascimento: v || null })} /></Cell>
                  <Cell><CellInput value={r.posicao ?? ''} disabled={disabled}
                    onCommit={v => void patch(r.id, { posicao: v || null })} /></Cell>
                  <Cell align="right"><CellInput type="number" value={r.valor_mercado_eur ?? ''} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { valor_mercado_eur: toNum(v) })} /></Cell>
                  <Cell><CellInput type="date" value={r.contrato_inicio ?? ''} disabled={disabled}
                    onCommit={v => void patch(r.id, { contrato_inicio: v || null })} /></Cell>
                  <Cell><CellInput type="date" value={r.contrato_fim ?? ''} disabled={disabled}
                    onCommit={v => void patch(r.id, { contrato_fim: v || null })} /></Cell>
                  <Cell align="right"><CellInput type="number" value={r.salario_brl} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { salario_brl: toNum(v) ?? 0 })} /></Cell>
                  <Cell align="right"><CellInput type="number" value={r.imagem_brl} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { imagem_brl: toNum(v) ?? 0 })} /></Cell>
                  <Cell align="right"><CellInput type="number" step="0.01" value={fmtPct(r.inss_patronal_pct)} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { inss_patronal_pct: toPct(v) ?? 0 })} /></Cell>
                  <Cell align="right"><CellInput type="number" step="0.01" value={fmtPct(r.fgts_pct)} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { fgts_pct: toPct(v) ?? 0 })} /></Cell>
                  <Cell align="right"><CellInput type="number" step="0.01" value={fmtPct(r.decimo_terceiro_pct)} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { decimo_terceiro_pct: toPct(v) ?? 0 })} /></Cell>
                  <Cell align="right"><CellInput type="number" step="0.01" value={fmtPct(r.ferias_pct)} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { ferias_pct: toPct(v) ?? 0 })} /></Cell>
                  <Cell align="right"><CellInput type="number" step="0.01" value={fmtPct(r.outros_encargos_pct)} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { outros_encargos_pct: toPct(v) ?? 0 })} /></Cell>
                  <Cell align="right">
                    <span style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--ink-secondary)' }}>
                      {fmtPct(totalEncargos(r))}%
                    </span>
                  </Cell>
                  <Cell align="right"><CellInput type="number" value={r.luvas_total_brl} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { luvas_total_brl: toNum(v) ?? 0 })} /></Cell>
                  <Cell align="right"><CellInput type="number" value={r.intermediacao_total_brl} disabled={disabled} align="right"
                    onCommit={v => void patch(r.id, { intermediacao_total_brl: toNum(v) ?? 0 })} /></Cell>

                  {/* Decisão */}
                  <Cell>
                    <select
                      disabled={disabled}
                      value={r.decisao}
                      onChange={e => void patch(r.id, { decisao: e.target.value as PremissaDecisao })}
                      style={{
                        ...selectStyle(),
                        background: DECISAO_COLOR[r.decisao].bg,
                        color: DECISAO_COLOR[r.decisao].fg,
                        fontWeight: 600,
                      }}
                    >
                      {DECISAO_OPTIONS.map(d => (
                        <option key={d} value={d}>{DECISAO_LABELS[d]}</option>
                      ))}
                    </select>
                  </Cell>
                  <Cell><CellInput type="date" value={r.decisao_data ?? ''} disabled={disabled || r.decisao === 'MANTER'}
                    onCommit={v => void patch(r.id, { decisao_data: v || null })} /></Cell>

                  {/* Venda */}
                  <Cell align="right"><CellInput type="number" value={r.venda_valor_eur ?? ''} disabled={disabled || r.decisao !== 'VENDER'} align="right"
                    onCommit={v => void patch(r.id, { venda_valor_eur: toNum(v) })} /></Cell>
                  <Cell align="right"><CellInput type="number" step="0.01" value={fmtPct(r.venda_comissao_pct)} disabled={disabled || r.decisao !== 'VENDER'} align="right"
                    onCommit={v => void patch(r.id, { venda_comissao_pct: toPct(v) })} /></Cell>
                  <Cell align="right"><CellInput type="number" step="0.01" value={fmtPct(r.venda_solidariedade_pct)} disabled={disabled || r.decisao !== 'VENDER'} align="right"
                    onCommit={v => void patch(r.id, { venda_solidariedade_pct: toPct(v) })} /></Cell>

                  {/* Antecipação */}
                  <Cell align="center">
                    <input type="checkbox" disabled={disabled || r.decisao !== 'VENDER'}
                      checked={!!r.antecipar}
                      onChange={e => void patch(r.id, { antecipar: e.target.checked })}
                    />
                  </Cell>
                  <Cell>
                    <select
                      disabled={disabled || !r.antecipar}
                      value={r.antecipacao_modo}
                      onChange={e => void patch(r.id, { antecipacao_modo: e.target.value as 'PERCENTUAL' | 'VALOR' })}
                      style={selectStyle()}
                    >
                      <option value="PERCENTUAL">% do total</option>
                      <option value="VALOR">Valor fixo</option>
                    </select>
                  </Cell>
                  <Cell align="right">
                    {r.antecipacao_modo === 'PERCENTUAL' ? (
                      <CellInput type="number" step="0.01" value={fmtPct(r.antecipacao_pct)} disabled={disabled || !r.antecipar} align="right"
                        onCommit={v => void patch(r.id, { antecipacao_pct: toPct(v) })} />
                    ) : (
                      <CellInput type="number" value={r.antecipacao_valor ?? ''} disabled={disabled || !r.antecipar} align="right"
                        onCommit={v => void patch(r.id, { antecipacao_valor: toNum(v) })} />
                    )}
                  </Cell>
                  <Cell align="right"><CellInput type="number" step="0.01" value={fmtPct(r.antecipacao_cdi_pct_aa)} disabled={disabled || !r.antecipar} align="right"
                    onCommit={v => void patch(r.id, { antecipacao_cdi_pct_aa: toPct(v) })} /></Cell>
                  <Cell align="right"><CellInput type="number" step="0.01" value={fmtPct(r.antecipacao_spread_pct_aa)} disabled={disabled || !r.antecipar} align="right"
                    onCommit={v => void patch(r.id, { antecipacao_spread_pct_aa: toPct(v) })} /></Cell>

                  {/* Renovação */}
                  <Cell align="right"><CellInput type="number" value={r.renov_novo_salario_brl ?? ''} disabled={disabled || r.decisao !== 'RENOVAR'} align="right"
                    onCommit={v => void patch(r.id, { renov_novo_salario_brl: toNum(v) })} /></Cell>
                  <Cell align="right"><CellInput type="number" value={r.renov_novo_imagem_brl ?? ''} disabled={disabled || r.decisao !== 'RENOVAR'} align="right"
                    onCommit={v => void patch(r.id, { renov_novo_imagem_brl: toNum(v) })} /></Cell>
                  <Cell align="right"><CellInput type="number" value={r.renov_novas_luvas_brl ?? ''} disabled={disabled || r.decisao !== 'RENOVAR'} align="right"
                    onCommit={v => void patch(r.id, { renov_novas_luvas_brl: toNum(v) })} /></Cell>
                  <Cell align="right"><CellInput type="number" value={r.renov_novo_prazo_meses ?? ''} disabled={disabled || r.decisao !== 'RENOVAR'} align="right"
                    onCommit={v => void patch(r.id, { renov_novo_prazo_meses: toNum(v) })} /></Cell>

                  {/* Ações */}
                  <Cell align="center">
                    {canEdit && (
                      <IconButton icon="trash" label="Excluir linha" tone="danger" small
                        onClick={() => void removeRow(r.id)} />
                    )}
                  </Cell>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, fontFamily: fontMono, fontSize: 10, letterSpacing: '0.08em', color: 'var(--ink-secondary)' }}>
        Encargos padrão: INSS {fmtPct(ENCARGOS_DEFAULT.inss_patronal_pct)}% · FGTS {fmtPct(ENCARGOS_DEFAULT.fgts_pct)}% · 13º {fmtPct(ENCARGOS_DEFAULT.decimo_terceiro_pct)}% · férias {fmtPct(ENCARGOS_DEFAULT.ferias_pct)}%. Antecipação padrão: CDI {fmtPct(ANTECIPACAO_DEFAULT.cdi_pct_aa)}% + {fmtPct(ANTECIPACAO_DEFAULT.spread_pct_aa)}% a.a.
      </p>
    </div>
  )
}

function btn(variant?: 'accent'): React.CSSProperties {
  return {
    padding: '8px 14px',
    border: variant === 'accent' ? '1px solid #be8c4a' : '1px solid rgba(255,255,255,0.20)',
    background: variant === 'accent' ? '#be8c4a' : 'transparent',
    color: variant === 'accent' ? '#1a1410' : '#f3eee2',
    fontFamily: fontMono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
    borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  }
}

function selectStyle(): React.CSSProperties {
  return {
    width: '100%', padding: '4px 6px',
    border: '1px solid var(--rule)', borderRadius: 4,
    background: 'var(--surface)', fontFamily: fontBody, fontSize: 12,
    color: 'var(--ink-primary)', cursor: 'pointer',
  }
}
