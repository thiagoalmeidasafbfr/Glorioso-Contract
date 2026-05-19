import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import PageHero from '../components/PageHero'

const fontLabel = "'IBM Plex Mono', 'JetBrains Mono', monospace"
const fontData = "'JetBrains Mono', ui-monospace, monospace"
const fontBody = "'Inter', system-ui, sans-serif"

// ── Sheet definitions ─────────────────────────────────────────────────
const SHEETS = [
  { key: 'Atletas',                  label: 'Atletas',                  required: true  },
  { key: 'Intermediarios',           label: 'Intermediários',           required: false },
  { key: 'Bichos',                   label: 'Bichos por Competição',    required: false },
  { key: 'Pagamentos_Certos',        label: 'Pagamentos Certos',        required: false },
  { key: 'Pagamentos_Condicionais',  label: 'Pagamentos Condicionais',  required: false },
  { key: 'Passivos_Clubes',          label: 'Passivos Clubes',          required: false },
  { key: 'Passivos_Intermediarios',  label: 'Passivos Intermediários',  required: false },
]

type ImportStatus = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error'

interface SheetData {
  key: string
  label: string
  rows: Record<string, unknown>[]
  error?: string
}

// ── Date parsing helper ───────────────────────────────────────────────
function parseDate(v: unknown): string | null {
  if (!v) return null
  if (typeof v === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  const s = String(v ?? '').trim().toUpperCase()
  return s === 'S' || s === 'SIM' || s === 'TRUE' || s === '1'
}

// ── Row transformers ──────────────────────────────────────────────────
function transformAtleta(r: Record<string, unknown>) {
  return {
    id:                    parseNum(r['ID']) || undefined,
    nome:                  String(r['Nome'] ?? '').trim(),
    nome_completo:         String(r['Nome Completo'] ?? '').trim() || null,
    posicao:               String(r['Posição'] ?? '').trim() || null,
    data_nascimento:       parseDate(r['Data Nascimento']),
    pais_nascimento:       String(r['País Nascimento'] ?? '').trim() || null,
    foto_arquivo:          String(r['Foto Arquivo'] ?? '').trim() || null,
    status_contrato:       String(r['Status Contrato'] ?? 'Elenco').trim(),
    alocacao:              String(r['Alocação'] ?? 'Profissional').trim(),
    clube_anterior:        String(r['Clube Anterior'] ?? '').trim() || null,
    perc_saf:              parseNum(r['% SAF'] ?? 100),
    inicio_contrato:       parseDate(r['Início Contrato']),
    fim_contrato:          parseDate(r['Fim Contrato']),
    salario_clt:           parseNum(r['Salário CLT']),
    direito_imagem:        parseNum(r['Direito Imagem']),
    auxilio_moradia_m:     parseNum(r['Auxílio Moradia (Mensal)']),
    auxilio_alimentacao_m: parseNum(r['Auxílio Alimentação (Mensal)']),
    auxilio_viagem_a:      parseNum(r['Auxílio Viagem (Anual)']),
    outros_auxilios_m:     parseNum(r['Outros Auxílios (Mensal)']),
    transfer_fee_total:    parseNum(r['Transfer Fee Total']),
    transfer_fee_quitado:  parseNum(r['Transfer Fee Quitado']),
    transfer_fee_pendente: parseNum(r['Transfer Fee Pendente']),
    transfer_fee_acordo:   parseNum(r['Transfer Fee Acordo']),
    transfer_fee_moeda:    String(r['Moeda Transfer Fee'] ?? 'BRL').trim(),
    valor_mercado:         parseNum(r['Valor de Mercado']),
    valor_mercado_moeda:   String(r['Moeda Valor Mercado'] ?? 'EUR').trim(),
    multa_internacional:   String(r['Multa Internacional'] ?? '').trim() || null,
    multa_nacional:        String(r['Multa Nacional'] ?? '').trim() || null,
    multa_compensatoria:   String(r['Multa Compensatória'] ?? '').trim() || null,
  }
}

function transformIntermediario(r: Record<string, unknown>) {
  return {
    atleta_id:         parseNum(r['Atleta ID']),
    nome:              String(r['Nome Intermediário'] ?? '').trim(),
    perc_venda_futura: parseNum(r['% Venda Futura']),
  }
}

function transformBicho(r: Record<string, unknown>) {
  return {
    atleta_id:  parseNum(r['Atleta ID']),
    competicao: String(r['Competição'] ?? '').trim(),
    ano:        parseNum(r['Ano']),
    valor:      parseNum(r['Valor']),
  }
}

function transformPagamentoCerto(r: Record<string, unknown>) {
  return {
    atleta_id:       parseNum(r['Atleta ID']),
    despesa:         String(r['Despesa'] ?? '').trim() || null,
    contrato:        String(r['Contrato'] ?? '').trim() || null,
    parcela:         String(r['Parcela'] ?? '').trim() || null,
    vencimento:      parseDate(r['Vencimento']),
    valor:           parseNum(r['Valor']),
    moeda:           String(r['Moeda'] ?? 'BRL').trim(),
    venc_antecipado: parseBool(r['Venc. Antecipado']),
    parcial:         r['Parcial (valor)'] ? parseNum(r['Parcial (valor)']) : null,
    moeda_parcial:   String(r['Moeda Parcial'] ?? '').trim() || null,
    status:          String(r['Status'] ?? 'A pagar').trim(),
  }
}

function transformPagamentoCondicional(r: Record<string, unknown>) {
  return {
    atleta_id:         parseNum(r['Atleta ID']),
    despesa:           String(r['Despesa'] ?? '').trim() || null,
    contrato:          String(r['Contrato'] ?? '').trim() || null,
    detalhes_condicao: String(r['Detalhes Condição'] ?? '').trim() || null,
    valor:             String(r['Valor'] ?? '').trim() || null,
    moeda:             String(r['Moeda'] ?? 'BRL').trim(),
    venc_antecipado:   parseBool(r['Venc. Antecipado']),
    vencimento:        String(r['Vencimento'] ?? '').trim() || null,
    parcial:           r['Parcial'] ? parseNum(r['Parcial']) : null,
    moeda_parcial:     String(r['Moeda Parcial'] ?? '').trim() || null,
    status:            String(r['Status'] ?? 'Aguardando condição').trim(),
  }
}

function transformPassivoClube(r: Record<string, unknown>) {
  return {
    atleta_id:            parseNum(r['Atleta ID']),
    contrato:             String(r['Contrato'] ?? '').trim() || null,
    despesa:              String(r['Despesa'] ?? '').trim() || null,
    credor:               String(r['Credor'] ?? '').trim() || null,
    condicional:          parseBool(r['Condicional']),
    parcela:              String(r['Parcela'] ?? '').trim() || null,
    vencimento:           parseDate(r['Vencimento']),
    valor:                parseNum(r['Valor']),
    moeda:                String(r['Moeda'] ?? 'BRL').trim(),
    parcial:              r['Parcial'] ? parseNum(r['Parcial']) : null,
    moeda_parcial:        String(r['Moeda Parcial'] ?? '').trim() || null,
    saldo_moeda_contrato: parseNum(r['Saldo Moeda Contrato']),
    saldo_brl:            parseNum(r['Saldo BRL']),
    condicao:             String(r['Condição'] ?? '').trim() || null,
    venc_antecipado:      parseBool(r['Venc. Antecipado']),
    solidariedade:        parseBool(r['Solidariedade']),
    data_liquidacao:      parseDate(r['Data Liquidação']),
    status:               String(r['Status'] ?? 'A pagar').trim(),
  }
}

function transformPassivoIntermediario(r: Record<string, unknown>) {
  return {
    atleta_id:       parseNum(r['Atleta ID']),
    contrato:        String(r['Contrato'] ?? '').trim() || null,
    despesa:         String(r['Despesa'] ?? '').trim() || null,
    intermediario:   String(r['Intermediário'] ?? '').trim() || null,
    condicional:     parseBool(r['Condicional']),
    parcela:         String(r['Parcela'] ?? '').trim() || null,
    vencimento:      parseDate(r['Vencimento']),
    valor:           parseNum(r['Valor']),
    moeda:           String(r['Moeda'] ?? 'BRL').trim(),
    parcial:         r['Parcial'] ? parseNum(r['Parcial']) : null,
    moeda_parcial:   String(r['Moeda Parcial'] ?? '').trim() || null,
    saldo_brl:       parseNum(r['Saldo BRL']),
    condicao:        String(r['Condição'] ?? '').trim() || null,
    teor_multa:      String(r['Teor da Multa'] ?? '').trim() || null,
    venc_antecipado: parseBool(r['Venc. Antecipado']),
    data_liquidacao: parseDate(r['Data Liquidação']),
    status:          String(r['Status'] ?? 'A pagar').trim(),
  }
}

// Auto-generate parcelas_direito_imagem from atletas
function gerarParcelasImagem(atletas: ReturnType<typeof transformAtleta>[]) {
  const rows: { atleta_id: number; mes: string; valor: number; status: string }[] = []
  const hoje = new Date()
  for (const a of atletas) {
    if (!a.inicio_contrato || !a.fim_contrato || !a.id) continue
    const inicio = new Date(a.inicio_contrato + 'T00:00:00')
    const fim = new Date(a.fim_contrato + 'T00:00:00')
    let cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1)
    const fimMes = new Date(fim.getFullYear(), fim.getMonth(), 1)
    while (cur <= fimMes) {
      const mesStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
      const status = cur < hoje ? 'Pago' : 'A pagar'
      rows.push({ atleta_id: a.id!, mes: mesStr, valor: a.direito_imagem, status })
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }
  }
  return rows
}

// ── Component ─────────────────────────────────────────────────────────
export default function PageImport() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [progress, setProgress] = useState<{ step: string; done: number; total: number } | null>(null)
  const [resultMsg, setResultMsg] = useState('')
  const [activeSheet, setActiveSheet] = useState(0)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('parsing')
    setSheets([])

    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: false })

        const parsed: SheetData[] = []
        for (const s of SHEETS) {
          const ws = wb.Sheets[s.key]
          if (!ws) {
            if (s.required) parsed.push({ ...s, rows: [], error: `Aba "${s.key}" não encontrada no arquivo.` })
            continue
          }
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
          parsed.push({ ...s, rows })
        }
        setSheets(parsed)
        setStatus('preview')
        setActiveSheet(0)
      } catch (err) {
        setStatus('error')
        setResultMsg(`Erro ao ler o arquivo: ${(err as Error).message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    setStatus('importing')
    setProgress({ step: 'Atletas', done: 0, total: SHEETS.length })

    try {
      const atletasSheet = sheets.find(s => s.key === 'Atletas')
      if (!atletasSheet?.rows.length) throw new Error('Aba Atletas está vazia.')

      // 1. Clear existing data (in reverse FK order)
      for (const table of [
        'parcelas_direito_imagem', 'passivos_intermediario', 'passivos_clube',
        'condicionais_salario', 'acordos', 'pagamentos_condicionais',
        'pagamentos_certos', 'atleta_bichos', 'atleta_intermediarios', 'atletas',
      ]) {
        const { error } = await supabase.from(table).delete().neq('id', 0)
        if (error) throw new Error(`Erro ao limpar ${table}: ${error.message}`)
      }

      // 2. Insert Atletas
      setProgress({ step: 'Atletas', done: 1, total: 8 })
      const atletasRows = atletasSheet.rows.map(transformAtleta).filter(r => r.nome)
      const { data: atletasInserted, error: eA } = await supabase
        .from('atletas').insert(atletasRows).select('id, nome')
      if (eA) throw new Error(`Atletas: ${eA.message}`)

      // Build id map if user didn't provide IDs (serial will auto-assign)
      const idMap: Record<number, number> = {}
      if (atletasInserted) {
        atletasInserted.forEach((a, i) => {
          const originalId = atletasRows[i].id
          if (originalId) idMap[originalId] = a.id
          else idMap[i + 1] = a.id
        })
      }

      const mapId = (v: number) => idMap[v] ?? v

      // 3. Intermediários
      setProgress({ step: 'Intermediários', done: 2, total: 8 })
      const interSheet = sheets.find(s => s.key === 'Intermediarios')
      if (interSheet?.rows.length) {
        const rows = interSheet.rows.map(r => ({ ...transformIntermediario(r), atleta_id: mapId(parseNum(r['Atleta ID'])) }))
        const { error } = await supabase.from('atleta_intermediarios').insert(rows)
        if (error) throw new Error(`Intermediários: ${error.message}`)
      }

      // 4. Bichos
      setProgress({ step: 'Bichos', done: 3, total: 8 })
      const bichosSheet = sheets.find(s => s.key === 'Bichos')
      if (bichosSheet?.rows.length) {
        const rows = bichosSheet.rows.map(r => ({ ...transformBicho(r), atleta_id: mapId(parseNum(r['Atleta ID'])) }))
        const { error } = await supabase.from('atleta_bichos').insert(rows)
        if (error) throw new Error(`Bichos: ${error.message}`)
      }

      // 5. Pagamentos Certos
      setProgress({ step: 'Pagamentos Certos', done: 4, total: 8 })
      const pagCSheet = sheets.find(s => s.key === 'Pagamentos_Certos')
      if (pagCSheet?.rows.length) {
        const rows = pagCSheet.rows.map(r => ({ ...transformPagamentoCerto(r), atleta_id: mapId(parseNum(r['Atleta ID'])) }))
        const { error } = await supabase.from('pagamentos_certos').insert(rows)
        if (error) throw new Error(`Pagamentos Certos: ${error.message}`)
      }

      // 6. Pagamentos Condicionais
      setProgress({ step: 'Pagamentos Condicionais', done: 5, total: 8 })
      const pagCondSheet = sheets.find(s => s.key === 'Pagamentos_Condicionais')
      if (pagCondSheet?.rows.length) {
        const rows = pagCondSheet.rows.map(r => ({ ...transformPagamentoCondicional(r), atleta_id: mapId(parseNum(r['Atleta ID'])) }))
        const { error } = await supabase.from('pagamentos_condicionais').insert(rows)
        if (error) throw new Error(`Pagamentos Condicionais: ${error.message}`)
      }

      // 7. Passivos Clubes
      setProgress({ step: 'Passivos Clubes', done: 6, total: 8 })
      const pasClSheet = sheets.find(s => s.key === 'Passivos_Clubes')
      if (pasClSheet?.rows.length) {
        const rows = pasClSheet.rows.map(r => ({ ...transformPassivoClube(r), atleta_id: mapId(parseNum(r['Atleta ID'])) }))
        const { error } = await supabase.from('passivos_clube').insert(rows)
        if (error) throw new Error(`Passivos Clubes: ${error.message}`)
      }

      // 8. Passivos Intermediários
      setProgress({ step: 'Passivos Intermediários', done: 7, total: 8 })
      const pasIntSheet = sheets.find(s => s.key === 'Passivos_Intermediarios')
      if (pasIntSheet?.rows.length) {
        const rows = pasIntSheet.rows.map(r => ({ ...transformPassivoIntermediario(r), atleta_id: mapId(parseNum(r['Atleta ID'])) }))
        const { error } = await supabase.from('passivos_intermediario').insert(rows)
        if (error) throw new Error(`Passivos Intermediários: ${error.message}`)
      }

      // 9. Auto-generate parcelas direito de imagem
      setProgress({ step: 'Parcelas Direito de Imagem', done: 8, total: 8 })
      const atletasMapped = atletasRows.map((a, i) => ({
        ...a,
        id: atletasInserted?.[i]?.id ?? a.id,
      }))
      const parcelasRows = gerarParcelasImagem(atletasMapped as Parameters<typeof gerarParcelasImagem>[0])
      if (parcelasRows.length) {
        // insert in batches of 500
        for (let i = 0; i < parcelasRows.length; i += 500) {
          const { error } = await supabase.from('parcelas_direito_imagem').insert(parcelasRows.slice(i, i + 500))
          if (error) throw new Error(`Parcelas imagem: ${error.message}`)
        }
      }

      setStatus('done')
      setResultMsg(`Importação concluída. ${atletasRows.length} atleta(s) inserido(s).`)
    } catch (err) {
      setStatus('error')
      setResultMsg((err as Error).message)
    }
  }

  function reset() {
    setStatus('idle')
    setSheets([])
    setProgress(null)
    setResultMsg('')
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '12px 16px', maxWidth: 1200, margin: '0 auto', fontFamily: fontBody }}>

      <PageHero title="Importar Dados" subtitle="CARGA INICIAL — XLSX" />

      {/* ── Instruções ── */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: fontLabel, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--gold)', marginBottom: 12 }}>
          Formato do arquivo
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
          O arquivo XLSX deve conter as seguintes abas (sheets). Baixe o template para ver os cabeçalhos exatos.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {SHEETS.map(s => (
            <div key={s.key} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--cream-canvas)', borderRadius: 6, padding: '7px 10px',
            }}>
              <span style={{
                fontFamily: fontLabel, fontSize: 9, fontWeight: 500,
                color: s.required ? 'var(--pos)' : 'var(--gold-deep)',
                background: s.required ? 'var(--pos-tint)' : 'var(--gold-tint)',
                borderRadius: 3, padding: '1px 6px',
                textTransform: 'uppercase', letterSpacing: '0.10em',
              }}>
                {s.required ? 'Obrigatória' : 'Opcional'}
              </span>
              <span style={{ fontFamily: fontData, fontSize: 11, color: 'var(--ink-primary)' }}>{s.key}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button
            onClick={downloadTemplate}
            style={{
              background: 'var(--ink-primary)', color: 'var(--on-dark)',
              border: 'none', borderRadius: 999, padding: '9px 18px',
              fontFamily: fontLabel, fontSize: 10, fontWeight: 500,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Baixar Template (.xlsx)
          </button>
        </div>
      </div>

      {/* ── Upload ── */}
      {(status === 'idle' || status === 'parsing') && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--gold-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 24,
          }}>
            📂
          </div>
          <div style={{ fontFamily: fontLabel, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--gold-deep)', marginBottom: 8 }}>
            Selecionar Arquivo
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginBottom: 20 }}>
            Selecione o arquivo .xlsx com os dados para importar
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={status === 'parsing'}
            style={{
              background: 'var(--gold-soft)', color: 'var(--ink-secondary)',
              border: '1px solid rgba(58,46,28,0.12)', borderRadius: 999,
              padding: '10px 24px', fontFamily: fontLabel, fontSize: 10,
              fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {status === 'parsing' ? 'Lendo arquivo...' : 'Selecionar .xlsx'}
          </button>
        </div>
      )}

      {/* ── Preview ── */}
      {status === 'preview' && sheets.length > 0 && (
        <div>
          {/* Sheet tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            {sheets.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setActiveSheet(i)}
                style={{
                  background: activeSheet === i ? 'var(--ink-primary)' : 'var(--cream-card)',
                  color: activeSheet === i ? 'var(--on-dark)' : 'var(--ink-secondary)',
                  border: `1px solid ${activeSheet === i ? 'transparent' : 'var(--divider)'}`,
                  borderRadius: 6, padding: '6px 12px',
                  fontFamily: fontLabel, fontSize: 9, fontWeight: 500,
                  letterSpacing: '0.10em', textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                {s.key} ({s.rows.length})
              </button>
            ))}
          </div>

          {/* Active sheet preview */}
          {sheets[activeSheet] && (
            <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: fontLabel, fontSize: 10, fontWeight: 500, color: 'var(--ink-secondary)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                  {sheets[activeSheet].label} — {sheets[activeSheet].rows.length} registros
                </div>
                {sheets[activeSheet].error && (
                  <span style={{ fontFamily: fontLabel, fontSize: 9, color: 'var(--neg)', background: 'var(--neg-tint)', borderRadius: 3, padding: '2px 7px' }}>
                    {sheets[activeSheet].error}
                  </span>
                )}
              </div>
              {sheets[activeSheet].rows.length > 0 && (
                <div style={{ overflowX: 'auto', maxHeight: 300 }}>
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(sheets[activeSheet].rows[0]).map(col => (
                          <th key={col} style={{ background: 'var(--tbl-head)', padding: '7px 10px', fontSize: 9, fontFamily: fontLabel, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', whiteSpace: 'nowrap' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheets[activeSheet].rows.slice(0, 10).map((row, ri) => (
                        <tr key={ri}>
                          {Object.values(row).map((cell, ci) => (
                            <td key={ci} style={{ padding: '6px 10px', fontSize: 11, fontFamily: fontData, color: 'var(--ink-primary)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--divider)' }}>
                              {String(cell ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sheets[activeSheet].rows.length > 10 && (
                    <div style={{ padding: '8px 14px', fontFamily: fontLabel, fontSize: 9, color: 'var(--gold-deep)', letterSpacing: '0.10em' }}>
                      + {sheets[activeSheet].rows.length - 10} registros adicionais
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={handleImport}
              style={{
                background: 'var(--ink-primary)', color: 'var(--on-dark)',
                border: 'none', borderRadius: 999, padding: '11px 24px',
                fontFamily: fontLabel, fontSize: 10, fontWeight: 500,
                letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              Confirmar Importação
            </button>
            <button
              onClick={reset}
              style={{
                background: 'transparent', color: 'var(--ink-secondary)',
                border: '1px solid var(--divider-strong)', borderRadius: 999, padding: '10px 18px',
                fontFamily: fontLabel, fontSize: 10, fontWeight: 500,
                letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <span style={{ fontFamily: fontLabel, fontSize: 9, color: 'var(--gold-deep)', marginLeft: 8, letterSpacing: '0.08em' }}>
              ⚠ Esta operação irá substituir TODOS os dados existentes.
            </span>
          </div>
        </div>
      )}

      {/* ── Importing ── */}
      {status === 'importing' && progress && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
          <div style={{ fontFamily: fontLabel, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--ink-secondary)', marginBottom: 16 }}>
            Importando dados...
          </div>
          <div style={{ background: 'var(--cream-inset)', borderRadius: 999, height: 6, overflow: 'hidden', maxWidth: 320, margin: '0 auto 12px' }}>
            <div style={{
              background: 'var(--gold)', height: '100%', borderRadius: 999,
              width: `${(progress.done / progress.total) * 100}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ fontFamily: fontData, fontSize: 12, color: 'var(--gold-deep)' }}>
            {progress.step} ({progress.done}/{progress.total})
          </div>
        </div>
      )}

      {/* ── Done / Error ── */}
      {(status === 'done' || status === 'error') && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>{status === 'done' ? '✅' : '❌'}</div>
          <div style={{
            fontFamily: fontLabel, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em',
            color: status === 'done' ? 'var(--pos)' : 'var(--neg)', marginBottom: 8,
          }}>
            {status === 'done' ? 'Importação Concluída' : 'Erro na Importação'}
          </div>
          <div style={{ fontFamily: fontBody, fontSize: 13, color: 'var(--ink-secondary)', marginBottom: 20 }}>
            {resultMsg}
          </div>
          <button
            onClick={reset}
            style={{
              background: 'var(--gold-soft)', color: 'var(--ink-secondary)',
              border: '1px solid rgba(58,46,28,0.12)', borderRadius: 999,
              padding: '10px 24px', fontFamily: fontLabel, fontSize: 10,
              fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Nova Importação
          </button>
        </div>
      )}
    </div>
  )
}

// ── Template Download ─────────────────────────────────────────────────
function downloadTemplate() {
  const wb = XLSX.utils.book_new()

  const sheets: Record<string, string[][]> = {
    Atletas: [['ID','Nome','Nome Completo','Posição','Data Nascimento','País Nascimento','Foto Arquivo','Status Contrato','Alocação','Clube Anterior','% SAF','Início Contrato','Fim Contrato','Salário CLT','Direito Imagem','Auxílio Moradia (Mensal)','Auxílio Alimentação (Mensal)','Auxílio Viagem (Anual)','Outros Auxílios (Mensal)','Transfer Fee Total','Transfer Fee Quitado','Transfer Fee Pendente','Transfer Fee Acordo','Moeda Transfer Fee','Valor de Mercado','Moeda Valor Mercado','Multa Internacional','Multa Nacional','Multa Compensatória']],
    Intermediarios: [['Atleta ID','Nome Intermediário','% Venda Futura']],
    Bichos: [['Atleta ID','Competição','Ano','Valor']],
    Pagamentos_Certos: [['Atleta ID','Despesa','Contrato','Parcela','Vencimento','Valor','Moeda','Venc. Antecipado','Parcial (valor)','Moeda Parcial','Status']],
    Pagamentos_Condicionais: [['Atleta ID','Despesa','Contrato','Detalhes Condição','Valor','Moeda','Venc. Antecipado','Vencimento','Parcial','Moeda Parcial','Status']],
    Passivos_Clubes: [['Atleta ID','Contrato','Despesa','Credor','Condicional','Parcela','Vencimento','Valor','Moeda','Parcial','Moeda Parcial','Saldo Moeda Contrato','Saldo BRL','Condição','Venc. Antecipado','Solidariedade','Data Liquidação','Status']],
    Passivos_Intermediarios: [['Atleta ID','Contrato','Despesa','Intermediário','Condicional','Parcela','Vencimento','Valor','Moeda','Parcial','Moeda Parcial','Saldo BRL','Condição','Teor da Multa','Venc. Antecipado','Data Liquidação','Status']],
  }

  for (const [name, data] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), name)
  }

  XLSX.writeFile(wb, 'template_carga_inicial.xlsx')
}
