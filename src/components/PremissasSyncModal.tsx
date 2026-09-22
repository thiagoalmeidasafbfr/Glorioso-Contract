// src/components/PremissasSyncModal.tsx
// Confirmação do "Puxar dos contratos" das Premissas: mostra o diff campo a
// campo (valor atual → valor do cadastro) e grava só o que ficar marcado.

import { useState } from 'react'
import { ModalShell } from './modals/EditModals'
import { SYNC_FIELD_LABELS, patchFromDiff, type SyncDiff, type SyncField } from '../lib/premissasSync'
import type { PremissaAtleta } from '../types/premissas'

const font = "var(--font-body)"
const mono = "var(--font-label)"

const fmt = (v: string | number | null) =>
  v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : v

export default function PremissasSyncModal({ diffs, onClose, onConfirm }: {
  diffs: SyncDiff[]
  onClose: () => void
  onConfirm: (patches: { id: string; patch: Partial<PremissaAtleta> }[]) => Promise<void>
}) {
  const withChanges = diffs.filter(d => d.changes.length > 0)
  const [sel, setSel] = useState<Record<string, Set<SyncField>>>(() =>
    Object.fromEntries(withChanges.map(d => [d.premissaId, new Set(d.changes.map(c => c.field))])))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const toggle = (id: string, f: SyncField) => setSel(prev => {
    const s = new Set(prev[id] ?? []); if (s.has(f)) s.delete(f); else s.add(f)
    return { ...prev, [id]: s }
  })
  const total = Object.values(sel).reduce((n, s) => n + s.size, 0)

  async function save() {
    setBusy(true); setErr(null)
    try {
      await onConfirm(withChanges
        .map(d => ({ id: d.premissaId, patch: patchFromDiff(d, sel[d.premissaId]) }))
        .filter(x => Object.keys(x.patch).length > 0))
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const th: React.CSSProperties = { padding: '6px 8px', fontSize: 9, fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--divider-soft)' }
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12, fontFamily: font, color: 'var(--ink-primary)', borderBottom: '1px solid var(--divider-soft)' }

  return (
    <ModalShell title="Puxar dos contratos" subtitle="Confira as diferenças antes de gravar" width={720} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => void save()} disabled={busy || total === 0}>{busy ? 'Gravando…' : `Aplicar ${total} alteração(ões)`}</button>
      </>}>
      {withChanges.length === 0 && <div style={{ fontSize: 13, fontFamily: font, color: 'var(--text-muted)' }}>Nada a atualizar — as premissas já batem com o cadastro.</div>}
      {diffs.filter(d => d.changes.length === 0 && d.note).map(d => (
        <div key={d.premissaId} style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>{d.atleta}: {d.note}</div>
      ))}
      {withChanges.map(d => (
        <div key={d.premissaId} style={{ border: '1px solid var(--divider-soft)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', fontSize: 13, fontWeight: 600, fontFamily: font }}>
            {d.atleta}{d.note && <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}> · {d.note}</span>}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ ...th, width: 30 }} /><th style={th}>Campo</th><th style={th}>Atual</th><th style={th}>Do cadastro</th></tr></thead>
            <tbody>
              {d.changes.map(ch => (
                <tr key={ch.field}>
                  <td style={td}><input type="checkbox" aria-label={`Aplicar ${SYNC_FIELD_LABELS[ch.field]}`} checked={sel[d.premissaId]?.has(ch.field) ?? false} onChange={() => toggle(d.premissaId, ch.field)} /></td>
                  <td style={td}>{SYNC_FIELD_LABELS[ch.field]}</td>
                  <td style={{ ...td, fontFamily: mono, color: 'var(--text-muted)' }}>{fmt(ch.before)}</td>
                  <td style={{ ...td, fontFamily: mono, fontWeight: 600 }}>{fmt(ch.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {err && <div role="alert" style={{ fontSize: 12, color: 'var(--neg)', fontFamily: font }}>{err}</div>}
    </ModalShell>
  )
}
