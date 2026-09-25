// src/lib/nationality.ts
// Nacionalidade do cadastro (texto livre) → país e bandeira.
//
// Aceita o nome do país ("Brasil", "Colômbia"), o gentílico ("brasileiro",
// "colombiana"), variantes em inglês/espanhol e códigos ISO/FIFA ("BR", "BRA");
// caixa e acentos não importam. Em dupla nacionalidade ("Brasil / Itália")
// vale a primeira reconhecida. A bandeira vem do country-flag-icons (SVG 3:2):
// só os países desta lista entram no bundle.

import {
  AE, AL, AM, AO, AR, AT, AU, BA, BE, BF, BG, BJ, BO, BR, CA, CD, CG, CH, CI, CL,
  CM, CN, CO, CR, CU, CV, CY, CZ, DE, DK, DO, DZ, EC, EG, ES, FI, FR, GA, GB,
  GB_ENG, GB_NIR, GB_SCT, GB_WLS, GE, GH, GN, GQ, GR, GT, GW, HN, HR, HT, HU, IE,
  IL, IN, IQ, IR, IS, IT, JM, JP, KE, KR, LU, MA, ME, MK, ML, MX, MZ, NG, NI, NL,
  NO, NZ, PA, PE, PL, PT, PY, QA, RO, RS, RU, SA, SE, SI, SK, SN, ST, SV, TG, TN,
  TR, TT, UA, US, UY, VE, XK, ZA,
} from 'country-flag-icons/string/3x2'
import { foldText } from './format'

export interface Country {
  /** ISO 3166-1 alfa-2 (ou subdivisão, ex.: GB-ENG). */
  code: string
  /** nome do país em português. */
  name: string
  /** bandeira pronta para <img src>. */
  flagSrc: string
}

// [código, bandeira, nome em PT, apelidos separados por vírgula]
const TABLE: [string, string, string, string][] = [
  // América do Sul
  ['BR', BR, 'Brasil', 'brazil, brasileiro, brasileira, bra'],
  ['AR', AR, 'Argentina', 'argentino, arg'],
  ['UY', UY, 'Uruguai', 'uruguay, uruguaio, uruguaia, uruguayo, uru, ury'],
  ['PY', PY, 'Paraguai', 'paraguay, paraguaio, paraguaia, paraguayo, par, pry'],
  ['CL', CL, 'Chile', 'chileno, chilena, chi, chl'],
  ['CO', CO, 'Colômbia', 'colombia, colombiano, colombiana, col'],
  ['EC', EC, 'Equador', 'ecuador, equatoriano, equatoriana, ecuatoriano, ecu'],
  ['PE', PE, 'Peru', 'peruano, peruana, per'],
  ['VE', VE, 'Venezuela', 'venezuelano, venezuelana, venezolano, ven'],
  ['BO', BO, 'Bolívia', 'bolivia, boliviano, boliviana, bol'],
  // Américas do Norte e Central, Caribe
  ['MX', MX, 'México', 'mexico, mexicano, mexicana, mex'],
  ['US', US, 'Estados Unidos', 'eua, usa, united states, estados unidos da america, americano, americana, estadunidense, norte americano, norte americana'],
  ['CA', CA, 'Canadá', 'canada, canadense, can'],
  ['CR', CR, 'Costa Rica', 'costarriquenho, costarriquenha, costa riquenho, costarricense, crc'],
  ['HN', HN, 'Honduras', 'hondurenho, hondurenha, hondureno, hon'],
  ['PA', PA, 'Panamá', 'panama, panamenho, panamenha, panameno, pan'],
  ['GT', GT, 'Guatemala', 'guatemalteco, guatemalteca, gua'],
  ['SV', SV, 'El Salvador', 'salvadorenho, salvadorenha, salvadoreno, slv'],
  ['NI', NI, 'Nicarágua', 'nicaragua, nicaraguense, nca'],
  ['JM', JM, 'Jamaica', 'jamaicano, jamaicana, jam'],
  ['HT', HT, 'Haiti', 'haitiano, haitiana, hai'],
  ['CU', CU, 'Cuba', 'cubano, cubana, cub'],
  ['DO', DO, 'República Dominicana', 'rep dominicana, dominican republic, dominicano, dominicana, dom'],
  ['TT', TT, 'Trinidad e Tobago', 'trinidad and tobago, trinitino, tri'],
  // Europa
  ['PT', PT, 'Portugal', 'portugues, portuguesa, por, prt'],
  ['ES', ES, 'Espanha', 'spain, espana, espanhol, espanhola, espanol, esp'],
  ['FR', FR, 'França', 'france, francia, frances, francesa, fra'],
  ['IT', IT, 'Itália', 'italy, italia, italiano, italiana, ita'],
  ['DE', DE, 'Alemanha', 'germany, alemania, alemao, alema, ger, deu'],
  ['GB-ENG', GB_ENG, 'Inglaterra', 'england, ingles, inglesa, eng'],
  ['GB-SCT', GB_SCT, 'Escócia', 'scotland, escocia, escoces, escocesa, sco'],
  ['GB-WLS', GB_WLS, 'País de Gales', 'wales, gales, galesa, wal'],
  ['GB-NIR', GB_NIR, 'Irlanda do Norte', 'northern ireland, norte irlandes, norte irlandesa, nir'],
  ['GB', GB, 'Reino Unido', 'united kingdom, uk, gra bretanha, great britain, britanico, britanica, gbr'],
  ['IE', IE, 'Irlanda', 'ireland, irlandes, irlandesa, irl'],
  ['NL', NL, 'Holanda', 'paises baixos, netherlands, holland, holandes, holandesa, neerlandes, neerlandesa, ned, nld'],
  ['BE', BE, 'Bélgica', 'belgium, belgica, belga, bel'],
  ['CH', CH, 'Suíça', 'switzerland, suica, suiza, suico, sui, che'],
  ['AT', AT, 'Áustria', 'austria, austriaco, austriaca, aut'],
  ['HR', HR, 'Croácia', 'croatia, croacia, croata, cro, hrv'],
  ['RS', RS, 'Sérvia', 'serbia, servia, servio, serbio, srb'],
  ['PL', PL, 'Polônia', 'poland, polonia, polones, polonesa, pol'],
  ['CZ', CZ, 'República Tcheca', 'tchequia, czechia, czech republic, tcheco, tcheca, checo, cze'],
  ['SK', SK, 'Eslováquia', 'slovakia, eslovaquia, eslovaco, eslovaca, svk'],
  ['SI', SI, 'Eslovênia', 'slovenia, eslovenia, esloveno, eslovena, svn'],
  ['DK', DK, 'Dinamarca', 'denmark, dinamarques, dinamarquesa, den, dnk'],
  ['SE', SE, 'Suécia', 'sweden, suecia, sueco, sueca, swe'],
  ['NO', NO, 'Noruega', 'norway, noruegues, norueguesa, nor'],
  ['FI', FI, 'Finlândia', 'finland, finlandia, finlandes, finlandesa, fin'],
  ['IS', IS, 'Islândia', 'iceland, islandia, islandes, islandesa, isl'],
  ['GR', GR, 'Grécia', 'greece, grecia, grego, grega, griego, gre, grc'],
  ['TR', TR, 'Turquia', 'turkey, turkiye, turco, turca, tur'],
  ['RU', RU, 'Rússia', 'russia, russo, russa, ruso, rus'],
  ['UA', UA, 'Ucrânia', 'ukraine, ucrania, ucraniano, ucraniana, ukr'],
  ['RO', RO, 'Romênia', 'romania, romenia, romeno, romena, rumano, rou'],
  ['BG', BG, 'Bulgária', 'bulgaria, bulgaro, bulgara, bul'],
  ['HU', HU, 'Hungria', 'hungary, hungaro, hungara, hun'],
  ['BA', BA, 'Bósnia e Herzegovina', 'bosnia, bosnia and herzegovina, bosnio, bih'],
  ['ME', ME, 'Montenegro', 'montenegrino, montenegrina, mne'],
  ['MK', MK, 'Macedônia do Norte', 'north macedonia, macedonia, macedonio, mkd'],
  ['AL', AL, 'Albânia', 'albania, albanes, albanesa, alb'],
  ['XK', XK, 'Kosovo', 'kosovar, kos'],
  ['GE', GE, 'Geórgia', 'georgia, georgiano, georgiana, geo'],
  ['AM', AM, 'Armênia', 'armenia, armenio, arm'],
  ['LU', LU, 'Luxemburgo', 'luxembourg, luxemburgues, luxemburguesa, lux'],
  ['CY', CY, 'Chipre', 'cyprus, cipriota, cyp'],
  ['IL', IL, 'Israel', 'israelense, israeli, isr'],
  // África
  ['NG', NG, 'Nigéria', 'nigeria, nigeriano, nigeriana, nga'],
  ['GH', GH, 'Gana', 'ghana, ganes, ganesa, ganense, gha'],
  ['SN', SN, 'Senegal', 'senegales, senegalesa, sen'],
  ['CI', CI, 'Costa do Marfim', 'ivory coast, cote d ivoire, costa de marfil, marfinense, civ'],
  ['CM', CM, 'Camarões', 'cameroon, camaroes, camerun, camaronense, camarones, cmr'],
  ['MA', MA, 'Marrocos', 'morocco, marruecos, marroquino, marroquina, mar'],
  ['DZ', DZ, 'Argélia', 'algeria, argelia, argelino, argelina, alg'],
  ['TN', TN, 'Tunísia', 'tunisia, tunisiano, tunisiana, tunecino, tun'],
  ['EG', EG, 'Egito', 'egypt, egipto, egipcio, egipcia, egy'],
  ['AO', AO, 'Angola', 'angolano, angolana, ang'],
  ['MZ', MZ, 'Moçambique', 'mozambique, mocambique, mocambicano, mocambicana, moz'],
  ['CV', CV, 'Cabo Verde', 'cape verde, cabo verdiano, cabo verdiana, cpv'],
  ['GW', GW, 'Guiné-Bissau', 'guine bissau, guinea bissau, guineense, gnb'],
  ['GN', GN, 'Guiné', 'guine, guinea, guineano, guineana, gui'],
  ['GQ', GQ, 'Guiné Equatorial', 'guine equatorial, equatorial guinea, eqg'],
  ['ML', ML, 'Mali', 'malinense, maliano, maliana, mli'],
  ['BF', BF, 'Burkina Faso', 'burquinense, burkinabe, bfa'],
  ['CD', CD, 'RD Congo', 'rd congo, dr congo, congo kinshasa, republica democratica do congo, cod'],
  ['CG', CG, 'Congo', 'congo brazzaville, republica do congo, congoles, congolesa, cgo'],
  ['GA', GA, 'Gabão', 'gabon, gabones, gabonesa, gab'],
  ['ZA', ZA, 'África do Sul', 'south africa, sudafrica, sul africano, sul africana, rsa'],
  ['ST', ST, 'São Tomé e Príncipe', 'sao tome, santomense, sao tomense, stp'],
  ['KE', KE, 'Quênia', 'kenya, quenia, queniano, queniana, ken'],
  ['TG', TG, 'Togo', 'togoles, togolesa, tog'],
  ['BJ', BJ, 'Benin', 'benim, beninense, ben'],
  // Ásia, Oceania e Oriente Médio
  ['JP', JP, 'Japão', 'japan, japon, japones, japonesa, jpn'],
  ['KR', KR, 'Coreia do Sul', 'south korea, korea, coreia, corea del sur, sul coreano, sul coreana, coreano, coreana, kor'],
  ['CN', CN, 'China', 'chines, chinesa, chn'],
  ['AU', AU, 'Austrália', 'australia, australiano, australiana, aus'],
  ['NZ', NZ, 'Nova Zelândia', 'new zealand, nova zelandia, neozelandes, neozelandesa, nzl'],
  ['SA', SA, 'Arábia Saudita', 'saudi arabia, arabia saudita, saudita, ksa'],
  ['QA', QA, 'Catar', 'qatar, catari, qatari, qat'],
  ['AE', AE, 'Emirados Árabes Unidos', 'uae, united arab emirates, emirados arabes, emirados, emiradense, are'],
  ['IR', IR, 'Irã', 'iran, irao, iraniano, iraniana, irn'],
  ['IQ', IQ, 'Iraque', 'iraq, iraquiano, iraquiana, irq'],
  ['IN', IN, 'Índia', 'india, indiano, indiana, ind'],
]

interface Entry { code: string; name: string; svg: string }
const INDEX = new Map<string, Entry>()
for (const [code, svg, name, aliases] of TABLE) {
  const entry = { code, name, svg }
  const keys = [name, code.includes('-') ? '' : code, ...aliases.split(',')]
  for (const k of keys) {
    const n = foldText(k)
    if (n && !INDEX.has(n)) INDEX.set(n, entry)
  }
}

const cache = new Map<string, Country>()
function toCountry(e: Entry): Country {
  let c = cache.get(e.code)
  if (!c) {
    c = { code: e.code, name: e.name, flagSrc: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(e.svg)}` }
    cache.set(e.code, c)
  }
  return c
}

// Separadores de dupla nacionalidade: "Brasil / Itália", "Brasil e Portugal"…
const SEPARATORS = /[/,;|()]|\s+e\s+|\s+-\s+/

/** País de uma nacionalidade do cadastro (null quando vazia ou não reconhecida). */
export function countryOf(nationality: string | null | undefined): Country | null {
  if (!nationality) return null
  const parts = [nationality, ...nationality.split(SEPARATORS)].map(foldText).filter(Boolean)
  // 1º o texto inteiro de cada parte; depois palavra a palavra ("brasileiro
  // naturalizado", "nascido na Argentina") — só palavras de 4+ letras, para um
  // "do"/"de" solto não virar código de país.
  for (const p of parts) {
    const e = INDEX.get(p)
    if (e) return toCountry(e)
  }
  for (const p of parts) {
    for (const w of p.split(' ')) {
      const e = w.length >= 4 ? INDEX.get(w) : undefined
      if (e) return toCountry(e)
    }
  }
  return null
}

/**
 * Estrangeiro para o limite de estrangeiros da CBF? Brasileiro (inclusive com
 * dupla nacionalidade) = false; qualquer outra nacionalidade informada = true;
 * sem nacionalidade no cadastro = null.
 */
export function isForeign(nationality: string | null | undefined): boolean | null {
  if (!nationality?.trim()) return null
  return ![nationality, ...nationality.split(SEPARATORS)].some(p => countryOf(p)?.code === 'BR')
}
