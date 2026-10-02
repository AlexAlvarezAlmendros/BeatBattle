#!/usr/bin/env python3
"""PreToolUse (Bash) — bloquea `git add`/`git commit` de secretos o de la base de datos en BeatBattle.

Cubre: .env (salvo .env.example), *.db / *.sqlite / *.sqlite3, ficheros libSQL locales (local.db, *.db-wal, *.db-shm)
y backups (*.backup). Solo actúa si el cwd está dentro de BeatBattle. No-op en cualquier otro proyecto.
Bloquea (exit 2) devolviendo el motivo a Claude.
"""
import json
import re
import shlex
import subprocess
import sys


def is_forbidden(path):
    p = path.strip().strip('"').strip("'")
    if not p:
        return False
    base = p.rsplit("/", 1)[-1]
    if base == ".env.example":
        return False
    if base == ".env" or base.startswith(".env."):
        return True
    if re.search(r"\.(db|sqlite|sqlite3)$", base, re.IGNORECASE):
        return True
    if re.search(r"\.db-(wal|shm)$", base, re.IGNORECASE):  # ficheros auxiliares de libSQL/SQLite
        return True
    if base.endswith(".backup"):
        return True
    return False


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    cwd = data.get("cwd") or ""
    if "BeatBattle" not in cwd:
        sys.exit(0)

    cmd = ((data.get("tool_input") or {}).get("command") or "")
    if not re.search(r"\bgit\s+(add|commit)\b", cmd):
        sys.exit(0)

    offenders = set()

    # 1) argumentos explícitos del comando
    try:
        tokens = shlex.split(cmd)
    except Exception:
        tokens = cmd.split()
    for t in tokens:
        if t.startswith("-"):
            continue
        if is_forbidden(t):
            offenders.add(t)

    # 2) ficheros ya en stage (fiable en commit)
    try:
        out = subprocess.run(["git", "-C", cwd, "diff", "--cached", "--name-only"],
                             capture_output=True, text=True, timeout=10)
        for line in out.stdout.splitlines():
            if is_forbidden(line):
                offenders.add(line)
    except Exception:
        pass

    # 3) `git add .` / -A / --all / -u → escanea el árbol de trabajo
    if re.search(r"\bgit\s+add\b", cmd) and re.search(r"(\s\.(\s|$)|\s-A\b|--all\b|\s-u\b)", cmd):
        try:
            out = subprocess.run(["git", "-C", cwd, "status", "--porcelain"],
                                 capture_output=True, text=True, timeout=10)
            for line in out.stdout.splitlines():
                name = line[3:].strip()
                if " -> " in name:
                    name = name.split(" -> ", 1)[1]
                if is_forbidden(name):
                    offenders.add(name)
        except Exception:
            pass

    if offenders:
        sys.stderr.write(
            "⛔ Bloqueado en BeatBattle: no commitees secretos ni la base de datos:\n  - "
            + "\n  - ".join(sorted(offenders))
            + "\nQuítalos del stage (`git rm --cached <fichero>`) y verifica el .gitignore "
            "(.env, *.db, *.sqlite, *.db-wal, *.db-shm). El fichero libSQL y las credenciales de Cloudinary, Better Auth y SMTP "
            "no deben llegar al repo.\n"
        )
        sys.exit(2)

    sys.exit(0)


main()
