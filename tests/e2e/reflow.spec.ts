import { expect, type Page, test } from '@playwright/test'
import { open, runSuffix, testIp } from './support'

/**
 * Reflujo de las pantallas de cuenta (WCAG 1.4.10, §3.8.14; jurado de la 2.25): a 320 y 390 px, en táctil,
 * nada desplaza la página en horizontal, ningún texto de botón se sale de su marco y ningún campo ni botón
 * pasa del borde del panel. Antes, «Crear cuenta con Discord», «Cambiar contraseña» y la fila del campo
 * con «Ver» se salían.
 */

async function overflows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = []
    const doc = document.documentElement
    if (doc.scrollWidth > doc.clientWidth + 1)
      problems.push(`página: ${doc.scrollWidth} > ${doc.clientWidth}`)
    const panel = document.querySelector<HTMLElement>('main [data-screen-part="panel"]')
    const edge = panel?.getBoundingClientRect()
    for (const el of document.querySelectorAll<HTMLElement>(
      'main button, main a[data-cursor], main input, main textarea',
    )) {
      const box = el.getBoundingClientRect()
      // Las pestañas (en cursiva, sobresalen un píxel a propósito) no son del formulario.
      if (box.width === 0 || el.closest('nav')) continue
      const name = (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40)
      if (el.matches('button, a') && el.scrollWidth > el.clientWidth + 1)
        problems.push(`texto fuera: ${name}`)
      if (edge && (box.left < edge.left - 1 || box.right > edge.right + 1))
        problems.push(`fuera del panel: ${name} (${Math.round(box.left)}–${Math.round(box.right)})`)
    }
    return problems
  })
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width} × ${viewport.height} táctil`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true })

    test('WCAG 1.4.10: entrar, registro y recuperar caben sin salirse', async ({ page }) => {
      for (const [path, heading] of [
        ['/entrar', 'Entrar'],
        ['/registro', 'Crear cuenta'],
        ['/recuperar', 'Recuperar la contraseña'],
      ] as const) {
        await open(page, path, heading)
        expect(await overflows(page), path).toEqual([])
      }
    })

    test('WCAG 1.4.10: las secciones de Ajustes con sesión caben sin salirse', async ({ page, baseURL }) => {
      await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': testIp(50 + (viewport.width % 7)) })
      const username = `reflujo${viewport.width}${runSuffix()}`
      const email = `${username}@example.com`
      const res = await page.request.post('/api/auth/sign-up/email', {
        headers: { origin: baseURL as string },
        data: { email, password: 'lluvia en gràcia 92', name: username, username, callbackURL: '/' },
      })
      expect(res.ok(), await res.text()).toBe(true)
      const mailbox = await (await page.request.get(`/api/test/mailbox?to=${email}`)).json()
      await page.request.get(
        String(mailbox.data.text).match(/https?:\/\/\S+verify-email\?\S+/)?.[0] as string,
      )
      for (const [path, heading] of [
        ['/ajustes/cuenta', 'Cuenta'],
        ['/ajustes/perfil', 'Perfil'],
        ['/ajustes/emails', 'Emails'],
        ['/ajustes/sesiones', 'Sesiones'],
        ['/ajustes/privacidad', 'Privacidad'],
      ] as const) {
        await open(page, path, heading)
        await page.waitForLoadState('networkidle')
        expect(await overflows(page), path).toEqual([])
      }
    })
  })
}
