// Tela cheia das etapas de acesso (login, definir senha, acesso pendente) no
// padrão do Glorioso Finance DS: capa com o gradiente creme
// (--gradient-mint), headline em duas partes (400 / 500), campos de 44px com
// filete claro e foco preto (authStyles.ts), e a ação principal em preto.

import Wordmark from './Wordmark'
import { tr } from '../i18n'

export function AuthMessage({ tone, children }: { tone: 'negative' | 'accent'; children: React.ReactNode }) {
  return (
    <div role={tone === 'negative' ? 'alert' : 'status'} style={{
      background: tone === 'negative' ? 'var(--surface-negative-soft)' : 'var(--surface-accent)',
      borderRadius: 'var(--radius-control)',
      padding: '10px 14px',
      fontSize: 'var(--text-body-sm-size)',
      color: tone === 'negative' ? 'var(--text-negative)' : 'var(--text-primary)',
    }}>
      {children}
    </div>
  )
}

export default function AuthScreen({ heading, children, footer }: {
  /** Título já traduzido; quebra em duas linhas antes da última palavra. */
  heading: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const cut = heading.lastIndexOf(' ')
  const lines = cut > 0 ? [heading.slice(0, cut), heading.slice(cut + 1)] : [heading, '']
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--gradient-mint)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-6) var(--gutter-screen-mobile)',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <Wordmark plate size={16} />
          <h1 style={{
            marginTop: 'var(--space-7)',
            fontSize: 'var(--text-h1-size)', lineHeight: 'var(--text-h1-line)',
            letterSpacing: 'var(--text-h1-tracking)', color: 'var(--text-primary)',
          }}>
            <span style={{ display: 'block', fontWeight: 400 }}>{lines[0]}</span>
            <span style={{ display: 'block', fontWeight: 500 }}>{lines[1]}</span>
          </h1>
          <div className="eyebrow" style={{ marginTop: 'var(--space-3)' }}>{tr('SAF Botafogo')}</div>
        </div>

        <div className="card" style={{ padding: 'var(--gutter-card)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {children}
        </div>

        <div style={{ marginTop: 'var(--space-6)', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {footer ?? tr('Acesso restrito — SAF Botafogo')}
        </div>
      </div>
    </div>
  )
}
