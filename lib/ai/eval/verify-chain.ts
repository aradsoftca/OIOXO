/**
 * Xonvert AI — live executor verification (Node, real engines).
 *
 * Exercises the planner → executor → engine path against pdf-lib for real, so we
 * know the chain actually produces a valid file (not just that it typechecks).
 * The doc-convert step (docxToPdf) is browser-only — jsPDF/html2canvas need a
 * DOM — so it's verified by typecheck + plan shape here and needs a quick
 * in-browser spot-check; everything downstream of it runs here for real.
 *
 * Run:  npx tsx lib/ai/eval/verify-chain.ts
 */

import { PDFDocument } from 'pdf-lib';
import { planRequest } from '../planner';
import { runChain } from '../executor';

const ok = (c: boolean, msg: string) => console.log(`${c ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${msg}`);
let failures = 0;
const assert = (c: boolean, msg: string) => { ok(c, msg); if (!c) failures++; };

async function makePdf(pages: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) { const p = doc.addPage([300, 400]); p.drawText(`Page ${i + 1}`, { x: 40, y: 360 }); }
  const bytes = await doc.save();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([buf], 'test.pdf', { type: 'application/pdf' });
}

async function pageCount(blob: Blob): Promise<number> {
  const doc = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
  return doc.getPageCount();
}

async function main() {
  console.log('\nXonvert AI — executor verification (real engines)\n');

  // 1) Plan shape for the docx flagship (no execution of the browser-only step).
  const docPlan = planRequest('take this word doc, delete pages 5-7 and add page numbers', { inputMedium: 'doc' });
  assert(
    docPlan.steps.map((s) => s.toolId).join(',') === 'doc-convert,pdf-delete-pages,pdf-page-numbers',
    `docx plan shape: ${docPlan.steps.map((s) => s.toolId).join(' → ')}`,
  );

  // 2) Real PDF chain: a 10-page PDF, delete pages 5-7, then add page numbers.
  const pdfPlan = planRequest('delete pages 5-7 and add page numbers', { inputMedium: 'pdf' });
  assert(pdfPlan.steps.map((s) => s.toolId).join(',') === 'pdf-delete-pages,pdf-page-numbers', `pdf plan: ${pdfPlan.steps.map((s) => s.toolId).join(' → ')}`);
  const del = pdfPlan.steps.find((s) => s.toolId === 'pdf-delete-pages');
  assert(JSON.stringify(del?.params.pages) === '[5,6,7]', `extracted pages param: ${JSON.stringify(del?.params.pages)}`);

  // A lone PDF request decomposes to one runnable step (the single-file inline path).
  const single = planRequest('delete pages 5-7 from this pdf', { inputMedium: 'pdf' });
  assert(single.steps.length === 1 && single.steps[0].toolId === 'pdf-delete-pages', `single PDF op → 1 step (${single.steps.map((s) => s.toolId).join(',')})`);
  // Watermark text is captured from natural phrasing (free-text clarify feeds this).
  const wm = planRequest('watermark this pdf with CONFIDENTIAL', { inputMedium: 'pdf' });
  assert(wm.steps[0]?.params.title === 'CONFIDENTIAL', `watermark text extracted (${JSON.stringify(wm.steps[0]?.params.title)})`);

  const input = await makePdf(10);
  const outcome = await runChain(input, pdfPlan.steps);
  assert(outcome.error === undefined, `chain ran without error${outcome.error ? ': ' + outcome.error : ''}`);
  assert(outcome.ran === 2, `both steps ran (ran=${outcome.ran})`);
  assert(outcome.result?.kind === 'file', `produced a file (kind=${outcome.result?.kind})`);
  if (outcome.result?.kind === 'file') {
    const count = await pageCount(outcome.result.blob);
    assert(count === 7, `output has 7 pages after deleting 3 (got ${count})`);
    assert(outcome.result.blob.size > 0 && outcome.result.filename.endsWith('.pdf'), `valid pdf output: ${outcome.result.filename}, ${outcome.result.blob.size} bytes`);
  }

  // 3) Single inline image/audio steps share the same registry — sanity check
  //    the executor recognises a capability runner exists for one.
  const { hasRunner } = await import('../executor');
  assert(hasRunner('image-grayscale'), 'inline capability runner detected (image-grayscale)');
  assert(hasRunner('pdf-extract-pages'), 'dedicated pdf runner detected (pdf-extract-pages)');
  assert(hasRunner('image-blur') && hasRunner('image-vignette') && hasRunner('image-hue'), 'new image effect runners detected');
  assert(hasRunner('image-crop') && hasRunner('image-thumbnail'), 'image crop + thumbnail runners detected');
  assert(hasRunner('image-add-text') && hasRunner('image-watermark') && hasRunner('image-upscale'), 'image overlay/watermark/upscale runners detected');
  assert(hasRunner('audio-stereo-to-mono') && hasRunner('audio-pan'), 'new audio effect runners detected');
  assert(!hasRunner('definitely-not-a-tool'), 'unknown tool has no runner');

  // 4) Text ops run for real on text pulled from a message.
  const { textOpFor, extractOperand, TEXT_OPS } = await import('../text-ops');
  assert(Object.keys(TEXT_OPS).length >= 25, `text op registry populated (${Object.keys(TEXT_OPS).length} ops)`);
  assert(extractOperand('uppercase this: hello world') === 'hello world', 'operand extracted after colon');
  assert(textOpFor('text-uppercase')!.run('hello world', 'uppercase this: hello world') === 'HELLO WORLD', 'uppercase op works');
  assert(textOpFor('text-snake-case')!.run('Hello World Foo', '') === 'hello_world_foo', 'snake_case op works');
  assert(textOpFor('text-remove-duplicates')!.run('a\nb\na\nc\nb', '') === 'a\nb\nc', 'dedupe lines works');
  assert(textOpFor('text-extract-emails')!.run('ping a@b.com and c@d.io', '') === 'a@b.com\nc@d.io', 'email extraction works');
  assert(textOpFor('text-find-replace')!.run('cat dog cat', 'replace cat with fox') === 'fox dog fox', 'find & replace works');

  // 4b) Text-op CHAINING through the executor (the gap we just closed).
  const tplan = planRequest('remove duplicate lines and sort them');
  assert(tplan.steps.map((s) => s.toolId).join(',') === 'text-remove-duplicates,text-sort-lines', `text chain plan: ${tplan.steps.map((s) => s.toolId).join(' → ')}`);
  const tout = await runChain('banana\napple\nbanana\ncherry', tplan.steps);
  assert(tout.result?.kind === 'text' && tout.result.text === 'apple\nbanana\ncherry', `text chain dedupe→sort (got ${tout.result?.kind === 'text' ? JSON.stringify(tout.result.text) : tout.result?.kind})`);
  assert(extractOperand('uppercase this: hello world') === 'hello world', 'operand still extracted');

  // 4c) doc→PDF text renderer (the fast, universal path the AI now uses).
  const { textToPdf } = await import('@/engines/document');
  const longText = Array.from({ length: 120 }, (_, i) => `Line ${i + 1}: the quick brown fox jumps over the lazy dog to fill the page with wrapping text.`).join('\n');
  const docPdf = await textToPdf(longText, 'test');
  const docPages = await pageCount(docPdf);
  assert(docPdf.size > 0 && docPages >= 2, `text→PDF renders a multi-page document (${docPages} pages, ${docPdf.size} bytes)`);
  const emojiPdf = await textToPdf('héllo 😀 wörld — and CJK 文字', 'unicode');
  assert(emojiPdf.size > 0, 'text→PDF survives non-WinAnsi characters without throwing');

  // 4f) Multi-file COMBINE — merge PDFs (pure pdf-lib, Node-verifiable).
  const { combineFor, combineToolFor, isCombineIntent } = await import('../combine');
  assert(isCombineIntent('merge these pdfs into one') && !isCombineIntent('compress this'), 'combine intent detection');
  const a3 = await makePdf(3), b2 = await makePdf(2);
  assert(combineToolFor([a3, b2], 'merge these') === 'pdf-merge', 'combineToolFor picks pdf-merge for PDFs');
  const merged = await combineFor('pdf-merge')!([a3, b2]);
  assert(merged.kind === 'file', 'pdf-merge produces a file');
  if (merged.kind === 'file') { const n = await pageCount(merged.blob); assert(n === 5, `merged 3+2 pages = 5 (got ${n})`); }

  // 4d) Dev ops run for real (pure + SubtleCrypto, both present in Node).
  const { devOpFor: devOp } = await import('../dev-ops');
  assert(devOp('dev-json-format')!.run('{"a":1,"b":2}', '') === '{\n  "a": 1,\n  "b": 2\n}', 'json format works');
  assert(devOp('dev-json-minify')!.run('{ "a" : 1 }', '') === '{"a":1}', 'json minify works');
  assert(devOp('dev-slug')!.run('Hello, World! Café', '') === 'hello-world-cafe', 'slugify works');
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(devOp('dev-uuid')!.run('', ''))), 'uuid v4 format');
  assert(String(devOp('dev-password')!.run('', 'password 20')).length === 20, 'password honours requested length');
  const sha = await devOp('dev-hash')!.run('abc', 'sha256');
  assert(sha === 'SHA-256: ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', `sha-256 of "abc" correct (${sha.slice(0, 24)}…)`);
  const rows = JSON.parse(String(await devOp('gen-random-data')!.run('', '5 users')));
  assert(Array.isArray(rows) && rows.length === 5 && typeof rows[0].email === 'string', `random data → 5 records (${rows.length})`);

  // 4e) Color ops (pure math) — exact conversions + WCAG contrast.
  const { colorOpFor } = await import('../color-ops');
  const conv = colorOpFor('gen-color-converter')!.run('convert #ff0000');
  assert(conv != null && conv.includes('RGB(255, 0, 0)') && conv.includes('HSL(0, 100%, 50%)'), `hex→rgb/hsl conversion (${conv})`);
  const con = colorOpFor('gen-color-contrast')!.run('contrast between black and white');
  assert(con != null && con.startsWith('Contrast 21.00:1') && con.includes('AAA'), `black/white contrast = 21:1 AAA (${con})`);
  assert(colorOpFor('gen-color-converter')!.run('no colour here') === null, 'color op returns null when no colour present');

  // 4g) Calculators (pure math) — exact answers + no false positives.
  const { tryCalc } = await import('../calc-ops');
  assert(tryCalc('what is 15% of 80')?.result === '15% of 80 = 12', `percent calc (${tryCalc('what is 15% of 80')?.result})`);
  assert(tryCalc('100F to C')?.result === '100°F = 37.8°C', `temp F→C (${tryCalc('100F to C')?.result})`);
  assert(tryCalc('tip on 50 at 20%')?.result?.startsWith('Tip 10 (20%) · Total 60') === true, `tip calc (${tryCalc('tip on 50 at 20%')?.result})`);
  assert(tryCalc('bmi for 70kg 1.75m')?.result === 'BMI 22.9 — normal', `bmi calc (${tryCalc('bmi for 70kg 1.75m')?.result})`);
  assert(tryCalc('2 to the power of 10')?.result === '2^10 = 1024', `power calc (${tryCalc('2 to the power of 10')?.result})`);
  assert(tryCalc('42 in binary')?.result === '42 in binary = 101010', `binary calc (${tryCalc('42 in binary')?.result})`);
  assert(tryCalc('255 in hex')?.result === '255 in hex = ff', `hex calc (${tryCalc('255 in hex')?.result})`);
  assert(tryCalc('loan of 10000 at 5% for 3 years')?.result?.includes('299.7') === true, `loan calc (${tryCalc('loan of 10000 at 5% for 3 years')?.result})`);
  assert(tryCalc('days between 2020-01-01 and 2020-02-01')?.result === '31 days between 2020-01-01 and 2020-02-01', `date diff (${tryCalc('days between 2020-01-01 and 2020-02-01')?.result})`);
  assert(tryCalc('what is the capital of france') === null, 'calc ignores non-math questions');

  // 4h) Game name generators (random) — verify shape + that they fire.
  const { gameOpFor, looksLikeGameName } = await import('../game-ops');
  assert(looksLikeGameName('generate a fantasy name') && !looksLikeGameName('compress this'), 'game-name intent detection');
  assert(/^\w+ \w+/.test(gameOpFor('game-character')!.run()), 'character generator → "First Last"');
  assert(/\d+$/.test(gameOpFor('game-username')!.run()), 'username generator ends with a number');
  assert(gameOpFor('game-clan')!.run().startsWith('['), 'clan generator → "[TAG] Name"');
  const { tryGameRandom } = await import('../game-ops');
  assert(['Heads', 'Tails'].includes(tryGameRandom('flip a coin')?.result ?? ''), 'coin flip → Heads/Tails');
  const roll = tryGameRandom('roll 2d6'); const sum = Number(roll?.result.match(/= (\d+)/)?.[1]);
  assert(roll?.tool === 'game-dice' && sum >= 2 && sum <= 12, `2d6 roll in range (${roll?.result})`);
  const pickR = tryGameRandom('pick one of red, blue, green');
  assert(pickR?.tool === 'game-picker' && /red|blue|green/.test(pickR.result), `picker chooses from list (${pickR?.result})`);
  assert(tryGameRandom('compress this image') === null, 'randomiser ignores non-random requests');

  // 4i) Time tools (pure) — unix→date, ISO, cron explain.
  const { tryTime } = await import('../time-ops');
  assert(tryTime('convert 1700000000 to a date')?.result?.includes('2023-11-14') === true, `unix→date (${tryTime('convert 1700000000 to a date')?.result})`);
  assert(/^\d{4}-\d{2}-\d{2}T/.test(tryTime('current time in iso')?.result ?? ''), 'iso-8601 now');
  assert(tryTime('explain cron */5 * * * *')?.result?.includes('Next runs:') === true, `cron explain (${tryTime('explain cron */5 * * * *')?.tool})`);
  assert(tryTime('compress this pdf') === null, 'time ignores non-time requests');
  const tz = tryTime('what time is it in Tokyo');
  assert(tz?.tool === 'time-world-clock' && tz.result.includes('Asia/Tokyo'), `world clock (${tz?.result})`);

  // 4k) CSS generators (pure text output).
  const { cssOpFor } = await import('../css-ops');
  const grad = cssOpFor('gen-gradient')!.run('gradient from red to blue');
  assert(grad.includes('linear-gradient') && grad.includes('#ff0000') && grad.includes('#0000ff'), `gradient css (${grad})`);
  assert(cssOpFor('gen-glassmorphism')!.run('').includes('backdrop-filter'), 'glassmorphism css');
  assert(cssOpFor('gen-css-filter')!.run('blur 8 and grayscale').includes('blur(8px)'), 'css filter parses values');
  assert(cssOpFor('gen-grid')!.run('grid with 4 columns').includes('repeat(4, 1fr)'), 'css grid columns');

  // 4m) SEO snippet generators (pure text).
  const { seoOpFor } = await import('../seo-ops');
  assert(seoOpFor('seo-meta-tag')!.run('meta tags title: My Blog description: A great blog').includes('<title>My Blog</title>'), 'meta tags use parsed title');
  assert(seoOpFor('seo-robots-txt')!.run('robots.txt for https://x.com').includes('Sitemap: https://x.com/sitemap.xml'), 'robots.txt with sitemap');
  assert(JSON.parse(seoOpFor('seo-structured-data')!.run('json-ld title: Acme'))['@type'] === 'WebSite', 'json-ld is valid + typed');

  // 4n) Network quick-skill matching (pure regex; execution needs the server).
  const { resolveQuickSkill } = await import('../../ai-actions');
  assert(resolveQuickSkill('check the ssl for example.com')?.id === 'ssl', 'ssl skill matches');
  assert(resolveQuickSkill('whois example.com')?.id === 'whois', 'whois skill matches');
  assert(resolveQuickSkill('ping example.com')?.id === 'ping', 'ping skill matches');
  assert(resolveQuickSkill('what is ssl') === null, 'ssl skill ignores the definition question');

  // 4l) Symbolic / scientific math (mathjs).
  const { tryMath } = await import('../math-ops');
  assert(tryMath('derivative of x^2')?.result?.includes('2 * x') === true, `derivative (${tryMath('derivative of x^2')?.result})`);
  assert(tryMath('what is sqrt(16) + 2')?.result === 'sqrt(16) + 2 = 6', `scientific eval (${tryMath('what is sqrt(16) + 2')?.result})`);
  assert(tryMath('determinant of [[1,2],[3,4]]')?.result === 'determinant = -2', `determinant (${tryMath('determinant of [[1,2],[3,4]]')?.result})`);
  assert(tryMath('what is the capital of france') === null, 'math ignores prose');

  // 4o) Finance calculators (pure formulas).
  const { tryFinance } = await import('../finance-ops');
  assert(tryFinance('mortgage of 300000 at 4% for 30 years')?.result?.includes('1432') === true, `mortgage payment (${tryFinance('mortgage of 300000 at 4% for 30 years')?.result})`);
  assert(tryFinance('invest 10000 at 7% for 20 years')?.result?.includes('38696') === true, `investment FV (${tryFinance('invest 10000 at 7% for 20 years')?.result})`);
  assert(tryFinance('save 200 a month at 5% for 10 years')?.tool === 'finance-savings', 'savings FV routes');

  // 4j) Subtitle transforms (pure SRT ops).
  const { subtitleOpFor } = await import('../subtitle-ops');
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello world\n\n2\n00:00:03,000 --> 00:00:04,000\n<i>Second line</i>';
  assert(subtitleOpFor('subtitle-to-plain-text')!.run(srt, '') === 'Hello world\nSecond line', `srt → plain text (${JSON.stringify(subtitleOpFor('subtitle-to-plain-text')!.run(srt, ''))})`);
  assert(subtitleOpFor('subtitle-timing-shifter')!.run(srt, 'shift by 2 seconds').includes('00:00:03,000 --> 00:00:04,000'), 'srt timing shifted +2s');
  assert(!subtitleOpFor('subtitle-cleaner')!.run(srt, '').includes('<i>'), 'srt cleaner removes inline tags');

  // 5) Audio DSP math (pure, Node-testable) — correctness, not just "it ran".
  const ad = await import('@/engines/audio/dsp');
  const sr = 44100;
  // Shelf at 0 dB is an identity filter.
  const noise = new Float32Array(2000); for (let i = 0; i < noise.length; i++) noise[i] = Math.sin(i * 0.05) * 0.5;
  const flat = ad.shelf(noise, sr, 'low', 200, 0);
  let maxDiff = 0; for (let i = 0; i < noise.length; i++) maxDiff = Math.max(maxDiff, Math.abs(flat[i] - noise[i]));
  assert(maxDiff < 1e-4, `0 dB shelf is identity (max diff ${maxDiff.toExponential(1)})`);
  // Bass boost raises the energy of a low-frequency tone.
  const low = new Float32Array(4000); for (let i = 0; i < low.length; i++) low[i] = Math.sin((2 * Math.PI * 80 * i) / sr) * 0.3;
  const boosted = ad.shelf(low, sr, 'low', 200, 9);
  const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  assert(rms(boosted) > rms(low) * 1.3, `+9 dB bass boost raises low-tone energy (${rms(low).toFixed(3)} → ${rms(boosted).toFixed(3)})`);
  // Echo places a decayed copy one delay later.
  const imp = new Float32Array(sr); imp[0] = 1;
  const ec = ad.echo(imp, sr, 0.25, 0.5);
  assert(Math.abs(ec[Math.round(0.25 * sr)] - 0.5) < 1e-6, 'echo places a 0.5× repeat at the delay point');
  // Reverb produces a decaying tail past the original signal.
  const rv = ad.reverb(imp, sr, 0.6);
  assert(rv.length === imp.length && Math.abs(rv[5000]) > 0 && Math.abs(rv[5000]) < 1, 'reverb produces a bounded tail');
  // Time-stretch: length scales by the factor; identity at 1.0.
  const tone = new Float32Array(20000); for (let i = 0; i < tone.length; i++) tone[i] = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.4;
  const stretched = ad.timeStretch(tone, 1.5);
  assert(Math.abs(stretched.length - tone.length * 1.5) < tone.length * 0.05, `time-stretch ×1.5 ≈ 1.5× length (${tone.length} → ${stretched.length})`);
  assert(ad.timeStretch(tone, 1).length === tone.length, 'time-stretch ×1 is identity length');
  // Pitch shift preserves duration.
  const pitched = ad.pitchShift(tone, 5);
  assert(Math.abs(pitched.length - tone.length) < tone.length * 0.05, `pitch shift preserves duration (${tone.length} → ${pitched.length})`);

  console.log(`\n${failures ? '\x1b[31m' : '\x1b[32m'}${failures} failure(s)\x1b[0m\n`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
