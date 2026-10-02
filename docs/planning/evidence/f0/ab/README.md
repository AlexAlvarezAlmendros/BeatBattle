# Prueba del sello: A/B de BeatBattle frente a otherpeople.es

> **Borrador**, pendiente de la revisión visual. Es la evidencia de `RD-VIS-02` (guía §3.1) y del
> criterio 3 del plan 00: isla, tipografía, rojo, tarjetas y lista comparados con el sello en medidas,
> color y captura.

Compara BeatBattle, pieza a pieza, con la referencia medida de la web del sello (`../otp/`): las
mismas ventanas, las mismas propiedades (`getComputedStyle` y `getBoundingClientRect`, y la fuente
con la que se pinta de verdad, con `CSS.getPlatformFontsForNode`) y hojas lado a lado con el sello a
la izquierda.

## Condiciones

- **Fecha:** 2026-10-02.
- **BeatBattle:** rama `feat/f0-fundaciones` (commit en `metrics.json`, `beatbattle.commit`), Vite en
  desarrollo en `http://127.0.0.1:5520` (la galería solo existe ahí) y sin la API: la home sale en
  «calendario vacío» (§2.19). Galería con el cristal encendido y sin «reducir movimiento».
- **Navegador:** Chrome 154 del sistema (`tools/shot`), GPU real, `deviceScaleFactor` 1, `es-ES`,
  `Europe/Madrid`. Escritorio a 1440×900 y móvil a 390×844 táctil, como las capturas del sello.
- **Sello:** la referencia de `../otp/` (12:03 UTC) y un complemento en vivo en `otp-extra/` (16:13
  UTC, mismo Chrome) con lo que la referencia no tiene: el chip activo (se midió después de la
  captura; el complemento da la misma caja y el mismo color), el pie (no se midió) y las teselas en
  móvil (estaban plegadas). En escritorio, del complemento solo sale la caja de la rejilla de teselas,
  para el recorte.
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
| Teselas con rótulo de sección | `../otp/beat-detail-desktop.png`, `otp-extra/beat-detail-info-mobile.png` | `bb/gallery-data-tiles-*.png` (`#tesela`) | `sheets/data-tiles-*.png` |
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

## Resultado

En las tablas de abajo, 189 propiedades en escritorio (112 iguales) y 167 en móvil (93 iguales); todo
el detalle, en `metrics.json`. Coinciden al valor: la isla (caja, radio, cristal, sombra, relleno y
`sticky`), el logo (posición y giro), los enlaces del menú, el titular (tamaño, peso, interletraje,
interlineado, relleno negro y halo), el filete, el subtítulo, los rótulos verticales, la banda de
marquee, el CTA y el contorno (radio, sombra, relleno, tamaño, peso, interletraje, mayúsculas; borde
y cristal del contorno), el chip en reposo (borde, color y peso), la fila (radio, relleno, hueco,
portada en escritorio, título y etiqueta de género), el rótulo de sección (barra roja de 3×12), las
teselas en escritorio (`#111`, borde `#1e1e1e`, radio 8, relleno, icono rojo y etiqueta en
mayúsculas), la tarjeta de cristal (fondo al 58 %, borde al 18 %, radio 16, sombra doble, relleno y
radio de la portada) y el pie (relleno, logo, nombre, barra roja, tarjetas de cristal, títulos,
enlaces, redes y franja inferior).

A ojo, en las hojas, las dos webs hablan el mismo idioma. Lo que se ve distinto es la letra
(Montserrat, más ancha y redonda), el rojo de los botones (un punto más oscuro), el fondo (orbes rojos
sobre negro frente al Silk granate con grano) y el contenido.

## Diferencias esperadas y justificadas

Numeradas como en la columna Δ.

1. **Tipografía.** BeatBattle carga Montserrat de verdad (fuente web variable: DevTools la llama
   «Montserrat Thin», que es su instancia por defecto, y el peso lo da el eje). El sello la declara
   pero no la carga y se pinta con Liberation Sans (Arial o Helvetica en Windows y macOS): §3.1,
   `RF-OTP-03`. Por eso las letras son más anchas y las cajas con texto miden de 1 a 3 px más de alto
   (CTA 51,4 frente a 49,4; marquee 46,8 frente a 45,8; tesela 78 frente a 75). Los títulos de tarjeta
   del sello piden peso 100 y se pintan en 400 (BeatBattle pide 400). El contorno del titular lleva el
   trazo doble con `paint-order: stroke fill` para que por fuera se vean los mismos 2 / 1 px del sello
   (Montserrat variable trae contornos solapados: tarea 0.7).
2. **Accesibilidad AA (guía v0.4 §3.1 y §3.2).** `--bb-red-cta` (`#e6003a`, 4,7:1) macizo en el CTA,
   el chip activo y el botón de la tarjeta, donde el sello pone `#ff003c` o su cristal al 62 % (3,9:1).
   Los grises de texto que no llegan a 4,5:1 suben a `--bb-text-3` (`#999`): la etiqueta de la tesela
   (`#666`), el BPM de la fila (`#444`), «Prod. by» (`#666`), el rótulo de sección (`#777` sobre
   tarjeta) y los rótulos verticales (blanco al 45 %, 4,4:1). El rojo de texto pequeño sobre tarjeta,
   en `--bb-red-text` (títulos del pie). Objetivos táctiles de 44 px (`RNF-A11Y-09`): hamburguesa, play
   y botón de la tarjeta en móvil, y redes del pie.
3. **Contenido del hero del sello.** El vídeo de fondo, la pieza 3D del logo encima del titular (220 /
   130 px) y el enlace a Spotify del CTA. BeatBattle no los tiene (con semana, el vinilo del sample va
   a la derecha o debajo, §3.8.3): el bloque centrado queda 144 px más arriba en escritorio y 66 en
   móvil; las medidas de cada pieza no cambian.
4. **Silk WebGL pendiente de la tarea 1.1.** El fondo del sello es el Silk granate; BeatBattle pinta,
   mientras tanto, los orbes rojos en CSS (los `listing-orb` del sello, su propia alternativa). Es lo
   que más cambia a ojo en las hojas, y se va con la 1.1.
5. **Escala de tokens (§3.2, `RD-VIS-01`).** *No venía en la lista de partida: la propongo como
   esperada, a confirmar.* Los valores sueltos del sello pasan al token más cercano: tamaños en rem
   exactos (12, 14 y 16 px frente a 12,8, 14,4, 12,48, 11,52, 11 y 15 px), radios `sm` (8) y `pill` (un
   radio de 20 px en un chip de 28 px ya es una píldora: se ven igual), espaciado de 4 en 4 px, grises
   opacos en lugar de blancos con alfa (subtítulo y marquee en `--bb-text-2`, `#ccc`, frente al blanco
   al 85 y al 75 %) y líneas y sombras de la escala (`#2a2a2a` en lugar de `#333`; .08 en lugar de .07
   y .1; halo al 40 % en lugar del 35 %). Diferencias de un píxel o de un tono.
6. **Decisiones propias escritas en la guía.** Datos técnicos en JetBrains Mono (§3.2). En la fila, la
   mini onda sustituye a la barra de progreso y a los tiempos, y no hay precio, descarga ni «Comprar»
   (§3.3; §1.5, sin venta de beats): por eso la fila mide 94,5 px frente a 82,7. Botón icono de 36 a
   44 px (§3.3) en lugar del play de 32. CTA siempre en píldora y en mayúsculas (§3.3), también el de
   la tarjeta y «Entrar» (contorno de `--bb-line-button`, sin el relleno gris de «Iniciar Sesión»).
7. **Contenido distinto.** Cinco enlaces en la isla frente a siete y el engranaje; la página interior
   es la provisional de la 0.10 («Cómo funciona», sin filtros ni lista) y su título queda 16 px más
   abajo; el pie tiene dos tarjetas en lugar de cuatro más la newsletter.
8. **Galería.** Las piezas van en celdas de la galería con contenido de ejemplo: la tarjeta mide
   272 px de ancho (349 en la home del sello) y su texto es de muestra (título fluido de 24 px en
   móvil, «Prod. by» a 14 px); las teselas, 156 px (136 en la barra lateral de la ficha).

## Diferencias sin justificar (9): a revisar

No están en la guía y no la he tocado: son desviaciones para decidir.

1. **Teselas en móvil.** El sello pliega «▌INFORMACIÓN» y, al abrirla, la enseña como lista:
   etiqueta a la izquierda y valor a la derecha, sin icono ni fondo, con filetes entre filas (etiqueta
   de 13 px en `#888`, valor de 14 px). BeatBattle mantiene las teselas en 2×2. La guía (§3.1, §3.3)
   solo describe las teselas: falta decidir si en móvil van como lista, y si plegadas.
2. **Título de las páginas interiores.** La página provisional usa el estilo de titular
   (`--bb-font-display`: 900, mayúsculas, −0,02 em; 48 / 36 px), y el sello, en sus páginas
   interiores, 32 px en 700 sin mayúsculas («Beats de nuestros productores»). La guía da
   `--bb-font-display` a los titulares sin decir qué lleva el título de una página interior.
3. **Desenfoque de la tarjeta de cristal.** `blur(3px)` en BeatBattle; el sello, con GlassSurface,
   `blur(0px)` en las tarjetas (los 3 px son solo de la isla). La guía (§3.3) dice «con desenfoque»
   sin valor.
4. **Borde de las tarjetas del pie.** `--bb-line-strong` (al 18 %) frente al 8 % del sello
   (`Footer.css`, `.glass`), que es justo `--bb-line`.
5. **Portada de la fila en móvil.** 40 px frente a los 48 del sello (en escritorio, 48 en los dos).

## Hallazgo de paso

`ScrollRestoration` de React Router (en `RootLayout`) recupera el desplazamiento de otra página al
cargar una URL nueva en la misma pestaña (escrita en la barra o desde un enlace externo): la carga
inicial siempre tiene la clave `default`, así que hereda la posición guardada para la carga anterior.
Al capturar, `/como-funciona` abrió desplazada hasta el pie después del final de `/`. El script abre
una pestaña por ruta para no arrastrarlo; el arreglo (por ejemplo, `getKey` por `pathname` en la carga
inicial) queda fuera de esta tarea.

## Tablas

Generadas por `tools/shot/ab.mjs`: no se editan a mano. Δ es BeatBattle − sello en px; `=`, que
coincide (menos de 0,05 px es redondeo); `≠`, que difiere sin magnitud (colores, sombras, radios de
píldora); entre paréntesis, el motivo de las listas de arriba. `rect.*` es la caja en pantalla;
`size.*`, la caja CSS sin transformar; `font`, la fuente con la que se pinta de verdad; `—`, que ese
lado no tiene la pieza (o el sello no sondeó su fuente).

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
| Página interior | pageTitle · fontSize | `32` | `48` | +16 px (9) |
|  | pageTitle · fontWeight | `700` | `900` | ≠ (9) |
|  | pageTitle · textTransform | `none` | `uppercase` | ≠ (9) |
|  | pageTitle · letterSpacing | `normal` | `-0.96px` | ≠ (9) |
|  | pageTitle · rect.y | `117` | `133` | +16 px (7) |
|  | pageTitle · font | — | `Montserrat (variable), web` | ≠ (1) |
| Botones CTA y de contorno | ctaPrimary · rect.height | `49.38` | `51.38` | +2 px (1) |
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
| Chip en reposo | genreChip · rect.height | `28.19` | `26.58` | −1,61 px (1) |
|  | genreChip · borderRadius | `20px` | `999px` | ≠ (5) |
|  | genreChip · backgroundColor | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` | = |
|  | genreChip · border | `1px solid rgb(42, 42, 42)` | `1px solid rgb(42, 42, 42)` | = |
|  | genreChip · padding | `5.6px 14.4px` | `5.4px 13.8px` | ≠ (5) |
|  | genreChip · fontSize | `12.8` | `12` | −0,8 px (5) |
|  | genreChip · fontWeight | `500` | `500` | = |
|  | genreChip · letterSpacingEm | `0.01` | `0` | = |
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
|  | dataTile · rect.height | `75` | `77.98` | +2,98 px (1) |
|  | dataTile · borderRadius | `8px` | `8px` | = |
|  | dataTile · backgroundColor | `rgb(17, 17, 17)` | `rgb(17, 17, 17)` | = |
|  | dataTile · border | `1px solid rgb(30, 30, 30)` | `1px solid rgb(30, 30, 30)` | = |
|  | dataTile · padding | `10px 12px` | `10px 12px` | = |
|  | dataTileIcon · color | `rgb(255, 0, 60)` | `rgb(255, 0, 60)` | = |
|  | dataTileLabel · fontSize | `11.2` | `11.2` | = |
|  | dataTileLabel · letterSpacingEm | `0.05` | `0.05` | = |
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
|  | footerCard · borderRadius | `16px` | `16px` | = |
|  | footerCard · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | footerCard · border | `1px solid rgba(255, 255, 255, 0.08)` | `1px solid rgba(255, 255, 255, 0.18)` | ≠ (9) |
|  | footerCard · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `url(#filtro) saturate(1) blur(0px)` | = |
|  | footerCard · padding | `24px` | `24px` | = |
|  | footerCardTitle · fontSize | `12` | `12` | = |
|  | footerCardTitle · fontWeight | `700` | `700` | = |
|  | footerCardTitle · letterSpacingEm | `0.16` | `0.16` | = |
|  | footerCardTitle · textTransform | `uppercase` | `uppercase` | = |
|  | footerCardTitle · color | `rgb(255, 0, 60)` | `rgb(255, 77, 109)` | ≠ (2) |
|  | footerCardLink · fontSize | `14.4` | `14.4` | = |
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
| Página interior | pageTitle · fontSize | `32` | `36.38` | +4,38 px (9) |
|  | pageTitle · fontWeight | `700` | `900` | ≠ (9) |
|  | pageTitle · textTransform | `none` | `uppercase` | ≠ (9) |
|  | pageTitle · letterSpacing | `normal` | `-0.727632px` | ≠ (9) |
|  | pageTitle · rect.y | `102` | `118` | +16 px (7) |
|  | pageTitle · font | — | `Montserrat (variable), web` | ≠ (1) |
| Botones CTA y de contorno | ctaPrimary · rect.height | `43.78` | `46.78` | +3 px (1) |
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
|  | genreChip · letterSpacingEm | `0.01` | `0` | = |
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
|  | rowThumb · size.width | `48` | `40` | −8 px (9) |
|  | rowThumb · borderRadius | `6px` | `8px` | +2 px (5) |
|  | rowThumb · backgroundColor | `rgb(26, 26, 26)` | `rgb(26, 26, 26)` | = |
|  | rowPlay · size.width | `32` | `44` | +12 px (6) |
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
|  | infoLabel · font | — | `Montserrat (variable), web` | ≠ (1) |
|  | infoLabelBar · size.width | `3` | `3` | = |
|  | infoLabelBar · size.height | `12` | `12` | = |
|  | infoLabelBar · borderRadius | `2px` | `2px` | = |
|  | infoLabelBar · backgroundColor | `rgb(255, 0, 60)` | `rgb(255, 0, 60)` | = |
|  | dataTile · rect.width | `358` | `156` | −202 px (9) |
|  | dataTile · rect.height | `37` | `77.98` | +40,98 px (9) |
|  | dataTile · borderRadius | `0px` | `8px` | +8 px (9) |
|  | dataTile · backgroundColor | `rgba(0, 0, 0, 0)` | `rgb(17, 17, 17)` | ≠ (9) |
|  | dataTile · border | `0px none rgb(255, 255, 255)` | `1px solid rgb(30, 30, 30)` | ≠ (9) |
|  | dataTile · padding | `10px 0px` | `10px 12px` | ≠ (9) |
|  | dataTileIcon · color | — | `rgb(255, 0, 60)` | ≠ (9) |
|  | dataTileLabel · fontSize | `13` | `11.2` | −1,8 px (9) |
|  | dataTileLabel · letterSpacingEm | `0.05` | `0.05` | = |
|  | dataTileLabel · textTransform | `uppercase` | `uppercase` | = |
|  | dataTileLabel · color | `rgb(136, 136, 136)` | `rgb(153, 153, 153)` | ≠ (9) |
|  | dataTileValue · fontSize | `14` | `16` | +2 px (9) |
|  | dataTileValue · fontWeight | `600` | `700` | ≠ (9) |
|  | dataTileValue · font | `Liberation Sans, del sistema` | `Montserrat (variable), web` | ≠ (1) |
| Tarjeta de cristal | releaseCard · rect.width | `349` | `272` | −77 px (8) |
|  | releaseCard · rect.height | `503.38` | `437.88` | −65,5 px (8) |
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
|  | footerCard · borderRadius | `16px` | `16px` | = |
|  | footerCard · backgroundColor | `rgba(0, 0, 0, 0.58)` | `rgba(0, 0, 0, 0.58)` | = |
|  | footerCard · border | `1px solid rgba(255, 255, 255, 0.08)` | `1px solid rgba(255, 255, 255, 0.18)` | ≠ (9) |
|  | footerCard · backdropFilter | `url(#filtro) saturate(1) blur(0px)` | `url(#filtro) saturate(1) blur(0px)` | = |
|  | footerCard · padding | `20px` | `20px` | = |
|  | footerCardTitle · fontSize | `12` | `12` | = |
|  | footerCardTitle · fontWeight | `700` | `700` | = |
|  | footerCardTitle · letterSpacingEm | `0.16` | `0.16` | = |
|  | footerCardTitle · textTransform | `uppercase` | `uppercase` | = |
|  | footerCardTitle · color | `rgb(255, 0, 60)` | `rgb(255, 77, 109)` | ≠ (2) |
|  | footerCardLink · fontSize | `14.4` | `14.4` | = |
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
