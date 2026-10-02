#!/usr/bin/env python3
"""PreToolUse (Bash) — bloquea commits/PRs con atribución a la IA en BeatBattle.

Regla global del usuario: los commits y PRs no llevan "Co-Authored-By: Claude" ni
"Generated with Claude" ni noreply@anthropic.com. Solo actúa dentro de BeatBattle.
"""
import json
import sys


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    cwd = data.get("cwd") or ""
    if "BeatBattle" not in cwd:
        sys.exit(0)

    command = ((data.get("tool_input") or {}).get("command") or "")
    is_commit = "git commit" in command or "gh pr create" in command
    banned = (
        "co-authored-by: claude",
        "generated with claude",
        "generated with [claude",
        "claude.com/claude-code",
        "noreply@anthropic.com",
    )

    if is_commit and any(b in command.lower() for b in banned):
        sys.stderr.write(
            "⛔ Bloqueado: los commits y PRs de BeatBattle no llevan atribución a la IA "
            "(sin 'Co-Authored-By: Claude' ni 'Generated with Claude'). "
            "Reescribe el mensaje sin esas líneas.\n"
        )
        sys.exit(2)

    sys.exit(0)


main()
