# Banco de rendimiento y latencia (tarea 1.11, `RNF-PERF-03`, `RD-SND-05`)

Medido el 2026-10-07 en el portátil del proyecto (iGPU AMD Renoir, Linux, Chrome por Vulkan) con el
servidor de desarrollo. **Android: emulado, evidencia parcial** (decisión del usuario: no hay dispositivo
real). La emulación frena la CPU ×4 y usa la pantalla y la densidad de un Android de gama media, pero la GPU
sigue siendo la del portátil; el peor caso de GPU se aproxima con WebGL por software (SwiftShader).

## FPS del Escenario (`tools/shot/bench.mjs`, 8 s)

`/dev/escenario?banco`: la arena en *shader*, el vinilo-sol girando como vista anclada y el anillo de
partículas lleno (4.000 vivas en alta, 1.500 en media). `fps` es el ritmo de la página
(`requestAnimationFrame`); `stageFps`, los fotogramas que pinta el Escenario.

| Caso | Ventana | Calidad | fps | p99 | Fotogramas > 33 ms | stageFps | Llamadas de dibujo | Partículas |
|---|---|---|---|---|---|---|---|---|
| Escritorio | 1440 × 900, dpr 1 | alta (a mano) | 60 | 16,8 ms | 0 | 60,1 | 3 | 4.000 |
| Escritorio | 1440 × 900, dpr 2 | alta (a mano) | 60 | 16,8 ms | 0 | 60,1 | 3 | 4.000 |
| Escritorio, menú quieto (`/dev/menu`) | 1440 × 900, dpr 2 | alta (a mano) | 60 | 16,8 ms | 0 | 0 (no pinta: nada se mueve) | 0 | — |
| Android emulado (CPU ×4) | 390 × 844, dpr 2,625 | la de la sonda → **alta** | 60 | 16,8 ms | 0 | 60,1 | 3 | 4.000 |
| Android emulado (CPU ×4) | 390 × 844, dpr 2,625 | alta (a mano) | 60 | 16,8 ms | 0 | 60,1 | 3 | 4.000 |
| Android emulado, GPU por software | 390 × 844, dpr 2,625 | la de la sonda → **apagada** | 60 | 16,8 ms | 0 | 0 (arena estática) | 0 | — |
| Android emulado, GPU por software | 390 × 844, dpr 2,625 | media (a mano) | 24,8 | 66,6 ms | 95 | 24,9 | 3 | 1.500 |
| Android emulado, GPU por software | 390 × 844, dpr 2,625 | alta (a mano) | 7,2 | 266,7 ms | 55 | 7,3 | 3 | 4.000 |

Lectura:

- **Escritorio con GPU integrada: 60 fps** con todo a la vez (hito de la Fase 1), sin fotogramas largos y con
  3 llamadas de dibujo (presupuesto: < 120).
- **Android emulado: 60 fps.** Las partículas se mueven en el *shader* y la arena es un único pase, así que
  frenar la CPU no le afecta; lo que decidiría en un móvil real es su GPU, que esta emulación no reproduce.
- **Con una GPU muy lenta** (software), la sonda de 2 s apaga el Escenario y la página sigue a 60 fps con
  la arena estática. Forzar la calidad alta ahí da 7 fps: justo el caso del que protege la sonda. Con la
  media daría 25, y la sonda elegiría la baja (también estática).
- **Pendiente:** un Android real de gama media para cerrar `RNF-PERF-03` (≥ 45 fps con calidad automática).

## Latencia de los efectos (`tools/shot/latency.mjs`, con ventana y la salida de audio real)

Del evento (`event.timeStamp`) a que el motor programa `ui.press`, más `AudioContext.baseLatency` y
`AudioContext.outputLatency`. Mediana (p95) de 20–34 clics.

| Contexto | Evento → `play` | Latencia base | Latencia de salida (sistema) | Total |
|---|---|---|---|---|
| `latencyHint: 'interactive'` (antes) | 0,6 ms (8,3) | 10,7 ms | 24 ms (40) | **35,5 ms** (59,0) |
| `latencyHint: 0` (ahora, con puntero fino) | 0,9–1,0 ms (13,9–20,5) | **2,7 ms** | 40 ms (48) | 44,4–51,0 ms |

Lectura:

- La parte de la app (del evento al bloque de audio) es de **~4 ms** con `latencyHint: 0`; con
  `interactive` eran ~11.
- La **latencia de salida del sistema** (PipeWire en este Linux) va de **24 a 48 ms** según el momento: es
  el *quantum* que negocian todas las aplicaciones de audio abiertas, y la app no la controla. Con ella,
  **`RD-SND-05` (< 30 ms en escritorio) no se cumple en esta máquina**. Falta medir en macOS y Windows, cuya
  salida suele ser de ~10 ms.
- Sin ventana (*headless*) la salida es falsa y los tiempos no valen: no se usan.

## Comparación de `latencyHint` y criterio nuevo (tarea 1.12, 2026-10-08)

Decisión del usuario: **la mínima latencia posible**, con `RD-SND-05` reformulado (guía v0.6.19): la parte
de la app < 10 ms de mediana (p95 < 15 ms) y la salida del sistema medida aparte. La medida de la 1.11
comparaba `interactive` y `0` en momentos distintos, y PipeWire había cambiado de salida entre una y otra
(24 → 40 ms): por eso `0` parecía peor en el total. Ahora `latency.mjs --hint=` fuerza el `latencyHint` y
se intercalan las opciones, cuatro rondas de 25 clics cada una (`latencia-hints.jsonl`):

| `latencyHint` | Latencia base | Salida (mediana, p95) | Total (mediana) |
|---|---|---|---|
| **`0`** (el del motor con puntero fino) | **2,7 ms** | 24 ms (40); 40 ms (48) en la ronda 4 | **27,3 ms** en 3 de 4 rondas; 43,4 en la 4 |
| `0.005` | 10,7 ms | 24 ms (40) | 35,2–35,5 ms |
| `0.01` | 10,7 ms | 24 ms (40) | 35,2 ms |
| `interactive` | 10,7 ms | 24 ms (40) | 35,3 ms |
| `balanced` | 10,0 ms | 24–32 ms (40–48) | 34,6–42,7 ms |

Lectura:

- `latencyHint: 0` es la mejor opción: le quita 8 ms a la base y la salida es la misma con todas. Con
  PipeWire a 24 ms, el total es de **27 ms**.
- La salida la decide PipeWire (*quantum* de 1024 a 48 kHz por defecto, entre 32 y 2048 según las demás
  aplicaciones): pasa de 24 a 40 ms sin que la app cambie nada. En el portátil de pruebas se puede bajar
  con `pw-metadata -n settings 0 clock.force-quantum 256`, pero eso es del sistema, no de la app.
- Con el criterio nuevo (`appMs`, tres medidas de 30 clics con el motor tal cual): mediana **3,3–3,5 ms**
  y p95 de 4,1–4,4 ms (10,1 ms en una ronda con tres agentes del jurado usando la CPU a la vez). Cumple.
- El motor ya estaba en el mínimo de su parte: efectos en `currentTime` sin esperas, `ui.press` con ataque
  de 1 ms y el contexto nunca suspendido (`engine.test.ts`, `RD-SND-05`).

## 1080p y peor fotograma (criterio 1 del GO, tarea 1.12)

El criterio 1 del plan pide ≥ 60 fps y un peor fotograma < 25 ms a 1080p. `bench.mjs` a 1920 × 1080, con
calidad alta y ventana (10 s por medida; `slow` dice en qué segundo cae cada fotograma de más de 20 ms):

| Página | Medidas | fps | p99 | Peor fotograma |
|---|---|---|---|---|
| `/dev/escenario?banco` (arena, vinilo y 4.000 partículas), dpr 1 | 12 | 59,7–60 | 16,8 ms | 24,1–44,2 ms |
| `/dev/escenario?banco`, dpr 2 | 1 | 60 | 16,8 ms | 16,8 ms |
| `/dev/escenario` (arena y vinilo, sin ráfagas) | 4 | 59,7–59,9 | 16,8 ms | 33,3–43,7 ms |
| `/dev/menu` quieto (el Escenario no pinta) | 3 | 59,9–60 | 16,8 ms | 16,8–33,4 ms |

Lectura:

- El fotograma lento es **uno suelto, a un segundo cualquiera** (1,2 s, 4,3 s, 5 s, 7 s…), seguido de dos de
  ~25 ms que recuperan el ritmo. Sale también **con el menú quieto**, sin el Escenario pintando, y sin
  partículas.
- Una traza de Chrome (`devtools.timeline`, `v8.gc`, `gpu`; 48.240 eventos) durante una medida con un
  fotograma de 27 ms: la tarea más larga del hilo principal de la página es de **1,7 ms**; en la GPU, 1,4 ms;
  en el navegador, 2,7 ms. Ninguna recogida de basura pasa de 0,7 ms. Lo que se pierde no es trabajo de
  Chrome: es el vsync del compositor del sistema (Wayland).
- **Cumple en lo que depende de la app:** 60 fps, p99 de 16,8 ms y tareas de 2 ms como mucho. El peor
  fotograma de > 25 ms lo pone el sistema cada pocos segundos, también con la página quieta.
