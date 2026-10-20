import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import AuthScreen, { AuthMessage } from '../components/AuthScreen'
import { authField, authLabel } from '../components/authStyles'
import { tr, trf } from '../i18n'

// Quem chega por link de convite ou de redefinição já está com a sessão
// aberta, mas sem senha conhecida: define a senha antes de entrar no app.

const MIN_PASSWORD = 8

export default function PageDefinirSenha() {
  const { profile, session, passwordDefined, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) { setError(trf('A senha precisa ter ao menos {0} caracteres.', MIN_PASSWORD)); return }
    if (password !== confirm) { setError(tr('As senhas não conferem.')); return }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) setError(err.message)
    else passwordDefined()
  }

  return (
    <AuthScreen heading={tr('Definir senha')}
      footer={<button type="button" className="btn btn-ghost" onClick={() => signOut()}>{tr('Sair')}</button>}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ margin: 0, fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
          {trf('Crie a senha de acesso de {0}.', profile?.nome || profile?.email || session?.user.email || '')}
        </p>
        <div>
          <label htmlFor="new-password" style={authLabel}>{tr('Nova senha')}</label>
          <input id="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            required minLength={MIN_PASSWORD} autoComplete="new-password" style={authField} />
        </div>
        <div>
          <label htmlFor="confirm-password" style={authLabel}>{tr('Confirmar senha')}</label>
          <input id="confirm-password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            required autoComplete="new-password" style={authField} />
        </div>
        {error && <AuthMessage tone="negative">{tr(error)}</AuthMessage>}
        <button type="submit" disabled={saving} className="btn btn-primary btn-lg btn-block" style={{ marginTop: 'var(--space-2)' }}>
          {saving ? tr('Salvando…') : tr('Salvar senha')}
        </button>
      </form>
    </AuthScreen>
  )
}
