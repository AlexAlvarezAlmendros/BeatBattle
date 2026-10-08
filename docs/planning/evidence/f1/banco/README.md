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
