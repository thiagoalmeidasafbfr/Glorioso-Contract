// src/components/RowActions.tsx
// Conjunto ÚNICO de ações de linha, usado em TODAS as tabelas financeiras
// (clube, agente, ficha do atleta, obrigação, relatórios, consolidado, acordos).
//
// Regras que este componente garante:
//   • a MESMA ordem de ícones em toda tabela — a coluna "Ações" fica previsível;
//   • todos os ícones SEMPRE visíveis; o que não se aplica àquela linha fica
//     CINZA e não clicável, com o motivo no tooltip;
//   • um ícone e uma cor por significado (nunca o mesmo ícone p/ ações diferentes):
//       abrir (preto) · editar (preto) · parcelas (azul: cronograma ou gerar)
//       marcar paga (verde) · registrar pagamento (verde) · desfazer (âmbar)
//       excluir (vermelho)

import { IconButton } from './Icon'

/** Uma ação: com `onClick`/`to` fica ativa; sem eles, cinza + motivo. */
export interface Action {
  onClick?: () => void
  to?: string | null
  /** Motivo da indisponibilidade (vai para o tooltip do ícone cinza). */
  reason?: string
  /** Rótulo alternativo (o padrão descreve a ação canônica). */
  label?: string
}

export interface RowActionsProps {
  /** Abrir a página própria da obrigação. */
  open?: Action
  /** Editar o registro da linha (parcela, obrigação ou passivo). */
  edit?: Action
  /** Ver/editar o cronograma de parcelas já existente. */
  schedule?: Action
  /** Gerar as parcelas de um valor único (parcelar / converter em obrigação). */
  generate?: Action
  /** Quitar rápido, com o valor previsto. */
  markPaid?: Action
  /** Registrar pagamento informando valores e câmbio. */
  pay?: Action
  /** Desfazer o pagamento. */
  revert?: Action
  /** Excluir o registro. */
  remove?: Action
  small?: boolean
  align?: 'left' | 'right' | 'center'
}

const LABELS = {
  open:     'Abrir página da obrigação',
  edit:     'Editar',
  schedule: 'Ver / editar as parcelas',
  generate: 'Gerar parcelas',
  markPaid: 'Marcar como paga',
  pay:      'Registrar pagamento (valores e câmbio)',
  revert:   'Desfazer pagamento',
  remove:   'Excluir',
} as const

export default function RowActions({
  open, edit, schedule, generate, markPaid, pay, revert, remove, small = true, align = 'right',
}: RowActionsProps) {
  // Cronograma e "gerar parcelas" ocupam o MESMO lugar na linha: são dois estados
  // do mesmo assunto (as parcelas da obrigação), com ícones e tooltips distintos.
  const parcels = schedule?.onClick ? { action: schedule, icon: 'schedule' as const, key: 'schedule' as const }
    : generate ? { action: generate, icon: 'split' as const, key: 'generate' as const }
    : schedule ? { action: schedule, icon: 'schedule' as const, key: 'schedule' as const }
    : null

  const slot = (
    a: Action | undefined,
    icon: Parameters<typeof IconButton>[0]['icon'],
    key: keyof typeof LABELS,
    tone: Parameters<typeof IconButton>[0]['tone'],
  ) => {
    if (!a) return null
    const label = a.label ?? LABELS[key]
    const enabled = !!a.onClick || !!a.to
    return (
      <IconButton key={key} icon={icon} label={label} tone={tone} small={small}
        to={a.to ?? undefined} onClick={a.onClick}
        disabled={!enabled} disabledReason={a.reason} />
    )
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 1,
      justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
    }}>
      {slot(open, 'open', 'open', 'default')}
      {slot(edit, 'edit', 'edit', 'default')}
      {parcels && slot(parcels.action, parcels.icon, parcels.key, 'info')}
      {slot(markPaid, 'check', 'markPaid', 'success')}
      {slot(pay, 'money', 'pay', 'success')}
      {slot(revert, 'undo', 'revert', 'warn')}
      {slot(remove, 'trash', 'remove', 'danger')}
    </span>
  )
}

/** Legenda das ações — usada no topo das tabelas para explicar cores/ícones. */
export function ActionLegend({ items = ['open', 'edit', 'schedule', 'markPaid', 'pay', 'revert', 'remove'] }: {
  items?: (keyof typeof LABELS)[]
}) {
  const spec: Record<keyof typeof LABELS, { icon: Parameters<typeof IconButton>[0]['icon']; tone: Parameters<typeof IconButton>[0]['tone']; short: string }> = {
    open:     { icon: 'open',     tone: 'default', short: 'abrir' },
    edit:     { icon: 'edit',     tone: 'default', short: 'editar' },
    schedule: { icon: 'schedule', tone: 'info',    short: 'parcelas' },
    generate: { icon: 'split',    tone: 'info',    short: 'gerar parcelas' },
    markPaid: { icon: 'check',    tone: 'success', short: 'marcar paga' },
    pay:      { icon: 'money',    tone: 'success', short: 'registrar pagamento' },
    revert:   { icon: 'undo',     tone: 'warn',    short: 'desfazer' },
    remove:   { icon: 'trash',    tone: 'danger',  short: 'excluir' },
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      fontFamily: "var(--font-body)", fontSize: 11, color: 'var(--text-muted)',
    }}>
      {items.map(k => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <IconButton icon={spec[k].icon} label={spec[k].short} tone={spec[k].tone} small onClick={() => {}}
            style={{ pointerEvents: 'none' }} />
          {spec[k].short}
        </span>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <IconButton icon="check" label="indisponível" small disabled style={{ pointerEvents: 'none' }} />
        cinza = indisponível nesta linha
      </span>
    </div>
  )
}
