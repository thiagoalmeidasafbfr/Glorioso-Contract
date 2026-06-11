import { useState, useMemo } from 'react'
import PageHero from '../components/PageHero'
import {
  CONTRATOS_MOCK, CLAUSULAS_MOCK,
  type ContratoVenda, type ClausulaVenda,
  type TipoClausula, type StatusClausula, type MoedaContrato, type TipoTransferencia,
} from '../data/clausulasMock'

// ─── Styling constants ────────────────────────────────────────────────────────

const font      = "'Inter', system-ui, sans-serif"
const fontMono  = "'IBM Plex Mono', 'JetBrains Mono', monospace"

const MOEDA_SYM: Record<MoedaContrato, string> = { EUR: '€', USD: '$', BRL: 'R$', GBP: '£' }

const TIPOS: TipoClausula[] = [
  'Fixed','Variable','Contingent','Sell-On','Garantia','Opção','Proteção','Solidarity','Aceleração','Outro',
]

const TIPO_COLOR: Record<TipoClausula, { bg: string; fg: string }> = {
  Fixed:       { bg: 'rgba(59,130,246,0.15)',  fg: '#60a5fa' },
  Variable:    { bg: 'rgba(190,140,74,0.18)',  fg: '#be8c4a' },
  Contingent:  { bg: 'rgba(249,115,22,0.15)', fg: '#fb923c' },
  'Sell-On':   { bg: 'rgba(168,85,247,0.15)', fg: '#c084fc' },
  Garantia:    { bg: 'rgba(34,197,94,0.15)',  fg: '#4ade80' },
  Opção:       { bg: 'rgba(6,182,212,0.15)',  fg: '#22d3ee' },
  Proteção:    { bg: 'rgba(239,68,68,0.13)',  fg: '#f87171' },
  Solidarity:  { bg: 'rgba(236,72,153,0.13)', fg: '#f472b6' },
  Aceleração:  { bg: 'rgba(132,204,22,0.13)', fg: '#a3e635' },
  Outro:       { bg: 'rgba(156,163,175,0.13)',fg: '#9ca3af' },
}

const STATUS_COLOR: Record<StatusClausula, { bg: string; fg: string }> = {
  Ativa:                 { bg: 'rgba(59,130,246,0.15)',  fg: '#60a5fa' },
  Garantida:             { bg: 'rgba(34,197,94,0.15)',   fg: '#4ade80' },
  Atingida:              { bg: 'rgba(190,140,74,0.18)',  fg: '#be8c4a' },
  'Parcialmente Atingida': { bg: 'rgba(249,115,22,0.15)', fg: '#fb923c' },
  Expirada:              { bg: 'rgba(156,163,175,0.12)', fg: '#6b7280' },
  Suspensa:              { bg: 'rgba(239,68,68,0.13)',   fg: '#f87171' },
}

const STATUS_CYCLE: StatusClausula[] = [
  'Ativa','Garantida','Parcialmente Atingida','Atingida','Expirada','Suspensa',
]

const TRANSFERENCIA_OPTS: TipoTransferencia[] = [
  'Permanent Transfer','Loan','Cessão Definitiva','Cessão Temporária','Outro',
]

const MOEDA_OPTS: MoedaContrato[] = ['EUR','USD','BRL','GBP']

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtValor(vNum: number | null, vTxt: string, moeda: MoedaContrato): string {
  if (vNum !== null) {
    const sym = MOEDA_SYM[moeda]
    if (vNum >= 1_000_000) return `${sym} ${(vNum / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
    if (vNum >= 1_000)     return `${sym} ${(vNum / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}K`
    return `${sym} ${vNum.toLocaleString('pt-BR')}`
  }
  return vTxt || '—'
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: TipoClausula }) {
  const c = TIPO_COLOR[tipo]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.10em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
      background: c.bg, color: c.fg,
    }}>
      {tipo}
    </span>
  )
}

function StatusBadge({ status, onClick }: { status: StatusClausula; onClick?: () => void }) {
  const c = STATUS_COLOR[status]
  return (
    <span
      onClick={onClick}
      title={onClick ? 'Clique para alterar o status' : undefined}
      style={{
        display: 'inline-block', padding: '2px 7px', borderRadius: 4,
        fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.10em',
        textTransform: 'uppercase', whiteSpace: 'nowrap',
        background: c.bg, color: c.fg,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {status}
    </span>
  )
}

// ─── Clause Form ──────────────────────────────────────────────────────────────

interface ClausulaFormState {
  numeroClausula: string
  descricao: string
  tipoClausula: TipoClausula
  subtipo: string
  gatilhoCondicao: string
  valorPorEvento: string
  valorTexto: string
  moeda: MoedaContrato
  teto: string
  tetoTexto: string
  tetoGlobalCompartilhado: boolean
  recorrente: boolean
  observacoes: string
  status: StatusClausula
  valorRealizado: string
  dataRealizacao: string
}

const CLAUSULA_FORM_EMPTY: ClausulaFormState = {
  numeroClausula: '', descricao: '', tipoClausula: 'Fixed', subtipo: '',
  gatilhoCondicao: '', valorPorEvento: '', valorTexto: '',
  moeda: 'EUR', teto: '', tetoTexto: '', tetoGlobalCompartilhado: false,
  recorrente: false, observacoes: '', status: 'Ativa',
  valorRealizado: '', dataRealizacao: '',
}

function clausulaToForm(c: ClausulaVenda): ClausulaFormState {
  return {
    numeroClausula: c.numeroClausula, descricao: c.descricao,
    tipoClausula: c.tipoClausula, subtipo: c.subtipo,
    gatilhoCondicao: c.gatilhoCondicao,
    valorPorEvento: c.valorPorEvento !== null ? String(c.valorPorEvento) : '',
    valorTexto: c.valorTexto, moeda: c.moeda,
    teto: c.teto !== null ? String(c.teto) : '', tetoTexto: c.tetoTexto,
    tetoGlobalCompartilhado: c.tetoGlobalCompartilhado,
    recorrente: c.recorrente, observacoes: c.observacoes,
    status: c.status,
    valorRealizado: c.valorRealizado > 0 ? String(c.valorRealizado) : '',
    dataRealizacao: c.dataRealizacao,
  }
}

interface ModalClausulaProps {
  contratoId: number
  nomeContrato: string
  initial?: ClausulaVenda
  onSave: (c: Omit<ClausulaVenda, 'id' | 'contratoId'> | ClausulaVenda) => void
  onClose: () => void
}

function ModalClausula({ contratoId, nomeContrato, initial, onSave, onClose }: ModalClausulaProps) {
  const [f, setF] = useState<ClausulaFormState>(initial ? clausulaToForm(initial) : CLAUSULA_FORM_EMPTY)
  const set = (k: keyof ClausulaFormState, v: string | boolean) => setF(prev => ({ ...prev, [k]: v }))

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.06)', color: 'rgba(243,238,226,0.90)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
    padding: '7px 10px', fontSize: 12, fontFamily: font, boxSizing: 'border-box',
  }
  const label: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'rgba(243,238,226,0.50)', marginBottom: 4, display: 'block',
  }
  const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }
  const row3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }
  const field = (lbl: string, children: React.ReactNode) => (
    <div><label style={label}>{lbl}</label>{children}</div>
  )

  function handleSave() {
    if (!f.descricao.trim()) return
    const data: Omit<ClausulaVenda, 'id' | 'contratoId'> = {
      numeroClausula: f.numeroClausula, descricao: f.descricao,
      tipoClausula: f.tipoClausula, subtipo: f.subtipo,
      gatilhoCondicao: f.gatilhoCondicao,
      valorPorEvento: f.valorPorEvento !== '' ? Number(f.valorPorEvento) : null,
      valorTexto: f.valorTexto, moeda: f.moeda,
      teto: f.teto !== '' ? Number(f.teto) : null, tetoTexto: f.tetoTexto,
      tetoGlobalCompartilhado: f.tetoGlobalCompartilhado,
      recorrente: f.recorrente, observacoes: f.observacoes,
      status: f.status,
      valorRealizado: f.valorRealizado !== '' ? Number(f.valorRealizado) : 0,
      dataRealizacao: f.dataRealizacao,
    }
    if (initial) onSave({ ...data, id: initial.id, contratoId })
    else onSave(data)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#1e1a16', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 12, padding: 28, width: 720, maxWidth: '96vw',
        maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: '#f3ede2', marginBottom: 4 }}>
          {initial ? 'Editar Cláusula' : 'Nova Cláusula'}
          <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(243,238,226,0.45)', marginLeft: 8 }}>{nomeContrato}</span>
        </div>

        <div style={row3}>
          {field('Nº Cláusula', <input style={inp} value={f.numeroClausula} onChange={e => set('numeroClausula', e.target.value)} placeholder="Ex: Cl. 2.1(a)" />)}
          {field('Tipo de Cláusula *',
            <select style={inp} value={f.tipoClausula} onChange={e => set('tipoClausula', e.target.value as TipoClausula)}>
              {TIPOS.map(t => <option key={t} value={t} style={{ background: '#1e1a16' }}>{t}</option>)}
            </select>
          )}
          {field('Subtipo / Categoria', <input style={inp} value={f.subtipo} onChange={e => set('subtipo', e.target.value)} placeholder="Ex: Performance Individual" />)}
        </div>

        {field('Descrição *', <input style={inp} value={f.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Ex: Bônus – Gols (bloco de 10)" />)}

        {field('Gatilho / Condição', <input style={inp} value={f.gatilhoCondicao} onChange={e => set('gatilhoCondicao', e.target.value)} placeholder="Ex: A cada 10 gols em jogos oficiais na equipe principal" />)}

        <div style={row3}>
          {field('Valor por Evento (numérico)',
            <input style={inp} type="number" value={f.valorPorEvento} onChange={e => set('valorPorEvento', e.target.value)} placeholder="Ex: 250000" />
          )}
          {field('Valor Descritivo', <input style={inp} value={f.valorTexto} onChange={e => set('valorTexto', e.target.value)} placeholder="Ex: 50% do net fee" />)}
          {field('Moeda',
            <select style={inp} value={f.moeda} onChange={e => set('moeda', e.target.value as MoedaContrato)}>
              {MOEDA_OPTS.map(m => <option key={m} value={m} style={{ background: '#1e1a16' }}>{m}</option>)}
            </select>
          )}
        </div>

        <div style={row3}>
          {field('Teto (numérico)', <input style={inp} type="number" value={f.teto} onChange={e => set('teto', e.target.value)} placeholder="Ex: 5000000" />)}
          {field('Teto Descritivo', <input style={inp} value={f.tetoTexto} onChange={e => set('tetoTexto', e.target.value)} placeholder="Ex: €5M (compartilhado)" />)}
          {field('Status',
            <select style={inp} value={f.status} onChange={e => set('status', e.target.value as StatusClausula)}>
              {STATUS_CYCLE.map(s => <option key={s} value={s} style={{ background: '#1e1a16' }}>{s}</option>)}
            </select>
          )}
        </div>

        <div style={row3}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
            <input type="checkbox" id="teto-comp" checked={f.tetoGlobalCompartilhado} onChange={e => set('tetoGlobalCompartilhado', e.target.checked)} />
            <label htmlFor="teto-comp" style={{ ...label, marginBottom: 0, cursor: 'pointer' }}>Teto Global Compartilhado</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
            <input type="checkbox" id="recorrente" checked={f.recorrente} onChange={e => set('recorrente', e.target.checked)} />
            <label htmlFor="recorrente" style={{ ...label, marginBottom: 0, cursor: 'pointer' }}>Recorrente</label>
          </div>
        </div>

        <div style={row2}>
          {field('Valor Realizado', <input style={inp} type="number" value={f.valorRealizado} onChange={e => set('valorRealizado', e.target.value)} placeholder="0" />)}
          {field('Data de Realização', <input style={inp} type="date" value={f.dataRealizacao} onChange={e => set('dataRealizacao', e.target.value)} />)}
        </div>

        {field('Observações', <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={f.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Notas, alertas, contexto legal..." />)}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(243,238,226,0.60)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSave} disabled={!f.descricao.trim()} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: f.descricao.trim() ? '#be8c4a' : '#555', color: '#fff', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: f.descricao.trim() ? 'pointer' : 'not-allowed' }}>
            {initial ? 'Salvar Alterações' : 'Adicionar Cláusula'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Contract Form ────────────────────────────────────────────────────────────

interface ContratoFormState {
  nomeAtleta: string
  nomeContrato: string
  clubeDestino: string
  dataContrato: string
  tipoTransferencia: TipoTransferencia
  moedaPrincipal: MoedaContrato
  totalFixoGarantido: string
  observacoes: string
}

const CONTRATO_FORM_EMPTY: ContratoFormState = {
  nomeAtleta: '', nomeContrato: '', clubeDestino: '',
  dataContrato: '', tipoTransferencia: 'Permanent Transfer',
  moedaPrincipal: 'EUR', totalFixoGarantido: '', observacoes: '',
}

interface ModalContratoProps {
  onSave: (c: Omit<ContratoVenda, 'id' | 'ativo'>) => void
  onClose: () => void
}

function ModalContrato({ onSave, onClose }: ModalContratoProps) {
  const [f, setF] = useState<ContratoFormState>(CONTRATO_FORM_EMPTY)
  const set = (k: keyof ContratoFormState, v: string) => setF(prev => ({ ...prev, [k]: v }))

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.06)', color: 'rgba(243,238,226,0.90)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
    padding: '7px 10px', fontSize: 12, fontFamily: font, boxSizing: 'border-box',
  }
  const label: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'rgba(243,238,226,0.50)', marginBottom: 4, display: 'block',
  }
  const field = (lbl: string, children: React.ReactNode) => (
    <div><label style={label}>{lbl}</label>{children}</div>
  )

  const canSave = f.nomeAtleta.trim() && f.nomeContrato.trim()

  function handleSave() {
    if (!canSave) return
    onSave({
      nomeAtleta: f.nomeAtleta.trim(),
      nomeContrato: f.nomeContrato.trim(),
      clubeDestino: f.clubeDestino.trim(),
      dataContrato: f.dataContrato,
      tipoTransferencia: f.tipoTransferencia,
      moedaPrincipal: f.moedaPrincipal,
      totalFixoGarantido: f.totalFixoGarantido !== '' ? Number(f.totalFixoGarantido) : 0,
      observacoes: f.observacoes,
    })
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#1e1a16', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 12, padding: 28, width: 600, maxWidth: '96vw',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: '#f3ede2' }}>Novo Contrato de Venda</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {field('Nome do Atleta *', <input style={inp} value={f.nomeAtleta} onChange={e => set('nomeAtleta', e.target.value)} placeholder="Ex: Almada" />)}
          {field('Clube de Destino', <input style={inp} value={f.clubeDestino} onChange={e => set('clubeDestino', e.target.value)} placeholder="Ex: Atlético de Madrid" />)}
        </div>

        {field('Nome do Contrato *', <input style={inp} value={f.nomeContrato} onChange={e => set('nomeContrato', e.target.value)} placeholder="Ex: Almada → Atlético de Madrid" />)}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {field('Data do Contrato', <input style={inp} type="date" value={f.dataContrato} onChange={e => set('dataContrato', e.target.value)} />)}
          {field('Tipo de Transferência',
            <select style={inp} value={f.tipoTransferencia} onChange={e => set('tipoTransferencia', e.target.value as TipoTransferencia)}>
              {TRANSFERENCIA_OPTS.map(t => <option key={t} value={t} style={{ background: '#1e1a16' }}>{t}</option>)}
            </select>
          )}
          {field('Moeda Principal',
            <select style={inp} value={f.moedaPrincipal} onChange={e => set('moedaPrincipal', e.target.value as MoedaContrato)}>
              {MOEDA_OPTS.map(m => <option key={m} value={m} style={{ background: '#1e1a16' }}>{m}</option>)}
            </select>
          )}
        </div>

        {field('Total Fixo Garantido',
          <input style={inp} type="number" value={f.totalFixoGarantido} onChange={e => set('totalFixoGarantido', e.target.value)} placeholder="Ex: 21750000" />
        )}

        {field('Observações / Alertas',
          <textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={f.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Contexto geral do contrato, alertas de trade-offs, etc." />
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(243,238,226,0.60)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSave} disabled={!canSave} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: canSave ? '#be8c4a' : '#555', color: '#fff', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed' }}>
            Criar Contrato
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DrawerClausula({ clausula, contrato, onClose, onEdit }: {
  clausula: ClausulaVenda
  contrato: ContratoVenda
  onClose: () => void
  onEdit: () => void
}) {
  const c = clausula
  const sym = MOEDA_SYM[c.moeda]
  const row = (label: string, value: React.ReactNode) => value ? (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.40)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'rgba(243,238,226,0.85)', fontFamily: font }}>{value}</div>
    </div>
  ) : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.60)', display: 'flex', justifyContent: 'flex-end', zIndex: 999 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: 420, maxWidth: '96vw', background: '#1a1410', height: '100%', overflowY: 'auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 0, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(190,140,74,0.80)', marginBottom: 4 }}>{contrato.nomeContrato}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f3ede2', fontFamily: font }}>{c.descricao}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(243,238,226,0.40)', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {c.numeroClausula && (
            <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'rgba(243,238,226,0.60)', fontSize: 10, fontFamily: fontMono }}>
              {c.numeroClausula}
            </span>
          )}
          <TipoBadge tipo={c.tipoClausula} />
          <StatusBadge status={c.status} />
          {c.recorrente && <span style={{ padding: '2px 7px', borderRadius: 4, background: 'rgba(6,182,212,0.10)', color: '#22d3ee', fontSize: 9, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Recorrente</span>}
          {c.tetoGlobalCompartilhado && <span style={{ padding: '2px 7px', borderRadius: 4, background: 'rgba(249,115,22,0.10)', color: '#fb923c', fontSize: 9, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Teto Compartilhado</span>}
        </div>

        {row('Gatilho / Condição', c.gatilhoCondicao)}
        {row('Valor por Evento', fmtValor(c.valorPorEvento, c.valorTexto, c.moeda))}
        {row('Teto', c.teto !== null ? `${sym} ${c.teto.toLocaleString('pt-BR')}` : c.tetoTexto || null)}
        {c.teto !== null && c.tetoTexto && row('Desc. do Teto', c.tetoTexto)}
        {c.subtipo && row('Subtipo', c.subtipo)}
        {c.valorRealizado > 0 && row('Valor Realizado', `${sym} ${c.valorRealizado.toLocaleString('pt-BR')}${c.dataRealizacao ? ' — ' + fmtDate(c.dataRealizacao) : ''}`)}
        {c.observacoes && row('Observações', c.observacoes)}

        <button onClick={onEdit} style={{ marginTop: 'auto', padding: '10px 0', borderRadius: 8, border: '1px solid rgba(190,140,74,0.35)', background: 'rgba(190,140,74,0.10)', color: '#be8c4a', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
          Editar Cláusula
        </button>
      </div>
    </div>
  )
}

// ─── Clause Row ───────────────────────────────────────────────────────────────

function ClausulaRow({
  c, onStatusCycle, onClick,
}: { c: ClausulaVenda; onStatusCycle: () => void; onClick: () => void }) {
  const td: React.CSSProperties = {
    padding: '7px 10px', fontSize: 11, color: 'rgba(243,238,226,0.80)', fontFamily: font,
    whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.04)',
  }
  const hasAlert = c.observacoes.includes('⚠️')
  return (
    <tr style={{ cursor: 'pointer' }} onClick={onClick}
      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)'}
      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
      <td style={{ ...td, color: 'rgba(243,238,226,0.40)', fontFamily: fontMono, fontSize: 10 }}>{c.numeroClausula || '—'}</td>
      <td style={{ ...td, fontWeight: 500, maxWidth: 260 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {hasAlert && <span title="Ver observações" style={{ color: '#fb923c', fontSize: 11 }}>⚠️</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descricao}</span>
        </div>
      </td>
      <td style={td}><TipoBadge tipo={c.tipoClausula} /></td>
      <td style={{ ...td, color: 'rgba(243,238,226,0.50)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.gatilhoCondicao || '—'}</td>
      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, color: '#be8c4a' }}>
        {fmtValor(c.valorPorEvento, c.valorTexto, c.moeda)}
      </td>
      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, color: 'rgba(243,238,226,0.45)' }}>
        {c.teto !== null ? fmtValor(c.teto, '', c.moeda) : c.tetoTexto || '—'}
      </td>
      <td style={td} onClick={e => { e.stopPropagation(); onStatusCycle() }}>
        <StatusBadge status={c.status} onClick={onStatusCycle} />
      </td>
      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, color: c.valorRealizado > 0 ? '#4ade80' : 'rgba(243,238,226,0.25)' }}>
        {c.valorRealizado > 0 ? fmtValor(c.valorRealizado, '', c.moeda) : '—'}
      </td>
    </tr>
  )
}

// ─── Contract Card (Por Contrato view) ───────────────────────────────────────

function ContratoCard({
  contrato, clausulas, onAddClausula, onStatusCycle, onClausulaClick,
}: {
  contrato: ContratoVenda
  clausulas: ClausulaVenda[]
  onAddClausula: () => void
  onStatusCycle: (id: number) => void
  onClausulaClick: (c: ClausulaVenda) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const sym = MOEDA_SYM[contrato.moedaPrincipal]
  const totalFixo = contrato.totalFixoGarantido
  const variaveis = clausulas.filter(c => ['Variable','Contingent'].includes(c.tipoClausula))
  const tetoVar = variaveis.reduce((s, c) => {
    if (c.teto !== null && !c.tetoGlobalCompartilhado) return s + c.teto
    return s
  }, 0)
  const globalCap = variaveis.find(c => c.tetoGlobalCompartilhado)?.teto ?? 0
  const nAtivas = clausulas.filter(c => c.status === 'Ativa').length
  const nGarantidas = clausulas.filter(c => c.status === 'Garantida').length
  const hasAlert = clausulas.some(c => c.observacoes.includes('⚠️'))

  const thC: React.CSSProperties = {
    padding: '7px 10px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
    color: 'rgba(243,238,226,0.40)', background: 'rgba(0,0,0,0.20)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontFamily: fontMono, letterSpacing: '0.12em', whiteSpace: 'nowrap',
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10, overflow: 'hidden', marginBottom: 14,
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', cursor: 'pointer',
          background: expanded ? 'rgba(190,140,74,0.05)' : 'transparent',
          borderBottom: expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}
        onClick={() => setExpanded(x => !x)}
      >
        <span style={{ color: '#be8c4a', fontSize: 13, width: 16, textAlign: 'center', flexShrink: 0 }}>
          {expanded ? '▾' : '▸'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {hasAlert && <span style={{ color: '#fb923c', fontSize: 12 }}>⚠️</span>}
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f3ede2', fontFamily: font }}>{contrato.nomeContrato}</span>
            <span style={{ fontSize: 10, color: 'rgba(243,238,226,0.40)', fontFamily: fontMono }}>{fmtDate(contrato.dataContrato)}</span>
            <span style={{ padding: '1px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: 'rgba(243,238,226,0.50)', fontSize: 9, fontFamily: fontMono, textTransform: 'uppercase' }}>{contrato.tipoTransferencia}</span>
          </div>
          {contrato.observacoes && (
            <div style={{ fontSize: 11, color: 'rgba(243,238,226,0.40)', fontFamily: font, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 600 }}>
              {contrato.observacoes}
            </div>
          )}
        </div>
        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
          {[
            { label: 'Total Fixo', val: totalFixo > 0 ? `${sym}${(totalFixo/1e6).toFixed(2)}M` : '—', highlight: true },
            globalCap > 0 ? { label: 'Var. Cap', val: `${sym}${(globalCap/1e6).toFixed(0)}M` } : null,
            tetoVar > 0 ? { label: 'Teto Var.', val: `${sym}${(tetoVar/1e6).toFixed(0)}M` } : null,
            { label: 'Cláusulas', val: String(clausulas.length) },
            { label: 'Ativas', val: String(nAtivas) },
            { label: 'Garantidas', val: String(nGarantidas), green: true },
          ].filter(Boolean).map((s, i) => s && (
            <div key={i} style={{
              paddingLeft: 16, paddingRight: 4,
              borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
            }}>
              <div style={{ fontSize: 8, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.35)', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: font, color: s.highlight ? '#be8c4a' : s.green ? '#4ade80' : 'rgba(243,238,226,0.70)' }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Clauses table */}
      {expanded && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', tableLayout: 'auto', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thC, minWidth: 80 }}>Nº</th>
                <th style={{ ...thC, minWidth: 200, textAlign: 'left' }}>Descrição</th>
                <th style={thC}>Tipo</th>
                <th style={{ ...thC, minWidth: 200, textAlign: 'left' }}>Gatilho / Condição</th>
                <th style={{ ...thC, textAlign: 'right', minWidth: 100 }}>Valor/Evento</th>
                <th style={{ ...thC, textAlign: 'right', minWidth: 80 }}>Teto</th>
                <th style={thC}>Status</th>
                <th style={{ ...thC, textAlign: 'right', minWidth: 90 }}>Realizado</th>
              </tr>
            </thead>
            <tbody>
              {clausulas.map(c => (
                <ClausulaRow
                  key={c.id}
                  c={c}
                  onStatusCycle={() => onStatusCycle(c.id)}
                  onClick={() => onClausulaClick(c)}
                />
              ))}
            </tbody>
          </table>
          <div style={{ padding: '8px 18px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button
              onClick={e => { e.stopPropagation(); onAddClausula() }}
              style={{
                background: 'none', border: '1px dashed rgba(190,140,74,0.35)',
                color: 'rgba(190,140,74,0.70)', borderRadius: 6,
                padding: '5px 14px', fontSize: 11, fontFamily: font, cursor: 'pointer',
              }}
            >
              + Adicionar Cláusula
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PageClausulas() {
  const [contratos, setContratos] = useState<ContratoVenda[]>(CONTRATOS_MOCK)
  const [clausulas, setClausulas] = useState<ClausulaVenda[]>(CLAUSULAS_MOCK)
  const [nextContratoId, setNextContratoId] = useState(CONTRATOS_MOCK.length + 1)
  const [nextClausulaId, setNextClausulaId] = useState(CLAUSULAS_MOCK.length + 1)

  // UI state
  const [viewMode, setViewMode] = useState<'contrato' | 'tabela'>('contrato')
  const [filtroAtleta, setFiltroAtleta] = useState('Todos')
  const [filtroTipo, setFiltroTipo] = useState<TipoClausula | 'Todos'>('Todos')
  const [filtroStatus, setFiltroStatus] = useState<StatusClausula | 'Todos'>('Todos')
  const [busca, setBusca] = useState('')

  // Modal state
  const [showModalContrato, setShowModalContrato] = useState(false)
  const [addClausulaForContrato, setAddClausulaForContrato] = useState<number | null>(null)
  const [editClausula, setEditClausula] = useState<ClausulaVenda | null>(null)
  const [drawerClausula, setDrawerClausula] = useState<ClausulaVenda | null>(null)

  // Derived
  const atletasUnicos = useMemo(() => {
    const nomes = [...new Set(contratos.map(c => c.nomeAtleta))].sort()
    return ['Todos', ...nomes]
  }, [contratos])

  const clausulasFiltradas = useMemo(() => {
    const contratoIds = filtroAtleta === 'Todos'
      ? null
      : new Set(contratos.filter(c => c.nomeAtleta === filtroAtleta).map(c => c.id))

    return clausulas.filter(c => {
      if (contratoIds && !contratoIds.has(c.contratoId)) return false
      if (filtroTipo !== 'Todos' && c.tipoClausula !== filtroTipo) return false
      if (filtroStatus !== 'Todos' && c.status !== filtroStatus) return false
      if (busca) {
        const q = busca.toLowerCase()
        if (!c.descricao.toLowerCase().includes(q) && !c.numeroClausula.toLowerCase().includes(q) && !c.gatilhoCondicao.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [clausulas, contratos, filtroAtleta, filtroTipo, filtroStatus, busca])

  const contratosFiltrados = useMemo(() => {
    if (filtroAtleta === 'Todos') return contratos
    return contratos.filter(c => c.nomeAtleta === filtroAtleta)
  }, [contratos, filtroAtleta])

  // KPIs
  const kpis = useMemo(() => {
    const totalFixoEUR = contratos.filter(c => c.moedaPrincipal === 'EUR').reduce((s, c) => s + c.totalFixoGarantido, 0)
    const totalFixoUSD = contratos.filter(c => c.moedaPrincipal === 'USD').reduce((s, c) => s + c.totalFixoGarantido, 0)
    const nSellOn = clausulas.filter(c => c.tipoClausula === 'Sell-On').length
    const nOpcoes = clausulas.filter(c => c.tipoClausula === 'Opção').length
    const nAtencao = clausulas.filter(c => c.observacoes.includes('⚠️')).length
    const totalRealizado = clausulas.reduce((s, c) => s + c.valorRealizado, 0)
    return { totalFixoEUR, totalFixoUSD, nSellOn, nOpcoes, nAtencao, totalRealizado }
  }, [contratos, clausulas])

  // Mutations
  function cycleStatus(id: number) {
    setClausulas(prev => prev.map(c => {
      if (c.id !== id) return c
      const idx = STATUS_CYCLE.indexOf(c.status)
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
      return { ...c, status: next }
    }))
  }

  function addContrato(data: Omit<ContratoVenda, 'id' | 'ativo'>) {
    setContratos(prev => [...prev, { ...data, id: nextContratoId, ativo: true }])
    setNextContratoId(n => n + 1)
  }

  function addClausula(data: Omit<ClausulaVenda, 'id' | 'contratoId'>, contratoId: number) {
    setClausulas(prev => [...prev, { ...data, id: nextClausulaId, contratoId }])
    setNextClausulaId(n => n + 1)
  }

  function saveClausula(data: ClausulaVenda) {
    setClausulas(prev => prev.map(c => c.id === data.id ? data : c))
  }

  // Styles
  const th: React.CSSProperties = {
    padding: '8px 10px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
    color: 'rgba(243,238,226,0.40)', background: 'rgba(0,0,0,0.15)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontFamily: fontMono, letterSpacing: '0.12em', whiteSpace: 'nowrap',
    position: 'sticky', top: 0, zIndex: 1,
  }

  function KpiStrip() {
    const items = [
      { label: 'Total Fixo (EUR)', val: `€${(kpis.totalFixoEUR/1e6).toFixed(2)}M`, gold: true },
      { label: 'Total Fixo (USD)', val: `$${(kpis.totalFixoUSD/1e6).toFixed(2)}M`, gold: true },
      { label: 'Contratos', val: String(contratos.length) },
      { label: 'Cláusulas', val: String(clausulas.length) },
      { label: 'Sell-On', val: String(kpis.nSellOn) },
      { label: 'Opções', val: String(kpis.nOpcoes) },
      { label: '⚠️ Alertas', val: String(kpis.nAtencao), warn: kpis.nAtencao > 0 },
    ]
    return (
      <div style={{
        background: 'var(--ink-primary, #1a1410)', borderRadius: 10, marginBottom: 14,
        display: 'flex', alignItems: 'center', padding: '10px 20px', gap: 0, flexWrap: 'wrap',
      }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '0 20px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.10)' : 'none',
          }}>
            <div style={{ fontSize: 8, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: font, color: item.gold ? '#be8c4a' : item.warn ? '#fb923c' : '#fff' }}>{item.val}</div>
          </div>
        ))}
      </div>
    )
  }

  const drawerContrato = drawerClausula ? contratos.find(c => c.id === drawerClausula.contratoId) : null

  const addClausulaContrato = addClausulaForContrato !== null
    ? contratos.find(c => c.id === addClausulaForContrato) : null

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>
      <PageHero title="Cláusulas de Venda" subtitle="RECEITAS CONDICIONAIS DE CONTRATOS DE TRANSFERÊNCIA" />

      <KpiStrip />

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {/* View toggle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 7, padding: 3, gap: 2 }}>
          {(['contrato', 'tabela'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '6px 14px', borderRadius: 5, border: 'none',
                background: viewMode === mode ? 'rgba(190,140,74,0.25)' : 'transparent',
                color: viewMode === mode ? '#be8c4a' : 'rgba(243,238,226,0.50)',
                fontFamily: font, fontSize: 12, fontWeight: viewMode === mode ? 600 : 400, cursor: 'pointer',
              }}
            >
              {mode === 'contrato' ? 'Por Contrato' : 'Tabela Geral'}
            </button>
          ))}
        </div>

        {/* Filters */}
        {[
          { label: 'Atleta', value: filtroAtleta, onChange: setFiltroAtleta, opts: atletasUnicos },
          { label: 'Tipo', value: filtroTipo, onChange: (v: string) => setFiltroTipo(v as TipoClausula | 'Todos'), opts: ['Todos', ...TIPOS] },
          { label: 'Status', value: filtroStatus, onChange: (v: string) => setFiltroStatus(v as StatusClausula | 'Todos'), opts: ['Todos', ...STATUS_CYCLE] },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 8, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.35)' }}>{f.label}</div>
            <select value={f.value} onChange={e => f.onChange(e.target.value)}
              style={{ background: '#222', color: '#f3ede2', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: font }}>
              {f.opts.map(o => <option key={o} value={o} style={{ background: '#222' }}>{o}</option>)}
            </select>
          </div>
        ))}

        {/* Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 8, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.35)' }}>Busca</div>
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Descrição, nº cláusula, condição..."
            style={{ background: '#222', color: '#f3ede2', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontFamily: font }}
          />
        </div>

        <button
          onClick={() => setShowModalContrato(true)}
          style={{
            marginLeft: 'auto', padding: '8px 18px', borderRadius: 8,
            border: 'none', background: '#be8c4a', color: '#1a1410',
            fontFamily: font, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          + Novo Contrato
        </button>
      </div>

      {/* Content */}
      {viewMode === 'contrato' ? (
        <div>
          {contratosFiltrados.map(contrato => {
            const clausulasDoContrato = clausulasFiltradas.filter(c => c.contratoId === contrato.id)
            const allClausulas = clausulas.filter(c => c.contratoId === contrato.id)
            return (
              <ContratoCard
                key={contrato.id}
                contrato={contrato}
                clausulas={busca || filtroTipo !== 'Todos' || filtroStatus !== 'Todos' ? clausulasDoContrato : allClausulas}
                onAddClausula={() => setAddClausulaForContrato(contrato.id)}
                onStatusCycle={cycleStatus}
                onClausulaClick={c => setDrawerClausula(c)}
              />
            )
          })}
          {contratosFiltrados.length === 0 && (
            <div style={{ textAlign: 'center', color: 'rgba(243,238,226,0.30)', fontFamily: font, padding: 60, fontSize: 13 }}>
              Nenhum contrato encontrado com os filtros selecionados.
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 700, fontSize: 13, color: 'rgba(243,238,226,0.85)', fontFamily: font, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Tabela Geral de Cláusulas</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(243,238,226,0.40)', fontFamily: fontMono }}>{clausulasFiltradas.length} registros</span>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', tableLayout: 'auto', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Contrato</th>
                  <th style={{ ...th, minWidth: 80 }}>Nº</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 220 }}>Descrição</th>
                  <th style={th}>Tipo</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 200 }}>Gatilho / Condição</th>
                  <th style={{ ...th, textAlign: 'right', minWidth: 110 }}>Valor/Evento</th>
                  <th style={{ ...th, textAlign: 'right', minWidth: 90 }}>Teto</th>
                  <th style={{ ...th, minWidth: 50 }}>Moeda</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: 'right', minWidth: 90 }}>Realizado</th>
                </tr>
              </thead>
              <tbody>
                {clausulasFiltradas.map(c => {
                  const contrato = contratos.find(ct => ct.id === c.contratoId)
                  const td: React.CSSProperties = {
                    padding: '7px 10px', fontSize: 11, color: 'rgba(243,238,226,0.80)', fontFamily: font,
                    whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }}
                      onClick={() => setDrawerClausula(c)}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                      <td style={{ ...td, color: 'rgba(243,238,226,0.50)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{contrato?.nomeContrato ?? '—'}</td>
                      <td style={{ ...td, color: 'rgba(243,238,226,0.40)', fontFamily: fontMono, fontSize: 10 }}>{c.numeroClausula || '—'}</td>
                      <td style={{ ...td, fontWeight: 500, maxWidth: 240 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {c.observacoes.includes('⚠️') && <span style={{ color: '#fb923c' }}>⚠️</span>}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.descricao}</span>
                        </div>
                      </td>
                      <td style={td}><TipoBadge tipo={c.tipoClausula} /></td>
                      <td style={{ ...td, color: 'rgba(243,238,226,0.45)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.gatilhoCondicao || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, color: '#be8c4a' }}>{fmtValor(c.valorPorEvento, c.valorTexto, c.moeda)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, color: 'rgba(243,238,226,0.45)' }}>{c.teto !== null ? fmtValor(c.teto, '', c.moeda) : c.tetoTexto || '—'}</td>
                      <td style={{ ...td, fontFamily: fontMono, color: 'rgba(243,238,226,0.45)', fontSize: 10 }}>{c.moeda}</td>
                      <td style={td} onClick={e => { e.stopPropagation(); cycleStatus(c.id) }}>
                        <StatusBadge status={c.status} onClick={() => cycleStatus(c.id)} />
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, color: c.valorRealizado > 0 ? '#4ade80' : 'rgba(243,238,226,0.25)' }}>
                        {c.valorRealizado > 0 ? fmtValor(c.valorRealizado, '', c.moeda) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {clausulasFiltradas.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'rgba(243,238,226,0.30)', fontFamily: font, fontSize: 13 }}>Nenhuma cláusula encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showModalContrato && (
        <ModalContrato onSave={addContrato} onClose={() => setShowModalContrato(false)} />
      )}

      {addClausulaForContrato !== null && addClausulaContrato && (
        <ModalClausula
          contratoId={addClausulaForContrato}
          nomeContrato={addClausulaContrato.nomeContrato}
          onSave={data => {
            if ('id' in data) saveClausula(data as ClausulaVenda)
            else addClausula(data, addClausulaForContrato)
          }}
          onClose={() => setAddClausulaForContrato(null)}
        />
      )}

      {editClausula && (
        <ModalClausula
          contratoId={editClausula.contratoId}
          nomeContrato={contratos.find(c => c.id === editClausula.contratoId)?.nomeContrato ?? ''}
          initial={editClausula}
          onSave={data => {
            if ('id' in data) saveClausula(data as ClausulaVenda)
          }}
          onClose={() => setEditClausula(null)}
        />
      )}

      {drawerClausula && drawerContrato && (
        <DrawerClausula
          clausula={drawerClausula}
          contrato={drawerContrato}
          onClose={() => setDrawerClausula(null)}
          onEdit={() => {
            setEditClausula(drawerClausula)
            setDrawerClausula(null)
          }}
        />
      )}
    </div>
  )
}
