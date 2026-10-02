#!/usr/bin/env python3
"""PostToolUse (Edit|Write) — validación de FORMATO y CALIDAD en BeatBattle.

Sobre ficheros TS/TSX/JS/JSX/JSON editados:
  1. Pasa Biome (`biome check --write`) si está instalado en el checkout → autoformato + autofix de lint.
  2. Si no hay Biome pero hay ESLint, cae a `eslint --fix`.
  3. Devuelve a Claude un recordatorio de calidad (typecheck/tests) como additionalContext.

Nunca bloquea (siempre exit 0): PostToolUse no debe cortar el flujo de trabajo.
Solo actúa dentro del repo BeatBattle y fuera de node_modules/dist.
"""
import json
import os
import subprocess
import sys

EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json")


def find_repo_root(path):
    """Sube desde el fichero hasta encontrar la carpeta que contiene .git (el checkout de BeatBattle)."""
    d = os.path.dirname(path)
    while d and d != "/":
        if os.path.isdir(os.path.join(d, ".git")) or os.path.basename(d) == "BeatBattle":
            return d
        d = os.path.dirname(d)
    return None


def first_existing(*cands):
    for c in cands:
        if c and os.path.isfile(c):
            return c
    return None


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    fp = ((data.get("tool_input") or {}).get("file_path") or "").replace("\\", "/")
    if "BeatBattle" not in fp:
        sys.exit(0)
    if "/node_modules/" in fp or "/dist/" in fp or "/.git/" in fp:
        sys.exit(0)
    if not fp.endswith(EXTS):
        sys.exit(0)

    root = find_repo_root(fp) or ""
    bin_dir = os.path.join(root, "node_modules", ".bin")

    # 1) Biome (herramienta oficial del proyecto: formato + lint)
    biome = first_existing(os.path.join(bin_dir, "biome"))
    if biome:
        try:
            subprocess.run(
                [biome, "check", "--write", "--no-errors-on-unmatched", fp],
                cwd=root, capture_output=True, text=True, timeout=60,
            )
        except Exception:
            pass
    else:
        # 2) Fallback a ESLint si el checkout aún no tiene Biome
        eslint = first_existing(os.path.join(bin_dir, "eslint"))
        if eslint and fp.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")):
            try:
                subprocess.run(
                    [eslint, "--fix", "--no-error-on-unmatched-pattern", fp],
                    cwd=root, capture_output=True, text=True, timeout=60,
                )
            except Exception:
                pass

    # 3) Recordatorio de calidad para el código de la app (no para config/JSON sueltos)
    if fp.endswith((".ts", ".tsx")) and ("/src/" in fp or "/backend/" in fp or "/frontend/" in fp):
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": (
                    "BeatBattle — antes de dar el cambio por cerrado: pasa `pnpm check`, `pnpm typecheck` "
                    "y los tests Vitest afectados (con el id del requisito en el nombre); la UI y el audio se "
                    "verifican en el navegador (tools/shot). Spec first: si cambia el comportamiento, actualiza "
                    "docs/guia-maestra.md y su registro de cambios en el mismo commit. packages/rules puro y "
                    "determinista (sin Date.now/Math.random), solo tokens de diseño, voto ciego sin fugas, "
                    "sin atribución a la IA en commits."
                ),
            }
        }))

    sys.exit(0)  # PostToolUse: nunca bloquea


main()
