/**
 * Rutas de la app (guía §2.18) como funciones, para no escribir URLs a mano por la app:
 * `<Link to={paths.week(slug)}>`. El test de rutas comprueba que cada una resuelve a su página.
 */

/** Documentos legales de `/legal/:doc` (el slug es también la clave i18n `legal.docs.<doc>`). */
export const LEGAL_DOCS = ['bases', 'terminos', 'privacidad', 'cookies'] as const
export type LegalDoc = (typeof LEGAL_DOCS)[number]

export function isLegalDoc(value: unknown): value is LegalDoc {
  return typeof value === 'string' && (LEGAL_DOCS as readonly string[]).includes(value)
}

/** Secciones de `/ajustes/*`: slug de la URL → clave i18n `settings.<clave>`. */
export const SETTINGS_SECTIONS = {
  cuenta: 'account',
  perfil: 'profile',
  sonido: 'sound',
  emails: 'emails',
  sesiones: 'sessions',
  privacidad: 'privacy',
} as const
export type SettingsSection = keyof typeof SETTINGS_SECTIONS
export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[SettingsSection]

const segment = (value: string) => encodeURIComponent(value)

export const paths = {
  home: () => '/',
  week: (slug: string) => `/semana/${segment(slug)}`,
  weekResults: (slug: string) => `/semana/${segment(slug)}/resultados`,
  weeks: () => '/semanas',
  entry: (id: string) => `/e/${segment(id)}`,
  jury: () => '/jurado',
  upload: () => '/subir',
  profile: (username: string) => `/p/${segment(username)}`,
  hallOfFame: () => '/salon-de-la-fama',
  season: (id: string) => `/temporada/${segment(id)}`,
  howItWorks: () => '/como-funciona',
  settings: (section?: SettingsSection) => (section ? `/ajustes/${section}` : '/ajustes'),
  signIn: () => '/entrar',
  signUp: () => '/registro',
  verify: () => '/verificar',
  recover: () => '/recuperar',
  admin: () => '/admin',
  legal: (doc: LegalDoc) => `/legal/${doc}`,
} as const

/** URL de la web del sello (guía §1.7, `RF-OTP-01`). */
export const OTHER_PEOPLE_URL = 'https://www.otherpeople.es'
