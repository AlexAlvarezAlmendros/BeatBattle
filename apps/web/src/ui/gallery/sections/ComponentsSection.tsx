import { useState } from 'react'
import { type Messages, t } from '../../../i18n'
import { Announcer } from '../../Announcer'
import { BUTTON_VARIANTS, Button } from '../../Button'
import { DataChip, FilterChip } from '../../Chip'
import { CoverArt } from '../../CoverArt'
import { DataTile, DataTileList } from '../../DataTile'
import { EntryCell } from '../../EntryCell'
import { EntryList, EntryRow } from '../../EntryRow'
import { FighterCard, type FighterEntry } from '../../FighterCard'
import { useRovingGrid } from '../../hooks/useRovingGrid'
import { useRovingMenu } from '../../hooks/useRovingMenu'
import { Medal } from '../../Medal'
import { MenuPlate } from '../../MenuPlate'
import { Meter } from '../../Meter'
import { Modal, ModalSurface } from '../../Modal'
import { RoundClock } from '../../RoundClock'
import { Skeleton, SkeletonGroup } from '../../Skeleton'
import { Stamp } from '../../Stamp'
import { Tabs } from '../../Tabs'
import { TitlePlate } from '../../TitlePlate'
import { Toast, toast } from '../../Toast'
import { Waveform } from '../../Waveform'
import { GalleryBlock, GalleryRow, GallerySection, StateCell, StateMatrixRow } from '../kit'
import { GALLERY_NOW, samplePeaks } from '../samples'
import styles from './ComponentsSection.module.css'

/**
 * Sección «Componentes» de la galería (tarea 0.25, guía §3.3, `RD-VIS-03`): cada componente de la
 * arena en su bloque, con los estados de la matriz de §3.3 forzados (`data-state`) y, para los que no
 * aplican, su motivo (`StateMatrixRow`). Las demos interactivas usan los componentes de verdad.
 */
export default function ComponentsSection() {
  return (
    <GallerySection
      id="componentes"
      title={t('dev.gallery.sections.components')}
      intro={t('dev.gallery.arena.intro')}
    >
      <ButtonBlock />
      <MenuPlateBlock />
      <TabsBlock />
      <DataChipBlock />
      <FilterChipBlock />
      <StampBlock />
      <FighterCardBlock />
      <EntryCellBlock />
      <EntryRowBlock />
      <TileBlock />
      <WaveformBlock />
      <ModalBlock />
      <AnnouncerBlock />
      <ToastBlock />
      <MeterBlock />
      <SkeletonBlock />
      <RoundClockBlock />
      <TitlePlateBlock />
      <CoverBlock />
    </GallerySection>
  )
}

const stateLabel = (state: keyof Messages['dev']['gallery']['states']) => t(`dev.gallery.states.${state}`)
const noop = () => {}

/* ── Botón ──────────────────────────────────────────────────────────────────────────────── */

function ButtonBlock() {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'success'>('idle')
  const upload = () => {
    if (phase !== 'idle') {
      setPhase('idle')
      return
    }
    setPhase('loading')
    setTimeout(() => setPhase('success'), 1200)
  }
  return (
    <GalleryBlock id="boton" title={t('dev.gallery.components.button')}>
      {BUTTON_VARIANTS.map((variant) => (
        <GalleryRow key={variant} title={t(`dev.gallery.variants.${variant}`)}>
          <StateCell label={stateLabel('rest')} state="rest">
            <Button variant={variant} keyHint={t('frame.keys.glyph.enter')}>
              {t('dev.gallery.arena.button.play')}
            </Button>
          </StateCell>
          {(['hover', 'focus', 'pressed'] as const).map((state) => (
            <StateCell key={state} label={stateLabel(state)} state={state}>
              <Button variant={variant} state={state} keyHint={t('frame.keys.glyph.enter')}>
                {t('dev.gallery.arena.button.play')}
              </Button>
            </StateCell>
          ))}
          <StateCell label={stateLabel('loading')} state="loading">
            <Button variant={variant} loading>
              {t('dev.gallery.arena.button.upload')}
            </Button>
          </StateCell>
          <StateCell label={stateLabel('disabled')} state="disabled">
            <Button variant={variant} disabled disabledReason={t('dev.gallery.arena.button.reason')}>
              {t('dev.gallery.arena.button.play')}
            </Button>
          </StateCell>
          <StateCell label={stateLabel('success')} state="success">
            <Button variant={variant} status="success">
              {t('dev.gallery.arena.button.uploaded')}
            </Button>
          </StateCell>
          <StateCell label={stateLabel('error')} state="error">
            <Button variant={variant} status="error">
              {t('dev.gallery.arena.button.retry')}
            </Button>
          </StateCell>
        </GalleryRow>
      ))}
      <GalleryRow title={t('dev.gallery.variants.sizes')}>
        {(['sm', 'md', 'lg'] as const).map((size) => (
          <StateCell key={size} label={t(`dev.gallery.variants.size.${size}`)}>
            <Button size={size}>{t('dev.gallery.arena.button.listen')}</Button>
          </StateCell>
        ))}
        <StateCell label={t('dev.gallery.variants.iconOnly')}>
          <div className={styles.row}>
            <Button
              variant="white"
              iconOnly
              icon="triangleRight"
              aria-label={t('dev.gallery.arena.button.listen')}
            />
            <Button variant="outline" size="sm" iconOnly icon="close" aria-label={t('ui.modal.close')} />
          </div>
        </StateCell>
        <StateCell label={t('dev.gallery.states.interactive')}>
          <Button
            loading={phase === 'loading'}
            status={phase === 'success' ? 'success' : 'idle'}
            loadingLabel={t('dev.gallery.arena.button.uploading')}
            onClick={upload}
          >
            {phase === 'success'
              ? t('dev.gallery.arena.button.uploaded')
              : t('dev.gallery.arena.button.upload')}
          </Button>
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}

/* ── Opción de menú ─────────────────────────────────────────────────────────────────────── */

const MENU_ITEMS = ['play', 'jury', 'results', 'settings'] as const

function MenuPlateBlock() {
  const menu = useRovingMenu({
    count: MENU_ITEMS.length,
    isDisabled: (index) => MENU_ITEMS[index] === 'results',
    getLabel: (index) => t(`dev.gallery.arena.menu.${MENU_ITEMS[index]!}`),
  })
  const active = MENU_ITEMS[menu.activeIndex]!
  const static_ = { role: 'presentation', tabIndex: -1 } as const
  return (
    <GalleryBlock id="opcion-menu" title={t('dev.gallery.components.menuPlate')}>
      <GalleryRow title={t('dev.gallery.states.static')} wide>
        {(['rest', 'hover', 'focus', 'pressed'] as const).map((state) => (
          <StateCell key={state} label={stateLabel(state)} state={state} wide>
            <div className={styles.menuStage} aria-hidden="true">
              <MenuPlate
                index={2}
                label={t('dev.gallery.arena.menu.jury')}
                detail={t('dev.gallery.arena.menu.juryDetail')}
                itemProps={{ ...static_, 'data-cursor': '' }}
                state={state === 'rest' ? undefined : state}
              />
            </div>
          </StateCell>
        ))}
        <StateCell label={stateLabel('disabled')} state="disabled" wide>
          <div className={styles.menuStage} aria-hidden="true">
            <MenuPlate
              index={1}
              label={t('dev.gallery.arena.menu.play')}
              detail={t('dev.gallery.arena.menu.playLocked')}
              disabled
              itemProps={{ ...static_, 'data-cursor': '' }}
            />
          </div>
        </StateCell>
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.states.interactive')} wide>
        <div className={styles.menuStage}>
          <ul
            {...menu.getContainerProps({ 'aria-label': t('dev.gallery.arena.menu.label') })}
            className={styles.menu}
          >
            {MENU_ITEMS.map((item, index) => (
              <li key={item} role="none">
                <MenuPlate
                  index={index + 1}
                  label={t(`dev.gallery.arena.menu.${item}`)}
                  detail={item === 'results' ? t('dev.gallery.arena.menu.resultsLocked') : undefined}
                  disabled={item === 'results'}
                  itemProps={menu.getItemProps(index)}
                />
              </li>
            ))}
          </ul>
          <p className={styles.help} aria-live="polite">
            {t(`dev.gallery.arena.menu.help.${active}`)}
          </p>
        </div>
      </GalleryRow>
      <StateMatrixRow component="menuPlate" />
    </GalleryBlock>
  )
}

/* ── Pestañas ───────────────────────────────────────────────────────────────────────────── */

const TAB_ITEMS = ['fair', 'recent', 'random', 'archive'] as const

function tabItems() {
  return TAB_ITEMS.map((item) => ({
    id: item,
    label: t(`dev.gallery.arena.tabs.${item}`),
    panel: <p className={styles.panelText}>{t(`dev.gallery.arena.tabs.panels.${item}`)}</p>,
    disabled: item === 'archive',
  }))
}

function TabsBlock() {
  return (
    <GalleryBlock id="pestanas" title={t('dev.gallery.components.tabs')}>
      <GalleryRow title={t('dev.gallery.states.interactive')} wide>
        <StateCell label={stateLabel('rest')} state="rest" wide>
          <Tabs label={t('dev.gallery.arena.tabs.label')} tabs={tabItems()} />
        </StateCell>
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.states.static')} wide>
        {(['hover', 'focus', 'pressed'] as const).map((state) => (
          <StateCell key={state} label={stateLabel(state)} state={state} wide>
            <div inert>
              <Tabs
                label={t('dev.gallery.arena.tabs.label')}
                tabs={tabItems()}
                globalKeys={false}
                forced={{ index: 1, state }}
              />
            </div>
          </StateCell>
        ))}
        <StateCell label={stateLabel('disabled')} state="disabled" wide>
          <div inert>
            <Tabs
              label={t('dev.gallery.arena.tabs.label')}
              tabs={tabItems()}
              globalKeys={false}
              forced={{ index: 3, state: 'hover' }}
            />
          </div>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="tabs" />
    </GalleryBlock>
  )
}

/* ── Chips ──────────────────────────────────────────────────────────────────────────────── */

function DataChipBlock() {
  return (
    <GalleryBlock id="chip-dato" title={t('dev.gallery.components.dataChip')}>
      <GalleryRow>
        <StateCell label={t('dev.gallery.arena.chips.tempo')}>
          <DataChip value="92" unit={t('dev.gallery.arena.chips.bpm')} />
        </StateCell>
        <StateCell label={t('dev.gallery.arena.chips.keyLabel')}>
          <DataChip value={t('dev.gallery.arena.chips.key')} word />
        </StateCell>
        <StateCell label={t('dev.gallery.arena.chips.durationLabel')}>
          <DataChip value="1:12" unit={t('dev.gallery.arena.chips.min')} />
        </StateCell>
        <StateCell label={t('dev.gallery.arena.chips.genreLabel')}>
          <DataChip
            value={t('dev.gallery.arena.chips.genre')}
            unit={t('dev.gallery.arena.chips.suggested')}
            unitFirst
            word
          />
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}

function FilterChipBlock() {
  const [only, setOnly] = useState(false)
  const label = t('dev.gallery.arena.chips.onlyUnvoted')
  return (
    <GalleryBlock id="chip-filtro" title={t('dev.gallery.components.filterChip')}>
      <GalleryRow>
        <StateCell label={stateLabel('rest')} state="rest">
          <FilterChip label={label} pressed={only} onChange={setOnly} />
        </StateCell>
        {(['hover', 'focus', 'pressed'] as const).map((state) => (
          <StateCell key={state} label={stateLabel(state)} state={state}>
            <FilterChip label={label} pressed={state === 'pressed'} state={state} tabIndex={-1} />
          </StateCell>
        ))}
        <StateCell label={stateLabel('selected')}>
          <FilterChip label={label} pressed tabIndex={-1} />
        </StateCell>
        <StateCell label={stateLabel('disabled')} state="disabled">
          <FilterChip label={label} pressed={false} disabled />
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="filterChip" />
    </GalleryBlock>
  )
}

/* ── Sello de goma ──────────────────────────────────────────────────────────────────────── */

function StampBlock() {
  return (
    <GalleryBlock id="sello" title={t('dev.gallery.components.stamp')}>
      <GalleryRow>
        <StateCell label={t('dev.gallery.arena.stamps.notVotedLabel')}>
          <Stamp turn={-0.3}>{t('ui.fighterCard.notVoted')}</Stamp>
        </StateCell>
        <StateCell label={t('dev.gallery.arena.stamps.votedLabel')}>
          <Stamp tone="red" turn={0.4}>
            {t('ui.fighterCard.voted', { vote: 4 })}
          </Stamp>
        </StateCell>
        <StateCell label={t('dev.gallery.arena.stamps.hiddenLabel')}>
          <Stamp turn={-0.8}>{t('ui.fighterCard.authorHidden')}</Stamp>
        </StateCell>
        <StateCell label={t('dev.gallery.arena.stamps.sealedLabel')}>
          <Stamp tone="red" turn={1}>
            {t('dev.gallery.arena.stamps.sealed')}
          </Stamp>
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}

/* ── Ficha de luchador ──────────────────────────────────────────────────────────────────── */

function sampleFighter(): FighterEntry {
  return {
    alias: t('dev.gallery.arena.entries.tiger'),
    title: t('dev.gallery.arena.entries.tigerTitle'),
    bpm: 94,
    musicalKey: t('dev.gallery.arena.chips.key'),
    durationSeconds: 171,
    genre: t('dev.gallery.arena.entries.genre'),
    peaks: samplePeaks('tigre-purpura'),
  }
}

function FighterCardBlock() {
  return (
    <GalleryBlock id="ficha" title={t('dev.gallery.components.fighterCard')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest" wide>
          <FighterCard entry={sampleFighter()} onListen={noop} onJury={noop} />
        </StateCell>
        <StateCell label={stateLabel('loading')} state="loading" wide>
          <FighterCard loading className={styles.fill} />
        </StateCell>
        <StateCell label={stateLabel('error')} state="error" wide>
          <FighterCard error onRetry={noop} />
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="fighterCard" />
    </GalleryBlock>
  )
}

/* ── Casilla de entrada ─────────────────────────────────────────────────────────────────── */

const GRID_ENTRIES = ['tiger', 'cobra', 'lynx', 'lighthouse', 'siren', 'comet', 'thunder'] as const

function EntryCellBlock() {
  const grid = useRovingGrid({ count: GRID_ENTRIES.length + 1, columns: 4 })
  const cell = (alias: string) => ({ alias, bpm: 94, musicalKey: t('dev.gallery.arena.chips.key') })
  const inert = { role: 'option', tabIndex: -1, 'aria-selected': false, 'data-cursor': '' } as const
  return (
    <GalleryBlock id="casilla" title={t('dev.gallery.components.entryCell')}>
      <GalleryRow title={t('dev.gallery.states.static')}>
        {(['rest', 'hover', 'focus', 'pressed'] as const).map((state) => (
          <StateCell key={state} label={stateLabel(state)} state={state}>
            <div role="listbox" aria-label={stateLabel(state)} className={styles.cellStage}>
              <EntryCell
                {...cell(t('dev.gallery.arena.entries.tiger'))}
                itemProps={inert}
                state={state === 'rest' ? undefined : state}
              />
            </div>
          </StateCell>
        ))}
        <StateCell label={stateLabel('loading')} state="loading">
          <div role="listbox" aria-label={stateLabel('loading')} className={styles.cellStage}>
            <EntryCell loading alias="" itemProps={inert} />
          </div>
        </StateCell>
        <StateCell label={t('dev.gallery.arena.entries.votedState')} state="disabled">
          <div role="listbox" aria-label={stateLabel('disabled')} className={styles.cellStage}>
            <EntryCell {...cell(t('dev.gallery.arena.entries.cobra'))} myVote={4} itemProps={inert} />
          </div>
        </StateCell>
        <StateCell label={stateLabel('error')} state="error">
          <div role="listbox" aria-label={stateLabel('error')} className={styles.cellStage}>
            <EntryCell {...cell(t('dev.gallery.arena.entries.lynx'))} error itemProps={inert} />
          </div>
        </StateCell>
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.states.interactive')} wide>
        <div
          {...grid.getContainerProps({ 'aria-label': t('dev.gallery.arena.entries.gridLabel') })}
          className={styles.grid}
        >
          {GRID_ENTRIES.map((entry, index) => (
            <EntryCell
              key={entry}
              {...cell(t(`dev.gallery.arena.entries.${entry}`))}
              myVote={index >= 5 ? 3 : undefined}
              itemProps={grid.getItemProps(index)}
            />
          ))}
          <EntryCell itemProps={grid.getItemProps(GRID_ENTRIES.length)} />
        </div>
      </GalleryRow>
      <StateMatrixRow component="entryCell" />
    </GalleryBlock>
  )
}

/* ── Fila de entrada ────────────────────────────────────────────────────────────────────── */

function EntryRowBlock() {
  const [playing, setPlaying] = useState(false)
  const base = {
    title: t('dev.gallery.arena.rows.neon'),
    subtitle: t('dev.gallery.arena.rows.neonSub'),
    to: '/e/neon-en-sants',
  }
  const sealed = { position: 1, score: 4.62, medal: 1 as const }
  return (
    <GalleryBlock id="fila" title={t('dev.gallery.components.entryRow')}>
      <p className={styles.note}>{t('dev.gallery.arena.rows.note')}</p>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest" wide>
          <EntryList>
            <EntryRow {...base} result={sealed} />
            <EntryRow
              title={t('dev.gallery.arena.rows.rain')}
              subtitle={t('dev.gallery.arena.rows.rainSub')}
              playing={playing}
              onPlayToggle={() => setPlaying((value) => !value)}
            />
          </EntryList>
        </StateCell>
        <StateCell label={stateLabel('hover')} state="hover" wide>
          <EntryRow {...base} result={{ position: 4, score: 4.2 }} state="hover" />
        </StateCell>
        <StateCell label={stateLabel('focus')} state="focus" wide>
          <EntryRow {...base} result={{ position: 2, score: 4.45, medal: 2 }} state="focusTitle" />
        </StateCell>
        <StateCell label={stateLabel('pressed')} state="pressed" wide>
          <EntryRow {...base} state="pressed" />
        </StateCell>
        <StateCell label={stateLabel('loading')} state="loading" wide>
          <EntryRow {...base} status="loading" />
        </StateCell>
        <StateCell label={stateLabel('disabled')} state="disabled" wide>
          <EntryRow {...base} disabled />
        </StateCell>
        <StateCell label={stateLabel('error')} state="error" wide>
          <EntryRow {...base} status="error" result={{ position: 3, score: 4.12, medal: 3 }} />
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="entryRow" />
    </GalleryBlock>
  )
}

/* ── Tesela ─────────────────────────────────────────────────────────────────────────────── */

function TileBlock() {
  return (
    <GalleryBlock id="tesela" title={t('dev.gallery.components.tile')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest" wide>
          <DataTileList className={styles.tiles}>
            <DataTile
              label={t('dev.gallery.arena.tiles.best')}
              value={t('dev.gallery.arena.tiles.bestValue')}
              unit={t('dev.gallery.arena.tiles.bestUnit')}
              hot
            />
            <DataTile
              label={t('dev.gallery.arena.tiles.streak')}
              value="6"
              unit={t('dev.gallery.arena.tiles.weeks')}
            />
            <DataTile label={t('dev.gallery.arena.tiles.mean')} value="4,18" />
            <DataTile label={t('ui.fighterCard.key')} value={t('dev.gallery.arena.chips.key')} word />
          </DataTileList>
        </StateCell>
        <StateCell label={stateLabel('loading')} state="loading">
          <DataTileList>
            <DataTile label={t('dev.gallery.arena.tiles.mean')} value="" loading />
          </DataTileList>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="tile" />
    </GalleryBlock>
  )
}

/* ── Forma de onda ──────────────────────────────────────────────────────────────────────── */

function WaveformBlock() {
  const [progress, setProgress] = useState(0.24)
  const peaks = samplePeaks('onda-galeria')
  const threshold = { at: 45 / 171, label: t('dev.gallery.arena.wave.threshold') }
  return (
    <GalleryBlock id="onda" title={t('dev.gallery.components.waveform')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest" wide>
          <Waveform
            peaks={peaks}
            progress={progress}
            onSeek={setProgress}
            duration={171}
            threshold={threshold}
          />
        </StateCell>
        {(['hover', 'focus', 'pressed'] as const).map((state) => (
          <StateCell key={state} label={stateLabel(state)} state={state}>
            <div inert className={styles.fill}>
              <Waveform
                peaks={peaks}
                progress={0.4}
                onSeek={noop}
                duration={171}
                state={state}
                animateIn={false}
              />
            </div>
          </StateCell>
        ))}
        <StateCell label={stateLabel('loading')} state="loading">
          <div className={styles.fill}>
            <Waveform peaks={peaks} onSeek={noop} duration={171} loading animateIn={false} />
          </div>
        </StateCell>
        <StateCell label={stateLabel('disabled')} state="disabled">
          <div className={styles.fill}>
            <Waveform peaks={peaks} progress={0.3} onSeek={noop} duration={171} disabled animateIn={false} />
          </div>
        </StateCell>
        <StateCell label={stateLabel('error')} state="error">
          <div className={styles.fill}>
            <Waveform peaks={peaks} error={t('dev.gallery.arena.wave.error')} />
          </div>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="waveform" />
    </GalleryBlock>
  )
}

/* ── Ventana (modal) ────────────────────────────────────────────────────────────────────── */

function ModalBlock() {
  const [open, setOpen] = useState(false)
  const footer = (
    <>
      <Button variant="outline" keyHint={t('frame.keys.glyph.escape')} onClick={() => setOpen(false)}>
        {t('dev.gallery.arena.modal.cancel')}
      </Button>
      <Button keyHint={t('frame.keys.glyph.enter')} onClick={() => setOpen(false)}>
        {t('dev.gallery.arena.modal.confirm')}
      </Button>
    </>
  )
  const surface = {
    title: t('dev.gallery.arena.modal.title'),
    description: t('dev.gallery.arena.modal.description'),
    onClose: noop,
  }
  return (
    <GalleryBlock id="ventana" title={t('dev.gallery.components.modal')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest">
          <div inert>
            <ModalSurface {...surface} footer={footer} />
          </div>
        </StateCell>
        <StateCell label={stateLabel('focus')} state="focus">
          <div inert>
            <ModalSurface {...surface} closeState="focus" />
          </div>
        </StateCell>
        <StateCell label={stateLabel('loading')} state="loading">
          <div inert>
            <ModalSurface {...surface} busy />
          </div>
        </StateCell>
        <StateCell label={stateLabel('error')} state="error">
          <div inert>
            <ModalSurface {...surface} error={t('dev.gallery.arena.modal.error')} />
          </div>
        </StateCell>
        <StateCell label={t('dev.gallery.states.interactive')}>
          <Button variant="outline" onClick={() => setOpen(true)}>
            {t('dev.gallery.arena.modal.open')}
          </Button>
        </StateCell>
      </GalleryRow>
      <Modal
        open={open}
        title={surface.title}
        description={surface.description}
        onClose={() => setOpen(false)}
        footer={footer}
      >
        <p>{t('dev.gallery.arena.modal.body')}</p>
      </Modal>
      <StateMatrixRow component="modal" />
    </GalleryBlock>
  )
}

/* ── Anunciador ─────────────────────────────────────────────────────────────────────────── */

function AnnouncerBlock() {
  return (
    <GalleryBlock id="anunciador" title={t('dev.gallery.components.announcer')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest">
          <Announcer text={t('dev.gallery.arena.announcer.round')} silent />
        </StateCell>
        <StateCell label={t('dev.gallery.arena.announcer.tagLabel')}>
          <Announcer text={t('dev.gallery.arena.announcer.voteSaved')} variant="tag" silent />
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="announcer" />
    </GalleryBlock>
  )
}

/* ── Aviso ──────────────────────────────────────────────────────────────────────────────── */

function ToastBlock() {
  const info = {
    tone: 'info' as const,
    title: t('dev.gallery.arena.toast.info'),
    message: t('dev.gallery.arena.toast.infoMessage'),
  }
  return (
    <GalleryBlock id="aviso" title={t('dev.gallery.components.toast')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest">
          <Toast toast={info} onDismiss={noop} />
        </StateCell>
        {(['hover', 'focus', 'pressed'] as const).map((state) => (
          <StateCell key={state} label={stateLabel(state)} state={state}>
            <div inert className={styles.fill}>
              <Toast toast={info} onDismiss={noop} state={state} />
            </div>
          </StateCell>
        ))}
        <StateCell label={stateLabel('success')} state="success">
          <Toast
            toast={{
              tone: 'success',
              title: t('dev.gallery.arena.toast.success'),
              message: t('dev.gallery.arena.toast.successMessage'),
            }}
            onDismiss={noop}
          />
        </StateCell>
        <StateCell label={stateLabel('error')} state="error">
          <Toast
            toast={{
              tone: 'error',
              title: t('dev.gallery.arena.toast.error'),
              message: t('dev.gallery.arena.toast.errorMessage'),
            }}
            onDismiss={noop}
          />
        </StateCell>
      </GalleryRow>
      <GalleryRow title={t('dev.gallery.states.interactive')}>
        <div className={styles.row}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info(info.title, { message: info.message })}
          >
            {t('dev.gallery.arena.toast.launchInfo')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success(t('dev.gallery.arena.toast.success'))}
          >
            {t('dev.gallery.arena.toast.launchSuccess')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.error(t('dev.gallery.arena.toast.error'))}>
            {t('dev.gallery.arena.toast.launchError')}
          </Button>
        </div>
      </GalleryRow>
      <StateMatrixRow component="toast" />
    </GalleryBlock>
  )
}

/* ── Medidor ────────────────────────────────────────────────────────────────────────────── */

function xpMeter(value: number, max = 3350, min = 2650, state?: 'gain') {
  return (
    <Meter
      value={value}
      min={min}
      max={max}
      label={t('dev.gallery.arena.meter.xp')}
      valueText={t('dev.gallery.arena.meter.xpText', { value, max, next: 8 })}
      caption={{
        start: t('dev.gallery.arena.meter.start', { value }),
        end: t('dev.gallery.arena.meter.end', { next: 8, max }),
      }}
      width="12rem"
      state={state}
    />
  )
}

function MeterBlock() {
  const [xp, setXp] = useState(2980)
  return (
    <GalleryBlock id="medidor" title={t('dev.gallery.components.meter')}>
      <GalleryRow>
        <StateCell label={stateLabel('rest')} state="rest">
          {xpMeter(2980)}
        </StateCell>
        <StateCell label={stateLabel('gain')}>{xpMeter(3100, 3350, 2650, 'gain')}</StateCell>
        <StateCell label={t('dev.gallery.arena.meter.full')} state="success">
          {xpMeter(3350)}
        </StateCell>
        <StateCell label={t('dev.gallery.states.interactive')}>
          <div className={styles.stack}>
            {xpMeter(xp)}
            <Button size="sm" variant="outline" onClick={() => setXp((value) => Math.min(3350, value + 40))}>
              {t('dev.gallery.arena.meter.add')}
            </Button>
          </div>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="meter" />
    </GalleryBlock>
  )
}

/* ── Esqueleto ──────────────────────────────────────────────────────────────────────────── */

function SkeletonBlock() {
  return (
    <GalleryBlock id="esqueleto" title={t('dev.gallery.components.skeleton')}>
      <GalleryRow>
        <StateCell label={stateLabel('loading')} state="loading">
          <SkeletonGroup className={styles.fill}>
            <Skeleton />
            <Skeleton shape="text" width="70%" />
            <Skeleton shape="text" width="45%" />
          </SkeletonGroup>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="skeleton" />
    </GalleryBlock>
  )
}

/* ── Reloj de ronda ─────────────────────────────────────────────────────────────────────── */

const HOUR = 3_600_000
const fixed = () => GALLERY_NOW

function RoundClockBlock() {
  const label = t('dev.gallery.arena.clock.label')
  const when = t('dev.gallery.arena.clock.when')
  const week = { today: 2, progress: 0.36 }
  return (
    <GalleryBlock id="reloj" title={t('dev.gallery.components.roundClock')}>
      <GalleryRow wide>
        <StateCell label={stateLabel('rest')} state="rest">
          <RoundClock
            target={GALLERY_NOW + 103 * HOUR + 765_000}
            now={fixed}
            label={label}
            when={when}
            week={week}
          />
        </StateCell>
        <StateCell label={stateLabel('urgent')}>
          <RoundClock
            target={GALLERY_NOW + 7 * HOUR}
            now={fixed}
            label={label}
            when={when}
            week={{ today: 6, progress: 0.4 }}
          />
        </StateCell>
        <StateCell label={stateLabel('final')}>
          <RoundClock
            target={GALLERY_NOW + 0.5 * HOUR}
            now={fixed}
            label={label}
            when={when}
            week={{ today: 6, progress: 0.8 }}
          />
        </StateCell>
        <StateCell label={t('dev.gallery.arena.clock.ended')} state="error">
          <RoundClock
            target={GALLERY_NOW - HOUR}
            now={fixed}
            label={label}
            when={when}
            week={{ today: 6, progress: 1 }}
          />
        </StateCell>
        <StateCell label={t('dev.gallery.arena.clock.inline')}>
          <div className={styles.fill}>
            <RoundClock
              target={GALLERY_NOW + 103 * HOUR}
              now={fixed}
              label={label}
              variant="inline"
              week={week}
            />
          </div>
        </StateCell>
      </GalleryRow>
      <StateMatrixRow component="roundClock" />
    </GalleryBlock>
  )
}

/* ── Placa de título, portada y medallas ────────────────────────────────────────────────── */

function TitlePlateBlock() {
  return (
    <GalleryBlock id="placa" title={t('dev.gallery.components.titlePlate')}>
      <GalleryRow>
        <StateCell label={t('dev.gallery.arena.plate.label')} wide>
          <TitlePlate kicker={t('frame.plates.profile')} title={t('pages.profile.title')} />
        </StateCell>
        <StateCell label={t('dev.gallery.arena.plate.labelHowTo')} wide>
          <TitlePlate kicker={t('frame.plates.howItWorks')} title={t('pages.howItWorks.title')} />
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}

function CoverBlock() {
  return (
    <GalleryBlock id="portada" title={t('dev.gallery.components.cover')}>
      <p className={styles.note}>{t('dev.gallery.arena.cover.note')}</p>
      <GalleryRow>
        <StateCell label={t('dev.gallery.arena.cover.label')}>
          <div className={styles.cover}>
            <CoverArt />
          </div>
        </StateCell>
        <StateCell label={t('dev.gallery.arena.cover.medals')}>
          <div className={styles.row}>
            <Medal place={1} />
            <Medal place={2} />
            <Medal place={3} />
          </div>
        </StateCell>
      </GalleryRow>
    </GalleryBlock>
  )
}
