// src/components/confirm-context.ts
// Contexto e hook do diálogo de confirmação (a UI fica em ConfirmDialog.tsx).
// Uso: const confirm = useConfirm(); if (!await confirm({ title, message, danger: true })) return

import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  message?: React.ReactNode
  /** Texto do botão de confirmação. Padrão: "Confirmar" ("Excluir" quando danger). */
  confirmLabel?: string
  cancelLabel?: string
  /** Ação destrutiva: botão vermelho. */
  danger?: boolean
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

// Fora do provider cai no confirm nativo (não deveria acontecer no app).
const fallback: ConfirmFn = async (o) => window.confirm([o.title, typeof o.message === 'string' ? o.message : ''].filter(Boolean).join('\n\n'))

export const ConfirmContext = createContext<ConfirmFn>(fallback)

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}
