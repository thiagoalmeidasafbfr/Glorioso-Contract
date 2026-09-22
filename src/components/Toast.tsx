// src/components/Toast.tsx
// Toasts empilhados no canto inferior direito. Substituem os alert() nativos:
// não bloqueiam a tela, somem sozinhos e são anunciados por leitores de tela
// (região aria-live). Uso: const toast = useToast(); toast.success('Salvo.')

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ToastContext, type ToastApi, type ToastKind, type ToastOptions } from './toast-context'

interface ToastItem { id: number; kind: ToastKind; message: string; detail?: string; duration: number }

const KIND_STYLE: Record<ToastKind, { bar: string; icon: string; label: string }> = {
  success: { bar: 'var(--pos)',  icon: '✓', label: 'Sucesso' },
  error:   { bar: 'var(--neg)',  icon: '!', label: 'Erro' },
  info:    { bar: 'var(--info)', icon: 'i', label: 'Aviso' },
}

function ToastCard({ t, onClose }: { t: ToastItem; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (!t.duration || paused) return
    const h = window.setTimeout(() => onClose(t.id), t.duration)
    return () => window.clearTimeout(h)
  }, [t.id, t.duration, paused, onClose])
  const k = KIND_STYLE[t.kind]
  return (
    <div
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      style={{
        pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: 10,
        width: 360, maxWidth: 'calc(100vw - 32px)', padding: '12px 12px 12px 14px',
        background: 'var(--cream-card)', color: 'var(--ink-primary)',
        border: '1px solid var(--divider-strong)', borderLeft: `4px solid ${k.bar}`,
        borderRadius: 10, boxShadow: 'var(--shadow-panel)', fontFamily: 'var(--font-body)',
      }}>
      <span aria-hidden style={{
        flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: k.bar, color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, marginTop: 1,
      }}>{k.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{k.label}: </span>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{t.message}</div>
        {t.detail && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{t.detail}</div>
        )}
      </div>
      <button type="button" onClick={() => onClose(t.id)} aria-label="Fechar notificação"
        style={{
          flexShrink: 0, width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, borderRadius: 6,
        }}>×</button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const close = useCallback((id: number) => setItems(list => list.filter(t => t.id !== id)), [])
  const push = useCallback((kind: ToastKind, message: string, opts: ToastOptions = {}) => {
    const id = ++seq.current
    const duration = opts.duration ?? (kind === 'error' ? 8000 : 4000)
    // No máximo 5 na tela — os mais antigos saem primeiro.
    setItems(list => [...list, { id, kind, message, detail: opts.detail, duration }].slice(-5))
  }, [])

  const api = useMemo<ToastApi>(() => ({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" aria-relevant="additions" aria-label="Notificações"
        style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 2000, display: 'flex', flexDirection: 'column',
          gap: 8, alignItems: 'flex-end', pointerEvents: 'none',
        }}>
        {items.map(t => <ToastCard key={t.id} t={t} onClose={close} />)}
      </div>
    </ToastContext.Provider>
  )
}
