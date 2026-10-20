import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AuthScreen, { AuthMessage } from '../components/AuthScreen'
import { authField, authLabel } from '../components/authStyles'
import { tr } from '../i18n'

// Login e "esqueci a senha" (envia o link de redefinição; ao voltar pelo
// link, o app pede a nova senha — ver PageDefinirSenha).

export default function PageLogin() {
  const { signIn, sendPasswordReset } = useAuth()
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    if (mode === 'login') {
      const err = await signIn(email, password)
      if (err) setError(err)
    } else {
      const err = await sendPasswordReset(email)
      if (err) setError(err)
      else setSent(true)
    }
    setLoading(false)
  }

  function switchMode(next: 'login' | 'forgot') {
    setMode(next)
    setError(null)
    setSent(false)
  }

  return (
    <AuthScreen heading={tr('Gestão de Contratos')}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {mode === 'forgot' && (
          <p style={{ margin: 0, fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
            {tr('Informe o seu e-mail para receber o link de redefinição de senha.')}
          </p>
        )}

        <div>
          <label htmlFor="login-email" style={authLabel}>{tr('E-mail')}</label>
          <input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            required autoComplete="email" style={authField} />
        </div>

        {mode === 'login' && (
          <div>
            <label htmlFor="login-password" style={authLabel}>{tr('Senha')}</label>
            <input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" style={authField} />
          </div>
        )}

        {error && <AuthMessage tone="negative">{tr(error)}</AuthMessage>}
        {sent && <AuthMessage tone="accent">{tr('Se o e-mail estiver cadastrado, o link de redefinição chegará em instantes.')}</AuthMessage>}

        <button type="submit" disabled={loading} className="btn btn-primary btn-lg btn-block" style={{ marginTop: 'var(--space-2)' }}>
          {mode === 'login'
            ? (loading ? tr('Entrando…') : tr('Entrar'))
            : (loading ? tr('Enviando…') : tr('Enviar link'))}
        </button>

        <button type="button" className="btn btn-ghost btn-block" onClick={() => switchMode(mode === 'login' ? 'forgot' : 'login')}>
          {mode === 'login' ? tr('Esqueci a senha') : tr('Voltar ao login')}
        </button>
      </form>
    </AuthScreen>
  )
}
