#!/usr/bin/env python3
"""Read-only check for Rec Center scene clues in a local RecFlare APK.

No assets are extracted, modified, downloaded, or uploaded.
The result is a lead, not proof that a particular room layout is playable.
"""
import base64
import glob
import json
import os
import re
import sys
import zipfile

SCENE_ID = "cbad71af-0831-44d8-b8ef-69edafa841f6"
MARKERS = ("reccenter", "rec_center", "rec center", SCENE_ID, "outdoor")
MAX_CATALOG_BYTES = 16 * 1024 * 1024


def inspect_catalog(zf, info):
    print("\nCatalog/settings:", info.filename, f"({info.file_size:,} bytes)")
    if info.file_size > MAX_CATALOG_BYTES:
        print("  Skipped: large file")
        return
    raw = zf.read(info)
    chunks = [("file text", raw)]
    if info.filename.lower().endswith(".json"):
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                print("  JSON keys:", ", ".join(list(data)[:10]))
                for field in ("m_KeyDataString", "m_BucketDataString", "m_EntryDataString"):
                    value = data.get(field)
                    if isinstance(value, str):
                        try:
                            chunks.append((field + " (decoded)", base64.b64decode(value)))
                        except (ValueError, base64.binascii.Error):
                            pass
        except (ValueError, UnicodeDecodeError):
            pass
    hits = []
    for label, content in chunks:
        for marker in MARKERS:
            match = re.search(re.escape(marker.encode()), content, re.IGNORECASE)
            if match:
                before = max(0, match.start() - 36)
                after = min(len(content), match.end() + 36)
                snippet = content[before:after].decode("utf-8", "replace")
                hits.append(f"{label}: {marker}: {snippet!r}")
    if hits:
        for h in hits[:12]:
            print("  MATCH", h)
    else:
        print("  No readable room-name or scene-ID clues (not proof of absence).")

    # Binary Addressables catalogs can embed readable keys between length
    # prefixes and hashes. Show the number of references and printable nearby
    # tokens, rather than one mostly unreadable binary blob per keyword.
    for marker in (b"RecCenter", b"Rec_Center", b"Outdoor", b"cafeteria", b"stage", SCENE_ID.encode()):
        found = list(re.finditer(re.escape(marker), raw, flags=re.IGNORECASE))
        if not found:
            continue
        print(f"  \\n  {marker.decode('ascii')}: {len(found)} occurrence(s)")
        seen = set()
        for m in found[:30]:
            excerpt = raw[max(0, m.start() - 36):min(len(raw), m.end() + 95)]
            text = " | ".join(
                x.decode("utf-8", "replace").strip()
                for x in re.findall(rb"[ -~]{4,}", excerpt)
                if x.strip()
            )[:170]
            if text and text not in seen:
                seen.add(text)
                print("    ", text)
                if len(seen) >= 8:
                    break

    # Catalogs can also name the remote host supplying content not packaged
    # in the APK. Display just a few URL-like strings, never fetch them.
    urls = re.findall(rb"https?://[a-zA-Z0-9._~:/?#@!    if hits:
        for h in hits[:12]:
            print("  MATCH", h)
    else:
        print("  No readable room-name or scene-ID clues (not proof of absence).")
'()*+,;=%-]{7,}", raw)
    if urls:
        print("  Referenced network locations (NOT downloaded):")
        for url in dict.fromkeys(urls):
            print("    ", url.decode("ascii", "replace")[:155])
            if len(urls) > 12 and url == urls[11]:
                break


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else "/workspaces/apk-input/*2026*.apk"
    matches = sorted(glob.glob(pattern))
    if not matches:
        print("No 2026 APK found at:", pattern)
        return 1
    apk = next((p for p in matches if "Custom-Server" in os.path.basename(p)), matches[0])
    print("APK:", apk)
    with zipfile.ZipFile(apk) as zf:
        files = zf.infolist()
        bundles = [i for i in files if i.filename.lower().endswith((".bundle", ".unity3d"))]
        levels = [i for i in files if re.search(r"/level\d+(?:\.split\d+)?$", i.filename, re.I)]
        print("Built-in Unity scene files:", len(levels))
        print("Packaged Unity AssetBundles:", len(bundles))
        print("Total packaged bundle size:", round(sum(x.file_size for x in bundles) / 1048576, 1), "MiB")
        catalog_files = [
            i for i in files
            if "assets/" in i.filename.lower()
            and (("catalog" in os.path.basename(i.filename).lower()
                 and i.filename.lower().endswith((".json", ".bin")))
                 or os.path.basename(i.filename).lower() == "settings.json")
        ]
        if not catalog_files:
            print("No named Addressables catalog/settings file in APK.")
            print("The client may use another catalog location or remote content.")
        else:
            for info in catalog_files[:15]:
                inspect_catalog(zf, info)
    print("\nMeaning: catalog references suggest where assets are located; they")
    print("do NOT confirm the expanded Rec Center layout is included or playable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
