# Plan 02 — Cuentas y base de email

> Fase: 2 de 10 | Estado: 🔄 En curso | Iniciado: 2026-10-08 | Cerrado: —
> Hito del roadmap: E2E registro → email capturado → verificación → entrar con Google → perfil → borrar
> cuenta; cola de salida, presupuesto diario, preferencias, consentimientos y bajas funcionando.

Deja resuelto **quién es quién**: cuentas propias con Better Auth (email y contraseña con verificación,
Google y Discord), el perfil público y los derechos RGPD. También deja la **base de email** sobre la que
se apoyan todas las fases siguientes: la interfaz `Mailer`, la cola de salida con su presupuesto diario,
las preferencias, los consentimientos con historial, las bajas en un clic y los rebotes. El riesgo
principal es Better Auth: su API cambia a menudo, así que se fija la versión y cada flujo lleva su test
de integración antes de construir la UI encima (§4.9). El segundo riesgo es el correo real (Workspace del
sello): todo se construye contra Mailpit y el `Mailer` en memoria, y la cuenta real solo entra con
confirmación.

---

## Decisiones de partida (2026-10-08, del usuario)

- **Dominio:** `battle.otherpeople.es`. Cookies solo de ese host; URL de vuelta de OAuth y `BB_PUBLIC_URL`
  con ese valor en producción, `localhost` en local.
- **Cuenta que envía:** una dirección de **Google Workspace de `otherpeople.es`** (p. ej.
  `batalla@otherpeople.es`): cupo de ~1.900 al día (`MAIL_DAILY_LIMIT`) y `From` del dominio. Su DKIM, SPF y
  DMARC se comprueban (y, si faltan, se proponen) antes de enviar a nadie: tocar el DNS del sello necesita
  confirmación.
- **Proveedores sociales:** Google y Discord.

## Dependencia con otras fases

- **Requiere:** el GO de la Fase 1 (2026-10-08) y la base del servidor de la Fase 0 (Fastify, Drizzle,
  `app_rate_limit`, comprobación de `Origin`, errores).
- **Habilita:** la Fase 3 (semanas, `emailSchedule`, alerta sin cuenta) y todo lo que pide sesión o manda
  emails.

## Cobertura de la especificación

| Id | Tarea(s) | Verificación |
|----|----------|--------------|
| `RF-AUTH-01` | 2.5, 2.15 | test de servidor `RF-AUTH-01` (403 `EMAIL_NOT_VERIFIED` con un guarda de ruta de prueba) + aviso «Reenviar email» en la UI |
| `RF-AUTH-02` | 2.5 | test: bloquear → la siguiente petición autenticada da 401 |
| `RF-AUTH-03` | 2.5 | test: un productor recibe 403 en `/api/admin/*` |
| `RF-AUTH-04` | 2.4, 2.15, 2.24 | E2E: registro → email capturado → enlace → sesión y `emailVerified` |
| `RF-AUTH-05` | 2.22 | test de integración con un proveedor OAuth simulado: el email de una cuenta verificada entra en ella; verificación manual con Google real |
| `RF-AUTH-06` | 2.4 | test: `LilBru` y `lilbru` chocan; `admin` → `USERNAME_RESERVED` |
| `RF-AUTH-07` | 2.4, 2.15 | test: `password123456` → `PASSWORD_COMPROMISED` (HIBP simulado); 11 caracteres → `PASSWORD_TOO_SHORT` |
| `RF-AUTH-08` | 2.6 | test: restablecer revoca la sesión de otro navegador |
| `RF-AUTH-09` | 2.4 | test: `x@mailinator.com` → `EMAIL_DISPOSABLE` (registro y cambio de email) |
| `RF-AUTH-10` | 2.6, 2.20 | test + E2E: Ajustes → Sesiones lista y «Cerrar las demás» las revoca |
| `RF-PRF-01` | 2.18 | test: `/p/:username` 200 con los campos; 404 con la página propia |
| `RF-PRF-02` | 2.19 | test de firma + prueba real: un PNG de 4000 px se sirve a 256×256 en WebP/AVIF |
| `RF-PRF-03` | 2.18 | test: una vez cada 30 días; `/p/antiguo` → 301 a `/p/nuevo` |
| `RF-PRF-04` | 2.21 | test: tras borrar no queda dato personal; registro de limpiezas por módulo (las tablas de entradas y votos se suman en sus fases) |
| `RF-PRF-05` | 2.21 | test: `/api/me/export` con perfil, consentimientos y lo que exista (entradas, votos, XP y logros, según su fase) |
| `RF-NOTIF-01` | 2.8, 2.12 | test: sin consentimiento, una cuenta nunca recibe marketing; los avisos se quitan por tipo |
| `RF-NOTIF-02` | 2.8 | test: reencolar o reintentar no duplica (`idempotency_key` única) |
| `RF-NOTIF-03` | 2.13, 2.14 | captura de cada plantilla en la galería de emails + test de texto plano |
| `RF-NOTIF-04` | 2.8 | test: con todo desactivado, el email de servicio sale |
| `RF-NOTIF-05` | 2.10 | test: `POST` RFC 8058 sin sesión desactiva el tipo; el siguiente envío lo omite |
| `RF-NOTIF-10` | 2.11 | test con avisos de rebote de ejemplo: el permanente suprime; el siguiente envío queda `suppressed` |
| `RF-NOTIF-16` | 2.12, 2.21 | test: consentimientos con fecha, texto y origen; aparecen en la exportación |
| `RF-NOTIF-17` | 2.8 | test: límite 10, cola de 15 (3 de servicio) → 3 de servicio + 7 por prioridad; 5 aplazados con `not_before` |
| `RF-NOTIF-18` | 2.7 | test: el transporte rechaza un SMTP con certificado autofirmado; ningún secreto en el repo |
| `RNF-PRIV-01` | 2.21 | `RF-PRF-04` y `RF-PRF-05` |
| `RNF-PRIV-03` | 2.23 | E2E: tras registrarse y entrar, solo cookies técnicas (`__Secure-bb.*`) |
| `RNF-SEC-02` | 2.4, 2.18 | un test por límite: entrar 5/min, registro 3/h, recuperación 3/h (por IP) y cambios de perfil 30/h |
| `RNF-SEC-03` | 2.18, 2.24 | E2E «A contra B»: A no edita el perfil ni ve las sesiones de B |
| `RD-VIS-02` | 2.15–2.18, 2.25 | lint, firma en cada ruta nueva, recorrido con teclado y acta del jurado |
| `RNF-A11Y-01`, `-02`, `-03` | 2.15–2.18, 2.25 | recorrido E2E solo con teclado (registrarse), axe y variante sin movimiento de la bienvenida |

**Fuera de esta fase, a propósito:** `RF-NOTIF-06` (recibo, F4), `-07` (lunes, F6), `-08` (silencio y tope,
F5: la cola deja el punto donde se aplican), `-09` (alerta sin cuenta, F3), `-11` y `-12` (campañas, F9),
`-13` (contrato de voto ciego, F5), `-14` (imágenes dinámicas, F3/F6) y `-15` (temporada, F7). La tabla
`email_campaign` y `entry_receipt_seq` llegan con sus fases. La casilla de la newsletter del sello se
enseña en el registro, pero el alta en su API es de la Fase 9 (`RF-OTP-06`): hasta entonces se guarda el
consentimiento y no se envía nada.

---

## Tareas

### Arranque

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 2.1 | Registrar las decisiones de dominio, cuenta de envío y proveedores en el roadmap y la guía (§7, §4.19.1 con Workspace: `From` del dominio y `MAIL_DAILY_LIMIT` de 1.900; §5 con `RF-NOTIF-17` y `-18`, que ninguna fase listaba) | ✅ Hecho | — | §4.19.1, §5, §7 |
| 2.2 | Mailpit en local sin Docker: `tools/mailpit` descarga el binario fijado (versión y SHA-256) a una carpeta ignorada y `pnpm mail:dev` lo arranca (SMTP 1025, bandeja en `localhost:8025`); `docker-compose.yml` queda para quien tenga Docker | ✅ Hecho | — | §4.19.1 · cierra lo pendiente de la 0.19 · **Hecho:** `pnpm mail:dev` descarga Mailpit v1.31.4 (SHA-256 de Linux y macOS, x64 y arm64) a `tools/mailpit/.bin/` y lo arranca; probado con un envío SMTP y con el `Mailer` |

### Cuentas en el servidor

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 2.3 | Fijar la versión de Better Auth y verificar la configuración de §4.9 contra su documentación (lo que no cuadre, a la guía). Esquema de Drizzle generado con su CLI (`user` con `username`, `displayUsername`, `role`, `banned`…; `session`, `account`, `verification`, `rateLimit`) + `producer_profile` (bio, ciudad, enlaces, acento, avatar, número de carta, cambio de nombre) + `username_redirect`, con su migración | ✅ Hecho | — | §4.9, §4.11 · probado con libSQL en memoria · **Hecho:** better-auth y `auth` 1.7.7 fijados; la configuración de §4.9 compila tal cual contra sus tipos; `auth:schema` genera `src/db/auth-schema.ts` y quita las cascadas; migración `0001_cuentas`; `accountsSchema.test.ts` (`RF-AUTH-06` en la BD, número de carta único, ninguna cascada) y `username.test.ts` en `shared` (reservados y formato, con fast-check) |
| 2.4 | Better Auth en Fastify: ruta comodín `/api/auth/*`, `preHandler` que decora `request.user`; email y contraseña con verificación obligatoria (24 h, entra al verificar), `username` con reservados, `haveIBeenPwned` (simulado en los tests), rate limit en BD con las reglas de §4.13, cookies del host con prefijo `bb` y sesión de 30 días deslizantes; `rejectDisposableEmail` con la lista de dominios desechables como datos (con su fuente y fecha) y `createProducerProfile` en los *hooks*. Los emails de verificación salen por la cola (2.8) | ✅ Hecho | 2.3, 2.8 | §2.3, §4.9, §4.13 · `RF-AUTH-04`, `-06`, `-07`, `-09`, `RNF-SEC-02` · **Hecho:** `auth/auth.ts`, `auth/routes.ts` (comodín y sesión) y la lista de desechables (`tools/data/disposable-domains.mjs`, 9.221 dominios, CC0); `auth.test.ts` (8): `RF-AUTH-04` (servidor), `-06`, `-07` (HIBP simulado), `-09`, sin verificar → 403, `RNF-SEC-02` (entrar, registro y recuperación) y número de carta, con dos mutaciones comprobadas. **Prueba real** con Mailpit: el email llega y el enlace entra con la cookie `bb.session_token`. Encontró que las plantillas fallaban con `tsx` (corregido, con su test) |
| 2.5 | Guardas de ruta: `requireSession`, `requireVerified` (403 `EMAIL_NOT_VERIFIED`), `requireAdmin` (403) y bloqueo (`banned` → 401 y sesiones revocadas) | ✅ Hecho | 2.4 | §2.2 · `RF-AUTH-01`, `-02`, `-03` · **Hecho:** `auth/guards.ts` y `registerAdminGuard` (`onRoute`); `guards.test.ts` (4): 401 sin sesión, `RF-AUTH-01`, `RF-AUTH-03` en cada ruta de admin (con mutación comprobada) y `RF-AUTH-02` con el `ban-user` real del plugin |
| 2.6 | Flujos de cuenta: recuperación (revoca todas las sesiones), cambio de contraseña y de email (verificación de la nueva y `auth.security` a las dos), lista de sesiones con navegador y última actividad, «Cerrar las demás» | ✅ Hecho | 2.4 | §2.3, §4.13 · `RF-AUTH-08`, `-10` · **Hecho:** recuperación con revocación, cambio de contraseña y de email (aprobado desde la dirección actual con la plantilla nueva `auth.change_email`; avisos a las dos con el token, sin estado) y sesiones; `accountFlows.test.ts` (5): `RF-AUTH-08`, `RF-AUTH-10`, avisos de seguridad y el cambio de email completo abierto sin sesión |

### Base de email

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 2.7 | Interfaz `Mailer` (`send`, `remainingQuota`) con tres implementaciones: **Workspace** (nodemailer, `smtp.gmail.com:465`, TLS verificado, *pool* de 1 conexión a 1 mensaje/s, `Message-ID` propio, `List-Unsubscribe` y `List-Unsubscribe-Post`), **SMTP** (Mailpit) y **memoria**. Variables solo de entorno; la preview solo envía a la lista blanca | ✅ Hecho | — | §4.19.1 · `RF-NOTIF-18` · **Hecho:** `apps/server/src/email/mailer.ts` y la configuración en `env.ts`; `mailer.test.ts` (rechazo de un SMTP con certificado autofirmado, cabeceras RFC 8058, `Message-ID`, lista blanca, reglas de producción) y un envío real a Mailpit con las cabeceras comprobadas |
| 2.8 | Tablas de §4.19.3 (`email_pref`, `email_consent`, `email_subscriber`, `email_outbox`, `email_suppression`, `email_stat`) y la cola: encolar en el mismo `batch` que el hecho con clave de idempotencia; servicio enviado en la misma petición y, si falla, por el `tick`; `emailDrain` con presupuesto en ventana móvil de 24 h, 25 % reservado para servicio y reparto por prioridad; reintentos (1 min, 5 min, 30 min, 2 h → `failed`); preferencias, familia y supresión aplicadas **al enviar**. La política (presupuesto, espera, familia) en funciones puras con fast-check | ✅ Hecho | 2.7 | §4.19.3 · `RF-NOTIF-01`, `-02`, `-04`, `-17` · el `tick` con *lease* es de la 3.x: aquí `emailDrain` se llama desde los tests y desde un script · **Hecho:** tablas y migración `0002_email`; `catalog.ts` (familia, prioridad e interruptor de cada tipo), `policy.ts` (puro) y `outbox.ts` (`enqueueEmail` para el `batch`, `emailDrain`); `outbox.test.ts`: `RF-NOTIF-17` (el ejemplo de la guía y propiedades con fast-check), `-02`, `-04`, `-01`, reintentos, sin dobles envíos y estadísticas agregadas |
| 2.9 | Plantillas en el servidor: `renderEmail(kind, payload, prefs)` → asunto, *preheader*, HTML y texto plano, con los enlaces y el pie de baja según la familia | ✅ Hecho | 2.8, 2.13 | §4.19.4 · **Hecho:** `email/render.ts` (`createRenderer`): la plantilla con el `payload` guardado, la familia y la página de baja del pie (mismo token que la de un clic); un tipo sin plantilla falla y la cola lo reintenta |
| 2.10 | Bajas: tokens HMAC (`UNSUBSCRIBE_SECRET`) sobre destinatario + tipo; `GET /api/unsubscribe` con la página «Baja» (ese tipo o todo lo no esencial) en el marco simple de la arena; `POST /api/unsubscribe/one-click` según RFC 8058 (exento de `Origin` y con `application/x-www-form-urlencoded`, como prevé `plugins/security.ts`); la baja de todo suprime por hash | ✅ Hecho | 2.8 | §2.12.4, §4.19.6 · `RF-NOTIF-05` · **Hecho:** tokens HMAC, `GET`/`POST /api/unsubscribe` y la de un clic con formularios (`acceptForm` en su propio contexto); pantalla `/baja` mirada en el navegador (1440 y 390, hecho e inválido) y recorrida con el teclado; `unsubscribe.test.ts` (`RF-NOTIF-05`, `-16`, tokens manipulados, suscriptor), `UnsubscribePage.test.tsx` y `/baja` en las rutas del E2E (axe, texto, paleta y firma) |
| 2.11 | `bounceScan`: lee el buzón por IMAP (`imapflow`), saca el destinatario de `X-Failed-Recipients` o del informe de entrega, suprime los permanentes (5.x.x) y mueve el aviso a `beatbattle/rebotes`. Probado con avisos de rebote de ejemplo; la conexión real, con la cuenta de Workspace (⚠️ credenciales del usuario) | ⬜ Listo | 2.8 | §4.19.2 · `RF-NOTIF-10` |
| 2.12 | Preferencias y consentimientos: `GET`/`PUT /api/me/email-prefs` (un interruptor por aviso, formato del lunes, marketing, newsletter del sello), `email_consent` como historial que nunca se sobrescribe (fecha, versión del texto, origen, hash de IP) y espejo en `email_pref.marketing_on` | ✅ Hecho | 2.4, 2.8 | §2.12.4, §4.14 · `RF-NOTIF-01`, `-16` · **Hecho:** esquemas en `shared` (`emailPrefs.ts`), `modules/emailPrefs` y las casillas del registro en el *hook* del alta (`consents`); `ipHash` con sal semanal; `emailPrefs.test.ts` (4): `RF-NOTIF-16` en el registro y en Ajustes, valores por defecto y errores |

### Plantillas

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 2.13 | `packages/emails` con React Email: cabecera (logo del juego en imagen y pegatina OTP), tarjeta, botón a prueba de balas (tabla + VML), pie con firma y baja; `lang="es"`, `role="presentation"`, `alt`, 14 px mínimo, modo oscuro; visor `pnpm emails:dev` con *fixtures* y galería de emails con capturas | ✅ Hecho | — | §3.8.12, §4.19.4 · `RF-NOTIF-03` · **Hecho:** componentes (`Layout`, `Header`, `Card`, `Button`, `Footer`, textos), `renderEmail`, visor `pnpm emails:dev`, galería con capturas a 600 y 390 px (`evidence/f2/emails/`) e imágenes de cabecera con `tools/brand/email-images.mjs`. Pendiente: Chakra Petch como fuente web (hace falta una URL estable para sus ficheros) |
| 2.14 | Plantillas `auth.verify`, `auth.reset`, `auth.welcome`, `auth.security` y `account.deleted` con los textos del Anexo H, asunto ≤ 50 caracteres y texto plano completo | ✅ Hecho | 2.13 | §2.12, Anexo H · `RF-NOTIF-03` · **Hecho:** las cinco plantillas con los textos del Anexo H; `templates.test.ts` (22): texto plano, accesibilidad, sin píxeles y asunto de 50 caracteres o menos, también con un nombre de 20 |

### Pantallas

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 2.15 | Cliente de Better Auth (`createAuthClient` con `usernameClient` y `adminClient`) y sesión en la app (HUD con el jugador real). Pantallas «CONTINUAR PARTIDA» (`/entrar`) y «NUEVO JUGADOR» (`/registro`) con el marco de la arena (§3.8.14): errores con las palabras de la guía, medidor `zxcvbn-ts` diferido, casillas de avisos (marcadas) y de marketing y newsletter (desmarcadas), Google y Discord; `/verificar` (pendiente, reenviar, verificado) y `/recuperar`; aviso de `EMAIL_NOT_VERIFIED` con «Reenviar email». Recorribles con teclado como un menú | ⬜ Listo | 2.4, 2.6, 2.12 | §2.3, §3.8.14 · `RF-AUTH-01`, `-04`, `-07`, `RNF-A11Y-01` |
| 2.16 | Ajustes → Emails y Ajustes → Cuenta (cambiar email y contraseña) sobre la API de 2.6 y 2.12 | ⬜ Listo | 2.6, 2.12, 2.15 | §2.12.4, §3.8.14 |
| 2.17 | Bienvenida (§3.8.9, versión simple): «NUEVO JUGADOR», la carta de luchador se imprime desde una ranura con su número, «Bienvenido a la batalla» y el primer logro; variante sin movimiento | ⬜ Listo | 2.15 | §3.8.9, Anexo E · `RNF-A11Y-03` |
| 2.18 | Perfil público `/p/:username` con lo que ya existe (avatar, nombre, bio, ciudad, enlaces, acento, número y antigüedad; teselas, historial y logros vacíos con su estado) y su 404; Ajustes → Perfil para editarlo; cambio de `username` una vez cada 30 días con redirección 301 desde el anterior durante 30 días; cambios de perfil 30/h | ⬜ Listo | 2.15 | §2.3, §3.8.10 · `RF-PRF-01`, `-03`, `RNF-SEC-02`, `-03` |
| 2.19 | ⚠️ Avatar con subida firmada a Cloudinary (prefijo de desarrollo), recorte cuadrado y entrega a 256 px en WebP o AVIF | ⬜ Listo | 2.18 | §2.3, §4.8 · `RF-PRF-02` · crea recursos en la cuenta de Cloudinary: con confirmación |
| 2.20 | Ajustes → Sesiones: navegador y última actividad, «Cerrar las demás» | ⬜ Listo | 2.6, 2.15 | §2.3 · `RF-AUTH-10` |
| 2.21 | Exportar (`/api/me/export`) y borrar la cuenta desde Ajustes → Privacidad, con confirmación escrita; el borrado recorre un registro de limpiezas por módulo (cada fase añade la suya: entradas, votos, audios) en un único `batch`, deja la supresión por hash y manda `account.deleted` | ⬜ Listo | 2.12, 2.14, 2.18 | §2.3, §4.14 · `RF-PRF-04`, `-05`, `RF-NOTIF-16`, `RNF-PRIV-01` |
| 2.22 | ⚠️ Google y Discord: crear las apps OAuth (URL de vuelta de `localhost` y `battle.otherpeople.es`) con confirmación y las credenciales del usuario; vinculación con una cuenta verificada del mismo email; test con un proveedor simulado y prueba manual con Google real | ⬜ Listo | 2.4 | §4.9 · `RF-AUTH-05` · crea recursos en Google Cloud y en Discord |

### Cierre

| # | Tarea | Estado | Depende de | Notas |
|---|-------|--------|------------|-------|
| 2.23 | Auditoría de cookies en E2E: solo `__Secure-bb.*` técnicas | ⬜ Listo | 2.15 | §4.14 · `RNF-PRIV-03` |
| 2.24 | E2E del hito: registro → email capturado (`Mailer` en memoria) → verificar → bienvenida → perfil → bajas → borrar cuenta; «A contra B»; entrar con Google simulado | ⬜ Listo | 2.10, 2.17, 2.18, 2.21, 2.22 | §5 · `RF-AUTH-04`, `RNF-SEC-03` |
| 2.25 | Jurado visual de tres lentes sobre las pantallas nuevas (autenticación, bienvenida, perfil, Ajustes, baja) y la galería de emails, con los tamaños de ventana reales | ⬜ Listo | 2.15–2.21 | §3.10 · `RD-VIS-02` e |
| 2.26 | Cierre de la fase: cobertura de ids, criterio de aceptación y hito del roadmap | ⬜ Listo | todas | — |

Las tareas 2.2, 2.3, 2.7 y 2.13 no dependen de nada y pueden ir en paralelo.

---

## Entregable

Registrarse con email (o con Google o Discord), verificar, ver la bienvenida, editar el perfil público,
elegir qué emails llegan, darse de baja de un tipo desde el propio email, exportar los datos y borrar la
cuenta. En local, todo con los emails en Mailpit. La cola de salida y el presupuesto diario quedan listos
para los avisos de las fases 3 a 7.

## Criterio de aceptación

1. El E2E del hito pasa: registro → verificación → bienvenida → perfil → bajas → borrar cuenta, con el
   `Mailer` en memoria, y entrar con un proveedor simulado vincula con la cuenta del mismo email.
2. Cada flujo de Better Auth tiene su test de integración con la versión fijada.
3. La cola no duplica, respeta el presupuesto con la reserva de servicio y aplica preferencias y
   supresiones al enviar.
4. Las plantillas de la fase están en la galería de emails, con texto plano y sin píxeles.
5. Las pantallas nuevas pasan el lint de tokens, la firma en cada ruta, el recorrido con teclado, axe y el
   jurado de tres lentes.
6. Todos los ids de la tabla de cobertura, verificados.

---

## Registro de avance

| Fecha | Tarea | Notas |
|-------|-------|-------|
| 2026-10-08 | 2.12 | Preferencias y consentimientos, con el historial. Guía v0.6.29. |
| 2026-10-08 | 2.6 | Flujos de cuenta en el servidor. Una sonda del cambio de email destapó que el último enlace llega sin sesión: el aviso sale del token. Guía v0.6.28. |
| 2026-10-08 | 2.5 | Guardas de ruta, con la de admin puesta sola en `/api/admin/*`. Guía v0.6.27. |
| 2026-10-08 | 2.4 | Better Auth en Fastify, con los flujos de registro y verificación probados con la API y de verdad con Mailpit. Guía v0.6.26. |
| 2026-10-08 | 2.9, 2.10 | Render de la cola con las plantillas y bajas sin sesión (un clic en la cabecera, página `/baja` en el pie). Guía v0.6.25. |
| 2026-10-08 | 2.13, 2.14 | `packages/emails` con React Email (componentes, render, visor y galería) y las cinco plantillas de cuentas. Guía v0.6.24. |
| 2026-10-08 | 2.8 | Cola de salida con presupuesto, reserva de servicio, reintentos y reglas al enviar. Guía v0.6.23 (`label_pick_on`, `to_address`). |
| 2026-10-08 | 2.3 | Better Auth 1.7.7 fijado, esquema generado sin cascadas, perfil de productor y redirecciones de nombre, con su migración. Guía v0.6.22. |
| 2026-10-08 | 2.2, 2.7 | Mailpit sin Docker (`pnpm mail:dev`) y el `Mailer` con sus tres transportes. Guía v0.6.21: el cupo lo calcula la cola, lista blanca de la preview en `MAIL_PREVIEW_ALLOWLIST` y reglas de arranque en producción. |
| 2026-10-08 | 2.1 | Plan creado a partir de §2.2, §2.3, §2.12, §4.9, §4.13, §4.14 y §4.19, con las decisiones del usuario (dominio, Workspace del sello, Google y Discord). Guía v0.6.20. |
