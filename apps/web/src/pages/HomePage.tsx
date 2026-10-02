import { useId } from 'react'
import { DocumentTitle } from '../app/DocumentTitle'
import {
  HeroActions,
  HeroCta,
  HeroDivider,
  HeroNote,
  HeroSection,
  HeroSubtitle,
  HeroTitle,
  MarqueeBand,
  SideLabel,
} from '../app/layout/hero'
import { paths } from '../app/paths'
import { type SimpleMessageKey, t } from '../i18n'

/** Palabras del teletipo con el calendario vacío (en la Fase 3 llega el teletipo vivo, §3.8.3). */
export const IDLE_TICKER: readonly SimpleMessageKey[] = [
  'home.ticker.idle.nextDrop',
  'home.ticker.idle.everyMonday',
  'home.ticker.idle.flip',
  'home.ticker.idle.upload',
  'home.ticker.idle.vote',
  'home.ticker.idle.seal',
  'home.ticker.idle.brand',
]

/** Ancla del formulario «Avísame del próximo drop» en «Cómo funciona» (§2.12.3; llega en la Fase 3). */
export const DROP_ALERT_HASH = 'alerta'

/**
 * `/` — home de la semana (guía §3.8.3), de momento en el estado «calendario vacío» (§2.19: aún no hay
 * semanas): el hero del sello con «BEAT / BATTLE», sin cuenta atrás, con «El próximo drop está en el
 * horno.» y la banda de marquee debajo. Las demás secciones de §3.8.3 llegan con sus fases.
 */
export function HomePage() {
  const titleId = useId()
  return (
    <>
      <DocumentTitle />
      <HeroSection
        labelledBy={titleId}
        overlay={
          <>
            <SideLabel side="left">{t('home.hero.sideWeek')}</SideLabel>
            <SideLabel side="right">{t('home.hero.sideSeason')}</SideLabel>
            <MarqueeBand
              className="hero__band"
              label={t('home.ticker.label')}
              items={IDLE_TICKER.map((key) => t(key))}
            />
          </>
        }
      >
        <HeroTitle id={titleId} solid={t('home.hero.titleSolid')} outline={t('home.hero.titleOutline')} />
        <HeroDivider />
        <HeroSubtitle>{t('home.hero.subtitle')}</HeroSubtitle>
        <HeroActions>
          <HeroCta variant="primary" to={`${paths.howItWorks()}#${DROP_ALERT_HASH}`}>
            {t('home.hero.notify')}
          </HeroCta>
          <HeroCta variant="ghost" to={paths.howItWorks()}>
            {t('home.hero.howItWorks')}
          </HeroCta>
        </HeroActions>
        <HeroNote>{t('home.hero.emptyCalendar')}</HeroNote>
      </HeroSection>
    </>
  )
}
