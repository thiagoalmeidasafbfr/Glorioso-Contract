import { useRef, useState } from 'react'
import { exportWorkbook, parseWorkbookFile, type ColDef } from '../lib/xlsx-utils'

export interface ExportSheet {
  name: string
  cols: ColDef[]
  rows: Record<string, unknown>[]
}

interface Props {
  exportSheets: ExportSheet[]
  exportFilename: string
  onImport?: (sheets: Record<string, Record<string, string>[]>) => void
}

const fontMono = "'IBM Plex Mono', monospace"
const fontBody = "'Inter', system-ui, sans-serif"
const fontDisplay = "'Fraunces', 'Cormorant Garamond', Georgia, serif"

export default function SheetIO({ exportSheets, exportFilename, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{
    sheets: Record<string, Record<string, string>[]>
    active: string
  } | null>(null)
  const [parsing, setParsing] = useState(false)

  function handleExport() {
    exportWorkbook(exportSheets, exportFilename)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setParsing(true)
    try {
      const sheets = await parseWorkbookFile(file)
      const firstSheet = Object.keys(sheets)[0] ?? ''
      setPreview({ sheets, active: firstSheet })
    } finally {
      setParsing(false)
    }
  }

  function handleConfirm() {
    if (preview && onImport) onImport(preview.sheets)
    setPreview(null)
  }

  const totalRows = preview
    ? Object.values(preview.sheets).reduce((s, rows) => s + rows.length, 0)
    : 0

  const activeRows = preview?.sheets[preview.active] ?? []
  const activeKeys = activeRows.length > 0 ? Object.keys(activeRows[0]) : []

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleExport}
          title="Exportar dados como XLSX"
          style={btnStyle('rgba(26,20,16,0.90)', '#dcc89a')}
        >
          ↓ Exportar
        </button>
        {onImport && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            title="Importar dados de um arquivo XLSX"
            style={btnStyle('rgba(190,140,74,0.15)', '#be8c4a', 'rgba(190,140,74,0.40)')}
          >
            {parsing ? '…' : '↑ Importar'}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      </div>

      {/* ── Preview modal ── */}
      {preview && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(26,20,16,0.80)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 24,
        }}>
          <div style={{
            background: 'var(--cream-page, #f9f7f2)',
            borderRadius: 14,
            width: '100%', maxWidth: 960,
            maxHeight: '88vh',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.40)',
          }}>

            {/* Header */}
            <div style={{
              background: '#1a1410',
              padding: '18px 28px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ fontFamily: fontMono, fontSize: 9, color: 'rgba(243,238,226,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Preview de Importação
                </div>
                <div style={{ fontFamily: fontDisplay, fontSize: '1.3rem', fontWeight: 700, color: '#f5f2ec', lineHeight: 1.1 }}>
                  {totalRows} {totalRows === 1 ? 'registro' : 'registros'} encontrados
                </div>
              </div>
              <button
                onClick={() => setPreview(null)}
                style={{ background: 'none', border: 'none', color: 'rgba(243,238,226,0.45)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Sheet tabs */}
            {Object.keys(preview.sheets).length > 1 && (
              <div style={{
                display: 'flex', gap: 4,
                padding: '10px 28px 0',
                background: '#f0ede6',
                borderBottom: '1px solid #e0dbd0',
                flexShrink: 0, flexWrap: 'wrap',
              }}>
                {Object.keys(preview.sheets).map(name => {
                  const active = preview.active === name
                  return (
                    <button
                      key={name}
                      onClick={() => setPreview(p => p ? { ...p, active: name } : p)}
                      style={{
                        padding: '6px 14px',
                        border: 'none',
                        borderRadius: '6px 6px 0 0',
                        fontFamily: fontMono, fontSize: 9,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        background: active ? 'var(--cream-page, #f9f7f2)' : 'transparent',
                        color: active ? '#1a1410' : '#999',
                        cursor: 'pointer',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {name} ({preview.sheets[name].length})
                    </button>
                  )
                })}
              </div>
            )}

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 28px' }}>
              {activeRows.length > 0 ? (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        {activeKeys.map(k => (
                          <th key={k} style={{
                            padding: '10px 8px 8px',
                            textAlign: 'left',
                            fontFamily: fontMono, fontSize: 9,
                            letterSpacing: '0.14em', textTransform: 'uppercase',
                            color: 'var(--ink-secondary, #6b6258)',
                            background: 'var(--cream-page, #f9f7f2)',
                            borderBottom: '1px solid #e0dbd0',
                            whiteSpace: 'nowrap',
                          }}>
                            {k}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeRows.slice(0, 12).map((row, i) => (
                        <tr key={i}>
                          {activeKeys.map(k => (
                            <td key={k} style={{
                              padding: '6px 8px',
                              fontFamily: fontBody, fontSize: 11,
                              color: 'var(--ink-primary, #1a1410)',
                              borderBottom: '1px solid #ede9e1',
                              whiteSpace: 'nowrap',
                              maxWidth: 220,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {String(row[k] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {activeRows.length > 12 && (
                    <div style={{ padding: '10px 8px', fontFamily: fontMono, fontSize: 9, color: '#aaa', letterSpacing: '0.10em' }}>
                      + {activeRows.length - 12} linhas adicionais não exibidas
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: fontBody, fontSize: 13, color: '#aaa' }}>
                  Nenhum dado encontrado nesta aba
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 28px',
              borderTop: '1px solid #e0dbd0',
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              flexShrink: 0,
              background: '#f0ede6',
            }}>
              <button onClick={() => setPreview(null)} style={btnStyle('transparent', '#888', '#ccc8c0')}>
                Cancelar
              </button>
              <button onClick={handleConfirm} style={btnStyle('#1a1410', '#dcc89a')}>
                Confirmar Importação
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function btnStyle(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    background: bg,
    color,
    border: border ? `1px solid ${border}` : 'none',
    borderRadius: 999,
    padding: '8px 18px',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10, fontWeight: 500,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'opacity 0.12s',
  }
}
