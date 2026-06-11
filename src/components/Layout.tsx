import { NavLink, useNavigate } from 'react-router-dom'
import { useApp, CURRENCY_OPTIONS, type AppCurrency } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { USE_SUPABASE } from '../lib/supabase'

const NAV_SECTIONS = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/atletas',   label: 'Atletas' },
    ],
  },
  {
    label: 'Receitas',
    items: [
      { to: '/clausulas-venda', label: 'Cláusulas de Venda' },
    ],
  },
  {
    label: 'Passivos',
    items: [
      { to: '/clubes',         label: 'Clubes' },
      { to: '/intermediarios', label: 'Intermediários' },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { to: '/consolidado', label: 'Consolidado' },
      { to: '/imagem',      label: 'Imagem' },
    ],
  },
]

const LANGS = ['PT', 'EN', 'ES'] as const

interface Props {
  children: React.ReactNode
}

export default function Layout({ children }: Props) {
  const { currency, setCurrency, language, setLanguage } = useApp()
  const { profile, signOut, isMaster } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 'var(--sidebar-w)', background: '#1a1410',
        display: 'flex', flexDirection: 'column', zIndex: 100, overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <img src="/logo-saf.png" alt="SAF Botafogo" style={{ height: 32, objectFit: 'contain' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.40)', marginTop: 6,
          }}>
            Gestão Contratual
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 0' }}>
          {NAV_SECTIONS.map(section => (
            <div key={section.label} style={{ marginBottom: 8 }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: 'rgba(190,140,74,0.90)', padding: '6px 20px 4px',
              }}>
                {section.label}
              </div>
              {section.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={({ isActive }) => ({
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 20px', textDecoration: 'none',
                    background: isActive ? 'rgba(190,140,74,0.15)' : 'transparent',
                  })}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    if (!el.className.includes('active') && !el.getAttribute('aria-current')) {
                      el.style.background = 'rgba(255,255,255,0.05)'
                    }
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    if (!el.className.includes('active') && !el.getAttribute('aria-current')) {
                      el.style.background = 'transparent'
                    }
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <div style={{
                        width: 3, height: 3, borderRadius: '50%', flexShrink: 0,
                        background: isActive ? '#be8c4a' : 'rgba(255,255,255,0.25)',
                      }} />
                      <span style={{
                        fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? '#be8c4a' : 'rgba(243,238,226,0.70)',
                        letterSpacing: isActive ? 0 : '-0.01em',
                      }}>
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Import — master only */}
        {USE_SUPABASE && isMaster && (
          <div style={{ padding: '0 0 8px' }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'rgba(190,140,74,0.90)', padding: '6px 20px 4px',
            }}>Admin</div>
            <NavLink to="/import" style={({ isActive }) => ({
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 20px', textDecoration: 'none',
              background: isActive ? 'rgba(190,140,74,0.15)' : 'transparent',
            })}>
              {({ isActive }) => (
                <>
                  <div style={{ width: 3, height: 3, borderRadius: '50%', flexShrink: 0, background: isActive ? '#be8c4a' : 'rgba(255,255,255,0.25)' }} />
                  <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? '#be8c4a' : 'rgba(243,238,226,0.70)' }}>
                    Importar XLSX
                  </span>
                </>
              )}
            </NavLink>
          </div>
        )}

        {/* Controls */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.35)', marginBottom: 6 }}>
            Idioma
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
            {LANGS.map(l => {
              const active = language === l.toLowerCase()
              return (
                <button key={l} onClick={() => setLanguage(l.toLowerCase() as 'pt' | 'en' | 'es')}
                  style={{
                    flex: 1, background: active ? 'rgba(190,140,74,0.20)' : 'rgba(255,255,255,0.05)',
                    border: active ? '1px solid rgba(190,140,74,0.45)' : '1px solid rgba(255,255,255,0.08)',
                    color: active ? '#dcc89a' : 'rgba(243,238,226,0.45)',
                    borderRadius: 6, padding: '4px 0',
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: '0.12em',
                    cursor: 'pointer',
                  }}>{l}</button>
              )
            })}
          </div>

          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.35)', marginBottom: 6 }}>
            Moeda
          </div>
          <select value={currency} onChange={e => setCurrency(e.target.value as AppCurrency)}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.06)', color: 'rgba(243,238,226,0.80)',
              border: '1px solid rgba(255,255,255,0.10)', borderRadius: 7,
              padding: '6px 10px', fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
              cursor: 'pointer', marginBottom: 14,
            }}>
            {CURRENCY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value} style={{ background: '#1a1410' }}>{opt.label}</option>
            ))}
          </select>

          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(243,238,226,0.28)', letterSpacing: '0.08em', marginBottom: USE_SUPABASE && profile ? 14 : 0 }}>
            {new Date().toLocaleDateString('pt-BR')}
          </div>

          {USE_SUPABASE && profile && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(190,140,74,0.80)', marginBottom: 2 }}>
                {profile.role === 'master' ? 'Master' : 'Jurídico'}
              </div>
              <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, color: 'rgba(243,238,226,0.60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>
                {profile.email}
              </div>
              <button onClick={() => signOut()}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 6, padding: '5px 8px', fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'rgba(243,238,226,0.50)', cursor: 'pointer',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(185,28,28,0.20)'; (e.currentTarget as HTMLButtonElement).style.color = '#f87171' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(243,238,226,0.50)' }}
              >Sair</button>
            </div>
          )}

          {/* Botão Novo Atleta — acesso rápido */}
          <button
            onClick={() => navigate('/atletas')}
            style={{
              width: '100%', marginTop: 12,
              background: 'rgba(190,140,74,0.15)', border: '1px solid rgba(190,140,74,0.30)',
              borderRadius: 7, padding: '7px 0', fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 11, fontWeight: 600, color: '#be8c4a', cursor: 'pointer',
              letterSpacing: '0.01em',
            }}
          >+ Novo Atleta</button>
        </div>
      </aside>

      {/* ── Content ── */}
      <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, minHeight: '100vh', background: 'var(--cream-page)' }}>
        {children}
      </main>
    </div>
  )
}
