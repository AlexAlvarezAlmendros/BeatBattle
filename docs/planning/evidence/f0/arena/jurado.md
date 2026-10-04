# Acta del jurado visual de la Arena (tarea 0.28)

> **Fechas:** 2026-10-03 (primer pase) y 2026-10-04 (segundo pase, cuatro rondas de arreglos y
> verificación final) · **Rama:** `feat/f0-fundaciones` · **Guía:** v0.6.4 → **v0.6.8** · **Requisito:**
> `RD-VIS-02` (e), prueba de marca y de juego con un jurado de tres lentes (guía §3.10).
>
> **Resultado:** la verificación final pasa en las tres lentes (sin nada alto ni medio contra la guía
> v0.6.8). Queda una decisión abierta para el usuario (móviles de 781 a ~840 px de alto, al final).

## Primer pase (2026-10-03)

El jurado miró la app real (`/`, `/dev/menu`, `/como-funciona`, `/entrar`, la 404, `/dev/galeria`) a
1440×900 y 390×844 (y, la lente de accesibilidad, también a 360×640, 320×568 y 720×450, el 200 % de
1440×900) frente a las maquetas aprobadas de esta carpeta (`01-menu-*`, `00-titulo`, `02-seleccion`,
`03-jurado`, `05-perfil`). Este documento recoge sus veredictos, cómo se agruparon las discrepancias,
qué se corrigió (con su commit y cómo se verificó) y qué se descartó o aplazó, con su motivo.

### Veredictos

| Lente | Veredicto | Discrepancias (alta · media · baja) |
|---|---|---|
| **Juego** (fidelidad a las maquetas y aspecto de menú de recreativa) | ❌ No pasa | 2 · 5 · 10 |
| **Marca** (paleta, firma *OTP.*, nada de «Lo que nunca se imita») | ✅ Pasa | 0 · 2 · 5 |
| **Accesibilidad** (WCAG 2.2 AA, `RD-VIS-05`, teclado, táctil) | ❌ No pasa | 0 · 7 · 8 |

Ninguna lente encontró piezas del sello imitadas (isla, hero en contorno, marquee, orbes, cristal,
Montserrat), textos prohibidos de §3.9 ni fugas del voto ciego (§1.3): ninguna entrada destacada, sin
retratos, sin números de orden ni medias o recuentos antes del sellado.

### Discrepancias agrupadas y lo que se hizo

Las 39 discrepancias se agruparon en 24 problemas (varias lentes vieron el mismo). Todas las altas y
medias están corregidas; de las bajas, todas salvo la pantalla de título (aplazada a la 1.13) y parte
de la del granate de la cuña (ver «Descartado o aplazado»).

| # | Problema (lentes · gravedad) | Qué se hizo | Commit |
|---|---|---|---|
| 1 | **Placa elegida que se corta**: la tecla `[INTRO]` recortada por el paralelogramo («INTR») y el dato en «…» al crecer a 31 px (juego · alta); motivo de la deshabilitada truncado («SIN SEMANAS SEL…», «S…» a 320) y sin reflow a 320 px (accesibilidad · media; juego · baja); «1 MIN» perdido a 390 (juego · baja) | Columnas `índice · minmax(0, 1fr) · max-content`: el dato y la tecla no se encogen; la etiqueta cede con `useFitText` (de 125 a 105 % y después el cuerpo; si ni así, parte por palabras o baja hasta 12 px). Relleno final ≥ `--bb-slant` + margen. Motivo en dos líneas, «Aún nada sellado». Por debajo de 360 px el dato baja a una segunda línea. Dato corto (cifras, etiquetas, motivos) siempre; el largo, en móvil, solo en la elegida | `fix(0.24)` |
| 2 | **Tildes recortadas** en display («GRÀCIA» sin tilde a 390, «SALÓN», «CÓMO», «PRÓXIMO», «PÚRPURA»), y es el LCP de la home (juego · alta; marca · media; accesibilidad · media) | `overflow-x: clip` y `overflow-y: visible` en la etiqueta de la placa, el título del escenario y el alias de la ficha (con `min-width: 0`: sin él, un `clip` no encoge el elemento de rejilla). Muestra «Gràcia · Próximo · Púrpura · ÀÓÚ» en la galería y placas con tilde en reposo y elegidas | `fix(0.24)`, `fix(0.25)` |
| 3 | **Trama de relleno bajo el texto** de la placa elegida («Nunca bajo texto», `RD-VIS-05`) (accesibilidad · media) | La trama va en una franja en paralelogramo dentro del relleno final de la placa, fuera de todo texto | `fix(0.24)` |
| 4 | **«TOCA PARA ENTRAR» sobre la trama** a 1440 y sobre todo a 720×450, y la diagonal móvil bajo «ELIGE» (accesibilidad · media y baja) | «ELIGE MODO» va sobre una franja `--bb-panel-veil` en paralelogramo: ni la trama ni la diagonal tocan el rótulo, a cualquier tamaño de ventana | `fix(0.24)` |
| 5 | **Teclas ocultas por ancho y no por tipo de entrada** (barra y placa) y «Toca para entrar» también con teclado (accesibilidad · media) | Teclas fuera solo con `(hover: none), (pointer: coarse)`; con teclado y ratón, en una ventana estrecha la barra lleva una fila de teclas propia. El rótulo dice «Intro para entrar» con puntero fino | `fix(0.23)`, `fix(0.24)` |
| 6 | **Firma fuera de la ventana en móvil** en pantallas largas, barra de dos filas con «LEGAL» subrayado (marca · media; juego · baja) | Barra pegada al pie también en móvil, firma de 24 px y «Legal» en una fila (sin subrayado, como un rótulo de la barra). E2E con `toBeInViewport()` en cinco pantallas a 390×844 | `fix(0.23)` |
| 7 | **«Inserta tu beat · Crédito 01»** todo en mayúsculas y blanco, sin respirar (juego · baja; marca · baja) | Caja mixta, crédito en Oxanium rojo y «Inserta tu beat» respirando 2 s (quieto con «reducir movimiento») | `fix(0.23)` |
| 8 | **Pantallas interiores «web con adornos»**: título dos veces (placa del HUD y H1 gigante), cuña vacía, panel de artículo con viñetas y enlace subrayado (juego · media; accesibilidad · baja) | Con placa en el HUD, el `<h1>` queda para lectores de pantalla en escritorio (en móvil se ve). La cuña lleva la pieza de cada pantalla (lista de movimientos, pad, logo con su lockup, sello «EN OBRAS»); reglas como filas con índice en Oxanium rojo | `fix(0.26)` |
| 9 | **«Cómo se juega» no se recorre como un menú** (flechas muertas, sin cursor; `[INTRO]` con aspecto de acción; «[1] [5]» sin separador; «Cocina tu flip» sin gesto) (juego · media; accesibilidad · baja) | Menú de juego (`useRovingMenu`) con cursor y 1P: tres movimientos, «Bases de la competición [B]» y «Volver al menú [Esc]»; flechas con el foco en ningún control (`useIdleMenuKeys`); teclas como ayuda con su verbo («[INTRO] Jugar», «En tu estudio», «[1]–[5] Votar») y su lectura | `fix(0.26)` |
| 10 | **Autenticación**: lockup sin «by» ni cinta, la pegatina huérfana a 390, logo pequeño en una tarjeta (juego · media; marca · baja) | Composición de la pantalla de título: el logo grande con el mismo lockup del menú (`TitleLockup`, en una fila) a la izquierda y el panel opaco a la derecha | `fix(0.26)` |
| 11 | **Texto sobre los rayos** en `/entrar` (título y sello) y en toda la galería (accesibilidad · media y baja) | En `/entrar` el título va en la placa del HUD y el sello en el panel; la galería va sin rayos (`handle.screen.rays: false`) | `fix(0.26)` |
| 12 | **Galería a 390 px**: el contenedor medía 495 px y se cortaban 301 textos; tabla de contraste aplastada y región desplazable sin teclado (axe); pestañas con Q y E sueltas; índice con enlaces de 34–41 px (juego · media; marca, accesibilidad · baja) | Rejillas `minmax(0, 1fr)` con `min-width: 0`; tabla en clave y valor por debajo de 720 px; pestañas en una fila que se desplaza; índice en chips de chaflán de 44 × 44 px; la ficha llena su celda | `fix(0.25)` |
| 13 | **Marca del umbral** «45 s» partida en dos líneas sobre las barras (juego · media) | Rótulo en una línea encima de la pista, sobre `--bb-panel-veil`, y el filete sobresale por arriba (como `03-jurado`) | `fix(0.25)` |
| 14 | Tarjeta del calendario vacío flotando a 120 px de la barra (juego · baja) | Anclada al pie de su columna en los dos estados | `fix(0.24)` |
| 15 | 404 con titular de web «PÁGINA NO ENCONTRADA» y pad pequeño (juego · baja) | Titular «BONUS STAGE» con «Te has perdido… pero ya que estás» de subtítulo (la pestaña dice «Página no encontrada»); pad en la cuña con teclas `--bb-cut-md` de 72 px y «Volver al menú [Esc]» debajo | `fix(0.26)` |
| 16 | Retrato de la ficha con las esquinas recortadas abiertas (juego · baja) | La portada se recorta con el mismo chaflán, metido lo que la separa del borde | `fix(0.25)` |
| 17 | Onda del escenario casi plana (juego · baja) | Picos de muestra con la lógica de `final.js` (`waveData` + detalle, misma semilla que la maqueta) | `fix(0.24)` |
| 18 | Foco del título de la fila que tapa el subtítulo (juego · baja; accesibilidad · baja) | El enlace a la ficha abarca título y subtítulo: el foco genérico rodea los dos | `fix(0.25)` |
| 19 | Fila de entrada parecida a la lista del sello (portada redonda + play suelto) y posición en rojo liso (marca · baja) | Portada en chaflán `--bb-cut-sm` con el play dentro; posición en blanco con `--bb-shadow-hard-sm` (como `05-perfil`) | `fix(0.25)` |
| 20 | «+40 XP» con el «+» de Anybody como un punto (juego · baja) | La cifra con su signo en Oxanium rojo (§3.4.2) | `fix(0.25)` |
| 21 | Cifras de las medallas a 6–8 px (accesibilidad · baja) | Fuera la cifra: platino y diamante se distinguen por la galleta (blanca / granate con filete) y por su nombre; el puesto va escrito al lado | `fix(0.25)` |
| 22 | «AVISO · Avísame del próximo drop» en móvil, con cara de botón que no hace nada (accesibilidad · baja) | La etiqueta dice «PRONTO» | `fix(0.24)` |
| 23 | Falta la pantalla de título `00-titulo` (juego · baja) | Aplazado: nueva tarea **1.13** del plan 01 | — |
| 24 | Cuña con más granate que las maquetas (24–28 % frente a 14–20 %) (marca · baja) | En parte: las interiores llevan su pieza encima de la cuña. Medido con el mismo criterio en las capturas de la 0.27 y en las finales (píxeles granate, r 25–110 con g < 0,45 r y b < 0,6 r): «Cómo se juega» 27,6 → 16,9 %, 404 27,3 → 23,0 %, menú 22,3 → 21,0 % (maqueta `01-menu`: 21,6 %; `02-seleccion`: 24,5 %; `05-perfil`: 13,7 %). Resto, descartado (ver abajo) | `fix(0.26)` |

### Descartado o aplazado, con su motivo

- **Pantalla de título `00-titulo` completa** (grupo 23): es la puerta de entrada de §3.8.1, que
  necesita el desbloqueo del `AudioContext`, el sonido `ui.enter` y el vinilo-sol al BPM: se planifica
  como la tarea **1.13** del plan 01 (depende de la 1.4), con su variante sin movimiento.
- **Líneas de barrido en la cuña estática** (grupo 24): §3.2 las apaga «en móvil, en calidad baja y en
  modo serio», y la arena estática es la calidad «Apagada» del Escenario (§3.5); llegan con él en la
  Fase 1 (1.1–1.2). La densidad de la trama de las interiores se mantiene: la pieza ya tapa buena parte
  de la cuña.
- **«HECHO» en los movimientos completados** (grupo 9): necesita saber qué ha hecho el jugador, y las
  cuentas llegan en la Fase 2 (la guía §3.8.14 lo dice así).
- **Etiqueta 1P en una ventana estrecha con teclado** (grupo 5): a menos de 720 px no cabe a la
  izquierda de la placa; queda el anillo del cursor, como en la maqueta móvil. La tecla `[INTRO]` sí se
  ve con puntero fino.
- **`aria-describedby` con el motivo de la deshabilitada** (grupo 1): el motivo ya forma parte del nombre
  de la opción (es su contenido) y ahora se ve entero; repetirlo en la descripción se leería dos veces.
- **Fondo de la autenticación con cuña o vinilo-sol** (grupo 10): la marca lo propone «cuando se haga la
  pantalla de verdad»; queda para la Fase 2 (formularios de `/entrar` y `/registro`).

### Verificación

- **Calidad**: `pnpm check` (Biome, `lint:tokens` con 202 ficheros sin literales ni piezas prohibidas,
  pureza de `packages/rules`), `pnpm typecheck`, `pnpm test` (web 347, server 144, rules 178, shared
  37, más audio, covers y emails), `pnpm build` (con la prueba de humo de la API empaquetada) y
  `pnpm e2e` **155/155** (proyectos `e2e` y `perf`, puertos propios 5392/3392/5393) en verde.
- **E2E nuevos o endurecidos**: `fit.spec.ts` (ninguna placa elegida corta etiqueta, dato o tecla a
  1440, 390 y 320 px; ningún antepasado recorta las tildes en display del menú, la home y la galería;
  ninguna hoja de texto de la galería sale de la ventana a 390), `brand.spec.ts` (firma de la barra
  `toBeInViewport()` a 390×844 en `/`, `/como-funciona`, la 404, `/ajustes/cuenta` y `/legal/bases`),
  `keyboard.spec.ts` («Cómo se juega» se recorre como un menú de juego: flechas, Inicio, B, Esc,
  Intro) y la 404 con su titular nuevo.
- **Mirado**: capturas con `node tools/shot/shot.mjs` (Chrome del sistema) a 1440×900 y 390×844 de la
  home, `/dev/menu` (también con «Resultados» y «Salón de la fama» elegidas), `/como-funciona`,
  `/entrar`, la 404 y la galería, comparadas con `01-menu-*`, `00-titulo`, `02-seleccion` y `05-perfil`
  (en [`app/`](app/), PNG reducidos a 256 colores). Además, a mano: 360×640, 375×667, 320×568 y
  720×450 (el menú cabe sin desplazar en 390×844, 375×667 y 360×640, como en la 0.24).

## Segundo pase y rondas de arreglos (2026-10-04)

El segundo pase se hizo sobre el estado de después del primero, con las mismas tres lentes. La lente de
accesibilidad se cortó por el límite de uso de la sesión y se repitió al reanudar.

| Lente | Veredicto | Discrepancias (alta · media · baja) |
|---|---|---|
| **Juego** | ✅ Pasa | 0 · 2 · 6 |
| **Marca** | ✅ Pasa | 0 · 1 · 3 |
| **Accesibilidad** | ❌ No pasa | 0 · 4 · 3 |

Medias: la autenticación no llegaba a la composición de pantalla de título (la mitad de abajo vacía);
«Cómo se juega» con la columna derecha a media altura; la pegatina del lockup pisaba el logo a 360×640 y
375×667; Q/E con los atajos de una tecla apagados solo cambiaban de sección una vez; el vinilo-sol y los
respiros no tenían forma de pararse (WCAG 2.2.2); el conmutador «SÍ | NO» sin estado en contraste alto; y
las placas del menú desbordando a 320×568.

Cada ronda fue igual: líneas de ficheros disjuntas en *worktrees* (construir → revisión independiente →
corrección), integración con todas las puertas y un pase del jurado. Las dos primeras rondas destaparon
algo que la especificación no fijaba: **el jurado oscilaba** (un pase pedía «llenar el alto hasta la barra»
y el siguiente criticaba las «cajas estiradas y huecas»; uno miraba solo las maquetas y el siguiente,
ventanas reales de portátil y tableta). Desde la tercera, **las reglas se escribieron primero en la guía**
y el jurado juzgó contra ellas.

| Ronda | Qué arregló | Commits | Pase del jurado después |
|---|---|---|---|
| 1 | Las 12 discrepancias de juego y marca (cinco líneas) y las 7 de accesibilidad (Q/E con el foco en las pestañas, pestañas con flechas, pausa de todos los bucles, contraste alto del conmutador, reflow a 320×568, espaciado de 1.4.12 en la cinta y los chips) y una composición intermedia de 721 a ~1200 px | 22 (`fdd644e..4600e8d`) | Juego ❌ (2 medias nuevas: el 1P pisaba el logo de 900 a 1060 px y el menú no cabía en la ventana de un portátil, 1366×657), marca sin resultado, accesibilidad ✅ |
| 2 | Menú con la ventana baja de escritorio, el 1P en el hueco entre columnas, interiores hasta la barra, Opciones con su rótulo y las pestañas antes, legales con [Q]/[E] a los lados, flechas visibles en contraste alto, barra con las teclas en su fila y despegada pasado el 15 %, rayos fuera del HUD, galería sin el título repetido, fila de entrada de 44 px, medidor y anunciador en contraste alto | 36 (`4600e8d..1ceac8e`) | Las tres ❌ con más tamaños de ventana (13 medias). → **Guía v0.6.6**: reparto del alto de las interiores, ventana baja y grande del menú, barra y firma, crónica con «reducir movimiento» |
| 3 | La v0.6.6: escala de la ventana grande, tableta vertical, interiores centradas con filas densas, legales con la plantilla, compactación de las interiores por altura, teclas a `--bar-gap` de la firma, fila de la firma siempre pegada, HUD sin pliegue con teclado, crónica que rota sin fundido, fila de entrada que parte | 41 (`ee15c09..335da15`) | Las tres ❌ contra la v0.6.6 (12 medias, varias de una misma causa). → **Guía v0.6.7**: 320×568 se desplaza, «ELIGE MODO» antes que la tarjeta con teclado en estrecho, cursor apagado con el foco en otro control, pestañas opacas |
| 4 | La v0.6.7: pegatina sobre el logo en `/entrar`, 404 en el móvil bajo, granate de Opciones a 320, barra al 15 % en cualquier ventana, anunciador con la etiqueta roja, tableta escalada, crónica en `voting`, cursor apagado | 25 (`2f72123..bf49327`) | Marca ✅; juego y accesibilidad ❌ (2 medias: la barra despegada asomaba cortada y el ajuste del texto no seguía al espaciado de 1.4.12 aplicado tarde); el integrador vio además una etiqueta cortada a 360×640 con teclado |
| 5 | Esas tres y los bajos baratos (centrado de una columna, título de móvil, pestañas legales con teclado, rayos del marco simple, cuña desde 1200 px) | 12 (`bf49327..994cb5b`) | Juego ✅, marca ✅, accesibilidad ❌ por una **regresión de esta ronda** (la placa apilada crecía en el móvil táctil y el menú dejaba de caber a 360×640) y la tecla fuera de la placa a 320×568 con 1.4.12 |
| 6 | La regresión, la tecla, el móvil bajo hasta 780 px de alto (414×736 y 412×780 caben), un E2E inestable, la crónica centrada con 1.4.12, 6–7 px de desborde sin contenido y el relleno de la tarjeta plegada | 7 (`994cb5b..d88a9e2`) | **Verificación independiente ✅** (los 7 confirmados) |

Además, tres commits de documentación y uno de tokens: `04dbb8e` (guía v0.6.6), `ee15c09` (el corte de la
diagonal como token compartido), `2f72123` (guía v0.6.7) y `8d803c3` (guía v0.6.8, con las desviaciones
que fueron saliendo en las rondas 4 a 6).

### Verificación final

- **Jurado**: tras la ronda 5, juego ✅ y marca ✅ (paleta medida dentro del triángulo; granate de la cuña
  dentro de los techos de la guía en el menú, Opciones, «Cómo se juega» y la 404; firma entera al abrir
  cada pantalla); tras la ronda 6, la verificación independiente de accesibilidad y del menú en todos sus
  estados, con cada placa elegida y en una docena de tamaños de ventana, ✅.
- **Puertas** sobre `d88a9e2`: `pnpm check` (Biome, `lint:tokens` con 203 ficheros sin literales ni piezas
  prohibidas, pureza de `packages/rules`), `pnpm typecheck`, `pnpm test` (web 411, server 144, rules 178,
  shared 37, covers 5, audio 1, emails 1), `pnpm build` (con la prueba de humo de la API empaquetada) y
  `pnpm e2e` **980/980** (proyectos `e2e` y `perf`; eran 155 al acabar el primer pase). En la CI de
  GitHub (PR #2, run `37224071537`), lo mismo: 980/980, con la CI ya en el Chromium completo de Playwright.
- **Tamaños de ventana que vigilan los E2E** (además de 1440×900 y 390×844): 1920×1080, 1536×730,
  1440×789, 1366×657, 1280×720, 1024×768, 900×700, 823×514 (1440 al 175 %), 820×1180 y 768×1024
  táctiles, 720×450 (200 %), 414×736, 412×780, 375×667, 360×640 y 320×568, con teclado y en táctil, con
  «reducir movimiento», modo serio, contraste alto y el espaciado de WCAG 1.4.12 (también aplicado con la
  página ya cargada).

### Aplazado o abierto, con su motivo

- **Móviles de 781 a ~840 px de alto** (360×800, 375×812, 393×786, 412×800): la composición de móvil con
  todos los datos todavía no cabe y se desplaza 35–94 px (las placas 05–06 quedan bajo la barra al abrir;
  la enfocada siempre se ve). Ya pasaba antes de estas rondas (de 701 a 840). **Decisión del usuario**:
  subir el móvil bajo hasta ~840 px (cabe todo, pero deja una franja vacía de ~180 px de cuña a 375×812) o
  diseñar un paso intermedio (logo en una línea con la tarjeta sin plegar).
- **Motivo de una placa deshabilitada con el espaciado de 1.4.12** en el móvil («Sin beats que votar» en
  tres líneas pisa el marco de la placa elegida en el estado de calendario vacío): se lee, ya pasaba antes;
  se arregla cuando la placa deshabilitada pueda crecer con su motivo (al construir el Modo Jurado, Fase 5).
- **Tarjeta de la semana a 1024×768**: con teclado o en táctil, el reto y «23 en la batalla» quedan bajo
  la barra al abrir (se llega desplazando); la guía no pide que quepa en la composición intermedia.
- **Provisionales «EN OBRAS»** (`/subir`, `/jurado`, `/semanas`…): por debajo de 1200 px y en móvil su
  cuña lleva más granate que las maquetas (hasta el 38 % en una columna). Se sustituyen por sus pantallas
  de verdad en las fases 3 a 6.
- **Rayos de las interiores en una columna** con la cuña abajo: salen de su punto fijo, no de la pieza
  (los paneles opacos los tapan casi del todo). Regla escrita así en la v0.6.8.
- Siguen aplazados los del primer pase: la pantalla de título `00-titulo` (→ 1.13), las líneas de barrido
  de la cuña (→ Escenario, Fase 1), «HECHO» en los movimientos y los formularios reales de la
  autenticación (→ Fase 2), el pad funcional de la 404 (→ Fase 8) y los textos legales (→ Fase 10).

## Capturas finales (`app/`)

Capturas del estado final (`d88a9e2`) con `node tools/shot/shot.mjs` y «reducir movimiento», reducidas a
256 colores (sustituyen a las del primer pase).

| Captura | Qué enseña |
|---|---|
| `dev-menu-1440x900.png`, `dev-menu-390x844.png` | El menú con la semana 41 de las maquetas, frente a `01-menu-1440x900` y `01-menu-390x844` |
| `dev-menu-1366x657.png`, `dev-menu-1920x1080.png` | Escritorio con ventana baja (un portátil de 1366×768) y ventana grande: cabe sin desplazar y escala |
| `dev-menu-820x1180.png`, `dev-menu-360x640.png` | Tableta vertical (apilada y escalada) y móvil bajo táctil |
| `dev-menu-resultados-1440x900.png`, `dev-menu-salon-1440x900.png` | Placas elegidas con dato y etiqueta enteros, `[INTRO]` dentro del corte |
| `home-1440x900.png`, `home-390x844.png` | Calendario vacío (la home real de ahora) |
| `como-funciona-*.png`, `ajustes-*.png`, `404-*.png` | Interiores de poco contenido: bloque centrado, filas densas, pieza en la cuña |
| `entrar-*.png`, `legal-1440x900.png` | Autenticación como pantalla de título y legales con la plantilla de interiores |
| `galeria-390x844.png` | La galería a 390 px |
