# Acta del jurado visual de la Fase 4 (tarea 4.20)

> **Fecha:** 2026-10-13 · **Rama:** `feat/4.20-jurado` · **Guía:** v0.6.55 → **v0.6.56** ·
> **Requisito:** `RD-VIS-02` (e) sobre las pantallas nuevas de la fase:
> - `/subir`: las bases, la ranura, el análisis, la hoja del luchador, el medidor de súper, la celebración, los errores;
> - `/subir` en edición: la ficha, sustituir el audio y retirar;
> - el menú con la entrada ya subida;
> - los emails `entry.receipt`, `entry.failed` y `entry.changed`.
>
> **Resultado:**
> - **Marca:** ✅ al segundo pase (confirmado en el tercero, tras los últimos cambios de la celebración).
> - **Juego:** ✅ al cuarto pase.
> - **Accesibilidad:** ✅ al cuarto pase.
>
> Todas las altas y medias están corregidas y verificadas. Las bajas que siguen abiertas llevan su motivo.

## Cómo se juzgó

- **Jurado:** tres jurados independientes, uno por lente. Cada lente numera sus hallazgos: **J** (juego), **M** (marca)
  y **A** (accesibilidad). Los nuevos de los pases siguientes van como **N** (juego) y siguen la numeración en marca
  y accesibilidad.
- **Capturas:** `tools/shot/jury-f4.mjs`, que recorre `/subir` entero con `flow-f4-subir.mjs` en cada tamaño (crea
  la cuenta, acepta las bases, suelta un WAV de 140 BPM en La menor, rellena la hoja, sube, edita, sustituye y retira).
  - Tamaños reales: 1440 × 900, 1366 × 657, 1024 × 768, 390 × 844 táctil y 320 × 568 táctil.
  - Además: un fichero que no es audio, contraste alto (`forced-colors`), «reducir movimiento», el foco con
    teclado y el banco de portadas.
  - Desde el segundo pase, el medidor se captura **a mitad** (subida frenada a ~1 MB/s con la red emulada de
    Chrome) y la celebración a 100 ms, 500 ms y ~2,3 s desde que aparece.
  - Entorno: la API en modo test con el seed de semanas (`seed:weeks`), el almacenamiento falso (`BB_FAKE_STORAGE`)
    y el buzón en memoria. Chrome con `--disable-lcd-text`.
- **Accesibilidad**, además de las capturas: recorridos con Playwright en el Chrome del sistema contra la app
  levantada, con axe (wcag2a, wcag2aa, wcag21a/aa, wcag22aa y best-practice) en cada estado, traza del foco en cada
  transición, `elementFromPoint` sobre cada parada de Tab, registro de las regiones vivas, la subida limitada por CDP
  para oír los cuartos, el error de subida con la conexión cortada y la verificación retrasada 5 s.
- **Emails:** la galería (`packages/emails/scripts/gallery.tsx`) capturada con `tools/shot/emails.mjs`, que ahora
  va sin suavizado LCD y sirve la onda de ejemplo de cada recibo desde `apps/server/src/scripts/emailWaveforms.ts`.

Las capturas de esta carpeta son las del último pase (una selección: todos los estados a 1440 y 390, y los que
cambian de composición a 1366, 1024 y 320). Las de los emails están en `../emails/`.

## Veredictos

| Lente | 1.er pase | 2.º pase | 3.er pase | 4.º pase |
|---|---|---|---|---|
| **Marca** (paleta, firma, «Lo que nunca se imita», granate, §1.3) | ❌ 0 · 4 · 9 | ✅ | ✅ (confirmación) | — |
| **Juego** (maquetas, menú de recreativa) | ❌ 2 · 8 · 6 | ❌ (N1 media) | ❌ (N6 media, regresión del arreglo de N1) | ✅ |
| **Accesibilidad** (WCAG 2.2 AA, `RD-VIS-05`, teclado) | ❌ 3 · 3 · 3 | ❌ (resto de A4) | ❌ (A11 alta, A12 media) | ✅ |

- Las cifras son hallazgos altos · medios · bajos.
- A11 ya estaba en una captura del primer pase y la lente no lo vio hasta el tercero.

**Granate en el último pase** (criterio de las actas anteriores: píxeles con r entre 25 y 110, g < 0,45·r y
b < 0,6·r; techo 24,5 % a 1440). 0,000 % de píxeles fuera de la paleta en todas las capturas normales y en los 8
emails de la fase.

| Pantalla | 1440 | 1366 | 1024 | 390 | 320 |
|---|---|---|---|---|---|
| Bases | 21,5 | 18,3 | 24,0 | 12,6 | 10,7 |
| Ranura | 21,6 | 18,4 | 23,2 | 10,8 | 5,2 |
| Analizando | 22,0 | 19,3 | 24,4 | 12,6 | 10,4 |
| Analizado | 18,5 | 17,3 | 21,6 | 3,6 | 4,9 |
| Hoja | 18,5 | 17,0 | 21,2 | 3,1 | 4,0 |
| Medidor (a mitad) | 21,6 | 18,4 | 24,8 | 12,4 | 13,8 |
| Celebración | 20,2 | 18,4 | 24,3 | 12,1 | 18,4 |
| Menú con entrada | 21,7 | 20,4 | 16,7 | 10,3 | 9,8 |
| Editar | 19,6 | 18,9 | 23,5 | 9,8 | 16,0 |
| Editar (sustituido) | 19,9 | 17,2 | 21,3 | 5,9 | 4,1 |
| Retirar (modal) | 8,4 | 7,6 | 8,4 | 3,0 | 3,0 |
| Retirada | 21,2 | 18,1 | 22,7 | 8,6 | 4,9 |

- Medido sobre el tercer pase; el cuarto solo cambió la celebración en el móvil y el ancho del rodillo.
- En el primer pase, «Editar» daba 30,1 % a 1440 y «Analizado» 26,8 % (M1): el vinilo, centrado en una columna que
  crecía con la hoja, bajaba fuera de la vista y dejaba la cuña desnuda.
- El medidor a 1024 da 24,8 %: el techo se fija a 1440, así que queda como observación.

## Hallazgos y lo que se hizo

### Altas y medias

| # | Hallazgo (lente · gravedad) | Qué se hizo | Verificación |
|---|---|---|---|
| J1 · M5 · A1 | En el móvil, al cambiar la hoja larga por el medidor o la celebración, la página no subía: el anunciador, la portada y el alias quedaban por encima de la vista, y el foco caía en `<body>`; el aviso se montaba ya lleno y no siempre se anunciaba (juego · alta, marca · media, accesibilidad · alta) | Cada panel nuevo lleva la vista a su bloque y el foco a su sitio: «Cancelar» en el medidor, el alias (`h2`) en la celebración. La celebración avisa por la región compartida (`announce()`) en el impacto | `subir-medidor-390`, `subir-dentro-390`, `subir-dentro-320`; test «el foco va al alias…» |
| J2 · M1 | El vinilo se centraba en el alto de una columna que crecía con la hoja: bajaba fuera de la vista y el granate subía a 26,8–31,3 % (juego · alta, marca · media) | `pieceAlign="start"` y la pieza en `sticky`, como el emblema de Opciones | Granate (tabla); `editar-1440`, `subir-hoja-1440` |
| A2 | Con Tab, el campo «Descripción» quedaba enfocado pero tapado entero por la barra (accesibilidad · alta, WCAG 2.4.11) | `TextAreaField` lleva la caja entera a la vista al enfocarla si queda bajo la barra (Chrome desplaza hasta el cursor de texto, no hasta la caja) | 48/48 puntos visibles en los cuatro tamaños (2.º pase) |
| A3 | En la edición, el foco iba a «Elegir archivo» de la ranura de sustituir, fuera de la vista (accesibilidad · alta) | `UploadSlot autoFocus={false}` en la edición; donde sí se enfoca, se lleva a la vista | 2.º pase de accesibilidad |
| A11 | Tras cancelar o tras un error, la ranura ya analizada medía ~5000 px: la onda nace con un pico por barra antes de medirse y la columna crecía con ella (accesibilidad · alta, WCAG 1.4.10) | `.slot` con `grid-template-columns: minmax(0, 1fr)` y `.wave` con `min-width: 0` | Paso nuevo del E2E del hito (cancelar con Esc y la ranura cabe en la ventana): sin el arreglo falla con 5590 px |
| J3 | El medidor era el de 10 px del HUD con un porcentaje: no parecía un medidor de súper, y ninguna captura enseñaba la subida (juego · media) | `Meter size="super"`: 28 px, chaflán ancho, marcas a un tercio y a dos tercios y, lleno, blanco con el filo rojo; sin transición al pasar a verificar. La captura frena la subida | `subir-medidor-1440`, `-1024`, `-390` |
| J4 · A6 | El análisis no se leía como tragaperras (chips normales, el porcentaje solo para el lector, la onda un muñón gris), y la región viva leía los valores falsos del giro cada 70 ms (juego · media, accesibilidad · media) | Un rodillo por chip con el anterior y el siguiente asomando, «ANALIZANDO… 12 %» a la vista, la onda en rojo con la cabeza blanca. Los chips que giran van `aria-hidden`; el lector oye «Analizando» y el resultado | `subir-analizando-1440`, `-390`; 4 mutaciones de la región frente a 25–34 |
| J5 | La ranura no parecía una ranura y el panel se estiraba medio vacío (juego · media) | La boca de la ranura (flechas rojas y hendidura negra que se enciende al arrastrar). `fill` solo con la hoja y la edición: la ranura, las bases, el medidor y la celebración centran su bloque (§3.8.14) | `subir-ranura-1440`, `subir-bases-1440` |
| J6 · M7 | «Volver al menú» dos veces en la celebración (juego · media) | Solo «Ver mi entrada» en la tarjeta; el pie ya lleva «Volver al menú [Esc]» | `subir-dentro-*` |
| J7 | El anunciador de la celebración no tenía peso (juego · media) | Franja negra con filetes rojos que cruza el panel, con el rótulo al cuerpo del contador | `subir-dentro-1440` |
| J8 · A7 | La barra solo decía «ESC VOLVER · M SONIDO», también mientras Esc cancelaba la subida (juego · media) | `/subir` con INTRO ENTRAR · ESC VOLVER · M SONIDO; mientras sube, ESC CANCELAR · M SONIDO (`useControlKeys`) y el pie sin «Volver al menú [Esc]» (§3.4.1) | `subir-medidor-1440`; test «la barra dice ESC CANCELAR» |
| J9 · M8 | En la edición, la ranura de sustituir era lo más grande de la pantalla y había dos [INTRO] (juego · media) | Ranura compacta: rótulo «Nuevo audio», sin display ni [INTRO] | `editar-sustituido-1440`, `-390` |
| J10 | Al retirar no se decía nada (juego · media) | Aviso «Has retirado tu entrada: tu hueco vuelve a estar libre», con el foco | `retirada-1440`, `-390` |
| M2 · J12 | Los rótulos de los desplegables iban en Anybody cursiva (marca · media) | Chakra Petch, como los de `TextField` | `subir-hoja-1440` |
| M6 | Un bloque negro tapaba la pantalla a 250 ms de «Entrar en la batalla» (marca · media, a confirmar) | No se reproduce desde que la vista sube al medidor: la captura de 250 ms caía en la hoja desplazada al pie | `subir-dentro-100ms-*`, `-500ms-*` (2.º pase) |
| A4 | El foco caía en `<body>` en cada transición (accesibilidad · media) | Al elegir fichero, al nombre del fichero; medidor, a «Cancelar»; error, a «Volver a intentarlo»; cancelar, sustituir y retirar, a su aviso | Traza del foco del 4.º pase |
| A5 | El medidor no anunciaba nada y llevaba `aria-busy` fijo (accesibilidad · media) | Anuncia el comienzo («Esc para cancelar»), 25, 50 y 75 % y la verificación; sin `aria-busy` | Oído con un WAV de 5 MB y la subida a 1 MB/s (3.er pase) |
| A12 | Durante «Verificando…» el foco caía en `<body>` y Esc salía al menú: la entrada se creaba pero se perdía la celebración (accesibilidad · media) | Foco al título del medidor y Esc se consume sin salir (repite que se está verificando). La guía lo dice (§3.8.5) | Test «mientras verifica, el foco en su título y Esc no cancela ni se sale»; `probe8` con el registro retrasado 5 s |
| N1 | El anunciador partía en 2–4 líneas según el ancho y la tarjeta bajaba al estampar; a 1366 × 657 «Volver al menú» quedaba bajo la barra (juego · media) | Dos líneas equilibradas con el cuerpo ajustado al ancho de la franja (unidades de contenedor) y su alto reservado desde el principio (tres a < 360 px); en ventanas bajas, el cuerpo topa con el alto y la portada baja a 8rem | `subir-dentro-1366`, `subir-dentro-500ms-1366`, `subir-dentro-1024` |
| N6 | Regresión del arreglo de N1: con `block: 'nearest'`, a 390 «Ver mi entrada» quedaba bajo la barra (juego · media) | En el móvil, el alias a todo el ancho arriba, la portada de 96 px con su frase al lado y debajo el resto | `subir-dentro-390`, `subir-dentro-320` |

### Bajas corregidas

| # | Hallazgo | Verificación |
|---|---|---|
| M3 | «Ya estás en la batalla #N» en display: ahora Chakra Petch y el número en Oxanium | `subir-dentro-*` |
| M4 · J12 | Desplegables nativos: ahora con el fondo de los campos y la flecha roja propia | `subir-hoja-1440` |
| M10 | Capturas de los emails con suavizado LCD: `--disable-lcd-text` en `emails.mjs` | 0,000 % fuera de la paleta |
| M11 · J15 | La onda de `entry.changed` llevaba el clip del recibo: ejemplo propio (sin clip, otra huella, otra hora y otro tamaño) | `../emails/entry.changed-600.png` |
| M12 · J15 | En el ticket a 390, la fecha partía y su segunda línea caía bajo el rótulo: el valor baja entero | `../emails/entry.receipt-390.png` |
| A9 | En las bases, el foco empezaba en `<body>`: ahora en «Leer las bases» | 2.º pase de accesibilidad |
| A10 | «Análisis terminado» se repetía al volver a montarse la ranura tras cancelar o fallar: solo se anuncia al pasar a listo | 3.er pase de accesibilidad |
| N2 | La franja del anunciador salía vacía 1,5 s: ahora solo se pinta en el impacto | `subir-dentro-100ms-*` |
| N3 | La boca de la ranura era tímida y estaba centrada: alineada con el bloque, más alta y más ancha | `subir-ranura-1440` |
| N4 | A 390 el chip de la tonalidad cambiaba la fila al fijarse: el ancho del rodillo es el del valor de en medio | `subir-analizando-390` frente a `subir-analizado-390` |

## Bajas abiertas

| # | Hallazgo | Motivo |
|---|---|---|
| J11 · M8 | La placa del HUD dice «INSERTA TU BEAT» y la cabeza móvil «SEMANA 1 · INSCRIPCIÓN»; en la edición, el título sigue siendo «Subir mi beat» | Es J16 de la F3: la placa sale del `handle` estático de la ruta. Propuesta: llevar los datos de la pantalla a la placa con la ficha pública de la entrada en la Fase 5 |
| J13 | En el menú móvil no se ve «Editar mi entrada» | El dato del menú móvil es el de la semana. Propuesta: revisarlo con el menú en la Fase 5, que añade el Modo Jurado con datos reales |
| J14 | A 320 algunos botones grandes parten en dos líneas; en la edición la portada llena la primera vista | Se leen enteros y se pulsan; la celebración ya se resolvió (N6). Propuesta: tamaño `md` por debajo de 360 px con la tanda de accesibilidad de la Fase 10 |
| J16 | Unas familias de portadas llaman más la atención que otras (manchas macizas) | Pasan `RD-VIS-04`, que mide la media. Propuesta: una métrica de contraste local en el banco antes de la rejilla «ELIGE ENTRADA» de la Fase 5 (§1.3) |
| J6 (resto) | «Ver mi entrada» va sin [INTRO] aunque la barra anuncia «INTRO ENTRAR» | El foco va al alias (lo pide A1); Intro con el foco en el botón funciona igual |
| N5 | A 1024 la barra pasa de dos filas a una mientras sube (tres teclas frente a dos) | Es la regla de la barra (§3.4.1: las teclas nunca se cortan). Propuesta: revisarlo con el encaje del menú a 1024 (excepción J1 de la F3) |
| N7 | A 320 la frase del alias va en una columna estrecha de 5 líneas junto a la portada | «Ver mi entrada» se ve sobre la barra |
| M9 | En el móvil, la diagonal pasa por encima del vinilo | Es el orden de capas común de la composición de una columna (F0). Se revisa con la arena en la Fase 8 |
| M13 | Los emails no cargan Chakra Petch | Afecta a todas las plantillas desde la F2. Propuesta: `<Font>` de React Email con la auditoría de entregabilidad de la Fase 10 |
| A8 | Los modales duplican los landmarks banner y contentinfo (`ModalSurface` con `<header>` y `<footer>`) | Es el `Modal` común de la F0. Se revisa con el `Modal` en la Fase 10 (como M7 de la F3) |
| Marca N1 | La ranura y el medidor quedan como un bloque centrado con la arena a la vista arriba y abajo | Es lo que pide §3.8.14 para las pantallas de poco contenido (lo pidió la lente de juego, J5) |
| Marca N2 | Sobre la franja del anunciador queda una tira del marco | Es el relleno del marco del panel; la franja reserva su sitio dentro |

## Capturas

| Fichero | Qué enseña |
|---|---|
| `subir-bases-*`, `subir-ranura-*` | Las bases (foco en «Leer las bases») y la ranura con su boca |
| `subir-analizando-*`, `subir-analizado-*` | La tragaperras girando y fijada |
| `subir-hoja-*` | La hoja del luchador |
| `subir-medidor-*` | El medidor de súper a mitad de la subida, con ESC CANCELAR en la barra |
| `subir-dentro-100ms-*`, `subir-dentro-500ms-*`, `subir-dentro-*` | La celebración antes del impacto y al final |
| `menu-con-entrada-*` | El menú con «Editar mi entrada» |
| `editar-*`, `editar-sustituido-*`, `retirar-confirmar-*`, `retirada-*` | La edición, el audio sustituido, la confirmación de retirar y el aviso de después |
| `error-formato-*` | Un fichero que no es audio |
| `ranura-contraste-1440`, `ranura-sin-movimiento-1440`, `foco-teclado-1440` | Contraste alto, sin movimiento y el foco con teclado |
| `portadas-1440` | El banco de portadas (`RD-VIS-04`) |

Las capturas de las tareas 4.14–4.18 están en `../subir`, y las de los emails en `../emails`.
