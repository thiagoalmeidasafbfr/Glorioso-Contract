// src/pages/PageImportarPlanilhas.tsx
// Importador dedicado aos workbooks brutos "Ativos" e "Passivos" (base do antigo
// Power BI). Faz preview das abas, importa com upsert idempotente (source_key /
// external_ref) e mostra um relatório de reconciliação.

import { useRef, useState } from 'react'
import { parseWorkbookFile } from '../lib/xlsx-utils'
import { importWorkbook, type ImportReport } from '../lib/importSheets'
import PageHero from '../components/PageHero'
import { Icon } from '../components/Icon'
import { tr, trf } from '../i18n'

const fontBody = "var(--font-body)"
const fontMono = "var(--font-label)"

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
    } catch (err) { setError(trf('Erro ao ler: {0}', (err as Error).message)) }
    finally { setBusy(false) }
  }

  async function confirm() {
    if (!sheets) return
    setBusy(true); setError(null)
    try { setReport(await importWorkbook(sheets)) }
    catch (err) { setError(trf('Erro na importação: {0}', (err as Error).message)) }
    finally { setBusy(false) }
  }

  function reset() { setSheets(null); setReport(null); setFileName(''); setError(null) }

  const known = sheets ? Object.keys(sheets).filter(s => KNOWN.includes(s)) : []
  const other = sheets ? Object.keys(sheets).filter(s => !KNOWN.includes(s)) : []

  const card: React.CSSProperties = { padding: 'var(--gutter-card)' }
  const num: React.CSSProperties = { fontFamily: fontMono, fontWeight: 500 }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title={tr('Importar planilhas (Ativos / Passivos)')} section={tr('Dados')} />
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: fontBody, marginTop: 'calc(-1 * var(--space-3))', marginBottom: 'var(--space-6)', maxWidth: 760 }}>
        {tr('Importa os workbooks brutos que alimentavam o Power BI. Os atletas são reconhecidos pela chave natural (CPF/passaporte), clubes e agentes viram cadastros, e cada parcela recebe um')} <span style={{ fontFamily: fontMono }}>{tr('source_key')}</span> {tr('— reimportar o mesmo arquivo')} <strong>{tr('não duplica')}</strong>{tr(', apenas complementa.')}
      </p>

      {!sheets && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <input ref={ref} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          <button onClick={() => ref.current?.click()} disabled={busy} className="btn btn-primary btn-lg">
            <Icon name="upload" size={16} /> {busy ? tr('Lendo…') : tr('Selecionar arquivo .xlsx')}
          </button>
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', fontFamily: fontBody }}>{tr('Envie um arquivo por vez (Ativos ou Passivos).')}</div>
        </div>
      )}

      {sheets && !report && (
        <div className="card" style={{ padding: 'var(--gutter-card)' }}>
          <div style={{ fontSize: 'var(--ui-text-size)', fontWeight: 500, color: 'var(--ink-primary)', fontFamily: fontBody, marginBottom: 4 }}>{fileName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: fontBody, marginBottom: 14 }}>{tr('Abas reconhecidas para importação:')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 8, marginBottom: 8 }}>
            {known.map(s => (
              <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-subtle)', fontFamily: fontBody, fontSize: 12 }}>
                <span>{tr(s)}</span><span style={num}>{sheets[s].length}</span>
              </div>
            ))}
          </div>
          {other.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: fontMono, marginTop: 6 }}>{tr('Ignoradas:')} {other.join(', ')}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={confirm} disabled={busy || known.length === 0} className="btn btn-primary">
              {busy ? tr('Importando…') : tr('Confirmar importação')}
            </button>
            <button onClick={reset} className="btn btn-outline">{tr('Cancelar')}</button>
          </div>
        </div>
      )}

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12 }}>
            <div className="card" style={card}><div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr('Atletas novos')}</div><div style={{ ...num, fontSize: 'var(--text-title-size)', fontWeight: 400, marginTop: 8 }}>{report.athletes.created}</div></div>
            <div className="card" style={card}><div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr('Clubes novos')}</div><div style={{ ...num, fontSize: 'var(--text-title-size)', fontWeight: 400, marginTop: 8 }}>{report.clubs.created}</div></div>
            <div className="card" style={card}><div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr('Agentes novos')}</div><div style={{ ...num, fontSize: 'var(--text-title-size)', fontWeight: 400, marginTop: 8 }}>{report.agents.created}</div></div>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="eyebrow" style={{ padding: '16px 16px 12px' }}>{tr('Obrigações importadas')}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {['Natureza', 'Criadas', 'Já existiam', 'Sem atleta', 'Erros'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--tbl-head)', borderBottom: '1px solid var(--divider-strong)' }}>{tr(h)}</th>
                ))}
              </tr></thead>
              <tbody>
                {Object.entries(report.obligations).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: '9px 14px', fontFamily: fontBody, fontSize: 13, borderBottom: '1px solid var(--divider-soft)' }}>{tr(k)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', ...num, color: 'var(--pos)', borderBottom: '1px solid var(--divider-soft)' }}>{v.created}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', ...num, color: 'var(--text-secondary)', borderBottom: '1px solid var(--divider-soft)' }}>{v.skipped}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', ...num, color: v.orphan ? 'var(--neg)' : 'var(--text-muted)', borderBottom: '1px solid var(--divider-soft)' }}>{v.orphan}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', ...num, color: v.error ? 'var(--neg)' : 'var(--text-muted)', borderBottom: '1px solid var(--divider-soft)' }}>{v.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.keys(report.pending).length > 0 && (
            <div className="card" style={{ padding: 'var(--gutter-card-sm)' }}>
              <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--warn)', marginBottom: 8 }}>{tr('Reconhecido — mapeamento em etapa futura')}</div>
              {Object.entries(report.pending).map(([k, n]) => (
                <div key={k} style={{ fontSize: 12, fontFamily: fontBody, color: 'var(--text-secondary)' }}>{tr(k)}: <span style={num}>{n}</span> {tr('linhas')}</div>
              ))}
            </div>
          )}

          <div><button onClick={reset} className="btn btn-primary">{tr('Importar outro arquivo')}</button></div>
        </div>
      )}

      {error && <div role="alert" style={{ marginTop: 14, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface-negative-soft)', color: 'var(--text-negative)', fontFamily: fontBody, fontSize: 13 }}>{tr(error)}</div>}
    </div>
  )
}
