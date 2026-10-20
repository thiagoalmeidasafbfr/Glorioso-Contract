// Campos das telas de acesso (AuthScreen): 44px, filete claro, foco preto.
// Fora do arquivo de componentes para não quebrar o fast-refresh do Vite.

export const authField: React.CSSProperties = {
  width: '100%', height: 'var(--control-h-lg)', padding: '0 14px',
  backgroundColor: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--ui-control-radius)', fontSize: 'var(--ui-text-size)',
  color: 'var(--text-primary)', boxSizing: 'border-box',
}

export const authLabel: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', marginBottom: 6,
}
