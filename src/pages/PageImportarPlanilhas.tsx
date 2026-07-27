// src/pages/PageImportarPlanilhas.tsx
// Importador dedicado aos workbooks brutos "Ativos" e "Passivos" (base do antigo
// Power BI). Faz preview das abas, importa com upsert idempotente (source_key /
// external_ref) e mostra um relatório de reconciliação.

import { useRef, useState } from 'react'
import { parseWorkbookFile } from '../lib/xlsx-utils'
import { importWorkbook, type ImportReport } from '../lib/importSheets'
import PageHero from '../components/PageHero'

const fontBody = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', monospace"

const KNOWN = ['Ativos', 'Federativos e Econômicos', 'Intermediários', 'Luvas e Prêmios', 'Controle de Imagem 2025', 'Controle de Imagem 2026', 'Direito de Imagem', 'Solidariedade e Compensação']

type Sheets = Record<string, Record<string, string>[]>

export default function PageImportarPlanilhas() {
  const ref = useRef<HTMLInputElement>(null)
  const [sheets, setSheets] = useState<Sheets | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (e.target) e.target.value = ''
    if (!file) return
    setError(null); setReport(null); setBusy(true)
    try {
      const parsed = await parseWorkbookFile(file) as Sheets
      setSheets(parsed); setFileName(file.name)
    } catch (err) { setError(`Erro ao ler: ${(err as Error).message}`) }
    finally { setBusy(false) }
  }

  async function confirm() {
    if (!sheets) return
    setBusy(true); setError(null)
    try { setReport(await importWorkbook(sheets)) }
    catch (err) { setError(`Erro na importação: ${(err as Error).message}`) }
    finally { setBusy(false) }
  }

  function reset() { setSheets(null); setReport(null); setFileName(''); setError(null) }

  const known = sheets ? Object.keys(sheets).filter(s => KNOWN.includes(s)) : []
  const other = sheets ? Object.keys(sheets).filter(s => !KNOWN.includes(s)) : []

  const card: React.CSSProperties = { padding: '14px 18px' }
  const num: React.CSSProperties = { fontFamily: fontMono, fontWeight: 600 }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>
      <PageHero title="Importar planilhas (Ativos / Passivos)" subtitle="Importar / Exportar · Botafogo SAF" />
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: fontBody, marginTop: -4, marginBottom: 22, maxWidth: 760 }}>
        Importa os workbooks brutos que alimentavam o Power BI. Os atletas são reconhecidos pela chave natural (CPF/passaporte),
        clubes e agentes viram cadastros, e cada parcela recebe um <span style={{ fontFamily: fontMono }}>source_key</span> —
        reimportar o mesmo arquivo <strong>não duplica</strong>, apenas complementa.
      </p>

      {!sheets && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <input ref={ref} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => ref.current?.click()} disabled={busy}
            style={{ padding: '11px 26px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: fontBody, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {busy ? 'Lendo...' : 'Selecionar arquivo .xlsx'}
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', fontFamily: fontBody }}>Envie um arquivo por vez (Ativos ou Passivos).</div>
        </div>
      )}

      {sheets && !report && (
        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-primary)', fontFamily: fontBody, marginBottom: 4 }}>{fileName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: fontBody, marginBottom: 14 }}>Abas reconhecidas para importação:</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 8, marginBottom: 8 }}>
            {known.map(s => (
              <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 7, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)', fontFamily: fontBody, fontSize: 12 }}>
                <span>{s}</span><span style={num}>{sheets[s].length}</span>
              </div>
            ))}
          </div>
          {other.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 6 }}>Ignoradas: {other.join(', ')}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={confirm} disabled={busy || known.length === 0}
              style={{ padding: '10px 22px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: fontBody, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {busy ? 'Importando...' : 'Confirmar importação'}
            </button>
            <button onClick={reset} className="btn btn-outline">Cancelar</button>
          </div>
        </div>
      )}

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12 }}>
            <div className="card" style={card}><div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Atletas novos</div><div style={{ ...num, fontSize: 22 }}>{report.athletes.created}</div></div>
            <div className="card" style={card}><div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Clubes novos</div><div style={{ ...num, fontSize: 22 }}>{report.clubs.created}</div></div>
            <div className="card" style={card}><div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Agentes novos</div><div style={{ ...num, fontSize: 22 }}>{report.agents.created}</div></div>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider-soft)', fontWeight: 600, fontSize: 14, fontFamily: fontBody, color: 'var(--ink-primary)' }}>Obrigações importadas</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Natureza', 'Criadas', 'Já existiam', 'Sem atleta', 'Erros'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-secondary)', background: 'var(--tbl-head)', borderBottom: '1px solid var(--divider-strong)' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {Object.entries(report.obligations).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: '9px 14px', fontFamily: fontBody, fontSize: 13, borderBottom: '1px solid var(--divider-soft)' }}>{k}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', ...num, color: 'var(--pos)', borderBottom: '1px solid var(--divider-soft)' }}>{v.created}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', ...num, color: 'var(--text-muted)', borderBottom: '1px solid var(--divider-soft)' }}>{v.skipped}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', ...num, color: v.orphan ? 'var(--neg)' : 'var(--text-muted)', borderBottom: '1px solid var(--divider-soft)' }}>{v.orphan}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', ...num, color: v.error ? 'var(--neg)' : 'var(--text-muted)', borderBottom: '1px solid var(--divider-soft)' }}>{v.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.keys(report.pending).length > 0 && (
            <div className="card" style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--warn)', marginBottom: 8 }}>Reconhecido — mapeamento em etapa futura</div>
              {Object.entries(report.pending).map(([k, n]) => (
                <div key={k} style={{ fontSize: 12, fontFamily: fontBody, color: 'var(--text-secondary)' }}>{k}: <span style={num}>{n}</span> linhas</div>
              ))}
            </div>
          )}

          <div><button onClick={reset} className="btn btn-primary">Importar outro arquivo</button></div>
        </div>
      )}

      {error && <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 8, background: 'var(--neg-tint)', color: 'var(--neg)', fontFamily: fontBody, fontSize: 13 }}>{error}</div>}
    </div>
  )
}
