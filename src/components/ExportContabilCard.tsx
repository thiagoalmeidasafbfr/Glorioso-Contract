// src/components/ExportContabilCard.tsx
// Cartão "Exportar lançamentos contábeis" (Dados & Modelos) — Fase 5.4.
// Layout genérico: ver o cabeçalho de src/lib/exportContabil.ts.

import { useState } from 'react'
import { exportLancamentosXLSX, exportLancamentosCSV } from '../lib/exportContabil'

const fontBody = "var(--font-body)"
const fontMono = "var(--font-label)"

export default function ExportContabilCard() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function run(kind: 'xlsx' | 'csv') {
    setBusy(true); setMsg(null)
    try {
      const n = kind === 'xlsx' ? await exportLancamentosXLSX() : await exportLancamentosCSV()
      setMsg({ ok: true, text: `${n} lançamento(s) exportado(s).` })
    } catch (e) { setMsg({ ok: false, text: `Erro: ${(e as Error).message}` }) } finally { setBusy(false) }
  }
  return (
    <div className="card" style={{ padding: 18, marginTop: 14 }} data-testid="export-contabil">
      <div style={{ fontFamily: fontBody, fontSize: 15, fontWeight: 600, color: 'var(--ink-primary)', marginBottom: 2 }}>Exportar lançamentos contábeis</div>
      <div style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--warn)', marginBottom: 6 }}>Layout genérico — ajustar ao plano de contas / ERP</div>
      <div style={{ fontFamily: fontBody, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, maxWidth: 720 }}>
        Uma linha por parcela (ou cláusula sem parcelas): data, atleta, contraparte, natureza, direção (a pagar / a receber), moeda,
        valor, valor em BRL (PTAX do pagamento quando pago; senão PTAX fixada ou câmbio aproximado), status e rubrica sugerida
        (capitalizar no intangível × despesa × receita).
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void run('xlsx')}>{busy ? 'Gerando…' : 'Exportar XLSX'}</button>
        <button className="btn btn-outline" disabled={busy} onClick={() => void run('csv')}>Exportar CSV</button>
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 10, fontSize: 12, fontFamily: fontBody, color: msg.ok ? 'var(--pos)' : 'var(--neg)' }}>{msg.text}</div>}
    </div>
  )
}
