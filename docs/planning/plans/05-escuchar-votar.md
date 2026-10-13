# Plan 05 — Escuchar y votar

> Fase: 5 de 10 | Estado: 🔄 En curso | Iniciado: 2026-10-13 | Cerrado: —
> Hito del roadmap: dos usuarios se votan; todas las reglas `RF-VOTE-*` en verde; Modo Jurado completo con
> teclado; recordatorio, llamada al jurado y primeros votos.

Deja resuelto **el bucle del oyente**: un reproductor global que iguala la sonoridad, la rejilla «ELIGE
ENTRADA», la ficha de la entrada y el Modo Jurado (TÚ contra una entrada), con el recibo de escucha y el
voto comprobados en el servidor. Es la fase donde el juego limpio (§1.3) se juega de verdad: todo lo que se
construye aquí lo ve alguien que vota.

**Riesgos principales:**

- **Fugas antes del sellado** (`RF-PLAY-05`, `RF-VOTE-07`, `RNF-SEC-04`, `RF-NOTIF-13`). Cada ruta nueva
  (lista, cola del jurado, crónica, estadísticas del dueño) y cada email nuevo es una puerta para una media,
  un recuento por entrada, una posición o una autoría. El contrato de voto ciego se amplía en cada tarea, no
  solo al final.
- **El recibo de escucha** (§2.7, §4.7.3). El cliente cuenta lo que de verdad suena (`audio.played`) y el
  servidor solo puede comprobar tiempo de reloj desde el inicio. Es fricción, no garantía; lo importante es
  que el servidor nunca acepte un voto sin un `listen` cualificado y con el tiempo cumplido.
- **El reproductor global** (§2.6, §4.7.3). Un solo `HTMLAudioElement` compartido por la ficha, la rejilla,
  el Modo Jurado y la home (sample), sin cortes al navegar, con la ganancia que solo atenúa y Media Session.
  Si se rompe, se rompe en todas las pantallas a la vez.
- **El Modo Jurado como pantalla VS** (§3.8.7). Es la pantalla más «de juego» y la más fácil de pasarse:
  nunca dos entradas puntuables, ni barra de vida, ni «K.O.», ni la trama reaccionando a la entrada
  (`RD-MOT-06`).

---

## Decisiones de partida

- **Arranque (2026-10-13).** La F4 está cerrada; la F2 y la F3 tienen su hito cumplido y solo esperan
  comprobaciones del usuario (2.11, 2.22, 2.26 y 3.21). Nada de esta fase depende de ellas.
- **XP, logros y rachas, en la Fase 7** (§2.10). El Modo Jurado lleva el **combo** de la sesión (cosmético,
  solo en el cliente, §3.4.2), pero no el «+5 XP» flotante ni el logro de «Jurado completo», que necesitan
  `xp_event` y el catálogo de logros. Igual que en la F4, el XP de los votos ya emitidos lo puede dar la F7
  (`xp_event` es idempotente por `(user, kind, ref)`). La versión «racha en peligro» de `battle.reminder`
  también espera a la F7 (`streak_state`): aquí sale la versión normal.
- **`RF-PLAY-08` (la ficha tras el sellado), en la Fase 6.** Necesita la tabla `result` y la clasificación.
  La ficha de esta fase está preparada para recibir esos cuatro elementos, pero no los inventa.
- **La moderación, en la Fase 10.** Aquí se guarda la denuncia (`RF-VOTE-12`) y se registra la señal de IP
  del voto (`ip_signal`, hash con sal, §4.14) para que el informe de anomalías (`RF-MOD-03`) tenga datos.
  La cola del admin, las acciones y el informe son de la F10.
- **`RF-VOTE-14` (feedback privado), fuera del MVP** (post-lanzamiento, se especifica al abrir la F8).
- **El analizador solo alimenta al Escenario con el sample o con semanas selladas** (`RD-MOT-06`): mientras
  suena una entrada sin sellar, la trama no reacciona al audio.
- **Recuentos de semana sí, de entrada no.** La crónica puede decir «340 VOTOS ESTA SEMANA» (§3.8.3) porque
  es un total de la semana, como el número de entradas de la 4.8; nunca el de una entrada concreta, salvo a
  su dueño (`GET /stats`, `battle.first_votes`) y siempre sin la media.
- **Componentes ya hechos.** `ui/Stars` (1.5: dormidas, despertar, voto, `RF-VOTE-10`), `ui/Waveform`
  (`RF-PLAY-06` con teclado), `ui/EntryCell`, `ui/EntryRow` (`RF-PLAY-05`, `RF-PLAY-09`) y `ui/FighterCard`
  existen desde la F0 y la F1; `playbackGainDb` (`RF-PLAY-03`) y `listenThresholdMs` (`RF-VOTE-04`) están en
  `packages/rules`, y la tabla `vote`, en el esquema desde la 4.3. Esta fase los conecta.

## Dependencia con otras fases

- **Requiere:**
  - de la Fase 4: entradas `active` con alias, portada, onda, `gainDb` y `streamUrl` firmado; la ficha pública
    `GET /api/entries/:id` con su contrato de voto ciego; la tabla `vote`; la semana pública con
    `viewer.entry`;
  - de la Fase 3: fases de la semana con reloj inyectable, sellado perezoso, `tick` con *lease* y el
    reproductor del sample (`useSamplePlayer`);
  - de la Fase 2: cuentas verificadas y bloqueo (`admin`), la cola de email con familias, preferencias
    (`reminder_on`, `jury_call_on`, `first_votes_on`) y bajas;
  - de la Fase 1: motor de audio con los efectos (`star.*`, `vote.*`, `jury.swap`, `combo.up`) y el
    Escenario.
- **Habilita:** la Fase 6 (sellar con votos reales, ficha con resultados, ceremonia).

## Cobertura de la especificación

| Id | Tarea(s) | Verificación |
|----|----------|--------------|
| `RF-PLAY-01` | 5.13 | E2E: suena una entrada, se navega de la home a un perfil y el audio sigue (`currentTime` avanza) |
| `RF-PLAY-02` | 5.13, 5.23 | componente: `navigator.mediaSession.metadata` con título, alias, portada y los cuatro manejadores; manual: controles del sistema en Chrome (Android, si lo hay) |
| `RF-PLAY-03` | 5.1, 5.13 | propiedades de `playbackGainDb` (ya en `packages/rules`) + componente: −8 LUFS → ganancia de −6 dB con rampa de 50 ms; −18 LUFS → 0 dB; «master tal cual» → 0 dB salvo en el Modo Jurado |
| `RF-PLAY-04` | 5.1, 5.3, 5.16 | propiedades: con 0, 5 y 2 votos el orden es 0, 2, 5; servidor: `order=fair` lo respeta; E2E de la rejilla |
| `RF-PLAY-05` | 5.3, 5.7, 5.8, 5.9, 5.10 | test de contrato sobre todas las rutas públicas de semana y entrada con una semana sin sellar |
| `RF-PLAY-06` | 5.17, 5.18 | ya cubierto en `ui/Waveform`; E2E en la ficha y en el Modo Jurado (←/→ 5 s, Inicio/Fin) |
| `RF-PLAY-07` | 5.7, 5.14 | servidor: una escucha por sesión (`play_count` sube una vez), límite por IP y entrada; componente: el cliente llama a los 10 s seguidos |
| `RF-PLAY-08` | — | **Fase 6** (necesita `result`) |
| `RF-PLAY-09` | 5.13, 5.18 | ya cubierto en `ui/EntryRow`; componente del reproductor (404 → aviso y reintentar) y E2E: en el Modo Jurado salta a la siguiente |
| `RF-VOTE-01` | 5.2, 5.5 | test: `stars` 0, 6 o 3.5 → 422 |
| `RF-VOTE-02` | 5.5, 5.15 | test: votar 3 y después 5 deja un voto de 5 con `updated_at` nuevo |
| `RF-VOTE-03` | 5.5, 5.17 | test: 403 `OWN_ENTRY`; componente: la propia entrada no lleva estrellas |
| `RF-VOTE-04` | 5.4, 5.5, 5.14 | test con reloj: sin escucha → 409 `LISTEN_REQUIRED`; a los 20 s de 3 min → 409; a los 31 s → 200 |
| `RF-VOTE-05` | 5.5 | test: tras `vote_ends_at` → 409 `VOTING_CLOSED` aunque no esté sellada |
| `RF-VOTE-06` | 5.5 | test: sin verificar → 403 `EMAIL_NOT_VERIFIED`; bloqueado → 401 |
| `RF-VOTE-07` | 5.3, 5.8, 5.10 | ver `RF-ENT-10` y `RNF-SEC-04` |
| `RF-VOTE-08` | — | hecho en la 4.1 |
| `RF-VOTE-09` | 5.1, 5.8, 5.18, 5.21 | E2E del Modo Jurado con teclado completo |
| `RF-VOTE-10` | 5.14, 5.18 | ya cubierto en `ui/Stars`; E2E con reloj: dormidas → despiertan a los 30 s |
| `RF-VOTE-11` | 5.5 | test: el voto 121 dentro de la hora → 429 |
| `RF-VOTE-12` | 5.6, 5.19 | test: segunda denuncia del mismo usuario a la misma entrada → 409; E2E del diálogo |
| `RF-VOTE-13` | 5.5, 5.15 | test: `DELETE` → 204 y la entrada vuelve a la cola del jurado |
| `RF-VOTE-14` | — | **Fuera del MVP** (post-lanzamiento) |
| `RF-NOTIF-08` | 5.11 | escenario: 5 avisos en una semana → salen 3 por prioridad y 2 quedan `skipped`; nada sale de 22:00 a 08:00 |
| `RF-NOTIF-13` | 5.12 | contrato sobre el contenido renderizado de cada plantilla con una semana sin sellar |
| `RNF-SEC-04` | 5.10 | el test que recorre las rutas públicas incluye las nuevas (lista, cola, crónica, `play`) |
| `RD-MOT-06` | 5.13, 5.18 | componente: con una entrada sin sellar el analizador no llega al Escenario; con el sample, sí |
| `RNF-A11Y-06` | 5.18 | ya cubierto en `ui/Stars`; E2E: en el Modo Jurado ←/→ eligen nota con el cursor en las estrellas |
| `RD-VIS-02` | 5.22 | jurado visual de tres lentes |

---

## Tareas

### Reglas

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 5.1 | `packages/rules`: `fairOrder(entradas, votos, votadas, semilla)` con `fairSeed` (sin votar → menos votos → `hash(userId, weekId, entryId)`; visitantes, por día), `randomOrder` con semilla, `newestOrder` y `juryQueue` (activas, ajenas y sin votar en Ronda justa; saltar manda al final) | ✅ Hecho | — | §2.6, §2.7 · `RF-PLAY-04`, `RF-VOTE-09` · propiedades con fast-check: determinismo, permutación, 0/2/5, propias nunca en la cola · **Hecho:** `fair.ts` con `fairSeed`, `fairOrder`, `newestOrder`, `randomOrder` y `juryQueue`; 11 tests en `test/fair.test.ts` (el ejemplo 0/2/5, grupos y votos crecientes, permutación independiente del orden de llegada, semilla por usuario y por día en Madrid, saltos y voto quitado). Guía v0.6.60 (§4.5) |

### Servidor

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 5.2 | Esquema y migración: `listen`, `report`, `ip_signal`; esquemas Zod en `@beatbattle/shared` (lista, voto, escucha, denuncia, cola, crónica, estadísticas) y códigos de error (`OWN_ENTRY`, `LISTEN_REQUIRED`, `VOTING_CLOSED`, `REPORT_EXISTS`) | ✅ Hecho | — | §4.10, §4.11 · `RF-VOTE-01` (Zod: enteros 1–5) · **Hecho:** migración `0006_escuchar_votar`; `packages/shared/src/votes.ts` con sus tests (`RF-VOTE-01`, sin orden «mejor valoradas», nada de medias en la lista ni autoría en la crónica); borrado y exportación de la cuenta con las tablas nuevas, retirada y sustitución del audio que borran los recibos, y purga de `ip_signal` a los 7 días en el `tick`. Guía v0.6.61 |
| 5.3 | `GET /api/weeks/:slug/entries?order=fair\|new\|random&genre=&bpm=&key=&unvoted=`: activas, sin autoría ni notas sin sellar; con sesión, `myVote` | ✅ Hecho | 5.1, 5.2 | §2.6, §4.10 · `RF-PLAY-04`, `RF-PLAY-05`, `RF-VOTE-07` · **Hecho:** `entries.list` con los tres órdenes de `fair` y los filtros; tests en `test/votes.test.ts` (0/2/5, votadas al final con `myVote`, `mine`, filtros, semilla, sin autoría ni cifras y con autoría al sellar, 404 antes del drop) |
| 5.4 | Recibo de escucha: `POST /api/entries/:id/listen` → `{ listenId, thresholdMs }` y `POST …/listen/qualify` (comprueba el tiempo de reloj desde el inicio con el reloj inyectable) | ✅ Hecho | 5.2 | §2.7, §4.7.3 · `RF-VOTE-04` · **Hecho:** módulo `votes`; un recibo por usuario y entrada; tests (sin escucha, 20 s y 31 s con el reloj, recibo ajeno) |
| 5.5 | Voto: `PUT`/`DELETE /api/entries/:id/vote` en un `batch` condicionado (fase `open`/`voting`, entrada activa y ajena, recibo cualificado; `ON CONFLICT DO UPDATE`); 120/h por usuario; `ip_signal`; al llegar a 5 votos, `battle.first_votes` en el mismo `batch` | ✅ Hecho | 5.4 | §2.7, §4.11 · `RF-VOTE-01..06`, `RF-VOTE-11`, `RF-VOTE-13` · **Hecho:** `INSERT … SELECT` condicionado en el `batch` con la señal de IP; tests de `RF-VOTE-01..06`, `-11`, `-13` e IP. `battle.first_votes` pasa a la 5.12, con su plantilla (el voto ya deja el gancho `extra` en su `batch`) |
| 5.6 | Denuncia: `POST /api/entries/:id/report` con motivo y detalle opcional, una por usuario y entrada | ✅ Hecho | 5.2 | §2.7, §2.13 · `RF-VOTE-12` · la cola del admin es de la F10 (`RF-MOD-01`) · **Hecho:** 201, `REPORT_EXISTS` a la segunda, la propia no; 20 por hora |
| 5.7 | Escuchas: `POST /api/entries/:id/play` (pública, límite por IP y entrada, una por sesión de escucha) y `GET /api/entries/:id/stats` (dueño: votos y escuchas, sin media) | ✅ Hecho | 5.2 | §2.6, §2.7 · `RF-PLAY-07`, `RF-PLAY-05` · **Hecho:** `play` (sesión, 3/h por IP y entrada, 202) y `stats` del dueño; tests |
| 5.8 | `GET /api/jury/queue?week=` (la cola de `juryQueue`) y `GET /api/me/votes?week=` | ✅ Hecho | 5.1, 5.5 | §2.7, §4.10 · `RF-VOTE-09`, `RF-VOTE-13` · **Hecho:** cola con la ronda y `me/votes`; tests (propia y votadas fuera, Ronda justa, vacía al cerrar, 401 sin sesión) |
| 5.9 | Crónica: `GET /api/weeks/:slug/ticker?since=` (nueva entrada por alias, días que quedan, votos de la semana) y el menú la usa | ✅ Hecho | 5.5 | §3.8.3 · `RF-PLAY-05` (nunca autoría ni recuentos por entrada) · **Hecho (servidor):** `GET /ticker` con tests; el menú la usa con el reproductor y la rejilla (5.16) |
| 5.10 | Contrato de voto ciego y de «nada de medias antes del sellado» ampliado a todas las rutas nuevas | ✅ Hecho | 5.3, 5.7, 5.8, 5.9 | §1.3 · `RNF-SEC-04`, `RF-PLAY-05`, `RF-VOTE-07` · **Hecho:** `test/blindContract.test.ts` recorre lista (los tres órdenes y el filtro), ficha, semana, crónica y cola, sin sesión y con la de quien vota, con votos reales: ni ids, nombres, emails ni avatares de los productores, ni claves de medias, recuentos por entrada o posiciones; sellada, la autoría aparece |

### Emails

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 5.11 | Política al enviar: horas de silencio (22:00–08:00 Madrid, se retiene hasta las 08:00) y tope de 3 avisos por usuario y semana con la prioridad de §2.12.4 (lo que no cabe, `skipped`) | ⬜ Listo | — | §2.12.4, §4.19.3 · `RF-NOTIF-08` |
| 5.12 | Plantillas `battle.reminder` (sin la variante de racha, F7), `battle.jury_call` y `battle.first_votes`; programación en el `tick` (sábado 18:00, domingo 17:00) y `battle.first_votes` en el `batch` del voto que hace el quinto (de la 5.5), con clave de idempotencia; contrato de voto ciego sobre lo renderizado; capturas en `evidence/f5/emails/` | ⬜ Listo | 5.5, 5.11 | §2.12, §3.8.12, Anexo H · `RF-NOTIF-13`, `RF-NOTIF-02`, `RF-NOTIF-03` |

### Cliente

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 5.13 | Reproductor global: almacén `player` (Zustand), un único `HTMLAudioElement` (`preload` según intención), ganancia con rampa de 50 ms, «Escuchar el master tal cual» en Ajustes, Media Session, error con reintentar, barra fina en escritorio y mini reproductor en móvil; el sample de la home pasa por él; analizador al Escenario solo con el sample o semanas selladas | ⬜ Listo | — | §2.6, §4.7.3, §3.5 · `RF-PLAY-01..03`, `RF-PLAY-09`, `RD-MOT-06` |
| 5.14 | Escucha acumulada desde `audio.played` con `listen`/`qualify`, la escucha (`play`) a los 10 s seguidos y las estrellas conectadas al medidor | ⬜ Listo | 5.4, 5.7, 5.13 | §4.7.3 · `RF-VOTE-04`, `RF-VOTE-10`, `RF-PLAY-07` |
| 5.15 | Voto optimista: mutación de TanStack Query con reversión y sonido de error; estados «Guardando» y «No se ha guardado» de las estrellas; quitar el voto | ⬜ Listo | 5.5, 5.14 | §3.8.4, §4.7.2 · `RF-VOTE-02`, `RF-VOTE-13` |
| 5.16 | «ELIGE ENTRADA» en `/semana/:slug`: ficha de luchador de la enfocada, pestañas Q/E, «Solo sin votar», filtros (F), rejilla `listbox` 2D con casilla «?», votadas al final y atenuadas, paginado por filas, J al Modo Jurado; móvil con hoja inferior. El menú pasa a usar la crónica de `/ticker` (de la 5.9) | ⬜ Listo | 5.3, 5.13 | §3.8.13 · `RF-PLAY-04` |
| 5.17 | Ficha `/e/:id`: portada con inclinación, onda clicable, metadatos, estrellas (no en la propia), compartir y denunciar; el dueño ve votos y escuchas sin media | ⬜ Listo | 5.7, 5.15 | §2.6, §3.8.14 · `RF-PLAY-06`, `RF-VOTE-03` · `RF-PLAY-08` en la F6 |
| 5.18 | Modo Jurado `/jurado` como pantalla VS: HUD (medidor de escucha, ronda con pips, contador del umbral, placa rayada), silueta del jurado contra la portada, VS y nota fija; panel con onda, combo y estrellas; teclas 1–5, Espacio, ←/→ según el cursor, S, R y Esc; autoavance tras votar con el cambio por la diagonal; precarga de la siguiente; «¡JURADO COMPLETO!» con el resumen; móvil | ⬜ Listo | 5.8, 5.15 | §3.8.7, §3.4.2, §3.4.6 · `RF-VOTE-09`, `RF-PLAY-09`, `RD-MOT-06`, `RNF-A11Y-06` · sin XP ni logro (F7) |
| 5.19 | Diálogo de denuncia (ficha y R en el Modo Jurado) | ⬜ Listo | 5.6, 5.17 | §2.7 · `RF-VOTE-12` |

### Verificación y cierre

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 5.20 | Datos de prueba: semana en `voting` con 24 entradas de varios productores y audios del almacenamiento falso (`tools/seed` y fixtures de E2E) | ⬜ Listo | 5.5 | para la 5.21 y las capturas de la 5.22 |
| 5.21 | E2E del hito: dos usuarios se votan con teclado (rejilla → ficha → Modo Jurado), todas las reglas `RF-VOTE-*` y los tres emails capturados en el `Mailer` en memoria con el reloj simulado | ⬜ Listo | 5.12, 5.16, 5.17, 5.18, 5.19, 5.20 | §5 · hito de la fase |
| 5.22 | Jurado visual de tres lentes (juego, marca y accesibilidad) sobre la rejilla, la ficha, el Modo Jurado, el reproductor y los emails, en los tamaños de referencia | ⬜ Listo | 5.21 | §3 · `RD-VIS-02` · acta en `evidence/f5/jurado/` |
| 5.23 | ⚠️ Prueba real: el reproductor global sobre un MP3 firmado de Cloudinary (prefijo de desarrollo), con la ganancia, el analizador y Media Session en Chrome | ⬜ Listo | 5.13 | `RF-PLAY-02`, §4.8 · crea y borra recursos en Cloudinary: con confirmación |
| 5.24 | Cierre de la fase: criterio de aceptación, cobertura de ids y CI en verde | ⬜ Listo | 5.22, 5.23 | — |

---

## Entregable

Con una semana en votación, cualquiera escucha las entradas en la rejilla y en su ficha con la sonoridad
igualada y sin cortes al navegar; quien tiene la cuenta verificada vota de 1 a 5 tras escuchar 30 s, cambia o
quita su voto hasta el cierre y denuncia; el Modo Jurado encadena la cola entera con el teclado. Los avisos de
recordatorio, llamada al jurado y primeros votos salen respetando silencio y tope.

## Criterio de aceptación

1. Todos los ids de la tabla de cobertura verificados (salvo los aplazados con su fase).
2. E2E del hito en verde: dos usuarios se votan con teclado y salen los tres avisos.
3. Contrato de voto ciego (`RNF-SEC-04`, `RF-PLAY-05`, `RF-NOTIF-13`) sobre todas las rutas públicas y
   plantillas nuevas.
4. Jurado visual de tres lentes sin hallazgos altos ni medios abiertos.
5. Prueba real del reproductor sobre Cloudinary hecha (o aplazada con motivo y conformidad del usuario).
6. `pnpm check`, `typecheck`, `test`, `build` y `e2e` en verde en la CI.

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-13 | 5.3–5.10 | Servidor del voto: lista, recibo de escucha, voto, denuncia, escuchas, cola, crónica y contrato de voto ciego (guía v0.6.62). `battle.first_votes` pasa a la 5.12. |
| 2026-10-13 | 5.2 | Esquema (`listen`, `report`, `ip_signal`), esquemas Zod del voto y códigos de error (guía v0.6.61). |
| 2026-10-13 | 5.1 | Ronda justa, órdenes y cola del jurado en `packages/rules` con propiedades (guía v0.6.60). |
| 2026-10-13 | — | Plan creado (24 tareas). |
