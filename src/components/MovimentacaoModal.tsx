// src/components/MovimentacaoModal.tsx
// "Registrar movimentação" do atleta (venda, compra, empréstimo, retorno,
// rescisão) em dois passos: 1) formulário; 2) PRÉVIA dos efeitos que serão
// aplicados (status, vínculo encerrado, parcelas de salário/imagem canceladas,
// titularidade do Botafogo) — só grava ao confirmar. Backend: seção 026 de
// docs/CONTRATOS_BACKEND.md (RPC atômica registrar_movimentacao).

import { useState } from 'react'
import EntityPicker from './EntityPicker'
import NumberInput from './NumberInput'
import { ModalShell } from './modals/EditModals'
import { modalInput, modalLabel } from './modals/styles'
import {
  MOVIMENTACAO_LABELS, MOV_CURRENCIES, computeEfeitos, loadPreviewData, registrarMovimentacao,
  type MovimentacaoTipo, type RegistrarMovimentacaoInput, type EfeitosMovimentacao, type PreviewData,
} from '../lib/movimentacao'
import { fetchClubs } from '../lib/athleteQueries'
import { norm } from '../lib/importHelpers'
import { fmtDate, fmtCurrencyShort, todayISO } from '../lib/format'
import { CONTRACT_TYPE_LABELS } from '../types/athlete-system'
import type { Contract, Currency } from '../types/athlete-system'

const font = "var(--font-body)"
const mono = "var(--font-label)"

const STATUS_LABEL: Record<string, string> = {
  ATIVO: 'Ativo', EMPRESTADO: 'Emprestado', VENDIDO: 'Vendido', DESLIGADO: 'Desligado', LESIONADO: 'Lesionado', LIBERADO: 'Desligado',
}

const TIPOS = Object.keys(MOVIMENTACAO_LABELS) as MovimentacaoTipo[]
const isLoan = (t: MovimentacaoTipo) => t === 'EMPRESTIMO_SAIDA' || t === 'EMPRESTIMO_ENTRADA'
const hasRights = (t: MovimentacaoTipo) => t === 'VENDA' || t === 'COMPRA'
const hasValue = (t: MovimentacaoTipo) => t !== 'RETORNO_EMPRESTIMO'

export default function MovimentacaoModal({ athleteId, athleteName, contracts, onClose, onDone }: {
  athleteId: string
  athleteName: string
  contracts: Contract[]
  onClose: () => void
  onDone: () => void
}) {
  const [f, setF] = useState({
    tipo: 'VENDA' as MovimentacaoTipo,
    data: todayISO(),
    clube: '',
    valor: '' as string,
    moeda: 'EUR' as Currency,
    pct: '' as string,
    retorno: '',
    opcao: '' as string,
    cancelarSalario: false,
    contratoId: '',
    obs: '',
  })
  const [step, setStep] = useState<'form' | 'preview'>('form')
  const [preview, setPreview] = useState<{ ef: EfeitosMovimentacao; data: PreviewData } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }))

  async function buildInput(): Promise<RegistrarMovimentacaoInput> {
    let clubId: string | null = null
    if (f.clube.trim()) {
      const clubs = await fetchClubs().catch(() => [])
      clubId = clubs.find(c => norm(c.name) === norm(f.clube))?.id ?? null
    }
    return {
      atleta_id: athleteId,
      tipo: f.tipo,
      data_movimentacao: f.data,
      clube_contraparte_id: clubId,
      clube_contraparte_nome: f.clube.trim() || null,
      valor: hasValue(f.tipo) && f.valor ? Number(f.valor) : null,
      moeda: f.moeda,
      percentual_direitos: hasRights(f.tipo) && f.pct !== '' ? Number(f.pct) : null,
      data_retorno_prevista: isLoan(f.tipo) && f.retorno ? f.retorno : null,
      opcao_compra_valor: isLoan(f.tipo) && f.opcao ? Number(f.opcao) : null,
      contrato_id: f.contratoId || null,
      observacoes: f.obs.trim() || null,
      cancelar_salario: f.tipo === 'EMPRESTIMO_SAIDA' ? f.cancelarSalario : undefined,
    }
  }

  const formError =
    !f.data ? 'Informe a data da movimentação.' :
    (f.pct !== '' && (Number(f.pct) < 0 || Number(f.pct) > 100)) ? '% de direitos deve estar entre 0 e 100.' :
    (isLoan(f.tipo) && f.retorno && f.retorno < f.data) ? 'A data de retorno prevista é anterior à movimentação.' :
    null

  async function goPreview() {
    if (formError) { setErr(formError); return }
    setBusy(true); setErr(null)
    try {
      const data = await loadPreviewData(athleteId)
      if (!data) throw new Error('Atleta não encontrado.')
      setPreview({ ef: computeEfeitos(await buildInput(), data), data })
      setStep('preview')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function confirm() {
    setBusy(true); setErr(null)
    try {
      await registrarMovimentacao(await buildInput())
      onDone()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const sectionTitle: React.CSSProperties = { fontFamily: mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 6 }
  const linkable = contracts.filter(c => ['SAIDA', 'EMPRESTIMO_SAIDA', 'EMPRESTIMO_ENTRADA', 'ENTRADA'].includes(c.type))

  const footer = step === 'form' ? (
    <>
      <button className="btn btn-outline" onClick={onClose} disabled={busy}>Cancelar</button>
      <button className="btn btn-primary" onClick={goPreview} disabled={busy}>{busy ? 'Calculando…' : 'Ver efeitos →'}</button>
    </>
  ) : (
    <>
      <button className="btn btn-outline" onClick={() => setStep('form')} disabled={busy}>← Voltar</button>
      <button className="btn btn-primary" onClick={confirm} disabled={busy} data-testid="mov-confirmar">{busy ? 'Registrando…' : 'Confirmar movimentação'}</button>
    </>
  )

  return (
    <ModalShell title="Registrar movimentação" subtitle={athleteName} width={620} onClose={onClose} footer={footer}>
      {step === 'form' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={modalLabel} htmlFor="mov-tipo">Tipo *</label>
            <select id="mov-tipo" style={modalInput} value={f.tipo} onChange={e => set('tipo', e.target.value as MovimentacaoTipo)}>
              {TIPOS.map(t => <option key={t} value={t}>{MOVIMENTACAO_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label style={modalLabel} htmlFor="mov-data">Data *</label>
            <input id="mov-data" type="date" style={modalInput} value={f.data} onChange={e => set('data', e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <EntityPicker kind="clube" label="Clube contraparte" value={f.clube} onChange={name => set('clube', name)} placeholder="Buscar ou cadastrar clube…" />
          </div>
          {hasValue(f.tipo) && (
            <>
              <div>
                <label style={modalLabel} htmlFor="mov-valor">{isLoan(f.tipo) ? 'Taxa de empréstimo' : 'Valor'}</label>
                <NumberInput id="mov-valor" style={modalInput} value={f.valor} onChange={v => set('valor', v)} placeholder="Ex.: 5.000.000" />
              </div>
              <div>
                <label style={modalLabel} htmlFor="mov-moeda">Moeda</label>
                <select id="mov-moeda" style={modalInput} value={f.moeda} onChange={e => set('moeda', e.target.value as Currency)}>
                  {MOV_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </>
          )}
          {hasRights(f.tipo) && (
            <div>
              <label style={modalLabel} htmlFor="mov-pct">% dos direitos econômicos {f.tipo === 'VENDA' ? 'vendidos' : 'adquiridos'}</label>
              <input id="mov-pct" style={modalInput} inputMode="decimal" value={f.pct} onChange={e => set('pct', e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} placeholder="Ex.: 60" />
            </div>
          )}
          {isLoan(f.tipo) && (
            <>
              <div>
                <label style={modalLabel} htmlFor="mov-retorno">Data de retorno prevista</label>
                <input id="mov-retorno" type="date" style={modalInput} value={f.retorno} onChange={e => set('retorno', e.target.value)} />
              </div>
              <div>
                <label style={modalLabel} htmlFor="mov-opcao">Opção de compra (valor)</label>
                <NumberInput id="mov-opcao" style={modalInput} value={f.opcao} onChange={v => set('opcao', v)} placeholder="Opcional" />
              </div>
            </>
          )}
          {f.tipo === 'EMPRESTIMO_SAIDA' && (
            <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)' }}>
              <input type="checkbox" checked={f.cancelarSalario} onChange={e => set('cancelarSalario', e.target.checked)} />
              Cancelar salário e imagem futuros (o clube de destino assume 100% da remuneração)
            </label>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={modalLabel} htmlFor="mov-contrato">Contrato vinculado (opcional)</label>
            <select id="mov-contrato" style={modalInput} value={f.contratoId} onChange={e => set('contratoId', e.target.value)}>
              <option value="">— nenhum —</option>
              {linkable.map(c => <option key={c.id} value={c.id}>{CONTRACT_TYPE_LABELS[c.type]} · {c.counterpart_club || '—'} · {fmtDate(c.start_date)}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, marginTop: 3 }}>
              A movimentação não cria cláusulas: o contrato de saída/empréstimo (com transfer fee e parcelas) continua sendo cadastrado em “Novo contrato”.
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={modalLabel} htmlFor="mov-obs">Observações</label>
            <textarea id="mov-obs" style={{ ...modalInput, minHeight: 52, resize: 'vertical' }} value={f.obs} onChange={e => set('obs', e.target.value)} />
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <PreviewList ef={preview.ef} data={preview.data} tipo={f.tipo} date={f.data} sectionTitle={sectionTitle} />
      )}

      {err && <div role="alert" style={{ fontSize: 12, color: 'var(--neg)', fontFamily: font, background: 'var(--neg-tint)', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
    </ModalShell>
  )
}

function PreviewList({ ef, data, tipo, date, sectionTitle }: {
  ef: EfeitosMovimentacao; data: PreviewData; tipo: MovimentacaoTipo; date: string; sectionTitle: React.CSSProperties
}) {
  const instById = new Map(data.installments.map(i => [i.id, i]))
  const cancelTotals: Partial<Record<Currency, number>> = {}
  for (const id of ef.parcelas_canceladas) {
    const i = instById.get(id); if (!i) continue
    cancelTotals[i.currency] = (cancelTotals[i.currency] ?? 0) + i.original_value
  }
  const li: React.CSSProperties = { fontSize: 13, fontFamily: font, color: 'var(--ink-primary)', padding: '6px 0', borderBottom: '1px solid var(--divider-soft)' }
  const muted: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 12 }
  return (
    <div data-testid="mov-preview">
      <div style={sectionTitle}>Efeitos que serão aplicados — {MOVIMENTACAO_LABELS[tipo]} em {fmtDate(date)}</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <li style={li}>
          Status do atleta: <strong>{STATUS_LABEL[ef.status_anterior] ?? ef.status_anterior}</strong> → <strong>{STATUS_LABEL[ef.status_novo] ?? ef.status_novo}</strong>
          {ef.status_anterior === ef.status_novo && <span style={muted}> (sem mudança)</span>}
        </li>
        <li style={li}>
          Vínculos de trabalho {tipo === 'RESCISAO' ? 'rescindidos' : 'encerrados'}: <strong>{ef.contratos_encerrados.length}</strong>
          {ef.contratos_encerrados.map(c => {
            const ct = data.contracts.find(x => x.id === c.id)
            return <div key={c.id} style={muted}>· {ct ? `${CONTRACT_TYPE_LABELS[ct.type]} · ${ct.counterpart_club || '—'}` : c.id} — fim {fmtDate(c.data_fim_anterior)} → {fmtDate(date)}</div>
          })}
        </li>
        <li style={li}>
          Parcelas futuras de salário/imagem canceladas: <strong>{ef.parcelas_canceladas.length}</strong>
          {Object.entries(cancelTotals).map(([c, v]) => <span key={c} style={muted}> · {fmtCurrencyShort(v, c)}</span>)}
          {tipo === 'EMPRESTIMO_SAIDA' && ef.parcelas_canceladas.length === 0 && <div style={muted}>Empréstimo sem “cancelar salário”: o fluxo continua (use o rateio de salário do empréstimo se o clube assumir parte).</div>}
        </li>
        <li style={li}>Direitos de imagem (mensais) cancelados: <strong>{ef.direitos_imagem_cancelados.length}</strong></li>
        <li style={li}>
          Titularidade do Botafogo:{' '}
          {ef.titularidade
            ? <strong>{ef.titularidade.inserida ? 'nova linha' : `${ef.titularidade.percentual_anterior}%`} → {ef.titularidade.percentual_novo}%</strong>
            : <span style={muted}>{hasRights(tipo) ? 'sem alteração (sem % informado ou sem linha BFR)' : 'sem alteração'}</span>}
        </li>
      </ul>
      <div style={{ ...muted, marginTop: 10, fontFamily: font }}>
        A operação é registrada no histórico de transferências e pode ser desfeita por um usuário master (somente a mais recente).
      </div>
    </div>
  )
}
