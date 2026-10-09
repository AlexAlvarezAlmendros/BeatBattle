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

/**
 * Secciones de `/ajustes/*` (Opciones, §3.8.14 y §2.18), en el orden de sus pestañas: slug de la URL →
 * clave i18n `settings.<clave>`. `/ajustes` lleva a la primera.
 */
export const SETTINGS_SECTIONS = {
  sonido: 'sound',
  movimiento: 'motion',
  cuenta: 'account',
  perfil: 'profile',
  emails: 'emails',
  sesiones: 'sessions',
  privacidad: 'privacy',
  accesibilidad: 'accessibility',
} as const

/** Primera sección de Opciones: a donde lleva `/ajustes`. */
export const FIRST_SETTINGS_SECTION: SettingsSection = 'sonido'
export type SettingsSection = keyof typeof SETTINGS_SECTIONS
export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[SettingsSection]

const segment = (value: string) => encodeURIComponent(value)

/**
 * Id del hueco «Avísame del próximo drop» de la tarjeta de la semana en «calendario vacío» (§2.12.3,
 * §3.8.3). El formulario llega con la alerta de drop sin cuenta (Fase 3); el ancla existe desde ya para
 * que los avisos y los emails puedan enlazarlo.
 */
export const DROP_ALERT_ID = 'alerta'

export const paths = {
  home: () => '/',
  dropAlert: () => `/#${DROP_ALERT_ID}`,
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
  /** La bienvenida tras verificar el email (§3.8.9): «NUEVO JUGADOR» y la carta impresa. */
  welcome: () => '/bienvenida',
  /** La página de baja del pie de los avisos (§2.12.4); el token lo pone el email. */
  unsubscribe: (token: string) => `/baja?token=${encodeURIComponent(token)}`,
  admin: () => '/admin',
  legal: (doc: LegalDoc) => `/legal/${doc}`,
} as const

/** URL de la web del sello (guía §1.7, `RF-OTP-01`). */
export const OTHER_PEOPLE_URL = 'https://www.otherpeople.es'
