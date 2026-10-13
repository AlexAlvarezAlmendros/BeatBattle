# Prueba real de la subida de una entrada contra Cloudinary (tarea 4.10)

> **Fecha:** 2026-10-13 · **Cuenta:** la de BeatBattle · **Prefijo:** `beatbattle-dev` (`RF-STO-06`) ·
> **Script:** `apps/server/src/scripts/realEntryCheck.ts`, sobre la misma implementación que usa la API
> (`createCloudinaryEntryStorage`) · **Requisitos:** `RF-STO-02`, `RF-STO-04`, y de paso `RF-STO-01`,
> `RF-STO-03`, `RF-ENT-04` y `RF-ENT-11`.

## El audio

«Low Life» (132 BPM, Fa menor), un beat del catálogo de `otherpeople.es/beats` (el MP3 público de su
licencia), convertido en local a WAV de 96 kHz, 24 bits y estéreo con los primeros 104 s: **59.904.148 bytes**
(el «WAV de 60 MB» del plan). Referencia medida en local con ffmpeg: **−8,0 LUFS** integrados. El MP3 y el
WAV no se guardan en el repositorio.

## Resultado (`prueba-real.log`)

| Paso | Resultado |
|---|---|
| Firma | `public_id = beatbattle-dev/entries/prueba-real-4-10/<uuid>`, sin id de usuario (`RF-ENT-04`); `video`/`authenticated`; `eager` `f_mp3,br_192k` asíncrono |
| Subida por trozos | 3 trozos de 20 MB con `X-Unique-Upload-Id` y `Content-Range`, los tres 200, en **8,6 s** (`RF-STO-01`) |
| Admin API | Existe, en su carpeta, con los mismos bytes y creado después del *intent* (`RF-STO-03`). **Sin `etag` ni duración** (ver «Lo que destapó») |
| Medición | Original leído por URL firmada temporal: **104,0 s, −8,0 LUFS** (igual que la referencia local), pico real +0,1 dBTP, 1000 bins, en **1,5 s**. `validateEntryAudio`: válido (`RF-STO-04`) |
| Huella | MD5 calculado por el servidor al medir: `b4691cee593f4ac1cb173edecd3fd901`, **igual que `md5sum` en local**, con los 59.904.148 bytes leídos |
| Escucha firmada | El derivado `f_mp3,br_192k` firmado responde **200 `audio/mpeg`**, 2.497.004 bytes (104 s a 192 kb/s) (`RF-STO-02`) |
| Sin firma | El original, el MP3 sin firma y la misma ruta como `upload` (pública): **404** los tres (`RF-STO-02`) |
| Borrado | `destroy` con `invalidate`; la Admin API ya no lo encuentra |

Duración total: 18,8 s.

## Lo que destapó: la Admin API no da el `etag`

En la primera pasada la verificación devolvió `etag: ""`. Una subida simple de 3 s lo confirmó: la respuesta de
la subida lleva `etag` y `duration`, pero `api.resource()` no devuelve ninguno de los dos (sus claves:
`asset_id, public_id, format, version, resource_type, type, created_at, bytes, width, height, folder, url,
secure_url, is_audio, derived…`). El almacenamiento falso de los E2E sí los daba, y por eso ningún test lo vio.

En producción habría sido grave: todas las entradas habrían guardado la huella vacía, así que cada entrada de
otra cuenta habría quedado marcada como duplicado de la primera (`RF-ENT-11`), y un segundo cambio de audio
habría repetido la clave de idempotencia de su email.

**Arreglo** (guía v0.6.57, §4.8.4):
- `measureAudio` calcula el MD5 de lo que lee camino de ffmpeg y cuenta los bytes. La huella de la entrada es
  ese MD5, si leyó el fichero entero.
- Sin medir (`processing`), la huella queda vacía y nunca se compara; el `tick` la pone al completar la entrada
  y marca entonces el duplicado, con su auditoría.
- La duración se valida con la medida.
- El almacenamiento falso imita ya a la Admin API: su verificación tampoco da `etag` ni duración.
- Las claves de idempotencia de los emails de la entrada van por el `public_id` del audio.

Tests: `measure.test.ts` («la huella es el MD5 de los bytes leídos») y `entries.test.ts` («sin medir, la
huella queda vacía y no es duplicado; el tick la pone y marca el duplicado»). El test de duplicados que ya
existía pasa ahora por la huella del servidor.

## Repetirla

```bash
pnpm --filter @beatbattle/server exec tsx --env-file=$PWD/apps/server/.env \
  src/scripts/realEntryCheck.ts <audio.wav> [semana]
```

Se niega a correr con el prefijo de producción.
