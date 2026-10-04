import es from './es.json'
import { createTranslator, type MessageKeys, type PluralKeys, type SimpleKeys } from './translator'

/**
 * i18n de la app (guía §4.7.8): `t('clave', vars)` sobre `es.json`, con las claves tipadas a partir
 * del propio JSON. En desarrollo y en tests una clave inexistente lanza un error; en producción se
 * muestra la propia clave.
 */

export type Messages = typeof es
/** Cualquier clave válida de `es.json` (las de plural, sin sufijo). */
export type MessageKey = MessageKeys<Messages>
export type SimpleMessageKey = SimpleKeys<Messages>
export type PluralMessageKey = PluralKeys<Messages>

export const t = createTranslator(es, { strict: import.meta.env.DEV })

export { DATE_FORMATS, type DateFormatOptions, formatDate, formatNumber, LOCALE, TIME_ZONE } from './format'
export { createTranslator, type MessageVars, type Translator } from './translator'
