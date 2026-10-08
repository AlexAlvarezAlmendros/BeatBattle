# Spike de ffmpeg en Vercel (tarea 1.8, §4.8.4, `RF-STO-04`)

Medido el 2026-10-07 con un proyecto de prueba de Vercel (`beatbattle-ffmpeg-spike`, región `fra1`, creado
con confirmación del usuario) y la cuenta propia de Cloudinary. El código es `tools/spike/ffmpeg-vercel/`:
una función (`api/measure.js`) con `ffmpeg-static` 5.3.0 (ffmpeg 7.0.2) que pide el original
`authenticated` con URL firmada y, en una sola pasada (`asplit`), mide sonoridad integrada y pico real
(`ebur128=peak=true`) y saca la señal a 8 kHz mono para la forma de onda de 1000 tramos.

Fichero: `beatbattle-dev/spike/ffmpeg-50mb`, un WAV de 51,8 MB (48 kHz, 24 bit, estéreo, 3 min) con un
seno de 997 Hz de amplitud 0,316 en los dos canales (−10 LUFS y pico −10 dBFS de referencia, BS.1770). Es el tamaño que pide la tarea; un WAV de 4 min a 48 kHz y 24 bit pesa 69 MB, y el máximo que se acepta es 100 MB (§4.8.4).

| Llamada | Arranque | ffmpeg (descarga + medida) | Total en la función | Pared (desde casa) | LUFS | Pico | Memoria |
|---|---|---|---|---|---|---|---|
| Local (portátil) | — | 4,7 s | — | — | −10,0 | −10,0 dBFS | — |
| 1.ª en Vercel (instancia precalentada al desplegar) | 63 s antes | 3,4 s | 3,4 s | — | −10,0 | −10,0 dBFS | 113 MB |
| Caliente | — | 2,3 s | 2,4 s | 2,7 s | −10,0 | −10,0 dBFS | 115 MB |
| Caliente | — | 2,3 s | 2,3 s | 2,4 s | −10,0 | −10,0 dBFS | 119 MB |
| **Fría** (instancia nueva) | 26 ms antes | 2,7 s | 2,7 s | **3,7 s** | −10,0 | −10,0 dBFS | 124 MB |

Datos crudos en `resultados.json`.

## Veredicto: **GO**

- **Cabe**: el binario pesa 79,8 MB (28 MB comprimido); la función entera, unos 80 MB frente al límite
  de 250 MB sin comprimir de Vercel.
- **Rinde**: 3,7 s de pared en frío y ~2,5 s en caliente, frente al umbral de 8 s. La memoria no pasa de
  124 MB.
  El tiempo crece con los bytes (descarga y decodificación): a 100 MB serían ~5 s en caliente y ~6 s en
  frío (extrapolado, no medido), bajo 8 s pero con menos margen. Si alguna medición se pasa del límite de la función, la
  entrada queda en `processing` y la completa el siguiente `tick` (§4.8.4).
- **Mide bien** (`RF-STO-04`): −10,0 LUFS y −10,0 dBFS, iguales a la referencia (tolerancia ±0,5 LU), y
  1000 tramos de onda sobre los 180 s.
- El plan B (medición en el cliente con mediana) **no hace falta**; queda en la guía como reserva.

## Lo que cambia respecto a la guía

- **ffmpeg no abre la URL**: el ffmpeg estático da un fallo de segmento (salida 139) al resolver DNS al
  abrir HTTPS (lo daba en el portátil). La descarga la hace Node con `fetch` y se pasa a la entrada
  estándar de ffmpeg (`pipe:0`) según llega, sin tocar disco. §4.8.4 corregido (v0.6.18).
- **El binario hay que meterlo a mano** en la función: `includeFiles: "node_modules/ffmpeg-static/ffmpeg"`
  en `vercel.json` (el empaquetador no lo detecta por el `import`).
- **El script de instalación de `ffmpeg-static` descarga el binario**. npm ya avisa de que no está en
  `allowScripts`, y pnpm 10 no ejecuta scripts de dependencias si no se le permite
  (`onlyBuiltDependencies`). Al integrarlo en `apps/server` (Fase 4), con pnpm 9.15 hoy, hay que dejarlo
  permitido y comprobar en la CI que el binario existe.
- `memory` en `vercel.json` se ignora con la facturación por CPU activa (Fluid): sobra.

## Limpieza

El proyecto de Vercel `beatbattle-ffmpeg-spike` y el fichero `beatbattle-dev/spike/ffmpeg-50mb` de
Cloudinary siguen existiendo hasta que el usuario confirme su borrado.
