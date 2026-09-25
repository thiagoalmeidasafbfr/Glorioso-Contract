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
import { tr, trf, trn, trParts } from '../../i18n'

const font = "var(--font-body)"
const mono = "var(--font-label)"
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
      ? trn(paid,
        'Este acordo já tem {0} parcela paga no novo fluxo. Desfazer vai APAGAR o acordo (inclusive esse pagamento) e devolver as parcelas originais ao estado em aberto. Continuar?',
        'Este acordo já tem {0} parcelas pagas no novo fluxo. Desfazer vai APAGAR o acordo (inclusive esses pagamentos) e devolver as parcelas originais ao estado em aberto. Continuar?')
      : tr('Desfazer a renegociação? As parcelas/obrigações originais voltam ao estado em aberto e o acordo é apagado.')
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
    if (!window.confirm(trf('Soltar "{0}" deste acordo? O item volta ao estado em aberto e sai da renegociação.', label))) return
    setSaving(true); setError(null)
    try {
      await removeAcordoSource(acordo, index)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao soltar o item')
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title={tr('Editar renegociação')} width={660} onClose={onClose}
      subtitle={meta ? trf('acordado em {0} · {1}x', fmtDate(meta.createdAt), meta.installmentsCount) : tr(acordo.description)}
      footer={<>
        <button onClick={undo} className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={saving}>
          {tr('Desfazer renegociação')}
        </button>
        {error && <span style={{ color: 'var(--neg)', fontSize: 12, fontFamily: font }}>{tr(error)}</span>}
        <button onClick={onClose} className="btn btn-outline">{tr('Cancelar')}</button>
        <button onClick={save} className="btn btn-primary" disabled={saving}>{saving ? tr('Salvando…') : tr('Salvar')}</button>
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
            <div key={l} style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-subtle)' }}>
              <div style={{ fontSize: 10, fontFamily: mono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{tr(l)}</div>
              <div style={{ fontSize: 'var(--ui-text-size)', fontWeight: 500, fontFamily: mono, color: 'var(--ink-primary)' }}>{tr(v)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={modalLabel}>{tr('Credor')}</label><input style={modalInput} value={creditor} onChange={e => setCreditor(e.target.value)} /></div>
        <div><label style={modalLabel}>{tr('Devedor')}</label><input style={modalInput} value={debtor} onChange={e => setDebtor(e.target.value)} /></div>
        <div><label style={modalLabel}>{tr('Moeda')}</label>
          <select style={modalInput} value={currency} onChange={e => setCurrency(e.target.value)}>
            {CUR.map(c => <option key={c} value={c}>{tr(c)}</option>)}
          </select>
        </div>
      </div>
      <div><label style={modalLabel}>{tr('Observações do acordo')}</label>
        <textarea style={{ ...modalInput, minHeight: 52, resize: 'vertical' }} value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {/* Itens de origem — cada um pode ser solto de volta ao normal */}
      <div>
        <label style={modalLabel}>{tr('Itens renegociados (')}{meta?.sources.length ?? 0})</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
          {(meta?.sources ?? []).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)' }}>
              <span style={{ flex: 1, fontSize: 12, fontFamily: font, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trParts(s.label)}</span>
              <span style={{ fontSize: 12, fontFamily: mono, fontWeight: 500 }}>{fmtCurrencyShort(s.value, meta?.currency ?? 'BRL')}</span>
              <IconButton icon="undo" label={trf('Soltar "{0}" do acordo', trParts(s.label))} tone="warn" small
                onClick={() => releaseSource(i, trParts(s.label))} />
            </div>
          ))}
          {(!meta || meta.sources.length === 0) && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: font }}>{tr('Sem itens de origem registrados.')}</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: font }}>
        {tr('Para mudar os vencimentos e valores do novo fluxo, use o ícone de')} <strong>{tr('parcelas')}</strong> {tr('na linha do acordo.')}
      </div>

      {meta && meta.discount < 0 && (
        <div style={{ fontSize: 12, fontFamily: font, color: 'var(--warn)', padding: '10px 12px', borderRadius: 'var(--radius-control)', background: 'var(--surface-warning-soft)' }}>
          {tr('O novo fluxo (')}{fmtCurrencyShort(meta.newTotal, meta.currency)}{tr(') está')} <strong>{tr('maior')}</strong> {tr('que a dívida de origem que restou no acordo (')}{fmtCurrencyShort(meta.originalTotal, meta.currency)}{tr(') — normalmente porque um item foi solto do acordo. Ajuste as parcelas do novo fluxo pelo ícone de')} <strong>{tr('parcelas')}</strong>.
        </div>
      )}
    </ModalShell>
  )
}
