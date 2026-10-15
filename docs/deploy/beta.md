# Despliegue de la beta

Guía para poner BeatBattle en producción (plan de la beta, B.4–B.6; guía §4.15). Lo marcado con ⚠️ crea recursos
en la nube o envía algo fuera: **solo con la confirmación del usuario**.

## 1. Antes de empezar

- Decisiones de la beta cerradas (B.1): premios, el menú en los móviles de 781–840 px de alto, fecha de la
  primera semana y la lista de productores.
- Textos legales revisados y con los datos del sello (B.3): `docs/legal/*.md` sin ningún `[[…]]`.
- `main` en verde en la CI.

## 2. Recursos ⚠️

| Recurso | Qué crear | Notas |
|---|---|---|
| Turso | Una base de datos en la UE (`beatbattle`) y un token de escritura | `DATABASE_URL=libsql://…` y `DATABASE_AUTH_TOKEN`. Las migraciones se aplican solas al arrancar |
| Cloudinary | La cuenta de BeatBattle (la misma de desarrollo) | Producción usa el prefijo `beatbattle`; las previews, `beatbattle-preview-<pr>` |
| Gmail | Una dirección del Workspace de `otherpeople.es` propia de BeatBattle, con verificación en dos pasos y una contraseña de aplicación | Nunca la de la tienda del sello. SPF, DKIM y DMARC de Google en el dominio |
| Dominio | `battle.otherpeople.es` como CNAME a Vercel | Lo pide Vercel al añadir el dominio |
| Vercel | El proyecto desde el repositorio de GitHub, región `fra1` | `vercel.json` ya trae la construcción, las reescrituras, las cabeceras y el cron diario |
| OAuth (opcional) | Apps de Google y de Discord | URL de retorno: `https://battle.otherpeople.es/api/auth/callback/google` y `…/discord` |
| GitHub | La variable `BB_TICK_URL` (`https://battle.otherpeople.es/api/cron/tick`) y el secreto `BB_CRON_SECRET` (el mismo valor que `CRON_SECRET`) | El flujo `tick.yml` llama al tick cada 15 minutos; sin la variable no hace nada |

Secretos nuevos (uno por entorno, nunca los de desarrollo):

```bash
openssl rand -base64 48   # BETTER_AUTH_SECRET, UNSUBSCRIBE_SECRET
openssl rand -base64 32   # CRON_SECRET, IP_HASH_SALT
```

**Estado (2026-10-15):** el proyecto `beatbattle` ya existe (equipo `alexalvarezalmendros-projects`, enlazado al repositorio, `fra1`, Node 22) con las construcciones en pausa: su *Ignored Build Step* es `exit 0`, así que los `push` a `main` no despliegan. Para el primer despliegue (B.6) se quita ese comando en *Settings → Git*. Ya tiene las variables que no dependen de nadie (abajo, con ✅); la copia local está en `apps/server/.env.production` (fuera del repo).

## 3. Variables de producción (panel de Vercel)

| Variable | Valor |
|---|---|
| ✅ `BB_PUBLIC_URL` | `https://battle.otherpeople.es` |
| ✅ `TRUST_PROXY` | `1` |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Los de Turso |
| ✅ `BETTER_AUTH_SECRET` | Nuevo |
| `GOOGLE_CLIENT_ID/SECRET`, `DISCORD_CLIENT_ID/SECRET` | Los de las apps de OAuth (opcionales) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | La dirección de BeatBattle y su contraseña de aplicación |
| `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS` | `Beat Battle · Other People` y la misma dirección que `GMAIL_USER` |
| `MAIL_REPLY_TO` | El buzón del sello |
| ✅ `MAIL_DAILY_LIMIT` | `1900` con el Workspace |
| ✅ `UNSUBSCRIBE_SECRET`, `CRON_SECRET`, `IP_HASH_SALT` | Nuevos |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Los de la cuenta de BeatBattle |
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
  compartibles y que `includeFiles` lleve las fuentes de las imágenes y el `index.html`.

## 7. Durante la beta (B.9)

- Cada lunes: el sellado, los resultados y el Lunes de batalla (y el cupo de Gmail en el registro del tick).
- Copia semanal de Turso (las del proveedor más una exportación propia, §4.15).
- Los errores de la función en Vercel y la cola de email (`/admin`).

## 8. Pendiente aparte

- Borrar el proyecto de Vercel del spike de ffmpeg (fase 1) y rotar su secreto (lo hace el usuario en el panel).
