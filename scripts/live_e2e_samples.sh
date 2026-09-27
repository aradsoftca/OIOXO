#!/usr/bin/env bash
# Fetch the public samples used by scripts/live_e2e.mjs into SAMPLES_DIR (pinned commits)
# and generate test.png + tone.wav. Needs curl and python3.
set -euo pipefail
DIR="${SAMPLES_DIR:-/root/cadtest/samples}"
mkdir -p "$DIR"
cd "$DIR"

ASSIMP=https://raw.githubusercontent.com/assimp/assimp/f936bf18a2a58c41afa206c43a4967b32a1ccec8/test/models
OCCT=https://raw.githubusercontent.com/kovacsv/occt-import-js/41e470890ae0f9dc69ac50ffd5fc73e03576f4eb/test/testfiles
DWG=https://raw.githubusercontent.com/LibreDWG/libredwg/34f02f54b9aacb5708c1d3d2070efb3e4b2d8c43/test/test-data

get() { curl -4 -sfL -o "$1" "$2" || { echo "download failed: $2" >&2; exit 1; }; }
get box.fbx          "$ASSIMP/FBX/box.fbx"
get box.obj          "$ASSIMP/OBJ/box.obj"
get as1-oc-214.step  "$OCCT/cax-if/as1-oc-214.stp"
get example_2000.dwg "$DWG/example_2000.dwg"

python3 - "$DIR" <<'PY'
import math, struct, sys, wave, zlib, os
d = sys.argv[1]
w, h = 64, 48
rows = []
for y in range(h):
    row = bytearray([0])
    for x in range(w):
        row += bytes([(x * 4) % 256, (y * 5) % 256, 128, 255])
    rows.append(bytes(row))
def chunk(t, data):
    return struct.pack('>I', len(data)) + t + data + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)
png = bytes([0x89]) + b'PNG' + bytes([13, 10, 26, 10])
png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(b''.join(rows)))
png += chunk(b'IEND', b'')
open(os.path.join(d, 'test.png'), 'wb').write(png)
f = wave.open(os.path.join(d, 'tone.wav'), 'wb')
f.setnchannels(1); f.setsampwidth(2); f.setframerate(44100)
f.writeframes(b''.join(struct.pack('<h', int(12000 * math.sin(2 * math.pi * 440 * i / 44100))) for i in range(44100 * 2)))
f.close()
PY
ls -la "$DIR"
