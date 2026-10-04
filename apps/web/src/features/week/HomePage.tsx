import { useId } from 'react'
import { DocumentTitle } from '../../app/DocumentTitle'
import { paths } from '../../app/paths'
import { type SimpleMessageKey, t } from '../../i18n'
import { Button } from '../../ui/Button'
import { DropAlertSection } from '../drop/DropAlertSection'
import {
  HeroActions,
  HeroDivider,
  HeroNote,
  HeroSection,
  HeroSubtitle,
  HeroTitle,
  MarqueeBand,
  SideLabel,
} from './hero'

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

/**
 * `/` — home de la semana (guía §3.8.3), de momento en el estado «calendario vacío» (§2.19: aún no hay
 * semanas): el hero del sello con «BEAT / BATTLE», sin cuenta atrás, con «El próximo drop está en el
 * horno.» y la banda de marquee debajo. Los botones son el `Button` base en su tamaño `hero` (el
 * contorno, sobre cristal); el rojo lleva a la sección «Avísame del próximo drop» de esta misma página
 * (§2.12.3), que de momento solo anuncia el formulario. Las demás secciones de §3.8.3 llegan con sus
 * fases.
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
              pauseLabel={t('home.ticker.pause')}
              items={IDLE_TICKER.map((key) => t(key))}
            />
          </>
        }
      >
        <HeroTitle id={titleId} solid={t('home.hero.titleSolid')} outline={t('home.hero.titleOutline')} />
        <HeroDivider />
        <HeroSubtitle>{t('home.hero.subtitle')}</HeroSubtitle>
        <HeroActions>
          <Button size="hero" to={paths.dropAlert()}>
            {t('home.hero.notify')}
          </Button>
          <Button size="hero" variant="outline" glass to={paths.howItWorks()}>
            {t('home.hero.howItWorks')}
          </Button>
        </HeroActions>
        <HeroNote>{t('home.hero.emptyCalendar')}</HeroNote>
      </HeroSection>
      <DropAlertSection />
    </>
  )
}
