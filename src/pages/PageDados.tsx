// src/pages/PageDados.tsx
// Central de Importação/Exportação — toda parte do sistema tem um MODELO XLSX
// que pode ser baixado (cabeçalhos), exportado (dados atuais) e importado
// (criação em massa). Inclui atletas e vínculos, itens fundamentais.

import { useRef, useState } from 'react'
import {
  fetchAthletes, createAthlete,
  fetchAllContracts, createContract,
  fetchAllSalaryTriggers, createSalaryTrigger,
  fetchAllClubLiabilities, createClubLiability,
  fetchAllIntermediaryLiabilities, createIntermediaryLiability,
  fetchAllImageRights, createImageRight,
  fetchAllEconomicRights, createEconomicRight,
  fetchClubs, createClub,
  fetchIntermediaries, createIntermediary,
} from '../lib/athleteQueries'
import {
  exportWorkbook, parseWorkbookFile, type ColDef,
  COLS_ATHLETES, COLS_CONTRACTS, COLS_SALARY_TRIGGERS, COLS_CLUB_LIABILITIES,
  COLS_INTERMEDIARY_LIABILITIES, COLS_IMAGE_RIGHTS, COLS_ECONOMIC_RIGHTS,
  COLS_CLUBS, COLS_AGENTS,
} from '../lib/xlsx-utils'
import type { Currency } from '../types/athlete-system'

const fontBody = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', monospace"

// Helpers de parsing
const S = (v: unknown) => String(v ?? '').trim()
const orNull = (v: unknown) => { const s = S(v); return s === '' ? null : s }
const N = (v: unknown): number => { const n = Number(S(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n }
const Nn = (v: unknown): number | null => { const s = S(v); if (s === '') return null; return N(v) }
const cur = (v: unknown): Currency => { const s = S(v).toUpperCase(); return (['BRL', 'EUR', 'USD', 'GBP'].includes(s) ? s : 'BRL') as Currency }
const bool = (v: unknown) => ['TRUE', '1', 'SIM', 'S'].includes(S(v).toUpperCase())

interface Descriptor {
  key: string
  label: string
  cols: ColDef[]
  parent?: string          // texto de ajuda quando precisa de Atleta ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  load: () => Promise<any[]>
  importRows: (rows: Record<string, string>[]) => Promise<number>
}

const DESCRIPTORS: Descriptor[] = [
  {
    key: 'Atletas', label: 'Atletas', cols: COLS_ATHLETES,
    load: () => fetchAthletes(),
    importRows: async rows => {
      let n = 0
      for (const r of rows) {
        const full = S(r['Nome Completo'])
        if (!full) continue
        await createAthlete({
          full_name: full, short_name: S(r['Nome Curto']) || full.split(' ')[0],
          position: orNull(r['Posição']), current_status: (S(r['Status']) || 'ATIVO') as never,
          birth_date: orNull(r['Data Nascimento']), nationality: orNull(r['Nacionalidade']),
          cpf: orNull(r['CPF']), passport_number: orNull(r['Passaporte']),
          agent_name: orNull(r['Agente']), agent_contact: orNull(r['Contato Agente']),
          profile_photo_url: null, notes: orNull(r['Observações']),
        })
        n++
      }
      return n
    },
  },
  {
    key: 'Vinculos', label: 'Vínculos (contratos)', cols: COLS_CONTRACTS, parent: 'Atleta ID',
    load: () => fetchAllContracts(),
    importRows: async rows => {
      let n = 0
      for (const r of rows) {
        const aid = S(r['Atleta ID']); if (!aid) continue
        await createContract(aid, {
          type: (S(r['Tipo']) || 'ENTRADA') as never,
          counterpart_club: S(r['Clube/Contraparte']), counterpart_country: S(r['País']),
          start_date: S(r['Início']) || new Date().toISOString().slice(0, 10),
          end_date: S(r['Término']), status: (S(r['Status']) || 'ATIVO') as never,
          transfer_fee_gross: Nn(r['Valor Transferência']), transfer_currency: cur(r['Moeda Transf.']),
          base_salary: Nn(r['Salário Base']), salary_currency: cur(r['Moeda Salário']),
          description: S(r['Descrição']),
        })
        n++
      }
      return n
    },
  },
  {
    key: 'Titularidade', label: 'Titularidade econômica', cols: COLS_ECONOMIC_RIGHTS, parent: 'Atleta ID',
    load: () => fetchAllEconomicRights(),
    importRows: async rows => {
      let n = 0
      for (const r of rows) {
        const aid = S(r['Atleta ID']); if (!aid) continue
        await createEconomicRight(aid, {
          holder_type: (S(r['Tipo Detentor']) || 'TERCEIRO') as never,
          holder_name: S(r['Detentor']), percentage: N(r['Percentual']), notes: S(r['Observações']),
        })
        n++
      }
      return n
    },
  },
  {
    key: 'Metas_Salario', label: 'Metas de salário', cols: COLS_SALARY_TRIGGERS, parent: 'Atleta ID',
    load: () => fetchAllSalaryTriggers(),
    importRows: async rows => {
      let n = 0
      for (const r of rows) {
        const aid = S(r['Atleta ID']); if (!aid) continue
        await createSalaryTrigger(aid, {
          contract_id: orNull(r['Contrato ID']), description: S(r['Descrição']),
          metric: (S(r['Métrica']) || 'JOGOS') as never, threshold: Nn(r['Meta (nº)']),
          new_salary: N(r['Novo Salário']), currency: cur(r['Moeda']), notes: S(r['Observações']),
        })
        n++
      }
      return n
    },
  },
  {
    key: 'Passivos_Clubes', label: 'Passivos de clube', cols: COLS_CLUB_LIABILITIES, parent: 'Atleta ID',
    load: () => fetchAllClubLiabilities(),
    importRows: async rows => {
      let n = 0
      for (const r of rows) {
        const aid = S(r['Atleta ID']); if (!aid) continue
        await createClubLiability(aid, {
          club_name: S(r['Clube']), description: S(r['Descrição']),
          direction: (S(r['Direção']) || 'A_PAGAR') as never, amount: N(r['Valor']), currency: cur(r['Moeda']),
          due_date: orNull(r['Vencimento']), conditional: bool(r['Condicional']), condition_description: S(r['Condição']),
          solidarity: bool(r['Solidariedade']), status: (S(r['Status']) || 'PENDENTE') as never, notes: S(r['Observações']),
        })
        n++
      }
      return n
    },
  },
  {
    key: 'Passivos_Agentes', label: 'Passivos de agentes', cols: COLS_INTERMEDIARY_LIABILITIES, parent: 'Atleta ID',
    load: () => fetchAllIntermediaryLiabilities(),
    importRows: async rows => {
      let n = 0
      for (const r of rows) {
        const aid = S(r['Atleta ID']); if (!aid) continue
        await createIntermediaryLiability(aid, {
          intermediary_name: S(r['Agente']), description: S(r['Descrição']),
          direction: (S(r['Direção']) || 'A_PAGAR') as never, amount: N(r['Valor']), currency: cur(r['Moeda']),
          due_date: orNull(r['Vencimento']), conditional: bool(r['Condicional']), condition_description: S(r['Condição']),
          penalty_terms: S(r['Teor Multa']), status: (S(r['Status']) || 'PENDENTE') as never, notes: S(r['Observações']),
        })
        n++
      }
      return n
    },
  },
  {
    key: 'Direito_Imagem', label: 'Direito de imagem', cols: COLS_IMAGE_RIGHTS, parent: 'Atleta ID',
    load: () => fetchAllImageRights(),
    importRows: async rows => {
      let n = 0
      for (const r of rows) {
        const aid = S(r['Atleta ID']); if (!aid) continue
        await createImageRight(aid, {
          month: S(r['Mês (AAAA-MM)']), amount: N(r['Valor']), currency: cur(r['Moeda']),
          status: (S(r['Status']) || 'PENDENTE') as never, notes: S(r['Observações']),
        })
        n++
      }
      return n
    },
  },
  {
    key: 'Clubes', label: 'Clubes (cadastro)', cols: COLS_CLUBS,
    load: () => fetchClubs(),
    importRows: async rows => {
      let n = 0
      for (const r of rows) {
        const name = S(r['Nome']); if (!name) continue
        await createClub({ name, country: S(r['País']), logo_url: null, notes: S(r['Observações']) })
        n++
      }
      return n
    },
  },
  {
    key: 'Agentes', label: 'Agentes (cadastro)', cols: COLS_AGENTS,
    load: () => fetchIntermediaries(),
    importRows: async rows => {
      let n = 0
      for (const r of rows) {
        const name = S(r['Nome']); if (!name) continue
        await createIntermediary({ name, contact: S(r['Contato']), logo_url: null, notes: S(r['Observações']) })
        n++
      }
      return n
    },
  },
]

export default function PageDados() {
  const [msg, setMsg] = useState<{ key: string; text: string; ok: boolean } | null>(null)

  function downloadTemplate(d: Descriptor) {
    exportWorkbook([{ name: d.key.slice(0, 28), cols: d.cols, rows: [] }], `modelo-${d.key.toLowerCase()}.xlsx`)
  }
  async function exportData(d: Descriptor) {
    const rows = await d.load()
    exportWorkbook([{ name: d.key.slice(0, 28), cols: d.cols, rows }], `${d.key.toLowerCase()}.xlsx`)
  }

  function exportAll() {
    Promise.all(DESCRIPTORS.map(async d => ({ name: d.key.slice(0, 28), cols: d.cols, rows: await d.load() })))
      .then(sheets => exportWorkbook(sheets, 'glorioso-tudo.xlsx'))
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <div style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 6 }}>Importar / Exportar</div>
          <h1 style={{ fontFamily: fontBody, fontSize: 24, fontWeight: 700, color: 'var(--ink-primary)', margin: 0 }}>Dados & Modelos</h1>
          <div style={{ height: 2, width: 38, background: 'var(--gold)', borderRadius: 2, marginTop: 8 }} />
        </div>
        <button onClick={exportAll}
          style={{ padding: '9px 18px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: fontBody, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Exportar tudo (1 arquivo)
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: fontBody, marginBottom: 18, maxWidth: 760 }}>
        Cada bloco tem um <strong>modelo</strong> (planilha em branco com as colunas), <strong>exportar</strong> (dados atuais) e <strong>importar</strong>. Onde há
        <span style={{ fontFamily: fontMono, fontSize: 11 }}> Atleta ID</span>, preencha com o ID do atleta (exporte a aba Atletas para obter os IDs).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {DESCRIPTORS.map(d => (
          <div key={d.key} className="card" style={{ padding: 18 }}>
            <div style={{ fontFamily: fontBody, fontSize: 15, fontWeight: 600, color: 'var(--ink-primary)', marginBottom: 2 }}>{d.label}</div>
            <div style={{ fontFamily: fontMono, fontSize: 10, color: 'var(--text-muted)', marginBottom: 14 }}>
              {d.cols.length} colunas{d.parent ? ` · requer ${d.parent}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => downloadTemplate(d)} style={btn('outline')}>Baixar modelo</button>
              <button onClick={() => exportData(d)} style={btn('outline')}>Exportar</button>
              <ImportButton onDone={(text, ok) => setMsg({ key: d.key, text, ok })} d={d} />
            </div>
            {msg?.key === d.key && (
              <div style={{ marginTop: 10, fontSize: 12, fontFamily: fontBody, color: msg.ok ? 'var(--pos)' : 'var(--neg)' }}>{msg.text}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ImportButton({ d, onDone }: { d: Descriptor; onDone: (text: string, ok: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (e.target) e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const sheets = await parseWorkbookFile(file)
      const rows = sheets[d.key] ?? sheets[Object.keys(sheets)[0]] ?? []
      const n = await d.importRows(rows)
      onDone(`${n} registro(s) importado(s).`, true)
    } catch (err) {
      onDone(`Erro: ${(err as Error).message}`, false)
    } finally { setBusy(false) }
  }
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={busy} style={btn('solid')}>{busy ? 'Importando...' : 'Importar'}</button>
      <input ref={ref} type="file" accept=".xlsx,.xls" onChange={handle} style={{ display: 'none' }} />
    </>
  )
}

function btn(kind: 'solid' | 'outline'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 7, fontFamily: fontBody, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  }
  return kind === 'solid'
    ? { ...base, background: 'var(--gold-tint)', border: '1px solid rgba(190,140,74,0.40)', color: '#be8c4a' }
    : { ...base, background: 'transparent', border: '1px solid var(--divider-strong)', color: 'var(--text-secondary)' }
}
