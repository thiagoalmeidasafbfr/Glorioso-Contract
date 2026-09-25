import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp, CURRENCY_OPTIONS, type AppCurrency } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { USE_SUPABASE } from '../lib/supabase'
import { Icon, type IconName } from './Icon'
import Wordmark from './Wordmark'

// Shell do Glorioso Finance DS:
//  • navegação lateral sobre o fundo da página — itens "ghost" com ícone
//    monolinha; o ativo é o quadrado PRETO sólido do IconNavRail do DS;
//    recolhida, vira o próprio trilho de ícones 36×36;
//  • TopBar de 56px (--layout-topbar) com o cluster de moeda, idioma e perfil
//    à direita, fixa no topo da área de conteúdo.

const SIDEBAR_W_OPEN = 240
const SIDEBAR_W_COLLAPSED = 64
const COLLAPSE_KEY = 'sidebar-collapsed'

type NavItemDef = { to: string; label: string; icon: IconName }

const NAV_SECTIONS: { label: string | null; items: NavItemDef[] }[] = [
  {
    label: null,
    items: [
      { to: '/criar',          label: 'Criar (assistente)',    icon: 'create' },
      { to: '/dashboards',     label: 'Dashboards',            icon: 'dashboard' },
      { to: '/atletas',        label: 'Atletas',               icon: 'athletes' },
      { to: '/album',          label: 'Portfolio de atletas',  icon: 'portfolio' },
      { to: '/clubes',         label: 'Clubes',                icon: 'clubs' },
      { to: '/intermediarios', label: 'Agentes',               icon: 'agents' },
    ],
  },
  {
    label: 'Modelo financeiro',
    items: [
      { to: '/modelo/premissas', label: 'Premissas por atleta', icon: 'model' },
    ],
  },
  {
    label: 'Relatórios',
    items: [
      { to: '/relatorios/visao-atletas',        label: 'Visão por atleta',        icon: 'athlete' },
      { to: '/relatorios/salarios',             label: 'Ranking de salários',     icon: 'ranking' },
      { to: '/relatorios/consolidado',          label: 'Consolidado',             icon: 'consolidated' },
      { to: '/relatorios/acordos',              label: 'Acordos e renegociações', icon: 'deals' },
      { to: '/relatorios/sell-on',              label: 'Vendas futuras',          icon: 'sellOn' },
      { to: '/relatorios/direitos-economicos',  label: 'Direitos econômicos',     icon: 'ownership' },
      { to: '/relatorios/gatilhos',             label: 'Gatilhos e metas',        icon: 'target' },
      { to: '/relatorios/recuperacao-judicial', label: 'Recuperação judicial',    icon: 'gavel' },
      { to: '/relatorios/amortizacao',          label: 'Amortização & venda',     icon: 'amortization' },
    ],
  },
  {
    label: 'Dados',
    items: [
      { to: '/dados',           label: 'Importar / exportar',      icon: 'transfer' },
      { to: '/dados/planilhas', label: 'Importar ativos/passivos', icon: 'spreadsheet' },
    ],
  },
]

const LANGS = ['pt', 'en', 'es'] as const

interface Props { children: React.ReactNode }

function NavItem({ to, label, icon, collapsed }: NavItemDef & { collapsed: boolean }) {
  return (
    <NavLink to={to} end title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}${collapsed ? ' collapsed' : ''}`}>
      <Icon name={icon} size={20} />
      {!collapsed && <span className="nav-item__label">{label}</span>}
    </NavLink>
  )
}

function initials(s: string): string {
  const base = s.includes('@') ? s.split('@')[0].replace(/[._-]+/g, ' ') : s
  return base.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
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
  const userName = profile?.nome || profile?.email || ''

  return (
    <div className="app-shell">
      {/* ── Navegação ── */}
      <aside className={`app-sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="app-sidebar__brand">
          {collapsed
            ? <Wordmark compact size={15} />
            : (
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Wordmark size={16} />
                <span className="eyebrow">Gestão contratual</span>
              </div>
            )}
          {!collapsed && (
            <button type="button" className="icon-btn" onClick={toggle} title="Recolher navegação" aria-label="Recolher navegação">
              <Icon name="panelClose" size={16} />
            </button>
          )}
        </div>

        <nav className="app-nav" aria-label="Navegação principal">
          {collapsed && (
            <button type="button" className="icon-btn md" onClick={toggle} title="Expandir navegação" aria-label="Expandir navegação"
              style={{ margin: '0 auto 8px' }}>
              <Icon name="panelOpen" size={20} />
            </button>
          )}
          {NAV_SECTIONS.map((section, i) => (
            <div key={i} className="nav-section">
              {section.label && !collapsed && <div className="eyebrow nav-section__label">{section.label}</div>}
              {section.label && collapsed && <div className="nav-section__rule" />}
              {section.items.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Conteúdo ── */}
      <div className="app-main">
        <header className="app-topbar">
          <select aria-label="Moeda de exibição" value={currency} onChange={e => setCurrency(e.target.value as AppCurrency)}
            className="app-topbar__select">
            {CURRENCY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>

          <div className="seg-tabs" role="tablist" aria-label="Idioma" style={{ gap: 'var(--space-3)', margin: '0 var(--space-2)' }}>
            {LANGS.map(l => (
              <button key={l} type="button" role="tab" aria-selected={language === l} className="seg-tab"
                onClick={() => setLanguage(l)} style={{ fontSize: 'var(--text-body-sm-size)' }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {USE_SUPABASE && profile && (
            <>
              <span className="app-topbar__user">
                <span className="app-topbar__avatar" aria-hidden="true">{initials(userName)}</span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
                  <span className="app-topbar__user-name">{userName}</span>
                  <span style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-muted)' }}>
                    {profile.role === 'master' ? 'Master' : 'Jurídico'}
                  </span>
                </span>
              </span>
              <button type="button" className="icon-btn md outline" onClick={() => signOut()} title="Sair" aria-label="Sair">
                <Icon name="logout" size={20} />
              </button>
            </>
          )}
        </header>
        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  )
}
