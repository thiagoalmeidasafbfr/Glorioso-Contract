import { useApp, CURRENCY_OPTIONS, type AppCurrency } from '../context/AppContext'

const PAGES = [
  { key: 'atletas',       label: 'Atletas' },
  { key: 'clubes',        label: 'Clubes' },
  { key: 'intermediarios',label: 'Intermediários' },
  { key: 'consolidado',   label: 'Consolidado' },
  { key: 'imagem',        label: 'Imagem' },
]

const LANGS = ['PT', 'EN', 'ES'] as const

interface Props {
  children: (page: string) => React.ReactNode
}

export default function Layout({ children }: Props) {
  const { currency, setCurrency, language, setLanguage, currentPage: page, setCurrentPage: setPage } = useApp()

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5' }}>
      {/* Header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 72,
        background: '#000', zIndex: 100,
        display: 'flex', alignItems: 'center', padding: '0 24px',
        gap: 24,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 16 }}>
          <img src="/logo-saf.png" alt="SAF Botafogo" style={{ height: 40, objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span style={{
            color: '#fff', fontFamily: 'Inter', fontWeight: 700,
            fontSize: 15, letterSpacing: 2, textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            SAF <strong>BOTAFOGO</strong>
            <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 12, fontWeight: 400 }}>|</span>
            <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, letterSpacing: 1 }}>
              Gestão de Contratos
            </span>
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 36, background: '#333', marginRight: 8 }} />

        {/* Nav tabs */}
        <nav style={{ display: 'flex', gap: 6 }}>
          {PAGES.map(p => (
            <button key={p.key} onClick={() => setPage(p.key)} style={{
              background: page === p.key ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)',
              border: page === p.key ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
              color: page === p.key ? '#fff' : 'rgba(255,255,255,0.6)',
              borderRadius: 6, padding: '7px 16px',
              fontFamily: 'Inter', fontSize: 12, fontWeight: page === p.key ? 600 : 400,
              cursor: 'pointer', letterSpacing: 0.5,
              transition: 'all 0.15s',
            }}>
              {p.label}
            </button>
          ))}
        </nav>

        {/* Controles: idioma + moeda + data */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Selector de idioma */}
          <div style={{ display: 'flex', gap: 2 }}>
            {LANGS.map(l => (
              <button
                key={l}
                onClick={() => setLanguage(l.toLowerCase() as 'pt' | 'en' | 'es')}
                style={{
                  background: language === l.toLowerCase() ? 'rgba(255,255,255,0.2)' : 'transparent',
                  border: language === l.toLowerCase() ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.15)',
                  color: language === l.toLowerCase() ? '#fff' : 'rgba(255,255,255,0.5)',
                  borderRadius: 4, padding: '3px 7px',
                  fontFamily: 'Inter', fontSize: 10, fontWeight: 600,
                  cursor: 'pointer', letterSpacing: 0.5,
                  transition: 'all 0.15s',
                }}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Selector de moeda */}
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value as AppCurrency)}
            style={{
              background: '#222', color: '#fff',
              border: '1px solid #444', borderRadius: 5,
              padding: '4px 8px', fontSize: 11,
              fontFamily: 'Inter', cursor: 'pointer',
            }}
          >
            {CURRENCY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value} style={{ background: '#222' }}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Data atualização */}
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
            Atualizado: {new Date().toLocaleDateString('pt-BR')}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ paddingTop: 72 }}>
        {children(page)}
      </div>
    </div>
  )
}
