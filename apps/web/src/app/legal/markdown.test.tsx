import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import bases from '../../../../../docs/legal/bases.md?raw'
import privacidad from '../../../../../docs/legal/privacidad.md?raw'
import { LegalText, parseLegal, slugOf } from './markdown'

describe('textos legales (beta, B.2)', () => {
  it('parte títulos, notas, listas y tablas', () => {
    const blocks = parseLegal(
      `# Título\n\n> Nota\n> que sigue\n\n## Qué datos\n\nUn **párrafo**\nen dos líneas.\n\n- uno\n  sigue\n- dos\n\n| A | B |\n|---|---|\n| 1 | 2 |\n`,
    )
    expect(blocks).toEqual([
      { kind: 'title', text: 'Título' },
      { kind: 'note', text: 'Nota que sigue' },
      { kind: 'heading', level: 2, text: 'Qué datos', id: 'que-datos' },
      { kind: 'paragraph', text: 'Un **párrafo** en dos líneas.' },
      { kind: 'list', ordered: false, items: ['uno sigue', 'dos'] },
      { kind: 'table', head: ['A', 'B'], rows: [['1', '2']] },
    ])
    expect(slugOf('Con quién los compartimos')).toBe('con-quien-los-compartimos')
  })

  it('RNF-PRIV-05: la política de privacidad dice responsable, datos, bases, plazos, encargados y derechos', () => {
    const headings = parseLegal(privacidad)
      .filter((block) => block.kind === 'heading')
      .map((block) => (block.kind === 'heading' ? block.text : ''))
    expect(headings).toEqual([
      'Quién trata tus datos',
      'Qué datos guardamos',
      'Para qué y con qué base',
      'Cuánto tiempo',
      'Con quién los compartimos',
      'Tus derechos',
      'Edad',
      'Cambios',
    ])
  })

  it('pinta sin HTML: negrita, código y los huecos que rellena el sello marcados', () => {
    render(<LegalText blocks={parseLegal('Hola **[[razón social]]** y `bb.x`.')} classes={{}} />)
    expect(screen.getByText('[razón social]').tagName).toBe('MARK')
    expect(screen.getByText('bb.x').tagName).toBe('CODE')
  })

  it('las bases salen numeradas, del 1 al 12', () => {
    const list = parseLegal(bases).find((block) => block.kind === 'list')
    expect(list?.kind === 'list' && list.ordered && list.items.length).toBe(12)
  })
})
