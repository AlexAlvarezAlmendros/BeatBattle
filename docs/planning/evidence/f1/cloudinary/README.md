# Spike de Cloudinary (tarea 1.7, `RF-STO-01`, `RF-STO-02`)

Medido el 2026-10-07 con la cuenta propia de BeatBattle (plan gratuito), `pnpm dev:all` y la página
`/dev/escucha`, desde la conexión de casa del portátil. Los recursos van bajo `beatbattle-dev/spike/<uuid>`
y se borraron al acabar.

| Prueba | WAV de 60 s (10,1 MB) | WAV de 4 min (40,4 MB) |
|---|---|---|
| Trozos enviados (6 MB, `X-Unique-Upload-Id` + `Content-Range`) | 2 | 7 |
| Subida por trozos, firmada, como `authenticated` | 4,8–5,0 s | 10,9 s |
| Derivado `f_mp3,br_192k` (`eager` asíncrono) listo tras la subida | 2,6–2,9 s | 6,8 s |
| Original sin firma | 404 «Resource not found» | 404 |
| Derivado con URL firmada | 200, `audio/mpeg`, `Access-Control-Allow-Origin: *` | igual |
| Tasa del derivado (bytes × 8 / duración) | 192 kb/s | 192 kb/s |
| Escucha con `crossOrigin="anonymous"` + `MediaElementSource` + analizador | nivel máx. 202/255 a los 3 s | — |

Lectura:

- **El audio no pasa por la API** (`RF-STO-01`): el navegador sube los trozos directo a Cloudinary con los
  campos que firma el servidor (`public_id`, `type=authenticated`, `eager`, formatos permitidos).
- **El original no se entrega sin firma** (`RF-STO-02`). Cloudinary responde 404 y no 401, como decía la
  guía: no revela ni que el recurso existe. La guía se corrigió (v0.6.17).
- **CORS**: el derivado firmado se puede leer con `crossOrigin="anonymous"`, así que el analizador del bus
  de música lo ve (y la trama de la arena reacciona a una entrada real).
- **`br_192k` se aplica**: 1.441.375 bytes para 60 s son 192,2 kb/s.
- **El `eager` es rápido**: 3 s para un minuto y 7 s para cuatro. Una entrada se puede escuchar a los pocos
  segundos de subirla.
- La Admin API solo da la duración de un audio con `media_metadata: true`.

`escucha-4min.png`: la página tras subir el WAV de 4 minutos.
