# Plan 01 — Spike de sensación y audio (GO/NO-GO)

> Fase: 1 de 10 | Estado: ⬜ Pendiente | Iniciado: — | Cerrado: —
> Hito del roadmap: arena (trama en *shader*) + vista 3D + partículas a 60 fps en escritorio con GPU
> integrada y ≥ 45 fps en un Android de gama media; efectos con < 30 ms de latencia; analizador de Web
> Audio funcionando sobre un MP3 firmado de Cloudinary; ffmpeg mide la sonoridad de un WAV de 50 MB en
> Vercel en < 8 s. **Puerta GO/NO-GO** para empezar la Fase 2.
>
> **Pendiente de replanificar (guía v0.6, 2026-10-03).** La dirección de arte «Arena» sustituye el Silk
> del sello por la arena (§3.5: cuña granate con trama en *shader*, diagonal y rayos; la reactividad al
> audio solo cambia el tamaño de punto) y cambia las estrellas (§3.8.4: dormidas con medidor, no con
> anillo) y el limitador de destellos (`RD-MOT-04`). Las tareas 1.1, 1.3, 1.5, 1.6, 1.11 y 1.12, que
> citan el Silk, los orbes o la prueba del sello, se reescriben antes de empezar la fase; la referencia
> visual son las maquetas de `docs/planning/evidence/f0/arena/`.

Valida las dos apuestas que pueden tumbar el proyecto: que la capa de juego (Escenario, partículas y
sonido) **se sienta bien y vaya fluida en un móvil normal**, y que **Cloudinary + Web Audio +
ffmpeg** permitan escuchar con analizador e igualación de sonoridad. El código del spike se escribe
ya dentro del monorepo (`apps/web/src/stage`, `apps/web/src/audio`, `packages/audio`,
`apps/server/src/storage`) para reutilizarlo, no para tirarlo.

---

## Dependencia con otras fases

- **Requiere:** 0.1 (scaffold) y 0.4 (tokens).
- **Habilita:** Fase 2 y, con ella, todo lo demás.

---

## Tareas

### Escenario

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.1 | Canvas R3F único detrás del contenido (`eventSource` en `body`) con la capa Silk portada de `ReactOtpWeb/frontend/src/components/SilkBackground` (mismos parámetros: `#4A0D1C`, velocidad 2,5, escala 1,1, ruido 1,2, 30 fps, dpr 0,75) y los orbes CSS como respaldo y como *placeholder* mientras carga el trozo | ⬜ Listo | 0.1, 0.4 | §3.5 · `RNF-PERF-04` |
| 1.2 | Sonda de rendimiento de 2 s y niveles de calidad (alta, media, baja, apagada), con `prefers-reduced-motion`, sin WebGL y ahorro de datos → apagada; pausa con `visibilitychange` | 🔒 Bloqueado | 1.1 | §3.5 · `RNF-PERF-05`, `RNF-A11Y-03` |
| 1.3 | Vista anclada (`View` de drei) con un vinilo 3D provisional pegado a un elemento del DOM + sistema de partículas (chispas y confeti) con presupuesto por nivel | 🔒 Bloqueado | 1.1 | §3.5, §4.17 |

### Audio en el cliente

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.4 | Motor de audio: `AudioContext` en la primera interacción (puerta mínima; la puerta completa es la 1.13), buses (música, efectos, ambiente), compresor y limitador, síntesis de `SfxDef` (modelo de Orchard) y los efectos `ui.enter`, `ui.hover`, `ui.press`, `star.hover.1–5`, `star.vote.1–5`, `vote.locked`, `xp.gain`, `level.up` | ⬜ Listo | 0.1 | §3.7 · Anexo D · `RD-SND-01..03` |
| 1.5 | Componente de estrellas completo (§3.8.4): dormidas con anillo, despertar, hover sonoro en pentatónica, voto con *squish*, chispas, vibración y variante sin movimiento; accesible como grupo de radio. Con su bloque en la galería (`/dev/galeria`) y sus estados de §3.3 en la matriz de la galería (`ui/gallery/stateMatrix.ts`) | 🔒 Bloqueado | 1.3, 1.4 | `RD-SND-04`, `RNF-A11Y-06`, `RF-VOTE-10`, `RD-VIS-03` (las Estrellas son el único componente de §3.3 que falta en la galería de la Fase 0) |
| 1.6 | Reactividad: analizador (FFT 1024) → bandas y RMS suavizados → uniformes del Silk; limitador de luminancia (≤ 15 %, paso bajo 3 Hz) y medición de destellos con un beat a 160 BPM | 🔒 Bloqueado | 1.1, 1.4 | §3.5 · `RNF-A11Y-04` |
| 1.13 | Puerta de entrada completa (§3.8.1; maqueta `00-titulo`): arranque «[OTP.] PRESENTA», logo que cae con su extrusión y el lockup, vinilo-sol de la semana partido por la diagonal y girando al BPM, «◀ PULSA PARA EMPEZAR ▶» que respira con «Entrar sin sonido [S]», campeón vigente y cartel EN JUEGO; al pulsar, `AudioContext`, `ui.enter` y la diagonal que abre el menú. Saltable, con su variante sin movimiento y desactivable en Opciones; no aparece en autenticación, admin ni legales | 🔒 Bloqueado | 1.4 | §3.8.1 · `RD-SND-01`, `RD-MOT-01`, `RD-MOT-03` · Sale del jurado visual de la Arena (0.28, `docs/planning/evidence/f0/arena/jurado.md`): la home entra directa al menú y falta el momento de «inserta moneda» |

### Audio en la nube ⚠️ crea recursos externos: pedir confirmación antes

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.7 | Cloudinary: decidir la cuenta (decisión abierta); subida **firmada por trozos** de un WAV de prueba desde el navegador como `authenticated` con `eager` `f_mp3,br_192k`; entregar el derivado con URL firmada; reproducirlo con `crossOrigin="anonymous"` + `MediaElementSource` + analizador. Verificar: CORS de `res.cloudinary.com`, que el original sin firma da 401, que `br_192k` aplica al audio y el tiempo del `eager` | 🔒 Bloqueado | 1.4, decisión de cuenta | §4.8 · `RF-STO-01`, `RF-STO-02` |
| 1.8 | ffmpeg en Vercel: función de prueba con `ffmpeg-static` que lee un WAV de 50 MB de Cloudinary por URL firmada y calcula sonoridad integrada (`ebur128`), pico real y forma de onda de 1000 bins. Medir tamaño de la función, arranque en frío y tiempo total. **GO si cabe y tarda < 8 s**; si no, plan B (§4.8.4) | 🔒 Bloqueado | 1.7 | §4.8.4 · `RF-STO-04` |

### Análisis local

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.9 | Port a TS de `audioEngine`, `tempoEngine`, `keyEngine`, `dsp`, `musicTheory` y `engineConfig` del sello en `packages/audio`, con su worker; la batería `validate-audio-engine.mjs` + `synth-tracks.mjs` pasa como tests de Vitest con las mismas tolerancias | ⬜ Listo | 0.1 | §4.6 · `RF-ENT-06` |
| 1.10 | Forma de onda (1000 bins mín/máx `Int8`), sonoridad aproximada (filtro K) y «momento más enérgico» en `packages/audio`, con tests contra señales sintéticas | 🔒 Bloqueado | 1.9 | §4.6 |

### Medición y decisión

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 1.11 | Banco: `tools/shot/bench.mjs` en escritorio (GPU integrada AMD del portátil) con Silk + vista + 4.000 partículas; en Android de gama media (dispositivo real del usuario o, si no hay, emulación con limitación de CPU, dejándolo marcado como evidencia parcial). Latencia de efectos medida | 🔒 Bloqueado | 1.3, 1.5, 1.6 | §4.17 · `RNF-PERF-03`, `RD-SND-05` |
| 1.12 | Informe GO/NO-GO en este plan con evidencia (capturas, GIF y números en `docs/planning/evidence/f1/`); desviaciones llevadas a la guía con registro de cambios; decisión anotada en el roadmap | 🔒 Bloqueado | 1.7, 1.8, 1.10, 1.11 | — · Incluye repetir la prueba del sello con el Silk (`node tools/shot/ab.mjs`) para cerrar `RD-VIS-02` y decidir las propuestas del jurado de la Fase 0 (guía §7) |

---

## Entregable

Una página de prueba (`/dev/spike`) con el Silk reactivo a un beat alojado en Cloudinary, un vinilo
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
| 2026-10-03 | 1.13 | Nueva tarea, del jurado visual de la Arena (0.28): la puerta de entrada completa con la pantalla de título `00-titulo` (§3.8.1). La 1.4 se queda con la puerta mínima (el desbloqueo del `AudioContext`). |
| 2026-10-02 | 1.5 | Revisión adversarial de la Fase 0 (sdd-2): la 1.5 cierra también `RD-VIS-03` (Estrellas en la galería con sus estados). |
| 2026-10-02 | — | Plan creado. |
