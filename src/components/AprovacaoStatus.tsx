// src/components/AprovacaoStatus.tsx
// Chip de status de aprovação (022) + ações conforme o papel:
//   Jurídico/Master      → "Enviar para revisão"
//   Controladoria/Master → "Aprovar" / "Rejeitar" (com motivo)
// O banco valida transição e papel; aqui só escondemos o que não se aplica.

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from './toast-context'
import { ModalShell } from './modals/EditModals'
import {
  enviarParaRevisao, aprovarRegistro, rejeitarRegistro, statusAprovacao, mensagemErro,
  type TabelaAprovacao,
} from '../lib/governanca'
import { STATUS_APROVACAO_LABELS, type StatusAprovacao } from '../types/governanca'

const CHIP: Record<StatusAprovacao, React.CSSProperties> = {
  RASCUNHO:   { background: 'var(--bg-subtle)', color: 'var(--ink-secondary)', border: '1px dashed var(--divider-strong)' },
  EM_REVISAO: { background: 'var(--warn-tint)', color: 'var(--warn)' },
  APROVADO:   { background: 'var(--pos-tint)', color: 'var(--pos)' },
  REJEITADO:  { background: 'var(--neg-tint)', color: 'var(--neg)' },
}

export function AprovacaoChip({ status, motivo, hideAprovado }: {
  status: StatusAprovacao; motivo?: string | null; hideAprovado?: boolean
}) {
  if (hideAprovado && status === 'APROVADO') return null
  return (
    <span className="chip" style={CHIP[status]}
      title={status === 'REJEITADO' && motivo ? `Rejeitado: ${motivo}` : `Status de aprovação: ${STATUS_APROVACAO_LABELS[status]}`}>
      {STATUS_APROVACAO_LABELS[status]}{status === 'REJEITADO' && motivo ? ` — ${motivo}` : ''}
    </span>
  )
}

export function RejeitarModal({ titulo, onClose, onConfirm }: {
  titulo: string; onClose: () => void; onConfirm: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function go() {
    if (!motivo.trim()) { setErr('Informe o motivo.'); return }
    setSaving(true); setErr(null)
    try { await onConfirm(motivo.trim()) } catch (e) { setErr(mensagemErro(e)); setSaving(false) }
  }
  return (
    <ModalShell title="Rejeitar" subtitle={titulo} width={460} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-danger" onClick={go} disabled={saving || !motivo.trim()}>{saving ? 'Rejeitando…' : 'Rejeitar'}</button>
      </>}>
      <label htmlFor="motivo-rejeicao" style={{ fontFamily: 'var(--font-label)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        Motivo da rejeição (obrigatório)
      </label>
      <textarea id="motivo-rejeicao" autoFocus rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
        aria-invalid={!!err}
        placeholder="Ex.: valor diverge do contrato assinado"
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--input-border)', fontFamily: 'var(--font-body)', fontSize: 13, resize: 'vertical' }} />
      {err && <div role="alert" style={{ color: 'var(--neg)', fontSize: 12, fontFamily: 'var(--font-body)' }}>{err}</div>}
    </ModalShell>
  )
}

/** Chip + botões de workflow para um contrato ou cláusula. */
export default function AprovacaoStatus({ tabela, row, titulo, onChanged, hideAprovado = true }: {
  tabela: TabelaAprovacao
  row: { id: string; status_aprovacao?: StatusAprovacao | null; motivo_rejeicao?: string | null; aprovado_em?: string | null }
  titulo: string
  onChanged: () => void
  /** Esconde o chip "Aprovado" de registros que nunca passaram pelo fluxo
   *  (default do banco = APROVADO, sem aprovado_em) — evita ruído visual. */
  hideAprovado?: boolean
}) {
  const { can } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const status = statusAprovacao(row)
  const podeEnviar = can('enviarRevisao') && (status === 'RASCUNHO' || status === 'REJEITADO')
  const podeAprovar = can('aprovar') && (status === 'RASCUNHO' || status === 'EM_REVISAO')

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn(); onChanged() } catch (e) { toast.error('Não foi possível atualizar a aprovação.', { detail: mensagemErro(e) }) } finally { setBusy(false) }
  }

  if (hideAprovado && status === 'APROVADO' && !row.aprovado_em) return null
  const btn: React.CSSProperties = { padding: '3px 10px', fontSize: 11 }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <AprovacaoChip status={status} motivo={row.motivo_rejeicao} />
      {podeEnviar && (
        <button className="btn btn-outline btn-sm" style={btn} disabled={busy}
          onClick={() => run(() => enviarParaRevisao(tabela, row.id))}>Enviar para revisão</button>
      )}
      {podeAprovar && (
        <>
          <button className="btn btn-primary btn-sm" style={btn} disabled={busy}
            onClick={() => run(() => aprovarRegistro(tabela, row.id))}>Aprovar</button>
          <button className="btn btn-danger btn-sm" style={btn} disabled={busy}
            onClick={() => setRejecting(true)}>Rejeitar</button>
        </>
      )}
      {rejecting && (
        <RejeitarModal titulo={titulo} onClose={() => setRejecting(false)}
          onConfirm={async motivo => { await rejeitarRegistro(tabela, row.id, motivo); setRejecting(false); onChanged() }} />
      )}
    </span>
  )
}
