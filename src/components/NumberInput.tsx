// src/components/NumberInput.tsx
// Input numérico com pontuação de milhar e vírgula decimal automáticas (pt-BR).
// O usuário digita "30000000" e vê "30.000.000"; digita vírgula para os decimais.
//
// Contrato de dados (compatível com os call-sites existentes):
//   • value:    number | string | null — o valor "cru" (string usa PONTO decimal,
//               ex.: "30000000.5", como o antigo <input type="number">).
//   • onChange: recebe a string CRUA normalizada (ponto decimal, sem milhar),
//               '' quando vazio. Assim `parseFloat(valor)` continua válido no save.
//
// O componente é dono da string exibida (formatada) e só re-sincroniza a partir
// de `value` quando o número externo muda — preservando vírgula/decimais em
// digitação (ex.: "200," não é reformatado para "200").

import { useState, useEffect } from 'react'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | string | null | undefined
  onChange: (raw: string) => void
  decimals?: number    // casas decimais máximas (default 2)
  grouping?: boolean   // separador de milhar (default true)
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isNaN(n) ? null : n
}

// Número de exibição (formatação pt-BR) a partir do valor externo cru.
function fmtExternal(v: number | string | null | undefined, decimals: number, grouping: boolean): string {
  const n = toNum(v)
  if (n === null) return ''
  return n.toLocaleString('pt-BR', { useGrouping: grouping, maximumFractionDigits: decimals })
}

// Interpreta a string EXIBIDA (milhar '.', decimal ',') como número.
function parseDisplay(text: string): number | null {
  if (!text.trim()) return null
  const norm = text.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const n = parseFloat(norm)
  return Number.isNaN(n) ? null : n
}

function groupThousands(intDigits: string): string {
  if (!intDigits) return ''
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
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
    let s = e.target.value.replace(/[^\d,-]/g, '')
    const neg = s.startsWith('-')
    s = s.replace(/-/g, '')
    const firstComma = s.indexOf(',')
    let intPart = (firstComma === -1 ? s : s.slice(0, firstComma)).replace(/\D/g, '')
    let decPart = firstComma === -1 ? null : s.slice(firstComma + 1).replace(/\D/g, '')
    if (decPart !== null && decimals >= 0) decPart = decPart.slice(0, decimals)
    intPart = intPart.replace(/^0+(?=\d)/, '')

    // String exibida (com milhar e a vírgula digitada, mesmo sem decimais ainda).
    const grouped = grouping ? groupThousands(intPart) : intPart
    let disp = (neg ? '-' : '') + grouped
    if (decPart !== null) disp += ',' + decPart
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
