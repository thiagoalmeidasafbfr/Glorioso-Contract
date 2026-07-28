// src/components/modals/RenegotiationEditModal.tsx
// Editar e DESFAZER uma renegociação. Desfazer é reversível de verdade: cada
// parcela/obrigação de origem volta a PENDENTE (perdendo a nota de rastreio) e o
// acordo com o novo fluxo é apagado. Também é possível soltar UM item de origem
// (ele volta ao normal e sai do acordo) sem desfazer tudo.

import { useEffect, useState } from 'react'
import type { Clause, Currency } from '../../types/athlete-system'
import {
  decodeAcordo, updateRenegotiation, revertRenegotiation, removeAcordoSource,
  checkRenegotiation, type RevertCheck,
} from '../../lib/renegotiation'
import { fmtCurrencyShort, fmtDate } from '../../lib/format'
import { IconButton } from '../Icon'
import { ModalShell } from './EditModals'
import { modalInput, modalLabel } from './styles'

const font = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"
const CUR: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']

export default function RenegotiationEditModal({ acordo, onClose, onSaved, onDeleted }: {
  acordo: Clause
  onClose: () => void
  onSaved: () => void
  /** Chamado após desfazer (o acordo deixou de existir). */
  onDeleted: () => void
}) {
  const meta = decodeAcordo(acordo.notes)
  const [creditor, setCreditor] = useState(meta?.creditor ?? acordo.creditor_party ?? '')
  const [debtor, setDebtor] = useState(meta?.debtor ?? acordo.debtor_party ?? '')
  const [currency, setCurrency] = useState<string>(meta?.currency ?? acordo.currency)
  const [note, setNote] = useState(meta?.userNote ?? acordo.condition_description ?? '')
  const [check, setCheck] = useState<RevertCheck | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    checkRenegotiation(acordo).then(c => { if (alive) setCheck(c) })
    return () => { alive = false }
  }, [acordo])

  async function save() {
    setSaving(true); setError(null)
    try {
      await updateRenegotiation(acordo, { creditor, debtor, currency: currency as Currency, userNote: note })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function undo() {
    const paid = check?.paidInNewFlow ?? 0
    const msg = paid > 0
      ? `Este acordo já tem ${paid} parcela(s) paga(s) no novo fluxo. Desfazer vai APAGAR o acordo (inclusive esses pagamentos) e devolver as parcelas originais ao estado em aberto. Continuar?`
      : 'Desfazer a renegociação? As parcelas/obrigações originais voltam ao estado em aberto e o acordo é apagado.'
    if (!window.confirm(msg)) return
    setSaving(true); setError(null)
    try {
      await revertRenegotiation(acordo)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao desfazer')
    } finally { setSaving(false) }
  }

  async function releaseSource(index: number, label: string) {
    if (!window.confirm(`Soltar "${label}" deste acordo? O item volta ao estado em aberto e sai da renegociação.`)) return
    setSaving(true); setError(null)
    try {
      await removeAcordoSource(acordo, index)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao soltar o item')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title="Editar renegociação" width={660} onClose={onClose}
      subtitle={meta ? `acordado em ${fmtDate(meta.createdAt)} · ${meta.installmentsCount}x` : acordo.description}
      footer={<>
        <button onClick={undo} className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={saving}>
          Desfazer renegociação
        </button>
        {error && <span style={{ color: 'var(--neg)', fontSize: 12, fontFamily: font }}>{error}</span>}
        <button onClick={onClose} className="btn btn-outline">Cancelar</button>
        <button onClick={save} className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </>}>

      {meta && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {[
            ['Dívida original', fmtCurrencyShort(meta.originalTotal, meta.currency)],
            ['Novo total', fmtCurrencyShort(meta.newTotal, meta.currency)],
            [meta.discount < 0 ? 'Acréscimo' : 'Desconto',
              meta.discount ? fmtCurrencyShort(Math.abs(meta.discount), meta.currency) : '—'],
            ['Pagas no acordo', check ? `${check.paidInNewFlow}/${check.totalInNewFlow}` : '…'],
          ].map(([l, v]) => (
            <div key={l} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider)' }}>
              <div style={{ fontSize: 9, fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: mono, color: 'var(--ink-primary)' }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={modalLabel}>Credor</label><input style={modalInput} value={creditor} onChange={e => setCreditor(e.target.value)} /></div>
        <div><label style={modalLabel}>Devedor</label><input style={modalInput} value={debtor} onChange={e => setDebtor(e.target.value)} /></div>
        <div><label style={modalLabel}>Moeda</label>
          <select style={modalInput} value={currency} onChange={e => setCurrency(e.target.value)}>
            {CUR.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div><label style={modalLabel}>Observações do acordo</label>
        <textarea style={{ ...modalInput, minHeight: 52, resize: 'vertical' }} value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {/* Itens de origem — cada um pode ser solto de volta ao normal */}
      <div>
        <label style={modalLabel}>Itens renegociados ({meta?.sources.length ?? 0})</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
          {(meta?.sources ?? []).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
              <span style={{ flex: 1, fontSize: 11.5, fontFamily: font, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              <span style={{ fontSize: 11.5, fontFamily: mono, fontWeight: 600 }}>{fmtCurrencyShort(s.value, meta?.currency ?? 'BRL')}</span>
              <IconButton icon="undo" label={`Soltar "${s.label}" do acordo`} tone="warn" small
                onClick={() => releaseSource(i, s.label)} />
            </div>
          ))}
          {(!meta || meta.sources.length === 0) && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>Sem itens de origem registrados.</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: font }}>
        Para mudar os vencimentos e valores do novo fluxo, use o ícone de <strong>parcelas</strong> na linha do acordo.
      </div>

      {meta && meta.discount < 0 && (
        <div style={{ fontSize: 11.5, fontFamily: font, color: 'var(--warn)', padding: '9px 12px', borderRadius: 8, background: 'var(--warn-tint)', border: '1px solid rgba(160,110,20,0.22)' }}>
          O novo fluxo ({fmtCurrencyShort(meta.newTotal, meta.currency)}) está <strong>maior</strong> que a dívida de
          origem que restou no acordo ({fmtCurrencyShort(meta.originalTotal, meta.currency)}) — normalmente porque um
          item foi solto do acordo. Ajuste as parcelas do novo fluxo pelo ícone de <strong>parcelas</strong>.
        </div>
      )}
    </ModalShell>
  )
}
