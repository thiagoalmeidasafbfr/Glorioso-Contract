import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const fontLabel = "'IBM Plex Mono', 'JetBrains Mono', monospace"
const fontBody = "'Inter', system-ui, sans-serif"
const fontDisplay = "'Fraunces', 'Cormorant Garamond', Georgia, serif"

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
      background: '#1a1410',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo + Title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img
            src="/logo-saf.png"
            alt="SAF Botafogo"
            style={{ height: 48, objectFit: 'contain', marginBottom: 20 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <h1 style={{
            fontFamily: fontDisplay,
            fontSize: '2rem',
            fontWeight: 700,
            color: '#f5f2ec',
            letterSpacing: '-0.025em',
            lineHeight: 1.08,
            marginBottom: 8,
          }}>
            Gestão de Contratos
          </h1>
          <div style={{
            fontFamily: fontLabel,
            fontSize: 10,
            color: 'rgba(243,238,226,0.38)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}>
            SAF BOTAFOGO
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontFamily: fontLabel,
              fontSize: 9,
              fontWeight: 500,
              color: 'rgba(243,238,226,0.45)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '10px 12px',
                fontFamily: fontBody,
                fontSize: 14,
                color: '#f3eee2',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => (e.target.style.borderColor = '#be8c4a')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              fontFamily: fontLabel,
              fontSize: 9,
              fontWeight: 500,
              color: 'rgba(243,238,226,0.45)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                padding: '10px 12px',
                fontFamily: fontBody,
                fontSize: 14,
                color: '#f3eee2',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => (e.target.style.borderColor = '#be8c4a')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(185,28,28,0.15)',
              border: '1px solid rgba(185,28,28,0.35)',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 16,
              fontFamily: fontBody,
              fontSize: 13,
              color: '#f87171',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? 'rgba(220,200,154,0.4)' : '#dcc89a',
              color: '#3a2e1c',
              border: 'none',
              borderRadius: 999,
              padding: '12px 20px',
              fontFamily: fontLabel,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div style={{
          marginTop: 32,
          fontFamily: fontLabel,
          fontSize: 9,
          color: 'rgba(243,238,226,0.20)',
          textAlign: 'center',
          letterSpacing: '0.10em',
        }}>
          Acesso restrito — SAF Botafogo
        </div>
      </div>
    </div>
  )
}
