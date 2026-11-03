# Tarea 7.34 · Accesibilidad y rendimiento de la capa de juego

Guía v0.6.147 (§3.10, §4.17) · `RNF-A11Y-03..05`, `RNF-A11Y-07`, `RD-MOT-04`, `RNF-PERF-01`, `RNF-PERF-03`,
`RNF-PERF-04` · 2026-11-03, Chrome del sistema con la GPU real (AMD Radeon, RADV RENOIR, Vulkan), 1440 × 900.

## Trozos (`vite build` y `pnpm budget`)

| Trozo | Antes (`main`, 5bb6a12) | Después | Presupuesto |
|---|---|---|---|
| Escenario (`Stage`) | 941,61 kB · **253,47 kB gz** | 767,83 kB · **208,20 kB gz** | < 250 kB gz ✅ |
| Pase de la carta (`PassView`, con Rapier) | 856,42 kB gz | 856,42 kB gz | sin presupuesto propio; diferido ✅ |
| JS inicial (entrada + importaciones estáticas, gzip de Node) | 211,70 kB gz | 211,78 kB gz | < 200 ⚠ (pendiente de la F10) |
| 1.ª pintura de la home (todo lo que precarga `index.html`) | 289,46 kB gz | 289,56 kB gz | < 200 ⚠ (pendiente de la F10) |

Las dos primeras cifras son las de `vite build`; las del JS inicial y la 1.ª pintura, las de `pnpm budget`
(`tools/lint/check-bundle.mjs`, `zlib` nivel 9: ~1 % por debajo de `vite build`; el Escenario de `main` da 250,62 kB
con `zlib` y 253,47 con `vite build`).

- **Por qué se pasaba el Escenario**: el `<Canvas>` de R3F hace `extend(THREE)`: registra el espacio de nombres entero
  de three y el empaquetador no puede quitar nada (three entraba casi entero: 150 kB gz). `StageCanvas`
  (`apps/web/src/stage/StageCanvas.tsx`) hace lo mismo que `Canvas` con `createRoot` y registra solo las diez piezas
  que el Escenario pinta en JSX (`stage/catalogue.ts`; `catalogue.test.ts` lee el código del Escenario y falla si falta
  o sobra alguna). three baja a 111 kB gz y salen `react-use-measure` y casi todo `its-fine`. Mismo lienzo único
  (`[data-stage] canvas`, uno), mismas vistas (vinilo, pase, ceremonia) y la primera pintura igual: el trozo sigue
  pidiéndose después de ella (E2E `stage.spec.ts`, `RNF-PERF-04`; `pnpm budget` comprueba además que ni `Stage` ni
  `PassView` se precargan en `index.html` ni los importa la entrada).
- **El JS inicial y la 1.ª pintura** ya se pasaban antes de la Fase 7: 201,36 y 277,99 kB gz en f4504fe (el plan 07
  recién mezclado); la F7 les suma ~10 y ~12. Pesan los textos de `es.json` (28 kB gz en el JS inicial) y Motion
  (41 kB gz en la 1.ª pintura de la home, por la `Modal` que la home importa). No es de esta tarea: `pnpm budget` lo
  avisa sin fallar y su arreglo es de la auditoría de rendimiento de la Fase 10 (guía §4.17). Se nota en el LCP: el
  proyecto `perf` (`home.perf.ts`, 4G lento y CPU ×4) da en local **3,0 s** de mediana (FCP = LCP, el texto del menú),
  por encima de los 2,5 s que exige fuera de la CI, **igual en `main`** (3,04 / 2,99 / 3,01 s frente a 3,04 / 3,00 /
  3,01 s con esta rama; carga 3–4,5). La CI no exige ese número (lo deja anotado); también para la F10.

Mirado con `StageCanvas` en el servidor de desarrollo y en la build: la arena en la home y en el banco, el vinilo de la
vista anclada (`/dev/escenario`), el pase arrastrado en el perfil (`pase-stagecanvas-arrastre-1440x900.png`) y la
ceremonia de resultados en 3D con sus luces y peanas (`ceremonia-resultados-stagecanvas-1440x900.png`), sin errores
de consola.

## El primer giro de la carta (perfil `/p/prod01`, build de producción)

Traza de Chrome (`Tracing` y `long-animation-frame`) alrededor del primer C y del segundo:

| | Calidad alta (con el pase) | Calidad apagada (plana) |
|---|---|---|
| Antes | 2–3 tareas de 52–74 ms en cada pasada (tres pasadas): maquetación de **todo el documento** de 51–67 ms con 15–17 objetos sucios de ~840, forzada desde el `requestAnimationFrame` del Escenario (la `View` de drei mide su ancla) | 2 tareas de 55–69 ms (la maquetación, igual) |
| Después | ninguna tarea larga del giro | ninguna tarea larga del giro |

- **La causa**: la caja de la carta (`.card`: `display: grid` con `aspect-ratio`, `container-type: inline-size`, unidades
  `cqi` dentro y la fila `auto`) obligaba a medir las dos caras una y otra vez: cualquier maquetación de la página
  costaba 60–100 ms (quitando la carta, 0,7 ms; quitando `container-type` o con la celda fija, ~1 ms). Con
  `grid-template: minmax(0, 1fr) / minmax(0, 1fr)` la caja es la misma (377 × 509 px en el perfil, 312 × 436 y 352 × 492
  en el banco) y las capturas antes y después, idénticas píxel a píxel (`/dev/carta` a 1440 y 390, el perfil a 1440 y
  390 y el reverso).
- **Lo que queda**: en un navegador recién abierto, la **primera tecla** de la página (sea C u otra) crea el
  `AudioContext` (`RD-SND-01`: el audio se desbloquea en el primer gesto) y Chrome tarda ~43 ms en el constructor la
  primera vez que arranca su servicio de audio (después, 3 ms). Si el primer gesto es C, sale una tarea de 55–66 ms;
  con cualquier gesto antes, el primer giro no tiene ninguna. Es del navegador y del desbloqueo, no de la carta; para la
  auditoría de INP de la Fase 10.

Banco con el primer giro dentro de la medida (`tools/shot/bench.mjs`, 10 s; el audio desbloqueado antes con una tecla,
C al segundo y desde los 3 s cada 250 ms):

| Pasada | Antes (`main`) | Después |
|---|---|---|
| 1 | 58,8 fps · peor 100 ms · 3 fotogramas largos (83, 67 y 100 ms, a 1,1–1,3 s) | 60 fps · peor 16,8 ms · ninguno |
| 2 | 58,7 fps · peor 99,9 ms · 3 (100, 83 y 83 ms) | 60 fps · peor 16,8 ms · ninguno |
| 3 | 58,8 fps · peor 100 ms · 3 (100, 83 y 67 ms) | 60 fps · peor 16,8 ms · ninguno |

Carga de la máquina (media de 1 min) durante estas pasadas: 1,5–2,3. La otra sesión había pasado E2E antes (la media de
15 min seguía en 13–14); con la máquina cargada (3,5–5,9) el resultado era el mismo: antes, 3 fotogramas de 100–167 ms;
después, ninguno o uno de 33 ms.

Las trazas, con la carga a 0,8–2,3: antes, 2–3 tareas de 52–74 ms en cada una de tres pasadas con el pase y 2 de
55–69 ms en dos pasadas con la calidad apagada; después, ninguna con el audio ya desbloqueado (tres pasadas) y, sin
desbloquear, solo la del `AudioContext` en la primera pasada del navegador.

## FPS del perfil con la carta (`RNF-PERF-03`)

`node tools/shot/bench.mjs http://localhost:5681/p/prod01 10 --w=1440 --h=900 --quality=alta`, build de producción
(`vite preview`) contra la API sembrada con `seedBattle … season`, la carta girándose con C cada 250 ms (anima sin
parar: giro, vaivén y cinta) tras un giro de calentamiento:

| Caso | fps | p99 | peor | fotogramas largos | llamadas de dibujo | carga |
|---|---|---|---|---|---|---|
| dpr 1, `/p/prod01` (campeona) | 60 | 16,8 ms | 16,8 ms | 0 | 19 | 2,3 → 2,0 |
| dpr 2, `/p/prod01` | 60 | 16,8 ms | 16,8 ms | 0 | 19 | 2,0 → 1,7 |
| dpr 2, `/p/prod02` (holo, con su lámina) | 60 | 16,8 ms | 16,8 ms | 0 | 19 | 1,7 → 2,6 |
| Antes (`main`), dpr 1, `/p/prod01` | 60 | 16,8 ms | 16,8 ms | 0 | 19 | 2,6 → 2,1 |

Carga: media de 1 min al empezar y al acabar cada banco. `RNF-PERF-03` (60 en escritorio) se cumple; el banco de la
7.23 daba lo mismo.

## Destellos (`RNF-A11Y-04`, `RD-MOT-04`)

`tools/shot/flashes.mjs` (ampliado con `--clip`, `--eval` y `--repetir`) sobre `/dev/recompensas` con calidad alta, a
16–20 capturas por segundo (10 la ventana entera): luminancia relativa media de la zona en cada captura y pares de
cambios opuestos de ≥ 0,1 en la peor ventana de 1 s (WCAG 2.3.1).

| Medida | Zona | Oscilación | Destellos por segundo |
|---|---|---|---|
| Subida de nivel | la placa (40, 90, 440 × 160) | 0,061 | **0** |
| Logro legendario con sus chispas | el centro (520, 250, 400 × 400) | 0,038 | **0** |
| Logro legendario | la ventana entera | 0,025 | **0** |
| Legendario lanzado cada 300 ms durante 8 s | el centro | 0,038 | **0** |
| Subida de nivel y cuatro logros a la vez | la columna de avisos (40, 90, 440 × 560) | 0,038 | **0** |
| Referencia (nada) | la placa | 0 | 0 |

Las chispas del legendario salen (14 rombos, alcance 197 px, opacidad 0,4: lo que autoriza el limitador;
`destellos-legendario-chispas-1440x900.png`) y son pequeñas: no mueven la luminancia de ninguna zona. Lo que cambia es
la placa y el velo al entrar y al irse: un cambio de < 0,07, lejos del 0,1 de un destello. Muestras en
`destellos-*.json`.

## El recorrido sin espectáculo (§3.10)

Con la calidad apagada, sin sonido (`bb:sound` = `off`), con «reducir movimiento» y en modo serio a la vez (E2E nuevo
`tests/e2e/game-quiet.spec.ts`, 4 pruebas en verde):

- **HUD, «+XP» y avisos** (`/dev/recompensas`): el «+5 XP» sale y el medidor sube 5; el legendario dice su nombre, su
  condición, «Legendario» y «+300 XP», sin chispas ni anunciador; la subida de nivel, «Subes al nivel N» sin estampa;
  cuatro logros a la vez, tres placas (el cuarto espera su turno); ninguna animación mueve nada ni pasa de 200 ms, ningún
  bucle; axe sin violaciones con los avisos a la vista; y cada mensaje, una vez, en la región viva.
- **Perfil**: la carta plana, sin hueco del pase y sin pedir su trozo; nombre, nivel y cifras; C la gira con un fundido;
  el reverso con el QR y la dirección pasa axe (el anverso ya lo pasaba en `game-pages.spec.ts`).
- **Salón de la fama y temporada**: sus datos, sin bucles ni movimiento.
- **Ceremonia del campeón** (siembra `season`, `tools/shot/season-ceremony-f7.mjs` con `apagada`, `reducido` y `serio`):
  placa, carta y cifras con todo su texto (`sin-espectaculo-ceremonia-campeona-serio-1440x900.png`); axe sin
  violaciones (WCAG 2.2 AA) a la campeona, a la campeona sin espectáculo y a otro productor, y su región viva dice
  quién es y sus cifras.
- **El legendario sin espectáculo**: `sin-espectaculo-legendario-1440x900.png`.

**Arreglado**:

1. **La región viva de las recompensas solo decía el último mensaje** cuando salían varios a la vez (dos placas y la
   subida de nivel: tres `say` en el mismo instante cambiaban el mismo nodo). Ahora es un registro (`role="log"`,
   `aria-live="polite"`, `aria-relevant="additions"`, `aria-atomic="false"`): cada mensaje es un nodo nuevo, en su orden,
   y guarda los cuatro últimos. Test `RewardsViewport.test.tsx` (3, `RNF-A11Y-07`) y el E2E de arriba.
2. **Avisos que se quedaban debajo de la ceremonia del campeón**: lo que `me` trae sin ver salía en cuanto llegaba la
   sesión (2,2 s), antes de que la ceremonia (2,7 s) retuviera los avisos; las placas se quedaban debajo de la capa, se
   iban solas a los 4 s y ya estaban marcadas vistas: no las veía nadie. Ahora una capa a pantalla completa que llega
   con avisos a la vista los devuelve a la cola, delante, y salen al cerrarse sin volver a decirse ni a marcarse vistos
   (`hudStore.hold`). Test en `hudStore.test.ts` y mirado con la siembra: ningún aviso mientras dura la ceremonia y los
   tres salen después.

**Sin verificar con lector real.** Las regiones vivas (recompensas, ceremonia del campeón, avisos del marco, reloj)
están comprobadas con Testing Library y Playwright (existen vacías desde el principio, su `aria-live`, su texto, una vez
y en orden), no oídas con NVDA, VoiceOver ni Orca. Orca está instalado en esta máquina, pero arrancarlo toma el
escritorio del usuario (habla y captura teclas): queda para la auditoría de accesibilidad de la Fase 10.
