import {
  BEAT_GENRES,
  type BeatGenre,
  DAWS,
  ENTRY_COVER_MAX_BYTES,
  ENTRY_COVER_MIMES,
  ENTRY_DAW_MAX,
  ENTRY_DESCRIPTION_MAX,
  ENTRY_MAX_GENRES,
  ENTRY_TITLE_MAX,
  MUSICAL_KEYS,
} from '@beatbattle/shared'
import { type FormEvent, useId, useRef, useState } from 'react'
import { t } from '../../i18n'
import { Button } from '../../ui/Button'
import { FilterChip } from '../../ui/Chip'
import { TextAreaField, TextField } from '../../ui/Field'
import { Frame } from '../../ui/Frame'
import { cx } from '../../ui/forceState'
import { PaperNotice } from '../account/FormBits'
import { musicalKeyName } from '../week/weekModel'
import styles from './EntrySheet.module.css'
import {
  type DraftErrors,
  type DraftField,
  draftToFields,
  type EntryDraft,
  validateDraft,
} from './entrySheet'

/** Lo que sale de la hoja: la ficha para la API y la portada propia, si la hay. */
export interface EntrySheetResult {
  fields: ReturnType<typeof draftToFields>
  cover: File | null
}

const ORDER: DraftField[] = ['title', 'bpm', 'daw', 'genres', 'description', 'declaration']

/**
 * La hoja del luchador (§2.5, paso 4; §3.8.5; tarea 4.15): título, BPM y tonalidad prerrellenados por el
 * análisis (`RF-ENT-06`), DAW de la lista u «otro», hasta 3 géneros de la lista del sello, descripción,
 * portada propia opcional (en voto ciego no se ve hasta el sellado: se avisa) y la declaración. Paneles
 * opacos con campos de marco. Al enviar se valida con el esquema del servidor y el foco va al primer
 * problema. El borrador lo guarda quien la usa (`onChange`), para no perderlo si algo falla.
 */
export function EntrySheet({
  draft,
  onChange,
  onSubmit,
  blind,
  busy = false,
}: {
  draft: EntryDraft
  onChange: (draft: EntryDraft) => void
  onSubmit: (result: EntrySheetResult) => void
  /** La semana es de voto ciego (por defecto): la portada propia queda oculta hasta el sellado. */
  blind: boolean
  busy?: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [cover, setCover] = useState<File | null>(null)
  const [coverError, setCoverError] = useState<string | null>(null)
  const keyId = useId()
  const dawId = useId()
  const genresId = useId()
  const genresHintId = useId()
  const set = <K extends keyof EntryDraft>(field: K, value: EntryDraft[K]) => {
    onChange({ ...draft, [field]: value })
    if (field in errors) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const messages: Record<DraftField, string> = {
    title: t('pages.upload.sheet.errors.title'),
    bpm: t('pages.upload.sheet.errors.bpm'),
    daw: t('pages.upload.sheet.errors.daw'),
    genres: t('pages.upload.sheet.errors.genres'),
    description: t('pages.upload.sheet.errors.description'),
    declaration: t('pages.upload.sheet.errors.declaration'),
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateDraft(draft, messages)
    setErrors(found)
    const first = ORDER.find((field) => found[field])
    if (first) {
      formRef.current
        ?.querySelector<HTMLElement>(`[data-field="${first}"] :is(input, select, textarea, button)`)
        ?.focus()
      return
    }
    onSubmit({ fields: draftToFields(draft), cover })
  }

  const toggleGenre = (genre: BeatGenre, on: boolean) => {
    const next = on ? [...draft.genres, genre] : draft.genres.filter((item) => item !== genre)
    set('genres', next)
  }

  const pickCover = (file: File | undefined) => {
    if (!file) return
    if (!(ENTRY_COVER_MIMES as readonly string[]).includes(file.type)) {
      setCoverError(t('pages.upload.sheet.cover.format'))
      return
    }
    if (file.size > ENTRY_COVER_MAX_BYTES) {
      setCoverError(t('pages.upload.sheet.cover.size'))
      return
    }
    setCoverError(null)
    setCover(file)
  }

  return (
    <Frame as="form" ref={formRef} variant="panel" className={styles.sheet} onSubmit={submit} noValidate>
      <h2 className={cx('bb-display', styles.heading)}>{t('pages.upload.sheet.title')}</h2>
      <div data-field="title">
        <TextField
          label={t('pages.upload.sheet.fields.title')}
          hint={t('pages.upload.sheet.hints.title')}
          value={draft.title}
          maxLength={ENTRY_TITLE_MAX}
          autoComplete="off"
          error={errors.title}
          onChange={(event) => set('title', event.target.value)}
        />
      </div>
      <div className={styles.row}>
        <div data-field="bpm">
          <TextField
            label={t('pages.upload.sheet.fields.bpm')}
            hint={t('pages.upload.sheet.hints.suggested')}
            value={draft.bpm}
            inputMode="decimal"
            autoComplete="off"
            error={errors.bpm}
            onChange={(event) => set('bpm', event.target.value)}
          />
        </div>
        <label className={styles.select} htmlFor={keyId}>
          <span className={styles.selectLabel}>{t('pages.upload.sheet.fields.key')}</span>
          <select
            id={keyId}
            value={draft.musicalKey}
            onChange={(event) => set('musicalKey', event.target.value as EntryDraft['musicalKey'])}
          >
            <option value="">{t('pages.upload.sheet.keyNone')}</option>
            {MUSICAL_KEYS.map((key) => (
              <option key={key} value={key}>
                {musicalKeyName(key)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.row} data-field="daw">
        <label className={styles.select} htmlFor={dawId}>
          <span className={styles.selectLabel}>{t('pages.upload.sheet.fields.daw')}</span>
          <select
            id={dawId}
            value={draft.daw}
            onChange={(event) => set('daw', event.target.value as EntryDraft['daw'])}
          >
            <option value="">{t('pages.upload.sheet.dawNone')}</option>
            {DAWS.map((daw) => (
              <option key={daw} value={daw}>
                {daw}
              </option>
            ))}
            <option value="other">{t('pages.upload.sheet.dawOther')}</option>
          </select>
        </label>
        {draft.daw === 'other' && (
          <TextField
            label={t('pages.upload.sheet.fields.dawOther')}
            value={draft.dawOther}
            maxLength={ENTRY_DAW_MAX}
            autoComplete="off"
            error={errors.daw}
            onChange={(event) => set('dawOther', event.target.value)}
          />
        )}
      </div>
      <fieldset className={styles.genres} data-field="genres" aria-describedby={genresHintId}>
        <legend id={genresId} className={styles.selectLabel}>
          {t('pages.upload.sheet.fields.genres')}
        </legend>
        <p id={genresHintId} className={styles.hint}>
          {t('pages.upload.sheet.hints.genres', { count: draft.genres.length, max: ENTRY_MAX_GENRES })}
        </p>
        <div className={styles.chips}>
          {BEAT_GENRES.map((genre) => {
            const on = draft.genres.includes(genre)
            return (
              <FilterChip
                key={genre}
                label={genreLabel(genre)}
                pressed={on}
                disabled={!on && draft.genres.length >= ENTRY_MAX_GENRES}
                onChange={(value) => toggleGenre(genre, value)}
              />
            )
          })}
        </div>
      </fieldset>
      <div data-field="description">
        <TextAreaField
          label={t('pages.upload.sheet.fields.description')}
          value={draft.description}
          maxLength={ENTRY_DESCRIPTION_MAX}
          rows={3}
          onChange={(event) => set('description', event.target.value)}
        />
      </div>
      <div className={styles.cover}>
        <span className={styles.selectLabel}>{t('pages.upload.sheet.fields.cover')}</span>
        <p className={styles.hint}>
          {blind ? t('pages.upload.sheet.cover.blind') : t('pages.upload.sheet.cover.open')}
        </p>
        <div className={styles.coverRow}>
          <Button variant="outline" size="sm" onClick={() => coverRef.current?.click()}>
            {cover ? t('pages.upload.sheet.cover.change') : t('pages.upload.sheet.cover.add')}
          </Button>
          {cover && (
            <>
              <span className={styles.coverName}>{cover.name}</span>
              <Button variant="outline" size="sm" onClick={() => setCover(null)}>
                {t('pages.upload.sheet.cover.remove')}
              </Button>
            </>
          )}
        </div>
        <input
          ref={coverRef}
          className={styles.input}
          type="file"
          accept={ENTRY_COVER_MIMES.join(',')}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            pickCover(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        {coverError && <PaperNotice live>{coverError}</PaperNotice>}
      </div>
      <div data-field="declaration">
        <FilterChip
          variant="plate"
          label={t('pages.upload.sheet.fields.declaration')}
          pressed={draft.declaration}
          onChange={(value) => set('declaration', value)}
          aria-describedby={errors.declaration ? 'declaration-missing' : undefined}
        />
        {errors.declaration && (
          <p id="declaration-missing" className={styles.error} role="alert">
            {errors.declaration}
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <Button type="submit" variant="cta" size="lg" loading={busy} keyHint={t('frame.keys.glyph.enter')}>
          {t('pages.upload.sheet.submit')}
        </Button>
      </div>
    </Frame>
  )
}

/** El nombre de cada género en la UI (la API guarda la grafía del sello, «Reggaeton»). */
export function genreLabel(genre: BeatGenre): string {
  const labels: Record<BeatGenre, string> = {
    Trap: t('pages.upload.genres.trap'),
    Jerk: t('pages.upload.genres.jerk'),
    Hoodtrap: t('pages.upload.genres.hoodtrap'),
    Drill: t('pages.upload.genres.drill'),
    'Boom Bap': t('pages.upload.genres.boomBap'),
    Crank: t('pages.upload.genres.crank'),
    Reggaeton: t('pages.upload.genres.reggaeton'),
    Electronic: t('pages.upload.genres.electronic'),
    Afrobeats: t('pages.upload.genres.afrobeats'),
    Club: t('pages.upload.genres.club'),
    Dancehall: t('pages.upload.genres.dancehall'),
    Jersey: t('pages.upload.genres.jersey'),
    Amapiano: t('pages.upload.genres.amapiano'),
  }
  return labels[genre]
}
