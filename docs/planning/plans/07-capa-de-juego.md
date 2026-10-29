# Plan 07 — Capa de juego

> Fase: 7 de 10 | Estado: 🔄 En curso | Iniciado: 2026-10-29 | Cerrado: —
> Hito del roadmap: XP, niveles, rachas, logros, temporadas y carta con su pase (en producción cuando el usuario
> despliegue); reprocesar no duplica XP; emails de progreso y de temporada.

Deja resuelta **la capa de juego** que va por encima de la competición: el libro de XP idempotente con las reglas
del Anexo B, niveles y rangos, rachas con comodín, los 36 logros del Anexo C evaluados por eventos, el oído de oro,
las temporadas con su campeón y el salón de la fama; y, en pantalla, el HUD de jugador de verdad, el XP flotante,
los avisos de logro y de subida de nivel, la carta de luchador con su pase de torneo y el perfil completo; y por
email, `game.progress` y `season.wrap`. Todo es **cosmético**: nada de esto toca la clasificación (`RF-GAME-10`).

**Riesgos principales:**

- **Juego limpio** (§1.3, `RF-GAME-10`). El XP, los niveles y los logros nunca pesan en un voto ni en la
  clasificación; y además, la capa de juego abre una fuga nueva: un perfil público cuyo XP sube 125 puntos o que
  estrena «Madrugador» un martes dice quién participa en una semana ciega (hueco G1). El contrato de voto ciego se
  amplía en cada ruta nueva, no al final.
- **Idempotencia** (`RF-GAME-01`). `xp_event` es único por cuenta, tipo y referencia: repetir el sellado o el
  reprocesado no suma dos veces. Lo que la guía no dice es qué pasa con el XP y los logros cuando un **re-sellado**
  cambia posiciones (hueco G2).
- **El pase de la carta** (§3.4.4, `RF-GAME-07`, §4.17). Física con Rapier en un trozo que no puede ir en el del
  Escenario (249,8 de 250 kB gz, sin margen), 60 fps en el perfil, la carta plana como alternativa, y que no se lea
  como el `Lanyard` del sello (§3.1, «Lo que nunca se imita»). Es además una decisión abierta del roadmap.
- **El sellado crece.** XP, racha, oído de oro, logros, cierre de temporada y `season.wrap` van en el mismo `batch`
  que el snapshot (§4.19.3): con muchas cuentas, vigilar su tamaño.

---

## Decisiones de partida

- **La F7 ya no espera a la beta** (decisión del usuario del 2026-10-29, «todo hasta el lanzamiento»). El roadmap
  dejaba la capa de juego para después de la beta cerrada; ahora F7–F10 se desarrollan mientras se prepara y se juega
  la beta. Desplegar y tocar la infraestructura (Vercel, sus variables) sigue siendo cosa del usuario, así que
  **`main` puede ir por delante de producción**. Por eso cada PR deja `main` desplegable: migraciones solo aditivas
  y nada a medias a la vista. Cuando el usuario despliegue la F7, el reprocesado (7.16) da a los jugadores de la beta
  el XP y los logros de lo que ya jugaron.
- **Cuándo se gana cada cosa.** En vivo, en el `batch` del hecho: la subida (cuando la entrada pasa a `active`,
  §4.8.4 paso 4), el voto, la descarga del sample y el perfil completo; es lo que alimenta el «+5 XP» del HUD. Al
  sellar: el XP de resultado, el oído de oro, la racha, los puntos y el campeón de temporada, y los logros que
  dependen de la clasificación.
- **Logros: el catálogo entero aquí, los disparadores en su fase.** Los 36 logros del Anexo C viven como datos en
  `packages/rules` con un test de su condición cada uno (`RF-GAME-05`). Los que dispara otra fase (los secretos de la
  F8 —`scratch`, `konami`, `pad_404`, `screwed`, `human_metronome`, `revetlla`—, `detective` con «Adivina el
  productor» y `label_pick` con la Elección del sello de la F9) se conectan en la suya.
- **Fuera de esta fase.** De la F8: todo el Anexo F (sorpresas, sesión nocturna, pieles de fecha, ascuas y canto del
  vinilo de la semana dorada), el kit de la semana, la música de sala, «Adivina el productor» con su XP
  (`XP_PRODUCER_GUESS`) y la revisión del catálogo completo del Anexo D (aquí solo entran los `ach.*`). De la semana
  dorada, esta fase hace lo que es de juego: el XP × 2 (Anexo B) y el logro `golden_week`. De la F9: la Elección del
  sello y el distintivo de productor del sello en la carta (`otp_affiliate`). De la F10: las auditorías completas de
  accesibilidad, rendimiento y seguridad.
- **Nada crea recursos en la nube.** `@react-three/rapier` ya está en el stack (§4.1), aunque no instalado; se fija su
  versión al añadirlo. El único paso con ⚠️ es ejecutar el reprocesado contra producción (7.16).

### Lo que ya existe

- **Reglas** (`packages/rules`): `levels.ts` (`xpForLevel`, `levelOf`, `levelProgress`, `rankTitle`,
  `streakBonus`/`streakBonusPercent`) con `RF-GAME-02` entero (la tabla del Anexo B recalculada con la fórmula y sus
  fronteras, `levels.test.ts`) y el bonus de racha (`RF-GAME-04 (parcial)`); `goldenEar.ts` con `spearman` y
  `averageRanks` y los dos casos del Anexo G (`RF-GAME-06 (parcial)`), sin `goldenEar()`; `season.ts` con
  `seasonPoints` (`RF-ARC-03 (parcial)`: la tabla, fuera del top 10 y sin clasificar), sin `seasonStandings`;
  `calendar.seasonOf` (el trimestre del lunes, probado con el 2024-12-30 pero sin el id `RF-ARC-04` ni su caso);
  `balance.ts` con todas las constantes de XP, rarezas, oído de oro, racha y comodín, niveles, rangos y puntos de
  temporada (faltan los umbrales de los logros); `rank` ya escribe los puntos de temporada de cada fila. No existen
  `xp.ts` ni `achievements.ts`.
- **Servidor**: `producer_profile` tiene `xp` (la caché, siempre a 0), `level_seen` y `showcase`; `seen_flag` admite
  `season_champion` en el esquema (la API, solo `drop` y `ceremony`); `email_pref` tiene `progress_on` y `season_on`;
  el catálogo de email declara `game.progress` (prioridad 50) y `season.wrap` (60); `result.season_points` se guarda
  al sellar y `week.golden`, desde la F3; el registro de datos de la cuenta exporta `achievements: []` y
  `xpEvents: []`. El sellado (`modules/weeks/seal.ts`) escribe `sealed_at` y el snapshot en un `batch`, y el re-sellado
  (`modules/results/service.ts`), una revisión nueva: ahí se engancha la capa de juego. Faltan `xp_event`,
  `achievement_unlock` y `streak_state`, `/api/hall-of-fame` y `/api/seasons/:id/standings`; `GET
  /api/profiles/:username` no da estadísticas, historial ni logros.
- **Web**: `PlayerCard` (avatar, nivel, rango y medidor de XP desde `GET /api/me`, hoy siempre a 0 XP) y `HudStat`
  para temporada y racha, que solo rellena el menú de desarrollo (`/dev/menu`); `ProducerCard`, el anverso plano de la
  F2 con la vitrina en silueta; `ProfilePage` con las seis teselas, el historial, la gráfica y los logros en su estado
  vacío; `HallOfFamePage` y `SeasonPage`, provisionales (0.10); los textos de rango en `es.json` (`ranks.test.ts`);
  el combo del Modo Jurado (×8, `combo.up`) sin XP; `ui/Toast`, `ui/Meter`, `ui/Medal`, `ui/Announcer` y
  `flash.request()`. No hay almacén `hud` (§4.7.2).
- **Sonido**: `xp.gain`, `level.up` y `combo.up` son `SfxDef` de `packages/audio`; faltan los cuatro `ach.*`.
- **Emails**: no hay plantillas `game.progress` ni `season.wrap`; `battle.monday` y `battle.results` salen sin XP,
  racha ni oído de oro, y `battle.reminder`, sin su versión de racha.
- **Hecho en otras fases y que esta usa tal cual**: portadas generativas (§3.4.5, `RD-VIS-04`, F4), silueta del
  jurado (§3.4.6, F5) y medallas de vinilo (§3.4.3, F6).

## Huecos y contradicciones de la guía

La planificación los destapa; **no se corrigen aquí** (otra rama puede estar tocando la guía). Cada uno se resuelve
en la guía, con versión y registro de cambios, en el commit de la tarea que lo necesita y antes de su código. La
columna «Resuelto» dice la decisión y la versión de la guía que la recoge.

| # | Hueco | Dónde | Tarea | Resuelto |
|---|---|---|---|---|
| G1 | **XP y logros públicos frente al voto ciego.** El perfil público enseña XP, nivel y logros (§2.3), y el XP de subir se gana al subir (§3.8.5): el XP o un `first_entry`/`early_bird`/`last_minute` que aparecen a mitad de semana dicen quién participa en una batalla ciega, justo lo que §2.15 evita en el sitemap y en la OG del perfil. Propuesta: lo público (perfil, OG, salón) solo cuenta el XP y los logros ligados a entradas de semanas selladas; el HUD y `me`, todo | §1.3, §2.3, §2.15 | 7.13, 7.24, 7.28 | — |
| G2 | **Re-sellado y capa de juego.** No se dice qué pasa con el XP de resultado, el oído de oro, la racha, los puntos y los logros (`podium`, `win`…) cuando un re-sellado cambia posiciones; con `xp_event` idempotente se quedarían los de la revisión 1. Opciones: congelar lo ganado, o un ajuste con referencia por revisión (que puede restar) y logros que nunca se retiran | §2.8, §2.10 | 7.10 | — |
| G3 | **XP de subir y racha.** El bonus de racha multiplica el XP de subir, pero al subir la semana aún no está clasificada (`streakBonusPercent` cuenta «incluida la actual»). Falta fijar con qué racha se calcula y qué pasa si la entrada acaba sin clasificar; y si la «primera entrada de la semana» se retira | §2.10, Anexo B | 7.1, 7.9 | ✅ v0.6.93: subir paga al pasar a `active`, una vez por semana, con la **racha en juego** (la de las semanas selladas más esta, la misma del resultado); no se retira si acaba sin clasificar; la primera entrada es la primera en pasar a `active` y, si se retira, se queda con lo ganado y no pasa a otra |
| G4 | **`challenge`.** «Marcar que cumples el reto extra» no tiene casilla en la ficha (§2.5), columna en `entry` (§4.11) ni campo en la API; y enseñarlo antes del sellado distinguiría a una entrada (§1.3), así que solo se vería después | §2.5, §4.11, Anexo C | 7.5, 7.7, 7.10 | ✅ v0.6.97 (la regla) y v0.6.99 (los datos): la casilla «Cumplo el reto extra» de la ficha, solo si la semana tiene reto y editable hasta el cierre de envíos; `entry.challenge_claimed`; `challengeClaimed` al registrar y editar; hasta el sellado solo la ve su dueño (su entrada) y después va en `result` de la ficha (`RF-ENT-13`, nuevo). El logro, al sellar (7.10) |
| G5 | **Logros que ocurren en el navegador.** `share_card` (y los secretos de la F8) no tienen ruta para llegar al servidor: falta en §4.10 con su lista blanca y su límite | §4.10, Anexo C | 7.14 | — |
| G6 | **La ceremonia corta del campeón de temporada** (`RF-ARC-05`) no está diseñada: ni pantalla en §3.8, ni variante en el Anexo E, ni efecto en el Anexo D | §2.9, §3.8 | 7.27 | — |
| G7 | **Cierre de temporada.** «Al sellar la última semana» no cubre un último lunes del trimestre sin semana programada. Propuesta: cierra al sellar la última semana programada del trimestre o, si no la hay, en el primer `tick` tras el fin del trimestre | §2.9, §4.12 | 7.4, 7.11 | — |
| G8 | **`night_owl`** («entre las 03:00 y las 05:00») no dice en qué hora: la sesión nocturna del Anexo F es la local y el servidor solo conoce la de Madrid | Anexo C | 7.5 | ✅ v0.6.97: hora de Madrid y reloj del servidor, que es quien lo comprueba (el del navegador se puede adelantar): 10 votos a entradas distintas emitidos entre las 03:00 y las 05:00 de una misma noche; la misma regla para la franja de `revetlla` (21:00 del 23 de junio – 06:00 del 24) |
| G9 | **Oído de oro.** No aclara si la media de la semana `m` también se recalcula sin los votos del jurado; y §2.10 dice «la clasificación final» mientras el Anexo G correlaciona con las puntuaciones | §2.10, Anexo G | 7.3 | ✅ v0.6.95: sí, la semana se recalcula como si no hubiera votado (sin sus votos en cada entrada y en `m`); se correlaciona con la **puntuación** exacta de las entradas que votó (las sin clasificar no tienen posición); §2.10 deja de decir «clasificación final»; caso nuevo en el Anexo G |
| G10 | **Desempate de temporada.** «Mejor puntuación media»: ¿media de la puntuación de sus semanas clasificadas? ¿Entra en la tabla quien solo tiene semanas sin clasificar (0 puntos)? | §2.9 | 7.4 | ✅ v0.6.96: la media de la puntuación del snapshot de sus entradas clasificadas de la temporada, comparada exacta; solo entra quien tiene al menos una clasificada (quien solo tiene semanas sin clasificar, no); victorias y podios con ex aequo; con todo empatado, posición compartida y campeones ex aequo |
| G11 | **XP de un voto quitado** (`RF-VOTE-13`) **o anulado** por moderación: no se dice si se retira | §2.7, §2.10 | 7.1, 7.9 | ✅ v0.6.93: el XP en vivo no se retira: quitar el voto no resta y volver a votar no suma; un voto anulado (o de una entrada retirada o descalificada) conserva su XP y cuenta para el tope; el fraude se sanciona en moderación |
| G12 | **Semana dorada.** «× 2 a todo lo de esa semana»: ¿también el XP de los logros desbloqueados esa semana? | Anexo B | 7.1 | ✅ v0.6.93: no; la dorada duplica los eventos del Anexo B de esa semana (después de redondear el bonus) y los logros dan siempre su rareza, sin racha ni dorada |
| G13 | **Ruta del perfil.** §2.3 dice `GET /api/profiles/:username` (la que existe) y §4.10, `GET /api/producers/:username` | §2.3, §4.10 | 7.13 | — |
| G14 | **§5 sigue diciendo que F7 y F9 van tras la beta** (texto y grafo); la decisión del 2026-10-29 lo cambia | §5 | primer commit de la F7 que toque la guía | ✅ v0.6.92: §5 (texto y grafo) cuelga la F7 y la F9 de la F6, en paralelo con la beta, citando la decisión del 2026-10-29; la F10 tras la F7–F9 |

## Dependencia con otras fases

- **Requiere:** F0–F6. Están cerradas la F0, la F1, la F4, la F5 y la F6; la F2 y la F3 tienen su hito cumplido y
  solo esperan comprobaciones del usuario (2.11, 2.26 y 3.21), de las que nada de esta fase depende. En concreto:
  - de la Fase 6: el sellado con el snapshot en `result` (con `season_points`), el re-sellado, la página de resultados
    con «TU RESULTADO», la ceremonia, `battle.monday` y `battle.results`;
  - de la Fase 5: el voto en su `batch`, el Modo Jurado con el combo, «¡JURADO COMPLETO!» y `battle.reminder`;
  - de la Fase 4: la entrada que pasa a `active` en un `batch` (§4.8.4) y la celebración de la subida;
  - de la Fase 3: `seasonOf`, `week.number`, `week.golden`, la descarga del sample y el `tick` con `emailSchedule`;
  - de la Fase 2: `producer_profile` (`xp`, `level_seen`, `showcase`), las preferencias `progress_on` y `season_on`,
    la cola de email y el registro de datos de la cuenta;
  - de la Fase 1: el motor de audio (`xp.gain`, `level.up`) y el Escenario con vistas ancladas;
  - de la Fase 0: `PlayerCard`, `HudStat`, `ProducerCard`, `Meter`, `Toast` y `Announcer`.
- **Puerta de la beta, saltada:** el roadmap ponía la F7 tras la beta cerrada; el usuario la abre antes el
  2026-10-29 (arriba). La beta sigue su plan en paralelo.
- **Habilita:** la Fase 8 (logros de los secretos, semana dorada visual, «Adivina el productor» con XP) y, con la F8 y
  la F9, la Fase 10. A la F9 le deja la condición de `label_pick` probada.

## Cobertura de la especificación

| Id | Tarea(s) | Verificación |
|----|----------|--------------|
| `RF-GAME-01` | 7.7, 7.8, 7.10, 7.16 | servidor: re-ejecutar el sellado y el reprocesado no cambia el XP de nadie (`xp_event` único) |
| `RF-GAME-02` | — | **ya cubierto**: `levels.test.ts` (la tabla del Anexo B con la fórmula, en sus fronteras) y `ranks.test.ts` (los textos); la 7.18 lo usa en el HUD |
| `RF-GAME-03` | 7.1, 7.8, 7.9 | propiedades: 50 votos en una semana dan como máximo 40 × 5 XP; servidor: el voto 41 de la semana no suma |
| `RF-GAME-04` | 7.2, 7.10 | escenario: 4 semanas, falla la 5.ª (gasta el comodín), falla la 6.ª (se rompe); el bonus, ya probado |
| `RF-GAME-05` | 7.5, 7.8, 7.9, 7.10, 7.14, 7.24 | un test por logro del Anexo C (la condición en reglas, el disparador en el servidor); los de la F8 y la F9, solo la condición |
| `RF-GAME-06` | 7.3, 7.10 | el caso del Anexo G y uno en el que quitar el propio voto cambia el veredicto (`spearman`, ya probado) |
| `RF-GAME-07` | 7.22, 7.23 | E2E: con `prefers-reduced-motion` o sin WebGL se ve la carta plana |
| `RF-GAME-08` | 7.9, 7.18, 7.19 | componente y E2E: votar muestra «+5 XP» y el medidor sube |
| `RF-GAME-09` | 7.13, 7.20 | E2E: tras subir de nivel, recargar no repite la animación (`level_seen`) |
| `RF-GAME-10` | 7.6, 7.10 | estático: la clasificación no importa nada de la capa de juego; servidor: dos votantes de nivel 1 y 20 pesan igual |
| `RF-ARC-02` | 7.12, 7.25 | servidor con fixtures (también tras un re-sellado y con un productor eliminado); E2E de la página |
| `RF-ARC-03` | 7.4, 7.11, 7.26 | la tabla (ya, `RF-ARC-03 (parcial)`) y cada desempate; servidor: solo cuentan semanas selladas |
| `RF-ARC-04` | 7.4 | la semana que empieza el 2026-12-28 es de 2026-T4 (`seasonOf` ya existe; falta el test con su id) |
| `RF-ARC-05` | 7.11, 7.27 | integración: una temporada de 13 semanas simuladas proclama campeón con su logro y su ceremonia, una vez |
| `RF-NOTIF-15` | 7.30 | servidor: al cerrar una temporada simulada sale «Tu temporada en cifras» a quien participó o votó |
| `RF-RES-08` | 7.10, 7.21 | el reparto de XP y el XP de «TU RESULTADO» (el resto, hecho en la F6) |
| `RF-PRF-01` | 7.13, 7.24 | perfil con estadísticas, historial, posiciones y logros (lo de la F2, hecho) |
| `RF-ENT-13` | 7.7 | servidor: sin reto, marcar la casilla → 422; el contrato de voto ciego (nadie más que su dueño la ve antes del sellado; sellada, en `result`) |
| `RF-PRF-04`, `RF-PRF-05`, `RNF-PRIV-01` | 7.15 | la exportación lleva el XP, los logros y la racha; el borrado los quita en el mismo `batch` |
| `RNF-PRIV-04`, `RNF-SEC-04` | 7.13, 7.24 | contrato: ni votos individuales ni nada de una semana sin sellar en `me`, perfil, salón y temporada (G1) |
| `RF-SHARE-03` | 7.28 | descarga de «Mi carta de productor» a 1080 × 1920 (las otras dos tarjetas, de la F6) |
| `RF-NOTIF-02`, `RF-NOTIF-03`, `RF-NOTIF-08`, `RF-NOTIF-13` | 7.29, 7.30, 7.31 | plantillas con texto plano y capturas, idempotencia, tope y silencio, contrato sobre lo renderizado |
| `RF-NOTIF-07` | 7.31 | el Lunes de batalla con XP, racha y oído de oro (la mecánica, de la F6) |
| `RD-SND-02`, `RNF-A11Y-05` | 7.17, 7.20 | `ach.*` como datos y medidos *offline*; cada sonido con su equivalente visual |
| `RD-MOT-01..04`, `RNF-A11Y-03`, `RNF-A11Y-04`, `RNF-A11Y-07` | 7.19, 7.20, 7.23, 7.27, 7.34 | saltables, en el reloj de audio, con su variante sin movimiento (Anexo E), por el limitador y con región viva |
| `RNF-PERF-01`, `RNF-PERF-03`, `RNF-PERF-04` | 7.23, 7.34 | la carta 3D en su trozo diferido, después de la primera pintura; FPS del perfil con la carta |
| `RD-VIS-01`, `RD-VIS-05` | todas las de UI | `pnpm lint:tokens` y los E2E de tamaño de texto y de texto sobre trama con las rutas nuevas |
| `RD-VIS-02` | 7.35 | jurado visual de tres lentes |
| `RF-SURP-*` | — | **Fase 8** (`RF-SURP-02` reutiliza el test de `RF-GAME-10`) |
| `RF-OTP-04`, `RF-OTP-05` | — | **Fase 9** (la condición de `label_pick` se prueba en la 7.5; el distintivo del sello en la carta, en la F9) |

---

## Tareas

### Reglas

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 7.1 | `packages/rules`: `xp.ts` con `xpFor(evento, contexto)` para cada fila del Anexo B: subir (100 × racha), primera entrada de la semana (+25), voto (5, solo el primero a cada entrada, tope de 40 por semana), jurado completo (50, con 5 entradas como poco), clasificar (25) o top 10 / 3.º / 2.º / 1.º (100 / 250 / 350 / 500, que sustituyen a clasificar, × racha), oído de oro (75), logro por rareza (25 / 75 / 150 / 300) y semana dorada × 2; enteros exactos | ✅ Hecho | — | §2.10, Anexo B · `RF-GAME-03` · propiedades: 50 votos → 200 XP como mucho, nunca negativo, × 2 en dorada, el resultado sustituye a clasificar · **Ya existen** las constantes en `balance.ts` y `streakBonusPercent`; falta el módulo. Huecos G3, G11 y G12. `XP_PRODUCER_GUESS`, en la F8 · **Hecho:** `xp.ts` con `xpFor`, `resultBaseXp` e `isJuryComplete`; 17 tests en `test/xp.test.ts` (cada fila del Anexo B, el redondeo del Anexo G y propiedades con fast-check: 50 votos → 200 XP como mucho y 5 por entrada distinta, entero ≥ 0, dorada × 2 exacta salvo logros, el resultado sustituye a clasificar, la racha solo toca subir y resultado). `XP_PRODUCER_GUESS` ya va en `xpFor` (su disparador, en la F8). Guía v0.6.93 |
| 7.2 | `streakOf(historial)`: racha actual y mejor, con un comodín por temporada que se gasta solo la primera semana fallada; por `week.number` (correlativo entre semanas programadas, así un hueco del calendario no la rompe) | ✅ Hecho | — | §2.10, Anexo G · `RF-GAME-04` · el escenario de aceptación y propiedades · **Ya existe** el bonus (`streakBonus`, test `RF-GAME-04 (parcial)`); falta la racha con comodín. Fijar en la guía si la semana salvada por el comodín suma a la racha y a `streak_3/8/26` · **Hecho:** `advanceStreak` (una semana sellada; idempotente con `lastWeekNumber`, que es la última semana aplicada), `streakOf` (la historia en orden de número), `jokerAvailable` y `streakInPlay` (la racha en juego de `xpFor`) en `xp.ts`, como dice §4.5; 12 tests en `test/streak.test.ts` (el escenario de `RF-GAME-04`, la semana salvada que no suma, un comodín por temporada, sin racha no se gasta, la mejor racha, y propiedades: re-aplicar no cambia nada, 0 ≤ actual ≤ mejor ≤ clasificadas, dos fallos seguidos en una temporada la rompen, partir la historia da lo mismo). La semana salvada no suma ni al bonus ni a `streak_3/8/26`. Guía v0.6.94 |
| 7.3 | `goldenEar(votosDelUsuario, resultados)`: Spearman entre las estrellas del jurado y la puntuación de cada entrada que votó, recalculada sin su voto, solo con 8 votos válidos o más; gana con ρ ≥ 0,6 | ✅ Hecho | — | §2.10, Anexo G · `RF-GAME-06` · el caso con empates del Anexo G (ρ = 6/√95 ≈ 0,6156) y uno donde quitar el propio voto cambia el veredicto · **Ya existen** `spearman` y `averageRanks` con los dos casos; falta `goldenEar`. Hueco G9 · **Hecho:** `goldenEar(jurado, votosDeLaSemana)` en `goldenEar.ts`: la semana sin sus votos (también en `m`), puntuaciones exactas con productos cruzados y `spearman` sobre su orden; 9 tests nuevos en `test/goldenEar.test.ts` (el caso del Anexo G, que no gana con ρ = 22/√1501 y habría ganado con sus votos, 69/79; gana cambiando una estrella, 24/√1482; uno en el que recalcular `m` sin sus votos cambia el veredicto; menos de 8 votos; ρ sin definir; y propiedades: coincide con recalcular a mano con `bayes` y no depende del orden ni de quiénes son los demás). Los dos de Spearman ya no son «parcial». Guía v0.6.95 |
| 7.4 | `seasonStandings(resultados)` con los desempates (más victorias → más podios → mejor puntuación media), el campeón (o los ex aequo) y si una semana cierra su temporada; el caso de `RF-ARC-04` con su id | ✅ Hecho | — | §2.9, Anexo B · `RF-ARC-03`, `RF-ARC-04` · test de cada desempate; la semana del 2026-12-28 es de 2026-T4 · **Ya existen** `seasonPoints` y `seasonOf` (su test usa el 2024-12-30, sin el id). Huecos G7 y G10 · **Hecho:** `seasonStandings` y `seasonChampions` en `season.ts` e `isLastWeekOfSeason` en `calendar.ts`; 12 tests nuevos en `test/season.test.ts` (la suma de la tabla, cada desempate —victorias, podios y media exacta, también con distinto número de semanas—, ex aequo 1, 1, 3 con campeones ex aequo, ex aequo semanales en victorias y podios, sin clasificar no entra, propiedades de pureza y orden, `RF-ARC-04` con la semana del 2026-12-28 —2026-W53, cierra la 2026-T4— y una sola última semana por temporada). Los tres de la tabla ya no son «parcial». Guía v0.6.96. El cierre sin semana programada el último lunes (G7) sigue para la 7.11 |
| 7.5 | `achievements.ts`: el catálogo del Anexo C como datos (36 logros: id, rareza, si es oculto, clave de su pista, eventos que lo evalúan y fase que trae su disparador) y `evaluate(evento, contexto) → logros nuevos`, sin duplicados; los umbrales (10 y 50 entradas, 100 y 1.000 votos, media ≥ 4,8 con 10 votos, los 10 min de `last_minute`, la franja de `night_owl`…) en `balance.ts` | ✅ Hecho | — | §2.10, Anexo C · `RF-GAME-05` · un test por logro, también los que dispara otra fase (secretos de la F8, `detective`, `label_pick`): aquí, la condición · Huecos G4 (`challenge`), G5 y G8 (`night_owl`) · **Hecho:** `achievements.ts` con el catálogo (36 logros: id, rareza, oculto, `hintKey` `achievement.<id>.hint`, eventos que lo miran y fase de su disparador), `evaluate`, `isAchievementId`, `achievementById`, `nightOwlWindow` e `isRevetllaNight`; umbrales en `balance.ts`. 46 tests en `test/achievements.test.ts`: el catálogo contra el Anexo C, un `RF-GAME-05: <id>` por cada logro con casos que lo desbloquean y casos al borde que no (también los de la F8 —secretos, `detective`— y de la F9 —`label_pick`—), sin duplicados ni fuera de orden (propiedad), varios a la vez, monotonía, y las franjas de Madrid con los dos cambios de hora; y 3 en `balance.test.ts`. Los textos (nombre y pista) llegan con la UI (7.24). Guía v0.6.97 |
| 7.6 | Guarda de `RF-GAME-10` en las reglas: `ranking` y `scoring` no importan `levels`, `xp`, `achievements` ni `goldenEar` (test estático, como el de pureza) y `rank` no recibe nada de la cuenta que vota | ✅ Hecho | — | §1.3, §2.10 · `RF-GAME-10` (las reglas; el servidor, en la 7.10) · base del test de `RF-SURP-02` (F8) y `RF-OTP-05` (F9) · **Hecho:** `test/gameIsolation.test.ts` con 5 tests: el cierre transitivo de los imports de `ranking` y `scoring` dentro de src no llega a `levels`, `xp`, `achievements` ni `goldenEar` (comprobado a mano: añadir `import { xpFor } from './xp'` a `ranking.ts` lo pone en rojo); `RankVote` solo tiene `entryId` y `stars` (un campo nuevo rompe el `typecheck`); dos votantes de nivel 1 y 20 con gustos opuestos dejan un ex aequo exacto; y, como propiedad, pegar a los votos el nivel, el XP o los logros de quien vota no cambia `rank`. El del servidor, en la 7.10 |

### Datos y servidor

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 7.7 | Migración `0008_capa_de_juego`: `xp_event` (único por cuenta, tipo y referencia), `achievement_unlock` (con `seen_at`) y `streak_state` (con `joker_season`) en el esquema Drizzle; esquemas Zod en `@beatbattle/shared` (XP ganado, logro, estado de juego de `me`, perfil con estadísticas, salón de la fama y clasificación de temporada) | ✅ Hecho | — | §4.11, §4.10 · `RF-GAME-01` (la restricción única) · **Ya existen** `producer_profile.xp`, `level_seen` y `showcase`, y `season_champion` en `seen_flag`. Solo aditiva (`main` puede ir por delante de producción). Si la 7.5 añade la casilla del reto (G4), su columna, aquí o en otra migración aditiva · **Hecho:** `0008_capa_de_juego` (solo `CREATE` y un `ADD COLUMN`): `xp_event` con `week_id`, único por cuenta, tipo y referencia y con un índice parcial que deja una sola `first_entry_of_week` por semana; `achievement_unlock` con `week_id` y `seen_at`; `streak_state`; y `entry.challenge_claimed` (G4: registrar y editar lo aceptan si la semana tiene reto, lo ve su dueño y, sellada, va en `result`). `@beatbattle/shared/game.ts`: `AchievementIdSchema` (igual al catálogo de reglas, con test), `GameDeltaSchema`, `MeGameSchema`, `ProfileGameSchema`, `SeasonStandingsSchema` y `HallOfFameSchema` (las rutas que los usan, 7.9–7.13, pueden afinarlos). Tests: 7 en `gameSchema.test.ts` (migración desde cero, solo aditiva, las tres restricciones únicas), `RF-ENT-13` en `entries.test.ts` y el contrato de voto ciego ampliado (la casilla no sale antes del sellado salvo al dueño; sellada, en `result`); 10 en `@beatbattle/shared`. Guía v0.6.99 |
| 7.8 | Módulo `game` del servidor: XP y logros como sentencias de `batch` idempotentes (`INSERT … ON CONFLICT DO NOTHING` en `xp_event` y `achievement_unlock`, con el XP de cada logro referido a él), la caché `producer_profile.xp` recalculada en el mismo `batch` y el tope semanal de votos con XP contado en el libro | ✅ Hecho | 7.1, 7.5, 7.7 | §2.10, §4.11 · `RF-GAME-01`, `RF-GAME-03`, `RF-GAME-05` · test: repetir un evento no suma; la caché es siempre la suma del libro · **Hecho:** `modules/game/{repo,service}.ts`. `plan(cuenta, { xp, events, achievements, now })` da las sentencias para el `batch` de quien llama (movimientos sin los de 0, logros por `evaluate` con su XP referido al logro, `level_20` en SQL con la suma del libro y la caché recalculada, la última) y la vista previa de lo ganado (`GameDelta`); `voteGrant` cuenta en el libro el primer voto a cada entrada y el tope, que va además dentro del `INSERT`; `streakStatement` guarda la racha. 12 tests en `game.test.ts`: re-ejecutar los mismos hechos tres veces no cambia el XP ni el libro de nadie, la caché se corrige sola, una propiedad (fast-check, hechos repetidos en cualquier orden → uno por tipo y referencia y caché = suma), todo o nada con el hecho, una sola primera entrada por semana, 50 votos → 200 XP y volver a votar no suma, dos votos a la vez con 39 hechos dejan 40, un logro una vez con su XP, varios del mismo evento en orden, `level_20` empujado por otro logro (y su condición, la de las reglas) y la racha. Sin conectar aún a ningún hecho (7.9 y 7.10). Guía v0.6.100 |
| 7.9 | Ganchos en vivo: la entrada que pasa a `active` (XP de subir con la racha, primera de la semana, `first_entry`, `entries_10/50`, `early_bird`, `last_minute`, `golden_week`); el voto (5 XP con tope, `first_vote`, `votes_100/1000`, `night_owl`, y jurado completo con 50 XP y `jury_full` al votar la última); la descarga del sample (`first_drop`); el perfil completo (`profile_done`); `level_20` al cruzarlo. Las respuestas del voto y de la entrada dicen lo ganado (`game: { xp, achievements, level }`) | ⬜ Listo | 7.8 | §2.5, §2.7, §2.10, §4.8.4 · `RF-GAME-03`, `RF-GAME-05`, `RF-GAME-08` (servidor) · test por gancho; votar, quitar y volver a votar no duplica · Huecos G3 y G11 (resueltos en v0.6.93). Usa `plan` y `voteGrant` del módulo `game` (7.8) |
| 7.10 | Gancho del sellado: en el `batch` de `weeks/seal.ts`, el XP de resultado (clasificar o top 10 y podio, × racha, × 2 en dorada), el oído de oro de cada jurado con 8 votos o más, `streak_state` con el comodín y los logros de la semana (`podium`, `win`, `win_3`, `double`, `streak_3/8/26`, `unanimous`, `golden_ear`, `oracle`, `comeback`, `challenge`); `mine` de `GET /api/weeks/:slug/results` con su XP, su oído de oro y sus puntos de temporada | ⬜ Listo | 7.2, 7.3, 7.8 | §2.8, §2.10 · `RF-GAME-01`, `RF-GAME-04`, `RF-GAME-06`, `RF-GAME-10`, `RF-RES-08` · tests: re-ejecutar el sellado no cambia el XP de nadie; dos votantes de nivel 1 y 20 pesan igual; la racha con semanas selladas · Hueco G2 (re-sellado), antes del código. Vigilar el tamaño del `batch` |
| 7.11 | Temporadas: al sellar la semana que cierra una temporada, en el mismo `batch`, el campeón (o los ex aequo) con `season_champ` y la ceremonia pendiente (`seen_flag` `season_champion`); `GET /api/seasons/:id/standings` con solo semanas selladas (la temporada en curso, pública) | 🔒 Bloqueado | 7.4, 7.10 | §2.9, §4.10 · `RF-ARC-03`, `RF-ARC-05` · integración con una temporada de 13 semanas simuladas · Hueco G7. `season.wrap` se suma a este `batch` en la 7.30 |
| 7.12 | `GET /api/hall-of-fame`: ganadores semana a semana (con su portada), campeones de temporada y récords (más victorias, racha más larga, mejor puntuación de la historia, más votos emitidos), derivados de los snapshots vigentes | 🔒 Bloqueado | 7.10, 7.11 | §2.9 · `RF-ARC-02` · fixtures: también tras un re-sellado y con un productor eliminado («Productor eliminado») · solo semanas selladas |
| 7.13 | La capa de juego en `me` y en el perfil: `GET /api/me` con `levelSeen`, racha y comodín, temporada (puntos y puesto) y logros sin ver; `POST /api/me/seen` con `level`, `achievement` y `season_champion`; `GET /api/profiles/:username` con las seis teselas, el historial de combates, las posiciones, los logros (los ocultos, «???» con su pista) y la vitrina; `PUT /api/me/profile` acepta la vitrina (hasta 3 logros conseguidos) | 🔒 Bloqueado | 7.10, 7.11 | §2.3, §3.8.10, §4.10 · `RF-GAME-09` (servidor), `RF-PRF-01`, `RNF-PRIV-04`, `RNF-SEC-04` · el contrato de voto ciego recorre las rutas nuevas: nada de una semana sin sellar ni votos individuales (del oído de oro, solo cuántos) · **Ya existen** `GET /api/me` con la caché de XP y el perfil público sin estadísticas. Huecos G1 y G13 |
| 7.14 | Logros que declara el navegador: una ruta con lista blanca (en esta fase, solo `share_card`), límite por hora y sin más XP que el del logro; la F8 añade los de sus secretos | ⬜ Listo | 7.8 | §2.10, Anexo C · `RF-GAME-05` · test: un logro fuera de la lista → 422; repetirlo no suma · Hueco G5: la ruta, antes en §4.10 |
| 7.15 | RGPD: el módulo `game` del registro de datos de la cuenta exporta `xp_event`, `achievement_unlock` y `streak_state`, y los borra en el `batch` del borrado | ✅ Hecho | 7.7 | §4.14 · `RF-PRF-04`, `RF-PRF-05`, `RNF-PRIV-01` · **Ya existe** la exportación con `achievements: []` y `xpEvents: []` · tests de exportar y de borrar · **Hecho:** `modules/game/account.ts` (`gameAccountData`) en `ACCOUNT_DATA`, tras las entradas: exporta `xpEvents`, `achievements` (con `seenAt`) y `streak` en la sección `game` (el registro junta las claves de dos módulos con la misma sección; el formato sigue en `beatbattle-export/1`, como cuando se añadieron las señales de IP) y borra sus tres tablas en el `batch` del borrado. Lo que otras cuentas ganaron votando sus entradas se queda. 2 tests nuevos en `account.test.ts` (`RF-PRF-05`: el libro, los logros y la racha con la semana por su slug; `RF-PRF-04, RNF-PRIV-01`: borrar quita lo suyo de las tres tablas, deja lo de la otra cuenta con su XP y no queda su id) y el de la exportación vacía al día. Guía v0.6.101 |
| 7.16 | ⚠️ Reprocesado de la capa de juego: un proceso idempotente (script y paso opcional del `tick`) que reparte el XP y los logros de lo que ya pasó (descargas, entradas, votos y semanas selladas, en orden de calendario, con rachas y temporadas), sin encolar `game.progress` por lo pasado; la segunda pasada no cambia nada | 🔒 Bloqueado | 7.9, 7.10, 7.11 | §2.10 · `RF-GAME-01` · test: reprocesar dos veces da el mismo libro · ⚠️ ejecutarlo contra producción (las semanas de la beta) solo con la confirmación del usuario, cuando él despliegue la F7 |

### Sonido, HUD y recompensas

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 7.17 | Efectos `ach.common`, `ach.rare`, `ach.epic` y `ach.legendary` como `SfxDef` afinados en la tonalidad de la semana (campanitas de 2, 3 y 4 notas y acorde con coro de ruido filtrado), renderizados *offline* y medidos a su nivel del Anexo D; su bloque en la galería de sonido | ✅ Hecho | — | §3.7, Anexo D · `RD-SND-02`, `RNF-A11Y-05` · **Ya existen** `xp.gain`, `level.up` y `combo.up`. Escucha del usuario antes de darlos por buenos (como los `cer.*`) · **Hecho:** los cuatro en `packages/audio` (`sfx.ts`): campanitas FM que suben por la tríada de la tónica (siempre en la pentatónica) hasta su octava, con 2, 3 y 4 notas (común 0,5 s y −14 dB; raro 0,8 s y −12; épico 1,2 s y −10), y el legendario (2 s, −8 dB), acorde de campanas rasgueado con coro de ruido rosa por pasos banda estrechos (Q 48) en el acorde una octava más abajo. Renderizados *offline* y medidos (E2E `RD-SND-02 / 7.17`): en La menor, a su nivel (±0,05 dB); en las 24 tonalidades, a ±2 dB (el legendario, de −9,7 a −7,4), cada nota ≥ 19 dB sobre el semitono vecino (el coro ≥ 5 dB) y el mismo render dos veces. Propiedades de afinación y determinismo en `sfx.test.ts`. Bloque «Logros» en `/dev/galeria`, mirado a 1440 y 390. Escritos, sin escuchar: falta la escucha del usuario. El equivalente visual (`RNF-A11Y-05`) es el aviso de logro de la 7.20. La fila del Anexo D da rangos (0,5–2 s, −14 a −8 dB): queda por desdoblarla en la guía con estos valores |
| 7.18 | HUD de jugador de verdad: almacén `hud` (Zustand: cola de XP flotante y de avisos), el medidor de XP y el nivel desde `GET /api/me` con su brillo al subir, y las teselas de temporada («T4 · 12 PTS · 9.º») y racha («×3») en todas las pantallas del marco de juego; región viva para el XP | 🔒 Bloqueado | 7.13 | §3.4.1, §4.7.2 · `RF-GAME-08`, `RNF-A11Y-07` · **Ya existen** `PlayerCard`, `HudStat` y `Meter` (las teselas, solo con los datos de `/dev/menu`). Mirar el HUD apilado y el pliegue del móvil táctil con datos reales |
| 7.19 | XP flotante: «+5 XP» en Oxanium rojo nace junto a lo que lo provoca (el combo del Modo Jurado, las estrellas de la ficha, la celebración de la subida), sube 24 px con el muelle de recompensa y lo traga el medidor del HUD con un pulso y `xp.gain`; nunca encima de una tecla ni de una estrella; sin movimiento, fundido; el combo dice «+5 XP por voto» | 🔒 Bloqueado | 7.9, 7.18 | §3.4.2, Anexo E · `RF-GAME-08`, `RD-MOT-03`, `RNF-A11Y-07` · componente: votar → «+5 XP» y el medidor sube |
| 7.20 | Aviso de logro y subida de nivel: placa que entra desde la diagonal con el marco de su rareza, 4 s y apiladas, con `ach.*`; el legendario, al centro con «¡LOGRO LEGENDARIO!» y chispas por el limitador; el sello de nivel del HUD se estampa con «¡NIVEL 8!» y, si cambia, «¡AHORA ERES BEATMAKER!», con `level.up` en el reloj de audio; una sola vez (`level_seen`, `seen_at`); saltables y sin bloquear; sin movimiento, fundidos; en modo serio, sin anunciador | 🔒 Bloqueado | 7.13, 7.17, 7.18 | §3.8.8, §3.6, Anexo E · `RF-GAME-09`, `RD-MOT-01..04`, `RNF-A11Y-04`, `RNF-A11Y-07` · test: recargar no repite la animación · **Ya existen** `ui/Toast`, `ui/Announcer` y `flash.request()` |
| 7.21 | La capa de juego en las pantallas que ya existen: «¡JURADO COMPLETO!» con su logro; la celebración de la subida con «+XP» y el logro; «TU RESULTADO» con XP, puntos de temporada y oído de oro, y el reparto de XP en la tabla de resultados; el XP que rueda en tu carta al final de la ceremonia; la bienvenida toma «el primer logro» del catálogo | 🔒 Bloqueado | 7.10, 7.13, 7.19, 7.20 | §2.7, §2.8, §3.8.5–3.8.7, §3.8.9 · `RF-RES-08`, `RF-GAME-05` · mirar cada una a 1440 y 390, sin movimiento y en contraste alto |

### Carta, perfil, salón de la fama y temporada

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 7.22 | Carta de luchador completa en 2D: anverso (número, sello de nivel con arco, retrato en trama o duotono, etiqueta de variante, nombre, rango, victorias · podios · semanas, vitrina y pie con la pegatina), reverso (logo, pegatina, QR del perfil y fecha de alta) y variantes en la paleta (estándar; roja con rango ≥ Productor; holo si ganó alguna semana, con la lámina acotada a rojo, blanco y granate; campeón, con corona), pintada en un canvas 2D por CPU que sirve de textura a la 3D y a la tarjeta para *stories*; C la gira; es la carta plana de `RF-GAME-07` | 🔒 Bloqueado | 7.13 | §3.4.4, §2.10 · `RF-GAME-07` (la plana) · **Ya existe** `ProducerCard`, el anverso plano de la F2. La holo es también la `egg.holo` del Anexo F: la variante es de aquí y la F8 solo la revisa. El distintivo del sello (`otp_affiliate`), en la F9 |
| 7.23 | El pase de torneo: cinta roja con «OTP.» impreso, pinza metálica y física propia (`@react-three/rapier`, versión fijada), la carta colgada a −3° y arrastrable, en una vista anclada del Escenario y en un trozo diferido propio; sin WebGL, con «reducir movimiento» o con la calidad apagada, la carta plana | 🔒 Bloqueado | 7.22 | §3.4.4, §3.5, §4.17 · `RF-GAME-07`, `RNF-PERF-01`, `RNF-PERF-03`, `RNF-PERF-04`, `RNF-A11Y-03` · cierra con el usuario la decisión abierta «Pase de la carta» (por defecto, la cinta; alternativa, un expositor giratorio) · el trozo del Escenario va a 249,8 de 250 kB gz: la carta no cabe en él · banco de FPS · el jurado comprueba que no se lee como el `Lanyard` del sello (§3.1) |
| 7.24 | Perfil completo: las seis teselas (mejor puesto, racha, media final, oído de oro, votos dados, temporada), el historial de combates (solo semanas selladas: portada, «S40 · era ~~Faro Errante~~ · 41 votos», posición, puntuación y medalla), la gráfica de posiciones (1.º arriba, victorias en rombo blanco, con su tabla para el lector) y los logros (los que faltan, en silueta; los ocultos, «???» con su pista; cada uno con su nombre accesible); la vitrina se elige en Ajustes → Perfil | 🔒 Bloqueado | 7.13, 7.22 | §3.8.10, §2.3 · `RF-PRF-01`, `RF-GAME-05`, `RNF-PRIV-04` · **Ya existe** `ProfilePage` con esas secciones vacías. Hueco G1. La carta cuelga de su pase cuando llega la 7.23 |
| 7.25 | Salón de la fama (`/salon-de-la-fama`): tabla de récords de recreativa (campeones semana a semana con su portada y disco de oro, campeones de temporada en placas grandes, récords con las cifras en Oxanium y la posición en display), flechas en horizontal, lista en móvil y enlaces al archivo y a la temporada | 🔒 Bloqueado | 7.12 | §2.9, §3.8.14 · `RF-ARC-02` · **Ya existen** la ruta provisional (`HallOfFamePage`, 0.10) y el modo 04 del menú que lleva a ella |
| 7.26 | Temporada (`/temporada/:id`): clasificación de torneo con los puntos tipo F1, el top 3 en peanas pequeñas, los desempates explicados y la temporada en curso con solo semanas selladas | 🔒 Bloqueado | 7.11 | §2.9, §3.8.14 · `RF-ARC-03`, `RF-ARC-04` · **Ya existe** la ruta provisional (`SeasonPage`, 0.10) |
| 7.27 | Ceremonia corta del campeón de temporada: ofrecida una vez (`seen_flag` `season_champion`) tras sellar la semana que cierra la temporada, saltable, con la carta de campeón, su variante sin movimiento y su sonido | 🔒 Bloqueado | 7.11, 7.20, 7.22 | §2.9 · `RF-ARC-05`, `RD-MOT-01`, `RD-MOT-03` · Hueco G6: diseñarla antes en la guía (pantalla en §3.8, fila del Anexo E y efecto del Anexo D) |
| 7.28 | Compartir la carta: «Mi carta de productor» para *stories* (1080 × 1920, canvas 2D por CPU, Web Share con fichero o descarga) con la tecla D, que desbloquea `share_card`; la imagen OG del perfil pasa a ser la carta | 🔒 Bloqueado | 7.14, 7.22 | §2.15, §3.4.4 · `RF-SHARE-03`, `RF-SHARE-04`, `RF-GAME-05` · la OG del perfil sigue contando solo semanas selladas (G1) |

### Emails

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 7.29 | `game.progress`: `emailSchedule` lo encola a las 19:00 (Madrid) si ese día hubo un cambio de rango o un logro épico o legendario, todo en uno (`game.progress:<cuenta>:<día>`); plantilla con las tarjetas de rango y de logros, texto plano y capturas | 🔒 Bloqueado | 7.9, 7.10 | §2.12, §3.8.12, §4.12, Anexo H · `RF-NOTIF-02`, `RF-NOTIF-03`, `RF-NOTIF-08`, `RF-NOTIF-13` · **Ya existe** en el catálogo (prioridad 50, `progress_on`). El reprocesado no lo dispara |
| 7.30 | `season.wrap` («Tu T4 de 2026 en cifras»): en el `batch` del cierre de temporada, a quien participó o votó en ella, con su posición, el campeón, semanas jugadas, mejor puesto, votos emitidos, logros y la carta del trimestre (la imagen de la 7.28); plantilla, texto plano y capturas | 🔒 Bloqueado | 7.11, 7.28 | §2.12, Anexo H · `RF-NOTIF-15`, `RF-NOTIF-03`, `RF-NOTIF-13` · test con una temporada simulada · **Ya existe** en el catálogo (prioridad 60, `season_on`) |
| 7.31 | La capa de juego en los avisos que ya salen: `battle.monday` y `battle.results` con XP, racha y oído de oro; `battle.reminder` en su versión «racha en peligro» (racha ≥ 3: «Tu racha de 5 semanas está en juego», con el comodín si lo tiene); contrato de voto ciego sobre lo renderizado | 🔒 Bloqueado | 7.10 | §2.12, §2.12.2, Anexo H · `RF-NOTIF-07`, `RF-NOTIF-13` · pendiente desde la F5 (5.12) y la F6 |

### Verificación y cierre

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 7.32 | Datos de prueba de la capa de juego: `seedBattle` y los fixtures de E2E con niveles de varios rangos, logros de cada rareza, una racha con el comodín gastado, una temporada cerrada con campeón y récords para el salón | 🔒 Bloqueado | 7.11, 7.16 | para la 7.33 y las capturas de la 7.35 |
| 7.33 | E2E del hito: votar enseña «+5 XP» y sube el medidor; la subida da su XP; el sellado reparte el XP de resultado y el oído de oro; re-sellar sin cambios y reprocesar no duplican XP; la subida de nivel sale una vez (recargar no la repite); un aviso de logro; una temporada de 13 semanas cierra con campeón, su ceremonia y `season.wrap`; perfil (carta 3D, y plana con «reducir movimiento»), salón y temporada con teclado; `game.progress` capturado | 🔒 Bloqueado | 7.21, 7.23–7.31, 7.32 | §5 · hito |
| 7.34 | Accesibilidad y rendimiento de la capa: el recorrido con calidad apagada, sin sonido, con «reducir movimiento» y en modo serio (§3.10); axe en las pantallas nuevas; las regiones vivas con lector de pantalla; destellos del aviso legendario y de la subida de nivel (≤ 3 por segundo); banco de FPS del perfil con la carta; el trozo de la carta después de la primera pintura y los presupuestos | 🔒 Bloqueado | 7.20, 7.23, 7.24, 7.25, 7.26, 7.27 | §3.10, §4.17 · `RNF-A11Y-03..05`, `RNF-A11Y-07`, `RD-MOT-04`, `RNF-PERF-01`, `RNF-PERF-03`, `RNF-PERF-04` · la auditoría completa, en la F10 |
| 7.35 | Jurado visual de tres lentes: HUD con XP y teselas, XP flotante, avisos de logro y subida de nivel (fotogramas), carta (anverso, reverso y variantes; 3D y plana) y su pase, perfil, salón de la fama, temporada, ceremonia del campeón, emails `game.progress` y `season.wrap`, tarjeta para *stories* e imagen OG del perfil | 🔒 Bloqueado | 7.33, 7.34 | `RD-VIS-02` · acta en `docs/planning/evidence/f7/jurado` |
| 7.36 | Cierre de la fase: criterio de aceptación, cobertura de ids, huecos G1–G14 resueltos en la guía y CI en verde | 🔒 Bloqueado | 7.35 | — · el «en producción» del hito se registra cuando el usuario despliegue (decisión del 2026-10-29) |

---

## Entregable

Jugar da XP: votar enseña «+5 XP» que vuela al medidor del HUD, subir y quedar bien suman con la racha, y el sellado
reparte el resultado y el oído de oro. Se sube de nivel y de rango con su estampa (una vez), los logros saltan con su
rareza y su sonido, la temporada tiene clasificación pública y campeón con su ceremonia, el salón de la fama guarda
ganadores y récords, y el perfil enseña la carta de luchador colgada de su pase, con su historial y su vitrina. Los
emails de progreso y de temporada llegan sin saturar, y nada de esto cambia una clasificación ni dice quién está en
una semana ciega.

## Criterio de aceptación

1. Todos los ids de la tabla de cobertura verificados (los de otras fases, con la suya).
2. E2E del hito (7.33) en verde: XP en vivo y al sellar, reprocesado sin duplicados, subida de nivel una vez, aviso de
   logro, cierre de temporada con campeón, ceremonia y `season.wrap`, perfil con la carta (3D y plana), salón,
   temporada y `game.progress`.
3. Juego limpio: la clasificación no depende del XP, los niveles ni los logros (`RF-GAME-10`, en reglas y servidor), y
   nada público de la capa de juego (`me` aparte) revela antes del sellado quién participa en una semana ciega (G1).
4. Idempotencia: re-ejecutar el sellado y el reprocesado no cambia ni el XP ni los logros (`RF-GAME-01`).
5. Con calidad apagada, sin sonido, con «reducir movimiento» y en modo serio se pierde espectáculo, nunca información:
   carta plana, fundidos, equivalentes visuales; nada destella más de 3 veces por segundo.
6. Presupuestos: la carta 3D en su trozo diferido, que no se descarga antes de la primera pintura; 60 fps en el perfil
   con la carta en escritorio.
7. Jurado visual de tres lentes sin hallazgos altos ni medios abiertos, incluido que el pase no se lea como el del
   sello.
8. Los huecos G1–G14 resueltos en la guía (versión y registro de cambios).
9. `pnpm check`, `typecheck`, `test`, `build` y `e2e` en verde en la CI.
10. «En producción» (hito de §5): cuando el usuario despliegue, con el reprocesado (7.16) confirmado por él.

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-29 | 7.7, 7.8, 7.15 | **Datos y servidor de la capa de juego** (rama `feat/7.7-datos-capa-de-juego`, apilada sobre la de las reglas): migración `0008_capa_de_juego`, solo aditiva (`xp_event` con `week_id` y una sola primera entrada por semana, `achievement_unlock`, `streak_state` y `entry.challenge_claimed`); esquemas Zod de la capa en `@beatbattle/shared`; el módulo `game` con `plan` (movimientos, logros, `level_20` en SQL y la caché, todo idempotente para el `batch` del hecho) y `voteGrant` (el tope contado en el libro y en la sentencia); y la capa en la exportación y el borrado de la cuenta. Hueco G4 resuelto (`RF-ENT-13`). Guía v0.6.99–v0.6.101. Tests: 437 en el servidor (23 nuevos), 72 en `@beatbattle/shared` (10 nuevos); `pnpm check` y `typecheck` en verde. Desbloquea la 7.9, la 7.10 y la 7.14. |
| 2026-10-29 | 7.17 | Efectos de logro `ach.common`, `ach.rare`, `ach.epic` y `ach.legendary` como `SfxDef` en la tonalidad de la semana, renderizados *offline* y medidos a su nivel en las 24 tonalidades; bloque «Logros» en la galería. Pendiente: la escucha del usuario y desdoblar la fila del Anexo D en la guía. No desbloquea nada por sí sola (la 7.20 espera también a la 7.13 y la 7.18). |
| 2026-10-29 | 7.1–7.6 | **Reglas de la capa de juego** en `packages/rules` (rama `feat/7.1-reglas-capa-de-juego`): `xpFor` con el Anexo B, la racha con comodín, `goldenEar` sin los votos del jurado, `seasonStandings` con desempates y campeón, el catálogo de 36 logros con `evaluate` y la guarda de `RF-GAME-10`. 360 tests en `packages/rules` (108 nuevos), `pnpm check` y `typecheck` en verde. Guía v0.6.92–v0.6.97: huecos G3, G8, G9, G10, G11, G12 y G14 resueltos y G4 en su parte de regla. Siguiente: la 7.7 (migración), que desbloquea el servidor. |
| 2026-10-29 | — | Plan creado (36 tareas: 6 de reglas, 10 de datos y servidor, 5 de sonido y HUD, 7 de carta, perfil, salón y temporada, 3 de emails y 5 de verificación y cierre). El usuario abre F7–F10 antes de que acabe la beta («todo hasta el lanzamiento»): `main` puede ir por delante de producción. Inventario de lo que ya existe (niveles, Spearman, puntos de temporada, constantes, `PlayerCard`, `ProducerCard`, perfil vacío) y 14 huecos de la guía (G1–G14), que se resuelven al empezar su tarea. |
