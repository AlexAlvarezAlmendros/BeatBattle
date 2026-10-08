# Plan 01 — Spike de sensación y audio (GO/NO-GO)

> Fase: 1 de 10 | Estado: 🔄 En curso | Iniciado: 2026-10-05 | Cerrado: —
> Hito del roadmap: arena (trama en *shader*) + vista 3D + partículas a 60 fps en escritorio con GPU
> integrada y ≥ 45 fps en un Android de gama media; efectos con < 30 ms de latencia; analizador de Web
> Audio funcionando sobre un MP3 firmado de Cloudinary; ffmpeg mide la sonoridad de un WAV de 50 MB en
> Vercel en < 8 s. **Puerta GO/NO-GO** para empezar la Fase 2.
>
> **Replanificado para la dirección «Arena» (guía v0.6, 2026-10-03).** El Escenario pinta la arena (§3.5:
> cuña granate con trama en *shader*, diagonal y rayos; la reactividad al audio solo cambia el tamaño de
> punto), las estrellas duermen con un medidor (§3.8.4) y todo destello pasa por el limitador
> (`RD-MOT-04`). La referencia visual son las maquetas de `docs/planning/evidence/f0/arena/`.

Valida las dos apuestas que pueden tumbar el proyecto: que la capa de juego (Escenario, partículas y
sonido) **se sienta bien y vaya fluida en un móvil normal**, y que **Cloudinary + Web Audio +
ffmpeg** permitan escuchar con analizador e igualación de sonoridad. El código del spike se escribe
ya dentro del monorepo (`apps/web/src/stage`, `apps/web/src/audio`, `packages/audio`,
`apps/server/src/storage`) para reutilizarlo, no para tirarlo.

---

## Dependencia con otras fases

- **Requiere:** 0.1 (scaffold), 0.4 (tokens) y, para el Escenario, la arena estática y los tokens de la Arena (0.22–0.23).
- **Habilita:** Fase 2 y, con ella, todo lo demás.

---

## Tareas

### Escenario

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.1 | Canvas R3F único detrás del contenido (`eventSource` en `body`) con la **capa 0 de la arena** (§3.5): fondo negro, cuña granate con **trama roja en *shader***, diagonal roja con filete blanco, estallido de rayos, número de semana en contorno y viñeta, con la posición de la cuña por pantalla; el `ArenaBackdrop` estático de la 0.23 como alternativa y *placeholder* mientras carga el trozo. La pantalla tiene que verse igual con la arena en WebGL que con el fondo estático | ✅ Hecho | 0.1, 0.4, 0.23 | §3.5 · `RNF-PERF-04` · Guía v0.6.9 («Reparto de la capa 0»): el *shader* (`stage/shaders/arenaHalftone.frag.glsl`) pinta solo la trama; cuña, diagonal, rayos, número y viñeta siguen en CSS y la geometría la pone el CSS, que el Escenario lee de sondas en el borde de la cuña. Un solo lienzo de R3F (`stage/Stage.tsx`) en un trozo diferido tras la primera pintura (243,8 kB gz, presupuesto < 250), bajo demanda y al dpr del dispositivo hasta 2 (0,75 se veía borroso en densidad 2). Puerta: sin WebGL, con «reducir movimiento» o ahorro de datos, la arena estática; `bb:stage` para pruebas. Verificado: la matemática del *shader* en TS (`arenaMath.ts`) contra `halftoneDots` (26 tests, 4.000 píxeles al azar por forma y tamaño); E2E `stage.spec.ts` (`RNF-PERF-04`: el trozo se pide después del FCP; `RD-VIS-02 e`: con y sin Escenario cambia < 0,5 % de píxeles en el menú, el menú móvil, «Cómo se juega» y Opciones a 320 px; medido 0,02–0,05 % con GPU y 0,21 % en el Chromium de la CI; sin Escenario con «reducir movimiento» y con `bb:stage=off`; lienzo único que sobrevive a la navegación); capturas a densidad 1 y 2 miradas; `e2e` 986 + `perf` en verde en local; la CI lleva SwiftShader para probar WebGL |
| 1.2 | Sonda de rendimiento de 2 s y niveles de calidad (alta, media, baja, apagada), con `prefers-reduced-motion`, sin WebGL y ahorro de datos → apagada; pausa con `visibilitychange` | ✅ Hecho | 1.1 | §3.5 · `RNF-PERF-05`, `RNF-A11Y-03`. `stage/quality.ts` (umbrales y mediana con tests unitarios), sonda en el bucle del lienzo, calidad a mano en `bb:quality`; E2E de la sonda, la pausa con la pestaña oculta y las calidades baja y media |
| 1.3 | Vista anclada (`View` de drei) con el **vinilo-sol** de la semana (gira una vuelta por compás al BPM) **en la arena abierta** + sistema de partículas (chispas rojas y blancas, confeti en la paleta) con presupuesto por nivel y **siempre a través del limitador de destellos** (`flash.request`) | ✅ Hecho | 1.1 | §3.5, §4.7.5, §4.17 · `RD-MOT-04`. Banco `/dev/escenario`. **Cambio de alcance (guía v0.6.12):** no va «pegado a la tarjeta del escenario»: la tarjeta es opaca y el lienzo va detrás del contenido y bajo los rayos, así que ahí el vinilo sigue siendo DOM; la pantalla de título tampoco la usa: va por encima del lienzo (1.13). Relevo con el vinilo del DOM: 0 % de píxeles distintos; 60 fps a dpr 2 con la arena, el vinilo y 4.000 partículas (iGPU AMD); trozo del Escenario 249,1 kB gz |

### Audio en el cliente

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.4 | Motor de audio: `AudioContext` en la primera interacción (puerta mínima; la puerta completa es la 1.13), buses (música, efectos, ambiente), compresor y limitador, síntesis de `SfxDef` (modelo de Orchard) y los efectos `ui.enter`, `ui.hover`, `ui.press`, `star.hover.1–5`, `star.vote.1–5`, `vote.locked`, `xp.gain`, `level.up` | ✅ Hecho | 0.1 | §3.7 · Anexo D · `RD-SND-01..03` · Efectos como datos en `packages/audio` (`sfx.ts`, con nivel y duración del Anexo D por efecto; `theory.ts`, pentatónica de la tonalidad, por defecto La menor). Motor en `apps/web/src/audio`: ruido con semilla, síntesis de capas, mezcla con *ducking* (−6 efectos, −18 ambiente), compresor y limitador, efectos al 50 %, `ui.hover` ≤ 8/s, silencio con M. `useAudioUnlock` crea el contexto en el primer gesto. Banco de escucha en `/dev/galeria#sonido`. Verificado: Vitest del catálogo (9, `RD-SND-04` con fast-check); E2E `audio.spec.ts` (`RD-SND-01`: sin gesto no hay contexto y el primero lo pone en marcha; `RD-SND-02`: los 16 efectos renderizados *offline* a su nivel ±2 dB —medidos a ±1— y dentro de su duración; `RD-SND-03`: −6,0 y −18,0 dB; la galería suena sin errores), también en modo CI; WAV de los 16 efectos por la mezcla completa para escucharlos |
| 1.5 | Estrellas completas (§3.8.4): **dormidas con su medidor de escucha y el motivo** (no con anillo), despertar con un barrido y «¡VOTO LISTO!», hover sonoro en pentatónica, voto con *hit-stop*, aplastado, chispas y vibración, confirmación en texto y región viva, variante sin movimiento y modo serio; grupo de radio con 1–5. Con su bloque en la galería y su fila de la matriz de estados de §3.3 | ✅ Hecho | 1.3, 1.4 | `RD-SND-04`, `RNF-A11Y-06`, `RF-VOTE-10`, `RD-VIS-03` (las Estrellas son el único componente de §3.3 que falta en la galería de la Fase 0) · `ui/Stars` con su bloque y su fila de la matriz en la galería; `vote.unlocked` en el catálogo; 11 pruebas de componente y una E2E del recorrido con teclado |
| 1.6 | Reactividad: analizador (FFT 1024) → bandas y RMS suavizados → **tamaño de punto de la trama** de la arena (≤ 15 %, paso bajo ≤ 2 Hz), **nunca** la luminancia del rojo ni el brillo de un área grande; medición de luminancia y de destellos con un beat a 160 BPM | ✅ Hecho | 1.1, 1.4 | §3.5 · `RNF-A11Y-04`, `RD-MOT-04` · Analizador en el bus de música, `createReactivity` (`@beatbattle/audio`), escala 1–1,15 a 30 fps; banco `/dev/escenario?vinilo=no` con el ritmo de prueba. Medido con píxeles reales a 160 BPM: 0 destellos por segundo, oscilación 0,0006 (`evidence/f1/reactividad/`) |
| 1.13 | Puerta de entrada completa (§3.8.1; maqueta `00-titulo`): arranque «[OTP.] PRESENTA», logo que cae con su extrusión y el lockup, vinilo-sol de la semana partido por la diagonal y girando al BPM, «◀ PULSA PARA EMPEZAR ▶» que respira con «Entrar sin sonido [S]», campeón vigente y cartel EN JUEGO; al pulsar, `AudioContext`, `ui.enter` y la diagonal que abre el menú. Saltable, con su variante sin movimiento y desactivable en Opciones; no aparece en autenticación, admin ni legales | ✅ Hecho | 1.4 | §3.8.1 · `RD-SND-01`, `RD-MOT-01`, `RD-MOT-03` · Sale del jurado visual de la Arena (0.28, `docs/planning/evidence/f0/arena/jurado.md`): la home entra directa al menú y falta el momento de «inserta moneda» · `TitleGate` en el menú (primera vez en la sesión; `bb:title` = `off` la apaga), disco `TitleDisc` en 2D, columna sin diagonal en ≤ 960 px; 9 pruebas de componente y 7 E2E (flujo, sin sonido, axe, sin desbordes a 1440, 390 y 320). **Pendiente:** la extrusión del logo capa a capa (entra entero con el golpe) |

### Audio en la nube ⚠️ crea recursos externos: pedir confirmación antes

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.7 | Cloudinary (cuenta propia de BeatBattle); subida **firmada por trozos** de un WAV de prueba desde el navegador como `authenticated` con `eager` `f_mp3,br_192k`; entregar el derivado con URL firmada; reproducirlo con `crossOrigin="anonymous"` + `MediaElementSource` + analizador. Verificar: CORS de `res.cloudinary.com`, que el original sin firma da 401, que `br_192k` aplica al audio y el tiempo del `eager` | ✅ Hecho | 1.4, cuenta (propia, decidida el 2026-10-07) | §4.8 · `RF-STO-01`, `RF-STO-02` · Página `/dev/escucha`. WAV de 4 min (40,4 MB): 7 trozos en 10,9 s; derivado listo 6,8 s después; original sin firma, **404** (no 401: no revela que existe; guía corregida); derivado firmado con CORS `*` y 192 kb/s; escucha con analizador (`evidence/f1/cloudinary/`) |
| 1.8 | ffmpeg en Vercel: función de prueba con `ffmpeg-static` que lee un WAV de 50 MB de Cloudinary por URL firmada y calcula sonoridad integrada (`ebur128`), pico real y forma de onda de 1000 bins. Medir tamaño de la función, arranque en frío y tiempo total. **GO si cabe y tarda < 8 s**; si no, plan B (§4.8.4) | ⬜ Listo | 1.7 | §4.8.4 · `RF-STO-04` |

### Análisis local

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.9 | Port a TS de `audioEngine`, `tempoEngine`, `keyEngine`, `dsp`, `musicTheory` y `engineConfig` del sello en `packages/audio`, con su worker; la batería `validate-audio-engine.mjs` + `synth-tracks.mjs` pasa como tests de Vitest con las mismas tolerancias | ✅ Hecho | 0.1 | §4.6 · `RF-ENT-06` · `packages/audio/src/analysis/` (entrada aparte, `@beatbattle/audio/analysis`, para no cargar el DSP fuera del worker), worker y cliente en `apps/web/src/audio/analysis/` (decodifica, remuestrea a 22 050 Hz con `OfflineAudioContext`, analiza en el worker y cae al hilo principal si falla). Verificado: la batería del sello en Vitest (`analysis.test.ts`: 14 casos + ruido + silencio y clip corto, mismas tolerancias, 17/17 en ~33 s); **paridad exacta** con el motor original en JS (`origin/main` del sello) en las 15 pistas: mismos BPM, confianzas, alternativa, tonalidad, modo y afinación; E2E `analysis.spec.ts`: un WAV de House 128 en Fa menor da 128 y Fa menor por el camino completo con worker, e idéntico sin él (también en modo CI) |
| 1.10 | Forma de onda (1000 bins mín/máx `Int8`), sonoridad aproximada (filtro K) y «momento más enérgico» en `packages/audio`, con tests contra señales sintéticas | ✅ Hecho | 1.9 | §4.6 · `packages/audio/src/measure.ts`: `waveform()` (pares `[mín, máx]` intercalados en ±127, el formato de `Waveform` tras `waveformPeaks()`), `approximateLoudness()` (BS.1770: filtro K para cualquier frecuencia de muestreo, bloques de 400 ms al 75 %, puertas de −70 LUFS y −10 LU) y `mostEnergeticMoment()` (ventana de 6 s). Verificado: `measure.test.ts` (11): coeficientes del filtro K de la norma a 48 kHz; un seno de 1 kHz de amplitud A mide 20·log10(A) − 3,01 LUFS ±0,2 a 48, 44,1 y 22,05 kHz; la puerta deja fuera el silencio; la onda sigue la envolvente y recorta; el golpe de 6 s se encuentra en su sitio |

### Medición y decisión

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.11 | Banco: `tools/shot/bench.mjs` en escritorio (GPU integrada AMD del portátil) con la arena en *shader* + vinilo-sol + 4.000 partículas; en Android de gama media (dispositivo real del usuario o, si no hay, emulación con limitación de CPU, dejándolo marcado como evidencia parcial). Latencia de efectos medida | ✅ Hecho | 1.3, 1.5, 1.6 | §4.17 · `RNF-PERF-03`, `RD-SND-05` · Escritorio: 60 fps a dpr 1 y 2 con todo (3 llamadas de dibujo). **Android emulado** (CPU ×4, 390 × 844, dpr 2,625; decisión del usuario, evidencia parcial): 60 fps; con GPU por software, la sonda apaga el Escenario. Latencia: la app, ~4 ms (`latencyHint: 0`); la salida de PipeWire, 24–48 ms: **`RD-SND-05` sin cumplir en Linux**, abierto para el GO/NO-GO (`evidence/f1/banco/`) |
| 1.12 | Informe GO/NO-GO en este plan con evidencia (capturas, GIF y números en `docs/planning/evidence/f1/`); desviaciones llevadas a la guía con registro de cambios; decisión anotada en el roadmap | 🔒 Bloqueado | 1.7, 1.8, 1.10, 1.11 | — · Incluye un pase del **jurado visual** de la arena con el Escenario WebGL frente al fondo estático (`RD-VIS-02` e) y el test de paleta de `RD-VIS-02` a con la arena en *shader* |

---

## Entregable

Una página de prueba (`/dev/spike`) con la arena reactiva a un beat alojado en Cloudinary, un vinilo
3D anclado, estrellas completas con sonido y partículas, el selector de calidad y los números del
banco; más la función de medición de sonoridad desplegada en una *preview*.

## Criterio de aceptación (GO)

1. ≥ 60 fps de media y peor fotograma < 25 ms en escritorio con GPU integrada a 1080p.
2. ≥ 45 fps en Android de gama media con la calidad automática.
3. Latencia de efecto desde el clic < 30 ms en escritorio.
4. El analizador recibe datos (no silencio) de un MP3 firmado de Cloudinary.
5. El original sin firma no se puede descargar.
6. ffmpeg cabe en la función y mide un WAV de 50 MB en < 8 s **o** el plan B queda especificado en la
   guía con su criterio.
7. El motor de análisis portado pasa la batería del sello.
8. Ningún destello de más de 3 por segundo con un beat a 160 BPM.

**NO-GO** en 1 o 2 → se rebajan los presupuestos de §3.5 (menos capas, sin vistas 3D en móvil) y se
repite el banco antes de seguir. **NO-GO** en 4 o 5 → se replantea el almacenamiento (§4.2).

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-07 | 1.7 | **Hecha.** Cuenta propia de BeatBattle (decisión del usuario). Subida firmada por trozos de 6 MB directo a Cloudinary como `authenticated` con `eager` `f_mp3,br_192k`, entrega con URL firmada del derivado y escucha por el bus de música con analizador. Con un WAV de 4 min: 7 trozos en 10,9 s y el MP3 listo 6,8 s después, a 192 kb/s y con CORS. El original sin firma da 404 y no 401: `RF-STO-02` corregido en la guía. Recursos de prueba borrados. La 1.8 pasa a lista. |
| 2026-10-07 | 1.13 | **Hecha, con un pendiente.** Pantalla de título como la maqueta `00-titulo`: arranque «[OTP.] PRESENTA» saltable, logo que cae, *lockup*, disco de la semana en trama cortado por la diagonal y girando al BPM, «PULSA PARA EMPEZAR» que respira, «Entrar sin sonido [S]», campeón vigente y cartel EN JUEGO; al pulsar, `AudioContext`, `ui.enter` y la diagonal que se abre. Mirada en el navegador a 1440 × 900 y 390 × 844. Pendiente: la extrusión del logo capa a capa. Las pruebas (Vitest y Playwright) la apagan por configuración. |
| 2026-10-07 | 1.11 | **Hecha, con evidencia parcial.** `bench.mjs` mide también los fotogramas del Escenario (`stageFps`), la densidad, la calidad y la GPU por software; `latency.mjs`, nuevo, mide la latencia de un efecto desde el clic. Escritorio y Android emulado a 60 fps con la arena, el vinilo y 4.000 partículas; con una GPU por software, la sonda apaga el Escenario y la página sigue a 60. El contexto de audio pide `latencyHint: 0` con puntero fino (base de 10,7 a 2,7 ms), pero la salida de PipeWire (24–48 ms) deja la latencia total en 35–51 ms: `RD-SND-05` no se cumple en esta máquina y queda como decisión abierta. Falta un Android real. |
| 2026-10-07 | 1.5 | **Hecha.** Estrellas como grupo de radio de juego: dormidas con su medidor y el motivo, despertar con barrido y `vote.unlocked` (nuevo en el catálogo, medido a −16 dB ±2), hover con su nota, voto con *hit-stop* de 70 ms, aplastado, nota, chispas del DOM por el limitador (el 5: 20 chispas al 40 %, vibración y temblor) y confirmación en texto y región viva; cambio de voto sin celebración; «guardando» y error con vuelta atrás. Galería: los 8 estados y una celda interactiva. Mirado en el navegador. La 1.11 pasa a lista. |
| 2026-10-07 | 1.6 | **Hecha.** La trama de la cuña reacciona al bus de música: energía de 40–160 Hz, puerta, paso bajo de 2 Hz y tamaño de punto de 1 a 1,15, a 30 fps (el Escenario pinta a los fps del animador más exigente). Con el ritmo de prueba a 160 BPM la escala va de 1,02 a 1,10; medido con píxeles reales, 0 destellos por segundo y la luminancia de la cuña oscila 0,0006 (la referencia sin ritmo, 0). E2E con la GPU y con SwiftShader. Trozo del Escenario: 249,8 kB gz, sin margen. |
| 2026-10-06 | 1.3 | **Hecha.** Vistas ancladas con drei `View` en el lienzo único (pase de pintado propio con prioridad 1 y vistas con prioridad 2; drei deja el *viewport* de la última vista y hay que restaurarlo) y partículas en un anillo de `Points` movido por *shader*, con presupuesto por calidad y radio y opacidad del limitador. El vinilo de la vista se ve igual que el del DOM (0 %, los dos pintados por CPU: por GPU, la textura llegaba vacía). Con `advance()` a 60 fps como mucho mientras algo se mueve: 60 fps a dpr 2 con 4.000 partículas en la iGPU AMD. La vista va en la arena abierta, no en la tarjeta (guía v0.6.12). La 1.5 pasa a lista. |
| 2026-10-06 | 1.2 | **Hecha.** Sonda de 2 s con la mediana de los fotogramas (umbrales 50/35/20 fps), guardada para la sesión; la calidad elegida a mano manda. Media = trama a dpr 1, baja = arena estática. Con la pestaña oculta el lienzo no dibuja (`frameloop` en `never`), comprobado contando fotogramas. En la iGPU AMD de la máquina la sonda mide 59,9 fps → alta; con la calidad media, lienzo a dpr 1 en un dispositivo de dpr 2; con la baja, sin lienzo (capturas en `evidence/f1/calidad/`). Las pruebas fijan `bb:quality=alta` en la configuración para no pagar la sonda en cada una (guía v0.6.10). |
| 2026-10-06 | 1.10 | **Hecha.** Onda, sonoridad aproximada (BS.1770) y momento más enérgico en `packages/audio`, probados con señales sintéticas. |
| 2026-10-05 | 1.9 | **Hecha.** Motor de análisis del sello portado a TypeScript estricto sin cambiar la lógica: la batería pasa con sus tolerancias y los resultados son idénticos a los del original en JS. Worker y cliente en la web. 1.10 pasa a lista. |
| 2026-10-05 | 1.4 | **Hecha.** Motor de audio y los 16 efectos de la tarea, calibrados midiendo su render *offline* (`ui.hover` salía 25 dB por debajo por su paso banda de Q 8; `star.vote.1–4` y `vote.locked`, 3 dB; `level.up`, 2 dB por encima). 1.13 pasa a lista y, con la 1.1 ya en `main`, también la 1.6; 1.5 espera a la 1.3. |
| 2026-10-05 | 1.1 | **Hecha.** Arena en *shader* idéntica a la estática (guía v0.6.9: el *shader* pinta solo la trama y la geometría la pone el CSS). Dos hallazgos al mirarla: el punto «dentro de la cuña» quedaba por encima de la diagonal en Opciones a 320 px (la trama salía del lado contrario) y el dpr 0,75 del Silk emborronaba los puntos en pantallas de densidad 2. Las pruebas con reloj falso van sin Escenario (`installClockWithoutStage`). 1.2 y 1.3 pasan a listas. |
| 2026-10-03 | — | Replanificado para la dirección «Arena»: 1.1 (arena en *shader* en lugar del Silk; depende también de la 0.23), 1.3 (vinilo-sol y limitador), 1.5 (estrellas con medidor), 1.6 (reactividad sobre el tamaño de punto), 1.11 y 1.12 (jurado visual en lugar de la prueba del sello). |
| 2026-10-03 | 1.13 | Nueva tarea, del jurado visual de la Arena (0.28): la puerta de entrada completa con la pantalla de título `00-titulo` (§3.8.1). La 1.4 se queda con la puerta mínima (el desbloqueo del `AudioContext`). |
| 2026-10-02 | 1.5 | Revisión adversarial de la Fase 0 (sdd-2): la 1.5 cierra también `RD-VIS-03` (Estrellas en la galería con sus estados). |
| 2026-10-02 | — | Plan creado. |
