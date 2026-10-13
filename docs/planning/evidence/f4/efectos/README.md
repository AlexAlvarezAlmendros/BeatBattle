# Efectos de la subida (tarea 4.17)

Renderizados *offline* en Chrome con el mismo código que suena (`apps/web/src/audio/offline.ts`), en La menor,
mono a 48 kHz, con `node tools/shot/sfx-wav.mjs <origen> docs/planning/evidence/f4/efectos`.

| Efecto | Pico medido | Anexo D | Suena | Nominal |
|---|---|---|---|---|
| `upload.hover` | −24,0 dBFS | −24 | 0,186 s | 240 ms |
| `upload.drop` | −14,0 dBFS | −14 | 0,238 s | 300 ms |
| `upload.progress` | −24,3 dBFS | −24 | 0,065 s | 80 ms |
| `upload.done` | −8,0 dBFS | −8 | 1,980 s | 2 s |
| `ann.newbeat` | −14,0 dBFS | −14 | 0,267 s | 200–400 ms |

`upload.progress.escala.wav`: las 20 notas del 5 % al 100 %, una cada 1/3 s (el tope del motor).

Medido, sin escuchar: falta que el usuario los oiga (también en `/dev/galeria`, bloque «Subida»).
