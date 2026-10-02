> **Histórico: la dirección de copiar el sello se abandonó el 2026-10-03 (guía v0.6).** Esta carpeta
> se conserva como registro; la referencia vigente de diseño son las maquetas de `../arena/`.

# Prueba del sello: A/B de BeatBattle frente a otherpeople.es

> Evidencia de `RD-VIS-02` (guía §3.1) y del criterio 3 del plan 00: isla, tipografía, rojo,
> tarjetas, lista, página interior y pie comparados con el sello en medidas, color y captura.
> **Estado (2026-10-02):** revisada por el jurado de la prueba del sello (tres lentes
> independientes, las tres en suspenso), corregida y regenerada. Las piezas de la Fase 0 pasan; el
> requisito queda **abierto hasta la tarea 1.1** (fondo Silk) y la revisión visual del usuario. Ver
> [Veredicto final](#veredicto-final).

Compara BeatBattle, pieza a pieza, con la referencia medida de la web del sello (`../otp/`): las
mismas ventanas, las mismas propiedades (`getComputedStyle` y `getBoundingClientRect`, y la fuente
con la que se pinta de verdad, con `CSS.getPlatformFontsForNode`) y hojas lado a lado con el sello a
la izquierda.

## Condiciones

- **Fecha:** 2026-10-02 (primera versión a las 16:13 UTC; esta, tras las correcciones del jurado, a
  las 17:05 UTC).
- **BeatBattle:** rama `feat/f0-fundaciones` (commit en `metrics.json`, `beatbattle.commit`), Vite en
  desarrollo en `http://127.0.0.1:5520` (la galería solo existe ahí) y sin la API: la home sale en
  «calendario vacío» (§2.19). Galería con el cristal encendido y sin «reducir movimiento».
- **Navegador:** Chrome 154 del sistema (`tools/shot`), GPU real, `deviceScaleFactor` 1, `es-ES`,
  `Europe/Madrid`. Escritorio a 1440×900 y móvil a 390×844 táctil, como las capturas del sello.
- **Sello:** la referencia de `../otp/` (12:03 UTC) y un complemento en vivo en `otp-extra/` (17:00
  UTC, mismo Chrome) con lo que la referencia no tiene: el chip activo (se midió después de la
  captura; el complemento da la misma caja y el mismo color), el pie (no se midió), las teselas en
  móvil (estaban plegadas) y la alineación del título de `/beats` (la referencia no medía
  `text-align`). En escritorio, del complemento solo sale la caja de la rejilla de teselas, para el
  recorte.
- Sin errores de página y sin desbordamiento horizontal (`scrollWidth` 1440 y 390). Fuente cargada:
  `Montserrat 100 900`.
- Los PNG están reducidos a 256 colores con tramado, como los del sello: los valores exactos están en
  `metrics.json`.

## Regenerar

```bash
node tools/shot/ab.mjs              # arranca Vite en :5520 si no responde y lo para al terminar
node tools/shot/ab.mjs --otp-live   # y además vuelve a capturar el complemento del sello (red)
```

Unos 40 s, más lo que tarde el sello con `--otp-live`. Necesita el Chrome del sistema y `python3`
con Pillow. Regenera las capturas, `metrics.json`, las hojas y las tablas de este README (entre las
marcas `ab:tabla`); el resto del texto es a mano. Las opciones están en la cabecera de
`tools/shot/ab.mjs`; las hojas las monta `tools/shot/ab_sheet.py`. Con `--only=desktop|mobile` se
rehace un solo tamaño y se conserva el otro.

## Piezas y ficheros

`*` es `desktop` o `mobile`.

| Pieza | Sello | BeatBattle | Hojas |
|---|---|---|---|
| Home arriba | `../otp/home-top-*.png` | `bb/home-top-*.png` (`/`) | `sheets/home-top-*.png` |
| Isla y logo | `../otp/home-top-*.png` | `bb/home-top-*.png` | `sheets/island-*.png` |
| Página interior | `../otp/beats-list-*.png` (`/beats`) | `bb/interior-*.png` (`/como-funciona`) | `sheets/interior-*.png` |
| Botones CTA y de contorno | `../otp/home-top-*.png` (hero) | `bb/gallery-buttons-*.png` (`/dev/galeria#boton`, fila «Hero», reposo) | `sheets/buttons-cta-*.png`, `sheets/buttons-outline-*.png` |
| Chip en reposo | `../otp/beats-list-*.png` | `bb/gallery-chip-*.png` (`#chip`) | `sheets/chip-*.png` |
| Chip activo | `otp-extra/beats-chip-active-*.png` | `bb/gallery-chip-*.png` (`#chip`) | `sheets/chip-active-*.png` |
| Fila de entrada | `../otp/beats-list-*.png` | `bb/gallery-entry-row-*.png` (`#fila`, reposo) | `sheets/entry-row-*.png` |
| Teselas con rótulo de sección | `../otp/beat-detail-desktop.png`, `otp-extra/beat-detail-info-mobile.png` | `bb/gallery-data-tiles-*.png` (`#tesela`, reposo: desplegada) | `sheets/data-tiles-*.png` |
| Tarjeta de cristal | `../otp/home-releases-*.png` | `bb/gallery-glass-card-*.png` (`#tarjeta`) | `sheets/glass-card-*.png` |
| Pie | `otp-extra/home-footer-*.png` | `bb/footer-*.png` (`/`, al final) | `sheets/footer-*.png` |

- La isla y el pie son los del marco (`SiteHeader`, `SiteFooter`), los mismos componentes que la
  galería enseña como muestra inerte: se miden en la página para que el recorte coincida con el del
  sello.
- Los botones son los de la fila «Hero» de la galería (`size="hero"`), el CTA del hero del sello; en
  la galería van uno encima del otro por el ancho de la celda.
- La tarjeta de la galería es el `Card` de cristal; el texto de dentro (título, «Prod. by», botón) es
  contenido de ejemplo de la galería.
- Cada hoja es «sello | BeatBattle» con el mismo tamaño de recorte, cada lado sobre su pieza más un
  margen, y la misma escala a los dos lados: las pantallas enteras a 0,5 en escritorio y a 1 en móvil,
  los chips a 2 y el resto a 1 (la fila de escritorio baja a 0,85 para no pasar de 2400 px). Lo que
  asoma alrededor es el contexto de cada página (en la galería, la celda vecina).
- Además de lo que mide `otp-metrics.json`, la A/B compara la alineación del texto (`textAlign`) del
  título interior, la entradilla y los títulos del pie, la rejilla del pie (`alignItems`), el alto de
  su primera y su última tarjeta y de un enlace, el interlineado de las etiquetas, el borde del CTA y
  la sombra del botón de la tarjeta: son los puntos ciegos que encontró el jurado.

## Veredictos del jurado

El jurado de la prueba del sello revisó la primera versión de esta evidencia (16:13 UTC) con tres
lentes independientes. Las tres dieron **suspenso**.

| Lente | Veredicto | Piezas en suspenso | Lo esencial |
|---|---|---|---|
| 1 · Ojo («¿parece una sección del sello?») | Suspenso | Página interior (escritorio y móvil), teselas en móvil, pie (escritorio y móvil), borrador del README | Lo primero que delata que no es el sello es el fondo: sin el Silk granate, la página interior y el pie son un vacío negro. El título interior, en estilo de titular y a la izquierda, no es el del sello (32 px, 700, centrado). El pie no «coincide» como decía el resumen: títulos de tarjeta a la izquierda y alturas distintas. |
| 2 · Medida (valores contra `otp-metrics.json`) | Suspenso | Página interior (escritorio y móvil), pie (escritorio y móvil), teselas en móvil, README y scripts | El título y el contenedor interior difieren (48 px bajo la isla frente a 32; margen de 60 / 16 px frente a 32). Cuatro motivos mal atribuidos (+2 px del CTA, −1,61 px del chip, +16 px del título, +2,98 px de la tesela), un umbral de `delta()` que daba 0,01 em por igual y puntos ciegos (`text-align`, `rect.x`, interlineado, alturas del pie). El CTA del hero es más claro que el del sello, no «un punto más oscuro». |
| 3 · Sistema (tokens, AA, coherencia) | Suspenso | Página interior (escritorio y móvil), fila de entrada en móvil, teselas en móvil | El título interior y el peso 800 de todos los `h1`–`h6`. En la fila móvil, la portada encogida a 40 px y el play crecido a 44 invierten la proporción del sello; el objetivo de 44 px se resolvía de tres maneras distintas. Grises y objetivos táctiles de AA, bien resueltos. |

Las tres coinciden en lo que más se ve: el fondo (Silk), el título de la página interior, el pie y
las teselas en móvil. Las capturas, las hojas y los datos crudos se dieron por buenos.

## Discrepancias corregidas

Las discrepancias de gravedad media o alta sin respaldo en la guía, agrupadas (varias eran la misma
vista desde lentes distintas). Cada una con su commit en `feat/f0-fundaciones`.

1. **Título de la página interior** (`fix(0.7)`, las tres lentes). Era el estilo de titular (900,
   mayúsculas, −0,02 em, 48 / 36,4 px) alineado a la izquierda; ahora es el del sello: Montserrat 700,
   32 px fijos en los dos tamaños (token nuevo `--bb-font-size-page-title`), sin mayúsculas ni
   interletraje y centrado. El contenido lleva el relleno del `.container` del sello (32 px y sin
   ancho máximo; el ancho de la isla se queda para la isla): el título queda en x 32 / y 117 en
   escritorio y x 32 / y 102 en móvil, **igual al píxel** que el de `/beats`. Los `h1`–`h6` sin clase
   pesan 700, como los del sello. E2E `RD-VIS-02` en `tests/e2e/seal.spec.ts`.
2. **Pie** (`fix(0.7)`, las tres lentes). Títulos de tarjeta y entradilla centrados (en el sello
   heredan el `text-align: center` de su `.container`); tarjetas de una fila a la misma altura
   (`align-items: normal` en la rejilla, como la del sello: 190 y 190 px, antes 210 y 123); borde de
   tarjeta al 8 % (`--bb-line`, el `.glass` de `Footer.css`; antes al 18 %); enlaces con interlineado
   de etiqueta (`--bb-leading-snug`): uno cada 28,6 px en escritorio frente a 28 en el sello (antes
   33,6). En táctil los enlaces siguen midiendo 44 px (`RNF-A11Y-09`). E2E `RD-VIS-02`.
3. **Teselas de dato en móvil** (`fix(0.8)`, las tres lentes). Por debajo de 768 px son una lista de
   clave y valor como la de la ficha del sello (`BeatDetalle.css`): una columna, sin fondo, borde ni
   icono, filete `--bb-ink-800` (`#1a1a1a`), relleno 10×0, etiqueta de 13 px (token nuevo
   `--bb-font-size-tile-key`) y valor de 14 px; 37,8 px de alto por fila frente a 37. El rótulo las
   pliega con un chevron (`DataTileSection`: botón con `aria-expanded` dentro del encabezado, plegado
   al principio como en el sello, objetivo táctil de 44 px y sin giro con «reducir movimiento»). La
   etiqueta sigue en `--bb-text-3`: el `#888` del sello da 4,3:1 sobre el granate del Silk. La
   etiqueta lleva además el interlineado de etiqueta: la tesela de escritorio mide 74,1 px frente a 75
   (antes 78).
4. **Fila de entrada en móvil** (`fix(0.8)`, lente 3). La portada se queda en 48 px (antes bajaba a
   40) y el play conserva su círculo de 36 px: con puntero grueso, el botón icono amplía solo el
   objetivo a 44 × 44 con un pseudoelemento invisible, como el botón de pausa del marquee (el play
   responde a 21 px de su centro y no a 23). Vuelve la proporción del sello (portada > play).
5. **Medición y README** (`fix(0.14)` y este `docs(0.14)`, lentes 1 y 2). `measure.mjs` mide
   `textAlign` y `alignItems`; `ab.mjs` compara las filas que faltaban (arriba), da las propiedades
   en em con su propio umbral (el chip, 0,01 em frente a 0, ya no sale como igual) y corrige los
   motivos: el +2 px del CTA es su borde de 1 px, no la fuente; el −1,61 px del chip son los tokens;
   el +16 px del título era el relleno del contenido (ya corregido); la tesela crecía por el
   interlineado (ya corregido). El resumen ya no da el pie por igual sin mirarlo.

## Descartadas

- **Fondo Silk WebGL** (alta, lentes 1 y 3; la lente 2 la dio por justificada). Es real y es lo que
  más se ve, pero portar el Silk es la tarea **1.1** del plan 01 (canvas R3F único del Escenario,
  §3.5, `RNF-PERF-04`), con la sonda de calidad (1.2) y la reactividad al audio (1.6): un fondo
  suelto ahora duplicaría ese trabajo y chocaría con el canvas único. Mientras, los orbes CSS son la
  alternativa del propio sello (`.listing-orb`). Consecuencia, que el jurado pedía: **`RD-VIS-02` no
  se cierra hasta la 1.1**, y al terminarla se repite esta A/B.
- Las de gravedad baja no entran en esta pasada (lista abajo), salvo las que caían dentro de las
  piezas corregidas (borde y altura de las tarjetas del pie, interlineado de los enlaces del pie y de
  la etiqueta de la tesela, filete `#1a1a1a`).

## Diferencias esperadas y justificadas

Numeradas como en la columna Δ.

1. **Tipografía.** BeatBattle carga Montserrat de verdad (fuente web variable: DevTools la llama
   «Montserrat Thin», que es su instancia por defecto, y el peso lo da el eje). El sello la declara
   pero no la carga y se pinta con Liberation Sans (Arial o Helvetica en Windows y macOS): §3.1,
   `RF-OTP-03`. Por eso las letras son más anchas y las cajas con texto miden de 1 a 3 px más de alto
   (contorno del hero 51,4 frente a 49,4; marquee 46,8 frente a 45,8). Los títulos de tarjeta del
   sello piden peso 100 y se pintan en 400 (BeatBattle pide 400). El contorno del titular lleva el
   trazo doble con `paint-order: stroke fill` para que por fuera se vean los mismos 2 / 1 px del sello
   (Montserrat variable trae contornos solapados: tarea 0.7).
2. **Accesibilidad AA (guía v0.4 §3.1 y §3.2).** `--bb-red-cta` (`#e6003a`, 4,7:1) macizo en el CTA,
   el chip activo y el botón de la tarjeta, donde el sello pone `#ff003c` macizo (3,9:1). En el CTA
   del hero el sello pone su cristal rojo al 62 %, que sobre su vídeo oscuro se pinta `#9f0025` y sí
   cumple (8,4:1): el de BeatBattle se ve más claro y más plano (ver propuestas para la guía). Los
   grises de texto que no llegan a 4,5:1 suben a `--bb-text-3` (`#999`): la etiqueta de la tesela
   (`#666`), el BPM de la fila (`#444`), «Prod. by» (`#666`), el rótulo de sección (`#777` sobre
   tarjeta) y los rótulos verticales (blanco al 45 %, 4,4:1). El rojo de texto pequeño sobre tarjeta,
   en `--bb-red-text` (títulos del pie). Objetivos táctiles de 44 px (`RNF-A11Y-09`): hamburguesa,
   botón de la tarjeta en móvil, redes del pie y, en móvil, los enlaces y legales del pie (un enlace
   cada 48 px frente a 28; la franja inferior, 192 px frente a 90).
3. **Contenido del hero del sello.** El vídeo de fondo, la pieza 3D del logo encima del titular (220 /
   130 px) y el enlace a Spotify del CTA. BeatBattle no los tiene (con semana, el vinilo del sample va
   a la derecha o debajo, §3.8.3): el bloque centrado queda 144 px más arriba en escritorio y 66 en
   móvil; las medidas de cada pieza no cambian.
4. **Silk WebGL pendiente de la tarea 1.1.** El fondo del sello es el Silk granate; BeatBattle pinta,
   mientras tanto, los orbes rojos en CSS (los `listing-orb` del sello, su propia alternativa). Es lo
   que más cambia a ojo en las hojas; la guía no justifica su ausencia, solo la aplaza: por eso
   `RD-VIS-02` sigue abierto hasta la 1.1.
5. **Escala de tokens (§3.2, `RD-VIS-01`).** *No venía en la lista de partida: la propongo como
   esperada, a confirmar.* Los valores sueltos del sello pasan al token más cercano: tamaños en rem
   exactos (12, 14 y 16 px frente a 12,8, 14,4, 12,48, 11,52, 11 y 15 px; el chip, 12 px con relleno
   de 0,45 × 1,15 em y sin interletraje, mide 26,6 px frente a 28,2), radios `sm` (8) y `pill` (un
   radio de 20 px en un chip de 28 px ya es una píldora: se ven igual), espaciado de 4 en 4 px, grises
   opacos en lugar de blancos con alfa (subtítulo y marquee en `--bb-text-2`, `#ccc`, frente al blanco
   al 85 y al 75 %), líneas y sombras de la escala (`#2a2a2a` en lugar de `#333`; .08 en lugar de .07
   y .1; halo al 40 % en lugar del 35 %) e interlineado de etiqueta `--bb-leading-snug` (1,15) donde el
   sello deja el `normal` de su fuente. Diferencias de un píxel o de un tono.
6. **Decisiones propias escritas en la guía.** Datos técnicos en JetBrains Mono (§3.2). En la fila, la
   mini onda sustituye a la barra de progreso y a los tiempos, y no hay precio, descarga ni «Comprar»
   (§3.3; §1.5, sin venta de beats): por eso la fila mide 94,5 px frente a 82,7. Botón icono de 36 a
   44 px (§3.3) en lugar del play de 32. CTA siempre en píldora, en mayúsculas y con halo (§3.3),
   también el de la tarjeta y «Entrar» (contorno de `--bb-line-button`, sin el relleno gris de
   «Iniciar Sesión»). Botón de pausa del marquee (WCAG 2.2.2, §2.17): el sello no lo tiene.
7. **Contenido distinto.** Cinco enlaces en la isla frente a siete y el engranaje; la página interior
   es la provisional de la 0.10 («Cómo funciona», sin filtros ni lista; su título cabe en una línea y
   el de `/beats`, en móvil, ocupa dos); el pie tiene dos tarjetas de cuatro enlaces o tres redes en
   lugar de cuatro tarjetas más la newsletter, así que sus tarjetas miden menos (190 frente a 328 px
   en escritorio), aunque las dos a la misma altura, como las del sello.
8. **Galería.** Las piezas van en celdas de la galería con contenido de ejemplo: la tarjeta mide
   272 px de ancho en escritorio y 268 en móvil (349 en la home del sello) y su texto es de muestra
   (título fluido de 24 px en móvil, «Prod. by» a 14 px); las teselas, 156 px en escritorio (136 en la
   barra lateral de la ficha) y la lista, 292 px en móvil (358 en la ficha).

## Diferencias sin justificar (9): pendientes

No están en la guía y no la he tocado. Son de gravedad baja y quedan para decidir:

1. **Borde del CTA.** `.button` lleva un borde de 1 px (del color del fondo en el CTA) para medir lo
   mismo que el contorno; el CTA del sello no tiene borde. Es el +2 px de alto del CTA (+3 en móvil,
   con 1 px de la fuente): la caja de contenido mide igual a los dos lados (18,98 px).
2. **Desenfoque de la tarjeta de cristal.** `blur(3px)` en el `Card` de BeatBattle; el sello, con
   GlassSurface, `blur(0px)` en todas sus tarjetas (los 3 px son solo de la isla), y las tarjetas del
   pie de BeatBattle ya van a 0. La guía (§3.3) dice «con desenfoque» sin valor, y el token
   `--bb-glass-blur-card` describe en realidad la isla.

## Observaciones de gravedad baja sin tocar

Las anotó el jurado y no entran en esta pasada: iconos de trazo fino frente a los FontAwesome macizos
del sello (teselas, pie); valor de la tesela en 16 / 700 frente a 15 / 600; tamaños de la fila (14 /
12 frente a 14,4 / 12,48) y radio de su portada (8 frente a 6); hueco de la fila móvil (12 frente a
9,6); «Entrar» en píldora frente al rectángulo de radio 5 de «Iniciar Sesión»; BPM de la tarjeta de
muestra en Montserrat y no en mono; interlineado de cuerpo en «Prod. by» y BPM de la fila; contorno de
«BATTLE» con las letras tocándose; fundido del marquee antes del botón de pausa; y comentarios de
radios en `tokens.css` (`md` y `lg`) que no dicen lo mismo que §3.2.

## Propuestas para la guía

El jurado las marcó como justificadas por la guía tal como está, pero propone cambiarla. No se ha
tocado `docs/guia-maestra.md`: quedan para decidir.

- **CTA del hero sobre cristal.** La premisa de AA de `--bb-red-cta` (3,9:1) vale para `#ff003c`
  macizo, no para el cristal del sello (8,4:1 en el hero; unos 6,7:1 sobre el Silk). Token
  `--bb-red-cta-glass: rgba(255,0,60,.62)` con GlassSurface en el CTA del hero, y `--bb-red-cta`
  macizo para chips, botones de tarjeta y equipos sin cristal (§3.1, §3.2, §3.3).
- **Títulos del pie en `--bb-red`.** Sobre la tarjeta de cristal del pie, `#ff003c` da 5,0–5,3:1:
  acotar `--bb-red-text` y `RNF-A11Y-02` a superficies opacas (`--bb-ink-800` o más claras).
- **Marquee:** fundido del carril antes del botón de pausa.
- **«BATTLE» en escritorio:** interletraje −0,015 em o peso 800 en la línea de contorno hasta que
  `RF-OTP-03` iguale la fuente en el sello.

Y las que salen de las correcciones de arriba, que la guía todavía no recoge: el título de página
interior (§3.3, §3.2: `--bb-font-size-page-title`; el contenido con el relleno del `.container` del
sello y la isla como única pieza con `--bb-layout-width`), la tesela en lista y plegable en móvil
(§3.3: `DataTileSection`, `--bb-font-size-tile-key`), el borde `--bb-line` en las tarjetas de cristal
del pie y la maqueta del pie (§3.2, §3.3), el objetivo táctil del botón icono por pseudoelemento
(§3.3) y el peso 700 de los encabezados sin clase (§3.2).

## Veredicto final

Tras las correcciones, en las tablas: 202 propiedades en escritorio (122 iguales) y 178 en móvil (110
iguales), frente a 189 (111) y 167 (92) de la primera versión con el umbral de em corregido. Toda
diferencia lleva motivo; las dos sin respaldo en la guía son de gravedad baja (arriba).

A ojo, en las hojas nuevas (revisadas como imagen): la página interior se lee como `/beats` del sello
(título centrado de 32 px en 700, a la misma altura y con el mismo margen); el pie, con sus títulos
centrados y las tarjetas a la misma altura; las teselas en móvil, como la lista plegable de la ficha;
y la fila móvil, con la portada de 48 px por delante de un play más pequeño. Isla, logo, titular,
botones, chips, tarjeta y fila de escritorio no cambian. Lo que sigue delatando que no es el sello es
el fondo (orbes sobre negro frente al Silk granate con grano), la letra (Montserrat de verdad) y el
CTA del hero, más claro que el carmesí de cristal del sello.

**Veredicto: las piezas de la Fase 0 pasan la prueba del sello; `RD-VIS-02` queda abierto hasta la
tarea 1.1 (Silk) y la revisión visual del usuario.** Este veredicto es la revisión propia de las
hojas corregidas, no una segunda pasada del jurado.

## Hallazgo de paso

`ScrollRestoration` de React Router (en `RootLayout`) recupera el desplazamiento de otra página al
cargar una URL nueva en la misma pestaña (escrita en la barra o desde un enlace externo): la carga
inicial siempre tiene la clave `default`, así que hereda la posición guardada para la carga anterior.
Al capturar, `/como-funciona` abrió desplazada hasta el pie después del final de `/`. El script abre
una pestaña por ruta para no arrastrarlo; el arreglo (por ejemplo, `getKey` por `pathname` en la carga
inicial) queda fuera de esta tarea.

## Tablas

Generadas por `tools/shot/ab.mjs`: no se editan a mano. Δ es BeatBattle − sello en px (en em las
propiedades `*Em`); `=`, que coincide (menos de 0,05 px, o de 0,005 em, es redondeo); `≠`, que difiere
sin magnitud (colores, sombras, radios de píldora, alineaciones); entre paréntesis, el motivo de las
listas de arriba. `rect.*` es la caja en pantalla; `size.*`, la caja CSS sin transformar; `font`, la
fuente con la que se pinta de verdad; `—`, que ese lado no tiene la pieza (o el sello no sondeó su
fuente).

<!-- ab:tabla:inicio -->

### Escritorio (1440×900)

| Pieza | Propiedad | Sello | BeatBattle | Δ |
|---|---|---|---|---|
| Home arriba | heroTitle · fontSize | `96` | `96` | = |
|  | heroTitle · fontWeight | `900` | `900` | = |
|  | heroTitle · letterSpacing | `-2.88px` | `-2.88px` | = |
|  | heroTitle · lineHeight | `91.2px` | `91.2px` | = |
|  | heroTitle · rect.y | `392.83` | `248.83` | −144 px (3) |
|  | heroTitle · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
|  | heroTitleOutline · webkitTextStroke | `2px rgb(255, 0, 60)` | `4px rgb(255, 0, 60)` | ≠ (1) |
|  | heroTitleOutline · webkitTextFillColor | `rgb(0, 0, 0)` | `rgb(0, 0, 0)` | = |
|  | heroTitleOutline · textShadow | `rgba(255, 0, 60, 0.4) 0px 0px 30px` | `rgba(255, 0, 60, 0.4) 0px 0px 30px` | = |
|  | heroDivider · size.width | `80` | `80` | = |
|  | heroDivider · size.height | `3` | `3` | = |
|  | heroSubtitle · fontSize | `18.4` | `18.4` | = |
|  | heroSubtitle · fontWeight | `300` | `300` | = |
|  | heroSubtitle · letterSpacingEm | `0.15` | `0.15` | = |
|  | heroSubtitle · color | `rgba(255, 255, 255, 0.85)` | `rgb(204, 204, 204)` | ≠ (5) |
|  | heroSide · fontSize | `11.2` | `11.2` | = |
|  | heroSide · letterSpacingEm | `0.4` | `0.4` | = |
|  | heroSide · color | `rgba(255, 255, 255, 0.45)` | `rgb(153, 153, 153)` | ≠ (2) |
|  | heroLogo · size.width | `220` | — | ≠ (3) |
|  | marquee · rect.height | `45.78` | `46.78` | +1 px (1) |
|  | marquee · backgroundColor | `rgba(0, 0, 0, 0.4)` | `rgba(0, 0, 0, 0.4)` | = |
|  | marqueeItem · fontSize | `13.6` | `13.6` | = |
|  | marqueeItem · letterSpacingEm | `0.3` | `0.3` | = |
|  | marqueeItem · color | `rgba(255, 255, 255, 0.75)` | `rgb(204, 204, 204)` | ≠ (5) |
|  | silk · selector | `.silk-background` | `.ambient-orbs` | ≠ (4) |
| Isla de navegación y logo | navIsland · rect.x | `60` | `60` | = |
|  | navIsland · rect.y | `16` | `16` | = |
|  | navIsland · rect.width | `1320` | `1320` | = |
|  | navIsland · rect.height | `69` | `69` | = |
|  | navIsland · borderRadius | `20px` | `20px` | = |
|  | navIsland · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | navIsland · backdropFilter | `url(#filtro) saturate(1) blur(3px)` | `url(#filtro) saturate(1) blur(3px)` | = |
|  | navIsland · boxShadow | `rgba(0, 0, 0, 0.55) 0px 8px 32px 0px` | `rgba(0, 0, 0, 0.55) 0px 8px 32px 0px` | = |
|  | navIsland · padding | `16px` | `16px` | = |
|  | navIsland · position | `sticky` | `sticky` | = |
|  | logo · rect.x | `78.18` | `78.17` | = |
|  | logo · rect.y | `22.17` | `22.17` | = |
|  | logo · rotateDeg | `-10` | `-10` | = |
|  | navLinks · rect.width | `643.78` | `640.39` | −3,39 px (7) |
|  | navLink · fontSize | `16` | `16` | = |
|  | navLink · fontWeight | `400` | `400` | = |
|  | navLink · padding | `8px 16px` | `8px 16px` | = |
|  | navLink · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
|  | navLinkActive · backgroundColor | `rgba(255, 255, 255, 0.1)` | `rgba(255, 255, 255, 0.1)` | = |
|  | navLinkActive · borderRadius | `8px` | `8px` | = |
|  | loginButton · rect.height | `37` | `37` | = |
|  | loginButton · borderRadius | `5px` | `999px` | ≠ (6) |
|  | loginButton · border | `1px solid rgba(128, 128, 128, 0.718)` | `1px solid rgba(255, 255, 255, 0.3)` | ≠ (6) |
|  | loginButton · backgroundColor | `rgba(0, 0, 0, 0.41)` | `rgba(0, 0, 0, 0)` | ≠ (6) |
|  | loginButton · fontSize | `13.33` | `14` | +0,67 px (5) |
| Página interior | pageTitle · fontSize | `32` | `32` | = |
|  | pageTitle · fontWeight | `700` | `700` | = |
|  | pageTitle · textTransform | `none` | `none` | = |
|  | pageTitle · letterSpacing | `normal` | `normal` | = |
|  | pageTitle · textAlign | `center` | `center` | = |
|  | pageTitle · rect.x | `32` | `32` | = |
|  | pageTitle · rect.y | `117` | `117` | = |
|  | pageTitle · rect.height | `37` | `36.8` | −0,2 px (7) |
|  | pageTitle · font | — | `Montserrat (variable), web` | ≠ (1) |
| Botones CTA y de contorno | ctaPrimary · rect.height | `49.38` | `51.38` | +2 px (9) |
|  | ctaPrimary · border | `0px none rgb(255, 255, 255)` | `1px solid rgb(230, 0, 58)` | ≠ (9) |
|  | ctaPrimary · borderRadius | `999px` | `999px` | = |
|  | ctaPrimary · backgroundColor | `rgba(255, 0, 60, 0.62)` | `rgb(230, 0, 58)` | ≠ (2) |
|  | ctaPrimary · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `none` | ≠ (2) |
|  | ctaPrimary · boxShadow | `rgba(255, 0, 60, 0.45) 0px 4px 20px 0px` | `rgba(255, 0, 60, 0.45) 0px 4px 20px 0px` | = |
|  | ctaPrimary · padding | `15.2px 32px` | `15.2px 32px` | = |
|  | ctaPrimary · fontSize | `15.2` | `15.2` | = |
|  | ctaPrimary · fontWeight | `700` | `700` | = |
|  | ctaPrimary · letterSpacingEm | `0.1` | `0.1` | = |
|  | ctaPrimary · textTransform | `uppercase` | `uppercase` | = |
|  | ctaPrimary · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
|  | ctaGhost · rect.height | `49.38` | `51.38` | +2 px (1) |
|  | ctaGhost · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | ctaGhost · border | `1px solid rgba(255, 255, 255, 0.3)` | `1px solid rgba(255, 255, 255, 0.3)` | = |
|  | ctaGhost · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `url(#filtro) saturate(1) blur(0px)` | = |
|  | ctaGhost · padding | `15.2px 32px` | `15.2px 32px` | = |
| Chip en reposo | genreChip · rect.height | `28.19` | `26.58` | −1,61 px (5) |
|  | genreChip · borderRadius | `20px` | `999px` | ≠ (5) |
|  | genreChip · backgroundColor | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` | = |
|  | genreChip · border | `1px solid rgb(42, 42, 42)` | `1px solid rgb(42, 42, 42)` | = |
|  | genreChip · padding | `5.6px 14.4px` | `5.4px 13.8px` | ≠ (5) |
|  | genreChip · fontSize | `12.8` | `12` | −0,8 px (5) |
|  | genreChip · fontWeight | `500` | `500` | = |
|  | genreChip · letterSpacingEm | `0.01` | `0` | −0,01 em (5) |
|  | genreChip · color | `rgb(153, 153, 153)` | `rgb(153, 153, 153)` | = |
|  | genreChip · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
| Chip activo | genreChipActive / genreChipActiveFill · backgroundColor | `rgb(255, 0, 60)` | `rgb(230, 0, 58)` | ≠ (2) |
|  | genreChipActive · border | `1px solid rgb(255, 0, 60)` | `1px solid rgb(230, 0, 58)` | ≠ (2) |
|  | genreChipActive · boxShadow | `rgba(255, 0, 60, 0.35) 0px 2px 10px 0px` | `rgba(255, 0, 60, 0.4) 0px 2px 10px 0px` | ≠ (5) |
|  | genreChipActive · color | `rgb(255, 255, 255)` | `rgb(255, 255, 255)` | = |
| Fila de entrada | row · rect.height | `82.73` | `94.52` | +11,79 px (6) |
|  | row · borderRadius | `8px` | `8px` | = |
|  | row · padding | `10.4px 12px` | `10.4px 12px` | = |
|  | row · gap | `16px` | `16px` | = |
|  | row · backgroundColor | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` | = |
|  | rowThumb · size.width | `48` | `48` | = |
|  | rowThumb · borderRadius | `6px` | `8px` | +2 px (5) |
|  | rowThumb · backgroundColor | `rgb(26, 26, 26)` | `rgb(26, 26, 26)` | = |
|  | rowPlay · size.width | `32` | `36` | +4 px (6) |
|  | rowPlay · border | `1px solid rgb(51, 51, 51)` | `1px solid rgb(42, 42, 42)` | ≠ (5) |
|  | rowTitle · fontSize | `14.4` | `14` | −0,4 px (5) |
|  | rowTitle · fontWeight | `600` | `600` | = |
|  | rowTitle · color | `rgb(255, 255, 255)` | `rgb(255, 255, 255)` | = |
|  | rowTitle · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
|  | rowProducer · fontSize | `12.48` | `12` | −0,48 px (5) |
|  | rowProducer · color | `rgb(102, 102, 102)` | `rgb(153, 153, 153)` | ≠ (2) |
|  | rowGenreTag · rect.height | `20.38` | `21.25` | +0,87 px (1) |
|  | rowGenreTag · borderRadius | `12px` | `12px` | = |
|  | rowGenreTag · backgroundColor | `rgb(26, 26, 26)` | `rgb(26, 26, 26)` | = |
|  | rowGenreTag · border | `1px solid rgb(42, 42, 42)` | `1px solid rgb(42, 42, 42)` | = |
|  | rowGenreTag · fontSize | `11.52` | `11.2` | −0,32 px (5) |
|  | rowGenreTag · color | `rgb(136, 136, 136)` | `rgb(153, 153, 153)` | ≠ (5) |
|  | rowMeta · fontSize | `12` | `12` | = |
|  | rowMeta · color | `rgb(68, 68, 68)` | `rgb(153, 153, 153)` | ≠ (2) |
|  | rowMeta · font | `Liberation Sans, del sistema` | `JetBrains Mono, web` | ≠ (6) |
|  | rowTime · rect.width | `28` | — | ≠ (6) |
|  | rowProgress · rect.height | `4` | `24` | +20 px (6) |
|  | rowBuy · rect.width | `101.31` | — | ≠ (6) |
| Teselas de dato con rótulo de sección | infoLabel · fontSize | `11` | `12` | +1 px (5) |
|  | infoLabel · fontWeight | `600` | `600` | = |
|  | infoLabel · letterSpacingEm | `0.1` | `0.1` | = |
|  | infoLabel · textTransform | `uppercase` | `uppercase` | = |
|  | infoLabel · color | `rgb(119, 119, 119)` | `rgb(153, 153, 153)` | ≠ (2) |
|  | infoLabel · font | — | `Montserrat (variable), web` | ≠ (1) |
|  | infoLabelBar · size.width | `3` | `3` | = |
|  | infoLabelBar · size.height | `12` | `12` | = |
|  | infoLabelBar · borderRadius | `2px` | `2px` | = |
|  | infoLabelBar · backgroundColor | `rgb(255, 0, 60)` | `rgb(255, 0, 60)` | = |
|  | dataTile · rect.width | `136` | `156` | +20 px (8) |
|  | dataTile · rect.height | `75` | `74.06` | −0,94 px (1) |
|  | dataTile · borderRadius | `8px` | `8px` | = |
|  | dataTile · backgroundColor | `rgb(17, 17, 17)` | `rgb(17, 17, 17)` | = |
|  | dataTile · border | `1px solid rgb(30, 30, 30)` | `1px solid rgb(30, 30, 30)` | = |
|  | dataTile · padding | `10px 12px` | `10px 12px` | = |
|  | dataTileIcon · color | `rgb(255, 0, 60)` | `rgb(255, 0, 60)` | = |
|  | dataTileLabel · fontSize | `11.2` | `11.2` | = |
|  | dataTileLabel · letterSpacingEm | `0.05` | `0.05` | = |
|  | dataTileLabel · lineHeight | `normal` | `12.88px` | ≠ (5) |
|  | dataTileLabel · textTransform | `uppercase` | `uppercase` | = |
|  | dataTileLabel · color | `rgb(102, 102, 102)` | `rgb(153, 153, 153)` | ≠ (2) |
|  | dataTileValue · fontSize | `15` | `16` | +1 px (5) |
|  | dataTileValue · fontWeight | `600` | `700` | ≠ (5) |
|  | dataTileValue · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
| Tarjeta de cristal | releaseCard · rect.width | `349` | `272` | −77 px (8) |
|  | releaseCard · rect.height | `503.38` | `438.8` | −64,58 px (8) |
|  | releaseCard · borderRadius | `16px` | `16px` | = |
|  | releaseCard · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | releaseCard · border | `1px solid rgba(255, 255, 255, 0.18)` | `1px solid rgba(255, 255, 255, 0.18)` | = |
|  | releaseCard · boxShadow | `rgba(0, 0, 0, 0.4) 0px 4px 24px 0px, rgba(255, 255, 255, 0.12) 0px …` | `rgba(0, 0, 0, 0.4) 0px 4px 24px 0px, rgba(255, 255, 255, 0.12) 0px …` | = |
|  | releaseCard · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `url(#filtro) saturate(1) blur(3px)` | ≠ (9) |
|  | releaseCard · padding | `16px` | `16px` | = |
|  | releaseCardImage · borderRadius | `12px 12px 0px 0px` | `12px 12px 0px 0px` | = |
|  | releaseCardTitle · fontSize | `32` | `32` | = |
|  | releaseCardTitle · fontWeight | `100` | `400` | ≠ (1) |
|  | releaseCardTitle · font | — | `Montserrat (variable), web` | ≠ (1) |
|  | releaseCardArtists · fontSize | `16` | `14` | −2 px (8) |
|  | releaseCardArtists · color | `rgb(255, 255, 255)` | `rgb(255, 255, 255)` | = |
|  | beatCardBuy · rect.height | `37` | `36` | −1 px (6) |
|  | beatCardBuy · borderRadius | `8px` | `999px` | ≠ (6) |
|  | beatCardBuy · backgroundColor | `rgb(255, 0, 60)` | `rgb(230, 0, 58)` | ≠ (2) |
|  | beatCardBuy · fontSize | `15.2` | `12` | −3,2 px (6) |
|  | beatCardBuy · boxShadow | `none` | `rgba(255, 0, 60, 0.45) 0px 4px 20px 0px` | ≠ (6) |
| Pie | footer · padding | `80px 32px 28px` | `80px 32px 28px` | = |
|  | footerLogo · size.width | `64` | `64` | = |
|  | footerName · fontSize | `36` | `36` | = |
|  | footerName · fontWeight | `800` | `800` | = |
|  | footerName · textTransform | `uppercase` | `uppercase` | = |
|  | footerName · letterSpacingEm | `0.02` | `0.02` | = |
|  | footerName · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
|  | footerAccent · size.width | `56` | `56` | = |
|  | footerAccent · size.height | `3` | `3` | = |
|  | footerAccent · backgroundColor | `rgb(255, 0, 60)` | `rgb(255, 0, 60)` | = |
|  | footerDesc · fontSize | `15.2` | `15.2` | = |
|  | footerDesc · color | `rgb(170, 170, 170)` | `rgb(153, 153, 153)` | ≠ (5) |
|  | footerDesc · textAlign | `center` | `center` | = |
|  | footerGrid · alignItems | `normal` | `normal` | = |
|  | footerCard · rect.height | `328` | `190.05` | −137,95 px (7) |
|  | footerCardLast · rect.height | `328` | `190.05` | −137,95 px (7) |
|  | footerCard · borderRadius | `16px` | `16px` | = |
|  | footerCard · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | footerCard · border | `1px solid rgba(255, 255, 255, 0.08)` | `1px solid rgba(255, 255, 255, 0.08)` | = |
|  | footerCard · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `url(#filtro) saturate(1) blur(0px)` | = |
|  | footerCard · padding | `24px` | `24px` | = |
|  | footerCardTitle · fontSize | `12` | `12` | = |
|  | footerCardTitle · fontWeight | `700` | `700` | = |
|  | footerCardTitle · letterSpacingEm | `0.16` | `0.16` | = |
|  | footerCardTitle · textTransform | `uppercase` | `uppercase` | = |
|  | footerCardTitle · textAlign | `center` | `center` | = |
|  | footerCardTitle · color | `rgb(255, 0, 60)` | `rgb(255, 77, 109)` | ≠ (2) |
|  | footerCardLink · fontSize | `14.4` | `14.4` | = |
|  | footerCardLink · lineHeight | `normal` | `16.56px` | ≠ (5) |
|  | footerCardLink · rect.height | `24` | `24.56` | +0,56 px (1) |
|  | footerCardLink · color | `rgb(204, 204, 204)` | `rgb(204, 204, 204)` | = |
|  | footerSocialLink · size.width | `42` | `44` | +2 px (2) |
|  | footerSocialLink · borderRadius | `50%` | `50%` | = |
|  | footerSocialLink · backgroundColor | `rgba(255, 255, 255, 0.06)` | `rgba(255, 255, 255, 0.06)` | = |
|  | footerSocialLink · border | `1px solid rgba(255, 255, 255, 0.1)` | `1px solid rgba(255, 255, 255, 0.08)` | ≠ (5) |
|  | footerBottom · border | `1px solid rgba(255, 255, 255, 0.07)` | `1px solid rgba(255, 255, 255, 0.08)` | ≠ (5) |
|  | footerBottom · fontSize | `12.8` | `12.8` | = |
|  | footerBottom · color | `rgb(119, 119, 119)` | `rgb(153, 153, 153)` | ≠ (5) |
|  | footerLegalLink · fontSize | `12.8` | `12.8` | = |
|  | footerLegalLink · color | `rgb(153, 153, 153)` | `rgb(153, 153, 153)` | = |

### Móvil (390×844)

| Pieza | Propiedad | Sello | BeatBattle | Δ |
|---|---|---|---|---|
| Home arriba | heroTitle · fontSize | `44.8` | `44.8` | = |
|  | heroTitle · fontWeight | `900` | `900` | = |
|  | heroTitle · letterSpacing | `normal` | `normal` | = |
|  | heroTitle · lineHeight | `47.04px` | `47.04px` | = |
|  | heroTitle · rect.y | `317.81` | `251.33` | −66,48 px (3) |
|  | heroTitle · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
|  | heroTitleOutline · webkitTextStroke | `1px rgb(255, 0, 60)` | `2px rgb(255, 0, 60)` | ≠ (1) |
|  | heroTitleOutline · webkitTextFillColor | `rgb(0, 0, 0)` | `rgb(0, 0, 0)` | = |
|  | heroTitleOutline · textShadow | `rgba(255, 0, 60, 0.4) 0px 0px 30px` | `rgba(255, 0, 60, 0.4) 0px 0px 30px` | = |
|  | heroDivider · size.width | `80` | `80` | = |
|  | heroDivider · size.height | `3` | `3` | = |
|  | heroSubtitle · fontSize | `12.8` | `12.8` | = |
|  | heroSubtitle · fontWeight | `300` | `300` | = |
|  | heroSubtitle · letterSpacingEm | `0.15` | `0.15` | = |
|  | heroSubtitle · color | `rgba(255, 255, 255, 0.85)` | `rgb(204, 204, 204)` | ≠ (5) |
|  | heroLogo · size.width | `130` | — | ≠ (3) |
|  | marquee · rect.height | `38.38` | `39.38` | +1 px (1) |
|  | marquee · backgroundColor | `rgba(0, 0, 0, 0.4)` | `rgba(0, 0, 0, 0.4)` | = |
|  | marqueeItem · fontSize | `12` | `12` | = |
|  | marqueeItem · letterSpacingEm | `0.3` | `0.3` | = |
|  | marqueeItem · color | `rgba(255, 255, 255, 0.75)` | `rgb(204, 204, 204)` | ≠ (5) |
|  | silk · selector | `.silk-background` | `.ambient-orbs` | ≠ (4) |
| Isla de navegación y logo | navIsland · rect.x | `16` | `16` | = |
|  | navIsland · rect.y | `16` | `16` | = |
|  | navIsland · rect.width | `358` | `358` | = |
|  | navIsland · rect.height | `54` | `54` | = |
|  | navIsland · borderRadius | `20px` | `20px` | = |
|  | navIsland · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | navIsland · backdropFilter | `url(#filtro) saturate(1) blur(3px)` | `url(#filtro) saturate(1) blur(3px)` | = |
|  | navIsland · boxShadow | `rgba(0, 0, 0, 0.55) 0px 8px 32px 0px` | `rgba(0, 0, 0, 0.55) 0px 8px 32px 0px` | = |
|  | navIsland · padding | `12px` | `12px` | = |
|  | navIsland · position | `sticky` | `sticky` | = |
|  | logo · rect.x | `130.09` | `130.08` | = |
|  | logo · rect.y | `19.78` | `19.78` | = |
|  | logo · rotateDeg | `-10` | `-10` | = |
|  | mobileNavToggle · rect.width | `30` | `44` | +14 px (2) |
|  | mobileNavToggle · rect.height | `30` | `44` | +14 px (2) |
| Página interior | pageTitle · fontSize | `32` | `32` | = |
|  | pageTitle · fontWeight | `700` | `700` | = |
|  | pageTitle · textTransform | `none` | `none` | = |
|  | pageTitle · letterSpacing | `normal` | `normal` | = |
|  | pageTitle · textAlign | `center` | `center` | = |
|  | pageTitle · rect.x | `32` | `32` | = |
|  | pageTitle · rect.y | `102` | `102` | = |
|  | pageTitle · rect.height | `74` | `36.8` | −37,2 px (7) |
|  | pageTitle · font | — | `Montserrat (variable), web` | ≠ (1) |
| Botones CTA y de contorno | ctaPrimary · rect.height | `43.78` | `46.78` | +3 px (9) |
|  | ctaPrimary · border | `0px none rgb(255, 255, 255)` | `1px solid rgb(230, 0, 58)` | ≠ (9) |
|  | ctaPrimary · borderRadius | `999px` | `999px` | = |
|  | ctaPrimary · backgroundColor | `rgba(255, 0, 60, 0.62)` | `rgb(230, 0, 58)` | ≠ (2) |
|  | ctaPrimary · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `none` | ≠ (2) |
|  | ctaPrimary · boxShadow | `rgba(255, 0, 60, 0.45) 0px 4px 20px 0px` | `rgba(255, 0, 60, 0.45) 0px 4px 20px 0px` | = |
|  | ctaPrimary · padding | `14.4px 24px` | `14.4px 24px` | = |
|  | ctaPrimary · fontSize | `13.6` | `13.6` | = |
|  | ctaPrimary · fontWeight | `700` | `700` | = |
|  | ctaPrimary · letterSpacingEm | `0.08` | `0.08` | = |
|  | ctaPrimary · textTransform | `uppercase` | `uppercase` | = |
|  | ctaPrimary · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
|  | ctaGhost · rect.height | `45.78` | `46.78` | +1 px (1) |
|  | ctaGhost · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | ctaGhost · border | `1px solid rgba(255, 255, 255, 0.3)` | `1px solid rgba(255, 255, 255, 0.3)` | = |
|  | ctaGhost · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `url(#filtro) saturate(1) blur(0px)` | = |
|  | ctaGhost · padding | `14.4px 24px` | `14.4px 24px` | = |
| Chip en reposo | genreChip · rect.height | `25.59` | `25.39` | −0,2 px (1) |
|  | genreChip · borderRadius | `20px` | `999px` | ≠ (5) |
|  | genreChip · backgroundColor | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` | = |
|  | genreChip · border | `1px solid rgb(42, 42, 42)` | `1px solid rgb(42, 42, 42)` | = |
|  | genreChip · padding | `4.8px 12px` | `4.8px 12px` | = |
|  | genreChip · fontSize | `12` | `12` | = |
|  | genreChip · fontWeight | `500` | `500` | = |
|  | genreChip · letterSpacingEm | `0.01` | `0` | −0,01 em (5) |
|  | genreChip · color | `rgb(153, 153, 153)` | `rgb(153, 153, 153)` | = |
|  | genreChip · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
| Chip activo | genreChipActive / genreChipActiveFill · backgroundColor | `rgb(255, 0, 60)` | `rgb(230, 0, 58)` | ≠ (2) |
|  | genreChipActive · border | `1px solid rgb(255, 0, 60)` | `1px solid rgb(230, 0, 58)` | ≠ (2) |
|  | genreChipActive · boxShadow | `rgba(255, 0, 60, 0.35) 0px 2px 10px 0px` | `rgba(255, 0, 60, 0.4) 0px 2px 10px 0px` | ≠ (5) |
|  | genreChipActive · color | `rgb(255, 255, 255)` | `rgb(255, 255, 255)` | = |
| Fila de entrada | row · rect.height | `71.58` | `86.48` | +14,9 px (6) |
|  | row · borderRadius | `8px` | `8px` | = |
|  | row · padding | `8px` | `8px` | = |
|  | row · gap | `9.6px` | `12px` | +2,4 px (5) |
|  | row · backgroundColor | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` | = |
|  | rowThumb · size.width | `48` | `48` | = |
|  | rowThumb · borderRadius | `6px` | `8px` | +2 px (5) |
|  | rowThumb · backgroundColor | `rgb(26, 26, 26)` | `rgb(26, 26, 26)` | = |
|  | rowPlay · size.width | `32` | `36` | +4 px (6) |
|  | rowPlay · border | `1px solid rgb(51, 51, 51)` | `1px solid rgb(42, 42, 42)` | ≠ (5) |
|  | rowTitle · fontSize | `14.4` | `14` | −0,4 px (5) |
|  | rowTitle · fontWeight | `600` | `600` | = |
|  | rowTitle · color | `rgb(255, 255, 255)` | `rgb(255, 255, 255)` | = |
|  | rowTitle · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
|  | rowProducer · fontSize | `12.48` | `12` | −0,48 px (5) |
|  | rowProducer · color | `rgb(102, 102, 102)` | `rgb(153, 153, 153)` | ≠ (2) |
|  | rowTime · rect.width | `28` | — | ≠ (6) |
|  | rowProgress · rect.height | `4` | `24` | +20 px (6) |
|  | rowBuy · rect.width | `33.58` | — | ≠ (6) |
| Teselas de dato con rótulo de sección | infoLabel · fontSize | `11` | `12` | +1 px (5) |
|  | infoLabel · fontWeight | `600` | `600` | = |
|  | infoLabel · letterSpacingEm | `0.1` | `0.1` | = |
|  | infoLabel · textTransform | `uppercase` | `uppercase` | = |
|  | infoLabel · color | `rgb(119, 119, 119)` | `rgb(153, 153, 153)` | ≠ (2) |
|  | infoLabelBar · size.width | `3` | `3` | = |
|  | infoLabelBar · size.height | `12` | `12` | = |
|  | infoLabelBar · borderRadius | `2px` | `2px` | = |
|  | infoLabelBar · backgroundColor | `rgb(255, 0, 60)` | `rgb(255, 0, 60)` | = |
|  | dataTile · rect.width | `358` | `292` | −66 px (8) |
|  | dataTile · rect.height | `37` | `37.8` | +0,8 px (1) |
|  | dataTile · borderRadius | `0px` | `0px` | = |
|  | dataTile · backgroundColor | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` | = |
|  | dataTile · border | `0px none rgb(255, 255, 255)` | `0px none rgb(255, 255, 255)` | = |
|  | dataTile · padding | `10px 0px` | `10px 0px` | = |
|  | dataTileLabel · fontSize | `13` | `13` | = |
|  | dataTileLabel · letterSpacingEm | `0.05` | `0.05` | = |
|  | dataTileLabel · lineHeight | `normal` | `14.95px` | ≠ (5) |
|  | dataTileLabel · textTransform | `uppercase` | `uppercase` | = |
|  | dataTileLabel · color | `rgb(136, 136, 136)` | `rgb(153, 153, 153)` | ≠ (2) |
|  | dataTileValue · fontSize | `14` | `14` | = |
|  | dataTileValue · fontWeight | `600` | `700` | ≠ (5) |
|  | dataTileValue · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
| Tarjeta de cristal | releaseCard · rect.width | `349` | `268` | −81 px (8) |
|  | releaseCard · rect.height | `503.38` | `433.88` | −69,5 px (8) |
|  | releaseCard · borderRadius | `16px` | `16px` | = |
|  | releaseCard · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | releaseCard · border | `1px solid rgba(255, 255, 255, 0.18)` | `1px solid rgba(255, 255, 255, 0.18)` | = |
|  | releaseCard · boxShadow | `rgba(0, 0, 0, 0.4) 0px 4px 24px 0px, rgba(255, 255, 255, 0.12) 0px …` | `rgba(0, 0, 0, 0.4) 0px 4px 24px 0px, rgba(255, 255, 255, 0.12) 0px …` | = |
|  | releaseCard · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `url(#filtro) saturate(1) blur(3px)` | ≠ (9) |
|  | releaseCard · padding | `16px` | `16px` | = |
|  | releaseCardImage · borderRadius | `12px 12px 0px 0px` | `12px 12px 0px 0px` | = |
|  | releaseCardTitle · fontSize | `32` | `24.26` | −7,74 px (8) |
|  | releaseCardTitle · fontWeight | `100` | `400` | ≠ (1) |
|  | releaseCardTitle · font | — | `Montserrat (variable), web` | ≠ (1) |
|  | releaseCardArtists · fontSize | `16` | `14` | −2 px (8) |
|  | releaseCardArtists · color | `rgb(255, 255, 255)` | `rgb(255, 255, 255)` | = |
|  | beatCardBuy · rect.height | `37` | `44` | +7 px (2) |
|  | beatCardBuy · borderRadius | `8px` | `999px` | ≠ (6) |
|  | beatCardBuy · backgroundColor | `rgb(255, 0, 60)` | `rgb(230, 0, 58)` | ≠ (2) |
|  | beatCardBuy · fontSize | `15.2` | `12` | −3,2 px (6) |
|  | beatCardBuy · boxShadow | `none` | `rgba(255, 0, 60, 0.45) 0px 4px 20px 0px` | ≠ (6) |
| Pie | footer · padding | `56px 20px 20px` | `56px 20px 20px` | = |
|  | footerLogo · size.width | `64` | `64` | = |
|  | footerName · fontSize | `24` | `24` | = |
|  | footerName · fontWeight | `800` | `800` | = |
|  | footerName · textTransform | `uppercase` | `uppercase` | = |
|  | footerName · letterSpacingEm | `0.02` | `0.02` | = |
|  | footerName · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
|  | footerAccent · size.width | `56` | `56` | = |
|  | footerAccent · size.height | `3` | `3` | = |
|  | footerAccent · backgroundColor | `rgb(255, 0, 60)` | `rgb(255, 0, 60)` | = |
|  | footerDesc · fontSize | `15.2` | `15.2` | = |
|  | footerDesc · color | `rgb(170, 170, 170)` | `rgb(153, 153, 153)` | ≠ (5) |
|  | footerDesc · textAlign | `center` | `center` | = |
|  | footerGrid · alignItems | `normal` | `normal` | = |
|  | footerCard · rect.height | `320` | `259.8` | −60,2 px (7) |
|  | footerCardLast · rect.height | `114` | `115.8` | +1,8 px (7) |
|  | footerCard · borderRadius | `16px` | `16px` | = |
|  | footerCard · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | footerCard · border | `1px solid rgba(255, 255, 255, 0.08)` | `1px solid rgba(255, 255, 255, 0.08)` | = |
|  | footerCard · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `url(#filtro) saturate(1) blur(0px)` | = |
|  | footerCard · padding | `20px` | `20px` | = |
|  | footerCardTitle · fontSize | `12` | `12` | = |
|  | footerCardTitle · fontWeight | `700` | `700` | = |
|  | footerCardTitle · letterSpacingEm | `0.16` | `0.16` | = |
|  | footerCardTitle · textTransform | `uppercase` | `uppercase` | = |
|  | footerCardTitle · textAlign | `center` | `center` | = |
|  | footerCardTitle · color | `rgb(255, 0, 60)` | `rgb(255, 77, 109)` | ≠ (2) |
|  | footerCardLink · fontSize | `14.4` | `14.4` | = |
|  | footerCardLink · lineHeight | `normal` | `16.56px` | ≠ (5) |
|  | footerCardLink · rect.height | `24` | `44` | +20 px (2) |
|  | footerCardLink · color | `rgb(204, 204, 204)` | `rgb(204, 204, 204)` | = |
|  | footerSocialLink · size.width | `42` | `44` | +2 px (2) |
|  | footerSocialLink · borderRadius | `50%` | `50%` | = |
|  | footerSocialLink · backgroundColor | `rgba(255, 255, 255, 0.06)` | `rgba(255, 255, 255, 0.06)` | = |
|  | footerSocialLink · border | `1px solid rgba(255, 255, 255, 0.1)` | `1px solid rgba(255, 255, 255, 0.08)` | ≠ (5) |
|  | footerBottom · border | `1px solid rgba(255, 255, 255, 0.07)` | `1px solid rgba(255, 255, 255, 0.08)` | ≠ (5) |
|  | footerBottom · fontSize | `12.8` | `12.8` | = |
|  | footerBottom · color | `rgb(119, 119, 119)` | `rgb(153, 153, 153)` | ≠ (5) |
|  | footerLegalLink · fontSize | `12.8` | `12.8` | = |
|  | footerLegalLink · color | `rgb(153, 153, 153)` | `rgb(153, 153, 153)` | = |

<!-- ab:tabla:fin -->
