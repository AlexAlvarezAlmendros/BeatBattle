// Detector de usos impuros en el código de packages/rules (lo usa purity.test.ts).
//
// Trabaja sobre tokens, no sobre el texto: un analizador léxico mínimo de TypeScript separa los
// comentarios, las cadenas, las plantillas y las expresiones regulares, de modo que un `'https://…'`
// o un `'**/*.ts'` no esconden el código que les sigue, y un `Date.now()` dentro de un texto no
// cuenta. No hace falta un árbol sintáctico completo: TypeScript 7 no expone su parser en JS (solo
// la API `unstable/*`, que arranca el compilador nativo), y para esta guardia bastan los tokens.
//
// Lo que se permite de los globales con reloj o azar es una lista cerrada:
// - `Date`: solo `Date.UTC(…)` y `new Date(ms)` con un único argumento que no sea un texto. Todo
//   lo demás cuenta como impuro, también `Date` suelto (un alias, `Date['now']`, un argumento o un
//   tipo): el detector no sigue alias, y los instantes de las reglas son ms UTC (guía §4.12).
// - `Math`: cualquier `Math.<método>` salvo `Math.random`; `Math` suelto o `Math[…]`, no.
// - `performance` y `crypto`: ningún uso (salvo como nombre de propiedad, `x.performance`).
// Además, los métodos de hora local de `Date` y los imports `node:*`.
//
// Límites conocidos (los cubre Biome o no aparecen en src): no hay JSX, y una `/` tras `)` se lee
// siempre como división (`if (x) /re/.test(s)` confundiría al analizador).

type TokenKind = 'name' | 'punct' | 'string' | 'template' | 'regex' | 'number'

export interface Token {
  readonly kind: TokenKind
  /** Texto del token; en cadenas y plantillas, el contenido sin comillas. */
  readonly text: string
  readonly line: number
}

/** Palabras tras las que una `/` abre una expresión regular (y no es una división). */
const KEYWORDS_BEFORE_EXPRESSION = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'extends',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
])

/** Signos tras los que una `/` es una división. */
const PUNCT_BEFORE_DIVISION = new Set([')', ']', '}', '++', '--'])

/** Signos de más de un carácter que importan al detector, del más largo al más corto. */
const MULTI_CHAR_PUNCT = ['...', '?.', '++', '--']

const NAME = /[A-Za-z_$][\w$]*/y
const NUMBER = /\.?\d[\w.]*/y

function regexAllowedAfter(prev: Token | undefined): boolean {
  if (prev === undefined) return true
  if (prev.kind === 'name') return KEYWORDS_BEFORE_EXPRESSION.has(prev.text)
  if (prev.kind === 'punct') return !PUNCT_BEFORE_DIVISION.has(prev.text)
  return false
}

const countNewlines = (text: string) => text.split('\n').length - 1

/**
 * Trocea código TypeScript en tokens: sin comentarios ni espacios, y con cada cadena, tramo de
 * plantilla o expresión regular como un único token. Lanza `SyntaxError` si un literal no se cierra.
 */
export function tokenize(code: string): Token[] {
  const tokens: Token[] = []
  /** Llaves abiertas; `true` si la abrió el `${` de una plantilla. */
  const braces: boolean[] = []
  let line = 1
  let i = 0
  const push = (kind: TokenKind, text: string, at: number) => tokens.push({ kind, text, line: at })

  /** Lee un tramo de plantilla desde `i` hasta la comilla de cierre o el siguiente `${`. */
  const readTemplateChunk = () => {
    const startLine = line
    let text = ''
    while (i < code.length) {
      const ch = code[i] as string
      if (ch === '\\') {
        text += code.slice(i, i + 2)
        line += countNewlines(code.slice(i, i + 2))
        i += 2
      } else if (ch === '`') {
        i++
        push('template', text, startLine)
        return
      } else if (ch === '$' && code[i + 1] === '{') {
        i += 2
        push('template', text, startLine)
        push('punct', '${', line)
        braces.push(true)
        return
      } else {
        if (ch === '\n') line++
        text += ch
        i++
      }
    }
    throw new SyntaxError(`Plantilla sin cerrar (línea ${startLine})`)
  }

  while (i < code.length) {
    const ch = code[i] as string
    const startLine = line
    if (ch === '\n') {
      line++
      i++
    } else if (/\s/.test(ch)) {
      i++
    } else if (ch === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++
    } else if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      if (end < 0) throw new SyntaxError(`Comentario sin cerrar (línea ${startLine})`)
      line += countNewlines(code.slice(i, end))
      i = end + 2
    } else if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < code.length && code[j] !== ch) {
        if (code[j] === '\n') throw new SyntaxError(`Cadena sin cerrar (línea ${startLine})`)
        j += code[j] === '\\' ? 2 : 1
      }
      if (j >= code.length) throw new SyntaxError(`Cadena sin cerrar (línea ${startLine})`)
      push('string', code.slice(i + 1, j), startLine)
      line += countNewlines(code.slice(i, j))
      i = j + 1
    } else if (ch === '`') {
      i++
      readTemplateChunk()
    } else if (ch === '{') {
      braces.push(false)
      push('punct', '{', startLine)
      i++
    } else if (ch === '}') {
      push('punct', '}', startLine)
      i++
      if (braces.pop() === true) readTemplateChunk()
    } else if (ch === '/' && regexAllowedAfter(tokens.at(-1))) {
      let j = i + 1
      let inClass = false
      while (j < code.length && (inClass || code[j] !== '/')) {
        if (code[j] === '\n') throw new SyntaxError(`Expresión regular sin cerrar (línea ${startLine})`)
        if (code[j] === '[') inClass = true
        else if (code[j] === ']') inClass = false
        j += code[j] === '\\' ? 2 : 1
      }
      if (j >= code.length) throw new SyntaxError(`Expresión regular sin cerrar (línea ${startLine})`)
      j++
      while (j < code.length && /[a-z]/i.test(code[j] as string)) j++
      push('regex', code.slice(i, j), startLine)
      i = j
    } else {
      NAME.lastIndex = i
      NUMBER.lastIndex = i
      const name = NAME.exec(code)
      const number = name ? null : NUMBER.exec(code)
      const punct = MULTI_CHAR_PUNCT.find(
        (p) => code.startsWith(p, i) && !(p === '?.' && /\d/.test(code[i + 2] ?? '')),
      )
      const [kind, text]: [TokenKind, string] = name
        ? ['name', name[0]]
        : number
          ? ['number', number[0]]
          : ['punct', punct ?? ch]
      push(kind, text, startLine)
      i += text.length
    }
  }
  return tokens
}

/** Métodos de `Date` que leen o fijan la hora local de la máquina. */
const LOCAL_TIME_METHODS = new Map<string, string>([
  ...[
    'getFullYear',
    'getYear',
    'getMonth',
    'getDate',
    'getDay',
    'getHours',
    'getMinutes',
    'getSeconds',
    'getMilliseconds',
    'setFullYear',
    'setYear',
    'setMonth',
    'setDate',
    'setHours',
    'setMinutes',
    'setSeconds',
    'setMilliseconds',
  ].map((method): [string, string] => [method, 'getter/setter de hora local: usa los métodos UTC']),
  ['getTimezoneOffset', 'getTimezoneOffset depende de la zona de la máquina'],
  ...['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toDateString', 'toTimeString'].map(
    (method): [string, string] => [
      method,
      `${method} usa la zona de la máquina: usa Intl con zona explícita`,
    ],
  ),
])

const isPunct = (token: Token | undefined, text: string) => token?.kind === 'punct' && token.text === text
const isName = (token: Token | undefined, text: string) => token?.kind === 'name' && token.text === text
const isMemberAccess = (token: Token | undefined) => isPunct(token, '.') || isPunct(token, '?.')

/** ¿Es `tokens[k]` el nombre de una propiedad (`{ crypto: 1 }`, `crypto?: string`) y no un valor? */
function isPropertyKey(tokens: readonly Token[], k: number): boolean {
  const prev = tokens[k - 1]
  const next = tokens[k + 1]
  const keyed = isPunct(next, ':') || (isPunct(next, '?') && isPunct(tokens[k + 2], ':'))
  return keyed && !isPunct(prev, '?') && !isName(prev, 'case')
}

/** Argumentos de la llamada cuyo `(` está en `tokens[open]` (sin contar una coma final). */
function argumentCount(tokens: readonly Token[], open: number): { count: number; tokens: Token[] } {
  const args: Token[] = []
  let depth = 0
  let commas = 0
  for (let k = open + 1; k < tokens.length; k++) {
    const token = tokens[k] as Token
    if (token.kind === 'punct' && ['(', '[', '{', '${'].includes(token.text)) depth++
    if (token.kind === 'punct' && [')', ']', '}'].includes(token.text)) {
      if (depth === 0) break
      depth--
    }
    if (depth === 0 && isPunct(token, ',')) commas++
    args.push(token)
  }
  if (args.length === 0) return { count: 0, tokens: args }
  return { count: commas + 1 - (isPunct(args.at(-1), ',') ? 1 : 0), tokens: args }
}

function dateViolation(tokens: readonly Token[], k: number): string | undefined {
  const next = tokens[k + 1]
  const member = tokens[k + 2]
  if (isName(tokens[k - 1], 'new')) {
    if (!isPunct(next, '(')) return 'new Date sin paréntesis lee el reloj'
    const args = argumentCount(tokens, k + 1)
    if (args.count === 0) return 'new Date() sin argumentos lee el reloj'
    if (args.count > 1) return 'new Date(año, mes, …) usa la hora local: usa Date.UTC'
    const only = args.tokens.filter((t) => !isPunct(t, ','))
    if (only.length === 1 && (only[0]?.kind === 'string' || only[0]?.kind === 'template')) {
      return 'new Date(texto) interpreta la cadena, en hora local si no lleva zona: usa Date.UTC'
    }
    return undefined
  }
  if (isMemberAccess(next) && member?.kind === 'name') {
    if (member.text === 'UTC') return undefined
    if (member.text === 'now') return 'Date.now: el instante entra como argumento'
    if (member.text === 'parse') return 'Date.parse interpreta cadenas en hora local'
    return `Date.${member.text}: de Date solo se permiten Date.UTC y new Date(ms)`
  }
  if (isPunct(next, '(')) return 'Date() como función devuelve la hora actual'
  if (isPunct(next, '[')) return 'Date[…]: acceso calculado que el detector no puede comprobar'
  return 'Date suelto (alias, argumento o tipo): solo Date.UTC(…) y new Date(ms); los instantes son ms UTC'
}

function mathViolation(tokens: readonly Token[], k: number): string | undefined {
  const member = tokens[k + 2]
  if (isMemberAccess(tokens[k + 1]) && member?.kind === 'name') {
    return member.text === 'random' ? 'Math.random: usa el PRNG con semilla (prng.ts)' : undefined
  }
  if (isPunct(tokens[k + 1], '[')) return 'Math[…]: acceso calculado que el detector no puede comprobar'
  return 'Math suelto (alias o desestructuración): usa Math.<método> directamente'
}

/** ¿Es la cadena `tokens[k]` el módulo de un import, un export … from o un require? */
function isModuleSpecifier(tokens: readonly Token[], k: number): boolean {
  const prev = tokens[k - 1]
  if (isName(prev, 'from') || isName(prev, 'import')) return true
  return isPunct(prev, '(') && (isName(tokens[k - 2], 'import') || isName(tokens[k - 2], 'require'))
}

/** Usos prohibidos en un fragmento de código, como `línea: motivo`. */
export function findViolations(code: string): string[] {
  const tokens = tokenize(code)
  const found: string[] = []
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k] as Token
    let reason: string | undefined
    if (token.kind === 'string') {
      if (token.text.startsWith('node:') && isModuleSpecifier(tokens, k)) reason = 'import de una API de Node'
    } else if (token.kind !== 'name') {
      continue
    } else if (isMemberAccess(tokens[k - 1])) {
      if (isPunct(tokens[k + 1], '(')) reason = LOCAL_TIME_METHODS.get(token.text)
    } else if (!isPropertyKey(tokens, k)) {
      if (token.text === 'Date') reason = dateViolation(tokens, k)
      else if (token.text === 'Math') reason = mathViolation(tokens, k)
      else if (token.text === 'performance') reason = 'performance: reloj real'
      else if (token.text === 'crypto') reason = 'crypto: azar real; usa el PRNG con semilla (prng.ts)'
    }
    if (reason !== undefined) found.push(`${token.line}: ${reason}`)
  }
  return found
}
