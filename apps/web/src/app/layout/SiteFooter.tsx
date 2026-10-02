import { useId } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n'
import { Trans } from '../../i18n/Trans'
import { GlassSurface } from '../../ui/GlassSurface'
import { LEGAL_DOCS, OTHER_PEOPLE_URL, paths } from '../paths'
import { ExternalLink } from './ExternalLink'
import { SocialIcon } from './icons'
import { OTHER_PEOPLE_LINKS, OTHER_PEOPLE_SOCIAL } from './navigation'
import { OTP_LOGO_SRC } from './OtpLogo'
import './SiteFooter.css'

/**
 * Pie del sello adaptado a la batalla (guía §2.16 y §3.8.3, `RF-OTP-01`), con la estructura y el
 * estilo de `Footer` de `ReactOtpWeb`: filete rojo arriba, bloque de marca (logo, nombre, barra roja y
 * descripción), tarjetas de cristal y franja inferior con el crédito, el © y los enlaces legales.
 *
 * - «Other People»: secciones de `otherpeople.es` (artistas, beats, eventos, contacto).
 * - «Síguenos»: las redes del sello (Instagram, YouTube, Threads).
 * - Todo enlace externo se abre en otra pestaña con `rel="noopener noreferrer"` (`ExternalLink`).
 */
export function SiteFooter() {
  const year = new Date().getFullYear()
  const labelTitleId = useId()
  const socialTitleId = useId()

  return (
    <footer className="site-footer">
      <div className="site-footer__content">
        <div className="site-footer__brand">
          <img
            className="site-footer__logo"
            src={OTP_LOGO_SRC}
            alt={t('layout.logo.alt')}
            width={64}
            height={41}
          />
          <h2 className="site-footer__name">{t('app.name')}</h2>
          <div className="site-footer__bar" aria-hidden="true" />
          <p className="site-footer__tagline">{t('footer.tagline')}</p>
        </div>

        <GlassSurface as="section" className="site-footer__card" aria-labelledby={labelTitleId}>
          <h3 id={labelTitleId} className="site-footer__card-title">
            {t('layout.footer.labelTitle')}
          </h3>
          <nav aria-label={t('layout.footer.labelNav')}>
            {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
            <ul role="list" className="site-footer__links">
              {OTHER_PEOPLE_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <ExternalLink href={href} className="site-footer__link">
                    {t(label)}
                  </ExternalLink>
                </li>
              ))}
            </ul>
          </nav>
        </GlassSurface>

        <GlassSurface as="section" className="site-footer__card" aria-labelledby={socialTitleId}>
          <h3 id={socialTitleId} className="site-footer__card-title">
            {t('layout.footer.socialTitle')}
          </h3>
          {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
          <ul role="list" className="site-footer__social" aria-label={t('layout.footer.socialNav')}>
            {OTHER_PEOPLE_SOCIAL.map(({ network, href, label }) => (
              <li key={network}>
                <ExternalLink href={href} className="site-footer__social-link">
                  <SocialIcon network={network} className="site-footer__social-icon" />
                  <span className="sr-only">{t(label)}</span>
                </ExternalLink>
              </li>
            ))}
          </ul>
        </GlassSurface>

        <div className="site-footer__bottom">
          <p className="site-footer__credit">
            <Trans
              k="footer.credit"
              values={{
                brand: t('app.brand'),
                otherPeople: (
                  <ExternalLink href={OTHER_PEOPLE_URL} className="site-footer__credit-link">
                    {t('footer.otherPeople')}
                  </ExternalLink>
                ),
              }}
            />
          </p>
          <p>{t('layout.footer.copyright', { year: String(year) })}</p>
          <nav aria-label={t('footer.legalLabel')}>
            {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
            <ul role="list" className="site-footer__legal">
              {LEGAL_DOCS.map((doc) => (
                <li key={doc}>
                  <Link to={paths.legal(doc)} className="site-footer__legal-link">
                    {t(`legal.docs.${doc}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
