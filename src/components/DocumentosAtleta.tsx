// src/components/DocumentosAtleta.tsx
// Documentos do atleta (migration 024): PDF/imagens de contratos e aditivos no
// bucket privado `documentos` + linha em ac_documentos. Download por URL
// assinada (5 min). Upload/exclusão: master e jurídico (RLS + policy do bucket).

import { useEffect, useRef, useState } from 'react'
import { USE_SUPABASE } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './toast-context'
import { useConfirm } from './confirm-context'
import {
  fetchDocumentos, uploadDocumento, urlDocumento, deleteDocumento, mensagemErro,
} from '../lib/governanca'
import { TIPO_DOCUMENTO_LABELS, type Documento, type TipoDocumento } from '../types/governanca'
import { CONTRACT_TYPE_LABELS, type Contract } from '../types/athlete-system'
import { fmtDate } from '../lib/format'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'
const ACCEPT = 'application/pdf,image/*'
const MAX_BYTES = 20 * 1024 * 1024

const lbl: React.CSSProperties = { fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontFamily: font, fontSize: 13 }

function fmtSize(n: number | null): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function DocumentosAtleta({ athleteId, contracts }: { athleteId: string; contracts: Contract[] }) {
  const { can } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const podeGerenciar = can('gerenciarDocumentos')
  const [docs, setDocs] = useState<Documento[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [tipo, setTipo] = useState<TipoDocumento>('CONTRATO')
  const [contratoId, setContratoId] = useState<string>('')
  const [descricao, setDescricao] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!USE_SUPABASE) return
    let alive = true
    fetchDocumentos(athleteId)
      .then(d => { if (alive) { setDocs(d); setErr(null) } })
      .catch(e => { if (alive) setErr(mensagemErro(e)) })
    return () => { alive = false }
  }, [athleteId, reload])

  const contractName = (id: string | null) => {
    if (!id) return 'Geral'
    const c = contracts.find(x => x.id === id)
    return c ? `${CONTRACT_TYPE_LABELS[c.type]} · ${c.counterpart_club || '—'}` : 'Contrato removido'
  }

  async function handleUpload() {
    if (!file) return
    if (file.size > MAX_BYTES) { toast.error('Arquivo acima de 20 MB.'); return }
    setBusy(true)
    try {
      await uploadDocumento({ atletaId: athleteId, contratoId: contratoId || null, tipo, descricao, file })
      setFile(null); setDescricao('')
      if (fileRef.current) fileRef.current.value = ''
      setReload(n => n + 1)
    } catch (e) { toast.error('Falha no upload.', { detail: mensagemErro(e) }) } finally { setBusy(false) }
  }
  async function handleOpen(d: Documento) {
    // Abre a aba ANTES do await (senão o bloqueador de pop-up barra).
    const w = window.open('', '_blank')
    try {
      const url = await urlDocumento(d)
      if (w) w.location.replace(url); else window.location.assign(url)
    } catch (e) { w?.close(); toast.error('Não foi possível abrir o documento.', { detail: mensagemErro(e) }) }
  }
  async function handleDelete(d: Documento) {
    if (!await confirm({ title: 'Excluir documento?', message: `"${d.nome_arquivo}" será removido do armazenamento. Esta ação não pode ser desfeita.`, danger: true })) return
    try { await deleteDocumento(d); setReload(n => n + 1); toast.success('Documento excluído.') } catch (e) { toast.error('Não foi possível excluir o documento.', { detail: mensagemErro(e) }) }
  }

  if (!USE_SUPABASE) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', fontFamily: font, color: 'var(--text-muted)', fontSize: 14 }}>
        Upload disponível apenas com Supabase. No modo local os documentos (PDF de contratos e aditivos) não são armazenados.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {podeGerenciar && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Enviar documento</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
            <div>
              <label htmlFor="doc-file" style={lbl}>Arquivo (PDF ou imagem)</label>
              <input id="doc-file" ref={fileRef} type="file" accept={ACCEPT} onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ ...inp, padding: 5 }} />
            </div>
            <div>
              <label htmlFor="doc-tipo" style={lbl}>Tipo</label>
              <select id="doc-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoDocumento)} style={inp}>
                {(Object.keys(TIPO_DOCUMENTO_LABELS) as TipoDocumento[]).map(t => <option key={t} value={t}>{TIPO_DOCUMENTO_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="doc-contrato" style={lbl}>Contrato (opcional)</label>
              <select id="doc-contrato" value={contratoId} onChange={e => setContratoId(e.target.value)} style={inp}>
                <option value="">Geral (sem contrato)</option>
                {contracts.map(c => <option key={c.id} value={c.id}>{CONTRACT_TYPE_LABELS[c.type]} · {c.counterpart_club || '—'} · {fmtDate(c.start_date)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="doc-desc" style={lbl}>Descrição</label>
              <input id="doc-desc" type="text" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: contrato assinado" style={inp} />
            </div>
            <div>
              <button className="btn btn-primary" onClick={handleUpload} disabled={!file || busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {err ? (
          <div role="alert" style={{ padding: 20, color: 'var(--neg)', fontFamily: font, fontSize: 13 }}>Não foi possível carregar os documentos: {err}</div>
        ) : docs === null ? (
          <div role="status" style={{ padding: 20, color: 'var(--text-muted)', fontFamily: font, fontSize: 13 }}>Carregando…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Arquivo</th>
                <th style={{ textAlign: 'left' }}>Tipo</th>
                <th style={{ textAlign: 'left' }}>Contrato</th>
                <th style={{ textAlign: 'left' }}>Descrição</th>
                <th style={{ textAlign: 'right' }}>Tamanho</th>
                <th style={{ textAlign: 'left' }}>Enviado em</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Nenhum documento enviado para este atleta.</td></tr>
              )}
              {docs.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.nome_arquivo}</td>
                  <td>{d.tipo ? TIPO_DOCUMENTO_LABELS[d.tipo] : '—'}</td>
                  <td>{contractName(d.contrato_id)}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{d.descricao || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: mono }}>{fmtSize(d.tamanho_bytes)}</td>
                  <td style={{ fontFamily: mono }}>{new Date(d.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => handleOpen(d)}>Abrir</button>
                    {podeGerenciar && <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} onClick={() => handleDelete(d)}>Excluir</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
