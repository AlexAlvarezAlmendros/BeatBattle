#!/usr/bin/env python3
"""Hojas A/B de la «prueba del sello» (`tools/shot/ab.mjs`): sello a la izquierda, BeatBattle a la derecha.

Uso: python3 tools/shot/ab_sheet.py <trabajos.json>

Cada trabajo del JSON:

    {"out": "hoja.png", "scale": 1,
     "a": {"png": "sello.png", "box": [x0, y0, x1, y1], "label": "Sello"},
     "b": {"png": "beatbattle.png", "box": [x0, y0, x1, y1], "label": "BeatBattle"}}

`ab.mjs` calcula las dos cajas del mismo tamaño, cada una sobre su pieza: mismo recorte y misma escala
a los dos lados. Lo que cae fuera de la captura sale en negro. Encima de cada mitad va su rótulo y, entre
las dos, una franja blanca. La hoja se guarda a 256 colores con tramado, como las capturas del sello.
"""

import json
import sys

from PIL import Image, ImageDraw, ImageFont

GAP = 12
LABEL_HEIGHT = 24
MIN_HALF_WIDTH = 140
SEPARATOR = (255, 255, 255)
LABEL_BACKGROUND = (24, 24, 24)
LABEL_TEXT = (235, 235, 235)


def label_font():
    try:
        return ImageFont.load_default(size=13)
    except TypeError:  # Pillow sin FreeType: la fuente de mapa de bits de siempre
        return ImageFont.load_default()


def crop_side(spec, scale):
    image = Image.open(spec['png']).convert('RGB')
    x0, y0, x1, y1 = (round(value) for value in spec['box'])
    crop = image.crop((x0, y0, x1, y1))
    if scale != 1:
        size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
        crop = crop.resize(size, Image.Resampling.LANCZOS)
    return crop


def compose(job):
    scale = job.get('scale', 1)
    sides = [(crop_side(job[key], scale), job[key]['label']) for key in ('a', 'b')]
    half = max(MIN_HALF_WIDTH, *(image.width for image, _ in sides))
    height = max(image.height for image, _ in sides)
    canvas = Image.new('RGB', (half * 2 + GAP, height + LABEL_HEIGHT), SEPARATOR)
    draw = ImageDraw.Draw(canvas)
    font = label_font()
    for index, (image, label) in enumerate(sides):
        x = index * (half + GAP)
        draw.rectangle((x, 0, x + half - 1, LABEL_HEIGHT + height - 1), fill=(0, 0, 0))
        draw.rectangle((x, 0, x + half - 1, LABEL_HEIGHT - 1), fill=LABEL_BACKGROUND)
        draw.text((x + 8, 5), label, fill=LABEL_TEXT, font=font)
        canvas.paste(image, (x, LABEL_HEIGHT))
    # `quantize` solo aplica el tramado cuando recibe una paleta: primero se calcula y luego se usa.
    palette = canvas.quantize(256, method=Image.Quantize.MEDIANCUT)
    canvas.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG).save(job['out'], optimize=True)


def main():
    with open(sys.argv[1], encoding='utf-8') as handle:
        jobs = json.load(handle)
    for job in jobs:
        compose(job)
    print(f'{len(jobs)} hojas A/B')


if __name__ == '__main__':
    main()
