// Abre el menú móvil y deja el foco de teclado en «Jurado» para la captura `menu-mobile.png`; devuelve
// el estado accesible del panel (ver `capture.sh`).
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const rect = (element) => {
    if (!element) return null
    const box = element.getBoundingClientRect()
    return [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)]
  }
  const toggle = document.querySelector('.mobile-nav-toggle')
  toggle.click()
  await wait(700)
  const panel = document.querySelector('[role="dialog"]')
  const initialFocus = document.activeElement?.getAttribute('aria-label')
  document.querySelectorAll('.mobile-nav__link')[1]?.focus()
  await wait(300)
  return {
    expanded: toggle.getAttribute('aria-expanded'),
    controls: toggle.getAttribute('aria-controls') === panel?.id,
    modal: panel?.getAttribute('aria-modal'),
    panel: rect(panel),
    initialFocus,
    inert: [...document.getElementById('root').children]
      .filter((element) => element.hasAttribute('inert'))
      .map((element) => element.className || element.tagName),
    links: [...document.querySelectorAll('.mobile-nav__link')].map((link) => [link.textContent, rect(link)[3]]),
    social: [...document.querySelectorAll('.mobile-nav__social-link')].map(rect),
    signin: rect(document.querySelector('.mobile-nav__signin')),
    close: rect(document.querySelector('.mobile-nav__close')),
    bodyOverflow: document.body.style.overflow,
  }
})()
