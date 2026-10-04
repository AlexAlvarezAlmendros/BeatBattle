#!/usr/bin/env bash
# Regenera la evidencia de la prueba del sello de la tarea 0.7 (RD-VIS-02): capturas de la home de
# BeatBattle, medidas y comparaciones A/B con las capturas del sello de `../otp/`.
#
# Uso (desde la raíz del repo, con `pnpm dev` sirviendo la web):
#   bash docs/planning/evidence/f0/0.7-layout/capture.sh [http://localhost:5173]
# Necesita el Chrome del sistema (tools/shot) y python3 con Pillow.
set -euo pipefail
BASE=${1:-http://localhost:5173}
DIR=$(cd "$(dirname "$0")" && pwd)
OTP="$DIR/../otp"
SHOT="node tools/shot/shot.mjs"

# Imprime solo el resultado de --eval (la línea «eval: …») de una captura.
measure() {
  local out=$1
  shift
  $SHOT "$@" | sed -n 's/^eval: //p' >"$out"
}

measure "$DIR/desktop.json" "$BASE/" "$DIR/home-desktop.png" --wait=2500 "--eval=$(cat "$DIR/measure.js")"
measure "$DIR/mobile.json" "$BASE/" "$DIR/home-mobile.png" --mobile --wait=2500 "--eval=$(cat "$DIR/measure.js")"
measure "$DIR/desktop-reduced.json" "$BASE/" "$DIR/home-desktop-reduced.png" --reduced-motion --wait=2500 \
  "--eval=$(cat "$DIR/measure.js")"
measure "$DIR/mobile-reduced.json" "$BASE/" "$DIR/home-mobile-reduced.png" --mobile --reduced-motion --wait=2500 \
  "--eval=$(cat "$DIR/measure.js")"
measure "$DIR/menu-mobile.json" "$BASE/" "$DIR/menu-mobile.png" --mobile --wait=2000 "--eval=$(cat "$DIR/menu.js")"

# A/B: sello a la izquierda, BeatBattle a la derecha.
python3 "$DIR/compare.py" "$OTP/home-top-desktop.png" "$DIR/home-desktop.png" "$DIR/cmp-home-desktop.png" 0,0,1440,900 0.5
python3 "$DIR/compare.py" "$OTP/home-top-mobile.png" "$DIR/home-mobile.png" "$DIR/cmp-home-mobile.png" 0,0,390,844
python3 "$DIR/compare.py" "$OTP/home-top-desktop.png" "$DIR/home-desktop.png" "$DIR/cmp-island.png" 0,0,1440,130 0.6
python3 "$DIR/compare.py" "$OTP/home-top-desktop.png" "$DIR/home-desktop.png" "$DIR/cmp-hero.png" 300,360,1140,760 0.7
python3 "$DIR/compare.py" "$OTP/home-top-desktop.png" "$DIR/home-desktop.png" "$DIR/cmp-band.png" 0,770,1440,845 0.6

# Las capturas sueltas, a 256 colores con tramado (como las del sello).
python3 - "$DIR" <<'PY'
import sys
from pathlib import Path
from PIL import Image
for path in Path(sys.argv[1]).glob('home-*.png'):
    Image.open(path).convert('RGB').quantize(256, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
for path in Path(sys.argv[1]).glob('menu-*.png'):
    Image.open(path).convert('RGB').quantize(256, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
PY
echo "Evidencia regenerada en $DIR"
