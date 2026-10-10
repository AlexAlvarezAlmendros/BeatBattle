# Plan 04 — Participar

> Fase: 4 de 10 | Estado: 🔄 En curso | Iniciado: 2026-10-10 | Cerrado: —
> Hito del roadmap: subir un WAV de 60 MB por trozos, con BPM y tonalidad sugeridos, sonoridad medida en
> servidor y recibo por email.

Deja resuelto **cómo entra un beat en la batalla**: de la ranura «INSERTA TU BEAT» a una fila `entry`
verificada y medida por el servidor, con su alias de batalla, su portada generativa y su recibo. El audio
nunca pasa por la API (`RF-STO-01`) y nada de lo que el navegador declara sobre el audio se da por bueno
(`RF-ENT-05`).

**Riesgos principales:**

- **El voto ciego empieza aquí** (`RF-ENT-04`, `RF-ENT-10`, `RNF-SEC-04`). El `public_id` no lleva el id del
  usuario, la portada propia se guarda `authenticated` y queda oculta hasta el sellado, y la respuesta
  pública de una entrada no lleva autoría. Cualquier fuga en esta fase se arrastra a la 5.
- **La medición dentro del límite de la función** (§4.8.4). Con 100 MB, ffmpeg puede pasarse del tiempo de
  Vercel. Para eso está el estado `processing`, que completa el `tick`. El *spike* 1.8 midió 3,7 s en frío
  con 52 MB.
- **La subida por trozos contra Cloudinary real** (§4.7.4). La firma vale para todos los trozos, el `eager`
  es asíncrono y la Admin API tiene 500 peticiones por hora. Los E2E usan el almacenamiento falso, que en
  esta fase aprende la subida por trozos (guía v0.6.48). La prueba real necesita confirmación ⚠️.
- **Portadas generativas iguales para todas** (`RD-VIS-04`). La calibración por medida tiene que converger
  por CPU y en un tiempo razonable en el navegador.

---

## Decisiones de partida

- **Arranque de la fase (2026-10-10).** La Fase 4 empieza con la Fase 3 abierta solo por comprobaciones del
  usuario: la prueba real de la descarga en Cloudinary (3.4) y la conformidad con la excepción n.º 1 del acta
  del jurado (3.21). El hito de la F3 ya se cumple (3.20), y nada de esta fase depende de esas dos. Se hace
  igual que la F3 empezó con lo pendiente de la F2.
- **XP y logros, en la Fase 7** (guía v0.6.48, §2.5, §3.8.5, §4.8.4). La capa de juego es la Fase 7. Aquí
  el `batch` de la entrada lleva la fila y su email en la cola. `xp_event` es idempotente por
  `(user, kind, ref)`, así que la F7 puede dar el XP de las entradas ya subidas.
- **La tabla `vote` se crea aquí, solo el esquema** (§4.11). `RF-ENT-08` (sin votos se sustituye el audio)
  y `RF-ENT-09` (retirar borra los votos) necesitan saber si hay votos. La lógica del voto es de la Fase 5;
  los tests de esta fase insertan la fila a mano.
- **La ficha pública de la entrada** (`GET /api/entries/:id`) entra aquí, aunque su pantalla es de la Fase
  5. Hace falta para probar el contrato de voto ciego (`RF-ENT-10`). El dueño ve y edita su entrada en
  `/subir` (modo edición); la ficha pública con el reproductor llega con la Fase 5.
- **Duplicados por `etag`** (`RF-ENT-11`). Aquí se marca `duplicate_of` y se avisa al admin en el `audit_log`.
  La cola de revisión del admin es de la moderación (Fase 10).
- **El PNG de la onda del recibo, sin dependencia nueva** (§4.19.5). Un PNG de dos colores se codifica con
  `node:zlib` (filtro 0 y CRC propio), igual que el GIF de la cuenta atrás de la F3.
- **El QR del recibo es una decisión abierta** (4.13). Ninguna biblioteca de QR está en §4.1. Hasta que se
  decida, el recibo lleva el enlace a la ficha en texto y en botón.
- **El análisis y la subida en el navegador ya existen** desde la Fase 1: `features/upload/chunkedUpload.ts`
  (trozos de 6 MB, 3 intentos con espera exponencial), `features/upload/entryFile.ts`
  (`validateEntryAudio` antes de subir) y `audio/analysis/analyze.ts` con su worker (motor del sello
  portado). Esta fase los conecta a la pantalla y al servidor.

## Dependencia con otras fases

- **Requiere:**
  - de la Fase 3: la semana `open` con sus fronteras, `rules_acceptance` (bases), `SampleStorage` y su
    almacenamiento falso en disco (`BB_FAKE_STORAGE`), la medición con ffmpeg (`media/measure.ts`), el
    `tick` con *lease* y `audit_log`;
  - de la Fase 2: cuentas verificadas, la cola de email con sus familias, `POST /api/uploads/sign` con su
    límite de 10 por hora (avatar) e `ImageStorage`;
  - de la Fase 1: la subida por trozos, el análisis local y la firma de Cloudinary;
  - de la Fase 0: `validateEntryAudio` y las constantes de la entrada en `packages/rules`, y el emblema de
    `packages/covers`.
- **Habilita:** la Fase 5 (escuchar y votar entradas reales, igualadas con la sonoridad medida) y la 6
  (clasificar y revelar autoría).

## Cobertura de la especificación

| Id | Tarea(s) | Verificación |
|----|----------|--------------|
| `RF-ENT-01` | 4.3, 4.5, 4.6 | test: segunda subida → 409 `ENTRY_EXISTS`; índice único parcial `entry_one_per_week` |
| `RF-ENT-02` | 4.5, 4.6, 4.18 | test: en `voting` → 409 `SUBMISSIONS_CLOSED`; la UI no ofrece el botón (menú y `/subir`) |
| `RF-ENT-03` | 4.5, 4.6, 4.14 | test del servidor con la duración medida (5 min → `DURATION_OUT_OF_RANGE` y recurso borrado; 4:00 justos vale) + componente: el MP3 de 5 min se rechaza en el navegador con su frase |
| `RF-ENT-04` | 4.4, 4.5 | test: la firma lleva `public_id = <prefijo>/entries/<semana>/<uuid>` sin el id del usuario; otro `public_id` no verifica |
| `RF-ENT-05` | 4.6 | test: `duration: 60` declarado para un audio de 200 s guarda 200 s (y lo mismo con bytes y formato) |
| `RF-ENT-06` | 4.14, 4.19 | E2E: la pista de prueba a 140 BPM en La menor prerrellena 140 y `Am` |
| `RF-ENT-07` | 4.16, 4.9 | componente + E2E: cancelar aborta el XHR y no deja entrada; el `tick` limpia el recurso huérfano |
| `RF-ENT-08` | 4.3, 4.7 | test: con un voto (fila insertada) → 409 `ENTRY_HAS_VOTES` |
| `RF-ENT-09` | 4.7, 4.18 | test: retirar borra el audio y los votos y libera el hueco; E2E: retirar y volver a subir |
| `RF-ENT-10` | 4.7 | test: la entrada pública de una semana sin sellar no lleva `userId`, `username`, `avatar` ni `coverUrl` propio |
| `RF-ENT-11` | 4.6 | test: dos cuentas con el mismo `etag` → la segunda se crea con `duplicate_of` y una fila en `audit_log` |
| `RF-ENT-12` | 4.15, 4.16 | componente: un trozo que falla se reintenta 3 veces con espera exponencial; E2E: cortar la red a mitad y recuperarla sigue sin perder la ficha |
| `RF-STO-01` | 4.4, 4.5 | test de la ruta de firma; el cuerpo máximo de la API sigue en 64 kB |
| `RF-STO-02` | 4.4, 4.10 | test: el `streamUrl` es el derivado firmado `f_mp3,br_192k` + prueba real ⚠️ (el original sin firma → 404 o 401) |
| `RF-STO-03` | 4.4, 4.6 | test: un `public_id` inexistente o de otra carpeta → 422 y no se crea nada |
| `RF-STO-04` | 4.6 | test: la pista de −10 LUFS se mide entre −10,5 y −9,5 (también con el WAV de 60 MB del E2E) |
| `RF-STO-05` | 4.9 | test del `tick`: *intent* caducado, entrada retirada, cuenta borrada y huérfano de más de 24 h → recurso borrado |
| `RF-STO-06` | 4.4 | test existente de `env.ts` (F3) + el prefijo de entradas sale del mismo `BB_CLOUDINARY_PREFIX` |
| `RF-NOTIF-06` | 4.6, 4.12, 4.19 | E2E: subir → `entry.receipt` capturado con número de recibo, sonoridad y huella en menos de 1 min; test de `entry.failed` con el motivo |
| `RF-VOTE-08` (alias) | 4.1, 4.6 | propiedades: con 200 entradas no hay dos alias iguales; el mismo id da siempre el mismo alias |
| `RD-VIS-04` | 4.11 | test en el Chrome del sistema con la GPU real: 48 semillas a ±5 % de rojo y luminancia |
| `RNF-SEC-02` (firmas de subida) | 4.5 | test existente (10 por hora y cuenta), ampliado a `entry` y `entryCover` |
| `RNF-SEC-03` | 4.7 | test «A contra B»: B no edita, sustituye ni retira la entrada de A (404) |
| `RNF-SEC-04` | 4.7, 4.8 | el test que recorre las rutas públicas con una semana sin sellar incluye la entrada y la semana con entradas |
| `RNF-PRIV-01` | 4.3 | `entry` y `upload_intent` entran en la exportación; el borrado de la cuenta borra sus recursos |
| `RD-VIS-02` | 4.14–4.18, 4.20 | lint, firma en `/subir`, recorrido con teclado y acta del jurado |
| `RNF-A11Y-01`…`-05` | 4.14–4.18, 4.20 | teclado (la ranura se elige con Intro), axe, variante sin movimiento de la tragaperras y de la celebración, equivalente visual de `upload.*` |

**Fuera de esta fase, a propósito:**

- `RF-STO-07` (retención a las 8 semanas del sellado, salvo el top 3): necesita la clasificación (Fase 6);
- el XP y los logros de la subida (Fase 7, decisión de partida);
- la tarjeta para compartir la entrada y sus metadatos (`/api/og/*`, §4.7.7): Fase 5, con la ficha pública;
- la cola de revisión de duplicados para el admin (Fase 10, moderación); aquí solo se marcan;
- `RF-ADM-04` (panel de uso de Cloudinary con alerta al 80 %): `usage()` se implementa en 4.4, pero el panel
  es de la Fase 10;
- el plan B de la medición (§4.8.4): el *spike* 1.8 no lo necesitó.

---

## Tareas

### Reglas y contratos

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 4.1 | `packages/rules`: `battleAlias(entryId, ocupados)` determinista y sin repetirse en la semana, con las listas de adjetivos y sustantivos (≥ 60 × 60, concordancia de género, sin ofensas ni marcas) en `alias.ts`; `receiptCode(isoWeek, n)` («BB-2026W41-0007»); `coverSeed(entryId)` | ✅ Hecho | — | §2.12.1, Anexo I, §4.5 · `RF-VOTE-08` · propiedades con fast-check · **Hecho:** `alias.ts` con 69 sustantivos × 64 adjetivos (4416 alias), recorrido con paso primo que visita todas las combinaciones; propiedades en `test/alias.test.ts` (200 entradas sin repetir, mismo id → mismo alias, concordancia) y valores de referencia |
| 4.2 | `packages/shared`: esquemas de la firma (`kind: entry \| entryCover`, bytes, mime y duración declarados), de la ficha (título 2–60, BPM, tonalidad, DAW de la lista o «otro», hasta 3 géneros de la lista del sello, descripción ≤ 280, declaración obligatoria), de la edición, de la entrada pública (sin autoría en ciego) y de la propia; listas de DAW y géneros; códigos `ENTRY_EXISTS`, `SUBMISSIONS_CLOSED`, `ENTRY_HAS_VOTES`, `UPLOAD_INTENT_INVALID` y `ENTRY_ASSET_INVALID` | ✅ Hecho | — | §2.5, §4.10 · `RF-ENT-01/02/08/10` · **Hecho:** `packages/shared/src/entries.ts` (firma, ficha, edición, sustitución, entrada pública estricta y propia), los dos `kind` nuevos en `UploadSignRequestSchema` y los cinco códigos; tests de voto ciego y de metadatos de integridad. Hasta la 4.5, `/api/uploads/sign` rechaza lo que no es avatar (test `RF-ENT-04`) |

### Servidor

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 4.3 | Tablas `upload_intent`, `entry` (con `receipt_number` y sus índices únicos) y `vote` (solo el esquema) en Drizzle con su migración; módulo de datos para la exportación y el borrado de la cuenta | ⬜ Listo | 4.2 | §4.11 (v0.6.48) · `RF-ENT-01`, `RNF-PRIV-01` · decisión de partida sobre `vote` |
| 4.4 | `AudioStorage` de §4.8.6 para las entradas, sobre lo que dejó `SampleStorage`: `sign(intent)` (`video/authenticated`, `eager` `f_mp3,br_192k` asíncrono, `tags`), `verify` con la Admin API (carpeta, bytes, formato, duración, creado después del *intent*, `etag`), `streamUrl`, `measure` (reutiliza `media/measure.ts`), `remove`, `listByPrefix` y `usage`; portada de entrada `image/authenticated`. El almacenamiento falso aprende la subida **por trozos** (`X-Unique-Upload-Id`, `Content-Range`) y devuelve el `etag` | 🔒 Bloqueado | 4.3 | §4.8.1–4.8.4, §4.8.6 (v0.6.48) · `RF-STO-01..04`, `RF-STO-06`, `RF-ENT-04` |
| 4.5 | `POST /api/uploads/sign` para `entry` y `entryCover`: sesión verificada, bases aceptadas, semana `open`, sin entrada activa (salvo sustitución), declarados válidos con `validateEntryAudio`; `upload_intent` de 1 h y `public_id` del servidor; el límite de 10 por hora ya existente | 🔒 Bloqueado | 4.4 | §4.8.2 · `RF-ENT-01..04`, `RF-STO-01`, `RNF-SEC-02` |
| 4.6 | `POST /api/weeks/:slug/entries`: carga el *intent*; verifica con la Admin API; valida lo **medido** con `validateEntryAudio`; mide con ffmpeg; alias, semilla y número de recibo; duplicado por `etag`. Entrada y `entry.receipt` en un `batch`. Si algo falla, borra el recurso, manda `entry.failed` y devuelve el motivo. Si la medición pasa del presupuesto de tiempo, la entrada queda en `processing`, visible solo para su dueño | 🔒 Bloqueado | 4.1, 4.5 | §2.5, §4.8.4 · `RF-ENT-01..05`, `RF-ENT-11`, `RF-STO-03/04`, `RF-NOTIF-06` |
| 4.7 | Rutas de la entrada: `GET /api/entries/:id` (pública, respeta el voto ciego); `PATCH` (ficha, hasta el cierre de envíos); `PUT /audio` (sustituir: sin votos, otra firma, el mismo número de recibo, `entry.changed`); `DELETE` (retirar: borra audio, portada y votos, libera el hueco, `entry.changed` con el aviso de votos perdidos). Todo con guardas de dueño | 🔒 Bloqueado | 4.6 | §2.5, §4.10 · `RF-ENT-08..10`, `RNF-SEC-03/04` |
| 4.8 | Semana pública con lo de quien mira: `viewer.entry` (id, estado, alias) y el número de entradas de la semana. El menú pasa a «Editar mi entrada» (`player.uploaded`) | 🔒 Bloqueado | 4.7 | §3.8.3 · `RNF-SEC-04` (el recuento es de la semana, nunca de una entrada) |
| 4.9 | Limpieza en el `tick`, troceada para la Admin API (500 por hora): *intents* caducados, entradas retiradas, recursos de cuentas borradas y barrido de huérfanos de más de 24 h por prefijo. Además, completa las entradas en `processing` | 🔒 Bloqueado | 4.6 | §4.8.5, §4.12 · `RF-STO-05`, `RF-ENT-07` |
| 4.10 | ⚠️ Prueba real contra Cloudinary (cuenta de BeatBattle, prefijo `beatbattle-dev`, con confirmación del usuario): subida por trozos de un WAV de 60 MB, `eager`, verificación, medición con la URL firmada temporal, escucha firmada y el original sin firma (404 o 401); el recurso se borra al acabar | 🔒 Bloqueado | 4.4, 4.6 | §4.8 · `RF-STO-02`, `RF-STO-04` · espera la confirmación del usuario y la prueba de la 3.4 |

### Portadas

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 4.11 | `packages/covers`: el pintor de la portada generativa sobre el emblema que ya existe (8 familias × pliegues por tonalidad × giro por BPM × fase por semilla, anillos de acento, fondo común). Pinta por CPU en un contexto 2D con `willReadFrequently`, con calibración por medida a 11,5 % de rojo y 1,6 % de blanco. Test `RD-VIS-04` con 48 semillas en el Chrome del sistema | ⬜ Listo | — | §3.4.5 · `RD-VIS-04` |

### Emails

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 4.12 | Plantillas `entry.receipt` (ticket de §3.8.12 con número, alias, título, duración, formato, tamaño, BPM, tonalidad, informe técnico con el ajuste de −14 LUFS de `loudness.ts`, aviso de clip por encima de −0,1 dBTP, hora de Madrid, `etag` abreviado, botones y recordatorio de las bases), `entry.failed` (motivo con las palabras de la UI y enlace a `/subir`) y `entry.changed` (recibo nuevo o retirada). Más el PNG de la onda, `GET /api/email/waveform/:entryId.png` con firma HMAC y codificador propio | 🔒 Bloqueado | 4.6 | §2.12.1, §4.19.4, §4.19.5, Anexo I · `RF-NOTIF-06` |
| 4.13 | QR del recibo a la ficha de la entrada | 🔒 Bloqueado | 4.12 | §2.12.1 · **Decisión abierta:** ninguna biblioteca de QR está en §4.1. ¿Se añade una dependencia (`qrcode`) o se escribe un codificador propio (modo byte, Reed-Solomon, como el GIF de la F3)? Mientras, el enlace va en texto y en botón |

### Web

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 4.14 | `/subir`, la ranura «INSERTA TU BEAT»: arrastrar o elegir (con Intro), validación local con su frase (`entryFile.ts`), análisis en el worker (`analyze.ts`) con la onda dibujándose y BPM y tonalidad girando como una tragaperras hasta fijarse. Antes, comprobaciones previas: sesión, bases, fase y entrada existente | 🔒 Bloqueado | 4.2 | §2.5, §3.8.5 · `RF-ENT-03`, `RF-ENT-06` |
| 4.15 | La hoja del luchador: título, BPM y tonalidad prerrellenados, DAW con «otro», hasta 3 géneros, descripción, portada propia opcional (oculta en voto ciego, se avisa) y declaración. La ficha se conserva en `sessionStorage` si algo falla | 🔒 Bloqueado | 4.14 | §2.5, §3.8.5 · `RF-ENT-12` |
| 4.16 | El medidor de súper: subida por trozos (`chunkedUpload.ts`) con bytes reales, velocidad, tiempo restante y «Cancelar [Esc]» (aborta el XHR); reintentos por trozo; registro de la entrada. Después, la celebración: anunciador «¡NUEVO BEAT EN LA BATALLA!», portada generativa con el alias («Así te verán hasta el domingo…»), «Ya estás en la batalla #41», con su variante sin movimiento | 🔒 Bloqueado | 4.6, 4.11, 4.15, 4.17 | §3.8.5, §4.7.4 · `RF-ENT-07`, `RF-ENT-12` |
| 4.17 | Efectos `upload.hover`, `upload.progress`, `upload.done` y `ann.newbeat` como `SfxDef`, afinados en la tonalidad de la semana, con su equivalente visual y medidos *offline* | ⬜ Listo | — | §3.7.3, Anexo D · `RNF-A11Y-05` |
| 4.18 | `/subir` en modo edición: «Editar mi entrada» (ficha), sustituir el audio (solo sin votos) y retirar con confirmación. En el menú, Jugar → «Editar mi entrada», con el cursor en Jurado | 🔒 Bloqueado | 4.7, 4.8, 4.16 | §2.5, §3.8.3 · `RF-ENT-02`, `RF-ENT-08/09` |

### Cierre

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 4.19 | E2E del hito con el almacenamiento falso y el Mailer en memoria: un WAV de 60 MB generado (140 BPM en La menor, −10 LUFS) sube por trozos; BPM y tonalidad sugeridos; sonoridad medida en servidor; `entry.receipt` con número, sonoridad y huella. Además: un audio de 5 min rechazado en el navegador, cancelar a mitad, segunda subida 409, corte de red a mitad y retirar y volver a subir | 🔒 Bloqueado | 4.6–4.18 | §5 · hito · `RF-ENT-*`, `RF-NOTIF-06` |
| 4.20 | Jurado visual de tres lentes sobre `/subir` (ranura, análisis, hoja, medidor, celebración, edición y errores) y los emails del recibo | 🔒 Bloqueado | 4.12, 4.14–4.18 | `RD-VIS-02` (e) |
| 4.21 | Cierre de la fase: cobertura de ids, hito y roadmap | 🔒 Bloqueado | 4.10, 4.19, 4.20 | — |

---

## Entregable

Un productor verificado, con las bases aceptadas y la semana abierta, suelta su beat en la ranura. Ve el
BPM y la tonalidad sugeridos, rellena su hoja y lo sube por trozos con el progreso real. El servidor lo
verifica y lo mide, y le asigna alias y portada generativa. Le llega el recibo con el informe técnico.
Hasta el cierre de envíos puede editar la ficha, sustituir el audio sin votos o retirar la entrada.

## Criterio de aceptación

1. `pnpm check`, `pnpm typecheck`, `pnpm test` y `pnpm e2e` en verde.
2. E2E del hito (4.19) en verde con el WAV de 60 MB por trozos y el recibo capturado.
3. Contrato de voto ciego: ninguna ruta pública lleva la autoría ni la portada propia de una entrada sin
   sellar, y el `public_id` no lleva el id del usuario.
4. Prueba real contra Cloudinary en el prefijo de desarrollo ⚠️ (4.10), o anotada como pendiente del usuario.
5. `RD-VIS-04` en verde en el Chrome del sistema.
6. Jurado visual de tres lentes sin hallazgos altos ni medios abiertos.
7. Todos los ids de la tabla de cobertura, verificados.

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-10 | 4.1, 4.2 | Alias de batalla, número de recibo y semilla de portada en `packages/rules`; esquemas y códigos de la entrada en `packages/shared`. |
| 2026-10-10 | — | Plan creado a partir de §2.5, §2.12.1, §3.4.5, §3.8.5, §4.7.4, §4.8, §4.11 y §4.19.5. La guía pasa a v0.6.48: subida por trozos en el almacenamiento falso, `entry.receipt_number`, y el XP y los logros de la subida a la Fase 7. Empieza con lo pendiente de la F3 en manos del usuario (3.4 y 3.21). |
