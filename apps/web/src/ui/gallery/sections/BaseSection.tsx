import { type ColorToken, color, cssVarName } from '@beatbattle/shared/tokens'
import { type CSSProperties, useState } from 'react'
import { formatNumber, type SimpleMessageKey, t } from '../../../i18n'
import { Cursor } from '../../Cursor'
import { FRAME_CUTS, FRAME_VARIANTS, Frame, type FrameCut } from '../../Frame'
import { flash } from '../../flash'
import { cx } from '../../forceState'
import { useRovingGrid, useRovingMenu, useRovingTabs, useSeriousMode } from '../../hooks'
import { KEY_TONES, Key } from '../../Key'
import { OTP_SLAP_SIZES, OtpSlap, OtpSlapImage } from '../../OtpSlap'
import { TAG_SIZES, TAG_TONES, Tag } from '../../Tag'
import { CONTRAST_RULES, type ContrastRule, ruleRatio } from '../contrast'
import { GalleryBlock, GalleryRow, GallerySection, Specimen } from '../kit'
import styles from './BaseSection.module.css'

/**
 * Sección «Base» de la galería (tarea 0.22, guía v0.6 §3.2–§3.3): la paleta con su contraste, la
 * tipografía y su escala, la forma (chaflanes, paralelogramos, diagonal, inclinaciones, trazos, sombras
 * y foco), las primitivas (marco, tecla, etiqueta, pegatina OTP) y el cursor de juego con los tres
 * hooks de foco itinerante y el limitador de destellos. Todo sale de los tokens.
 */
export default function BaseSection() {
  return (
    <GallerySection id="base" title={t('dev.gallery.sections.base')} intro={t('dev.gallery.base.intro')}>
      <PaletteBlock />
      <ContrastBlock />
      <TypographyBlock />
      <ScaleBlock />
      <ShapeBlock />
      <PrimitivesBlock />
      <CursorBlock />
    </GallerySection>
  )
}

/* ── Paleta ─────────────────────────────────────────────────────────────────────────────── */

const PALETTE_GROUPS: readonly { key: SimpleMessageKey; tokens: readonly ColorToken[] }[] = [
  { key: 'dev.gallery.base.palette.brand', tokens: ['black', 'red', 'white', 'wine'] },
  {
    key: 'dev.gallery.base.palette.derived',
    tokens: [
      'redCta',
      'redPress',
      'redShade',
      'wine2',
      'wine3',
      'panel',
      'panel2',
      'panelVeil',
      'ink3',
      'ink4',
    ],
  },
  { key: 'dev.gallery.base.palette.text', tokens: ['text', 'text2', 'text3', 'text4'] },
  {
    key: 'dev.gallery.base.palette.lines',
    tokens: ['line', 'lineStrong', 'scrim', 'waveIdle', 'waveHalo'],
  },
  {
    key: 'dev.gallery.base.palette.textures',
    tokens: ['texScanInk', 'texRayInk', 'texVignetteInk', 'texGiantInk'],
  },
]

function PaletteBlock() {
  return (
    <GalleryBlock id="base-paleta" title={t('dev.gallery.base.blocks.palette')}>
      <div>
        <div className={styles.proportion} aria-hidden="true">
          <span className={styles.pBlack} />
          <span className={styles.pWine} />
          <span className={styles.pRed} />
          <span className={styles.pWhite} />
        </div>
        <p className="bb-label">{t('dev.gallery.base.palette.proportion')}</p>
      </div>
      {PALETTE_GROUPS.map((group) => (
        <GalleryRow key={group.key} title={t(group.key)}>
          {/* biome-ignore lint/a11y/noRedundantRoles: Safari y VoiceOver quitan la semántica de lista con list-style: none */}
          <ul role="list" className={styles.swatches}>
            {group.tokens.map((token) => (
              <li key={token} className={styles.swatch}>
                <div className={styles.chipWrap}>
                  <div
                    className={styles.chip}
                    style={{ '--swatch': `var(${cssVarName('color', token)})` } as CSSProperties}
                  />
                </div>
                <code className={styles.swatchName}>{cssVarName('color', token)}</code>
                <code className={styles.swatchValue}>{color[token]}</code>
              </li>
            ))}
          </ul>
        </GalleryRow>
      ))}
      <GalleryRow title={t('dev.gallery.base.palette.medals')}>
        <div className={styles.medals}>
          {([1, 2, 3] as const).map((place) => (
            <figure key={place} className={styles.medal}>
              <MedalDisc place={place} />
              <figcaption>{t(`dev.gallery.base.palette.medal${place}`)}</figcaption>
            </figure>
          ))}
        </div>
      </GalleryRow>
    </GalleryBlock>
  )
}

/** Color de la galleta de cada medalla (`--bb-medal-*`). */
const MEDAL_INK = { 1: 'var(--bb-medal-1)', 2: 'var(--bb-medal-2)', 3: 'var(--bb-medal-3)' } as const

/** Disco de medalla en la paleta (§3.2 «Medallas»): galleta del color de su puesto, siempre con texto. */
function MedalDisc({ place }: { place: 1 | 2 | 3 }) {
  return (
    <svg viewBox="0 0 100 100" className={styles.disc} aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="var(--bb-panel)" stroke={MEDAL_INK[place]} strokeWidth="4" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="var(--bb-line)" strokeWidth="2" />
      <circle
        cx="50"
        cy="50"
        r="20"
        fill={MEDAL_INK[place]}
        stroke={place === 3 ? 'var(--bb-white)' : 'none'}
        strokeWidth="3"
      />
      <circle cx="50" cy="50" r="3" fill="var(--bb-black)" />
    </svg>
  )
}

/* ── Contraste ──────────────────────────────────────────────────────────────────────────── */

const CONTRAST_SAMPLE_STYLE = (rule: ContrastRule): CSSProperties => ({
  color: `var(${cssVarName('color', rule.text)})`,
  backgroundColor: `var(${cssVarName('color', rule.surface)})`,
})

function ContrastBlock() {
  return (
    <GalleryBlock id="base-contraste" title={t('dev.gallery.base.blocks.contrast')}>
      <p className={styles.note}>{t('dev.gallery.base.contrast.note')}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('dev.gallery.base.contrast.sample')}</th>
              <th scope="col">{t('dev.gallery.base.contrast.pair')}</th>
              <th scope="col">{t('dev.gallery.base.contrast.ratio')}</th>
              <th scope="col">{t('dev.gallery.base.contrast.rule')}</th>
            </tr>
          </thead>
          <tbody>
            {CONTRAST_RULES.map((rule) => (
              <tr key={`${rule.text}-${rule.surface}`} data-contrast={rule.use}>
                <td>
                  {/* Cada par se enseña como se usa: los de «solo texto grande» (y el que no se usa), en grande. */}
                  <span
                    className={cx(
                      styles.sample,
                      rule.use !== 'anyText' &&
                        rule.use !== 'pressed' &&
                        rule.use !== 'disabled' &&
                        styles.sampleLarge,
                    )}
                    style={CONTRAST_SAMPLE_STYLE(rule)}
                  >
                    {rule.use === 'largeText' || rule.use === 'unused'
                      ? t('dev.gallery.base.contrast.textLarge')
                      : t('dev.gallery.base.contrast.text')}
                  </span>
                </td>
                <td>
                  <code className={styles.swatchName}>
                    {t('dev.gallery.base.contrast.over', {
                      foreground: cssVarName('color', rule.text),
                      background: cssVarName('color', rule.surface),
                    })}
                  </code>
                </td>
                <td className={styles.ratio}>
                  {t('dev.gallery.base.contrast.value', {
                    ratio: formatNumber(ruleRatio(rule), {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }),
                  })}
                </td>
                <td>{t(`dev.gallery.base.contrast.uses.${rule.use}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GalleryBlock>
  )
}

/* ── Tipografía ─────────────────────────────────────────────────────────────────────────── */

const STRETCHES = [
  ['display', '--bb-stretch-display'],
  ['plate', '--bb-stretch-plate'],
  ['button', '--bb-stretch-button'],
  ['min', '--bb-stretch-min'],
] as const

function TypographyBlock() {
  return (
    <GalleryBlock id="base-tipografia" title={t('dev.gallery.base.blocks.typography')}>
      <div className={styles.families}>
        <Frame cut="lg" className={styles.family}>
          <p className="bb-label">{t('dev.gallery.base.type.display')}</p>
          <div className={styles.stretches}>
            {STRETCHES.map(([key, token]) => (
              <p key={key} className={styles.stretch}>
                <span
                  className={cx('bb-display', styles.displaySample)}
                  style={{ fontStretch: `var(${token})` }}
                >
                  {t('dev.gallery.base.type.displaySample')}
                </span>
                <code className={styles.swatchValue}>{token}</code>
              </p>
            ))}
          </div>
          <p className={cx('bb-display', 'bb-hard', styles.uiSample)}>
            {t('dev.gallery.base.type.hardSample')}
          </p>
        </Frame>
        <Frame cut="lg" className={styles.family}>
          <p className="bb-label">{t('dev.gallery.base.type.ui')}</p>
          <p className={styles.uiSample}>{t('dev.gallery.base.type.uiSample')}</p>
          <div className={styles.weights}>
            <span style={{ fontWeight: 'var(--bb-weight-medium)' }}>{t('dev.gallery.base.type.w500')}</span>
            <span style={{ fontWeight: 'var(--bb-weight-semibold)' }}>{t('dev.gallery.base.type.w600')}</span>
            <span style={{ fontWeight: 'var(--bb-weight-bold)' }}>{t('dev.gallery.base.type.w700')}</span>
            <em style={{ fontWeight: 'var(--bb-weight-semibold)' }}>{t('dev.gallery.base.type.i600')}</em>
            <em style={{ fontWeight: 'var(--bb-weight-bold)' }}>{t('dev.gallery.base.type.i700')}</em>
          </div>
          <p className="bb-label">{t('dev.gallery.base.type.labelSample')}</p>
        </Frame>
        <Frame cut="lg" className={styles.family}>
          <p className="bb-label">{t('dev.gallery.base.type.num')}</p>
          <p className={styles.numSample}>{t('dev.gallery.base.type.numSample')}</p>
          <p className={cx('bb-num', styles.uiSample)}>{t('dev.gallery.base.type.tabular')}</p>
        </Frame>
      </div>
    </GalleryBlock>
  )
}

/* ── Escala ─────────────────────────────────────────────────────────────────────────────── */

const SCALE: readonly { token: string; size: SimpleMessageKey; display?: boolean }[] = [
  { token: '--bb-fs-xs', size: 'dev.gallery.base.scale.xs' },
  { token: '--bb-fs-sm', size: 'dev.gallery.base.scale.sm' },
  { token: '--bb-fs-md', size: 'dev.gallery.base.scale.md' },
  { token: '--bb-fs-lg', size: 'dev.gallery.base.scale.lg' },
  { token: '--bb-fs-xl', size: 'dev.gallery.base.scale.xl' },
  { token: '--bb-fs-2xl', size: 'dev.gallery.base.scale.xl2' },
  { token: '--bb-fs-3xl', size: 'dev.gallery.base.scale.xl3', display: true },
  { token: '--bb-fs-plate', size: 'dev.gallery.base.scale.plate', display: true },
  { token: '--bb-fs-plate-on', size: 'dev.gallery.base.scale.plateOn', display: true },
  { token: '--bb-fs-title', size: 'dev.gallery.base.scale.title', display: true },
  { token: '--bb-fs-alias', size: 'dev.gallery.base.scale.alias', display: true },
  { token: '--bb-fs-clock', size: 'dev.gallery.base.scale.clock' },
  { token: '--bb-fs-timer', size: 'dev.gallery.base.scale.timer' },
]

function ScaleBlock() {
  return (
    <GalleryBlock id="base-escala" title={t('dev.gallery.base.blocks.scale')}>
      <p className={styles.note}>{t('dev.gallery.base.scale.note')}</p>
      <dl className={styles.scale}>
        {SCALE.map(({ token, size, display }) => (
          <div key={token} className={styles.scaleRow}>
            <dt>
              <code className={styles.swatchName}>{token}</code>
              <br />
              <span className={styles.swatchValue}>{t(size)}</span>
            </dt>
            <dd
              className={cx(
                display && 'bb-display',
                token.includes('clock') || token.includes('timer') ? 'bb-num' : '',
              )}
              style={{ fontSize: `var(${token})` }}
            >
              {token.includes('clock') || token.includes('timer')
                ? t('dev.gallery.base.scale.digits')
                : t('dev.gallery.base.scale.sample')}
            </dd>
          </div>
        ))}
      </dl>
    </GalleryBlock>
  )
}

/* ── Forma ──────────────────────────────────────────────────────────────────────────────── */

const CUT_TOKENS: Readonly<Record<FrameCut, string>> = {
  xs: '--bb-cut-xs · 5 px',
  sm: '--bb-cut-sm · 7 px',
  md: '--bb-cut-md · 10 px',
  base: '--bb-cut · 14 px',
  lg: '--bb-cut-lg · 22 px',
}

function ShapeBlock() {
  return (
    <GalleryBlock id="base-forma" title={t('dev.gallery.base.blocks.shape')}>
      <GalleryRow title={t('dev.gallery.base.shape.cuts')}>
        {FRAME_CUTS.map((cut) => (
          <Specimen key={cut} label={t(`dev.gallery.base.shape.cut.${cut}`)} token={CUT_TOKENS[cut]}>
            <Frame cut={cut} variant="title" className={styles.cutBox} />
          </Specimen>
        ))}
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.base.shape.slants')}>
        <Specimen label={t('dev.gallery.base.shape.slant')} token={t('dev.gallery.base.shape.slantToken')}>
          <div className={styles.slantBox} />
        </Specimen>
        <Specimen label={t('dev.gallery.base.shape.slantSm')} token="--bb-slant-sm · 6 px">
          <div className={cx(styles.slantBox, styles.slantBoxSm)} />
        </Specimen>
        <Specimen
          label={t('dev.gallery.base.shape.split')}
          token="--bb-split-angle · --bb-split-band · --bb-split-rule · --bb-split-gap"
        >
          <div className={styles.split} aria-hidden="true">
            <span className={styles.splitRule} />
            <span className={styles.splitBand} />
          </div>
        </Specimen>
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.base.shape.tilts')}>
        <Specimen label={t('dev.gallery.base.shape.tiltSticker')} token="--bb-tilt-sticker · −7°">
          <OtpSlapImage size="menu" />
        </Specimen>
        <Specimen label={t('dev.gallery.base.shape.tiltCard')} token="--bb-tilt-card · −3°">
          <Frame variant="title" cut="md" className={styles.tiltCard} />
        </Specimen>
        <Specimen label={t('dev.gallery.base.shape.tiltAnn')} token="--bb-tilt-ann · −6°">
          <span className={styles.tiltAnn}>
            <Tag tone="white" size="lg">
              {t('dev.gallery.base.shape.annSample')}
            </Tag>
          </span>
        </Specimen>
        <Specimen
          label={t('dev.gallery.base.shape.stamps')}
          token="--bb-tilt-stamp · ±9° · --bb-stroke-stamp"
        >
          <div className={styles.row}>
            <span className={cx(styles.stamp, styles.stampLeft)}>
              {t('dev.gallery.base.shape.stampNotVoted')}
            </span>
            <span className={cx(styles.stamp, styles.stampRight)}>
              {t('dev.gallery.base.shape.stampSealed')}
            </span>
          </div>
        </Specimen>
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.base.shape.strokes')}>
        <Specimen label={t('dev.gallery.base.shape.strokeHair')} token="--bb-stroke-hair · 1 px">
          <span className={cx(styles.stroke, styles.strokeHair)} />
        </Specimen>
        <Specimen label={t('dev.gallery.base.shape.strokeBase')} token="--bb-stroke · 2 px">
          <span className={cx(styles.stroke, styles.strokeBase)} />
        </Specimen>
        <Specimen label={t('dev.gallery.base.shape.strokeCursor')} token="--bb-stroke-cursor · 3 px">
          <span className={cx(styles.stroke, styles.strokeCursor)} />
        </Specimen>
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.base.shape.shadows')}>
        <Specimen label={t('dev.gallery.base.shape.hard')} token="--bb-shadow-hard">
          <span className={cx('bb-display', styles.hardText)}>{t('dev.gallery.base.shape.vs')}</span>
        </Specimen>
        <Specimen label={t('dev.gallery.base.shape.hardSm')} token="--bb-shadow-hard-sm">
          <span className={cx('bb-display', styles.hardTextSm)}>{t('dev.gallery.base.shape.vs')}</span>
        </Specimen>
        <Specimen label={t('dev.gallery.base.shape.drop')} token="--bb-shadow-drop">
          <span className={styles.dropBox} />
        </Specimen>
        <Specimen
          label={t('dev.gallery.base.shape.focus')}
          token="--bb-stroke-cursor · --bb-cursor-gap · --bb-focus-halo"
        >
          <div className={styles.row}>
            <span className={styles.focusReplica}>{t('dev.gallery.base.shape.focusReplica')}</span>
            <button type="button" className={styles.focusTry}>
              {t('dev.gallery.base.shape.focusTry')}
            </button>
          </div>
        </Specimen>
      </GalleryRow>
    </GalleryBlock>
  )
}

/* ── Primitivas ─────────────────────────────────────────────────────────────────────────── */

const TAG_SAMPLES = ['player', 'new', 'challenge', 'live', 'result'] as const

function PrimitivesBlock() {
  return (
    <GalleryBlock id="base-primitivas" title={t('dev.gallery.base.blocks.primitives')}>
      <GalleryRow title={t('dev.gallery.base.primitives.frame')} wide>
        {FRAME_VARIANTS.map((variant) => (
          <figure key={variant} className={styles.medal}>
            <Frame variant={variant} cut={variant === 'stage' ? 'lg' : 'base'} className={styles.frameSample}>
              <span className={cx('bb-label')}>
                {t(`dev.gallery.base.primitives.frameKicker.${variant}`)}
              </span>
              <span className={cx('bb-display', styles.frameTitle)}>
                {t(`dev.gallery.base.primitives.frameTitle.${variant}`)}
              </span>
            </Frame>
            <figcaption>
              <code className={styles.swatchValue}>{`<Frame variant="${variant}">`}</code>
            </figcaption>
          </figure>
        ))}
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.base.primitives.key')}>
        {KEY_TONES.map((tone) => (
          <Specimen
            key={tone}
            label={t(`dev.gallery.base.primitives.keyTone.${tone}`)}
            token={`<Key tone="${tone}">`}
          >
            <div className={styles.row}>
              <Key tone={tone}>{t('dev.gallery.base.primitives.keys.enter')}</Key>
              <Key tone={tone}>{t('dev.gallery.base.primitives.keys.escape')}</Key>
              <Key tone={tone}>{t('dev.gallery.base.primitives.keys.q')}</Key>
              <Key tone={tone} label={t('dev.gallery.base.primitives.keys.upLabel')}>
                {t('dev.gallery.base.primitives.keys.up')}
              </Key>
            </div>
          </Specimen>
        ))}
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.base.primitives.tag')} wide>
        {TAG_TONES.map((tone) => (
          <Specimen
            key={tone}
            label={t(`dev.gallery.base.primitives.tagTone.${tone}`)}
            token={`<Tag tone="${tone}">`}
          >
            <div className={styles.row}>
              {TAG_SIZES.map((size, index) => (
                <Tag key={size} tone={tone} size={size}>
                  {t(`dev.gallery.base.primitives.tags.${TAG_SAMPLES[index % TAG_SAMPLES.length]!}`)}
                </Tag>
              ))}
            </div>
          </Specimen>
        ))}
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.base.primitives.slap')} wide>
        {OTP_SLAP_SIZES.map((size) => (
          <Specimen
            key={size}
            label={t(`dev.gallery.base.primitives.slapSize.${size}`)}
            token={`<OtpSlap size="${size}">`}
          >
            {size === 'bar' ? (
              <span className={styles.barSample}>
                <span>{t('dev.gallery.base.primitives.slapBarBefore')}</span>
                <OtpSlap size="bar" />
                <span>{t('dev.gallery.base.primitives.slapBarAfter')}</span>
              </span>
            ) : (
              <OtpSlap size={size} />
            )}
          </Specimen>
        ))}
      </GalleryRow>
    </GalleryBlock>
  )
}

/* ── Cursor ─────────────────────────────────────────────────────────────────────────────── */

const MENU_ITEMS = ['play', 'jury', 'results', 'settings'] as const
const GRID_ITEMS = ['tiger', 'cobra', 'lynx', 'raven', 'siren', 'comet', 'thunder', 'random'] as const
const TAB_ITEMS = ['fair', 'recent', 'random'] as const

function CursorBlock() {
  return (
    <GalleryBlock id="base-cursor" title={t('dev.gallery.base.blocks.cursor')}>
      <p className={styles.note}>{t('dev.gallery.base.cursor.intro')}</p>
      <GalleryRow title={t('dev.gallery.base.cursor.static')} wide>
        <Specimen label={t('dev.gallery.base.cursor.staticSlant')} token={'<Cursor shape="slant" player />'}>
          <div className={styles.cursorStage}>
            <div className={styles.plate} data-cursor="" data-force-state="focus" aria-hidden="true">
              <Cursor shape="slant" player />
              <span className={styles.plateIndex}>
                {t('dev.gallery.base.cursor.menuIndex', { index: 1 })}
              </span>
              <span>{t('dev.gallery.base.cursor.menu.play')}</span>
              <Key tone="light" className={styles.plateKey}>
                {t('dev.gallery.base.primitives.keys.enter')}
              </Key>
            </div>
          </div>
        </Specimen>
        <Specimen label={t('dev.gallery.base.cursor.staticCut')} token={'<Cursor cut="base" player="top" />'}>
          <div className={styles.cursorStage}>
            <div
              className={cx(styles.cell, styles.cellStatic)}
              data-cursor=""
              data-force-state="focus"
              aria-hidden="true"
            >
              <Cursor cut="base" player="top" />
              <Frame variant="stage" cut="base" className={styles.cellArt} />
              <span className={styles.cellName}>{t('dev.gallery.base.cursor.grid.tiger')}</span>
            </div>
          </div>
        </Specimen>
      </GalleryRow>
      <MenuDemo />
      <GridDemo />
      <TabsDemo />
      <FlashDemo />
    </GalleryBlock>
  )
}

function MenuDemo() {
  const [activated, setActivated] = useState<number | null>(null)
  const menu = useRovingMenu({
    count: MENU_ITEMS.length,
    getLabel: (index) => t(`dev.gallery.base.cursor.menu.${MENU_ITEMS[index]!}`),
    onActivate: setActivated,
  })
  const active = MENU_ITEMS[menu.activeIndex]!
  return (
    <GalleryRow title={t('dev.gallery.base.cursor.menuTitle')}>
      <div className={styles.cursorStage}>
        <ul
          {...menu.getContainerProps({ 'aria-label': t('dev.gallery.base.cursor.menuLabel') })}
          className={styles.menu}
        >
          {MENU_ITEMS.map((item, index) => (
            <li key={item} role="none">
              <div {...menu.getItemProps<HTMLDivElement>(index)} className={styles.plate}>
                <Cursor shape="slant" player />
                <span className={styles.plateIndex} aria-hidden="true">
                  {t('dev.gallery.base.cursor.menuIndex', { index: index + 1 })}
                </span>
                <span>{t(`dev.gallery.base.cursor.menu.${item}`)}</span>
                <Key tone="light" className={styles.plateKey} aria-hidden="true">
                  {t('dev.gallery.base.primitives.keys.enter')}
                </Key>
              </div>
            </li>
          ))}
        </ul>
        <Frame cut="base" className={styles.help}>
          <p aria-live="polite">{t(`dev.gallery.base.cursor.menuHelp.${active}`)}</p>
          {activated !== null && (
            <p className="bb-label">
              {t('dev.gallery.base.cursor.entered', {
                item: t(`dev.gallery.base.cursor.menu.${MENU_ITEMS[activated]!}`),
              })}
            </p>
          )}
        </Frame>
      </div>
    </GalleryRow>
  )
}

function GridDemo() {
  const [activated, setActivated] = useState<number | null>(null)
  const grid = useRovingGrid({ count: GRID_ITEMS.length, columns: 4, onActivate: setActivated })
  return (
    <GalleryRow title={t('dev.gallery.base.cursor.gridTitle')}>
      <div className={styles.cursorStage}>
        <div
          {...grid.getContainerProps({ 'aria-label': t('dev.gallery.base.cursor.gridLabel') })}
          className={styles.grid}
        >
          {GRID_ITEMS.map((item, index) => (
            <div key={item} {...grid.getItemProps<HTMLDivElement>(index)} className={styles.cell}>
              <Cursor cut="base" player="top" />
              <Frame variant="stage" cut="base" className={styles.cellArt} aria-hidden="true" />
              <span className={styles.cellName}>{t(`dev.gallery.base.cursor.grid.${item}`)}</span>
            </div>
          ))}
        </div>
        <p className={styles.help} aria-live="polite">
          {activated === null
            ? t('dev.gallery.base.cursor.gridHelp')
            : t('dev.gallery.base.cursor.entered', {
                item: t(`dev.gallery.base.cursor.grid.${GRID_ITEMS[activated]!}`),
              })}
        </p>
      </div>
    </GalleryRow>
  )
}

function TabsDemo() {
  const tabs = useRovingTabs({ count: TAB_ITEMS.length })
  return (
    <GalleryRow title={t('dev.gallery.base.cursor.tabsTitle')}>
      <div className={styles.cursorStage}>
        <div className={styles.tabs}>
          <Key aria-hidden="true">{t('dev.gallery.base.primitives.keys.q')}</Key>
          <div
            {...tabs.getTabListProps({ 'aria-label': t('dev.gallery.base.cursor.tabsLabel') })}
            className={styles.tabs}
          >
            {TAB_ITEMS.map((item, index) => (
              <button
                key={item}
                type="button"
                {...tabs.getTabProps<HTMLButtonElement>(index)}
                className={styles.tab}
              >
                <Cursor shape="slant" slant="sm" />
                {t(`dev.gallery.base.cursor.tabs.${item}`)}
              </button>
            ))}
          </div>
          <Key aria-hidden="true">{t('dev.gallery.base.primitives.keys.e')}</Key>
        </div>
        {TAB_ITEMS.map((item, index) => (
          <Frame key={item} cut="base" {...tabs.getPanelProps(index)} className={styles.panel}>
            {t(`dev.gallery.base.cursor.tabPanels.${item}`)}
          </Frame>
        ))}
      </div>
    </GalleryRow>
  )
}

/** Limitador de destellos (RD-MOT-04): cada pulsación pide uno; el cuarto en un segundo se deniega. */
function FlashDemo() {
  const serious = useSeriousMode()
  const [result, setResult] = useState<{
    granted: boolean
    count: number
    at: number
    opacity: number
  } | null>(null)
  const request = () => {
    const grant = flash.request({ reason: 'vote', area: 1, opacity: 1 })
    setResult({
      granted: grant !== null,
      count: flash.recent(),
      at: Date.now(),
      opacity: grant?.opacity ?? 0,
    })
  }
  const message = serious
    ? t('dev.gallery.base.cursor.flashSerious')
    : result === null
      ? t('dev.gallery.base.cursor.flashIdle')
      : result.granted
        ? t('dev.gallery.base.cursor.flashGranted', { count: result.count })
        : t('dev.gallery.base.cursor.flashDenied')
  return (
    <GalleryRow title={t('dev.gallery.base.cursor.flashTitle')}>
      <Frame cut="base" className={styles.flashBox}>
        {result?.granted && (
          <span
            key={result.at}
            className={cx(styles.flashLight, styles.flashOn)}
            style={{ '--flash-opacity': result.opacity } as CSSProperties}
            aria-hidden="true"
          />
        )}
        <Frame as="button" type="button" cut="md" className={styles.flashButton} onClick={request}>
          {t('dev.gallery.base.cursor.flashButton')}
        </Frame>
        <p aria-live="polite">{message}</p>
      </Frame>
    </GalleryRow>
  )
}
