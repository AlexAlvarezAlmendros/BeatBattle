# Jurado visual de la Fase 5 (tarea 5.22)

Tres lentes (**juego**, **marca** y **accesibilidad**, `RD-VIS-02`) sobre «ELIGE ENTRADA», la ficha, el Modo
Jurado (escuchando y con las estrellas despiertas), la barra del reproductor y la puerta del jurado, a 1440 ×
900, 1366 × 657, 1024 × 768, 390 × 844 y 320 × 568 (los dos últimos, táctiles); a 1440 × 900, además, sin
movimiento y en contraste alto. Capturas con `tools/shot/jury-f5.mjs` contra una API sembrada con
`apps/server/src/scripts/seedBattle.ts` (24 entradas, la cuenta `jurado1` con 6 votos), 2026-10-13. Las de móvil
son de página entera: la barra de controles, pegada al pie, sale a media página en la captura.

## Hallazgos

| Id | Lente | Gravedad | Pantalla y tamaño | Hallazgo | Estado |
|---|---|---|---|---|---|
| J1 | Accesibilidad, juego | Alta | Modo Jurado, 390 y 320 | El alias y la placa rayada del HUD derecho se salían de la pantalla, y la ronda no se veía | **Corregido**: en móvil la ronda, el contador y el alias van en la fila «[silueta] VS ALIAS» de la arena (§3.8.7) y el HUD derecho se oculta |
| C1 | Accesibilidad | Alta | Modo Jurado y ficha, contraste alto | Las estrellas desaparecían (trazo blanco del SVG sin ajustar sobre el blanco del esquema claro) | **Corregido**: contorno `CanvasText` y llenas en `Highlight` (`ui/Stars`) |
| S1 | Juego, accesibilidad | Media | Selección, 390 y 320 | El sello «✓ VOTADA n/5» pisaba la casilla vecina y a 320 se cortaban alias largos | **Corregido**: sello corto «✓ n/5» en casillas de menos de 9 rem (*container query*) y dos columnas a 360 px o menos |
| S2 | Juego | Media | Selección, móvil | La ficha de la enfocada quedaba al final, tras toda la rejilla | **Corregido**: hoja pegada sobre la barra con el alias, los datos, «Escuchar» y «Jurado» (§3.8.13) |
| P1 | Juego | Media | Puerta del jurado | La barra enseñaba las teclas del jurado (1–5, saltar…) en una pantalla donde no se puntúa | **Corregido**: la puerta enseña `INTRO ENTRAR · ESC VOLVER · M SONIDO` |
| J3 | Juego | Media → Baja | Modo Jurado, 1024 × 768 | El panel en una fila dejaba la onda estrecha (la nota en ocho líneas) y el combo bajo la barra | **Corregido en parte**: la fila solo desde 1200 px; a 1024 × 768 se ven las estrellas y sus teclas, y su medidor pequeño queda en el borde de la barra (se ve desplazando) |
| B1 | Marca | Baja | Puerta del jurado, 1440 | Mucho panel vacío bajo una sola frase | Abierta (es una pantalla de paso) |
| M1 | Marca | Baja | Modo Jurado | El VS es blanco plano; la maqueta lo lleva con extrusión roja y contorno | Abierta (pieza de la Fase 8, pulido audiovisual) |

Sin hallazgos de **marca** que rompan la paleta o la firma: todas las pantallas llevan la firma en la barra,
solo colores de la paleta y la silueta del jurado es siempre la misma (§3.4.6). Integridad (§1.3): en ninguna
captura hay dos entradas con estrellas, barras de vida, medias, recuentos por entrada ni autoría.

## Veredicto

Juego ✅ · Marca ✅ · Accesibilidad ✅, con las bajas J3, B1 y M1 anotadas.
