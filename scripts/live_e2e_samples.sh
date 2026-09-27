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
# Stereo (440 Hz left, 660 Hz right): the vocal remover's fast method needs 2 channels.
f.setnchannels(2); f.setsampwidth(2); f.setframerate(44100)
f.writeframes(b''.join(struct.pack('<hh', int(12000 * math.sin(2 * math.pi * 440 * i / 44100)), int(12000 * math.sin(2 * math.pi * 660 * i / 44100))) for i in range(44100 * 2)))
f.close()

# Minimal valid PDFs (Helvetica text, correct xref offsets), no dependencies.
NL = chr(10)
def make_pdf(path, labels):
    n = len(labels)
    objs = ['<< /Type /Catalog /Pages 2 0 R >>']
    kids = ' '.join(f'{3 + 2 * i} 0 R' for i in range(n))
    objs.append(f'<< /Type /Pages /Kids [{kids}] /Count {n} >>')
    font = 3 + 2 * n
    for i, label in enumerate(labels):
        stream = f'BT /F1 24 Tf 72 700 Td ({label}) Tj ET'
        objs.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 {font} 0 R >> >> /Contents {4 + 2 * i} 0 R >>')
        objs.append(f'<< /Length {len(stream)} >>' + NL + 'stream' + NL + stream + NL + 'endstream')
    objs.append('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    out = '%PDF-1.4' + NL
    offsets = []
    for i, o in enumerate(objs):
        offsets.append(len(out))
        out += f'{i + 1} 0 obj' + NL + o + NL + 'endobj' + NL
    xref = len(out)
    out += 'xref' + NL + f'0 {len(objs) + 1}' + NL + '0000000000 65535 f ' + NL
    for off in offsets:
        out += f'{off:010d} 00000 n ' + NL
    out += 'trailer' + NL + f'<< /Size {len(objs) + 1} /Root 1 0 R >>' + NL + 'startxref' + NL + str(xref) + NL + '%%EOF' + NL
    open(path, 'wb').write(out.encode('latin-1'))
make_pdf(os.path.join(d, 'two-page.pdf'), ['Xonvert e2e page one', 'Xonvert e2e page two'])
make_pdf(os.path.join(d, 'one-page.pdf'), ['Xonvert e2e single page'])
PY

# 2 s test video with a 440 Hz audio track (needs ffmpeg: apt-get install -y ffmpeg).
command -v ffmpeg >/dev/null || { echo "ffmpeg not found - install it (apt-get install -y ffmpeg)" >&2; exit 1; }
ffmpeg -nostdin -loglevel error -y -f lavfi -i testsrc=size=320x240:rate=25 -f lavfi -i sine=frequency=440:sample_rate=44100 \
  -t 2 -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart clip.mp4
ls -la "$DIR"
