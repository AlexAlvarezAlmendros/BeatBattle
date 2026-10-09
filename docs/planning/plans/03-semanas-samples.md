# Plan 03 — Semanas y samples

> Fase: 3 de 10 | Estado: 🔄 En curso | Iniciado: 2026-10-09 | Cerrado: —
> Hito del roadmap: el admin programa 3 semanas; con el reloj simulado, la home cambia de semana en la
> frontera, la descarga exige las bases y sale el email del drop (también a suscriptores sin cuenta).

Deja resuelto **el calendario**: qué semana está en juego en cada instante, el sample que cae cada lunes,
cómo se descarga y cómo se avisa. La fase de una semana nunca se guarda: se deriva de sus tres instantes y
de `now` (`RF-DROP-01`). Por eso el reloj inyectable y las fronteras en `Europe/Madrid` son la base de
todo lo demás.

**Riesgos principales:**

- **Las fronteras con cambio de hora** (`RF-DROP-05`). Se calculan una vez al programar, con `Intl`, y se
  prueban con propiedades.
- **La entrega firmada de Cloudinary** (`RF-DROP-07`). Su comprobación real usa la cuenta propia de
  BeatBattle en el prefijo de desarrollo y necesita confirmación, como en la 2.19. Los E2E usan el
  almacenamiento falso en disco.

---

## Decisiones de partida

- **Arranque de la fase (2026-10-09).** La Fase 3 empieza con la 2.22 (Discord real), la 2.11 (IMAP real)
  y la 2.26 (cierre) de la Fase 2 abiertas. Solo dependen de comprobaciones manuales del usuario con sus
  credenciales. Nada de esta fase depende de ellas, y el usuario pidió seguir implementando.
- **Origen y licencia de los samples** (decisión abierta, §7, «antes de la Fase 3»). Se usa el valor por
  defecto: samples del sello o de sus productores, con licencia escrita. No bloquea el código: la licencia
  es un texto obligatorio del sample (§2.4). Antes de la beta, el usuario elige los samples reales.
- **Cuenta atrás en GIF sin dependencia nueva.** La paleta es fija (negro, rojo, blanco y granate) y no
  hay ninguna biblioteca de GIF en §4.1. Por eso el codificador GIF89a (LZW) y los dígitos se escriben en
  el servidor, con sus tests, y no hace falta preguntar por una dependencia.
- **Medición de los samples con ffmpeg** (`ffmpeg-static`, ya en §4.1, validado en la 1.8). Es la misma
  medición que usarán las entradas en la Fase 4. Duración, sonoridad y forma de onda son siempre del
  servidor, nunca del navegador del admin.
- **El sellado de la Fase 3 es solo el mecanismo** (`RF-DROP-03`): perezoso, con *lease* e idempotente,
  con un snapshot vacío porque aún no hay entradas. La clasificación que lo llena es de la Fase 6, que
  repite el test byte a byte con entradas y votos.

## Dependencia con otras fases

- **Requiere:**
  - de la Fase 2: cuentas, guardas (`requireVerified`, `requireAdmin`), la cola de email con sus
    preferencias, la tabla `email_subscriber` y las bajas, y `ImageStorage` para las portadas;
  - de la Fase 1: la firma de Cloudinary y ffmpeg.
- **Habilita:** la Fase 4 (subir una entrada a la semana `open`, con `AudioStorage` y la medición), y el
  sellado y los avisos programados de las fases 5 y 6.

## Cobertura de la especificación

| Id | Tarea(s) | Verificación |
|----|----------|--------------|
| `RF-DROP-01` | 3.1, 3.2 | propiedades de `phaseOf` en las fronteras (±1 ms) |
| `RF-DROP-02` | 3.7 | test: programar una semana que solapa → 409 `WEEK_OVERLAP` |
| `RF-DROP-03` | 3.9 | test: sellar dos veces da el mismo snapshot byte a byte; dos sellados concurrentes dejan un único resultado |
| `RF-DROP-04` | 3.12, 3.15 | test del `tick` con el calendario vacío a 72 h (email al admin) + home con «Próximo drop pronto» |
| `RF-DROP-05` | 3.1 | test: la semana del 23-03-2026 dura 167 h y la del 19-10-2026, 169 h |
| `RF-DROP-06` | 3.10, 3.16 | test: sin aceptar → 409 `RULES_NOT_ACCEPTED`; aceptadas → 200 con `downloadUrl` |
| `RF-DROP-07` | 3.4, 3.10 | test: la URL lleva firma, `fl_attachment` y caducidad de 1 h + prueba real ⚠️ (pasada la hora, 401) |
| `RF-DROP-08` | 3.10, 3.18 | test: `sample_download` con `first_at` y `count`; el recuento en el panel de admin |
| `RF-DROP-09` | 3.8, 3.16 | test: la semana pública lleva el MP3 de escucha firmado; E2E: el visitante oye el sample y la descarga le pide entrar |
| `RF-DROP-10` | 3.2, 3.15 | propiedades de `countdownOf` + E2E con el reloj simulado a 1 h del cierre: `00:00:59:59` y modo «última hora» |
| `RF-DROP-11` | 3.11, 3.17 | test de `seen_flag` + E2E: segunda visita sin revelación; «Ver otra vez» la reproduce |
| `RF-ADM-01` | 3.6, 3.18 | E2E: subir sample, marcar 8 chops, guardar |
| `RF-ADM-02` | 3.7, 3.18 | `RF-DROP-02` y `RF-DROP-05` + calendario con los huecos en rojo |
| `RF-NOTIF-09` | 3.13, 3.15 | E2E: alta sin cuenta → `alert.confirm` capturado → confirmar → `battle.drop` el lunes → registrarse con el mismo email fusiona; sin confirmar en 7 días se borra |
| `RF-NOTIF-14` (cuenta atrás) | 3.14 | test: la imagen cambia entre dos peticiones separadas un minuto; caché de 30 s |
| `RNF-SEC-02` (altas sin cuenta) | 3.13 | test: 3 por hora e IP |
| `RF-AUTH-03` | 3.5 | un test por cada ruta nueva de `/api/admin/*`: un productor recibe 403 |
| `RF-ADM-05` | 3.5–3.7 | test por acción de admin de esta fase: `audit_log` con actor, acción, objetivo y carga |
| `RNF-PRIV-01` | 3.3 | las tablas nuevas con datos personales (`rules_acceptance`, `sample_download`, `seen_flag`) entran en la exportación y el borrado |
| `RD-VIS-02` | 3.15–3.18, 3.21 | lint, firma en cada ruta nueva, recorrido con teclado y acta del jurado |
| `RNF-A11Y-01`…`-05` | 3.15–3.17, 3.21 | teclado, axe, variante sin movimiento de la revelación y equivalente visual de `drop.needle` |

**Fuera de esta fase, a propósito:**

- de `RF-NOTIF-14`, la tarjeta de resultado firmada (Fase 6: necesita resultados);
- `RF-NOTIF-07` (el Lunes de batalla combinado, Fase 6). Hasta entonces, el lunes sale `battle.drop` a
  quien tiene activo el aviso de drop;
- `RF-ADM-03` (panel de la semana con métricas, Fase 5, salvo el recuento de descargas, que entra aquí);
- `RF-ADM-04` (uso de Cloudinary, Fase 4, con `usage()`);
- `RF-STO-*` de las entradas (Fase 4). Aquí se cubre la parte de los samples: firma, `authenticated`,
  verificación con la Admin API y medición en servidor.

---

## Tareas

### Reglas (`packages/rules`)

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 3.1 | `calendar`: `scheduleWeek(lunes)` → `startsAt`, `submitEndsAt`, `voteEndsAt` en UTC, desde las horas de pared de `balance.ts` en `WEEK_TIME_ZONE` con `Intl` (sin aritmética de zonas en la lógica de fases); `isoWeekLabel` («2026-W41»), `weekSlug` («2026-w41»), `seasonOf` («2026-T4», por el trimestre de su lunes), `mondayOf(instante)` y `nextMonday`. Propiedades con fast-check: las fronteras son lunes 00:00 y domingo 20:00 de pared, la semana dura 167, 168 o 169 h, y semanas consecutivas encadenan sin hueco ni solape | ✅ Hecho | — | §2.1, §2.9, §4.5, §4.12 · `RF-DROP-05`, `RF-DROP-01` · **Hecho:** `calendar.test.ts` con propiedades sobre 1996–2090 (fronteras de pared contrastadas con otro formateador de `Intl`, 167/168/169 h, semanas encadenadas, `mondayOf` al ms, slug de ida y vuelta). La primera versión del test destapó que antes de 1996 España atrasaba la hora en septiembre: el generador empieza en la regla de la UE |
| 3.2 | `phase`: `phaseOf(semana, now)` → `scheduled`, `open`, `voting`, `sealing` o `sealed` (de los instantes y de `sealedAt`); `canSubmit`, `canVote`, `canDownload`; `countdownOf(semana, now)` → objetivo (cierre de envíos o de votos), días, horas, minutos y segundos, y `lastHour` (§3.6). Propiedades en las fronteras (±1 ms) | ✅ Hecho | 3.1 | §2.1, §2.4, §4.5 · `RF-DROP-01`, `RF-DROP-10` · **Hecho:** `phase.test.ts` con propiedades (fases en cada frontera ±1 ms, fase monótona, permisos, cuenta atrás). `LAST_HOUR_MS` al Anexo B y criterio de `RF-DROP-10` precisado (guía v0.6.42) |

### Servidor

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 3.3 | Tablas `sample`, `week`, `rules_acceptance`, `sample_download`, `seen_flag`, `job_lease` y `audit_log` (Drizzle + migración, sin cascadas). `rules_acceptance`, `sample_download` y `seen_flag` entran en el registro de datos de la cuenta (exportar y borrar) | ✅ Hecho | — | §4.11, §4.14 · `RNF-PRIV-01` · **Hecho:** migración `0003_semanas`; módulo `weeks` en el registro de la cuenta (test `RNF-PRIV-01` de exportar y borrar). |
| 3.4 | `AudioStorage` (§4.8.6) para los samples: firma de `video`/`authenticated` (original), `raw`/`authenticated` (stems ≤ 10 MB) e `image`/`upload` (portada ≥ 1000 px) con `public_id` fijo `<prefijo>/samples/<sampleId>/…`; `verify`, `streamUrl` (`f_mp3,br_192k` firmado), `downloadUrl(ttl)` con `fl_attachment`, `measure` (ffmpeg con `ebur128`: duración, sonoridad y 1000 bins `Int8`), `remove`. Más la implementación falsa en disco para los E2E. ⚠️ La comprobación real (subir un WAV al prefijo de desarrollo y ver el 401 pasada la hora) necesita confirmación | 🔄 En curso | 3.3 | §4.8 · `RF-STO-01..03` (samples), `RF-DROP-07`, `RF-DROP-09` · **Hecho (escrito y probado con el falso en disco):** `SampleStorage` de Cloudinary y en disco (`BB_FAKE_STORAGE`, rutas `/api/test/storage/*` con firma HMAC y caducidad), medición con ffmpeg portada del spike (`measure.test.ts`: −10 LUFS medidos entre −10,5 y −9,5). Desviación: la descarga es `private_download_url`, porque una URL firmada de entrega no caduca (guía v0.6.43). **Falta ⚠️:** la prueba real contra Cloudinary (401 pasada la hora), que necesita confirmación; y `includeFiles` del binario de ffmpeg en `vercel.json` con el primer despliegue. |
| 3.5 | Base de admin: `audit_log` con `recordAudit` en el mismo `batch` que la acción; las rutas nuevas de `/api/admin/*` tras `requireAdmin`; un test de 403 por ruta | ✅ Hecho | 3.3 | §2.14 · `RF-AUTH-03`, `RF-ADM-05` · **Hecho:** `auditStatement` en el mismo `batch`; test `RF-ADM-05` con las seis acciones y `RF-AUTH-03` en las once rutas nuevas. |
| 3.6 | Samples (admin): `POST /api/admin/samples/sign` (original, stems y portada), `POST /api/admin/samples` (verifica con la Admin API, mide y guarda), `PATCH` (metadatos, licencia, BPM, tonalidad, género, 8 *chops* validados contra la duración), `GET` lista y detalle, `DELETE` si ninguna semana lo usa | ✅ Hecho | 3.4, 3.5 | §2.4, §2.14 · `RF-ADM-01` · **Hecho:** firma (abre el id), crear (verifica las partes y mide), editar (chops validados contra la duración, nueva medición, stems), listar y borrar (409 `SAMPLE_IN_USE`). Tests `RF-ADM-01`, `RF-STO-03`. |
| 3.7 | Calendario (admin): `POST /api/admin/weeks` con el lunes, el sample, el reto, voto ciego y semana dorada. Las fronteras salen de `scheduleWeek`; el número, el slug, la temporada y `rules_version` los fija el servidor. Una semana que solapa da 409 `WEEK_OVERLAP`, y una pasada o ya abierta no se mueve. Además `PATCH`/`DELETE` de las semanas futuras y `GET` del calendario con los huecos | ✅ Hecho | 3.1, 3.5, 3.6 | §2.1, §2.14, §4.12 · `RF-DROP-02`, `RF-ADM-02` · **Hecho:** programar con `scheduleWeek`, 409 `WEEK_OVERLAP`, 409 `WEEK_LOCKED` (pasada o empezada), numeración por calendario que se recoloca al programar o borrar, calendario con huecos. Tests `RF-DROP-02`, `RF-ADM-02`/`RF-DROP-05` (169 h por la API). |
| 3.8 | `GET /api/weeks/current` (la semana `open` o `voting`; si no hay, la próxima programada o el estado vacío) y `GET /api/weeks/:slug`: ficha pública del drop con el MP3 de escucha firmado, la portada, los chips, la onda, el reto y los instantes, nunca el `public_id` del original. Lectura perezosa: tras el cierre, dispara el sellado | ✅ Hecho | 3.2, 3.7 | §2.1, §2.4, §4.10 · `RF-DROP-09` · **Hecho:** `current` (en juego o solo cuándo es el próximo) y `:slug` (404 antes del drop), con `viewer`. Test `RF-DROP-09`: el visitante oye el MP3 firmado; con la firma tocada, 401. |
| 3.9 | Sellado perezoso e idempotente: `sealWeek` con *lease* (`job_lease`) y `UPDATE … WHERE sealed_at IS NULL`; snapshot vacío en esta fase. Dos sellados (seguidos o concurrentes) dejan uno | ✅ Hecho | 3.8 | §2.1, §4.12 · `RF-DROP-03` · **Hecho:** `sealWeek` con *lease* y `UPDATE` condicionado; perezoso en las lecturas. Test `RF-DROP-03`: tres sellados a la vez dejan uno, y repetir no cambia la fila (byte a byte). |
| 3.10 | Bases y descarga: `POST /api/weeks/:slug/rules` (acepta la `rules_version` de la semana) y `POST /api/weeks/:slug/download { kind: 'original' \| 'stems' }`, que responde 403 `EMAIL_NOT_VERIFIED`, 409 `RULES_NOT_ACCEPTED`, 409 si la fase no lo permite, o 200 con la `downloadUrl` de 1 h. `sample_download` se actualiza con un *upsert* (`first_at`, `count`, `last_at`) | ✅ Hecho | 3.8 | §2.4 · `RF-DROP-06..08` · **Hecho:** rutas `POST /api/weeks/:slug/rules` y `/sample/download` (§4.10). Tests `RF-DROP-06`, `-07` (firma, adjunto, 401 a la hora en el falso), `-08` (recuento en el panel), `RF-AUTH-01` y la fase cerrada. |
| 3.11 | `seen_flag`: `GET`/`PUT /api/me/seen/drop/:slug`, que marca la revelación como vista | ✅ Hecho | 3.3 | §3.8.2 · `RF-DROP-11` · **Hecho:** `POST /api/me/seen { kind: 'drop', ref }` (§4.10) y `viewer.dropSeen`. Test `RF-DROP-11` (servidor). |
| 3.12 | `/api/cron/tick` con el secreto (`CRON_SECRET`) y *lease*: `sealWeeks`, `emailSchedule` (el lunes a las 08:00, `battle.drop`), `emailDrain` (ya existe), `cleanup` (suscripciones sin confirmar de más de 7 días, redirecciones caducadas) y `adminAlerts` (hueco en el calendario a 72 h: email a los admins, una vez por hueco). En `vercel.json`, el cron diario; y el flujo de GitHub Actions cada 15 min (fichero escrito; el secreto lo pone el usuario ⚠️) | ✅ Hecho | 3.9, 3.13 | §4.12 · `RF-DROP-04` · **Hecho:** `GET /api/cron/tick` con `Bearer` en tiempo constante, *lease* y tareas aisladas (`sealWeeks`, `emailSchedule`, `adminAlerts`, `cleanup`, `emailDrain`); `vercel.json` a las 06:00 UTC y `.github/workflows/tick.yml` cada 15 min, que no hace nada sin `BB_TICK_URL`. Tests de `RF-DROP-04` (aviso una vez por lunes; con semana, nada) y de `RF-DROP-03` desde el tick. **Falta ⚠️:** poner `BB_TICK_URL` y `BB_CRON_SECRET` en el repositorio y `CRON_SECRET` en Vercel, al desplegar. |
| 3.13 | Emails: plantillas `battle.drop` (portada, chips, reto, cuenta atrás en vivo, «Pillar el sample») y `alert.confirm`; alerta sin cuenta con `POST /api/alerts` (3 por hora e IP, sin revelar si el email ya está), `GET /api/alerts/confirm?token`, fusión al registrarse con el mismo email (conserva las preferencias) y borrado a los 7 días sin confirmar | ✅ Hecho | 3.3 | §2.12.3, §3.8.12, Anexo H · `RF-NOTIF-09` · **Hecho:** plantillas `battle.drop`, `alert.confirm` y `admin.calendar_gap` (asuntos ≤ 50); `POST /api/subscribe` (202 siempre, 3/h por IP) y `POST /api/subscribe/confirm`; fusión en los ganchos de Better Auth al quedar verificada la cuenta; borrado a los 7 días. Test `RF-NOTIF-09` de servidor (alta → confirmación → drop el lunes 08:00 sin duplicar; caducidad; fusión con un solo email). La página `/alerta` y el formulario, en la 3.15. |
| 3.14 | Cuenta atrás en GIF: `GET /api/email/countdown/:slug.gif`, 60 fotogramas desde el instante de la petición, con la paleta de la arena, caché de 30 s por semana y `alt` con el tiempo restante; codificador GIF89a propio | ✅ Hecho | 3.2, 3.8 | §4.19.5 · `RF-NOTIF-14` · **Hecho:** codificador GIF89a con LZW (ida y vuelta pasando de 4096 códigos) y cuenta atrás de 60 fotogramas, mirada decodificada con Pillow. Test `RF-NOTIF-14`: igual a los 10 s (caché), distinta al minuto. |

### Web

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 3.15 | Home con datos reales: `MenuWeek` desde `/api/weeks/current`, reloj de ronda con «última hora», el estado vacío «Próximo drop pronto» con el formulario «Avísame del próximo drop» (también en «Cómo se juega»), y la pantalla de título con la semana ISO | ⬜ Listo | 3.8, 3.13 | §3.8.1, §3.8.3, §2.12.3 · `RF-DROP-04`, `RF-DROP-10`, `RF-NOTIF-09` |
| 3.16 | `/semana/:slug`: ficha del drop (vinilo-sol al BPM, título y créditos, chips, onda reproducible con el MP3 firmado, cuenta atrás y reto). «Pillar el sample» abre el modal de las bases (5 puntos, enlace a las completas y casilla obligatoria) y descarga. El visitante oye el sample y, al pedir la descarga, le pide entrar | ⬜ Listo | 3.10, 3.15 | §2.4, §3.8.14 · `RF-DROP-06`, `RF-DROP-09` |
| 3.17 | Revelación del drop (§3.8.2, 6 s, saltable): oscurecer, anunciador «SEMANA N», vinilo que cae, `drop.needle`, título estampado y tragaperras de BPM y tonalidad. Una vez por semana (`seen_flag`; sin sesión, `localStorage`) y «Ver otra vez» en la ficha. Sin movimiento: fundido con los datos fijos | ⬜ Listo | 3.11, 3.15 | §3.8.2, Anexo E · `RF-DROP-11` |
| 3.18 | Panel `/admin` (modo denso, sin efectos): samples (subida firmada con progreso, metadatos, licencia y editor de 8 *chops* sobre la onda con teclado), calendario de semanas con los huecos en rojo y recuento de descargas por semana | ⬜ Listo | 3.6, 3.7, 3.10 | §2.14 · `RF-ADM-01`, `RF-ADM-02`, `RF-DROP-08` |

### Cierre

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 3.19 | Datos de prueba: `tools/seed` con 3 samples y 3 semanas sobre el almacenamiento falso | ⬜ Listo | 3.7 | — |
| 3.20 | E2E del hito con el reloj simulado: el admin programa 3 semanas; la home cambia de semana en la frontera; la descarga exige las bases; sale `battle.drop` (también al suscriptor sin cuenta, tras confirmar) | ⬜ Listo | 3.12–3.19 | §5 · hito |
| 3.21 | Jurado visual de tres lentes sobre la home viva, la ficha, la revelación, el modal de las bases y el panel de admin | ⬜ Listo | 3.15–3.18 | `RD-VIS-02` (e) |
| 3.22 | Cierre de la fase: cobertura de ids, hito y roadmap | ⬜ Listo | 3.20, 3.21 | — |

---

## Entregable

Un admin sube samples y programa semanas. La home enseña la semana en juego con su cuenta atrás y cambia
sola en la frontera. Cualquiera oye el sample. Un productor verificado lo descarga tras aceptar las bases.
El lunes sale el email del drop, también a quien solo dejó su email.

## Criterio de aceptación

1. `pnpm check`, `pnpm typecheck`, `pnpm test` y `pnpm e2e` en verde.
2. Propiedades de `calendar` y `phase` en verde, con las semanas de cambio de hora de 167 y 169 h.
3. E2E del hito (3.20) en verde con el reloj simulado y el almacenamiento falso.
4. Descarga firmada comprobada contra Cloudinary real en el prefijo de desarrollo ⚠️, o anotada como
   pendiente del usuario.
5. Jurado visual de tres lentes sin hallazgos altos ni medios abiertos.
6. Todos los ids de la tabla de cobertura, verificados.

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-09 | 3.12–3.14 | Cron, emails del drop, alerta sin cuenta y cuenta atrás en GIF. Guía v0.6.44. |
| 2026-10-09 | 3.3, 3.5–3.11 | Servidor de semanas y samples con el almacenamiento falso en disco y la medición con ffmpeg. La 3.4 queda 🔄 a falta de la prueba real en Cloudinary. Guía v0.6.43. |
| 2026-10-09 | 3.1, 3.2 | `calendar` y `phase` en `packages/rules`, con propiedades. Guía v0.6.42. |
| 2026-10-09 | — | Plan creado a partir de §2.1, §2.4, §2.12.3, §2.14, §4.5, §4.8, §4.12 y §4.19.5. La fase arranca con las comprobaciones manuales de la Fase 2 (2.22, 2.11, 2.26) en manos del usuario. |
