// src/components/Field.tsx
// Campo de formulário acessível: <label> associado ao controle (htmlFor + id),
// marcador de obrigatório (*), dica e mensagem de erro inline. O id, o
// aria-invalid, o aria-required e o aria-describedby são injetados no filho —
// que pode ser <input>, <select>, <textarea> ou qualquer componente que repasse
// essas props ao controle nativo (NumberInput, por exemplo).
//
//   <Field label="Nome completo" required error={err.full_name}>
//     <input value={…} onChange={…} style={modalInput} />
//   </Field>

import { cloneElement, isValidElement, useId } from 'react'
import { modalLabel } from './modals/styles'

type ControlProps = {
  id?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
  'aria-required'?: boolean
}

export interface FieldProps {
  label: React.ReactNode
  children: React.ReactElement<ControlProps>
  required?: boolean
  hint?: React.ReactNode
  /** Mensagem de erro; quando presente, o controle fica aria-invalid. */
  error?: string | null | false
  /** Estilo do <label> (padrão: micro-rótulo dos modais). */
  labelStyle?: React.CSSProperties
  style?: React.CSSProperties
  className?: string
}

const fieldErrorStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--neg)', marginTop: 4, fontFamily: 'var(--font-body)', lineHeight: 1.35,
}
const hintStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-body)', lineHeight: 1.35,
}

export default function Field({ label, children, required, hint, error, labelStyle, style, className }: FieldProps) {
  const auto = useId()
  const child = isValidElement(children) ? children : null
  const id = child?.props.id ?? `f${auto}`
  const hintId = hint && !error ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [child?.props['aria-describedby'], hintId, errId].filter(Boolean).join(' ') || undefined

  const control = child
    ? cloneElement(child, {
        id,
        'aria-invalid': error ? true : child.props['aria-invalid'],
        'aria-required': required || child.props['aria-required'] || undefined,
        'aria-describedby': describedBy,
      })
    : children

  return (
    <div style={style} className={className}>
      <label htmlFor={id} style={labelStyle ?? modalLabel}>
        {label}
        {required && <span aria-hidden="true" style={{ color: 'var(--neg)', marginLeft: 3 }}>*</span>}
      </label>
      {control}
      {hintId && <div id={hintId} style={hintStyle}>{hint}</div>}
      {error && <div id={errId} role="alert" style={fieldErrorStyle}>{error}</div>}
    </div>
  )
}
