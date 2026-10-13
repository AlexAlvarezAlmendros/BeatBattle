# Prueba real del reproductor sobre Cloudinary (tarea 5.23)

> **Fecha:** 2026-10-13 · **Cuenta:** la de BeatBattle · **Prefijo:** `beatbattle-dev` (`RF-STO-06`) ·
> **Scripts:** `apps/server/src/scripts/realPlayerCheck.ts` (subida, verificación y borrado, sobre
> `createCloudinaryEntryStorage`) y `tools/shot/real-player.mjs` (Chrome con el reproductor global de la web en
> desarrollo) · **Requisitos:** `RF-PLAY-02`, `RF-PLAY-03`, `RD-MOT-06`, §4.7.3 y §4.8. Hecha con la confirmación
> del usuario.

## El audio

«Low Life», un beat del catálogo de `otherpeople.es/beats` (el MP3 público de su licencia), 5.793.808 bytes: el
mismo de la prueba real de la 4.10. No se guarda en el repositorio.

## Resultado (`prueba-real.log`)

| Paso | Resultado |
|---|---|
| Subida firmada | `public_id = beatbattle-dev/entries/prueba-real-5-23/<uuid>`, `video`/`authenticated` |
| Admin API | Existe, MP3, con sus bytes |
| Escucha | El derivado `f_mp3,br_192k` firmado responde (el `eager` es asíncrono: se espera a que llegue) |
| Reproductor global | Con el MP3 firmado de otro origen (`crossOrigin="anonymous"`): **suena** (2,46 s de reproducción a los 4 s, estado `playing`) |
| Analizador | Con una pista no ciega, el analizador del bus de música **lee el audio de Cloudinary** (suma del espectro 3529): CORS y `MediaElementSource` funcionan con el MP3 firmado |
| Voto ciego (`RD-MOT-06`) | La misma pista como entrada sin sellar sigue sonando y el analizador queda en **`null`**: nada visual la lee |
| Media Session (`RF-PLAY-02`) | Título «Prueba real 5.23» y artista (el alias) en los metadatos, con las acciones de play, pausa, anterior y siguiente |
| Ganancia (`RF-PLAY-03`) | −6 dB por el nodo de ganancia del motor (el volumen del elemento queda a 1: la igualación no lo toca) |
| Borrado | `destroy`; la Admin API ya no lo encuentra |

Duración total: 16,7 s.

En Android real no se ha comprobado la notificación de Media Session (no hay dispositivo; decisión del
2026-10-08 de cerrar con emulación): en Chrome de escritorio, los metadatos y las acciones están puestos.
