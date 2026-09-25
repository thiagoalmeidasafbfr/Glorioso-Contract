// src/components/NumberInput.tsx
// Input numérico com separador de milhar e decimal automáticos, no padrão do
// idioma da interface (PT/ES: "30.000.000,5" · EN: "30,000,000.5").
// O usuário digita "30000000" e vê o número agrupado; digita o separador
// decimal do idioma para os decimais.
//
// Contrato de dados (compatível com os call-sites existentes):
//   • value:    number | string | null — o valor "cru" (string usa PONTO decimal,
//               ex.: "30000000.5", como o antigo <input type="number">).
//   • onChange: recebe a string CRUA normalizada (ponto decimal, sem milhar),
//               '' quando vazio. Assim `parseFloat(valor)` continua válido no save.
//
// O componente é dono da string exibida (formatada) e só re-sincroniza a partir
// de `value` quando o número externo muda — preservando o separador decimal em
// digitação (ex.: "200," não é reformatado para "200").

import { useState, useEffect } from 'react'
import { locale } from '../i18n'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | string | null | undefined
  onChange: (raw: string) => void
  decimals?: number    // casas decimais máximas (default 2)
  grouping?: boolean   // separador de milhar (default true)
}

/** Separadores de milhar e decimal do idioma atual. */
function separators(): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale()).formatToParts(12345.6)
  return {
    group: parts.find(p => p.type === 'group')?.value ?? '.',
    decimal: parts.find(p => p.type === 'decimal')?.value ?? ',',
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isNaN(n) ? null : n
}

// Número de exibição a partir do valor externo cru.
function fmtExternal(v: number | string | null | undefined, decimals: number, grouping: boolean): string {
  const n = toNum(v)
  if (n === null) return ''
  return n.toLocaleString(locale(), { useGrouping: grouping, maximumFractionDigits: decimals })
}

// Interpreta a string EXIBIDA (separadores do idioma) como número.
function parseDisplay(text: string): number | null {
  if (!text.trim()) return null
  const { group, decimal } = separators()
  const norm = text
    .replace(new RegExp(escapeRe(group) + '|\\s', 'g'), '')
    .replace(decimal, '.')
    .replace(/[^\d.-]/g, '')
  const n = parseFloat(norm)
  return Number.isNaN(n) ? null : n
}

function groupThousands(intDigits: string, group: string): string {
  if (!intDigits) return ''
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, group)
}

export default function NumberInput({ value, onChange, decimals = 2, grouping = true, ...rest }: Props) {
  const [text, setText] = useState<string>(() => fmtExternal(value, decimals, grouping))

  // Re-sincroniza quando o valor externo (numérico) muda por fora — sem
  // atropelar a digitação em curso (mesmo número ⇒ mantém o texto atual).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (toNum(value) !== parseDisplay(text)) setText(fmtExternal(value, decimals, grouping))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const { group, decimal } = separators()
    let s = e.target.value.replace(new RegExp(`[^\\d${escapeRe(decimal)}-]`, 'g'), '')
    const neg = s.startsWith('-')
    s = s.replace(/-/g, '')
    const firstDec = s.indexOf(decimal)
    let intPart = (firstDec === -1 ? s : s.slice(0, firstDec)).replace(/\D/g, '')
    let decPart = firstDec === -1 ? null : s.slice(firstDec + decimal.length).replace(/\D/g, '')
    if (decPart !== null && decimals >= 0) decPart = decPart.slice(0, decimals)
    intPart = intPart.replace(/^0+(?=\d)/, '')

    // String exibida (com milhar e o separador decimal digitado, mesmo sem decimais ainda).
    const grouped = grouping ? groupThousands(intPart, group) : intPart
    let disp = (neg ? '-' : '') + grouped
    if (decPart !== null) disp += decimal + decPart
    if (disp === '-') disp = ''
    setText(disp)

    // String crua normalizada (ponto decimal, sem milhar) para o call-site.
    if (intPart === '' && (decPart === null || decPart === '')) { onChange(''); return }
    let norm = (neg ? '-' : '') + (intPart === '' ? '0' : intPart)
    if (decPart) norm += '.' + decPart
    onChange(norm)
  }

  return <input {...rest} type="text" inputMode="decimal" value={text} onChange={handle} />
}
