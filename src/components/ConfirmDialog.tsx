// src/components/ConfirmDialog.tsx
// Diálogo de confirmação próprio (substitui window.confirm): role="alertdialog",
// foco inicial em Cancelar (a opção segura), Esc cancela, variante "danger".

import { useCallback, useId, useRef, useState } from 'react'
import { ConfirmContext, type ConfirmOptions } from './confirm-context'
import { useDialogA11y } from './useDialogA11y'

interface Pending extends ConfirmOptions { id: number; resolve: (v: boolean) => void }

function Dialog({ p, onDone }: { p: Pending; onDone: (v: boolean) => void }) {
  const titleId = useId()
  const msgId = useId()
  const cancel = useCallback(() => onDone(false), [onDone])
  const ref = useDialogA11y<HTMLDivElement>(cancel, { initialFocus: '[data-confirm-cancel]' })
  const confirmLabel = p.confirmLabel ?? (p.danger ? 'Excluir' : 'Confirmar')
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(16,13,10,0.55)', zIndex: 1500,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={p.message ? msgId : undefined}
        style={{
          background: 'var(--cream-card)', borderRadius: 12, padding: 24, width: 440, maxWidth: '96vw',
          border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', fontFamily: 'var(--font-body)',
          borderTop: p.danger ? '4px solid var(--neg)' : '1px solid var(--divider)',
        }}>
        <h2 id={titleId} style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', margin: 0 }}>{p.title}</h2>
        {p.message && (
          <div id={msgId} style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            {p.message}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" data-confirm-cancel className="btn btn-outline" onClick={cancel}>
            {p.cancelLabel ?? 'Cancelar'}
          </button>
          <button type="button" className={p.danger ? 'btn btn-danger-solid' : 'btn btn-primary'} onClick={() => onDone(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const seq = useRef(0)

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>(resolve => {
    // Se já havia um aberto, ele é cancelado.
    pendingRef.current?.resolve(false)
    const p = { ...opts, id: ++seq.current, resolve }
    pendingRef.current = p
    setPending(p)
  }), [])

  const done = useCallback((v: boolean) => {
    pendingRef.current?.resolve(v)
    pendingRef.current = null
    setPending(null)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <Dialog key={pending.id} p={pending} onDone={done} />}
    </ConfirmContext.Provider>
  )
}
