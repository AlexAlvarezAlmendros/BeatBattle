import { formatNumber } from './format'

/**
 * Traductor mínimo (guía §4.7.8): mensajes en JSON anidado, claves con puntos, interpolación
 * `{nombre}` y plurales con `Intl.PluralRules`.
 *
 * Convenciones de los ficheros de mensajes (`es.json`):
 * - Claves en camelCase anidadas: `pages.home.title` → `{ "pages": { "home": { "title": … } } }`.
 * - El guion bajo queda reservado a los plurales: `entries.count_one`, `entries.count_other` y,
 *   opcionalmente, `entries.count_zero` (para un texto propio con 0; las reglas del castellano lo
 *   tratarían como `other`). Se llaman sin sufijo y con `count`: `t('entries.count', { count: 3 })`.
 * - Variables entre llaves: `"{page} · Beat Battle"`. Los números se formatean en castellano.
 * - Si una variable es un elemento (un enlace dentro de una frase), se usa `t.parts()` o el componente
 *   `<Trans>`: el orden y los separadores siguen en el JSON, no en el JSX.
 */

export type PluralCategory = Intl.LDMLPluralRule
export type MessageVars = Record<string, string | number>

/** Árbol de mensajes: hojas de texto. */
export interface MessageTree {
  readonly [key: string]: string | MessageTree
}

/** Todas las claves hoja de un árbol: `{ a: { b: 'x' } }` → `'a.b'`. */
export type LeafKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : LeafKeys<T[K], `${Prefix}${K}.`>
}[keyof T & string]

/** Claves de plural sin sufijo: `entries.count_one` → `entries.count`. */
export type PluralKeys<T> =
  LeafKeys<T> extends infer K ? (K extends `${infer Base}_${PluralCategory}` ? Base : never) : never

/** Claves normales (sin sufijo de plural). */
export type SimpleKeys<T> = Exclude<LeafKeys<T>, `${string}_${PluralCategory}`>

/** Cualquier clave que acepta `t()`. */
export type MessageKeys<T> = SimpleKeys<T> | PluralKeys<T>

export interface Translator<T> {
  /** Plural: elige `_zero`/`_one`/`_other`… según `count`. */
  (key: PluralKeys<T>, vars: MessageVars & { count: number }): string
  /** Texto normal, con variables opcionales. */
  (key: SimpleKeys<T>, vars?: MessageVars): string
  /** ¿Existe la clave? Para claves compuestas en tiempo de ejecución (`legal.docs.${doc}`). */
  has(key: string): key is MessageKeys<T>
  /**
   * Como `t()`, pero las variables pueden ser cualquier cosa (p. ej. elementos de React) y devuelve
   * los trozos en orden: `t.parts('footer.credit', { brand: 'Beat Battle', otherPeople: <a … /> })`
   * → `['Beat Battle', ' · ', <a … />]`. Los textos vacíos no salen.
   */
  parts<V>(key: MessageKeys<T>, vars: Readonly<Record<string, V | string | number>>): (string | V)[]
}

export interface TranslatorOptions {
  /**
   * Modo estricto (desarrollo y tests): una clave o una variable que falta lanza un error. Sin él
   * (producción) se muestra la propia clave, o la variable sin sustituir, y la página sigue viva.
   */
  strict: boolean
  /** Idioma de las reglas de plural. */
  pluralLocale?: string
}

const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/

export function createTranslator<T extends MessageTree>(
  messages: T,
  options: TranslatorOptions,
): Translator<T> {
  const flat = flatten(messages)
  const pluralBases = new Set(
    [...flat.keys()].filter((k) => PLURAL_SUFFIX.test(k)).map((k) => k.replace(PLURAL_SUFFIX, '')),
  )
  const rules = new Intl.PluralRules(options.pluralLocale ?? 'es')

  const fail = (message: string, fallback: string): string => {
    if (options.strict) throw new Error(`[i18n] ${message}`)
    return fallback
  }

  const resolve = (key: string, vars: MessageVars | undefined): string | undefined => {
    const direct = flat.get(key)
    if (direct !== undefined) return direct
    if (!pluralBases.has(key)) return undefined
    const count = vars?.count
    if (typeof count !== 'number') {
      return fail(`La clave de plural «${key}» necesita la variable numérica «count»`, key)
    }
    if (count === 0 && flat.has(`${key}_zero`)) return flat.get(`${key}_zero`)
    return flat.get(`${key}_${rules.select(count)}`) ?? flat.get(`${key}_other`)
  }

  /** Trozos del mensaje: textos y valores de las variables, en orden. */
  const split = <V>(key: string, vars: Readonly<Record<string, V | string | number>> | undefined) => {
    const message = resolve(key, vars as MessageVars | undefined)
    if (message === undefined) return [fail(`No existe la clave «${key}»`, key)]
    const out: (string | V)[] = []
    let last = 0
    for (const match of message.matchAll(/\{(\w+)\}/g)) {
      const [placeholder, name] = match as unknown as [string, string]
      out.push(message.slice(last, match.index))
      last = match.index + placeholder.length
      const value = vars?.[name]
      if (value === undefined) out.push(fail(`Falta la variable «${name}» en «${key}»`, placeholder))
      else out.push(typeof value === 'number' ? formatNumber(value) : value)
    }
    out.push(message.slice(last))
    return out.filter((part) => part !== '')
  }

  const translate = (key: string, vars?: MessageVars): string => split(key, vars).join('')
  const parts = <V>(key: string, vars: Readonly<Record<string, V | string | number>>) => split(key, vars)
  const has = (key: string): boolean => flat.has(key) || pluralBases.has(key)
  return Object.assign(translate, { has, parts }) as unknown as Translator<T>
}

/** Aplana el árbol a `clave.con.puntos → texto`, y falla si una hoja no es texto. */
function flatten(tree: MessageTree, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix + key
    if (typeof value === 'string') out.set(path, value)
    else if (value && typeof value === 'object') flatten(value, `${path}.`, out)
    else throw new Error(`[i18n] La clave «${path}» no es un texto`)
  }
  return out
}
