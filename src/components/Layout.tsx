import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp, CURRENCY_OPTIONS, type AppCurrency } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { USE_SUPABASE } from '../lib/supabase'

const fontBody  = "var(--font-body)"
const fontMono  = "var(--font-label)"

const SIDEBAR_W_OPEN = 220
const SIDEBAR_W_COLLAPSED = 60
const COLLAPSE_KEY = 'sidebar-collapsed'

const NAV_SECTIONS: { label: string | null; items: { to: string; label: string; short: string }[] }[] = [
  {
    label: null,
    items: [
      { to: '/criar',          label: '+ Criar (Assistente)', short: '+' },
      { to: '/dashboards',     label: 'Dashboards',           short: 'DB' },
      { to: '/atletas',        label: 'Atletas',              short: 'AT' },
      { to: '/album',          label: 'Portfolio de Atletas', short: 'PA' },
      { to: '/clubes',         label: 'Clubes',               short: 'CL' },
      { to: '/intermediarios', label: 'Agentes',              short: 'AG' },
    ],
  },
  {
    label: 'Modelo financeiro',
    items: [
      { to: '/modelo/premissas', label: 'Premissas & Simulação', short: 'PR' },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { to: '/relatorios/visao-atletas',        label: 'Visão por Atleta',       short: 'VA' },
      { to: '/relatorios/consolidado',          label: 'Consolidado',            short: 'CO' },
      { to: '/relatorios/acordos',              label: 'Acordos e Renegociações',short: 'AC' },
      { to: '/relatorios/sell-on',              label: 'Vendas Futuras',         short: 'VF' },
      { to: '/relatorios/direitos-economicos',  label: 'Direitos Econômicos',    short: 'DE' },
      { to: '/relatorios/gatilhos',             label: 'Gatilhos e Metas',       short: 'GT' },
      { to: '/relatorios/recuperacao-judicial', label: 'Recuperação Judicial',   short: 'RJ' },
      { to: '/relatorios/amortizacao',          label: 'Amortização & Venda',    short: 'AM' },
    ],
  },
  {
    label: null,
    items: [
      { to: '/dados',           label: 'Importar / Exportar',      short: 'IE' },
      { to: '/dados/planilhas', label: 'Importar Ativos/Passivos', short: 'IA' },
    ],
  },
]

const LANGS = ['PT', 'EN', 'ES'] as const

interface Props { children: React.ReactNode }

function NavItem({ to, label, short, collapsed }: { to: string; label: string; short: string; collapsed: boolean }) {
  return (
    <NavLink
      to={to}
      end
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display: 'block', textDecoration: 'none',
        padding: collapsed ? '10px 0' : '8px 22px 8px 21px',
        borderLeft: `2px solid ${isActive ? '#f3eee2' : 'transparent'}`,
        background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
        fontFamily: collapsed ? fontMono : fontBody,
        fontSize: collapsed ? 10 : 13,
        letterSpacing: collapsed ? '0.10em' : undefined,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#ffffff' : 'rgba(243,238,226,0.62)',
        textAlign: collapsed ? 'center' as const : 'left' as const,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'background 0.12s, color 0.12s',
      })}
      onMouseEnter={e => { const el = e.currentTarget; if (!el.getAttribute('aria-current')) el.style.color = 'rgba(243,238,226,0.92)' }}
      onMouseLeave={e => { const el = e.currentTarget; if (!el.getAttribute('aria-current')) el.style.color = 'rgba(243,238,226,0.62)' }}
    >
      {collapsed ? short : label}
    </NavLink>
  )
}

export default function Layout({ children }: Props) {
  const { currency, setCurrency, language, setLanguage } = useApp()
  const { profile, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    const w = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_OPEN
    document.documentElement.style.setProperty('--sidebar-w', `${w}px`)
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed])

  const toggle = () => setCollapsed(c => !c)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── Sidebar ── */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: 'var(--sidebar-w)',
        background: 'linear-gradient(180deg, #17150f 0%, #0b0a07 100%)',
        display: 'flex', flexDirection: 'column', zIndex: 100, overflowY: 'auto', overflowX: 'hidden',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        transition: 'width 0.18s ease',
      }}>
        {/* Marca */}
        <div style={{
          padding: collapsed ? '18px 8px 14px' : '22px 22px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <img src="/logo-saf.png" alt="Botafogo SAF" style={{ height: 30, objectFit: 'contain' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              <div style={{ fontFamily: fontMono, fontSize: 8.5, fontWeight: 500, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.38)', marginTop: 10 }}>
                Gestão Contratual
              </div>
            </div>
          )}
          <button onClick={toggle} title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'} aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(243,238,226,0.72)',
              width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 14, lineHeight: 1, padding: 0,
            }}>
            {collapsed ? '»' : '«'}
          </button>
        </div>

        {/* Navegação */}
        <nav style={{ flex: 1, padding: '14px 0' }}>
          {NAV_SECTIONS.map((section, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              {section.label && !collapsed && (
                <div style={{ fontFamily: fontMono, fontSize: 8.5, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.34)', padding: '4px 22px 8px' }}>
                  {section.label}
                </div>
              )}
              {section.label && collapsed && (
                <div style={{ height: 1, margin: '4px 12px 8px', background: 'rgba(255,255,255,0.06)' }} />
              )}
              {section.items.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
            </div>
          ))}
        </nav>

        {/* Rodapé: moeda, idioma, usuário */}
        {!collapsed && (
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
                      flex: 1, background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.08)'}`,
                      color: active ? '#ffffff' : 'rgba(243,238,226,0.40)',
                      borderRadius: 6, padding: '4px 0', fontFamily: fontMono, fontSize: 9, letterSpacing: '0.10em', cursor: 'pointer',
                    }}>{l}</button>
                )
              })}
            </div>

            {USE_SUPABASE && profile && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                <div style={{ fontFamily: fontMono, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.42)', marginBottom: 3 }}>
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
        )}
      </aside>

      {/* ── Conteúdo ── */}
      <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, minHeight: '100vh', background: 'var(--cream-page)', transition: 'margin-left 0.18s ease' }}>
        {children}
      </main>
    </div>
  )
}
