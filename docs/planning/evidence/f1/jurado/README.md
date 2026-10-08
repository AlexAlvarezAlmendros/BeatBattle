# Acta del jurado visual de la Fase 1 (tarea 1.12)

> **Fecha:** 2026-10-08 · **Rama:** `feat/1.12-go-no-go` · **Guía:** v0.6.18 → **v0.6.19** ·
> **Requisito:** `RD-VIS-02` (e), la arena en WebGL frente al fondo estático, y la pantalla de título (1.13),
> que no había pasado por ningún jurado.
>
> **Resultado:** marca ✅ y juego ✅ al primer pase; accesibilidad ❌ con un hallazgo alto, corregido y
> verificado con un E2E nuevo. Todas las altas y medias están corregidas; quedan dos bajas aplazadas con su
> motivo.

## Qué miró el jurado

Tres jurados independientes, uno por lente, con las capturas de esta carpeta (Chrome del sistema con la GPU
real, calidad alta) frente a las maquetas aprobadas de `../../f0/arena/` y al acta de la Fase 0:

- Pares `*-webgl.png` / `*-estatica.png` (`bb:stage` = `on` con calidad alta, frente a `off`): `menu-1440`,
  `menu-390` (táctil), `como-1440`, `semana-1440`, `jurado-1440`.
- La pantalla de título: `titulo-1440`, `titulo-390`, `titulo-arranque-1440`, `titulo-sin-movimiento-1440`.
- El Escenario con el vinilo y 4.000 partículas: `escenario-particulas-1440` (`/dev/escenario?banco`).

Las capturas de la pantalla de título son las de después de los arreglos, con `titulo-1024x768` y
`titulo-1280x720` añadidas para el hallazgo alto.

## Veredictos

| Lente | Veredicto | Alta · media · baja |
|---|---|---|
| **Marca** (paleta, firma, «Lo que nunca se imita», §1.3) | ✅ Pasa | 0 · 1 · 1 |
| **Juego** (fidelidad a las maquetas, menú de recreativa) | ✅ Pasa | 0 · 1 · 4 |
| **Accesibilidad** (WCAG 2.2 AA, `RD-VIS-05`, teclado, sin movimiento) | ❌ No pasa | 1 · 1 · 3 |

**La arena en WebGL frente a la estática** (`RD-VIS-02` e) pasa en las tres lentes. Comparadas píxel a píxel,
las diferencias de más de 15 a 24 niveles son del 0,00 al 0,3 % de la ventana. Salen solo en el borde de los
puntos, en los segundos del reloj y en el giro del vinilo: la trama del *shader* reproduce la estática punto
por punto, sin costuras ni cambios de densidad. Ninguna lente encontró texto nuevo sobre la trama en WebGL,
piezas del sello imitadas ni nada que destaque una entrada.

**La paleta con la arena en *shader*** (`RD-VIS-02` a, test nuevo en `brand.spec.ts`): **0,000 %** de
píxeles fuera del triángulo negro–rojo–blanco y del 75 al 93 % de negro en las seis pantallas medidas, con la
GPU y con WebGL por software (el camino de la CI). Con el vinilo y 4.000 partículas en movimiento, también
0 % fuera y un 92 % de negro en seis capturas seguidas.

## Hallazgos y lo que se hizo

| # | Hallazgo (lente · gravedad) | Qué se hizo | Verificación |
|---|---|---|---|
| 1 | **El cartel EN JUEGO tapa la columna del título entre 961 y ~1280 px** (un iPad apaisado, un portátil de 1280–1440 con zoom del 125 %): a 1024 × 768, «Entrar sin sonido» queda debajo del cartel, Tab enfoca un control invisible y un toque ahí entra **con** sonido; a 1280 × 720 la diagonal corta el botón (accesibilidad · alta) | Medido dónde chocan las piezas (la columna acaba hacia los 760 px; el campeón, hacia los 700; el cartel empieza en el ancho − 500): **una columna por debajo de 1280 px** (antes, 960), con el logo como mucho de 880 px. El pie de la diagonal nunca entra en la columna (`max(53 %, 790 px)`) | E2E nuevo `RD-VIS-05 / WCAG 2.4.11` en `title.spec.ts`, con `elementFromPoint` en el centro y las esquinas de cada pieza, a 1024 × 768, 1100 × 800, 1280 × 720, 1280 × 800, 1366 × 768, 1440 × 900 y 1920 × 1080: fallaba a 1024 y 1100, ahora pasa en todas. Capturas `titulo-1024x768` y `titulo-1280x720` |
| 2 | **Nada visual puede reaccionar a una entrada sin sellar** (marca · media). La reactividad (§3.5) lee todo el bus de música: en el Modo Jurado, una entrada con más graves haría latir más la arena, y §1.3 pide el mismo tratamiento hasta el sellado. La guía no lo decía. Hoy no se ve (el Jurado está «en obras»), pero sin una guarda llegaría así a la Fase 5 | Nuevo **`RD-MOT-06`** (§3.5, §3.8.7). `attachElement(el, { blind })` obliga a decir si la fuente es ciega. Con una fuente ciega sonando, el motor no da el analizador y la trama queda en reposo, igual para todas las entradas | `engine.test.ts`: dos tests `RD-MOT-06` |
| 3 | **Texto sobre los rayos** en la pantalla de título: «PULSA PARA EMPEZAR», la pista, «Entrar sin sonido» y «PRESENTA» (accesibilidad · media; es el mismo caso que el n.º 11 del acta de la Fase 0) | La fila «PRESENTA», el botón y la pista van sobre `--bb-scrim`, como ya iba el campeón | Capturas `titulo-1440`, `titulo-1280x720` |
| 4 | **El cartel EN JUEGO no es el de la maqueta**: el reloj pequeño en línea, sin los días L–D y con el «41» sin rojo (juego · media) | Variante `bill` de `RoundClock`: «CIERRE DE ENVÍOS» encima del reloj de 28 px, las entradas a la derecha y la barra de la semana con L–D debajo (`RoundClockWeek`). El número de la semana va en rojo | `titulo-1440` frente a `00-titulo-1440x900` |
| 5 | «CRÉDITO 01» en mayúsculas; la maqueta y el n.º 7 del acta de la Fase 0 piden caja mixta (juego · baja) | «Crédito 01» en Oxanium y en caja mixta | `titulo-1440` |
| 6 | La captura del arranque enseñaba el título ya montado (juego y marca · baja) | Rehecha a los 350 ms: «[OTP.] PRESENTA» sobre negro | `titulo-arranque-1440` |
| 7 | La pegatina OTP. es pequeña: en la fila «PRESENTA» frente a la maqueta, y en el arranque (juego · baja) | La de «PRESENTA» pasa a 64 px, como la maqueta (44 en móvil; tamaño `presents` de `OtpSlap`). **Aplazado** el arranque: la imagen de la pegatina se genera a 120 px en 1× y 240 en 2×, y a 200 px se vería borrosa en una pantalla de dpr 2. Hay que generarla a 4× (`tools/brand/otp-slap.mjs`) | `titulo-1440` |
| 8 | La galleta del disco pinta «92 BPM · RE MENOR» a 5,5 px en el disco de la columna (accesibilidad · baja) | `discTextSizes`: ninguna línea por debajo de 12 px. Es decorativa y la repiten los chips | `TitleDisc.test.ts` (`RD-VIS-05`) |
| 9 | El botón entero respira, y con él el cursor de foco, que baja al 55 % (accesibilidad · baja; `RNF-A11Y-01`) | Respira el texto (`startText`), no el botón | `titulo-1440`: marco blanco con el texto en su punto bajo |
| 10 | M cambia el sonido aunque los atajos de una tecla estén apagados (accesibilidad · baja; `RNF-A11Y-08`) | Con los atajos apagados, M no hace nada y S entra como cualquier tecla | `TitleGate.test.tsx` (`RNF-A11Y-08`) |
| 11 | El texto del panel «RÁFAGAS» de `/dev/escenario` llega al borde (juego · baja) | **Aplazado**: es una página de desarrollo, no una pantalla del juego | — |

## Lo que se comprobó y está bien

- Contraste de «PULSA PARA EMPEZAR» en el punto más bajo de la respiración: ~6,2:1, texto grande.
- Pista a 12 px. Las partículas van en la capa del Escenario, por debajo del contenido, y solo las lanza
  `flash.request()`.
- Sin movimiento, la puerta aparece montada, el disco está quieto y nada respira. Con teclado, Tab queda
  dentro de la puerta y el foco empieza en «PULSA PARA EMPEZAR». El diálogo tiene nombre y descripción. En
  contraste alto (`forced-colors`) se lee bien.
- La firma *OTP.* se ve en todas las capturas: el lockup del título y del menú (104 px a 1440, 62 a 390), la
  barra de controles en las interiores y «[OTP.] PRESENTA» en el arranque.

## Pendiente conocido (no es hallazgo)

La extrusión del logo capa a capa (registrada en la 1.13, Anexo E).
