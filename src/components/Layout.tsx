import { NavLink } from 'react-router-dom'
import { useApp, CURRENCY_OPTIONS, type AppCurrency } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { USE_SUPABASE } from '../lib/supabase'

const fontBody  = "'Inter', system-ui, sans-serif"
const fontMono  = "'IBM Plex Mono', monospace"

const NAV_SECTIONS: { label: string | null; items: { to: string; label: string }[] }[] = [
  {
    label: null,
    items: [
      { to: '/atletas',        label: 'Atletas' },
      { to: '/album',          label: 'Álbum de Figurinhas' },
      { to: '/clubes',         label: 'Clubes' },
      { to: '/intermediarios', label: 'Agentes' },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { to: '/relatorios/imagem',        label: 'Direito de Imagem' },
      { to: '/relatorios/luvas',         label: 'Luvas' },
      { to: '/relatorios/intermediarios', label: 'Agentes' },
      { to: '/relatorios/clubes',        label: 'Clubes' },
      { to: '/relatorios/salarios',      label: 'Salários' },
      { to: '/relatorios/consolidado',   label: 'Consolidado' },
    ],
  },
  {
    label: null,
    items: [
      { to: '/dados', label: 'Importar / Exportar' },
      { to: '/dados/planilhas', label: 'Importar Ativos/Passivos' },
    ],
  },
]

const LANGS = ['PT', 'EN', 'ES'] as const

interface Props { children: React.ReactNode }

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      style={({ isActive }) => ({
        display: 'block', textDecoration: 'none',
        padding: '8px 22px 8px 21px',
        borderLeft: `2px solid ${isActive ? 'var(--gold)' : 'transparent'}`,
        background: isActive ? 'rgba(190,140,74,0.10)' : 'transparent',
        fontFamily: fontBody, fontSize: 13,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? 'var(--gold-soft)' : 'rgba(243,238,226,0.62)',
        transition: 'background 0.12s, color 0.12s',
      })}
      onMouseEnter={e => { const el = e.currentTarget; if (!el.getAttribute('aria-current')) el.style.color = 'rgba(243,238,226,0.92)' }}
      onMouseLeave={e => { const el = e.currentTarget; if (!el.getAttribute('aria-current')) el.style.color = 'rgba(243,238,226,0.62)' }}
    >
      {label}
    </NavLink>
  )
}

export default function Layout({ children }: Props) {
  const { currency, setCurrency, language, setLanguage } = useApp()
  const { profile, signOut } = useAuth()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── Sidebar ── */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 'var(--sidebar-w)', background: 'var(--ink-primary)',
        display: 'flex', flexDirection: 'column', zIndex: 100, overflowY: 'auto',
        borderRight: '1px solid rgba(190,140,74,0.14)',
      }}>
        {/* Marca */}
        <div style={{ padding: '22px 22px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <img src="/logo-saf.png" alt="Botafogo SAF" style={{ height: 30, objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <div style={{ fontFamily: fontMono, fontSize: 8.5, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.38)', marginTop: 10 }}>
            Gestão Contratual
          </div>
        </div>

        {/* Navegação */}
        <nav style={{ flex: 1, padding: '14px 0' }}>
          {NAV_SECTIONS.map((section, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              {section.label && (
                <div style={{ fontFamily: fontMono, fontSize: 8.5, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(190,140,74,0.70)', padding: '4px 22px 8px' }}>
                  {section.label}
                </div>
              )}
              {section.items.map(item => <NavItem key={item.to} {...item} />)}
            </div>
          ))}
        </nav>

        {/* Rodapé: moeda, idioma, usuário */}
        <div style={{ padding: '14px 22px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontFamily: fontMono, fontSize: 8.5, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.32)', marginBottom: 6 }}>Moeda</div>
            <select value={currency} onChange={e => setCurrency(e.target.value as AppCurrency)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'rgba(243,238,226,0.82)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: fontMono, cursor: 'pointer' }}>
              {CURRENCY_OPTIONS.map(opt => <option key={opt.value} value={opt.value} style={{ background: '#1a1410' }}>{opt.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {LANGS.map(l => {
              const active = language === l.toLowerCase()
              return (
                <button key={l} onClick={() => setLanguage(l.toLowerCase() as 'pt' | 'en' | 'es')}
                  style={{
                    flex: 1, background: active ? 'rgba(190,140,74,0.18)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(190,140,74,0.40)' : 'rgba(255,255,255,0.08)'}`,
                    color: active ? 'var(--gold-soft)' : 'rgba(243,238,226,0.40)',
                    borderRadius: 6, padding: '4px 0', fontFamily: fontMono, fontSize: 9, letterSpacing: '0.10em', cursor: 'pointer',
                  }}>{l}</button>
              )
            })}
          </div>

          {USE_SUPABASE && profile && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
              <div style={{ fontFamily: fontMono, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(190,140,74,0.72)', marginBottom: 3 }}>
                {profile.role === 'master' ? 'Master' : 'Jurídico'}
              </div>
              <div style={{ fontFamily: fontBody, fontSize: 11, color: 'rgba(243,238,226,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>
                {profile.email}
              </div>
              <button onClick={() => signOut()}
                style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '6px 8px', fontFamily: fontMono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.52)', cursor: 'pointer' }}>
                Sair
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Conteúdo ── */}
      <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, minHeight: '100vh', background: 'var(--cream-page)' }}>
        {children}
      </main>
    </div>
  )
}
