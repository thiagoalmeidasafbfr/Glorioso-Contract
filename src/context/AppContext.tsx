import { createContext, useContext, useState, type ReactNode } from 'react'
import { translations, type Lang } from '../i18n/translations'

export type AppCurrency = 'BRL' | 'USD' | 'EUR' | 'GBP' | 'QAR' | 'SAR' | 'AED' | 'RUB'

// 1 unidade dessa moeda = X reais (BRL)
export const CURRENCY_TO_BRL: Record<AppCurrency, number> = {
  BRL: 1,
  USD: 5.55,
  EUR: 6.10,
  GBP: 7.10,
  QAR: 1.52,
  SAR: 1.48,
  AED: 1.51,
  RUB: 0.063,
}

export const CURRENCY_SYMBOLS: Record<AppCurrency, string> = {
  BRL: 'R$', USD: '$', EUR: '€', GBP: '£',
  QAR: 'QAR', SAR: 'SAR', AED: 'AED', RUB: '₽',
}

export const CURRENCY_OPTIONS: { value: AppCurrency; label: string }[] = [
  { value: 'BRL', label: 'R$ Real' },
  { value: 'USD', label: '$ Dólar' },
  { value: 'EUR', label: '€ Euro' },
  { value: 'GBP', label: '£ Libra' },
  { value: 'QAR', label: 'QAR Riyal Catari' },
  { value: 'SAR', label: 'SAR Riyal Saudita' },
  { value: 'AED', label: 'AED Dirham' },
  { value: 'RUB', label: '₽ Rublo' },
]

interface AppContextType {
  currency: AppCurrency
  setCurrency: (c: AppCurrency) => void
  language: Lang
  setLanguage: (l: Lang) => void
  symbol: string
  fromBRL: (brlValue: number) => number
  convert: (value: number, fromCurrency: string) => number
  fmtMiC: (brlValue: number) => string
  fmtC: (brlValue: number) => string
  t: (key: string) => string
  // Navegação
  currentPage: string
  setCurrentPage: (p: string) => void
  openAtletaId: number | null
  navigateToAtleta: (id: number) => void
  clearOpenAtleta: () => void
  // Dark mode
  isDark: boolean
  toggleDark: () => void
}

const AppContext = createContext<AppContextType>(null!)

export function AppProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<AppCurrency>('BRL')
  const [language, setLanguage] = useState<Lang>('pt')
  const [currentPage, setCurrentPage] = useState('atletas')
  const [openAtletaId, setOpenAtletaId] = useState<number | null>(null)
  const [isDark, setIsDark] = useState(false)
  const toggleDark = () => {
    setIsDark(prev => {
      const next = !prev
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
      return next
    })
  }

  const navigateToAtleta = (id: number) => {
    setOpenAtletaId(id)
    setCurrentPage('atletas')
  }
  const clearOpenAtleta = () => setOpenAtletaId(null)

  const symbol = CURRENCY_SYMBOLS[currency]

  const fromBRL = (brlValue: number) => brlValue / CURRENCY_TO_BRL[currency]

  const convert = (value: number, fromCurrency: string) => {
    const brl = value * (CURRENCY_TO_BRL[fromCurrency as AppCurrency] ?? 1)
    return brl / CURRENCY_TO_BRL[currency]
  }

  const fmtMiC = (brlValue: number): string => {
    const v = fromBRL(brlValue)
    const sym = symbol
    if (v === 0) return `${sym} 0,0`
    const abs = Math.abs(v)
    if (abs >= 1_000_000_000) return `${sym} ${(v / 1_000_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Bi`
    if (abs >= 1_000_000) return `${sym} ${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Mi`
    if (abs >= 1_000) return `${sym} ${(v / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} Mil`
    return `${sym} ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
  }

  const fmtC = (brlValue: number): string => {
    const v = fromBRL(brlValue)
    return `${symbol} ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
  }

  const t = (key: string): string => {
    const entry = translations[key]
    if (!entry) return key
    return entry[language] ?? key
  }

  return (
    <AppContext.Provider value={{ currency, setCurrency, language, setLanguage, symbol, fromBRL, convert, fmtMiC, fmtC, t, currentPage, setCurrentPage, openAtletaId, navigateToAtleta, clearOpenAtleta, isDark, toggleDark }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
