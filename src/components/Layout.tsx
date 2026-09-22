import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useApp, CURRENCY_OPTIONS, type AppCurrency } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { USE_SUPABASE } from '../lib/supabase'
import { roleLabel } from '../lib/permissoes'

const fontBody  = "var(--font-body)"
const fontMono  = "var(--font-label)"

const SIDEBAR_W_OPEN = 220
const SIDEBAR_W_COLLAPSED = 60
const COLLAPSE_KEY = 'sidebar-collapsed'
// Abaixo desta largura a sidebar vira drawer (sobreposta, aberta pelo ☰).
const MOBILE_QUERY = '(max-width: 900px)'

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

const NAV_SECTIONS: { label: string | null; items: { to: string; label: string; short: string }[] }[] = [
  {
    label: null,
    items: [
      { to: '/criar',          label: '+ Criar (Assistente)', short: '+' },
      { to: '/dashboards',     label: 'Dashboards',           short: 'DB' },
      { to: '/dashboard',      label: 'Visão Geral',          short: 'VG' },
      { to: '/atletas',        label: 'Atletas',              short: 'AT' },
      { to: '/album',          label: 'Portfólio de Atletas', short: 'PA' },
      { to: '/clubes',         label: 'Clubes',               short: 'CL' },
      { to: '/intermediarios', label: 'Agentes',              short: 'AG' },
    ],
  },
  {
    label: 'Modelo financeiro',
    items: [
      { to: '/modelo/premissas', label: 'Premissas por atleta', short: 'PR' },
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
        fontSize: collapsed ? 11 : 13,
        letterSpacing: collapsed ? '0.10em' : undefined,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#ffffff' : 'rgba(243,238,226,0.70)',
        textAlign: collapsed ? 'center' as const : 'left' as const,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'background 0.12s, color 0.12s',
      })}
      onMouseEnter={e => { const el = e.currentTarget; if (!el.getAttribute('aria-current')) el.style.color = 'rgba(243,238,226,0.92)' }}
      onMouseLeave={e => { const el = e.currentTarget; if (!el.getAttribute('aria-current')) el.style.color = 'rgba(243,238,226,0.70)' }}
    >
      {collapsed ? short : label}
    </NavLink>
  )
}

export default function Layout({ children }: Props) {
  const { currency, setCurrency } = useApp()
  const { profile, signOut, can, isMaster } = useAuth()
  const isMobile = useIsMobile()
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsedPref, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })
  // No mobile a sidebar é sempre "aberta" dentro do drawer; o recolhimento é só desktop.
  const collapsed = !isMobile && collapsedPref

  useEffect(() => {
    const w = isMobile ? 0 : collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W_OPEN
    document.documentElement.style.setProperty('--sidebar-w', `${w}px`)
    try { localStorage.setItem(COLLAPSE_KEY, collapsedPref ? '1' : '0') } catch { /* ignore */ }
  }, [collapsed, collapsedPref, isMobile])

  // Fecha o drawer ao navegar.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza UI com a rota
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const toggle = () => isMobile ? setDrawerOpen(false) : setCollapsed(c => !c)

  // Governança: badge de alertas não lidos (recarrega ao navegar e quando a
  // central de alertas avisa via evento) + seções por papel.
  const [alertCount, setAlertCount] = useState(0)
  useEffect(() => {
    let alive = true
    // import dinâmico: a camada de dados não entra no bundle inicial (item 2.2).
    const refresh = () => { import('../lib/governanca').then(m => m.contarAlertasNaoLidos()).then(n => { if (alive) setAlertCount(n) }).catch(() => {}) }
    refresh()
    window.addEventListener('alertas-changed', refresh)
    return () => { alive = false; window.removeEventListener('alertas-changed', refresh) }
  }, [pathname])
  const govSections: typeof NAV_SECTIONS = [
    {
      label: 'Governança',
      items: [
        { to: '/alertas', label: alertCount > 0 ? `Alertas (${alertCount})` : 'Alertas', short: alertCount > 0 ? `!${alertCount > 99 ? '99' : alertCount}` : 'AL' },
        ...(can('aprovar') || can('enviarRevisao') ? [{ to: '/aprovacoes', label: 'Aprovações', short: 'AP' }] : []),
      ],
    },
    ...(isMaster || can('verAuditoria') ? [{
      label: 'Administração',
      items: [
        ...(isMaster ? [{ to: '/admin/usuarios', label: 'Usuários', short: 'US' }] : []),
        ...(can('verAuditoria') ? [{ to: '/admin/auditoria', label: 'Auditoria', short: 'AU' }] : []),
      ],
    }] : []),
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── Sidebar ── */}
      {isMobile && drawerOpen && (
        <div aria-hidden onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99 }} />
      )}
      <aside aria-label="Menu principal" style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: isMobile ? SIDEBAR_W_OPEN + 40 : 'var(--sidebar-w)',
        transform: isMobile && !drawerOpen ? 'translateX(-100%)' : 'none',
        boxShadow: isMobile && drawerOpen ? '0 0 40px rgba(0,0,0,0.4)' : 'none',
        background: 'linear-gradient(180deg, #17150f 0%, #0b0a07 100%)',
        display: 'flex', flexDirection: 'column', zIndex: 100, overflowY: 'auto', overflowX: 'hidden',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        transition: 'width 0.18s ease, transform 0.2s ease',
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
              <div style={{ fontFamily: fontMono, fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.66)', marginTop: 10 }}>
                Gestão Contratual
              </div>
            </div>
          )}
          <button onClick={toggle} title={isMobile ? 'Fechar menu' : collapsed ? 'Expandir sidebar' : 'Recolher sidebar'} aria-label={isMobile ? 'Fechar menu' : collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(243,238,226,0.72)',
              width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 14, lineHeight: 1, padding: 0,
            }}>
            {isMobile ? '✕' : collapsed ? '»' : '«'}
          </button>
        </div>

        {/* Navegação */}
        <nav style={{ flex: 1, padding: '14px 0' }}>
          {[...NAV_SECTIONS, ...govSections].map((section, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              {section.label && !collapsed && (
                <div style={{ fontFamily: fontMono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.64)', padding: '4px 22px 8px' }}>
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
              <label htmlFor="layout-moeda" style={{ display: 'block', fontFamily: fontMono, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.64)', marginBottom: 6 }}>Moeda</label>
              <select id="layout-moeda" value={currency} onChange={e => setCurrency(e.target.value as AppCurrency)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'rgba(243,238,226,0.82)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontFamily: fontMono, cursor: 'pointer' }}>
                {CURRENCY_OPTIONS.map(opt => <option key={opt.value} value={opt.value} style={{ background: '#1a1410' }}>{opt.label}</option>)}
              </select>
            </div>

            {/* Seletor PT/EN/ES removido até o i18n estar ligado às telas (hoje
                nenhuma tela usa t()). Ver docs/PLANO_CORRECAO.md. */}

            {USE_SUPABASE && profile && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.70)', marginBottom: 3 }}>
                  {profile.ativo === false ? `${roleLabel(profile.role)} (inativo)` : roleLabel(profile.role)}
                </div>
                <div style={{ fontFamily: fontBody, fontSize: 12, color: 'rgba(243,238,226,0.70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>
                  {profile.email}
                </div>
                <button onClick={() => signOut()}
                  style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '6px 8px', fontFamily: fontMono, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.78)', cursor: 'pointer' }}>
                  Sair
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Conteúdo ── */}
      <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, minWidth: 0, minHeight: '100vh', background: 'var(--cream-page)', transition: 'margin-left 0.18s ease' }}>
        {isMobile && (
          <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#14120c', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => setDrawerOpen(true)} aria-label="Abrir menu" aria-expanded={drawerOpen}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: '#f3eee2', width: 36, height: 36, borderRadius: 8, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>
              ☰
            </button>
            <span style={{ fontFamily: fontMono, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(243,238,226,0.85)' }}>Gestão Contratual</span>
          </div>
        )}
        {!USE_SUPABASE && (
          <div role="status" style={{ padding: '8px 16px', background: '#fff4d6', borderBottom: '1px solid #e8cf87', color: '#5c4400', fontFamily: fontBody, fontSize: 13 }}>
            <strong>Modo local:</strong> os dados estão salvos apenas neste navegador e não são compartilhados com a equipe.
            Configure o Supabase (<code>VITE_USE_SUPABASE=true</code>) para uso em produção.
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
