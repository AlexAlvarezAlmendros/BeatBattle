import {
  BEAT_GENRES,
  ENTRY_ORDERS,
  type EntryListQuery,
  type EntryOrder,
  type ListedEntry,
  MUSICAL_KEYS,
  type MusicalKey,
  type PublicWeek,
} from '@beatbattle/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useState } from 'react'
import { type LoaderFunctionArgs, useLoaderData, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { ScreenPage } from '../../app/ScreenPage'
import { formatNumber, t } from '../../i18n'
import { queryKeys } from '../../net/queryKeys'
import { entryListSearch, listEntries } from '../../net/votes'
import { weekQuery } from '../../net/weeks'
import { Button } from '../../ui/Button'
import { FilterChip } from '../../ui/Chip'
import { GenerativeCover } from '../../ui/CoverArt'
import { EntryCell } from '../../ui/EntryCell'
import { FighterCard } from '../../ui/FighterCard'
import { useMediaQuery } from '../../ui/hooks/useMediaQuery'
import { useRovingGrid } from '../../ui/hooks/useRovingGrid'
import { useShortcuts } from '../../ui/shortcuts'
import { Tabs } from '../../ui/Tabs'
import { usePlayer } from '../player/store'
import { entryTrack } from '../player/tracks'
import { weekLoader } from '../week/WeekPage'
import { decodePeaks, musicalKeyName } from '../week/weekModel'
import styles from './SelectEntryPage.module.css'

/** `/semana/:slug/entradas`: la semana ya empezada (la de su página; 404 si no existe o no ha caído). */
export function selectEntryLoader(args: LoaderFunctionArgs): Promise<PublicWeek> {
  return weekLoader(args)
}

const MOBILE = '(max-width: 720px)'
/** A 360 px o menos, dos columnas: con tres, los alias largos se cortaban (jurado de la 5.22, S1). */
const NARROW = '(max-width: 360px)'

/**
 * «ELIGE ENTRADA» (guía §3.8.13, §2.6; tarea 5.16): la plantilla de la semana con la ficha de luchador de la
 * enfocada. Pestañas de orden con Q/E (Ronda justa por defecto, Recién subidas, Aleatorio; nunca «mejor
 * valoradas»), «Solo sin votar», filtros (F) y la rejilla `listbox` 2D con las votadas al final, atenuadas
 * («✓ VOTADA n/5»), y la casilla «?» de aleatorio. Intro escucha la enfocada en el reproductor global (con
 * la lista como cola); J lleva al Modo Jurado. Sin números de orden, medias, recuentos ni autoría (§1.3).
 */
export function SelectEntryPage() {
  const initial = useLoaderData() as PublicWeek
  const { data: week = initial } = useQuery({ ...weekQuery(initial.slug), initialData: initial })
  const [order, setOrder] = useState<EntryOrder>('fair')
  const [unvoted, setUnvoted] = useState(false)
  const [filters, setFilters] = useState<Pick<EntryListQuery, 'genre' | 'key'>>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [seed, setSeed] = useState(0)
  const query: Partial<EntryListQuery> = {
    order,
    ...(unvoted ? { unvoted: true } : {}),
    ...filters,
    ...(order === 'random' && seed ? { seed } : {}),
  }
  const search = entryListSearch(query)
  const list = useQuery({
    queryKey: queryKeys.entries.list(week.slug, search),
    queryFn: ({ signal }) => listEntries(week.slug, query, signal),
    placeholderData: keepPreviousData,
  })
  const entries = list.data?.entries ?? []
  const mobile = useMediaQuery(MOBILE)
  const narrow = useMediaQuery(NARROW)
  const columns = narrow ? 2 : mobile ? 3 : 6
  const navigate = useNavigate()
  const votingOpen = week.phase === 'open' || week.phase === 'voting'
  const tracks = useMemo(
    () => entries.map((entry) => entryTrack(entry, { votable: votingOpen && !entry.mine })),
    [entries, votingOpen],
  )
  const listen = (index: number) => {
    const track = tracks[index]
    if (track) usePlayer.getState().play(track, { queue: tracks })
  }
  const grid = useRovingGrid({
    count: entries.length + 1,
    columns,
    onActivate: (index) => {
      if (index < entries.length) listen(index)
      else if (entries.length > 0) {
        // La casilla «?»: una al azar entre las que se ven (sin pesos: todas igual, §1.3).
        const pick = Math.floor(Math.random() * entries.length)
        grid.moveTo(pick)
        listen(pick)
      }
    },
  })
  const focused: ListedEntry | undefined = entries[grid.activeIndex]
  const shortcuts = useShortcuts((state) => state.enabled)
  const filtersId = useId()

  // J (Modo Jurado) y F (filtros) desde cualquier parte de la pantalla, como Q/E (atajos de una tecla).
  useEffect(() => {
    if (!shortcuts) return
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 'j') {
        event.preventDefault()
        navigate(focused ? `${paths.jury()}?desde=${encodeURIComponent(focused.id)}` : paths.jury())
      } else if (key === 'f') {
        event.preventDefault()
        setFiltersOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts, navigate, focused])

  const total = list.data?.total ?? week.entries
  const tabs = ENTRY_ORDERS.map((id) => ({ id, label: t(`selection.order.${id}`), panel: null }))
  const fighter = focused ? (
    <FighterCard
      className={styles.fighter}
      cover={<GenerativeCoverOf entry={focused} />}
      entry={{
        alias: focused.alias,
        title: focused.title,
        bpm: Math.round(focused.bpm ?? 0),
        musicalKey: focused.musicalKey ? musicalKeyName(focused.musicalKey) : '—',
        durationSeconds: focused.durationMs / 1000,
        genre: focused.genres.join(' · ') || '—',
        peaks: focused.peaks ? decodePeaks(focused.peaks) : [],
        ...(focused.myVote ? { myVote: focused.myVote } : {}),
      }}
      onListen={() => listen(grid.activeIndex)}
      onJury={() => navigate(`${paths.jury()}?desde=${encodeURIComponent(focused.id)}`)}
    />
  ) : (
    <FighterCard className={styles.fighter} loading={list.isPending} />
  )

  return (
    <ScreenPage
      title={t('selection.title')}
      kicker={t('selection.kicker', { number: week.number })}
      summary={t('selection.summary', { count: formatNumber(total) })}
      documentTitle={t('selection.documentTitle', { number: week.number })}
      // En móvil, la ficha de la enfocada va en la hoja de abajo (§3.8.13).
      piece={mobile ? null : fighter}
      // En la columna única (móvil), la plantilla antes que la ficha: se elige y la ficha la sigue.
      panelFirst
      fill
      actions={null}
    >
      <div className={styles.toolbar}>
        <Tabs
          label={t('selection.orderLabel')}
          tabs={tabs}
          selectedIndex={ENTRY_ORDERS.indexOf(order)}
          onChange={(index) => {
            const next = ENTRY_ORDERS[index] ?? 'fair'
            if (next === 'random') setSeed(Math.floor(Math.random() * 2 ** 31))
            setOrder(next)
          }}
        />
        <FilterChip label={t('selection.unvoted')} pressed={unvoted} onChange={setUnvoted} />
        <button
          type="button"
          className={styles.filtersToggle}
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {t('selection.filters')}
        </button>
      </div>
      {filtersOpen && (
        <fieldset id={filtersId} className={styles.filters}>
          <legend className="sr-only">{t('selection.filters')}</legend>
          <label className={styles.filter}>
            <span>{t('selection.genre')}</span>
            <select
              value={filters.genre ?? ''}
              onChange={(event) =>
                setFilters((f) => ({
                  ...f,
                  genre: (event.target.value || undefined) as EntryListQuery['genre'],
                }))
              }
            >
              <option value="">{t('selection.any')}</option>
              {BEAT_GENRES.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filter}>
            <span>{t('selection.key')}</span>
            <select
              value={filters.key ?? ''}
              onChange={(event) =>
                setFilters((f) => ({
                  ...f,
                  key: (event.target.value || undefined) as MusicalKey | undefined,
                }))
              }
            >
              <option value="">{t('selection.any')}</option>
              {MUSICAL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {musicalKeyName(key)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
      <p className={styles.info}>{t('selection.info', { count: formatNumber(entries.length) })}</p>
      <div
        {...grid.getContainerProps({ 'aria-label': t('selection.gridLabel') })}
        className={styles.grid}
        style={{ '--grid-columns': columns } as React.CSSProperties}
      >
        {entries.map((entry, index) => (
          <EntryCell
            key={entry.id}
            alias={entry.alias}
            bpm={entry.bpm === null ? undefined : Math.round(entry.bpm)}
            musicalKey={entry.musicalKey ? musicalKeyName(entry.musicalKey) : undefined}
            {...(entry.myVote ? { myVote: entry.myVote } : {})}
            cover={<GenerativeCoverOf entry={entry} />}
            itemProps={grid.getItemProps(index)}
          />
        ))}
        <EntryCell itemProps={grid.getItemProps(entries.length)} />
      </div>
      <p className={styles.note}>{t('selection.note')}</p>
      {mobile && focused && (
        <section className={styles.sheet} aria-label={t('selection.sheetLabel')}>
          <p className={`bb-display ${styles.sheetAlias}`}>{focused.alias}</p>
          <p className={styles.sheetData}>
            {[
              focused.bpm === null ? null : `${Math.round(focused.bpm)}\u00a0BPM`,
              focused.musicalKey ? musicalKeyName(focused.musicalKey) : null,
              focused.myVote
                ? t('ui.entryCell.voted', { vote: focused.myVote })
                : t('ui.fighterCard.notVoted'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className={styles.sheetActions}>
            <Button size="sm" icon="triangleRight" onClick={() => listen(grid.activeIndex)}>
              {t('frame.keys.listen')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`${paths.jury()}?desde=${encodeURIComponent(focused.id)}`)}
            >
              {t('frame.keys.jury')}
            </Button>
          </div>
        </section>
      )}
    </ScreenPage>
  )
}

/** La portada de una entrada: la generativa de su semilla (la propia, oculta hasta el sellado). */
function GenerativeCoverOf({ entry }: { entry: ListedEntry }) {
  if (entry.cover.kind === 'own') return <img src={entry.cover.url} alt="" />
  return <GenerativeCover seed={entry.cover.seed} bpm={entry.bpm} musicalKey={entry.musicalKey} />
}
