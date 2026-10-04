import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { interiorScreen } from '../../app/layout/screen'
import { renderInRouter } from '../../app/layout/testing'
import { t } from '../../i18n'
import { SHORTCUTS_STORAGE_KEY, useShortcuts } from '../../ui/shortcuts'
import { AccessibilitySettingsPage, SoundSettingsPage } from './SettingsPages'

afterEach(() => {
  useShortcuts.getState().set(true)
  localStorage.clear()
})

describe('Opciones (§3.8.14)', () => {
  it('RD-VIS-02 e: la cabeza de móvil enseña la placa de escritorio, «OPCIONES · AJUSTES», y no repite la pestaña elegida (§3.8.14)', () => {
    // Con la placa de la ruta de Opciones, como en la app.
    const router = createMemoryRouter(
      [
        {
          path: '*',
          handle: { screen: interiorScreen({ kicker: 'frame.plates.settings', title: 'settings.title' }) },
          element: <SoundSettingsPage />,
        },
      ],
      { initialEntries: ['/ajustes/sonido'] },
    )
    const { container } = render(<RouterProvider router={router} />)
    const head = container.querySelector('[data-screen-part="head"]') as HTMLElement
    expect(head).toHaveTextContent(`${t('frame.plates.settings')}${t('settings.title')}`)
    expect(head).not.toHaveTextContent(t('settings.sound.title'))
    // La cabeza es dibujo, como la placa del HUD; el <h1> es la sección, para los lectores de pantalla.
    expect(head).toHaveAttribute('aria-hidden', 'true')
    const heading = screen.getByRole('heading', { level: 1, name: t('settings.sound.title') })
    expect(heading).toHaveClass('sr-only')
  })

  it('RD-VIS-02 e: la cabeza y el <h1> van antes de las pestañas en el orden de lectura, como en las demás interiores (L3)', () => {
    renderInRouter(<SoundSettingsPage />, '/ajustes/sonido')
    const heading = screen.getByRole('heading', { level: 1, name: t('settings.sound.title') })
    const tabs = screen.getByRole('navigation', { name: t('settings.navLabel') })
    expect(heading.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const head = document.querySelector('[data-screen-part="head"]')!
    expect(head.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Las pestañas, en la pantalla (su zona de la plantilla), antes que la pieza y el panel.
    expect(tabs.closest('[data-screen-part="tabs"]')).not.toBeNull()
  })

  it('RD-VIS-02 e: la cuña lleva la pieza de la sección (sus placas en vista previa, quietas) y el sello pasa al panel', () => {
    const { container } = renderInRouter(<SoundSettingsPage />, '/ajustes/sonido')
    const piece = container.querySelector('[data-screen-part="piece"]')!
    const preview = within(piece as HTMLElement).getByRole('figure', { name: t('settings.preview.caption') })
    // Las placas son dibujo: lo que tendrá la sección lo dice el resumen del panel y el pie lo cuenta.
    const plates = preview.querySelector('ul[aria-hidden="true"]')!
    expect(plates.querySelectorAll('li')).toHaveLength(4)
    expect(plates).toHaveTextContent(t('settings.preview.options.effects'))
    expect(plates).toHaveTextContent(t('settings.preview.options.mute'))
    // Nada que enfocar ni que cambiar todavía.
    expect(preview.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0)
    const panel = container.querySelector('[data-screen-part="panel"]')!
    expect(within(panel as HTMLElement).getByText(t('screen.underConstruction'))).toHaveAttribute(
      'data-stamp',
      'red',
    )
  })
})

describe('Opciones → qué hará cada opción (J3r)', () => {
  it('RD-VIS-02 e / RNF-A11Y-08: el panel cuenta en filas densas con índice qué hará cada opción de la vista previa, en su orden: el nombre en display y una línea (§3.8.14)', () => {
    const { container } = renderInRouter(<SoundSettingsPage />, '/ajustes/sonido')
    const panel = container.querySelector('[data-screen-part="panel"]') as HTMLElement
    const help = within(panel).getByRole('region', { name: t('settings.preview.helpTitle') })
    const rows = within(help).getAllByRole('listitem')
    // Las mismas opciones que las placas de la cuña (que son dibujo), con su explicación en palabras.
    const plates = [...container.querySelectorAll('[data-settings-preview] li')].map(
      (plate) => plate.querySelector('.settings-preview-label')?.textContent,
    )
    const names = rows.map((row) => row.querySelector('b'))
    expect(names.map((name) => name?.textContent)).toEqual(plates)
    for (const name of names) expect(name).toHaveClass('bb-display')
    // Las placas de la vista previa también llevan su nombre en display, como las del menú en reposo.
    for (const label of container.querySelectorAll('[data-settings-preview] .settings-preview-label'))
      expect(label).toHaveClass('bb-display')
    expect(rows[0]).toHaveTextContent(t('settings.preview.help.effects'))
    expect(rows[3]).toHaveTextContent(t('settings.preview.help.mute'))
    // «Volver al menú», al pie del panel, después de las filas.
    const back = within(panel).getByRole('link', { name: t('screen.backToMenu') })
    expect(help.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('Opciones → Accesibilidad (§3.8.14, RNF-A11Y-08)', () => {
  it('RNF-A11Y-08 / WCAG 2.1.4: «Atajos de una tecla [SÍ/NO]» apaga y enciende los atajos y se guarda', async () => {
    const user = userEvent.setup()
    renderInRouter(<AccessibilitySettingsPage />, '/ajustes/accesibilidad')
    const toggle = screen.getByRole('button', {
      name: new RegExp(t('settings.accessibility.shortcuts.label')),
    })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAccessibleDescription(t('settings.accessibility.shortcuts.help'))
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(useShortcuts.getState().enabled).toBe(false)
    expect(localStorage.getItem(SHORTCUTS_STORAGE_KEY)).toBe('off')
    await user.click(toggle)
    expect(useShortcuts.getState().enabled).toBe(true)
  })
})
