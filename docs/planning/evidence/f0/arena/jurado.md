# Acta del jurado visual de la Arena (tarea 0.28)

> **Fecha:** 2026-10-03 · **Rama:** `feat/f0-fundaciones` · **Guía:** v0.6.4 · **Requisito:**
> `RD-VIS-02` (e), prueba de marca y de juego con un jurado de tres lentes (guía §3.10).

El jurado miró la app real (`/`, `/dev/menu`, `/como-funciona`, `/entrar`, la 404, `/dev/galeria`) a
1440×900 y 390×844 (y, la lente de accesibilidad, también a 360×640, 320×568 y 720×450, el 200 % de
1440×900) frente a las maquetas aprobadas de esta carpeta (`01-menu-*`, `00-titulo`, `02-seleccion`,
`03-jurado`, `05-perfil`). Este documento recoge sus veredictos, cómo se agruparon las discrepancias,
qué se corrigió (con su commit y cómo se verificó) y qué se descartó o aplazó, con su motivo.

## Veredictos

| Lente | Veredicto | Discrepancias (alta · media · baja) |
|---|---|---|
| **Juego** (fidelidad a las maquetas y aspecto de menú de recreativa) | ❌ No pasa | 2 · 5 · 10 |
| **Marca** (paleta, firma *OTP.*, nada de «Lo que nunca se imita») | ✅ Pasa | 0 · 2 · 5 |
| **Accesibilidad** (WCAG 2.2 AA, `RD-VIS-05`, teclado, táctil) | ❌ No pasa | 0 · 7 · 8 |

Ninguna lente encontró piezas del sello imitadas (isla, hero en contorno, marquee, orbes, cristal,
Montserrat), textos prohibidos de §3.9 ni fugas del voto ciego (§1.3): ninguna entrada destacada, sin
retratos, sin números de orden ni medias o recuentos antes del sellado.

## Discrepancias agrupadas y lo que se hizo

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

## Descartado o aplazado, con su motivo

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

## Verificación

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

## Capturas finales (`app/`)

| Captura | Qué enseña |
|---|---|
| `dev-menu-1440x900.png`, `dev-menu-390x844.png` | El menú con la semana 41 de las maquetas: «GRÀCIA» con su tilde, la onda con sus silencios, «ELIGE MODO» sobre su franja, «1 MIN» a 390 |
| `dev-menu-resultados-1440x900.png`, `dev-menu-salon-1440x900.png` | La placa elegida que antes se cortaba: dato entero, `[INTRO]` dentro del corte, trama al final |
| `home-1440x900.png`, `home-390x844.png` | Calendario vacío: motivos enteros, tarjeta anclada al pie, «PRONTO» |
| `como-funciona-1440x900.png`, `como-funciona-390x844.png` | La lista de movimientos en la cuña con el cursor y la barra pegada con la firma |
| `entrar-1440x900.png`, `entrar-390x844.png` | La autenticación como pantalla de título con el lockup |
| `404-1440x900.png`, `404-390x844.png` | «BONUS STAGE» con el pad en la cuña |
| `galeria-390x844.png` | La galería a 390 sin desbordes (primera pantalla) |

## Pendiente

- La revisión adversarial (accesibilidad AA y rendimiento) y el README al día, que completan la 0.28.
- Volver a pasar el jurado sobre el estado nuevo (este acta recoge el primer pase y sus arreglos,
  verificados con E2E y capturas, no un segundo veredicto del jurado).
