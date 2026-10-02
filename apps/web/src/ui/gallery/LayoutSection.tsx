import { domAnimation, LazyMotion, m } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { AmbientOrbs } from '../../app/layout/AmbientOrbs'
import { SiteFooter } from '../../app/layout/SiteFooter'
import { SiteHeader } from '../../app/layout/SiteHeader'
import { IDLE_TICKER } from '../../features/week/HomePage'
import {
  HeroDivider,
  HeroGrid,
  HeroSubtitle,
  HeroTitle,
  MarqueeBand,
  SideLabel,
  useHeroReveal,
  Vignette,
} from '../../features/week/hero'
import { t } from '../../i18n'
import { Button } from '../Button'
import { cx } from '../forceState'
import { GlassSurface } from '../GlassSurface'
import { GlassProvider, useGlassCapability } from '../glass'
import { LAYOUT_ANCHORS, type LayoutKey } from './anchors'
import styles from './GalleryPage.module.css'
import { GalleryBlock, GalleryRow, GallerySection, StateCell } from './parts'

const title = (key: LayoutKey) => t(`dev.gallery.layout.pieces.${key}`)
const anchor = (key: LayoutKey) => LAYOUT_ANCHORS.find((item) => item.key === key)!.id

/**
 * «Layout del sello» (tarea 0.7 en la galería, 0.9): las piezas del marco y del hero en sus variantes.
 * Todas siguen los dos interruptores de la cabecera: «Reducir movimiento» (cada pieza pasa a su
 * variante sin movimiento) y cristal (apagado, las `GlassSurface` se quedan en su alternativa).
 *
 * La isla, el pie y el titular son de página (landmarks, `<h1>`, enlaces repetidos): aquí van como
 * muestra inerte (`inert` + `aria-hidden`), fuera del orden de tabulación y del árbol accesible, para
 * no duplicar la navegación ni el titular de la página.
 */
export function LayoutSection() {
  return (
    <GallerySection
      id="layout"
      title={t('dev.gallery.sections.layout')}
      intro={t('dev.gallery.layout.intro')}
    >
      <GlassStatus />
      <IslandBlock />
      <FooterBlock />
      <HeroTitleBlock />
      <SideLabelBlock />
      <BackdropBlock />
      <MarqueeBlock />
      <OrbsBlock />
      <GlassSurfaceBlock />
    </GallerySection>
  )
}

/** Muestra de una pieza de página: se ve, pero no se enfoca ni se lee. */
function Specimen({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx(styles.specimen, className)} inert aria-hidden="true">
      {children}
    </div>
  )
}

/** Si este navegador pinta ahora el cristal de verdad (cambia en caliente con los interruptores). */
function GlassStatus() {
  const glass = useGlassCapability()
  return (
    <p className={styles.layoutStatus} data-glass-capability={glass ? 'on' : 'off'}>
      {glass ? t('dev.gallery.layout.capability.on') : t('dev.gallery.layout.capability.off')}
    </p>
  )
}

/* ── Isla y pie ────────────────────────────────────────────────────────────────────────── */

function IslandBlock() {
  return (
    <GalleryBlock id={anchor('island')} title={title('island')} stage>
      <GalleryRow wide>
        <StateCell label={t('dev.gallery.layout.variants.glassOn')} span>
          <Specimen className={styles.islandSpecimen}>
            <SiteHeader />
          </Specimen>
        </StateCell>
        <StateCell label={t('dev.gallery.layout.variants.glassOff')} span>
          <GlassProvider enabled={false}>
            <Specimen className={styles.islandSpecimen}>
              <SiteHeader />
            </Specimen>
          </GlassProvider>
        </StateCell>
      </GalleryRow>
      <p className={styles.caption}>{t('dev.gallery.layout.specimen')}</p>
    </GalleryBlock>
  )
}

function FooterBlock() {
  return (
    <GalleryBlock id={anchor('footer')} title={title('footer')} stage>
      <Specimen className={styles.footerSpecimen}>
        <SiteFooter />
      </Specimen>
      <p className={styles.caption}>{t('dev.gallery.layout.specimen')}</p>
    </GalleryBlock>
  )
}

/* ── Hero: titular, rótulos, rejilla y viñeta ──────────────────────────────────────────── */

/** Contenedor que orquesta la entrada del hero (lo que hace `HeroSection` en la página). */
function RevealStage({ className, children }: { className?: string; children: ReactNode }) {
  const { container } = useHeroReveal()
  return (
    <LazyMotion features={domAnimation}>
      <m.div className={className} initial="hidden" animate="shown" variants={container}>
        {children}
      </m.div>
    </LazyMotion>
  )
}

function HeroTitleBlock() {
  // Cambiar la clave vuelve a montar el escenario y repite la entrada.
  const [take, setTake] = useState(0)
  return (
    <GalleryBlock id={anchor('heroTitle')} title={title('heroTitle')}>
      <GalleryRow wide>
        <StateCell label={t('dev.gallery.layout.variants.entrance')} span>
          <Specimen>
            <RevealStage key={take} className={styles.heroStage}>
              <div className={styles.heroBackdrop}>
                <Vignette />
                <HeroGrid />
              </div>
              <div className={styles.heroContent}>
                <HeroTitle solid={t('home.hero.titleSolid')} outline={t('home.hero.titleOutline')} />
                <HeroDivider />
                <HeroSubtitle>{t('home.hero.subtitle')}</HeroSubtitle>
              </div>
            </RevealStage>
          </Specimen>
        </StateCell>
      </GalleryRow>
      <div className={styles.inline}>
        <Button variant="outline" size="sm" icon="play" onClick={() => setTake((value) => value + 1)}>
          {t('dev.gallery.layout.replay')}
        </Button>
      </div>
    </GalleryBlock>
  )
}

function SideLabelBlock() {
  return (
    <GalleryBlock id={anchor('sideLabel')} title={title('sideLabel')}>
      <GalleryRow wide>
        <StateCell label={t('dev.gallery.layout.variants.labels')} span>
          <Specimen>
            <RevealStage className={styles.sideLabelStage}>
              <SideLabel side="left">{t('home.hero.sideWeek')}</SideLabel>
              <SideLabel side="right">{t('home.hero.sideSeason')}</SideLabel>
            </RevealStage>
          </Specimen>
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}

function BackdropBlock() {
  return (
    <GalleryBlock id={anchor('backdrop')} title={title('backdrop')}>
      <GalleryRow wide>
        <StateCell label={t('dev.gallery.layout.variants.grid')}>
          <div className={styles.backdropFrame}>
            <HeroGrid />
          </div>
        </StateCell>
        <StateCell label={t('dev.gallery.layout.variants.vignette')}>
          <div className={styles.backdropFrame}>
            <Vignette />
          </div>
        </StateCell>
        <StateCell label={t('dev.gallery.layout.variants.both')}>
          <div className={styles.backdropFrame}>
            <Vignette />
            <HeroGrid />
          </div>
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}

/* ── Marquee y orbes ───────────────────────────────────────────────────────────────────── */

function MarqueeBlock() {
  return (
    <GalleryBlock id={anchor('marquee')} title={title('marquee')}>
      <GalleryRow wide>
        <StateCell label={t('dev.gallery.layout.variants.live')} span>
          <MarqueeBand
            label={t('home.ticker.label')}
            pauseLabel={t('home.ticker.pause')}
            items={IDLE_TICKER.map((key) => t(key))}
          />
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}

function OrbsBlock() {
  return (
    <GalleryBlock id={anchor('orbs')} title={title('orbs')}>
      <GalleryRow wide>
        <StateCell label={t('dev.gallery.layout.variants.orbs')} span>
          <div className={styles.orbsFrame}>
            <AmbientOrbs />
          </div>
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}

/* ── GlassSurface ──────────────────────────────────────────────────────────────────────── */

/** Panel de cristal sobre un fondo con forma, para que se vea la refracción del borde. */
function GlassScene({ children }: { children: ReactNode }) {
  return (
    <div className={styles.glassScene}>
      <span className={styles.glassSceneWord} aria-hidden="true">
        {t('home.hero.titleOutline')}
      </span>
      {children}
    </div>
  )
}

function GlassSurfaceBlock() {
  const sample = t('dev.gallery.layout.glassSample')
  return (
    <GalleryBlock id={anchor('glassSurface')} title={title('glassSurface')} stage>
      <GalleryRow wide>
        <StateCell label={t('dev.gallery.layout.variants.default')}>
          <GlassScene>
            <GlassSurface className={styles.glassPanel}>{sample}</GlassSurface>
          </GlassScene>
        </StateCell>
        <StateCell label={t('dev.gallery.layout.variants.aberration')}>
          <GlassScene>
            <GlassSurface className={styles.glassPanel} chromaticAberration>
              {sample}
            </GlassSurface>
          </GlassScene>
        </StateCell>
        <StateCell label={t('dev.gallery.layout.variants.island')}>
          <GlassScene>
            <GlassSurface className={styles.glassPanel} backdropBlur="var(--bb-glass-blur-card)">
              {sample}
            </GlassSurface>
          </GlassScene>
        </StateCell>
        <StateCell label={t('dev.gallery.layout.variants.glassOff')}>
          <GlassScene>
            <GlassProvider enabled={false}>
              <GlassSurface className={styles.glassPanel}>{sample}</GlassSurface>
            </GlassProvider>
          </GlassScene>
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}
