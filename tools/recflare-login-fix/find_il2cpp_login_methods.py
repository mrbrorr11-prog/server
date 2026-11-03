#!/usr/bin/env python3
"""Find addresses of account/session methods in Il2CppDumper dump.cs.

Read-only. Prints metadata and method RVAs; does not patch an APK.
Example:
  python3 tools/recflare-login-fix/find_il2cpp_login_methods.py /tmp/recflare-dump/dump.cs
"""
import pathlib
import re
import sys

TERMS = (
    "GetCachedLoginsAsync",
    "TryGetCachedAccountIdForLoginAsync",
    "RemoveCachedLogin",
    "AutoLoginState",
    "RefreshToken",
    "GetCachedAccount",
    "LoginWith",
)
ADDRESS = re.compile(r"\b(?:RVA|Offset|VA)\s*=\s*\"[^\"]+\"")
CLASS = re.compile(r"\b(?:class|struct|interface)\s+(\S+)")
def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: find_il2cpp_login_methods.py PATH_TO_dump.cs")
    p = pathlib.Path(sys.argv[1])
    if not p.is_file():
        raise SystemExit(f"Missing file: {p}")
    namespace, klass, last_addr = "", "", ""
    count = 0
    for line_no, line in enumerate(p.open(encoding="utf-8", errors="replace"), 1):
        trimmed = line.strip()
        if trimmed.startswith("// Namespace:"):
            namespace = trimmed.split(":", 1)[1].strip()
        if trimmed.startswith("public") or trimmed.startswith("internal") or trimmed.startswith("private"):
            match = CLASS.search(trimmed)
            if match:
                klass = match.group(1)
        if trimmed.startswith("// RVA:") or ("[Address(" in trimmed):
            last_addr = trimmed
        if any(term.lower() in trimmed.lower() for term in TERMS):
            if not trimmed.startswith("//") and not trimmed.startswith("[Address"):
                print(f"{line_no}: {namespace}.{klass}: {trimmed}")
                if last_addr:
                    print(f"    {last_addr}")
                count += 1
                if count >= 100:
                    break
    if not count:
        print("No matching declarations found: verify the dump.cs path and dump compatibility.")
if __name__ == "__main__":
    main()
