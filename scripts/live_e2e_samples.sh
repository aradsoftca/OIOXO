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

# ---- extra samples for the full-site sweep (scripts/live_sweep.mjs) ----
# Pinned public files: an OFL font (TTF), an OFL font (OTF) and a HEIC photo.
get lato.ttf     https://raw.githubusercontent.com/google/fonts/23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl/lato/Lato-Regular.ttf
get source.otf   https://raw.githubusercontent.com/adobe-fonts/source-sans/87b37a2daaed80fcb8e8ccb0085c4d72ddade12e/OTF/SourceSans3-Regular.otf
get example.heic https://raw.githubusercontent.com/strukturag/libheif/5c7b41f3cc097447dd3c700cc9ec7d94fbb59eec/examples/example.heic

# Media derived from the generated samples (ffmpeg).
ff() { ffmpeg -nostdin -loglevel error -y "$@"; }
ff -i test.png test.jpg
ff -i test.png test.webp
ff -f lavfi -t 1 -i testsrc=size=160x120:rate=10 -vf "split[a][b];[a]palettegen[p];[b][p]paletteuse" anim.gif
ff -i clip.mp4 -c copy clip.mov
ff -i clip.mp4 -c copy clip.mkv
ff -i clip.mp4 -c:v mpeg4 -c:a mp3 clip.avi
ff -i tone.wav -c:a libmp3lame -b:a 128k tone.mp3
ff -f lavfi -i sine=frequency=880:sample_rate=44100 -t 2 -ac 2 tone2.wav

python3 - "$DIR" <<'PY'
import os, sys, zipfile, json
d = sys.argv[1]
NL = chr(10)
def p(name): return os.path.join(d, name)
def write_zip(path, files, stored_first=None):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        if stored_first:
            z.writestr(zipfile.ZipInfo(stored_first[0]), stored_first[1], compress_type=zipfile.ZIP_STORED)
        for n, c in files:
            z.writestr(n, c)

X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument'

# DOCX
write_zip(p('test.docx'), [
    ('[Content_Types].xml', X + f'<Types xmlns="{CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    ('_rels/.rels', X + f'<Relationships xmlns="{PKG_R}"><Relationship Id="rId1" Type="{OD}" Target="word/document.xml"/></Relationships>'),
    ('word/document.xml', X + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Xonvert e2e document.</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>'),
])

# XLSX
write_zip(p('test.xlsx'), [
    ('[Content_Types].xml', X + f'<Types xmlns="{CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    ('_rels/.rels', X + f'<Relationships xmlns="{PKG_R}"><Relationship Id="rId1" Type="{OD}" Target="xl/workbook.xml"/></Relationships>'),
    ('xl/workbook.xml', X + f'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="{R_NS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    ('xl/_rels/workbook.xml.rels', X + f'<Relationships xmlns="{PKG_R}"><Relationship Id="rId1" Type="{R_NS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    ('xl/worksheets/sheet1.xml', X + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>name</t></is></c><c r="B1" t="inlineStr"><is><t>qty</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>apple</t></is></c><c r="B2"><v>3</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>pear</t></is></c><c r="B3"><v>5</v></c></row></sheetData></worksheet>'),
])

# PPTX (one slide, with the master/layout/theme PowerPoint readers require)
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
NS = f'xmlns:a="{A}" xmlns:r="{R_NS}" xmlns:p="{P}"'
SPTREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
theme = X + f'<a:theme xmlns:a="{A}" name="T"><a:themeElements><a:clrScheme name="T"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="T"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="T"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'
write_zip(p('test.pptx'), [
    ('[Content_Types].xml', X + f'<Types xmlns="{CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>'),
    ('_rels/.rels', X + f'<Relationships xmlns="{PKG_R}"><Relationship Id="rId1" Type="{OD}" Target="ppt/presentation.xml"/></Relationships>'),
    ('ppt/presentation.xml', X + f'<p:presentation {NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'),
    ('ppt/_rels/presentation.xml.rels', X + f'<Relationships xmlns="{PKG_R}"><Relationship Id="rId1" Type="{R_NS}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="{R_NS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="{R_NS}/theme" Target="theme/theme1.xml"/></Relationships>'),
    ('ppt/slideMasters/slideMaster1.xml', X + f'<p:sldMaster {NS}><p:cSld><p:spTree>{SPTREE}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'),
    ('ppt/slideMasters/_rels/slideMaster1.xml.rels', X + f'<Relationships xmlns="{PKG_R}"><Relationship Id="rId1" Type="{R_NS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="{R_NS}/theme" Target="../theme/theme1.xml"/></Relationships>'),
    ('ppt/slideLayouts/slideLayout1.xml', X + f'<p:sldLayout {NS}><p:cSld><p:spTree>{SPTREE}</p:spTree></p:cSld></p:sldLayout>'),
    ('ppt/slideLayouts/_rels/slideLayout1.xml.rels', X + f'<Relationships xmlns="{PKG_R}"><Relationship Id="rId1" Type="{R_NS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'),
    ('ppt/slides/slide1.xml', X + f'<p:sld {NS}><p:cSld><p:spTree>{SPTREE}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="7315200" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200"/><a:t>Xonvert e2e slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'),
    ('ppt/slides/_rels/slide1.xml.rels', X + f'<Relationships xmlns="{PKG_R}"><Relationship Id="rId1" Type="{R_NS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>'),
    ('ppt/theme/theme1.xml', theme),
])

# EPUB 3 (mimetype stored first, as the spec requires)
write_zip(p('test.epub'), [
    ('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    ('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:3f7c2a52-7d0e-4b36-9a1b-5e2e00000001</dc:identifier><dc:title>Xonvert e2e book</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>'),
    ('OEBPS/nav.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Chapter 1</a></li></ol></nav></body></html>'),
    ('OEBPS/c1.xhtml', '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1><p>Xonvert e2e chapter text.</p></body></html>'),
], stored_first=('mimetype', 'application/epub+zip'))

# Plain zip archive
write_zip(p('test.zip'), [('hello.txt', 'hello from xonvert e2e' + NL), ('data/numbers.csv', 'a,b' + NL + '1,2' + NL)])

# Text formats
srt = NL.join(['1', '00:00:00,500 --> 00:00:02,000', 'Hello from the e2e sweep.', '', '2', '00:00:02,500 --> 00:00:04,000', 'Second subtitle line.', ''])
open(p('test.srt'), 'w').write(srt)
open(p('test.vtt'), 'w').write(NL.join(['WEBVTT', '', '00:00:00.500 --> 00:00:02.000', 'Hello from the e2e sweep.', '', '00:00:02.500 --> 00:00:04.000', 'Second subtitle line.', '']))
open(p('test.csv'), 'w').write(NL.join(['name,qty,price', 'apple,3,1.20', 'pear,5,0.80', '']))
open(p('test.json'), 'w').write(json.dumps({'items': [{'name': 'apple', 'qty': 3}, {'name': 'pear', 'qty': 5}]}, indent=2))
open(p('test.md'), 'w').write(NL.join(['# Xonvert e2e', '', 'Some **bold** text and a list:', '', '- one', '- two', '']))
open(p('test.txt'), 'w').write('Xonvert e2e plain text. The quick brown fox jumps over the lazy dog.' + NL)
open(p('test.svg'), 'w').write('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><rect width="64" height="48" fill="#3366cc"/><circle cx="32" cy="24" r="14" fill="#ffcc00"/></svg>')
PY
ls -la "$DIR"
