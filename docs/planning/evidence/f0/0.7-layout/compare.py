"""Pone dos capturas una al lado de otra (A = sello, B = BeatBattle), recortadas por la misma caja.

Uso: python3 compare.py <a.png> <b.png> <salida.png> <x0,y0,x1,y1> [escala]
"""

import sys

from PIL import Image

a_path, b_path, out = sys.argv[1:4]
x0, y0, x1, y1 = (int(v) for v in sys.argv[4].split(','))
scale = float(sys.argv[5]) if len(sys.argv) > 5 else 1
a = Image.open(a_path).convert('RGB').crop((x0, y0, x1, y1))
b = Image.open(b_path).convert('RGB').crop((x0, y0, x1, y1))
w, h = a.size
canvas = Image.new('RGB', (w * 2 + 12, h), (255, 255, 255))
canvas.paste(a, (0, 0))
canvas.paste(b, (w + 12, 0))
if scale != 1:
    canvas = canvas.resize((int(canvas.width * scale), int(canvas.height * scale)), Image.LANCZOS)
# 256 colores con tramado, como las capturas de referencia del sello (../otp/README.md).
canvas.quantize(256, dither=Image.Dither.FLOYDSTEINBERG).save(out, optimize=True)
