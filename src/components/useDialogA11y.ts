// src/components/useDialogA11y.ts
// Acessibilidade comum a todos os diálogos modais do sistema:
//   • Esc fecha (só o diálogo do topo, quando há um sobre o outro);
//   • o foco entra no diálogo ao abrir e volta ao elemento de origem ao fechar;
//   • Tab/Shift+Tab ficam presos dentro do diálogo.
// Clicar fora NÃO fecha (decisão de produto — evita perder o formulário).

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

// Pilha de diálogos abertos: o Esc e o foco preso valem só para o do topo.
const stack: symbol[] = []

export interface DialogA11yOptions {
  /** Seletor do elemento que recebe o foco inicial (ex.: botão Cancelar). */
  initialFocus?: string
  /** Desliga o Esc (ex.: enquanto salva). */
  disableEscape?: boolean
}

export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  opts: DialogA11yOptions = {},
) {
  const ref = useRef<T>(null)
  const closeRef = useRef(onClose)
  const optsRef = useRef(opts)
  useEffect(() => { closeRef.current = onClose; optsRef.current = opts })

  useEffect(() => {
    const id = Symbol('dialog')
    stack.push(id)
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current

    // Foco inicial: o seletor pedido, senão o primeiro campo, senão o painel.
    const focusFirst = () => {
      if (!root) return
      const wanted = optsRef.current.initialFocus ? root.querySelector<HTMLElement>(optsRef.current.initialFocus) : null
      const firstField = root.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])')
      const target = wanted ?? firstField ?? root
      if (target === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    }
    const raf = requestAnimationFrame(focusFirst)

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id || !root) return
      if (e.key === 'Escape') {
        if (optsRef.current.disableEscape) return
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key === 'Tab') {
        const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement)
        if (items.length === 0) { e.preventDefault(); return }
        const first = items[0], last = items[items.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || !root.contains(active))) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (active === last || !root.contains(active))) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(id)
      if (i >= 0) stack.splice(i, 1)
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [])

  return ref
}
