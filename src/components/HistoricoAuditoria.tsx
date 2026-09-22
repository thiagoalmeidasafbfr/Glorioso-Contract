// src/components/HistoricoAuditoria.tsx
// Trilha de auditoria (migration 021, view vw_ac_auditoria_resumo): quem, quando,
// o quê — com o diff campo a campo (antes → depois).
// A view só retorna linhas para master/controladoria/diretoria; em modo local
// não há trilha.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { USE_SUPABASE } from '../lib/supabase'
import { fetchAuditoria, diffAuditoria, TABELA_LABELS, type FiltroAuditoria } from '../lib/governanca'
import { roleLabel } from '../lib/permissoes'
import type { AuditoriaRow } from '../types/governanca'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'

const OP_STYLE: Record<string, { label: string; className: string }> = {
  INSERT: { label: 'Criou', className: 'chip chip-pos' },
  UPDATE: { label: 'Alterou', className: 'chip chip-gold' },
  DELETE: { label: 'Excluiu', className: 'chip chip-neg' },
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅'
  if (typeof v === 'object') {
    const s = JSON.stringify(v)
    return s.length > 120 ? s.slice(0, 117) + '…' : s
  }
  const s = String(v)
  return s.length > 120 ? s.slice(0, 117) + '…' : s
}

export function AuditoriaLista({ rows, showAtleta, atletaNome }: {
  rows: AuditoriaRow[]; showAtleta?: boolean; atletaNome?: (id: string) => string | undefined
}) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setOpen(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  if (rows.length === 0) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font, fontSize: 13 }}>Nenhum registro de auditoria encontrado.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map(r => {
        const op = OP_STYLE[r.operacao] ?? { label: r.operacao, className: 'chip chip-neutral' }
        const diff = diffAuditoria(r)
        // UPDATE curto já nasce aberto; o clique inverte o padrão.
        const isOpen = open.has(r.id) !== (r.operacao === 'UPDATE' && diff.length <= 4)
        const who = r.usuario_nome || r.usuario_email || (r.usuario_id ? `usuário ${r.usuario_id.slice(0, 8)}` : 'sistema (cron/serviço)')
        return (
          <div key={r.id} style={{ borderTop: '1px solid var(--divider-soft)', padding: '10px 4px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontFamily: font, fontSize: 13 }}>
              <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--text-muted)', minWidth: 118 }}>
                {new Date(r.ocorrido_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <span className={op.className}>{op.label}</span>
              <span style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>{TABELA_LABELS[r.tabela] ?? r.tabela}</span>
              {showAtleta && r.atleta_id && (
                <Link to={`/atletas/${r.atleta_id}`} style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>
                  {atletaNome?.(r.atleta_id) ?? 'atleta'}
                </Link>
              )}
              <span style={{ color: 'var(--text-secondary)' }}>por <strong>{who}</strong>{r.usuario_papel ? ` (${roleLabel(r.usuario_papel)})` : ''}</span>
              {r.operacao === 'UPDATE' && r.campos_alterados?.length ? (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.campos_alterados.join(', ')}</span>
              ) : null}
              {diff.length > 0 && (
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => toggle(r.id)} aria-expanded={isOpen}>
                  {isOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                </button>
              )}
            </div>
            {isOpen && diff.length > 0 && (
              <table style={{ marginTop: 8, fontSize: 12 }}>
                <thead><tr><th style={{ textAlign: 'left' }}>Campo</th>{r.operacao !== 'INSERT' && <th style={{ textAlign: 'left' }}>Antes</th>}{r.operacao !== 'DELETE' && <th style={{ textAlign: 'left' }}>Depois</th>}</tr></thead>
                <tbody>
                  {diff.map(d => (
                    <tr key={d.campo}>
                      <td style={{ fontFamily: mono, fontSize: 11, padding: '4px 8px' }}>{d.campo}</td>
                      {r.operacao !== 'INSERT' && <td style={{ padding: '4px 8px', color: 'var(--neg)', wordBreak: 'break-word' }}>{fmtVal(d.antes)}</td>}
                      {r.operacao !== 'DELETE' && <td style={{ padding: '4px 8px', color: 'var(--pos)', wordBreak: 'break-word' }}>{fmtVal(d.depois)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Histórico de um atleta (atletaId) ou de um registro (tabela + registroId). */
export default function HistoricoAuditoria(props: { atletaId?: string; tabela?: string; registroId?: string; limit?: number }) {
  const { atletaId, tabela, registroId, limit } = props
  const [rows, setRows] = useState<AuditoriaRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!USE_SUPABASE) return
    let alive = true
    const f: FiltroAuditoria = { atletaId, tabela, registroId, limit: limit ?? 200 }
    fetchAuditoria(f)
      .then(r => { if (alive) { setRows(r); setErr(null) } })
      .catch(e => { if (alive) setErr(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [atletaId, tabela, registroId, limit])

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
        Histórico de alterações
      </div>
      {!USE_SUPABASE ? (
        <div style={{ fontFamily: font, fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
          Trilha de auditoria disponível apenas com Supabase (modo local não registra autoria).
        </div>
      ) : err ? (
        <div role="alert" style={{ color: 'var(--neg)', fontFamily: font, fontSize: 13 }}>Não foi possível carregar o histórico: {err}</div>
      ) : rows === null ? (
        <div role="status" style={{ color: 'var(--text-muted)', fontFamily: font, fontSize: 13 }}>Carregando…</div>
      ) : (
        <AuditoriaLista rows={rows} />
      )}
    </div>
  )
}
