import { useApp, CURRENCY_OPTIONS, type AppCurrency } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { USE_SUPABASE } from '../lib/supabase'

const NAV_SECTIONS = [
  {
    label: 'Gestão',
    items: [
      { key: 'atletas',    label: 'Atletas' },
      { key: 'consolidado',label: 'Consolidado' },
    ],
  },
  {
    label: 'Passivos',
    items: [
      { key: 'clubes',         label: 'Clubes' },
      { key: 'intermediarios', label: 'Intermediários' },
    ],
  },
  {
    label: 'Direitos',
    items: [
      { key: 'imagem', label: 'Imagem' },
    ],
  },
]

const LANGS = ['PT', 'EN', 'ES'] as const

interface Props {
  children: (page: string) => React.ReactNode
}

export default function Layout({ children }: Props) {
  const { currency, setCurrency, language, setLanguage, currentPage: page, setCurrentPage: setPage } = useApp()
  const { profile, signOut, isMaster } = useAuth()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        width: 'var(--sidebar-w)',
        background: '#1a1410',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        overflowY: 'auto',
      }}>

        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <img
              src="/logo-saf.png"
              alt="SAF Botafogo"
              style={{ height: 32, objectFit: 'contain' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(243,238,226,0.40)',
            marginTop: 6,
          }}>
            Gestão de Contratos
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 0' }}>
          {NAV_SECTIONS.map(section => (
            <div key={section.label} style={{ marginBottom: 8 }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(190,140,74,0.90)',
                padding: '6px 20px 4px',
              }}>
                {section.label}
              </div>
              {section.items.map(item => {
                const active = page === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => setPage(item.key)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 20px',
                      background: active ? 'rgba(190,140,74,0.15)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => {
                      if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={e => {
                      if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    <div style={{
                      width: 3, height: 3, borderRadius: '50%',
                      background: active ? '#be8c4a' : 'rgba(255,255,255,0.25)',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      color: active ? '#be8c4a' : 'rgba(243,238,226,0.70)',
                      letterSpacing: active ? 0 : '-0.01em',
                    }}>
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Import — master only */}
        {USE_SUPABASE && isMaster && (
          <div style={{ padding: '0 0 8px' }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9, fontWeight: 500,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'rgba(190,140,74,0.90)',
              padding: '6px 20px 4px',
            }}>
              Admin
            </div>
            <button
              onClick={() => setPage('import')}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 20px',
                background: page === 'import' ? 'rgba(190,140,74,0.15)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => {
                if (page !== 'import') (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={e => {
                if (page !== 'import') (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              <div style={{
                width: 3, height: 3, borderRadius: '50%',
                background: page === 'import' ? '#be8c4a' : 'rgba(255,255,255,0.25)',
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 13,
                fontWeight: page === 'import' ? 600 : 400,
                color: page === 'import' ? '#be8c4a' : 'rgba(243,238,226,0.70)',
                letterSpacing: page === 'import' ? 0 : '-0.01em',
              }}>
                Importar XLSX
              </span>
            </button>
          </div>
        )}

        {/* Controls */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Language */}
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9, fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(243,238,226,0.35)',
            marginBottom: 6,
          }}>
            Idioma
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
            {LANGS.map(l => {
              const active = language === l.toLowerCase()
              return (
                <button
                  key={l}
                  onClick={() => setLanguage(l.toLowerCase() as 'pt' | 'en' | 'es')}
                  style={{
                    flex: 1,
                    background: active ? 'rgba(190,140,74,0.20)' : 'rgba(255,255,255,0.05)',
                    border: active ? '1px solid rgba(190,140,74,0.45)' : '1px solid rgba(255,255,255,0.08)',
                    color: active ? '#dcc89a' : 'rgba(243,238,226,0.45)',
                    borderRadius: 6, padding: '4px 0',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9, fontWeight: 500, letterSpacing: '0.12em',
                    cursor: 'pointer',
                  }}
                >
                  {l}
                </button>
              )
            })}
          </div>

          {/* Currency */}
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9, fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(243,238,226,0.35)',
            marginBottom: 6,
          }}>
            Moeda
          </div>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value as AppCurrency)}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(243,238,226,0.80)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 7,
              padding: '6px 10px',
              fontSize: 12,
              fontFamily: "'IBM Plex Mono', monospace",
              cursor: 'pointer',
              marginBottom: 14,
            }}
          >
            {CURRENCY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value} style={{ background: '#1a1410' }}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Date */}
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9,
            color: 'rgba(243,238,226,0.28)',
            letterSpacing: '0.08em',
            marginBottom: USE_SUPABASE && profile ? 14 : 0,
          }}>
            Atualizado {new Date().toLocaleDateString('pt-BR')}
          </div>

          {/* User info + logout */}
          {USE_SUPABASE && profile && (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '8px 10px',
            }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9, fontWeight: 500,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'rgba(190,140,74,0.80)',
                marginBottom: 2,
              }}>
                {profile.role === 'master' ? 'Master' : 'Jurídico'}
              </div>
              <div style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: 11,
                color: 'rgba(243,238,226,0.60)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: 8,
              }}>
                {profile.email}
              </div>
              <button
                onClick={() => signOut()}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9, fontWeight: 500,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'rgba(243,238,226,0.50)',
                  cursor: 'pointer',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(185,28,28,0.20)'
                  ;(e.currentTarget as HTMLButtonElement).style.color = '#f87171'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(243,238,226,0.50)'
                }}
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Content ── */}
      <main style={{
        marginLeft: 'var(--sidebar-w)',
        flex: 1,
        minHeight: '100vh',
        background: 'var(--cream-page)',
      }}>
        {children(page)}
      </main>

    </div>
  )
}
