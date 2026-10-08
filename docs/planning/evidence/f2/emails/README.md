# Galería de emails de la Fase 2 (tareas 2.13 y 2.14, `RF-NOTIF-03`)

Las cinco plantillas de la fase con sus datos de ejemplo, a 600 px (escritorio) y a 390 px (móvil),
capturadas el 2026-10-08 con el Chrome del sistema. Se regeneran con:

```bash
pnpm --filter @beatbattle/emails exec tsx scripts/gallery.tsx <carpeta> http://localhost:5173   # HTML y texto
node tools/shot/emails.mjs <carpeta> docs/planning/evidence/f2/emails                           # capturas
```

(con `pnpm dev` en marcha: las imágenes de la cabecera cuelgan de la web). En vivo: `pnpm emails:dev`.

| Plantilla | Asunto |
|---|---|
| `auth.verify` | «Confirma tu email y entra en la batalla» (39) |
| `auth.reset` | «Restablece tu contraseña» (24) |
| `auth.welcome` | «Bienvenido a la batalla, LilBru» (31; con un nombre de 20 caracteres, 46) |
| `auth.security` | «Han cambiado la contraseña de tu cuenta» y sus variantes (39) |
| `account.deleted` | «Tu cuenta se ha borrado» (23) |

Lo que se ve:

- **Cabecera:** el logo del juego con su extrusión y la pegatina OTP., en imágenes con fondo negro propio
  (`tools/brand/email-images.mjs`).
- **Cuerpo:** tarjeta `#0e0e10` con borde de 2 px; rótulo rojo, título en mayúsculas y texto de 16 px.
- **Botón:** rectangular, `#e6003a`.
- **Pie:** la firma, el porqué de la familia y las preferencias. La baja de ese tipo solo sale en avisos y
  marketing.

Las pruebas (`packages/emails/test/templates.test.ts`, 22) comprueban, en todas las plantillas:

- HTML y texto plano.
- `lang="es"` y `role="presentation"` en las tablas.
- `alt` en las imágenes.
- Nada por debajo de 14 px.
- Ni píxeles de seguimiento ni parámetros en las imágenes.
- El asunto en 50 caracteres o menos.

Pendiente: Chakra Petch como fuente web. Las fuentes aún no se sirven en una URL pública estable, así que
hoy se ve la alternativa (Arial o Helvetica), que es lo que enseña Gmail de todos modos.
