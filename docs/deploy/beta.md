# Despliegue de la beta

Guía para poner BeatBattle en producción (plan de la beta, B.4–B.6; guía §4.15). Lo marcado con ⚠️ crea recursos
en la nube o envía algo fuera: **solo con la confirmación del usuario**.

## 1. Antes de empezar

- Decisiones de la beta cerradas (B.1): premios, el menú en los móviles de 781–840 px de alto, fecha de la
  primera semana y la lista de productores.
- ✅ Textos legales con los datos del sello (B.3, 2026-10-15): `docs/legal/*.md` sin ningún `[[…]]`.
- `main` en verde en la CI.

## 2. Recursos ⚠️

| Recurso | Qué crear | Notas |
|---|---|---|
| Turso | Una base de datos en la UE y un token de escritura | `DATABASE_URL=libsql://…` y `DATABASE_AUTH_TOKEN`. Las migraciones se aplican solas al arrancar. La integración de Turso en Vercel crea además `bb_TURSO_DATABASE_URL` y `bb_TURSO_AUTH_TOKEN` (también en preview); el servidor no las lee, así que las previews no tocan la base de producción |
| Cloudinary | La cuenta de BeatBattle (la misma de desarrollo) | Producción usa el prefijo `beatbattle`; las previews, `beatbattle-preview-<pr>` |
| Gmail | `justsomeotherpeople@gmail.com` (guía §4.19.1), el Gmail del sello, con la contraseña de aplicación que ya usa su web | Cupo compartido con la web del sello (riesgo aceptado en §4.19.1). Es una cuenta `@gmail.com`: `MAIL_DAILY_LIMIT` de 450 como mucho (`preflight` lo comprueba). Sin DNS que tocar: el `From` es la propia dirección de Gmail |
| Dominio | `battle.otherpeople.es` como CNAME a Vercel | Lo pide Vercel al añadir el dominio |
| Vercel | El proyecto desde el repositorio de GitHub, región `fra1` | `vercel.json` ya trae la construcción, las reescrituras, las cabeceras y el cron diario |
| OAuth (opcional) | Apps de Google y de Discord | URL de retorno: `https://battle.otherpeople.es/api/auth/callback/google` y `…/discord` |
| ✅ GitHub | La variable `BB_TICK_URL` (`https://battle.otherpeople.es/api/cron/tick`) y el secreto `BB_CRON_SECRET` (el mismo valor que `CRON_SECRET`) | El flujo `tick.yml` llama al tick cada 15 minutos; sin la variable no hace nada |

Secretos nuevos (uno por entorno, nunca los de desarrollo):

```bash
openssl rand -base64 48   # BETTER_AUTH_SECRET, UNSUBSCRIBE_SECRET
openssl rand -base64 32   # CRON_SECRET, IP_HASH_SALT
```

**Estado (2026-10-15):** el proyecto `beatbattle` ya existe (equipo `alexalvarezalmendros-projects`, enlazado al repositorio, `fra1`, Node 22) con las construcciones en pausa: su *Ignored Build Step* es `exit 0`, así que los `push` a `main` no despliegan. Para el primer despliegue (B.6) se quita ese comando en *Settings → Git*. Ya tiene las variables que no dependen de nadie (abajo, con ✅); la copia local está en `apps/server/.env.production` (fuera del repo).

**Estado (2026-10-15, más tarde):** Turso conectado (vacío; las migraciones entran en el primer arranque) y en Vercel solo para producción; Cloudinary comprobado con su `ping` y en la copia local. Faltan en Vercel Cloudinary y Gmail (los añade el usuario en el panel: el agente no lee esos secretos).

**Estado (2026-10-16):** Cloudinary y OAuth en Vercel, y la subida de un sample funciona en producción. El tick de
GitHub ya llama cada 15 minutos (lanzado a mano, responde sin errores). Falta Gmail: `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, `EMAIL_FROM_ADDRESS` y `MAIL_DAILY_LIMIT` a 450.

**Estado (2026-10-28):** Gmail en Vercel (`GMAIL_USER`, `GMAIL_APP_PASSWORD` y `EMAIL_FROM_ADDRESS`, los puso el
usuario). Falta `MAIL_DAILY_LIMIT` a 450. Producción sirve todavía la PR #99: los despliegues de la #100 a la #103 se
cancelaron por el *Ignored Build Step*, y las variables nuevas solo entran con un despliegue nuevo (B.6).

## 3. Variables de producción (panel de Vercel)

| Variable | Valor |
|---|---|
| ✅ `BB_PUBLIC_URL` | `https://battle.otherpeople.es` |
| ✅ `TRUST_PROXY` | `1` |
| ✅ `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Los de Turso (solo en producción) |
| ✅ `BETTER_AUTH_SECRET` | Nuevo |
| ✅ `GOOGLE_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET` | Los de las apps de OAuth (opcionales) |
| ✅ `GMAIL_USER`, `GMAIL_APP_PASSWORD` | `justsomeotherpeople@gmail.com` y su contraseña de aplicación |
| ✅ `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS` | `Beat Battle · Other People` y la misma dirección que `GMAIL_USER` |
| ✅ `MAIL_REPLY_TO` | El buzón del sello (`justsomeotherpeople@gmail.com`, el contacto de sus textos legales) |
| `MAIL_DAILY_LIMIT` | `450` (cuenta `@gmail.com`; hoy en Vercel está a `1900` y hay que bajarlo) |
| ✅ `UNSUBSCRIBE_SECRET`, `CRON_SECRET`, `IP_HASH_SALT` | Nuevos |
| ✅ `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Los de la cuenta de BeatBattle (la de desarrollo, con el secreto ya rotado) |
| ✅ `BB_CLOUDINARY_PREFIX` | `beatbattle` |

Vacías en producción: `SMTP_URL`, `BB_FAKE_STORAGE`, `BB_TEST_CLOCK`, `MIGRATIONS_DIR` (la de por defecto) y
`MAIL_PREVIEW_ALLOWLIST`. En las previews: `BB_CLOUDINARY_PREFIX=beatbattle-preview-<pr>`, una base de datos de
pruebas (rama de Turso) y `MAIL_PREVIEW_ALLOWLIST` con las direcciones del equipo (sin lista no sale ningún
email).

## 4. Comprobar antes de desplegar

```bash
vercel env pull apps/server/.env.production --environment=production
pnpm --filter @beatbattle/server preflight   # sin red; no enseña ningún valor
rm apps/server/.env.production               # no se queda en el disco
```

`preflight` valida lo mismo que el servidor al arrancar y lo que la beta necesita además (Turso, Cloudinary con
`beatbattle`, Gmail, secretos, `TRUST_PROXY`, HTTPS). Sale con 1 si algo impide desplegar.

## 5. Desplegar ⚠️

1. Una preview desde una rama, con sus variables de preview: la prueba de humo de abajo, con los emails solo a
   la lista blanca.
2. Producción desde `main`.
3. La prueba de humo en producción con una cuenta del equipo.

## 5 bis. El primer admin

Entra una vez en producción (email, Google o Discord) y, desde la copia local de las variables:

```bash
pnpm --filter @beatbattle/server admin:grant <tu-email>   # dice a qué base va; queda en audit_log
```

No aplica migraciones: la base la crea el servidor en su primer arranque. Hecho el 2026-10-15 con la cuenta del
usuario.

## 6. Prueba de humo (B.6)

- `GET /api/health` → 200 con la base de datos arriba.
- Registro, verificación por email y entrada (con Google y Discord si están).
- El admin sube un sample real y programa una semana de prueba en el pasado cercano o espera al lunes; descarga
  con las bases aceptadas.
- Subir una entrada real (WAV grande, por trozos) y recibir el recibo con su onda y su QR.
- Escuchar, votar y ver el reproductor con la sonoridad igualada.
- Sellar (el tick) y ver los resultados, la ceremonia en 3D y el Lunes de batalla en la bandeja del equipo.
- Las páginas compartibles: el validador de previsualización con `/e/:id`, `/semana/:slug` y
  `/semana/:slug/resultados` (`RF-SHARE-01`), y el de datos estructurados (`RF-SHARE-05`).
- `robots.txt` y `sitemap.xml` en producción; en la preview, `robots.txt` cierra todo.
- Lo escrito sin verificar hasta ahora: que la función reciba la URL original en las reescrituras de las páginas
  compartibles. Que `includeFiles` lleve lo que la API lee del disco lo comprueba `pnpm build`
  (`scripts/smoke-vercel.mjs`); el primer despliegue cayó entero por el `hb.wasm` de satori (guía v0.6.85).

## 7. Durante la beta (B.9)

- Cada lunes: el sellado, los resultados y el Lunes de batalla (y el cupo de Gmail en el registro del tick).
- Copia semanal de Turso (las del proveedor más una exportación propia, §4.15).
- Los errores de la función en Vercel y la cola de email (`/admin`).

## 7 bis. La capa de juego: el reprocesado ⚠️ (tarea 7.16)

Cuando el usuario despliegue la Fase 7, quien jugó la beta antes no tiene XP ni logros: el reprocesado (guía §2.10,
§4.11) se los da con lo que ya pasó (descargas, entradas, votos, semanas selladas y temporadas cerradas). **Solo con
la confirmación del usuario**, una vez desplegada la Fase 7 (el servidor ya ha aplicado la migración
`0008_capa_de_juego` al arrancar) y cuanto antes: lo que pase en vivo entre el despliegue y el reprocesado lo
escriben los ganchos y el reprocesado lo respeta (el corte), pero es mejor que el hueco sea corto.

```bash
vercel env pull apps/server/.env.production --environment=production
# 1. Simulación: dice a qué base va y lo que añadiría, sin escribir nada.
pnpm --filter @beatbattle/server exec tsx --env-file=.env.production src/scripts/gameReprocess.ts
# 2. Con el visto bueno del usuario a esos números:
pnpm --filter @beatbattle/server exec tsx --env-file=.env.production src/scripts/gameReprocess.ts --apply --remote
# 3. Otra pasada: tiene que decir «Nada que añadir».
pnpm --filter @beatbattle/server exec tsx --env-file=.env.production src/scripts/gameReprocess.ts
rm apps/server/.env.production
```

- Es idempotente: repetirlo no suma nada. Si se corta a medias, se vuelve a lanzar (el corte queda guardado en
  `job_state` antes de escribir).
- Cada movimiento y cada logro llevan la fecha de su hecho: no sale `game.progress` por lo pasado y los avisos de
  logro no se amontonan (entran ya vistos). La subida de nivel sale una vez a cada jugador, con su nivel.
- **Alternativa sin la copia local**: la variable `BB_GAME_REPROCESS=1` en Vercel hace que el siguiente `tick` lo
  haga una vez (antes de sellar) y lo deje apuntado; después se quita la variable. Va dentro de la función, con su
  límite de tiempo: para la beta sobra, pero el script es la vía preferida.
- No borra ni resta nada; si un número no cuadra, se corrige con un re-sellado (§2.8), no repitiendo el reprocesado.

## 8. Pendiente aparte

- Borrar el proyecto de Vercel del spike de ffmpeg (fase 1) y rotar su secreto (lo hace el usuario en el panel).
