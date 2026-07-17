// src/lib/remflow.ts
// Gerador do fluxo mensal de remuneração (salário / imagem) ao longo da vigência
// do vínculo, com PRO-RATA por dias nos meses quebrados (início/fim) e vencimento
// SEMPRE no mês subsequente à competência.
//
// Ex.: atleta entra 15/01/2026, 500k/mês, vencimento dia 5 (CLT):
//   • competência jan/2026 (ativo 15→31, 17 de 31 dias) → ~274k, vence 05/02/2026
//   • fev/2026 em diante (mês cheio) → 500k, vence no dia 5 do mês seguinte
//   • mês final quebrado também é proporcional aos dias ativos.

export interface RemFlowLine {
  competencia: string   // 'YYYY-MM'
  due_date: string      // vencimento (dia D do mês subsequente)
  value: number         // valor proporcional aos dias ativos no mês
  full: boolean         // true se o mês é cheio (sem pro-rata)
}

function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
}
function pad(n: number): string { return String(n).padStart(2, '0') }

export function buildRemunerationFlow(
  startISO: string, endISO: string, monthly: number, dueDay: number,
): RemFlowLine[] {
  if (!startISO || !endISO || !(monthly > 0)) return []
  const start = new Date(startISO + 'T12:00:00Z')
  const end = new Date(endISO + 'T12:00:00Z')
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return []

  const lines: RemFlowLine[] = []
  let y = start.getUTCFullYear(), m = start.getUTCMonth()
  const endY = end.getUTCFullYear(), endM = end.getUTCMonth()

  while (y < endY || (y === endY && m <= endM)) {
    const dim = daysInMonth(y, m)
    // Dia ativo dentro do mês (diferença de dia-do-mês evita erro de fuso).
    const firstDay = (y === start.getUTCFullYear() && m === start.getUTCMonth()) ? start.getUTCDate() : 1
    const lastDay = (y === end.getUTCFullYear() && m === end.getUTCMonth()) ? end.getUTCDate() : dim
    const daysActive = Math.max(0, lastDay - firstDay + 1)
    const frac = Math.min(1, Math.max(0, daysActive / dim))
    const value = Math.round(monthly * frac * 100) / 100
    // vencimento no mês subsequente
    const py = m === 11 ? y + 1 : y
    const pm0 = m === 11 ? 0 : m + 1
    lines.push({
      competencia: `${y}-${pad(m + 1)}`,
      due_date: `${py}-${pad(pm0 + 1)}-${pad(dueDay)}`,
      value,
      full: daysActive >= dim,
    })
    m++; if (m > 11) { m = 0; y++ }
  }
  return lines
}
