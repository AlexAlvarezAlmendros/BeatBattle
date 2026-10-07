# Reactividad al audio y destellos (tarea 1.6, `RNF-A11Y-04`)

Medido el 2026-10-07 con `tools/shot/flashes.mjs` en el banco `/dev/escenario?vinilo=no` (solo la trama de la
cuña se mueve), calidad alta, 1440 × 900, iGPU AMD Renoir por Vulkan. Capturas de la cuña (640 × 520 px) a
~15 por segundo durante 6 s; de cada una, la luminancia relativa media (WCAG).

| Medición | Muestras | Luminancia (mín.–máx.) | Oscilación | Destellos por segundo |
|---|---|---|---|---|
| Con el ritmo de prueba a 160 BPM | 91 | 0,02875–0,02930 | 0,00056 | **0** |
| Referencia sin ritmo | 104 | 0,0286–0,0286 | 0 | 0 |

Un destello (WCAG 2.3.1) necesita un cambio de 0,1 en la luminancia relativa: la reactividad se queda más
de cien veces por debajo. Las muestras están en `destellos-160bpm.json` y `referencia-sin-ritmo.json`.
