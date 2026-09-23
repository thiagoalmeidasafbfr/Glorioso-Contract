import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Wordmark from '../components/Wordmark'

// Login no padrão do Glorioso Finance DS: capa com o gradiente creme
// (--gradient-mint), headline em duas partes (400 / 600), campos de 44px com
// filete claro e foco preto, e a ação principal em preto.

const field: React.CSSProperties = {
  width: '100%', height: 'var(--control-h-lg)', padding: '0 14px',
  background: 'var(--surface-card)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-control)', fontSize: 'var(--text-body-size)',
  color: 'var(--text-primary)', boxSizing: 'border-box',
}

const label: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', marginBottom: 6,
}

export default function PageLogin() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const err = await signIn(email, password)
    if (err) setError(err)
    setLoading(false)
  }

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
            <span style={{ display: 'block', fontWeight: 400 }}>Gestão de</span>
            <span style={{ display: 'block', fontWeight: 600 }}>Contratos</span>
          </h1>
          <div className="eyebrow" style={{ marginTop: 'var(--space-3)' }}>SAF Botafogo</div>
        </div>

        <form onSubmit={handleSubmit} className="card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label htmlFor="login-email" style={label}>E-mail</label>
            <input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email" style={field} />
          </div>

          <div>
            <label htmlFor="login-password" style={label}>Senha</label>
            <input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" style={field} />
          </div>

          {error && (
            <div role="alert" style={{
              background: 'var(--surface-negative-soft)',
              borderRadius: 'var(--radius-control)',
              padding: '10px 14px',
              fontSize: 'var(--text-body-sm-size)',
              color: 'var(--text-negative)',
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary btn-lg btn-block" style={{ marginTop: 'var(--space-2)' }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-6)', fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', textAlign: 'center' }}>
          Acesso restrito — SAF Botafogo
        </div>
      </div>
    </div>
  )
}
