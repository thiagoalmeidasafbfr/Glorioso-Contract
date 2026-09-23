// src/components/modals/styles.ts
// Estilos compartilhados pelos formulários dos modais (campo e rótulo), nas
// métricas do TextField/Select do Glorioso Finance DS: 36px, raio 10, filete
// claro, rótulo de 12px em cinza (caixa de frase). Ficam fora do arquivo de
// componentes para não quebrar o fast-refresh do Vite.

export const modalInput: React.CSSProperties = {
  width: '100%', minHeight: 'var(--control-h-md)', padding: '6px 12px',
  borderRadius: 'var(--radius-control)', fontSize: 'var(--text-body-size)',
  background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)', fontFamily: 'var(--font-core)', boxSizing: 'border-box',
}

export const modalLabel: React.CSSProperties = {
  fontSize: 'var(--text-body-sm-size)', fontFamily: 'var(--font-core)', fontWeight: 400,
  color: 'var(--text-secondary)', marginBottom: 6, display: 'block',
}
