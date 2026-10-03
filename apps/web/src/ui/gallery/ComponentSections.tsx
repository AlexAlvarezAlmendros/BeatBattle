import { levelProgress } from '@beatbattle/rules'
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { type Messages, t } from '../../i18n'
import { Button, type ButtonProps } from '../Button'
import { Card, type CardState, type CardSurface } from '../Card'
import { Chip, ChipGroup } from '../Chip'
import { Countdown, DAY_MS, HOUR_MS, MINUTE_MS } from '../Countdown'
import { DataTile, DataTileList, DataTileSection } from '../DataTile'
import { EntryList, EntryRow } from '../EntryRow'
import { Modal, ModalSurface } from '../Modal'
import { SectionLabel } from '../SectionLabel'
import { Skeleton, SkeletonGroup } from '../Skeleton'
import { Toast, toast } from '../Toast'
import { Waveform } from '../Waveform'
import { XpBar } from '../XpBar'
import { COMPONENT_ANCHORS, type ComponentKey } from './anchors'
import styles from './GalleryPage.module.css'
import { GalleryBlock, GalleryRow, GallerySection, StateCell, StateMatrixRow } from './parts'
import { GALLERY_NOW, samplePeaks } from './samples'
import type { SealState } from './stateMatrix'

const title = (key: ComponentKey) => t(`dev.gallery.components.${key}`)
const anchor = (key: ComponentKey) => COMPONENT_ANCHORS.find((item) => item.key === key)!.id

const ENTRIES = ['first', 'second', 'third', 'fourth'] as const

/** Nombre de un género de muestra (`GENRES`, más abajo). */
const genreName = (key: (typeof GENRES)[number]) => t(`dev.gallery.sample.genres.${key}`)

export function ComponentsSection({ surface, controls }: { surface: CardSurface; controls?: ReactNode }) {
  return (
    <GallerySection id="componentes" title={t('dev.gallery.sections.components')}>
      {controls}
      <ButtonBlock />
      <ChipBlock />
      <CardBlock surface={surface} />
      <DataTileBlock />
      <SectionLabelBlock />
      <WaveformBlock />
      <EntryRowBlock />
      <ModalBlock surface={surface} />
      <ToastBlock />
      <XpBarBlock />
      <SkeletonBlock />
      <CountdownBlock />
    </GallerySection>
  )
}

/* ── Botón ─────────────────────────────────────────────────────────────────────────────── */

type ButtonStateDemo = {
  label: SealState
  props: Pick<ButtonProps, 'state' | 'loading' | 'status' | 'disabled'>
}

/** Nombres de los estados, de `dev.gallery.states` en `es.json`. */
type StateKey = keyof Messages['dev']['gallery']['states']

const stateLabel = (key: StateKey) => t(`dev.gallery.states.${key}`)

/** Dos rótulos juntos («Activo · Foco»), con el separador de `es.json`. */
const both = (first: string, second: string) => t('dev.gallery.combined', { first, second })

const BUTTON_STATES: readonly ButtonStateDemo[] = [
  { label: 'rest', props: {} },
  { label: 'hover', props: { state: 'hover' } },
  { label: 'focus', props: { state: 'focus' } },
  { label: 'pressed', props: { state: 'pressed' } },
  { label: 'loading', props: { loading: true } },
  { label: 'success', props: { status: 'success' } },
  { label: 'error', props: { status: 'error' } },
  { label: 'disabled', props: { disabled: true } },
]

/** Estados que enseña la fila del hero: los de interacción (los demás son los de `md`). */
const HERO_STATES = BUTTON_STATES.filter((demo) =>
  (['rest', 'hover', 'focus', 'pressed'] as SealState[]).includes(demo.label),
)

function textFor(variant: 'cta' | 'outline', demo: ButtonStateDemo): string {
  if (demo.props.status === 'success') return t('dev.gallery.demo.uploaded')
  if (demo.props.status === 'error') return t('dev.gallery.demo.retry')
  return variant === 'cta' ? t('dev.gallery.demo.primary') : t('dev.gallery.demo.secondary')
}

/** El ciclo real: reposo → cargando → éxito → reposo. */
function LiveButton() {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'success'>('idle')
  useEffect(() => {
    if (phase === 'idle') return
    const timer = setTimeout(() => setPhase(phase === 'loading' ? 'success' : 'idle'), 1600)
    return () => clearTimeout(timer)
  }, [phase])
  return (
    <Button
      icon="arrowRight"
      loading={phase === 'loading'}
      loadingLabel={t('dev.gallery.demo.uploading')}
      status={phase === 'success' ? 'success' : 'idle'}
      onClick={() => setPhase('loading')}
    >
      {phase === 'success' ? t('dev.gallery.demo.uploaded') : t('dev.gallery.demo.upload')}
    </Button>
  )
}

function ButtonBlock() {
  return (
    <GalleryBlock id={anchor('button')} title={title('button')}>
      {(['cta', 'outline'] as const).map((variant) => (
        <GalleryRow key={variant} title={t(`dev.gallery.variants.${variant}`)}>
          {BUTTON_STATES.map((demo) => (
            <StateCell key={demo.label} label={stateLabel(demo.label)} state={demo.label}>
              <Button variant={variant} {...demo.props}>
                {textFor(variant, demo)}
              </Button>
            </StateCell>
          ))}
        </GalleryRow>
      ))}
      <GalleryRow title={t('dev.gallery.variants.icon')}>
        {BUTTON_STATES.map((demo) => (
          <StateCell key={demo.label} label={stateLabel(demo.label)} state={demo.label}>
            <Button variant="icon" icon="play" aria-label={t('dev.gallery.demo.play')} {...demo.props} />
          </StateCell>
        ))}
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.variants.sizes')}>
        {(['sm', 'md', 'lg'] as const).map((size) => (
          <StateCell
            key={size}
            label={t(`dev.gallery.variants.size${size === 'sm' ? 'Sm' : size === 'md' ? 'Md' : 'Lg'}`)}
          >
            <div className={styles.inline}>
              <Button size={size}>{t('dev.gallery.demo.primary')}</Button>
              <Button size={size} variant="outline">
                {t('dev.gallery.demo.secondary')}
              </Button>
              <Button size={size} variant="icon" icon="play" aria-label={t('dev.gallery.demo.play')} />
            </div>
          </StateCell>
        ))}
        <StateCell label={t('dev.gallery.variants.link')}>
          <Button to="/semanas" variant="outline" icon="arrowRight">
            {t('dev.gallery.demo.linkToWeeks')}
          </Button>
        </StateCell>
        <StateCell label={stateLabel('interactive')}>
          <LiveButton />
        </StateCell>
      </GalleryRow>
      {/* El CTA del hero del sello (`size="hero"`): el rojo y el contorno sobre cristal (`glass`). */}
      <GalleryRow title={t('dev.gallery.variants.hero')} wide>
        {HERO_STATES.map((demo) => (
          <StateCell key={demo.label} label={stateLabel(demo.label)}>
            <div className={styles.inline}>
              <Button size="hero" {...demo.props}>
                {t('dev.gallery.demo.primary')}
              </Button>
              <Button size="hero" variant="outline" glass {...demo.props}>
                {t('dev.gallery.demo.secondary')}
              </Button>
            </div>
          </StateCell>
        ))}
      </GalleryRow>
      <StateMatrixRow component="button" />
    </GalleryBlock>
  )
}

/* ── Chip ──────────────────────────────────────────────────────────────────────────────── */

const GENRES = ['drill', 'trap', 'boomBap', 'reggaeton', 'jerk', 'amapiano', 'club'] as const

function ChipBlock() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(['drill']))
  const toggle = (genre: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(genre)
      else next.delete(genre)
      return next
    })
  const drill = t('dev.gallery.sample.genres.drill')
  return (
    <GalleryBlock id={anchor('chip')} title={title('chip')}>
      <GalleryRow>
        <StateCell label={stateLabel('rest')} state="rest">
          <Chip>{drill}</Chip>
        </StateCell>
        <StateCell label={stateLabel('hover')} state="hover">
          <Chip state="hover">{drill}</Chip>
        </StateCell>
        <StateCell label={stateLabel('focus')} state="focus">
          <Chip state="focus">{drill}</Chip>
        </StateCell>
        <StateCell label={stateLabel('pressed')} state="pressed">
          <Chip state="pressed">{drill}</Chip>
        </StateCell>
        <StateCell label={stateLabel('selected')}>
          <Chip selected>{drill}</Chip>
        </StateCell>
        <StateCell label={both(stateLabel('selected'), stateLabel('focus'))}>
          <Chip selected state="focus">
            {drill}
          </Chip>
        </StateCell>
        <StateCell label={stateLabel('disabled')} state="disabled">
          <Chip disabled>{drill}</Chip>
        </StateCell>
      </GalleryRow>
      <GalleryRow title={stateLabel('interactive')} wide>
        <StateCell label={t('ui.entryRow.genres')} span>
          <ChipGroup label={t('ui.entryRow.genres')}>
            {GENRES.map((genre) => (
              <Chip key={genre} selected={selected.has(genre)} onSelectedChange={(on) => toggle(genre, on)}>
                {t(`dev.gallery.sample.genres.${genre}`)}
              </Chip>
            ))}
          </ChipGroup>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="chip" />
    </GalleryBlock>
  )
}

/* ── Tarjeta ───────────────────────────────────────────────────────────────────────────── */

function SampleCard({
  surface,
  state,
  tilt = true,
  disabled = false,
}: {
  surface: CardSurface
  state?: CardState
  tilt?: boolean
  disabled?: boolean
}) {
  const id = useId()
  return (
    <Card
      surface={surface}
      state={state}
      tilt={tilt}
      disabled={disabled}
      aria-labelledby={id}
      className={styles.sampleCard}
    >
      <span className={styles.cardCover} aria-hidden="true" />
      <div className={styles.cardBody}>
        <h4 id={id} className={styles.cardTitle}>
          {t('dev.gallery.sample.card.title')}
        </h4>
        <p className={styles.cardMeta}>
          {t('ui.entryRow.by', { alias: t('dev.gallery.sample.entries.first.alias') })}
        </p>
        <p className={styles.cardMetaSoft}>{t('dev.gallery.sample.card.meta')}</p>
        <Button size="sm" fullWidth icon="play" disabled={disabled}>
          {t('dev.gallery.sample.card.action')}
        </Button>
      </div>
    </Card>
  )
}

function CardBlock({ surface }: { surface: CardSurface }) {
  return (
    <GalleryBlock id={anchor('card')} title={both(title('card'), t(`dev.gallery.variants.${surface}`))} stage>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest">
          <SampleCard surface={surface} />
        </StateCell>
        <StateCell label={stateLabel('hover')} state="hover">
          <SampleCard surface={surface} state="hover" />
        </StateCell>
        <StateCell label={stateLabel('focus')} state="focus">
          <SampleCard surface={surface} state="focus" />
        </StateCell>
        <StateCell label={both(stateLabel('hover'), stateLabel('static'))}>
          <SampleCard surface={surface} state="hover" tilt={false} />
        </StateCell>
        <StateCell label={stateLabel('loading')} state="loading">
          <Card surface={surface} aria-label={t('ui.skeleton.loading')} className={styles.sampleCard}>
            <SkeletonGroup className={styles.skeletonCard}>
              <Skeleton height="9rem" />
              <Skeleton shape="text" width="60%" />
              <Skeleton shape="text" width="40%" />
            </SkeletonGroup>
          </Card>
        </StateCell>
        <StateCell label={stateLabel('disabled')} state="disabled">
          <SampleCard surface={surface} disabled />
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="card" />
    </GalleryBlock>
  )
}

/* ── Tesela de dato y rótulo de sección ────────────────────────────────────────────────── */

function sampleTiles({ state, loading = false }: { state?: 'hover'; loading?: boolean }) {
  return (
    <>
      <DataTile
        icon="calendar"
        label={t('dev.gallery.sample.tiles.published')}
        value={t('dev.gallery.sample.tiles.publishedValue')}
        state={state}
        loading={loading}
      />
      <DataTile
        icon="metronome"
        label={t('dev.gallery.sample.tiles.bpm')}
        value="142"
        mono
        state={state}
        loading={loading}
      />
      <DataTile
        icon="sharp"
        label={t('dev.gallery.sample.tiles.key')}
        value={t('dev.gallery.sample.entries.first.key')}
        state={state}
        loading={loading}
      />
      <DataTile
        icon="tag"
        label={t('dev.gallery.sample.tiles.genre')}
        value={t('dev.gallery.sample.genres.drill')}
        state={state}
        loading={loading}
      />
    </>
  )
}

/**
 * Teselas con su rótulo (`DataTileSection`): en móvil, lista de clave y valor que el rótulo pliega. La
 * de reposo empieza desplegada para enseñar la lista; la segunda, plegada, como en la ficha del sello.
 */
function DataTileBlock() {
  return (
    <GalleryBlock id={anchor('dataTile')} title={title('dataTile')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} span state="rest">
          <DataTileSection
            title={t('dev.gallery.sample.sectionLabel.info')}
            titleAs="h4"
            defaultExpanded
            listClassName={styles.tileList}
          >
            {sampleTiles({})}
          </DataTileSection>
        </StateCell>
        <StateCell label={stateLabel('hover')} span state="hover">
          <DataTileList className={styles.tileList}>{sampleTiles({ state: 'hover' })}</DataTileList>
        </StateCell>
        <StateCell label={stateLabel('loading')} span state="loading">
          <DataTileList className={styles.tileList}>{sampleTiles({ loading: true })}</DataTileList>
        </StateCell>
        <StateCell label={t('dev.gallery.states.collapsedMobile')} span>
          <DataTileSection
            title={t('dev.gallery.sample.sectionLabel.info')}
            titleAs="h4"
            listClassName={styles.tileList}
          >
            {sampleTiles({})}
          </DataTileSection>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="dataTile" />
    </GalleryBlock>
  )
}

function SectionLabelBlock() {
  return (
    <GalleryBlock id={anchor('sectionLabel')} title={title('sectionLabel')}>
      <GalleryRow>
        <StateCell label={stateLabel('rest')} state="rest">
          <SectionLabel as="p">{t('dev.gallery.sample.sectionLabel.info')}</SectionLabel>
        </StateCell>
        <StateCell label={both(stateLabel('rest'), stateLabel('otherText'))}>
          <SectionLabel as="p">{t('dev.gallery.sample.sectionLabel.licenses')}</SectionLabel>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="sectionLabel" />
    </GalleryBlock>
  )
}

/* ── Forma de onda y fila de entrada ───────────────────────────────────────────────────── */

function WaveformBlock() {
  const peaks = useMemo(() => samplePeaks('galeria-onda', 240), [])
  const [replay, setReplay] = useState(0)
  return (
    <GalleryBlock id={anchor('waveform')} title={title('waveform')}>
      <div className={styles.motionToolbar}>
        <Button variant="outline" size="sm" icon="play" onClick={() => setReplay((value) => value + 1)}>
          {t('dev.gallery.demo.replay')}
        </Button>
      </div>
      <GalleryRow wide>
        <StateCell label={both(stateLabel('rest'), stateLabel('progressNone'))} span state="rest">
          <Waveform key={`a-${replay}`} peaks={peaks} />
        </StateCell>
        <StateCell label={stateLabel('progressHalf')} span>
          <Waveform key={`b-${replay}`} peaks={peaks} progress={0.38} />
        </StateCell>
        <StateCell label={stateLabel('progressFull')} span>
          <Waveform key={`c-${replay}`} peaks={peaks} progress={1} />
        </StateCell>
        <StateCell label={both(stateLabel('progressHalf'), stateLabel('mini'))} span>
          <Waveform key={`d-${replay}`} peaks={peaks} progress={0.62} height={24} playhead={false} />
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="waveform" />
    </GalleryBlock>
  )
}

function EntryRowBlock() {
  const peaks = useMemo(() => ENTRIES.map((entry) => samplePeaks(`galeria-${entry}`, 200)), [])
  const [playing, setPlaying] = useState<string | null>(null)
  const sample = (index: number) => {
    const entry = ENTRIES[index]!
    return {
      title: t(`dev.gallery.sample.entries.${entry}.title`),
      alias: t(`dev.gallery.sample.entries.${entry}.alias`),
      musicalKey: t(`dev.gallery.sample.entries.${entry}.key`),
      peaks: peaks[index]!,
    }
  }
  /** Una fila por estado de §3.3 (y «Sonando»), cada una en su celda con `data-state`. */
  const rows: {
    key: string
    label: string
    state?: SealState
    props: Partial<Parameters<typeof EntryRow>[0]>
  }[] = [
    {
      key: 'rest',
      label: stateLabel('rest'),
      state: 'rest',
      props: { genres: [genreName('drill')], bpm: 142 },
    },
    {
      key: 'hover',
      label: stateLabel('hover'),
      state: 'hover',
      props: { state: 'hover', genres: [genreName('trap')], bpm: 128 },
    },
    {
      key: 'focus',
      label: stateLabel('focus'),
      state: 'focus',
      props: { state: 'focus', genres: [genreName('reggaeton')], bpm: 96 },
    },
    {
      key: 'focusTitle',
      label: stateLabel('focusTitle'),
      props: { state: 'focusTitle', to: '/e/galeria', genres: [genreName('club')], bpm: 124 },
    },
    {
      key: 'pressed',
      label: stateLabel('pressed'),
      state: 'pressed',
      props: { state: 'pressed', genres: [genreName('jerk')], bpm: 150 },
    },
    {
      key: 'playing',
      label: stateLabel('playing'),
      props: { playing: true, progress: 0.42, genres: [genreName('boomBap')], bpm: 90 },
    },
    {
      key: 'loading',
      label: stateLabel('loading'),
      state: 'loading',
      props: { status: 'loading', genres: [genreName('amapiano')], bpm: 112 },
    },
    {
      key: 'disabled',
      label: stateLabel('disabled'),
      state: 'disabled',
      props: { disabled: true, genres: [genreName('drill')], bpm: 140 },
    },
    {
      key: 'error',
      label: stateLabel('error'),
      state: 'error',
      props: { status: 'error', genres: [genreName('trap')], bpm: 136 },
    },
  ]
  return (
    <GalleryBlock id={anchor('entryRow')} title={title('entryRow')}>
      <GalleryRow wide>
        {rows.map((row, index) => (
          <StateCell key={row.key} label={row.label} state={row.state} span>
            <EntryList className={styles.entryList}>
              <EntryRow titleAs="h4" {...sample(index % ENTRIES.length)} {...row.props} />
            </EntryList>
          </StateCell>
        ))}
        <StateCell label={stateLabel('interactive')} span>
          <EntryList className={styles.entryList}>
            {ENTRIES.slice(0, 2).map((entry, index) => (
              <EntryRow
                key={entry}
                titleAs="h4"
                {...sample(index)}
                genres={[t('dev.gallery.sample.genres.jerk')]}
                bpm={150}
                to="/e/galeria"
                playing={playing === entry}
                progress={playing === entry ? 0.25 : 0}
                onPlayToggle={() => setPlaying((current) => (current === entry ? null : entry))}
              />
            ))}
          </EntryList>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="entryRow" />
    </GalleryBlock>
  )
}

/* ── Modal y aviso ─────────────────────────────────────────────────────────────────────── */

/** Estados del modal en la galería: abierto, con el foco atrapado en cerrar, cargando y con error. */
const MODAL_DEMOS: readonly { state: SealState }[] = [
  { state: 'rest' },
  { state: 'focus' },
  { state: 'loading' },
  { state: 'error' },
]

function ModalBlock({ surface }: { surface: CardSurface }) {
  const [open, setOpen] = useState(false)
  const footer = (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
        {t('dev.gallery.sample.modal.later')}
      </Button>
      <Button size="sm" onClick={() => setOpen(false)}>
        {t('dev.gallery.sample.modal.signIn')}
      </Button>
    </>
  )
  return (
    <GalleryBlock
      id={anchor('modal')}
      title={both(title('modal'), t(`dev.gallery.variants.${surface}`))}
      stage
    >
      <GalleryRow wide>
        {MODAL_DEMOS.map((demo) => (
          <StateCell key={demo.state} label={stateLabel(demo.state)} state={demo.state} span>
            <div className={styles.scrimDemo}>
              <ModalSurface
                className={styles.scrimSurface}
                surface={surface}
                titleAs="h4"
                title={t('dev.gallery.sample.modal.title')}
                description={t('dev.gallery.sample.modal.description')}
                onClose={() => {}}
                closeState={demo.state === 'focus' ? 'focus' : undefined}
                busy={demo.state === 'loading'}
                error={demo.state === 'error' ? t('dev.gallery.sample.modal.error') : undefined}
                footer={
                  <>
                    <Button variant="outline" size="sm">
                      {t('dev.gallery.sample.modal.later')}
                    </Button>
                    <Button size="sm">{t('dev.gallery.sample.modal.signIn')}</Button>
                  </>
                }
              >
                {demo.state === 'loading' || demo.state === 'error'
                  ? t('dev.gallery.sample.modal.description')
                  : null}
              </ModalSurface>
            </div>
          </StateCell>
        ))}
        <StateCell label={stateLabel('interactive')}>
          <div className={styles.inline}>
            <Button variant="outline" onClick={() => setOpen(true)}>
              {t('dev.gallery.demo.openModal')}
            </Button>
          </div>
        </StateCell>
      </GalleryRow>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        surface={surface}
        title={t('dev.gallery.sample.modal.title')}
        description={t('dev.gallery.sample.modal.description')}
        footer={footer}
      />
      <StateMatrixRow component="modal" />
    </GalleryBlock>
  )
}

function ToastBlock() {
  const info = {
    tone: 'info',
    title: t('dev.gallery.sample.toast.info'),
    message: t('dev.gallery.sample.toast.infoMessage'),
  } as const
  return (
    <GalleryBlock id={anchor('toast')} title={title('toast')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest">
          <Toast toast={info} onDismiss={() => {}} />
        </StateCell>
        <StateCell label={stateLabel('hover')} state="hover">
          <Toast toast={info} onDismiss={() => {}} state="hover" />
        </StateCell>
        <StateCell label={stateLabel('focus')} state="focus">
          <Toast toast={info} onDismiss={() => {}} state="focus" />
        </StateCell>
        <StateCell label={both(stateLabel('pressed'), t('ui.toast.close'))} state="pressed">
          <Toast toast={info} onDismiss={() => {}} state="pressed" />
        </StateCell>
        <StateCell label={stateLabel('success')} state="success">
          <Toast
            toast={{
              tone: 'success',
              title: t('dev.gallery.sample.toast.success'),
              message: t('dev.gallery.sample.toast.successMessage'),
            }}
            onDismiss={() => {}}
          />
        </StateCell>
        <StateCell label={stateLabel('error')} state="error">
          <Toast
            toast={{
              tone: 'error',
              title: t('dev.gallery.sample.toast.error'),
              message: t('dev.gallery.sample.toast.errorMessage'),
            }}
            onDismiss={() => {}}
          />
        </StateCell>
        <StateCell label={stateLabel('interactive')}>
          <div className={styles.inline}>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.info(t('dev.gallery.sample.toast.info'), {
                  message: t('dev.gallery.sample.toast.infoMessage'),
                })
              }
            >
              {t('dev.gallery.demo.toastInfo')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.success(t('dev.gallery.sample.toast.success'), {
                  message: t('dev.gallery.sample.toast.successMessage'),
                })
              }
            >
              {t('dev.gallery.demo.toastSuccess')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.error(t('dev.gallery.sample.toast.error'), {
                  message: t('dev.gallery.sample.toast.errorMessage'),
                })
              }
            >
              {t('dev.gallery.demo.toastError')}
            </Button>
          </div>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="toast" />
    </GalleryBlock>
  )
}

/* ── Barra de XP ───────────────────────────────────────────────────────────────────────── */

const XP_STEPS = [5, 40, 150] as const

function LiveXpBar() {
  const [xp, setXp] = useState(80)
  const progress = levelProgress(xp)
  const max = (progress.nextLevelXp ?? xp) - progress.levelXp
  return (
    <div className={styles.xpLive}>
      <XpBar value={xp - progress.levelXp} max={Math.max(1, max)} level={progress.level} />
      <div className={styles.inline}>
        {XP_STEPS.map((step) => (
          <Button key={step} variant="outline" size="sm" onClick={() => setXp((value) => value + step)}>
            {t('dev.gallery.demo.addXp', { xp: step })}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={() => setXp(0)}>
          {t('dev.gallery.demo.resetXp')}
        </Button>
      </div>
    </div>
  )
}

function XpBarBlock() {
  return (
    <GalleryBlock id={anchor('xpBar')} title={title('xpBar')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest">
          <XpBar value={120} max={300} level={4} />
        </StateCell>
        <StateCell label={stateLabel('gain')}>
          <XpBar value={180} max={300} level={4} state="gain" />
        </StateCell>
        <StateCell label={both(stateLabel('success'), stateLabel('levelUp'))} state="success">
          <XpBar value={300} max={300} level={4} state="levelUp" />
        </StateCell>
        <StateCell label={stateLabel('hud')}>
          <XpBar value={120} max={300} level={4} size="sm" />
        </StateCell>
        <StateCell label={stateLabel('interactive')} span>
          <LiveXpBar />
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="xpBar" />
    </GalleryBlock>
  )
}

/* ── Esqueleto ─────────────────────────────────────────────────────────────────────────── */

function SkeletonBlock() {
  return (
    <GalleryBlock id={anchor('skeleton')} title={title('skeleton')}>
      <GalleryRow wide>
        <StateCell label={both(stateLabel('loading'), stateLabel('text'))} state="loading">
          <SkeletonGroup>
            <Skeleton shape="text" width="70%" />
            <Skeleton shape="text" />
            <Skeleton shape="text" width="45%" />
          </SkeletonGroup>
        </StateCell>
        <StateCell label={both(stateLabel('loading'), stateLabel('row'))} state="loading">
          <SkeletonGroup className={styles.skeletonRow}>
            <Skeleton width="3rem" height="3rem" />
            <Skeleton shape="circle" width="2.25rem" />
            <div className={styles.skeletonLines}>
              <Skeleton shape="text" width="55%" />
              <Skeleton shape="text" width="35%" />
              <Skeleton shape="text" height="0.5rem" />
            </div>
          </SkeletonGroup>
        </StateCell>
        <StateCell label={both(stateLabel('loading'), stateLabel('card'))} state="loading">
          <SkeletonGroup className={styles.skeletonCard}>
            <Skeleton height="9rem" />
            <Skeleton shape="text" width="60%" />
            <Skeleton shape="text" width="40%" />
          </SkeletonGroup>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="skeleton" />
    </GalleryBlock>
  )
}

/* ── Cuenta atrás ──────────────────────────────────────────────────────────────────────── */

const galleryNow = () => GALLERY_NOW

function CountdownBlock() {
  // El objetivo de la cuenta en vivo se fija al montar (dos días y pico desde ahora).
  const liveTarget = useRef(Date.now() + 2 * DAY_MS + 3 * HOUR_MS + 25 * MINUTE_MS).current
  const label = t('dev.gallery.sample.countdownLabel')
  return (
    <GalleryBlock id={anchor('countdown')} title={title('countdown')}>
      <GalleryRow wide>
        <StateCell label={both(stateLabel('rest'), stateLabel('normal'))} state="rest">
          <Countdown
            target={GALLERY_NOW + 2 * DAY_MS + 14 * HOUR_MS + 5 * MINUTE_MS + 33_000}
            now={galleryNow}
            label={label}
            size="md"
          />
        </StateCell>
        <StateCell label={stateLabel('urgent')}>
          <Countdown
            target={GALLERY_NOW + 5 * HOUR_MS + 42 * MINUTE_MS + 8_000}
            now={galleryNow}
            label={label}
            size="md"
          />
        </StateCell>
        <StateCell label={stateLabel('final')}>
          <Countdown
            target={GALLERY_NOW + 34 * MINUTE_MS + 51_000}
            now={galleryNow}
            label={label}
            size="md"
          />
        </StateCell>
        <StateCell label={stateLabel('ended')}>
          <Countdown target={GALLERY_NOW - 1} now={galleryNow} label={label} size="md" />
        </StateCell>
        <StateCell label={stateLabel('live')} span>
          <Countdown target={liveTarget} label={label} />
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="countdown" />
    </GalleryBlock>
  )
}
