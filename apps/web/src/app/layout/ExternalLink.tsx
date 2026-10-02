import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { t } from '../../i18n'
import { EXTERNAL_REL } from './navigation'

interface ExternalLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'> {
  href: string
  children: ReactNode
}

/**
 * Enlace a otra web (el sello, sus redes): se abre en una pestaña nueva con
 * `rel="noopener noreferrer"` y lo dice a los lectores de pantalla («se abre en una pestaña nueva»).
 */
export function ExternalLink({ href, children, ...rest }: ExternalLinkProps) {
  return (
    <a href={href} target="_blank" rel={EXTERNAL_REL} {...rest}>
      {children} <span className="sr-only">{t('layout.newTab')}</span>
    </a>
  )
}
