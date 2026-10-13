import {
  type BeatGenre,
  type DAWS,
  type EntryCreate,
  EntryCreateSchema,
  type MusicalKey,
} from '@beatbattle/shared'

/**
 * La hoja del luchador (§2.5, paso 4; tarea 4.15): lo que se escribe en la ficha, como texto de los campos,
 * y su paso a lo que pide la API (`EntryCreate` sin el *intent*), con el mismo esquema que el servidor.
 * El borrador se guarda en `sessionStorage` por semana: si la subida falla o se recarga, no se pierde
 * (`RF-ENT-12`).
 */
export interface EntryDraft {
  title: string
  /** Texto del campo (vacío = sin BPM). */
  bpm: string
  musicalKey: MusicalKey | ''
  /** Uno de `DAWS`, `'other'` (con `dawOther`) o vacío. */
  daw: (typeof DAWS)[number] | 'other' | ''
  dawOther: string
  genres: BeatGenre[]
  description: string
  declaration: boolean
}

export const EMPTY_DRAFT: EntryDraft = {
  title: '',
  bpm: '',
  musicalKey: '',
  daw: '',
  dawOther: '',
  genres: [],
  description: '',
  declaration: false,
}

export type DraftField = 'title' | 'bpm' | 'daw' | 'genres' | 'description' | 'declaration'
export type DraftErrors = Partial<Record<DraftField, string>>

const draftKey = (slug: string) => `bb:upload-draft:${slug}`

/** El borrador guardado de la semana, o `null` (sin `sessionStorage`, también). */
export function loadDraft(slug: string): EntryDraft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(slug))
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<EntryDraft>), declaration: false } : null
  } catch {
    return null
  }
}

export function saveDraft(slug: string, draft: EntryDraft): void {
  try {
    // La declaración no se guarda: se marca cada vez que se sube.
    window.sessionStorage.setItem(draftKey(slug), JSON.stringify({ ...draft, declaration: false }))
  } catch {
    // Sin almacenamiento (modo privado): la ficha vive solo en la página.
  }
}

export function clearDraft(slug: string): void {
  try {
    window.sessionStorage.removeItem(draftKey(slug))
  } catch {
    // Igual que arriba.
  }
}

/** La ficha para la API (sin `intentId`): los campos tal cual los valida el servidor. */
export function draftToFields(draft: EntryDraft): Omit<EntryCreate, 'intentId' | 'coverIntentId'> {
  const bpm = draft.bpm.trim() === '' ? null : Number(draft.bpm.replace(',', '.'))
  const daw = draft.daw === 'other' ? draft.dawOther.trim() || null : draft.daw || null
  const description = draft.description.trim()
  return {
    title: draft.title.trim(),
    bpm,
    musicalKey: draft.musicalKey || null,
    daw,
    genres: draft.genres,
    description: description === '' ? null : description,
    declaration: draft.declaration as true,
  }
}

const FIELD_OF: Record<string, DraftField> = {
  title: 'title',
  bpm: 'bpm',
  daw: 'daw',
  genres: 'genres',
  description: 'description',
  declaration: 'declaration',
}

/**
 * Los problemas de la ficha, campo a campo (el primero de cada uno), con el esquema de la API. `messages`
 * da la frase de cada campo (la UI la traduce).
 */
export function validateDraft(draft: EntryDraft, messages: Record<DraftField, string>): DraftErrors {
  const result = EntryCreateSchema.safeParse({ intentId: 'x', ...draftToFields(draft) })
  if (result.success) return {}
  const errors: DraftErrors = {}
  for (const issue of result.error.issues) {
    const field = FIELD_OF[String(issue.path[0])]
    if (field && !errors[field]) errors[field] = messages[field]
  }
  return errors
}
