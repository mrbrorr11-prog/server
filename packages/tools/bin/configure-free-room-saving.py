#!/usr/bin/env python3
"""Add the shared free room KV namespace to .env without replacing existing IDs.

Usage:
    python3 packages/tools/bin/configure-free-room-saving.py <32-character-KV-namespace-id>

The namespace must already exist in the same Cloudflare account as the
storage and cdn Workers. It is NOT an API token.
"""
import json
import re
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2 or not re.fullmatch(r"[a-fA-F0-9]{32}", sys.argv[1]):
        print("Usage: python3 packages/tools/bin/configure-free-room-saving.py <32-character-KV-id>")
        return 2

    root = Path(__file__).resolve().parents[3]
    env_file = root / ".env"
    if not env_file.is_file():
        print("Missing root .env. Set up the project's existing environment first.")
        return 1

    lines = env_file.read_text().splitlines()
    original = next((line for line in lines if line.startswith("RECFLARE_KV=")), None)
    value = original.split("=", 1)[1].strip() if original else ""
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1]
    try:
        bindings = json.loads(value) if value else {}
    except json.JSONDecodeError:
        print("RECFLARE_KV is not valid JSON; leaving .env unchanged.")
        return 1
    if not isinstance(bindings, dict):
        print("RECFLARE_KV must be a JSON object; leaving .env unchanged.")
        return 1

    bindings["RECFLARE_ROOM_BLOBS"] = sys.argv[1].lower()
    kv_line = "RECFLARE_KV='" + json.dumps(bindings, separators=(",", ":")) + "'"
    replaced_kv = False
    replaced_r2 = False
    updated = []
    for line in lines:
        if line.startswith("RECFLARE_KV="):
            if not replaced_kv:
                updated.append(kv_line)
                replaced_kv = True
        elif line.startswith("RECFLARE_DISABLE_R2="):
            if not replaced_r2:
                updated.append("RECFLARE_DISABLE_R2=1")
                replaced_r2 = True
        else:
            updated.append(line)
    if not replaced_kv:
        updated.append(kv_line)
    if not replaced_r2:
        updated.append("RECFLARE_DISABLE_R2=1")
    env_file.write_text("\n".join(updated) + "\n")
    print("Configured free room storage. Existing KV namespace IDs were preserved.")
    print("R2-free deployment enabled. Deploy storage and cdn after merging the PR.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
