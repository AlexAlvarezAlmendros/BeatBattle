# Referencia del sello: capturas y medidas de otherpeople.es

Referencia de la «prueba del sello» (`RD-VIS-02`, guía §3.1): cómo se ve y cuánto mide de verdad la
web de Other People Records. Las pantallas de BeatBattle se comparan con estas capturas (A/B) en la
tarea 0.7, en la 0.8 y al cerrar cada fase.

- **Fecha:** 2026-10-02, 12:03 UTC.
- **Origen:** `https://www.otherpeople.es` en producción (hoja de estilos `assets/index-UxzmpZ8a.css`).
- **Navegador:** Chrome 154 del sistema (`channel: 'chrome'`), Linux, GPU real (AMD Radeon RENOIR por
  Vulkan), `deviceScaleFactor` 1, `es-ES`, `Europe/Madrid`.
- **Condiciones:** `localStorage.newsletter_popup_seen = 'true'` antes de cargar (sin el popup de la
  newsletter), espera a `domcontentloaded` y a que desaparezcan los esqueletos de carga + 3 s, y
  analítica bloqueada (no ensucia las estadísticas del sello).
- **Ficha usada:** `/beats/6ab7bac7977d308f61ee596c` («Maliantosa»), el primer beat de `/beats` ese día.
- **Regenerar:** `node tools/shot/otp.mjs` (unos 40 s; las opciones están en la cabecera del
  script). Necesita red y el Chrome del sistema; si hay `python3` con Pillow, reduce los PNG a 256
  colores con tramado (de 8,7 MB a 3,5 MB los diez). Los PNG son, por tanto, aproximados en color:
  **los valores exactos están en `otp-metrics.json`**.

## Capturas

Cada una en escritorio (1440×900) y móvil (390×844, táctil). Son la ventana visible, no la página
entera: con página entera el fondo Silk (fijo, de una pantalla de alto) no se pinta bajo el primer
pliegue y la referencia saldría falseada.

| Captura | Qué muestra |
|---|---|
| `home-top-{desktop,mobile}.png` | Home arriba: isla de navegación, logo *OTP.* girado, hero (vídeo, rejilla roja, viñeta), titular «OTHER PEOPLE / RECORDS», filete rojo, subtítulo espaciado, CTA rojo y de contorno, rótulos verticales (solo escritorio) y banda de marquee |
| `home-releases-{desktop,mobile}.png` | Home más abajo: «Últimos lanzamientos», tarjetas de cristal con portada, título y enlace a Spotify; asoma «Últimos Beats» |
| `home-beats-{desktop,mobile}.png` | «Últimos Beats»: tarjetas con «Prod. by», género y BPM, botón rojo «Ver Licencias»; en escritorio asoma el pie |
| `beats-list-{desktop,mobile}.png` | `/beats` en vista de lista (la de por defecto): chips de género, filtros, filas con portada, play redondo, título, productor, chip de género, BPM y tonalidad, barra de progreso, precio, descarga y «Comprar» |
| `beat-detail-{desktop,mobile}.png` | Ficha de un beat: portada, reproductor, «Descargar gratis», rótulo «▌INFORMACIÓN» con teselas de datos (escritorio), licencias con la seleccionada en rojo, términos y «Más de…» |

Revisadas una a una: ninguna tiene el popup ni sale en blanco, y los datos (lanzamientos, beats) ya
habían cargado.

## Medidas (resumen)

Medidas con `getComputedStyle` y `getBoundingClientRect`; la fuente real, con
`CSS.getPlatformFontsForNode` del protocolo de DevTools. Escritorio / móvil cuando difieren. Todo el
detalle (más de 60 piezas por tamaño) está en `otp-metrics.json`.

### Tipografía: Montserrat no carga

- La página declara `font-family: Montserrat, sans-serif`, pero **no hay ningún `@font-face` de
  Montserrat** ni enlace a Google Fonts: los únicos `@font-face` son `UTSouthDrink` y `BerlinSans`, y
  ni siquiera se usan (estado `unloaded`).
- El navegador pinta **todo** con la sans del sistema: aquí `Liberation Sans` (la sustituta métrica de
  Arial en Linux); en Windows y macOS, Arial/Helvetica. Ningún texto usa una fuente web
  (`isCustomFont: false` en todos los sondeos: menú, titular, subtítulo, CTA, títulos, filas, ficha).
- El titular pide peso 900 y sale en **Bold (700)**: la fuente de sustitución no tiene Black. Los
  títulos de tarjeta piden peso 100 y salen en Regular.
- Los `<button>` no heredan la familia: «Iniciar Sesión», «Ver Licencias», «Comprar desde…»,
  «Descargar gratis» y el rótulo «INFORMACIÓN» se calculan como `Arial` a secas.
- Confirma el hallazgo de la guía §3.1 y `RF-OTP-03`. Para la prueba A/B, la referencia visual del sello
  es **Arial/Helvetica**, no Montserrat.

### Isla de navegación y logo

| Pieza | Medida |
|---|---|
| Isla | `position: sticky`, `top` 16 px; 1320×69 px (escritorio, x = 60) / 358×54 px (móvil, x = 16) = `min(1320px, 100% − 2rem)`; radio 20 px; relleno 16 / 12 px |
| Fondo de la isla | **`rgba(0,0,0,.58)` + filtro SVG de desplazamiento + `blur(3px)`** (GlassSurface activo). `Header.css` declara `#2b2b2bce` + `blur(8px)`, pero `.glass-surface` lo pisa con `!important` |
| Sombra de la isla | `0 8px 32px rgba(0,0,0,.55)` |
| Logo *OTP.* | 120×77,6 px, `position: fixed`, `rotate: -10deg`; arriba a la izquierda (top 16, left 24) en escritorio, centrado en móvil |
| Enlaces del menú | 16 px, peso 400, sin interletraje, relleno 8×16 px, blanco; el activo con fondo `rgba(255,255,255,.1)` y radio 8 px. Ocultos en móvil (hamburguesa) |
| «Iniciar Sesión» | 37 px de alto, radio 5 px, borde `rgba(128,128,128,.72)`, fondo `rgba(0,0,0,.41)`, Arial 13,3 px 700 |

### Hero

| Pieza | Medida |
|---|---|
| Titular | 96 px / 44,8 px, peso 900 (pintado en 700), `line-height` .95, interletraje −0,03 em / 0 |
| Línea maciza | blanca, `text-shadow: 0 4px 24px rgba(0,0,0,.6)` |
| Línea en contorno | `-webkit-text-stroke: 2px #ff003c` (1 px en móvil), **relleno negro `#000`** (no transparente), halo `0 0 30px rgba(255,0,60,.4)`; interletraje −0,03 / +0,02 em |
| Filete | 80×3 px, `linear-gradient(90deg, transparente, #ff003c, transparente)` |
| Subtítulo | 18,4 px / 12,8 px, peso 300, **interletraje 0,15 em**, mayúsculas, `rgba(255,255,255,.85)` |
| Rótulos verticales | 11,2 px (0,7 rem), peso 600, interletraje 0,4 em, `rgba(255,255,255,.45)`, `writing-mode: vertical-rl`, filetes de 1 px `rgba(255,0,60,.5)`; ocultos en móvil |
| Rejilla | líneas de 1 px `rgba(255,0,60,.5)` cada 60 px, opacidad 0,08, máscara `radial-gradient(#000 30%, transparent 75%)` |
| Viñeta | `radial-gradient(transparent 35%, rgba(0,0,0,.55) 90%, rgba(0,0,0,.85) 100%)` |
| CTA rojo | píldora (radio 999), 49,4 px / 43,8 px de alto, relleno 15,2×32 / 14,4×24 px, 15,2 / 13,6 px, peso 700, **interletraje 0,1 em** (0,08 en móvil), mayúsculas, fondo `rgba(255,0,60,.62)` de cristal, sombra `0 4px 20px rgba(255,0,60,.45)` |
| CTA de contorno | misma píldora, borde 1 px **`rgba(255,255,255,.3)`**, fondo de cristal `rgba(0,0,0,.58)` |
| Marquee | 45,8 / 38,4 px de alto, fondo `rgba(0,0,0,.4)` + `blur(10px)`, filetes 1 px `rgba(255,0,60,.25)`; palabras 13,6 / 12 px, peso 700, interletraje 0,3 em, `rgba(255,255,255,.75)`; punto rojo de 6 px con halo `0 0 8px rgba(255,0,60,.6)` |

### Tarjetas de la home

| Pieza | Medida |
|---|---|
| Título de sección | 40 px / 32 px, peso 700, sin mayúsculas ni barra roja |
| Tarjeta (lanzamiento o beat) | 349×503 px, **radio 16 px**, fondo de cristal `rgba(0,0,0,.58)`, borde 1 px `rgba(255,255,255,.18)`, sombra `0 4px 24px rgba(0,0,0,.4)` + `inset 0 1px 0 rgba(255,255,255,.12)`, relleno 16, hueco 16; portada con radio 12 12 0 0; inclinación 3D con `perspective(800px)` |
| Título de tarjeta | 32 px, peso 100 (pintado en 400) |
| «Ver Licencias» | 37 px de alto, ancho completo, radio 8 px, `#ff003c` macizo, Arial 15,2 px 700 |

### Lista de beats (`/beats`)

| Pieza | Medida |
|---|---|
| Fila | 82,7 px / 71,6 px de alto, radio 8, fondo y borde transparentes (1 px), relleno 10,4×12 / 8 px, hueco 16 / 9,6 px |
| Portada | 48×48 px, radio 6 px, fondo `#1a1a1a` |
| Play | círculo de 32 px, borde 1 px `#333` |
| Título / productor | 14,4 px 600 blanco / 12,48 px `#666` |
| Chip de género en la fila | 20,4 px de alto, radio 12, fondo `#1a1a1a`, borde `#2a2a2a`, relleno 3,2×9,6, 11,52 px `#888` (oculto en móvil) |
| BPM y tonalidad | 12 px `#444` en la familia de texto (**no** en mono) |
| Tiempos | 11,52 px `#444`, `tabular-nums` |
| Barra de progreso | 4 px, radio 2, `#1e1e1e` |
| «Comprar» | 27,8 px de alto, radio 6, relleno 6,4×13,6, 12,8 px 700, `#ff003c`; en móvil solo el icono |
| Descarga | 34×34 px, radio 6, borde `#2a2a2a` |
| Chip de filtro de género | 28,2 / 25,6 px de alto, radio 20, borde 1 px `#2a2a2a`, relleno 5,6×14,4, 12,8 / 12 px, peso 500, `#999` |
| Chip activo | **fondo `#ff003c` macizo**, borde rojo, sombra `0 2px 10px rgba(255,0,60,.35)`, texto blanco |
| Desplegables | 31,4 px de alto, radio 6, fondo `#1a1a1a`, borde `#2a2a2a` |

### Ficha de beat

| Pieza | Medida |
|---|---|
| Rótulo de sección («INFORMACIÓN») | Arial 11 px, peso 600, interletraje 0,1 em, mayúsculas, `#777`; barra `::before` de **3×12 px**, radio 2, `#ff003c` |
| Tesela de dato | 136×75 px, radio 8, fondo `#111`, borde 1 px `#1e1e1e`, relleno 10×12; icono `#ff003c`; etiqueta 11,2 px, interletraje 0,05 em, mayúsculas, **`#666`**; valor 15 px 600 |
| Licencia | radio 8, fondo `#0e0e0e`, borde 2 px `#1b1b1b`; seleccionada: borde 2 px `#ff003c`, fondo `rgba(255,0,60,.06)`, anillo `0 0 0 1px rgba(255,0,60,.3)` |
| «Comprar desde…» | 36 px de alto y radio 8 (escritorio) / 46 px y radio 10 (móvil), degradado 135° `#ff003c → #cc0030`, sombra `0 4px 16px rgba(255,0,60,.3)` |
| Etiquetas `#tag` | 24 px de alto, radio 20, fondo `#1a1a1a`, borde `#2a2a2a`, 12 px |
| Play del reproductor | 36 px (escritorio) / 44 px (móvil), borde 1 px |

## Diferencias con la guía (para las tareas 0.4, 0.7 y 0.8)

La guía no se ha tocado (la actualiza quien cierre esas tareas); estas son las discrepancias medidas:

1. **Isla:** la guía (§3.1, token `--bb-glass`) toma `#2b2b2bce` + `blur(8px)` de `Header.css`, pero en
   Chrome con GlassSurface activo se ve `rgba(0,0,0,.58)` + `blur(3px)` + filtro SVG. `#2b2b2bce` es lo
   que se ve sin cristal.
2. **Contorno del titular:** relleno negro `#000` (la guía dice `color: transparent`) y halo de 30 px
   (la guía, 24 px). En móvil el trazo es de 1 px.
3. **Tamaño del titular:** 96 px en 1440 y 44,8 px en 390; la escala `hero` de la guía,
   `clamp(3.5rem, 11vw, 8.5rem)`, daría 136 px y 56 px.
4. **Subtítulo:** interletraje 0,15 em (la guía, ~0,2 em).
5. **CTA:** interletraje 0,1 em (la guía, 0,12 em); el contorno usa `rgba(255,255,255,.3)` (la guía,
   `--bb-line-strong` .18).
6. **Tarjetas:** radio 16 px y borde `rgba(255,255,255,.18)` (la guía: radio 12 y `--bb-line` .08). Las
   de la ficha (licencias, teselas) sí usan radio 8.
7. **Chip activo:** rojo macizo con sombra (la guía, §3.3: `--bb-red-wash` y borde rojo).
8. **Rótulo de sección:** barra de 3×12 px (la guía, 3×14).
9. **Tesela de dato:** etiqueta en `#666` (la guía, `--bb-text-3` `#999`).
10. **Grises que no están en la escala de tokens:** `#111` (tesela), `#1b1b1b` (borde de licencia),
    `#333` (borde del play), `#444` (BPM, tiempos), `#777` (rótulo), `#888` (chip de la fila).
11. **Datos técnicos:** el sello no usa mono para BPM ni tiempos (solo `tabular-nums`); JetBrains Mono es
    un añadido de BeatBattle (§3.2), no herencia.
