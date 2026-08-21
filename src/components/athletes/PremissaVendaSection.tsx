// src/components/athletes/PremissaVendaSection.tsx
// Aba "Venda & Simulação" da página do atleta. Onde o management define a
// premissa de venda (valor, cronograma, antecipação, comissões) e vê o impacto
// CONTÁBIL (competência) e de CAIXA, além do que se evita em folha/amortização.
//
// A premissa é armazenada em ac_premissas_atleta (uma por atleta). Os dados de
// custo/amortização vêm do cadastro (contrato de ENTRADA) automaticamente.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Athlete, Contract, Clause, EconomicRight } from '../../types/athlete-system'
import type { PremissaAtleta, CronogramaItem } from '../../types/premissas'
import { fetchPremissaByAtleta, createPremissa, updatePremissa } from '../../lib/premissasQueries'
import { deriveCadastro, simularPremissa, somaEncargosPct } from '../../lib/premissaSimulacao'
import { fetchPtaxRates } from '../../lib/ptax'
import { fmtCurrencyShort, fmtDate, todayISO } from '../../lib/format'
import NumberInput from '../NumberInput'
import { Icon, IconButton } from '../Icon'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 7, fontSize: 13, boxSizing: 'border-box',
  background: 'var(--cream-card)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font,
}
const lbl: React.CSSProperties = {
  fontSize: 9, fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 3, display: 'block',
}
const sectionTitle: React.CSSProperties = {
  fontSize: 10, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--gold-deep)', fontWeight: 700, marginBottom: 12,
}

// Escolhe o vínculo de trabalho (remuneração) para pré-preencher a premissa.
function employmentContract(contracts: Contract[]): Contract | null {
  const emp = contracts.filter(c => c.type === 'ENTRADA' || c.type === 'EMPRESTIMO_ENTRADA')
  const pool = emp.length ? emp : contracts.filter(c => c.base_salary != null)
  if (!pool.length) return null
  const active = pool.filter(c => c.status === 'ATIVO')
  const arr = active.length ? active : pool
  return [...arr].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
}

function pct(n: number | null | undefined): string {
  if (n == null) return ''
  return (n * 100).toFixed(2)
}
function toFrac(s: string): number | null {
  if (s === '' || s == null) return null
  const n = Number(String(s).replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return n > 1 ? n / 100 : n
}

export default function PremissaVendaSection({ athlete, contracts, clauses, rights, canEdit }: {
  athlete: Athlete
  contracts: Contract[]
  clauses: Clause[]
  rights: EconomicRight[]
  canEdit: boolean
}) {
  const [p, setP] = useState<PremissaAtleta | null>(null)
  const [ptax, setPtax] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [rates, prem] = await Promise.all([
        fetchPtaxRates().catch(() => ({} as Record<string, number>)),
        fetchPremissaByAtleta(athlete.id),
      ])
      setPtax(rates); setP(prem)
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao carregar a premissa.')
    } finally { setLoading(false) }
  }, [athlete.id])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { load() }, [load])

  // Cria a premissa já pré-preenchida com os dados do cadastro.
  async function criar() {
    setCreating(true); setErr(null)
    try {
      const emp = employmentContract(contracts)
      const created = await createPremissa({
        atleta_id: athlete.id,
        nome: athlete.full_name,
        data_nascimento: athlete.birth_date,
        posicao: athlete.position,
        contrato_inicio: emp?.start_date ?? null,
        contrato_fim: emp?.end_date ?? null,
        salario_brl: emp?.salary_currency === 'BRL' ? (emp?.base_salary ?? 0) : 0,
        imagem_brl: emp?.salary_currency === 'BRL' ? (emp?.image_value ?? 0) : 0,
        decisao: 'VENDER',
      })
      setP(created)
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao criar a premissa.')
    } finally { setCreating(false) }
  }

  // Persistência otimista: atualiza state e grava.
  const patch = useCallback(async (patchObj: Partial<PremissaAtleta>) => {
    if (!p) return
    const next = { ...p, ...patchObj }
    setP(next)
    try { await updatePremissa(p.id, patchObj) }
    catch (e) { setErr((e as Error)?.message ?? 'Falha ao salvar.'); await load() }
  }, [p, load])

  const sim = useMemo(() => {
    if (!p) return null
    const cad = deriveCadastro(athlete.id, contracts, clauses, rights, ptax, todayISO())
    return { cad, res: simularPremissa(p, cad, ptax, todayISO()) }
  }, [p, athlete.id, contracts, clauses, rights, ptax])

  if (loading) return <div style={{ padding: 32, textAlign: 'center', fontFamily: mono, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.14em' }}>CARREGANDO PREMISSA…</div>

  if (err) return (
    <div style={{ padding: '12px 16px', border: '1px solid var(--neg)', background: 'var(--neg-tint)', borderRadius: 8, color: 'var(--neg)', fontFamily: font, fontSize: 13 }}>{err}</div>
  )

  if (!p) return (
    <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ fontFamily: font, fontSize: 14, color: 'var(--ink-secondary)', maxWidth: 460 }}>
        Nenhuma premissa de venda cadastrada para <b>{athlete.full_name}</b>. Crie uma para simular o
        impacto contábil e de caixa de uma venda, renovação ou rescisão.
      </div>
      {canEdit && (
        <button onClick={criar} disabled={creating} className="btn btn-primary" style={{ padding: '9px 20px' }}>
          {creating ? 'Criando…' : '+ Criar premissa de venda'}
        </button>
      )}
    </div>
  )

  const res = sim!.res
  const cad = sim!.cad
  const encargosTotalPct = somaEncargosPct(p)
  const ro = !canEdit

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── KPIs de resultado ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <ResultCard label="Resultado contábil (venda)" value={fmtCurrencyShort(res.resultadoContabilBRL, 'BRL')}
          tone={res.resultadoContabilBRL >= 0 ? 'pos' : 'neg'} sub="reconhecido na competência" />
        <ResultCard label="Caixa líquido" value={fmtCurrencyShort(res.caixaLiquidoBRL, 'BRL')}
          tone={res.caixaLiquidoBRL >= 0 ? 'pos' : 'neg'} sub={res.antecipar ? 'com antecipação' : 'sem antecipação'} />
        <ResultCard label="Folha futura evitada" value={fmtCurrencyShort(res.folhaFuturaEvitadaBRL, 'BRL')}
          tone="neutral" sub={`${res.mesesRestantes} meses restantes`} />
        <ResultCard label="Amortização evitada" value={fmtCurrencyShort(res.amortizacaoFuturaEvitadaBRL, 'BRL')}
          tone="neutral" sub={`residual ${fmtCurrencyShort(res.baixaResidualBRL, 'BRL')}`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(340px, 1.2fr)', gap: 18, alignItems: 'start' }}>
        {/* ── COLUNA ESQUERDA: inputs ───────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Decisão */}
          <div className="card" style={{ padding: 16 }}>
            <div style={sectionTitle}>Decisão</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Decisão</label>
                <select style={inp} value={p.decisao} disabled={ro}
                  onChange={e => void patch({ decisao: e.target.value as PremissaAtleta['decisao'] })}>
                  <option value="MANTER">Manter</option>
                  <option value="RENOVAR">Renovar</option>
                  <option value="VENDER">Vender</option>
                  <option value="RESCINDIR">Rescindir</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Data-alvo</label>
                <input type="date" style={inp} value={p.decisao_data ?? ''} disabled={ro}
                  onChange={e => void patch({ decisao_data: e.target.value || null })} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={lbl}>Observação</label>
              <input style={inp} value={p.decisao_nota ?? ''} disabled={ro}
                onChange={e => void patch({ decisao_nota: e.target.value || null })} placeholder="Contexto da decisão" />
            </div>
          </div>

          {/* Folha & encargos (base do impacto evitado) */}
          <div className="card" style={{ padding: 16 }}>
            <div style={sectionTitle}>Folha & encargos (mensal)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <NumField label="Salário CLT (BRL)" value={p.salario_brl} disabled={ro} onCommit={v => void patch({ salario_brl: v ?? 0 })} />
              <NumField label="Imagem (BRL)" value={p.imagem_brl} disabled={ro} onCommit={v => void patch({ imagem_brl: v ?? 0 })} />
              <PctField label="INSS patronal %" value={p.inss_patronal_pct} disabled={ro} onCommit={v => void patch({ inss_patronal_pct: v ?? 0 })} />
              <PctField label="FGTS %" value={p.fgts_pct} disabled={ro} onCommit={v => void patch({ fgts_pct: v ?? 0 })} />
              <PctField label="13º %" value={p.decimo_terceiro_pct} disabled={ro} onCommit={v => void patch({ decimo_terceiro_pct: v ?? 0 })} />
              <PctField label="Férias %" value={p.ferias_pct} disabled={ro} onCommit={v => void patch({ ferias_pct: v ?? 0 })} />
              <PctField label="Outros encargos %" value={p.outros_encargos_pct} disabled={ro} onCommit={v => void patch({ outros_encargos_pct: v ?? 0 })} />
            </div>
            <div style={{ marginTop: 10, fontFamily: mono, fontSize: 11, color: 'var(--ink-secondary)' }}>
              Encargos: <b>{(encargosTotalPct * 100).toFixed(2)}%</b> · Folha total/mês:{' '}
              <b>{fmtCurrencyShort(res.folhaMensalBRL, 'BRL')}</b>
            </div>
          </div>

          {/* Parâmetros de venda */}
          {p.decisao === 'VENDER' && (
            <div className="card" style={{ padding: 16 }}>
              <div style={sectionTitle}>Parâmetros da venda</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <NumField label={`Valor de venda (${p.venda_moeda || 'EUR'})`} value={p.venda_valor_eur} disabled={ro}
                  onCommit={v => void patch({ venda_valor_eur: v })} />
                <div>
                  <label style={lbl}>Moeda</label>
                  <select style={inp} value={p.venda_moeda || 'EUR'} disabled={ro}
                    onChange={e => void patch({ venda_moeda: e.target.value })}>
                    {['EUR', 'USD', 'GBP', 'BRL'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <PctField label="Comissão da venda %" value={p.venda_comissao_pct} disabled={ro} onCommit={v => void patch({ venda_comissao_pct: v })} />
                <PctField label="Solidariedade FIFA %" value={p.venda_solidariedade_pct} disabled={ro} onCommit={v => void patch({ venda_solidariedade_pct: v })} />
              </div>
              <div style={{ marginTop: 8, fontFamily: mono, fontSize: 10.5, color: 'var(--text-muted)' }}>
                Sell-on cadastrado: <b>{cad.sellOnPct.toFixed(2)}%</b> sobre a mais-valia ·
                Intermediação de venda futura cadastrada: <b>{fmtCurrencyShort(cad.intermedFutureBRL, 'BRL')}</b>
              </div>

              {/* Cronograma de recebimento */}
              <div style={{ marginTop: 14, borderTop: '1px solid var(--divider-soft)', paddingTop: 12 }}>
                <CronogramaPctEditor
                  title="Cronograma de recebimento"
                  disabled={ro}
                  items={p.venda_recebimento_cronograma ?? []}
                  vendaBRL={res.vendaBRL}
                  onChange={items => void patch({ venda_recebimento_cronograma: items.length ? items : null })}
                />
              </div>

              {/* Antecipação de recebíveis */}
              <div style={{ marginTop: 14, borderTop: '1px solid var(--divider-soft)', paddingTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: font, fontSize: 13, color: 'var(--ink-primary)', cursor: ro ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={!!p.antecipar} disabled={ro}
                    onChange={e => void patch({ antecipar: e.target.checked })} />
                  Antecipar recebíveis (desconto financeiro)
                </label>
                {p.antecipar && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    <div>
                      <label style={lbl}>Modo</label>
                      <select style={inp} value={p.antecipacao_modo} disabled={ro}
                        onChange={e => void patch({ antecipacao_modo: e.target.value as 'PERCENTUAL' | 'VALOR' })}>
                        <option value="PERCENTUAL">% do recebível</option>
                        <option value="VALOR">Valor fixo (BRL)</option>
                      </select>
                    </div>
                    {p.antecipacao_modo === 'PERCENTUAL' ? (
                      <PctField label="% antecipado" value={p.antecipacao_pct} disabled={ro} onCommit={v => void patch({ antecipacao_pct: v })} />
                    ) : (
                      <NumField label="Valor antecipado (BRL)" value={p.antecipacao_valor} disabled={ro} onCommit={v => void patch({ antecipacao_valor: v })} />
                    )}
                    <PctField label="CDI a.a. %" value={p.antecipacao_cdi_pct_aa} disabled={ro} onCommit={v => void patch({ antecipacao_cdi_pct_aa: v })} />
                    <PctField label="Spread a.a. %" value={p.antecipacao_spread_pct_aa} disabled={ro} onCommit={v => void patch({ antecipacao_spread_pct_aa: v })} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Renovação */}
          {p.decisao === 'RENOVAR' && (
            <div className="card" style={{ padding: 16 }}>
              <div style={sectionTitle}>Parâmetros da renovação</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <NumField label="Novo salário (BRL)" value={p.renov_novo_salario_brl} disabled={ro} onCommit={v => void patch({ renov_novo_salario_brl: v })} />
                <NumField label="Nova imagem (BRL)" value={p.renov_novo_imagem_brl} disabled={ro} onCommit={v => void patch({ renov_novo_imagem_brl: v })} />
                <NumField label="Novas luvas (BRL)" value={p.renov_novas_luvas_brl} disabled={ro} onCommit={v => void patch({ renov_novas_luvas_brl: v })} />
                <NumField label="Novo prazo (meses)" value={p.renov_novo_prazo_meses} disabled={ro} onCommit={v => void patch({ renov_novo_prazo_meses: v })} />
              </div>
            </div>
          )}
        </div>

        {/* ── COLUNA DIREITA: demonstração ──────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {p.decisao === 'VENDER' ? (
            <>
              {/* Resultado contábil (competência) */}
              <div className="card" style={{ padding: 16 }}>
                <div style={sectionTitle}>Resultado contábil (competência)</div>
                <WaterfallRow label="Receita de venda" value={res.vendaBRL} strong />
                <WaterfallRow label="(−) Solidariedade FIFA" value={-res.solidariedadeBRL} />
                <WaterfallRow label="(−) Baixa do valor residual (intangível)" value={-res.baixaResidualBRL} />
                <WaterfallRow label="= Mais-valia" value={res.maisValiaBRL} muted />
                <WaterfallRow label="(−) Sell-on fee" value={-res.sellOnBRL} />
                <WaterfallRow label="(−) Comissão da venda" value={-res.comissaoBRL} />
                <WaterfallRow label="(−) Intermediação cadastrada" value={-res.intermedCadastradaBRL} />
                <div style={{ borderTop: '2px solid var(--divider-strong)', marginTop: 8, paddingTop: 8 }}>
                  <WaterfallRow label="Resultado contábil" value={res.resultadoContabilBRL} strong
                    tone={res.resultadoContabilBRL >= 0 ? 'pos' : 'neg'} />
                </div>
              </div>

              {/* Efeito caixa */}
              <div className="card" style={{ padding: 16 }}>
                <div style={sectionTitle}>Efeito caixa</div>
                {res.recebimentos.map((r, i) => (
                  <WaterfallRow key={i} label={`${fmtDate(r.data)} · ${r.rotulo}`} value={r.valor} />
                ))}
                {res.antecipar && res.despesaFinanceiraBRL > 0 && (
                  <WaterfallRow label="(−) Despesa financeira de antecipação" value={-res.despesaFinanceiraBRL} />
                )}
                <WaterfallRow label="Entrada líquida" value={res.caixaEntradaLiquidaBRL} muted />
                {res.saidas.map((s, i) => (
                  <WaterfallRow key={`s${i}`} label={s.rotulo} value={s.valor} />
                ))}
                <div style={{ borderTop: '2px solid var(--divider-strong)', marginTop: 8, paddingTop: 8 }}>
                  <WaterfallRow label="Caixa líquido" value={res.caixaLiquidoBRL} strong
                    tone={res.caixaLiquidoBRL >= 0 ? 'pos' : 'neg'} />
                </div>
              </div>

              {/* A quem repassar */}
              <div className="card" style={{ padding: 16 }}>
                <div style={sectionTitle}>A quem repassar</div>
                {res.repasses.length === 0 ? (
                  <div style={{ fontFamily: font, fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Nenhum repasse a terceiros. O clube retém 100% do resultado.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {res.repasses.map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: font, fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--divider-soft)' }}>
                        <span><b>{r.party}</b> <span style={{ color: 'var(--text-muted)' }}>· {r.motivo}</span></span>
                        <span style={{ fontFamily: mono, whiteSpace: 'nowrap' }}>{fmtCurrencyShort(r.valorBRL, 'BRL')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card" style={{ padding: 16 }}>
              <div style={sectionTitle}>Impacto do atleta (mantendo)</div>
              <WaterfallRow label="Salário CLT / mês" value={p.salario_brl} />
              <WaterfallRow label="Imagem / mês" value={p.imagem_brl} />
              <WaterfallRow label="Encargos / mês" value={res.encargosMensalBRL} />
              <WaterfallRow label="Amortização / mês" value={res.amortizacaoMensalBRL} />
              <div style={{ borderTop: '2px solid var(--divider-strong)', marginTop: 8, paddingTop: 8 }}>
                <WaterfallRow label="Custo mensal total" value={res.custoMensalTotalBRL} strong />
              </div>
              <div style={{ marginTop: 10, fontFamily: font, fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                Selecione a decisão <b>Vender</b> para simular o impacto contábil e de caixa de uma venda.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Cards / rows ─────────────────────────────────────────────────────────────
function ResultCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'pos' | 'neg' | 'neutral' }) {
  const color = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--ink-primary)'
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 9, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, fontFamily: mono, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3, fontFamily: font }}>{sub}</div>}
    </div>
  )
}

function WaterfallRow({ label, value, strong, muted, tone }: {
  label: string; value: number; strong?: boolean; muted?: boolean; tone?: 'pos' | 'neg'
}) {
  const color = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--ink-primary)'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontFamily: font, fontSize: strong ? 13.5 : 12.5, color: muted ? 'var(--ink-secondary)' : 'var(--ink-primary)', fontWeight: strong ? 700 : 400 }}>
      <span>{label}</span>
      <span style={{ fontFamily: mono, whiteSpace: 'nowrap', color: strong ? color : undefined, fontVariantNumeric: 'tabular-nums' }}>
        {fmtCurrencyShort(value, 'BRL')}
      </span>
    </div>
  )
}

// ── Campos numéricos com commit no blur ──────────────────────────────────────
function NumField({ label, value, onCommit, disabled }: {
  label: string; value: number | null | undefined; onCommit: (v: number | null) => void; disabled?: boolean
}) {
  const [v, setV] = useState<string>(value == null ? '' : String(value))
  // eslint-disable-next-line react-hooks/set-state-in-effect -- re-sincroniza com o valor externo
  useEffect(() => { setV(value == null ? '' : String(value)) }, [value])
  return (
    <div>
      <label style={lbl}>{label}</label>
      <NumberInput style={inp} value={v} disabled={disabled}
        onChange={s => setV(s)}
        onBlur={() => { const n = v === '' ? null : Number(String(v).replace(',', '.')); onCommit(Number.isFinite(n as number) ? (n as number) : null) }} />
    </div>
  )
}

function PctField({ label, value, onCommit, disabled }: {
  label: string; value: number | null | undefined; onCommit: (v: number | null) => void; disabled?: boolean
}) {
  const [v, setV] = useState<string>(pct(value))
  // eslint-disable-next-line react-hooks/set-state-in-effect -- re-sincroniza com o valor externo
  useEffect(() => { setV(pct(value)) }, [value])
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input style={{ ...inp, fontFamily: mono, textAlign: 'right' }} value={v} disabled={disabled} inputMode="decimal"
        onChange={e => setV(e.target.value)}
        onBlur={() => onCommit(toFrac(v))} />
    </div>
  )
}

// ── Editor de cronograma percentual (recebimento da venda) ───────────────────
function CronogramaPctEditor({ title, items, vendaBRL, onChange, disabled }: {
  title: string; items: CronogramaItem[]; vendaBRL: number
  onChange: (items: CronogramaItem[]) => void; disabled?: boolean
}) {
  const set = (i: number, patch: Partial<CronogramaItem>) => onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const add = () => onChange([...items, { data: todayISO(), pct: 0 }])
  const rm = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const somaPct = items.reduce((s, it) => s + (it.pct ?? 0), 0)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-secondary)' }}>{title}</span>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: Math.abs(somaPct - 1) < 0.001 ? 'var(--pos)' : 'var(--warn)' }}>
          Σ {(somaPct * 100).toFixed(0)}%
        </span>
      </div>
      {items.length === 0 && (
        <div style={{ fontFamily: font, fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          Sem cronograma → 100% recebido à vista na data da venda.
        </div>
      )}
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 28px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <input type="date" style={{ ...inp, padding: '6px 8px', fontSize: 12 }} value={it.data} disabled={disabled}
            onChange={e => set(i, { data: e.target.value })} />
          <input inputMode="decimal" style={{ ...inp, padding: '6px 8px', fontSize: 12, textAlign: 'right', fontFamily: mono }}
            value={it.pct == null ? '' : String(Math.round((it.pct) * 10000) / 100)} disabled={disabled}
            onChange={e => { const n = Number(e.target.value.replace(',', '.')); set(i, { pct: Number.isFinite(n) ? n / 100 : 0 }) }}
            placeholder="%" />
          <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
            {fmtCurrencyShort((it.pct ?? 0) * vendaBRL, 'BRL')}
          </span>
          {!disabled && <IconButton icon="x" label="Remover" tone="danger" small onClick={() => rm(i)} />}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={add} style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px dashed var(--divider-strong)', background: 'transparent', color: 'var(--ink-primary)', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="plus" size={13} /> Adicionar parcela
        </button>
      )}
    </div>
  )
}
