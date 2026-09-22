// src/components/ModalFrame.tsx
// Casca acessível para os modais montados à mão (overlay + painel): role="dialog",
// aria-modal, Esc fecha, foco entra no diálogo e volta ao fechar (useDialogA11y).
// O clique no overlay NÃO fecha — de propósito, para não perder o formulário.

import { useDialogA11y } from './useDialogA11y'

export default function ModalFrame({ label, onClose, panelStyle, overlayStyle, children, disableEscape }: {
  /** Nome acessível do diálogo (normalmente o título visível). */
  label: string
  onClose: () => void
  panelStyle?: React.CSSProperties
  overlayStyle?: React.CSSProperties
  children: React.ReactNode
  disableEscape?: boolean
}) {
  const ref = useDialogA11y<HTMLDivElement>(onClose, { disableEscape })
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, ...overlayStyle,
    }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} style={panelStyle}>
        {children}
      </div>
    </div>
  )
}
