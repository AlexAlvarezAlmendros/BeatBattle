# Prueba del sello de la tarea 0.7: layout del sello

Comparación A/B de la home de BeatBattle (estado «calendario vacío», §2.19) con la referencia medida de
otherpeople.es (`../otp/`). Es la evidencia de `RD-VIS-02` que pide el plan 00 para la tarea 0.7.

- **Fecha:** 2026-10-02.
- **Rama:** `f0/l-layout-sello`, después de los arreglos de la revisión.
- **Navegador:** Chrome del sistema con `tools/shot/shot.mjs` (GPU real), `deviceScaleFactor` 1.
  Escritorio a 1440×900 y móvil a 390×844 táctil, como las capturas del sello.
- **Regenerar:** con la web servida (`pnpm dev`), desde la raíz del repo:
  `bash docs/planning/evidence/f0/0.7-layout/capture.sh http://localhost:5173`. Hace falta python3
  con Pillow. Los PNG están reducidos a 256 colores con tramado, como los del sello: los valores
  exactos están en los JSON.

## Ficheros

| Fichero | Qué es |
|---|---|
| `home-desktop.png`, `home-mobile.png` | Home arriba: isla, logo *OTP.*, hero en «calendario vacío» y banda de marquee con su botón de pausa |
| `home-desktop-reduced.png`, `home-mobile-reduced.png` | Lo mismo con «reducir movimiento»: isla sin cristal (`--bb-glass` + `blur(8px)`), orbes quietos y marquee estático |
| `menu-mobile.png` | Menú móvil abierto con el foco de teclado en «Jurado» (anillo completo, por dentro) |
| `cmp-home-desktop.png`, `cmp-home-mobile.png` | A/B de la pantalla entera: sello a la izquierda y BeatBattle a la derecha |
| `cmp-island.png`, `cmp-hero.png`, `cmp-band.png` | A/B recortados: isla, titular y botones, banda de marquee |
| `desktop.json`, `mobile.json` | Medidas (`getBoundingClientRect` y `getComputedStyle`) de cada pieza; `*-reduced.json`, con «reducir movimiento» |
| `menu-mobile.json` | Estado del menú abierto: `aria-expanded`, `aria-modal`, foco inicial, hermanos `inert` y tamaños de los objetivos táctiles |
| `measure.js`, `menu.js` | Los `--eval` que producen esos JSON |
| `compare.py`, `capture.sh` | Recorte A/B y regeneración de todo |

## Medidas: BeatBattle frente al sello

Cajas en px: `x, y, ancho × alto`. Sello: `../otp/otp-metrics.json` (`viewports.*.home`).

### Escritorio (1440×900)

| Pieza | Sello | BeatBattle | ¿Igual? |
|---|---|---|---|
| Isla | 60, 16, 1320 × 69; radio 20; relleno 16; `sticky` a 16 | 60, 16, 1320 × 69; radio 20; relleno 16; `sticky` a 16 | Sí |
| Cristal de la isla | `rgba(0,0,0,.58)` + filtro SVG + `blur(3px)` | `rgba(0,0,0,.58)` + filtro SVG + `saturate(1) blur(3px)` | Sí |
| Sombra de la isla | `0 8px 32px rgba(0,0,0,.55)` | `0 8px 32px rgba(0,0,0,.55)` | Sí |
| Logo *OTP.* | 78,2, 22,2, 131,7 × 97,2; −10° | 78,2, 22,2, 131,7 × 97,3; −10° | Sí |
| Enlace del menú | 16 px, 400, relleno 8 × 16, alto 34 | 16 px, 400, relleno 8 × 16, alto 34,4 | Sí (fuente) |
| Enlace activo | fondo `rgba(255,255,255,.1)`, radio 8 | fondo `--bb-fill-active` (el mismo), radio 8, `aria-current="page"` | Sí |
| Botón de la derecha | «Iniciar Sesión»: 128,7 × 37, radio 5, Arial 13,3 px 700 | «Entrar»: 87,3 × 37, píldora, 14 px 700 | Alto igual; ver diferencia 5 |
| Titular | 96 px, 900, interletraje −2,88 px, interlineado 91,2 | 96 px, 900, −2,88 px, 91,2 | Sí |
| Contorno | trazo 2 px `#ff003c`, relleno `#000`, halo 30 px | trazo calculado de 4 px con `paint-order: stroke fill` (se ven 2 px por fuera), relleno `--bb-black`, halo 30 px | Visible igual; ver diferencia 3 |
| Filete | 80 × 3 | 80 × 3 | Sí |
| Subtítulo | 18,4 px, 300, 2,76 px (0,15 em), alto 22 | 18,4 px, 300, 2,76 px, alto 23 | Sí (fuente) |
| Rótulo vertical | 11,2 px, 600, 4,48 px (0,4 em), ancho 12, en x = 24 | 11,2 px, 600, 4,48 px, ancho 14, en x = 24 | Sí (fuente) |
| CTA rojo | 15,2 px, 700, 1,52 px (0,1 em), relleno 15,2 × 32, alto 49,4, píldora | 15,2 px, 700, 1,52 px, relleno 15,2 × 32, alto 51,4, píldora | Sí (fuente); color, ver diferencia 4 |
| CTA de contorno | borde `rgba(255,255,255,.3)`, cristal `rgba(0,0,0,.58)` | borde `--bb-line-button` (el mismo), cristal `rgba(0,0,0,.58)` | Sí |
| Marquee | y = 784,2, alto 45,8, relleno 14,4; filetes `rgba(255,0,60,.25)` | y = 783,2, alto 46,8, relleno 14,4; los mismos filetes | Sí (fuente) |
| Palabra del marquee | 13,6 px, 700, 4,08 px (0,3 em) | 13,6 px, 700, 4,08 px | Sí |
| Titular en pantalla | y = 392,8 (debajo de la pieza 3D de 220 px) | y = 248,8 | No: ver diferencia 2 |

### Móvil (390×844)

| Pieza | Sello | BeatBattle | ¿Igual? |
|---|---|---|---|
| Isla | 16, 16, 358 × 54; relleno 12 | 16, 16, 358 × 54; relleno 12 | Sí |
| Logo *OTP.* | 130,1, 19,8, 131,7 × 97,2 (centrado) | 130,1, 19,8, 131,7 × 97,3 | Sí |
| Hamburguesa | 30 × 30 en (332, 28) | objetivo de 44 × 44 en (325, 21), con las líneas en el mismo sitio | Ver diferencia 6 |
| Titular | 44,8 px, sin interletraje, interlineado 47,04 | 44,8 px, `normal`, 47,04 | Sí |
| Contorno | trazo 1 px, interletraje 0,896 px (0,02 em) | trazo calculado de 2 px (se ve 1 px), 0,896 px | Sí |
| Subtítulo | 12,8 px, 300, 1,92 px | 12,8 px, 300, 1,92 px | Sí |
| CTA rojo | 320 × 43,8, 13,6 px, 1,088 px (0,08 em), relleno 14,4 × 24 | 320 × 46,8, 13,6 px, 1,088 px, relleno 14,4 × 24 | Sí (fuente) |
| CTA de contorno | 320 × 45,8 | 320 × 46,8 | Sí (fuente) |
| Marquee | alto 38,4, relleno 11,2; palabras 12 px, 3,6 px | alto 39,4, relleno 11,2; 12 px, 3,6 px | Sí (fuente) |
| Botón de pausa del marquee | (no existe) | 44 × 44 en (338, 742,3) | Ver diferencia 7 |

Sin desbordamiento horizontal en los dos tamaños (`scrollWidth` 1440 y 390). Con «reducir
movimiento», la geometría es la misma; cambian la isla (sin cristal: `rgba(43,43,43,.808)` +
`blur(8px)`), los orbes (quietos) y el marquee (lista estática que rota cada 5 s).

Menú móvil (`menu-mobile.json`): panel de 360 px, `aria-modal="true"`, el foco entra en «Cerrar el
menú», los hermanos del panel (orbes, «Saltar al contenido», isla, `<main>`, pie) quedan `inert`, el
scroll de la página se bloquea, y todos los objetivos miden al menos 44 px (enlaces de 54, redes de
44 × 44, «Entrar» de 44, cerrar de 44 × 44).

## Diferencias que quedan, y por qué

1. **Tipografía (la esperada).** BeatBattle carga Montserrat de verdad (`Montserrat 100 900`); el
   sello la declara pero no la carga y se pinta con Arial o Liberation Sans, con el titular en Bold
   700 en lugar de Black (`../otp/README.md`, `RF-OTP-03`). Por eso las letras son más anchas y las
   líneas de texto miden de 1 a 3 px más de alto (CTA 51,4 frente a 49,4; marquee 46,8 frente a
   45,8; subtítulo 23 frente a 22; rótulo 14 frente a 12 de ancho). Tamaños, pesos, interletrajes e
   interlineados fijos y rellenos coinciden.
2. **Posición del titular.** El hero del sello lleva encima del titular una pieza 3D de 220 px
   (`heroLogo` en las medidas). El de BeatBattle no la lleva: en «calendario vacío» no hay nada que
   poner ahí, y con semana el vinilo del sample va a la derecha en escritorio y debajo en móvil
   (§3.8.3). El bloque centrado queda 144 px más arriba en escritorio y 66 px en móvil. Las medidas
   de cada pieza no cambian.
3. **Contorno del titular.** Montserrat variable trae contornos solapados, y `-webkit-text-stroke`
   dibuja sus uniones por dentro de las letras (B, A, E). Con `paint-order: stroke fill` y el trazo
   doblado, el relleno negro tapa la mitad interior. Lo que se ve por fuera son los 2 / 1,5 / 1 px del
   sello. Sin `paint-order`, el trazo vuelve a 2 / 1,5 / 1 px.
4. **Color del CTA rojo.** `--bb-red-cta` (`#e6003a`) macizo en lugar del cristal
   `rgba(255,0,60,.62)` del sello, porque el blanco sobre `#ff003c` no llega a AA (§3.1: donde el
   sello no cumple AA, manda AA). Se queda en 4,7:1.
5. **Botón de la derecha.** «Entrar» en píldora de contorno (§3.3) en lugar del rectángulo de radio
   5 del sello, con el mismo alto de 37 px (que es el que da los 69 px de la isla).
6. **Hamburguesa.** Objetivo táctil de 44 × 44 (RNF-A11Y-09) en lugar de 30 × 30, con margen
   negativo para que ocupe lo mismo: la isla conserva sus 54 px.
7. **Botón de pausa del marquee.** No está en el sello. Lo pide WCAG 2.2.2 («Pausar, detener,
   ocultar», §2.17): la banda se mueve sola y sin fin (o rota cada 5 s sin movimiento), y el hover no
   sirve con teclado ni en táctil. Va a la derecha, sobre el fundido del borde.
8. **Contenido.** Cinco enlaces de BeatBattle en lugar de los siete del sello más el engranaje, y los
   textos del «calendario vacío». El fondo son los orbes rojos en CSS (`listing-orb` del sello) en
   lugar del vídeo y el Silk, que llega con la tarea 1.1.
