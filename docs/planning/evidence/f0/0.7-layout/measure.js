// Medidas de la home de BeatBattle para la prueba del sello (tarea 0.7, RD-VIS-02). Se pasa como
// `--eval` a `tools/shot/shot.mjs` (ver `capture.sh`); devuelve, por pieza, la caja
// (getBoundingClientRect: x, y, ancho, alto) y los estilos calculados que compara el README con
// `../otp/otp-metrics.json`.
(() => {
  const round = (n) => Math.round(n * 100) / 100
  const PROPS = [
    'font-size',
    'font-weight',
    'letter-spacing',
    'line-height',
    'border-radius',
    'background-color',
    'box-shadow',
    'backdrop-filter',
    'padding',
    'position',
    'top',
    'color',
    'font-family',
  ]
  const pick = (selector, extra = []) => {
    const element = document.querySelector(selector)
    if (!element) return null
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const out = { rect: [round(rect.x), round(rect.y), round(rect.width), round(rect.height)] }
    for (const property of [...PROPS, ...extra]) out[property] = style.getPropertyValue(property)
    return out
  }
  return {
    glass: document.querySelector('.site-header')?.getAttribute('data-glass') ?? null,
    island: pick('.site-header', ['width']),
    logo: pick('.site-header__logo', ['rotate']),
    navLink: pick('.site-nav__link:not([aria-current])'),
    navActive: pick('.site-nav__link[aria-current="page"]'),
    signin: pick('.site-header__signin', ['border']),
    toggle: pick('.mobile-nav-toggle'),
    title: pick('.hero-title'),
    titleSolid: pick('.hero-title__line:not(.hero-title__line--outline)', ['text-shadow']),
    titleOutline: pick('.hero-title__line--outline', [
      '-webkit-text-stroke-width',
      '-webkit-text-stroke-color',
      '-webkit-text-fill-color',
      'paint-order',
      'text-shadow',
    ]),
    divider: pick('.hero-divider'),
    subtitle: pick('.hero-subtitle', ['text-transform']),
    // Los botones del hero son el `Button` base (`size="hero"`; el contorno, con `glass`).
    ctaPrimary: pick('.hero-actions > :nth-child(1)'),
    ctaGhost: pick('.hero-actions > :nth-child(2)', ['border']),
    note: pick('.hero-note'),
    side: pick('.side-label__text', ['writing-mode', 'border-top']),
    marquee: pick('.marquee__viewport', ['border-top']),
    marqueeItem: pick('.marquee__item'),
    marqueeToggle: pick('.marquee__toggle'),
    grid: pick('.hero-grid', ['opacity', 'background-size']),
    hero: pick('.hero'),
    fonts: [...document.fonts].filter((font) => font.status === 'loaded').map((font) => `${font.family} ${font.weight}`),
    scrollWidth: document.documentElement.scrollWidth,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
})()
