// src/components/modals/styles.ts
// Estilos compartilhados pelos formulários dos modais (input e rótulo). Ficam
// fora do arquivo de componentes para não quebrar o fast-refresh do Vite.

const font = "var(--font-body)"
const mono = "var(--font-label)"

export const modalInput: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13, background: 'var(--cream-card)',
  border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box',
}

export const modalLabel: React.CSSProperties = {
  fontSize: 9, fontFamily: mono, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: 3, display: 'block',
}
