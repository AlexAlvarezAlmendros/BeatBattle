import type { SimpleMessageKey } from '../../i18n'
import { OTHER_PEOPLE_URL, paths } from '../paths'

/**
 * Enlaces del marco (guía §2.16, §2.18 y §3.1): los de la isla de navegación y los del pie que llevan
 * a la web del sello. Un solo sitio para que la isla, el menú móvil y el pie no diverjan.
 */

export interface NavItem {
  to: string
  label: SimpleMessageKey
}

/** Navegación principal: la isla en escritorio y el panel en móvil, en este orden. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: paths.home(), label: 'layout.nav.week' },
  { to: paths.jury(), label: 'layout.nav.jury' },
  { to: paths.weeks(), label: 'layout.nav.results' },
  { to: paths.hallOfFame(), label: 'layout.nav.hallOfFame' },
  { to: paths.howItWorks(), label: 'layout.nav.howItWorks' },
]

/** «Entrar»: botón de contorno a la derecha de la isla (y al pie del panel móvil). */
export const SIGN_IN_ITEM: NavItem = { to: paths.signIn(), label: 'layout.nav.signIn' }

/** Logo *OTP.*: enlaza a la home del sello (`RF-OTP-01`). */
export const OTHER_PEOPLE_HOME = `${OTHER_PEOPLE_URL}/`

export interface ExternalLink {
  href: string
  label: SimpleMessageKey
}

/** Secciones de la web del sello que enlaza el pie. */
export const OTHER_PEOPLE_LINKS: readonly ExternalLink[] = [
  { href: `${OTHER_PEOPLE_URL}/artistas`, label: 'layout.footer.artists' },
  { href: `${OTHER_PEOPLE_URL}/beats`, label: 'layout.footer.beats' },
  { href: `${OTHER_PEOPLE_URL}/eventos`, label: 'layout.footer.events' },
  { href: `${OTHER_PEOPLE_URL}/contacto`, label: 'layout.footer.contact' },
]

export type SocialNetwork = 'instagram' | 'youtube' | 'threads'

/** Redes del sello: las del JSON-LD (`sameAs`) de `ReactOtpWeb/frontend/index.html`. */
export const OTHER_PEOPLE_SOCIAL: readonly (ExternalLink & { network: SocialNetwork })[] = [
  {
    network: 'instagram',
    href: 'https://www.instagram.com/otherpeople.records/',
    label: 'layout.footer.instagram',
  },
  { network: 'youtube', href: 'https://www.youtube.com/@otherpeoplerecords', label: 'layout.footer.youtube' },
  {
    network: 'threads',
    href: 'https://www.threads.com/@otherpeople.records',
    label: 'layout.footer.threads',
  },
]

/** `rel` de todo enlace externo que se abre en otra pestaña. */
export const EXTERNAL_REL = 'noopener noreferrer'
