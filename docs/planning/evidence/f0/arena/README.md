# Dirección de arte «Arena»: maquetas de referencia aprobadas

> **Referencia aprobada por el usuario el 2026-10-03.** Es la dirección de arte de la guía **v0.6**
> (§3): BeatBattle como el menú de una recreativa de lucha que del sello solo hereda **la paleta y
> el logo *OTP.* como firma**. Sustituye a la «prueba del sello» (`../otp/` y `../ab/`, que quedan
> como histórico). Lo que se construya en las tareas 0.22–0.28 tiene que acercarse a estas pantallas.

- **Fecha:** 2026-10-03 (maquetas y comprobaciones generadas la noche del 2026-10-02 al 03).
- **Origen:** tarea 0.21 del plan 00 (tres propuestas independientes, jurado y síntesis en una
  dirección final). La especificación que describen es `docs/guia-maestra.md` §3 (v0.6).
- **Cómo se ven:** abre cualquier `.html` de esta carpeta en el navegador (con `file://` basta). Son
  autocontenidos: CSS, JS, fuentes e imágenes van en línea. Parámetros de la URL: `?still` (sin
  movimiento, como «reducir movimiento»), `?serio` (modo serio) y, en `03-jurado.html`,
  `?estado=votado`.
- **Capturas:** Chrome del sistema (`channel: 'chrome'`), `deviceScaleFactor` 1, con `?still`. Los PNG
  están **reducidos a paleta de 256 colores** con Pillow (tramado Floyd-Steinberg, como
  `tools/shot/measure.mjs`), así que sus colores son aproximados: los valores exactos son los tokens
  de `src/final.css` y de la guía §3.2.

## Pantallas

| Fichero | Pantalla (guía) | Capturas |
|---|---|---|
| `00-titulo.html` | Puerta de entrada y pantalla de título, «PULSA PARA EMPEZAR» (§3.8.1) | `00-titulo-1440x900.png` |
| `01-menu.html` | Menú principal (home): logo con el lockup «by [OTP.]», tarjeta del escenario de la semana, «ELIGE MODO» con seis placas, reloj de ronda, HUD y barra de controles (§3.8.3) | `01-menu-1440x900.png`, `01-menu-390x844.png`, `01-menu-375x667.png`, `01-menu-360x640.png` (móvil bajo) |
| `02-seleccion.html` | Selección de entradas, «ELIGE ENTRADA»: ficha de luchador y rejilla con voto ciego (§3.8.13) | `02-seleccion-1440x900.png` |
| `03-jurado.html` | Modo Jurado (VS): TÚ frente a una entrada, escucha mínima, estrellas (§3.8.7, §3.8.4) | `03-jurado-escuchando-1440x900.png` (estrellas dormidas), `03b-jurado-votado-1440x900.png` (`?estado=votado`) |
| `04-resultados.html` | Página de resultados con podio, peanas y «TU RESULTADO» (§3.8.6) | `04-resultados-1440x900.png` |
| `05-perfil.html` | Perfil: carta de luchador colgada de su pase de torneo (§3.8.10, §3.4.4) | `05-perfil-1440x900.png` |
| `06-jurado-movil.html` | Modo Jurado en móvil (§3.8.7, «Móvil») | `06-jurado-movil-390x844.png` |
| `portadas.html` | Portadas generativas: 48 semillas con su test de tinta (§3.4.5, `RD-VIS-04`) | `evidencia/portadas-48.png` |

## `src/`

Las fuentes de las maquetas, antes de empaquetarlas en un HTML autocontenido. **Reutiliza su lógica
al implementar; no la reinventes**:

- `final.css`: los **tokens** con los nombres de la guía §3.2 (prefijo `--bb-`) y las piezas (marco
  de chaflán, placa del menú, cursor de juego, teclas, medidores, reloj de ronda, sello de goma…).
- `final.js`: los **generadores** deterministas (trama *halftone*, diagonal, rayos, logo con
  extrusión, vinilo-sol, portadas generativas con presupuesto de tinta, silueta del jurado) y la
  navegación de menú de juego con teclado (foco itinerante, flechas en bucle, Intro, Esc).
- `*.html`: una página por pantalla que carga `final.css` y `final.js`.
- `img/`: `otp-logo.webp` (el logo del sello, el mismo que `apps/web/public/img/otp-logo.webp`) y
  `otp-slap.png` (la pegatina troquelada con borde de corte rojo).

**No incluye las fuentes** (`src/fonts/`): son los `.woff2` latinos de `@fontsource-variable/anybody`
(cursiva), `@fontsource/chakra-petch` (500, 600, 700 y 600/700 cursiva) y
`@fontsource-variable/oxanium`, todos OFL-1.1 (§3.2 «Tipografía»). Sin ellas, los HTML de `src/` se
ven con la fuente del sistema; los de la raíz de esta carpeta ya las llevan dentro.

## `evidencia/`

- `comprobaciones.txt`: por maqueta y tamaño, con «reducir movimiento» y `--disable-lcd-text`:
  porcentaje de negro (luminancia relativa < 0,06; objetivo ≥ 60 %), píxeles fuera de la paleta
  (objetivo ≤ 0,1 %, `RD-VIS-02` a), violaciones de axe (WCAG 2.2 AA), texto por debajo de 12 px
  (`RD-VIS-05`), foco inicial y una prueba corta de teclado. Resultado: **todas pasan** (negro
  74–88 %, fuera de paleta 0,00–0,03 %, axe sin violaciones, ningún texto < 12 px). Repetido el
  2026-10-03 sobre los HTML de esta carpeta (Chrome del sistema sin opciones de GPU): mismo resultado,
  línea a línea. Las capturas que se rehicieron entonces de cada HTML difieren de los PNG en ≈ 1/255 de
  media (lo que quita la reducción a 256 colores).
- `portadas-48.png`: hoja de 48 portadas generativas con su medida. Media: rojo 10,81 % de píxeles y
  luminancia 0,0237; peor desviación 0,3 % en rojo y 0,7 % en luminancia (test ±5 %: **pasa**).
  **Solo con el canvas rasterizado por CPU.** Al copiar la referencia al repo (2026-10-03) se volvió a
  abrir `portadas.html` en el Chrome del sistema con cuatro configuraciones: sin opciones,
  `--disable-gpu` y `--disable-lcd-text` dan lo mismo que la hoja (pasa), pero con la GPU real
  (`--ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan`, las opciones de
  `tools/shot/shot.mjs`) la media sale en 11,41 % y 0,0257 y la peor desviación en **7,0 % en rojo y
  10,9 % en luminancia: no pasa** (Bruma Nocturno, Brasa Púrpura, Marea Callejero y Cobra Callejero
  se quedan cortas de tinta). La calibración por medida de `final.js` no es portable entre
  rasterizadores: al implementar `packages/covers` (Fase 4) hay que fijar con qué rasterizador se pintan
  las portadas que ve el jurado y medir `RD-VIS-04` con ese (guía §3.4.5).
- `01-menu-sin-movimiento.png`: el menú principal a 1440×900 con «reducir movimiento» (§3.10).

## Lo que estas maquetas no son

- No son código del proyecto: no pasan por `pnpm lint:tokens` ni por i18n, y los textos están en el
  HTML. Al llevarlas a `apps/web`, todo texto visible o `aria-label` va por `i18n/es.json` y todo
  valor, por tokens.
- Los datos (semana 41, «Lluvia en Gràcia», LilBru, KAIRO.WAV…) son de ejemplo.
