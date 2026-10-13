# Prueba real del almacenamiento de los samples contra Cloudinary (tarea 3.4)

> **Fecha:** 2026-10-13, con la confirmación del usuario · **Cuenta:** la de BeatBattle · **Prefijo:**
> `beatbattle-dev` (`RF-STO-06`) · **Script:** `apps/server/src/scripts/realSampleCheck.ts`, sobre la misma
> implementación que usa la API (`createCloudinarySampleStorage`) · **Requisitos:** `RF-DROP-07`,
> `RF-DROP-09` y, para los samples, `RF-STO-01..03`.

## Los ficheros

- **Original:** 20 s de «Asia» (155 BPM, Mi menor), un beat de `otherpeople.es/beats`, en WAV de 44,1 kHz y
  16 bits estéreo, 3,5 MB. Referencia en local con ffmpeg: −7,7 LUFS.
- ***Stems*:** un zip de 6,4 MB con dos pistas (graves y agudos del mismo fragmento).
- **Portada:** un PNG de 1200 × 1200.

Ninguno se guarda en el repositorio.

## Resultado (`prueba-real.log`)

| Paso | Resultado |
|---|---|
| Subidas firmadas | Original `video`/`authenticated`, *stems* `raw`/`authenticated` y portada `image`/`upload`, con `public_id` fijo `beatbattle-dev/samples/<id>/{original,stems.zip,cover}`, en 3,4 s |
| Admin API | Las tres, con sus bytes; la portada, 1200 × 1200 |
| Medición | Original leído por URL firmada: 20,0 s y −7,7 LUFS (igual que en local), pico real +0,1 dBTP, con los 3.528.124 bytes leídos |
| Escucha | MP3 firmado `f_mp3,br_192k`: 200 `audio/mpeg` (`RF-DROP-09`); el original sin firma, 404 |
| Descarga como adjunto | `private_download_url` con `attachment` y `expires_at` a 45 s: original y *stems*, 200 con `content-disposition: attachment` y los bytes exactos (`RF-DROP-07`) |
| Pasada la caducidad | Las dos URL, **401** |
| Portada recortada | 200 `image/png` |
| Borrado | Las tres; la Admin API ya no las encuentra |

La caducidad de la descarga en la API es de una hora. En la prueba se usaron 45 s para no esperar: el mecanismo
es el mismo `expires_at` firmado.

## Repetirla

```bash
pnpm --filter @beatbattle/server exec tsx --env-file=$PWD/apps/server/.env \
  src/scripts/realSampleCheck.ts <original.wav> <stems.zip> <portada.png> [segundos]
```

Se niega a correr con el prefijo de producción.
