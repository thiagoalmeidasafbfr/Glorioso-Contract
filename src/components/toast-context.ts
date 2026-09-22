// src/components/toast-context.ts
// Contexto e hook dos toasts. O provider (com a UI) fica em Toast.tsx — separados
// para não quebrar o fast-refresh do Vite (arquivo de componente só exporta componentes).

import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastOptions {
  /** Texto secundário (ex.: detalhe técnico do erro). */
  detail?: string
  /** Tempo em ms até sumir sozinho. Padrão: 4s (erros: 8s). 0 = só fecha no ✕. */
  duration?: number
}

export interface ToastApi {
  success: (message: string, opts?: ToastOptions) => void
  error: (message: string, opts?: ToastOptions) => void
  info: (message: string, opts?: ToastOptions) => void
}

const noop: ToastApi = {
  // Fora do provider (ex.: testes isolados) cai no console em vez de quebrar.
  success: (m) => console.info('[toast]', m),
  error: (m, o) => console.error('[toast]', m, o?.detail ?? ''),
  info: (m) => console.info('[toast]', m),
}

export const ToastContext = createContext<ToastApi>(noop)

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

/** Extrai uma mensagem legível de qualquer erro (Error, PostgrestError, string…). */
export function errorMessage(e: unknown): string {
  if (!e) return 'Erro desconhecido.'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [o.message, o.details, o.hint].filter(v => typeof v === 'string' && v) as string[]
    if (parts.length) return parts.join(' — ') + (o.code ? ` (código ${String(o.code)})` : '')
    try { return JSON.stringify(e) } catch { /* ignore */ }
  }
  return String(e)
}
