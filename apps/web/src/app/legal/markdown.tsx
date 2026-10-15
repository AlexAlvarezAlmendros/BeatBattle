import type { ReactNode } from 'react'

/**
 * Lo justo de Markdown para los textos legales (`docs/legal/*.md`; plan de la beta, B.2): títulos `##` y `###`,
 * párrafos, listas (`-` y `1.`), tablas, notas (`>`), **negrita**, `código` y los huecos `[[…]]` que el sello
 * rellena antes de publicar (se marcan para que se vean). Sin HTML: todo sale como elementos de React. El `#`
 * del documento no se pinta (el título de la pantalla ya lo dice).
 */

export type LegalBlock =
  | { kind: 'title'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'heading'; level: 2 | 3; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }

/** `id` de un título: minúsculas, sin acentos ni signos, con guiones. */
export function slugOf(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())

/** Parte el texto en bloques. */
export function parseLegal(source: string): LegalBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: LegalBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (!line.trim()) {
      i++
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      const level = heading[1]?.length ?? 1
      const text = heading[2] ?? ''
      blocks.push(
        level === 1
          ? { kind: 'title', text }
          : { kind: 'heading', level: level as 2 | 3, text, id: slugOf(text) },
      )
      i++
      continue
    }
    if (line.startsWith('>')) {
      const note: string[] = []
      while (i < lines.length && (lines[i] ?? '').startsWith('>'))
        note.push((lines[i++] ?? '').replace(/^>\s?/, ''))
      blocks.push({ kind: 'note', text: note.join(' ') })
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && (lines[i] ?? '').startsWith('|')) rows.push(cells(lines[i++] ?? ''))
      const [head = [], , ...body] = rows
      blocks.push({ kind: 'table', head, rows: body })
      continue
    }
    const item = line.match(/^(-|\d+\.)\s+(.*)$/)
    if (item) {
      const ordered = item[1] !== '-'
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        const next = current.match(/^(-|\d+\.)\s+(.*)$/)
        if (next) items.push(next[2] ?? '')
        else if (/^\s+\S/.test(current) && items.length) items[items.length - 1] += ` ${current.trim()}`
        else break
        i++
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && (lines[i] ?? '').trim() && !/^(#|>|\||-\s|\d+\.\s)/.test(lines[i] ?? ''))
      paragraph.push((lines[i++] ?? '').trim())
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
  }
  return blocks
}

/** El texto de una línea con su negrita, su código y sus huecos. */
export function inline(text: string, placeholderClass?: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|`(.+?)`|\[\[(.+?)\]\]/g
  let last = 0
  let index = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const key = `i${index++}`
    if (match[1] !== undefined) out.push(<strong key={key}>{inline(match[1], placeholderClass)}</strong>)
    else if (match[2] !== undefined) out.push(<code key={key}>{match[2]}</code>)
    else out.push(<mark key={key} className={placeholderClass}>{`[${match[3]}]`}</mark>)
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Los bloques como elementos (sin el título `#`). */
export function LegalText({
  blocks,
  classes,
}: {
  blocks: LegalBlock[]
  classes: { note?: string; placeholder?: string; table?: string }
}) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `b${index}`
        const text = (value: string) => inline(value, classes.placeholder)
        switch (block.kind) {
          case 'title':
            return null
          case 'note':
            return (
              <p key={key} className={classes.note}>
                {text(block.text)}
              </p>
            )
          case 'heading':
            return block.level === 2 ? (
              <h2 key={key} id={block.id}>
                {text(block.text)}
              </h2>
            ) : (
              <h3 key={key} id={block.id}>
                {text(block.text)}
              </h3>
            )
          case 'paragraph':
            return <p key={key}>{text(block.text)}</p>
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul'
            return (
              <List key={key}>
                {block.items.map((item, n) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: los puntos de un texto fijo
                  <li key={n}>{text(item)}</li>
                ))}
              </List>
            )
          }
          case 'table':
            return (
              <table key={key} className={classes.table}>
                <thead>
                  <tr>
                    {block.head.map((cell) => (
                      <th key={cell} scope="col">
                        {text(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, n) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: las filas de un texto fijo
                    <tr key={n}>
                      {row.map((cell, m) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: las celdas de una fila fija
                        <td key={m}>{text(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        }
        return null
      })}
    </>
  )
}
