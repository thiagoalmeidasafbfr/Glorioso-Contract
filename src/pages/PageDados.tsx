// src/pages/PageDados.tsx
// Central de Importação/Exportação — toda parte do sistema tem um MODELO XLSX
// que pode ser baixado (cabeçalhos), exportado (dados atuais) e importado
// (criação em massa). Inclui atletas e vínculos, itens fundamentais.

import { useRef, useState } from 'react'
import {
  fetchAthletes, createAthlete, updateAthlete, wipeAllData,
  fetchAllContracts, createContract,
  fetchAllSalaryTriggers, createSalaryTrigger,
  fetchAllClubLiabilities, createClubLiability,
  fetchAllIntermediaryLiabilities, createIntermediaryLiability,
  fetchAllImageRights, createImageRight,
  fetchAllEconomicRights, createEconomicRight,
  fetchClubs, createClub,
  fetchIntermediaries, createIntermediary,
  fetchAllPJs, createPJ,
} from '../lib/athleteQueries'
import {
  exportWorkbook, parseWorkbookFile, type ColDef,
  COLS_ATHLETES, COLS_CONTRACTS, COLS_SALARY_TRIGGERS, COLS_CLUB_LIABILITIES,
  COLS_INTERMEDIARY_LIABILITIES, COLS_IMAGE_RIGHTS, COLS_ECONOMIC_RIGHTS,
  COLS_CLUBS, COLS_AGENTS, COLS_ATHLETE_PJS,
} from '../lib/xlsx-utils'
import {
  S, orNull, N, Nn, cur, bool, norm, dupKey,
  emptyResult, resultMessage, type ImportResult,
  buildAthleteResolver, resolveAthleteId, type AthleteResolver,
} from '../lib/importHelpers'
import { ATHLETE_CATEGORY_LABELS } from '../types/athlete-system'
import type { AthleteCategory } from '../types/athlete-system'

// Categoria a partir de rótulo ("Profissional") ou enum ("PROFISSIONAL").
function parseCategory(v: unknown): AthleteCategory {
  const s = norm(v)
  for (const [key, label] of Object.entries(ATHLETE_CATEGORY_LABELS)) {
    if (s === norm(key) || s === norm(label)) return key as AthleteCategory
  }
  return 'PROFISSIONAL'
}

const fontBody = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', monospace"

interface Descriptor {
  key: string
  label: string
  cols: ColDef[]
  parent?: string          // texto de ajuda quando precisa de Atleta ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  load: () => Promise<any[]>
  importRows: (rows: Record<string, string>[], ath: AthleteResolver) => Promise<ImportResult>
}

const DESCRIPTORS: Descriptor[] = [
  {
    key: 'Atletas', label: 'Atletas', cols: COLS_ATHLETES,
    load: () => fetchAthletes(),
    importRows: async rows => {
      const res = emptyResult()
      // Dedup por CPF/passaporte quando houver; senão pelo nome completo.
      const existing = await fetchAthletes()
      const byName = new Set(existing.map(a => dupKey(a.full_name)))
      const byDoc = new Set(existing.map(a => a.cpf || a.passport_number).filter(Boolean).map(d => dupKey(d)))
      for (const r of rows) {
        const full = S(r['Nome Completo'])
        if (!full) { res.invalid++; continue }
        const doc = S(r['CPF']) || S(r['Passaporte'])
        if (byName.has(dupKey(full)) || (doc && byDoc.has(dupKey(doc)))) { res.dupSkipped++; continue }
        await createAthlete({
          full_name: full, short_name: S(r['Nome Curto']) || full.split(' ')[0],
          position: orNull(r['Posição']), current_status: (S(r['Status']) || 'ATIVO') as never,
          category: parseCategory(r['Categoria']),
          birth_date: orNull(r['Data Nascimento']), nationality: orNull(r['Nacionalidade']),
          cpf: orNull(r['CPF']), passport_number: orNull(r['Passaporte']),
          agent_name: orNull(r['Agente']), agent_contact: orNull(r['Contato Agente']),
          profile_photo_url: null, notes: orNull(r['Observações']),
        })
        byName.add(dupKey(full)); if (doc) byDoc.add(dupKey(doc)); res.created++
      }
      return res
    },
  },
  {
    key: 'Vinculos', label: 'Vínculos (contratos)', cols: COLS_CONTRACTS, parent: 'Atleta ID',
    load: () => fetchAllContracts(),
    importRows: async (rows, ath) => {
      const res = emptyResult()
      const existing = new Set((await fetchAllContracts()).map(c => dupKey(c.athlete_id, c.counterpart_club, c.start_date)))
      for (const r of rows) {
        const aid = resolveAthleteId(r, ath); if (!aid) { res.noAthlete++; continue }
        const club = S(r['Clube/Contraparte'])
        const start = S(r['Início']) || new Date().toISOString().slice(0, 10)
        const key = dupKey(aid, club, start)
        if (existing.has(key)) { res.dupSkipped++; continue }
        await createContract(aid, {
          type: (S(r['Tipo']) || 'ENTRADA') as never,
          counterpart_club: club, counterpart_country: S(r['País']),
          start_date: start, end_date: S(r['Término']), status: (S(r['Status']) || 'ATIVO') as never,
          transfer_fee_gross: Nn(r['Valor Transferência']), transfer_currency: cur(r['Moeda Transf.']),
          base_salary: Nn(r['Salário Base']), salary_currency: cur(r['Moeda Salário']),
          image_value: Nn(r['Imagem']), other_value: Nn(r['Outros']),
          description: S(r['Descrição']),
        })
        existing.add(key); res.created++
      }
      return res
    },
  },
  {
    key: 'Titularidade', label: 'Detentores (titularidade)', cols: COLS_ECONOMIC_RIGHTS, parent: 'Atleta ID',
    load: () => fetchAllEconomicRights(),
    importRows: async (rows, ath) => {
      const res = emptyResult()
      const existing = new Set((await fetchAllEconomicRights()).map(e => dupKey(e.athlete_id, e.holder_type, e.holder_name, e.percentage)))
      for (const r of rows) {
        const aid = resolveAthleteId(r, ath); if (!aid) { res.noAthlete++; continue }
        const ht = S(r['Tipo Detentor']) || 'TERCEIRO'
        const hn = S(r['Detentor']); const pct = N(r['Percentual'])
        const key = dupKey(aid, ht, hn, pct)
        if (existing.has(key)) { res.dupSkipped++; continue }
        await createEconomicRight(aid, {
          holder_type: ht as never, holder_name: hn, percentage: pct, notes: S(r['Observações']),
        })
        existing.add(key); res.created++
      }
      return res
    },
  },
  {
    key: 'Metas_Salario', label: 'Metas de salário', cols: COLS_SALARY_TRIGGERS, parent: 'Atleta ID',
    load: () => fetchAllSalaryTriggers(),
    importRows: async (rows, ath) => {
      const res = emptyResult()
      const existing = new Set((await fetchAllSalaryTriggers()).map(t => dupKey(t.athlete_id, t.description, t.new_salary)))
      for (const r of rows) {
        const aid = resolveAthleteId(r, ath); if (!aid) { res.noAthlete++; continue }
        const desc = S(r['Descrição']); const sal = N(r['Novo Salário'])
        const key = dupKey(aid, desc, sal)
        if (existing.has(key)) { res.dupSkipped++; continue }
        await createSalaryTrigger(aid, {
          contract_id: orNull(r['Contrato ID']), description: desc,
          metric: (S(r['Métrica']) || 'JOGOS') as never, threshold: Nn(r['Meta (nº)']),
          new_salary: sal, currency: cur(r['Moeda']), notes: S(r['Observações']),
        })
        existing.add(key); res.created++
      }
      return res
    },
  },
  {
    key: 'Passivos_Clubes', label: 'Passivos de clube', cols: COLS_CLUB_LIABILITIES, parent: 'Atleta ID',
    load: () => fetchAllClubLiabilities(),
    importRows: async (rows, ath) => {
      const res = emptyResult()
      const existing = new Set((await fetchAllClubLiabilities()).map(l => dupKey(l.athlete_id, l.club_name, l.description, l.amount)))
      for (const r of rows) {
        const aid = resolveAthleteId(r, ath); if (!aid) { res.noAthlete++; continue }
        const club = S(r['Clube']); const desc = S(r['Descrição']); const amount = N(r['Valor'])
        const key = dupKey(aid, club, desc, amount)
        if (existing.has(key)) { res.dupSkipped++; continue }
        await createClubLiability(aid, {
          club_name: club, description: desc,
          direction: (S(r['Direção']) || 'A_PAGAR') as never, amount, currency: cur(r['Moeda']),
          due_date: orNull(r['Vencimento']), conditional: bool(r['Condicional']), condition_description: S(r['Condição']),
          solidarity: bool(r['Solidariedade']), status: (S(r['Status']) || 'PENDENTE') as never, notes: S(r['Observações']),
        })
        existing.add(key); res.created++
      }
      return res
    },
  },
  {
    key: 'Passivos_Agentes', label: 'Passivos de agentes', cols: COLS_INTERMEDIARY_LIABILITIES, parent: 'Atleta ID',
    load: () => fetchAllIntermediaryLiabilities(),
    importRows: async (rows, ath) => {
      const res = emptyResult()
      const existing = new Set((await fetchAllIntermediaryLiabilities()).map(l => dupKey(l.athlete_id, l.intermediary_name, l.description, l.amount)))
      for (const r of rows) {
        const aid = resolveAthleteId(r, ath); if (!aid) { res.noAthlete++; continue }
        const ag = S(r['Agente']); const desc = S(r['Descrição']); const amount = N(r['Valor'])
        const key = dupKey(aid, ag, desc, amount)
        if (existing.has(key)) { res.dupSkipped++; continue }
        await createIntermediaryLiability(aid, {
          intermediary_name: ag, description: desc,
          direction: (S(r['Direção']) || 'A_PAGAR') as never, amount, currency: cur(r['Moeda']),
          due_date: orNull(r['Vencimento']), conditional: bool(r['Condicional']), condition_description: S(r['Condição']),
          penalty_terms: S(r['Teor Multa']), status: (S(r['Status']) || 'PENDENTE') as never, notes: S(r['Observações']),
        })
        existing.add(key); res.created++
      }
      return res
    },
  },
  {
    key: 'Direito_Imagem', label: 'Direito de imagem', cols: COLS_IMAGE_RIGHTS, parent: 'Atleta ID',
    load: async () => {
      const [imgs, pjs] = await Promise.all([fetchAllImageRights(), fetchAllPJs()])
      const nameById = new Map(pjs.map(p => [p.id, p.legal_name]))
      return imgs.map(i => ({ ...i, pj_name: i.pj_id ? (nameById.get(i.pj_id) ?? '') : '' }))
    },
    importRows: async (rows, ath) => {
      const res = emptyResult()
      const [existingImgs, allPjs] = await Promise.all([fetchAllImageRights(), fetchAllPJs()])
      const existing = new Set(existingImgs.map(i => dupKey(i.athlete_id, i.month)))
      // Índice de PJs por (atleta, razão social) para resolver / criar sob demanda.
      const pjByKey = new Map(allPjs.map(p => [dupKey(p.athlete_id, p.legal_name), p.id]))
      for (const r of rows) {
        const aid = resolveAthleteId(r, ath); if (!aid) { res.noAthlete++; continue }
        const month = S(r['Mês (AAAA-MM)'])
        const key = dupKey(aid, month)
        if (existing.has(key)) { res.dupSkipped++; continue }
        // Resolve/cria a PJ informada.
        let pjId: string | null = null
        const pjName = S(r['PJ (Razão Social)'])
        if (pjName) {
          const pk = dupKey(aid, pjName)
          pjId = pjByKey.get(pk) ?? null
          if (!pjId) { const np = await createPJ(aid, { legal_name: pjName, cnpj: '', notes: '' }); pjId = np.id; pjByKey.set(pk, pjId) }
        }
        await createImageRight(aid, {
          pj_id: pjId, month, amount: N(r['Valor']), currency: cur(r['Moeda']),
          status: (S(r['Status']) || 'PENDENTE') as never, notes: S(r['Observações']),
        })
        existing.add(key); res.created++
      }
      return res
    },
  },
  {
    key: 'PJs', label: 'PJs do atleta', cols: COLS_ATHLETE_PJS, parent: 'Atleta ID',
    load: () => fetchAllPJs(),
    importRows: async (rows, ath) => {
      const res = emptyResult()
      const existing = new Set((await fetchAllPJs()).map(p => dupKey(p.athlete_id, p.legal_name)))
      for (const r of rows) {
        const aid = resolveAthleteId(r, ath); if (!aid) { res.noAthlete++; continue }
        const legal = S(r['Razão Social']); if (!legal) { res.invalid++; continue }
        const key = dupKey(aid, legal)
        if (existing.has(key)) { res.dupSkipped++; continue }
        await createPJ(aid, { legal_name: legal, cnpj: S(r['CNPJ']), notes: S(r['Observações']) })
        existing.add(key); res.created++
      }
      return res
    },
  },
  {
    key: 'Clubes', label: 'Clubes (cadastro)', cols: COLS_CLUBS,
    load: () => fetchClubs(),
    importRows: async rows => {
      const res = emptyResult()
      const existing = new Set((await fetchClubs()).map(c => dupKey(c.name)))
      for (const r of rows) {
        const name = S(r['Nome']); if (!name) { res.invalid++; continue }
        if (existing.has(dupKey(name))) { res.dupSkipped++; continue }
        await createClub({ name, country: S(r['País']), logo_url: null, notes: S(r['Observações']) })
        existing.add(dupKey(name)); res.created++
      }
      return res
    },
  },
  {
    key: 'Agentes', label: 'Agentes (cadastro)', cols: COLS_AGENTS,
    load: () => fetchIntermediaries(),
    importRows: async rows => {
      const res = emptyResult()
      const existing = new Set((await fetchIntermediaries()).map(i => dupKey(i.name)))
      for (const r of rows) {
        const name = S(r['Nome']); if (!name) { res.invalid++; continue }
        if (existing.has(dupKey(name))) { res.dupSkipped++; continue }
        await createIntermediary({ name, contact: S(r['Contato']), logo_url: null, notes: S(r['Observações']) })
        existing.add(dupKey(name)); res.created++
      }
      return res
    },
  },
]

export default function PageDados() {
  const [msg, setMsg] = useState<{ key: string; text: string; ok: boolean } | null>(null)
  const [wiping, setWiping] = useState(false)
  const [banner, setBanner] = useState<{ text: string; ok: boolean } | null>(null)

  async function wipeAll() {
    // Dupla confirmação — operação destrutiva e irreversível.
    if (!window.confirm('APAGAR TODA A BASE?\n\nIsto remove TODOS os atletas, vínculos, cláusulas, passivos, imagem, PJs, clubes e agentes. Não há como desfazer.\n\nRecomendado exportar a base antes.')) return
    const typed = window.prompt('Para confirmar, digite APAGAR (em maiúsculas):')
    if (typed !== 'APAGAR') { setBanner({ text: 'Cancelado — nada foi apagado.', ok: true }); return }
    setWiping(true); setBanner(null)
    try {
      await wipeAllData()
      setBanner({ text: 'Base apagada com sucesso.', ok: true })
    } catch (err) {
      setBanner({ text: `Erro ao apagar: ${(err as Error).message}`, ok: false })
    } finally { setWiping(false) }
  }

  // Preenche a coluna "Nome do Atleta" nas abas-filhas, para o arquivo já sair
  // editável por nome (sem precisar mexer nos UUIDs).
  async function enrich(d: Descriptor, rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    if (!d.cols.some(c => c.key === 'athlete_name')) return rows
    const nameById = new Map((await fetchAthletes()).map(a => [a.id, a.full_name || a.short_name]))
    return rows.map(r => ({ ...r, athlete_name: nameById.get(String((r as { athlete_id?: string }).athlete_id ?? '')) ?? '' }))
  }

  function downloadTemplate(d: Descriptor) {
    exportWorkbook([{ name: d.key.slice(0, 28), cols: d.cols, rows: [] }], `modelo-${d.key.toLowerCase()}.xlsx`)
  }
  async function exportData(d: Descriptor) {
    const rows = await enrich(d, await d.load())
    exportWorkbook([{ name: d.key.slice(0, 28), cols: d.cols, rows }], `${d.key.toLowerCase()}.xlsx`)
  }

  function exportAll() {
    Promise.all(DESCRIPTORS.map(async d => ({ name: d.key.slice(0, 28), cols: d.cols, rows: await enrich(d, await d.load()) })))
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={exportAll}
            style={{ padding: '9px 18px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: fontBody, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ↓ Exportar toda a base
          </button>
          <button onClick={wipeAll} disabled={wiping}
            style={{ padding: '9px 18px', background: 'transparent', border: '1px solid var(--neg)', borderRadius: 8, color: 'var(--neg)', fontFamily: fontBody, fontSize: 13, fontWeight: 600, cursor: wiping ? 'wait' : 'pointer' }}>
            {wiping ? 'Apagando...' : '🗑 Apagar toda a base'}
          </button>
        </div>
      </div>

      {banner && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontFamily: fontBody, background: banner.ok ? 'var(--pos-tint)' : 'var(--neg-tint)', color: banner.ok ? 'var(--pos)' : 'var(--neg)', border: `1px solid ${banner.ok ? 'var(--pos)' : 'var(--neg)'}` }}>
          {banner.text}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: fontBody, marginBottom: 18, maxWidth: 820 }}>
        Cada bloco tem um <strong>modelo</strong> (planilha em branco com as colunas), <strong>exportar</strong> (dados atuais) e <strong>importar</strong>. Nas abas-filhas basta preencher a coluna
        <span style={{ fontFamily: fontMono, fontSize: 11 }}> Nome do Atleta</span> com o nome completo — não precisa do ID. O
        <span style={{ fontFamily: fontMono, fontSize: 11 }}> Atleta ID</span> é opcional (tem prioridade quando informado). Clubes e credores também são por nome. A importação ignora duplicados.
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

      {/* Importar fotos por nome (aceita JSON exportado do painel: name/fullName + foto) */}
      <PhotoImportCard />
    </div>
  )
}

function PhotoImportCard() {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (e.target) e.target.value = ''
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const list: { name?: string; fullName?: string; foto?: string }[] = Array.isArray(parsed) ? parsed : (parsed.athletes ?? [])
      const resolver = buildAthleteResolver(await fetchAthletes())
      let updated = 0, notFound = 0, noPhoto = 0
      for (const it of list) {
        const foto = S(it.foto)
        if (!foto) { noPhoto++; continue }
        const id = resolver.byName.get(norm(it.fullName)) ?? resolver.byName.get(norm(it.name))
        if (!id) { notFound++; continue }
        await updateAthlete(id, { profile_photo_url: foto })
        updated++
      }
      const parts = [`${updated} foto(s) aplicada(s)`]
      if (notFound) parts.push(`${notFound} sem atleta correspondente`)
      if (noPhoto) parts.push(`${noPhoto} sem foto`)
      setMsg({ text: parts.join(' · '), ok: true })
    } catch (err) {
      setMsg({ text: `Erro: ${(err as Error).message}`, ok: false })
    } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ padding: 18, marginTop: 14 }}>
      <div style={{ fontFamily: fontBody, fontSize: 15, fontWeight: 600, color: 'var(--ink-primary)', marginBottom: 2 }}>Fotos dos atletas (por nome)</div>
      <div style={{ fontFamily: fontBody, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, maxWidth: 720 }}>
        Importe um arquivo <span style={{ fontFamily: fontMono, fontSize: 11 }}>.json</span> com <span style={{ fontFamily: fontMono, fontSize: 11 }}>{'[{ "fullName": "...", "foto": "URL ou base64" }]'}</span>.
        As fotos são casadas pelo nome do atleta e aplicadas aos já cadastrados (aceita URL ou imagem embutida).
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => ref.current?.click()} disabled={busy} style={btn('solid')}>{busy ? 'Aplicando...' : 'Importar fotos (.json)'}</button>
        <input ref={ref} type="file" accept=".json,application/json" onChange={handle} style={{ display: 'none' }} />
        {msg && <span style={{ fontSize: 12, fontFamily: fontBody, color: msg.ok ? 'var(--pos)' : 'var(--neg)' }}>{msg.text}</span>}
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
      const resolver = buildAthleteResolver(await fetchAthletes())
      const res = await d.importRows(rows, resolver)
      onDone(resultMessage(res), true)
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
