// src/i18n/index.ts
// Tradução da interface (PT · EN · ES), ligada ao seletor de idioma do topo.
//
// O texto em português é a própria chave: tr('Atletas') devolve 'Athletes'
// com o idioma EN. Sem tradução cadastrada, devolve o texto recebido — por
// isso dados do usuário (nomes, clubes, descrições) passam intactos.
// Textos com valores variáveis usam trf('Abrir {0}', nome).
//
// O idioma é global (não depende de contexto React) para que rótulos e
// formatadores fora de componentes também traduzam; a troca de idioma
// remonta a árvore da aplicação (ver LanguageBoundary em App.tsx).

import { EN } from './en'
import { ES } from './es'

export type Lang = 'pt' | 'en' | 'es'

const STORAGE_KEY = 'app-language'
const HTML_LANG: Record<Lang, string> = { pt: 'pt-BR', en: 'en', es: 'es' }
const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-GB', es: 'es-ES' }
const DICTS: Record<Exclude<Lang, 'pt'>, Map<string, string>> = {
  en: new Map(Object.entries(EN)),
  es: new Map(Object.entries(ES)),
}

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'es' || v === 'pt') return v
  } catch { /* sem storage: português */ }
  return 'pt'
}

let current: Lang = initialLang()
if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[current]

export function getLang(): Lang { return current }

export function setLang(lang: Lang): void {
  current = lang
  try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* ignora */ }
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[lang]
}

/** Locale de números e datas do idioma atual (pt-BR · en-GB · es-ES). */
export function locale(): string { return LOCALE[current] }

/** Traduz um texto da interface (chave = texto em português). null/undefined passam. */
export function tr<T extends string | null | undefined>(text: T): T extends string ? string : T {
  if (text == null || current === 'pt') return text as T extends string ? string : T
  return (DICTS[current].get(text) ?? text) as T extends string ? string : T
}

/** Traduz um texto com lacunas {0}, {1}… e preenche com os valores. */
export function trf(text: string, ...values: unknown[]): string {
  return tr(text).replace(/\{(\d+)\}/g, (_, i: string) => {
    const v = values[Number(i)]
    return v == null ? '' : String(v)
  })
}

/** Plural: trn(n, '{0} parcela', '{0} parcelas') — escolhe a forma, traduz e preenche {0} = n. */
export function trn(count: number, one: string, many: string, ...values: unknown[]): string {
  return trf(count === 1 ? one : many, count, ...values)
}

/** Colunas de uma planilha de relatório no idioma atual (só relatórios de
 *  leitura — planilhas de importação/exportação de dados ficam em português). */
/** Rótulo composto gerado pelo sistema e guardado como dado ("Luvas — parcela 2",
 *  "Obrigação clube — Benfica"): traduz cada parte separada por " — " só na
 *  exibição; partes que são dados (nomes, descrições) passam intactas. */
export function trParts(text: string): string {
  if (current === 'pt') return text
  return text.split(' — ').map(part => {
    const m = /^parcela (\d+)$/.exec(part)
    return m ? trf('parcela {0}', m[1]) : tr(part)
  }).join(' — ')
}

export function trCols<C extends { header: string }>(cols: C[]): C[] {
  return cols.map(c => ({ ...c, header: tr(c.header) }))
}
