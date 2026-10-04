import {
  type ColorToken,
  color,
  cssVarName,
  duration,
  ease,
  loop,
  reducedDuration,
  spring,
  stagger,
  toCssCubicBezier,
} from '@beatbattle/shared/tokens'
import { motion } from 'motion/react'
import { type CSSProperties, useRef, useState } from 'react'
import { formatNumber, t } from '../../i18n'
import { Button } from '../Button'
import { cx } from '../forceState'
import { useElementWidth } from '../hooks/useElementWidth'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { contrastLevel, contrastRatio } from './contrast'
import styles from './GalleryPage.module.css'
import { GalleryBlock, GallerySection } from './parts'

/* ── Color ─────────────────────────────────────────────────────────────────────────────── */

const COLOR_KEYS = Object.keys(color) as ColorToken[]

function ContrastValue({ foreground, background }: { foreground: string; background: string }) {
  const ratio = contrastRatio(foreground, background)
  const level = contrastLevel(ratio)
  return (
    <>
      {t('dev.gallery.color.ratio', {
        ratio: formatNumber(ratio, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      })}{' '}
      <span className={styles.badge} data-level={level}>
        {t(`dev.gallery.color.${level}`)}
      </span>
    </>
  )
}

export function ColorSection() {
  return (
    <GallerySection id="color" title={t('dev.gallery.sections.color')} intro={t('dev.gallery.color.note')}>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul role="list" className={styles.swatches}>
        {COLOR_KEYS.map((key) => {
          const cssVar = cssVarName('color', key)
          const value = color[key]
          return (
            <li key={key} className={styles.swatch}>
              <span className={styles.swatchChip} style={{ backgroundColor: `var(${cssVar})` }} />
              <code className={styles.swatchName}>{cssVar}</code>
              <span className={styles.swatchValue}>{value}</span>
              <dl className={styles.contrast}>
                <div>
                  <dt>{t('dev.gallery.color.onBlack')}</dt>
                  <dd>
                    <ContrastValue foreground={value} background={color.black} />
                  </dd>
                </div>
                <div>
                  <dt>{t('dev.gallery.color.onInk')}</dt>
                  <dd>
                    <ContrastValue foreground={value} background={color.ink800} />
                  </dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ul>
    </GallerySection>
  )
}

/* ── Tipografía ────────────────────────────────────────────────────────────────────────── */

const FONT_SIZES = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'hero'] as const
const WEIGHTS = ['regular', 'medium', 'semibold', 'bold', 'extrabold', 'black'] as const

export function TypographySection() {
  return (
    <GallerySection id="tipografia" title={t('dev.gallery.sections.typography')}>
      <GalleryBlock id="tipografia-familias" title={t('dev.gallery.typography.families')}>
        <div className={styles.families}>
          <div className={styles.family}>
            <p className={styles.familyName}>
              <code>--bb-font-display</code> · {t('dev.gallery.typography.display')}
            </p>
            <p className={styles.sampleDisplay}>{t('dev.gallery.typography.sampleDisplay')}</p>
          </div>
          <div className={styles.family}>
            <p className={styles.familyName}>
              <code>--bb-font-body</code> · {t('dev.gallery.typography.body')}
            </p>
            <p className={styles.sampleBody}>{t('dev.gallery.typography.sampleBody')}</p>
          </div>
          <div className={styles.family}>
            <p className={styles.familyName}>
              <code>--bb-font-mono</code> · {t('dev.gallery.typography.mono')}
            </p>
            <p className={styles.sampleMono}>{t('dev.gallery.typography.sampleMono')}</p>
          </div>
        </div>
      </GalleryBlock>

      <GalleryBlock id="tipografia-pesos" title={t('dev.gallery.typography.weights')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ul role="list" className={styles.weights}>
          {WEIGHTS.map((weight) => (
            <li key={weight} style={{ fontWeight: `var(--bb-weight-${weight})` }}>
              <code>--bb-weight-{weight}</code> {t('dev.gallery.typography.scaleSample')}
            </li>
          ))}
        </ul>
      </GalleryBlock>

      <GalleryBlock id="tipografia-escala" title={t('dev.gallery.typography.scale')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ul role="list" className={styles.scale}>
          {FONT_SIZES.map((size) => (
            <li key={size} className={styles.scaleRow}>
              <code>--bb-font-size-{size}</code>
              <span className={styles.scaleSample} style={{ fontSize: `var(--bb-font-size-${size})` }}>
                {t('dev.gallery.typography.scaleSample')}
              </span>
            </li>
          ))}
        </ul>
      </GalleryBlock>

      <GalleryBlock id="tipografia-titular" title={t('dev.gallery.typography.headline')}>
        <p className={styles.headline}>
          <span className={styles.headlineSolid}>{t('dev.gallery.typography.headlineSolid')}</span>
          <span className={cx(styles.headlineOutline, styles.headlineOutlineFixed)}>
            {t('dev.gallery.typography.headlineOutline')}
          </span>
        </p>
        <p className={styles.caps}>{t('dev.gallery.typography.capsSample')}</p>
      </GalleryBlock>
    </GallerySection>
  )
}

/* ── Espaciado, radios y sombras ───────────────────────────────────────────────────────── */

const SPACES = Array.from({ length: 16 }, (_, i) => i + 1)
const RADII = ['xs', 'sm', 'md', 'lg', 'xl', 'pill'] as const
const SHADOWS = ['card', 'float', 'glow-red', 'glass', 'cta', 'cta-hover', 'chip', 'playhead'] as const

export function SpacingSection() {
  return (
    <GallerySection id="espaciado" title={t('dev.gallery.sections.spacing')}>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul role="list" className={styles.spaces}>
        {SPACES.map((step) => (
          <li key={step} className={styles.spaceRow}>
            <code>--bb-space-{step}</code>
            <span className={styles.spaceBar} style={{ width: `var(--bb-space-${step})` }} />
          </li>
        ))}
      </ul>
    </GallerySection>
  )
}

export function RadiiSection() {
  return (
    <GallerySection id="radios" title={t('dev.gallery.sections.radii')}>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul role="list" className={styles.tiles}>
        {RADII.map((radius) => (
          <li key={radius} className={styles.tokenTile}>
            <span className={styles.radiusBox} style={{ borderRadius: `var(--bb-radius-${radius})` }} />
            <code>--bb-radius-{radius}</code>
          </li>
        ))}
      </ul>
    </GallerySection>
  )
}

export function ShadowsSection() {
  return (
    <GallerySection id="sombras" title={t('dev.gallery.sections.shadows')}>
      {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
      <ul role="list" className={styles.tiles}>
        {SHADOWS.map((shadow) => (
          <li key={shadow} className={styles.tokenTile}>
            <span className={styles.shadowBox} style={{ boxShadow: `var(--bb-shadow-${shadow})` }} />
            <code>--bb-shadow-{shadow}</code>
          </li>
        ))}
      </ul>
    </GallerySection>
  )
}

/* ── Movimiento ────────────────────────────────────────────────────────────────────────── */

type DurationKey = keyof typeof duration
type EaseKey = keyof typeof ease
type SpringKey = keyof typeof spring

const DURATION_KEYS = Object.keys(duration) as DurationKey[]
const EASE_KEYS = Object.keys(ease) as EaseKey[]
const SPRING_KEYS = Object.keys(spring) as SpringKey[]
const LOOP_KEYS = Object.keys(loop) as (keyof typeof loop)[]

/** Pista con un punto que la recorre (o, sin movimiento, solo se enciende). */
function DemoTrack({
  played,
  durationVar,
  easeVar,
}: {
  played: boolean
  durationVar: string
  easeVar: string
}) {
  return (
    <span className={styles.track}>
      <span
        className={styles.dot}
        data-played={played || undefined}
        style={
          { '--demo-duration': `var(${durationVar})`, '--demo-ease': `var(${easeVar})` } as CSSProperties
        }
      />
    </span>
  )
}

/** Demo de un muelle con Motion: el punto salta con la física del token (sin movimiento, fundido). */
function SpringTrack({ played, name }: { played: boolean; name: SpringKey }) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const width = useElementWidth(ref)
  const distance = Math.max(0, width - 12)
  return (
    <span ref={ref} className={styles.track}>
      <motion.span
        className={styles.springDot}
        initial={false}
        animate={reduced ? { x: 0, opacity: played ? 1 : 0.35 } : { x: played ? distance : 0, opacity: 1 }}
        transition={
          reduced
            ? { duration: reducedDuration.fast / 1000 }
            : { type: 'spring', ...spring[name], opacity: { duration: 0 } }
        }
      />
    </span>
  )
}

export function MotionSection() {
  const reduced = useReducedMotion()
  const [played, setPlayed] = useState(false)
  const toggle = (
    <Button
      variant="outline"
      size="sm"
      icon={played ? undefined : 'play'}
      onClick={() => setPlayed((value) => !value)}
    >
      {played ? t('dev.gallery.motion.reset') : t('dev.gallery.motion.play')}
    </Button>
  )

  return (
    <GallerySection
      id="movimiento"
      title={t('dev.gallery.sections.motion')}
      intro={t('dev.gallery.motion.note')}
    >
      <div className={styles.motionToolbar}>{toggle}</div>

      <GalleryBlock id="movimiento-duraciones" title={t('dev.gallery.motion.durations')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ul role="list" className={styles.motionList}>
          {DURATION_KEYS.map((key) => {
            const cssVar = cssVarName('duration', key)
            return (
              <li key={key} className={styles.motionRow}>
                <code>{cssVar}</code>
                <span className={styles.motionValue} data-reduced={reduced || undefined}>
                  {t('dev.gallery.motion.reducedMs', { ms: duration[key], reduced: reducedDuration[key] })}
                </span>
                <DemoTrack played={played} durationVar={cssVar} easeVar="--bb-ease-out" />
              </li>
            )
          })}
        </ul>
      </GalleryBlock>

      <GalleryBlock id="movimiento-curvas" title={t('dev.gallery.motion.curves')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ul role="list" className={styles.motionList}>
          {EASE_KEYS.map((key) => {
            const cssVar = cssVarName('ease', key)
            return (
              <li key={key} className={styles.motionRow}>
                <code>{cssVar}</code>
                <span className={styles.motionValue}>{toCssCubicBezier(ease[key])}</span>
                <DemoTrack played={played} durationVar="--bb-dur-reward" easeVar={cssVar} />
              </li>
            )
          })}
        </ul>
      </GalleryBlock>

      <GalleryBlock id="movimiento-muelles" title={t('dev.gallery.motion.springs')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ul role="list" className={styles.motionList}>
          {SPRING_KEYS.map((key) => (
            <li key={key} className={styles.motionRow}>
              <code>spring.{key}</code>
              <span className={styles.motionValue}>{t('dev.gallery.motion.spring', spring[key])}</span>
              <SpringTrack played={played} name={key} />
            </li>
          ))}
        </ul>
      </GalleryBlock>

      <GalleryBlock id="movimiento-bucles" title={t('dev.gallery.motion.loops')}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
        <ul role="list" className={styles.motionList}>
          {LOOP_KEYS.map((key) => (
            <li key={key} className={styles.motionRow}>
              <code>{cssVarName('loop', key)}</code>
              <span className={styles.motionValue}>
                {t('dev.gallery.motion.perSecond', {
                  ms: loop[key],
                  rate: formatNumber(1000 / loop[key], { maximumFractionDigits: 2 }),
                })}
              </span>
            </li>
          ))}
          <li className={styles.motionRow}>
            <code>{cssVarName('stagger', 'wave')}</code>
            <span className={styles.motionValue}>
              {t('dev.gallery.motion.stagger', { ms: stagger.wave })}
            </span>
          </li>
        </ul>
      </GalleryBlock>
    </GallerySection>
  )
}
