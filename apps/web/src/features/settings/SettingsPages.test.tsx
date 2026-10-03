import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInRouter } from '../../app/layout/testing'
import { t } from '../../i18n'
import { SHORTCUTS_STORAGE_KEY, useShortcuts } from '../../ui/shortcuts'
import { AccessibilitySettingsPage, SoundSettingsPage } from './SettingsPages'

afterEach(() => {
  useShortcuts.getState().set(true)
  localStorage.clear()
})

describe('Opciones (§3.8.14)', () => {
  it('RD-VIS-02 e: el título de cada sección lleva el rótulo «Opciones» encima, como las demás interiores en móvil', () => {
    renderInRouter(<SoundSettingsPage />, '/ajustes/sonido')
    const heading = screen.getByRole('heading', { level: 1, name: t('settings.sound.title') })
    const head = heading.parentElement!
    const kicker = within(head).getByText(t('frame.plates.settings'))
    expect(kicker.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
