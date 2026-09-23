import { useRef, useState } from 'react'
import { Icon } from './Icon'
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
        <button onClick={handleExport} title="Exportar dados como XLSX" className="btn btn-dark">
          <Icon name="download" size={16} /> Exportar
        </button>
        {onImport && (
          <button onClick={() => fileRef.current?.click()} disabled={parsing}
            title="Importar dados de um arquivo XLSX" className="btn btn-outline">
            <Icon name="upload" size={16} /> {parsing ? 'Lendo…' : 'Importar'}
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
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Preview de importação">
          <div className="modal-panel" style={{
            width: '100%', maxWidth: 960, maxHeight: '88vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>

            {/* Header */}
            <div style={{
              padding: 'var(--space-5) var(--space-6) var(--space-4)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)',
              flexShrink: 0,
            }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Preview de importação</div>
                <div style={{ fontSize: 'var(--text-title-size)', lineHeight: 'var(--text-title-line)', letterSpacing: '-.01em', color: 'var(--text-primary)' }}>
                  {totalRows} {totalRows === 1 ? 'registro' : 'registros'} encontrados
                </div>
              </div>
              <button type="button" className="icon-btn md" onClick={() => setPreview(null)} title="Fechar" aria-label="Fechar">
                <Icon name="x" size={20} />
              </button>
            </div>

            {/* Sheet tabs — SegmentedTabs do DS */}
            {Object.keys(preview.sheets).length > 1 && (
              <div className="seg-tabs" role="tablist" style={{
                padding: '0 var(--space-6)', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
              }}>
                {Object.keys(preview.sheets).map(name => {
                  const active = preview.active === name
                  return (
                    <button
                      key={name}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className="seg-tab"
                      onClick={() => setPreview(p => p ? { ...p, active: name } : p)}
                    >
                      {name} ({preview.sheets[name].length})
                    </button>
                  )
                })}
              </div>
            )}

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 var(--space-6)' }}>
              {activeRows.length > 0 ? (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr>
                        {activeKeys.map(k => (
                          <th key={k} style={{ padding: '10px 8px 8px' }}>
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
                              padding: '8px',
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
                    <div style={{ padding: '10px 8px', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
                      + {activeRows.length - 12} linhas adicionais não exibidas
                    </div>
                  )}
                </>
              ) : (
                <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 'var(--text-body-size)', color: 'var(--text-secondary)' }}>
                  Nenhum dado encontrado nesta aba
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: 'var(--space-4) var(--space-6)',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end',
              flexShrink: 0,
            }}>
              <button type="button" onClick={() => setPreview(null)} className="btn btn-outline">
                Cancelar
              </button>
              <button type="button" onClick={handleConfirm} className="btn btn-primary">
                Confirmar importação
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

