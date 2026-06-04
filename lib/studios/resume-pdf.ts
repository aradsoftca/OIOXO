/**
 * Real-text resume PDF (pdf-lib) — replaces the html2canvas→jsPDF.addImage
 * rasterization that produced an IMAGE PDF with zero selectable text and failed
 * every ATS (applicant-tracking) parser. This lays the resume out as actual
 * embedded-font text runs, so the PDF is parseable, selectable, and small.
 *
 * On-device, no server. Used by studio-resume; the same drawText approach backs
 * the invoice fix (see C10 in STUDIO_ROADMAP.md).
 */

export interface ResumePersonal {
  name: string; title: string; email: string; phone: string;
  location: string; website: string; summary: string;
}
export interface ResumeExperience { title: string; company: string; startDate: string; endDate: string; desc: string }
export interface ResumeEducation { degree: string; school: string; startDate: string; endDate: string; gpa: string }
export interface ResumeSkill { name: string; level: number }

export interface ResumeDoc {
  personal: ResumePersonal;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: ResumeSkill[];
  accentColor: string;
}

const hexToRgb01 = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '#4f46e5').trim());
  const n = m ? parseInt(m[1], 16) : 0x4f46e5;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

// Keep text inside the Latin-1 range pdf-lib's standard fonts can encode; the
// glyphs outside it would throw. (A future C4 font-embedding pass widens this.)
const sanitize = (s: string) => (s ?? '').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '');

export async function buildResumePdf(doc: ResumeDoc): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb01(doc.accentColor);
  const ink = rgb(0.1, 0.11, 0.13);
  const muted = rgb(0.42, 0.45, 0.5);
  const accentRgb = rgb(accent.r, accent.g, accent.b);

  // A4, 1-based points. Margin 48pt.
  const W = 595.28, H = 841.89, M = 48;
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (need: number) => {
    if (y - need < M) { page = pdf.addPage([W, H]); y = H - M; }
  };
  const wrap = (text: string, f: any, size: number, maxW: number): string[] => {
    const words = sanitize(text).split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (f.widthOfTextAtSize(test, size) > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const line = (text: string, opts: { f?: any; size?: number; color?: any; gap?: number; x?: number } = {}) => {
    const f = opts.f ?? font, size = opts.size ?? 10.5, color = opts.color ?? ink;
    const x = opts.x ?? M;
    ensure(size + 2);
    y -= size;
    page.drawText(sanitize(text), { x, y, size, font: f, color });
    y -= (opts.gap ?? 4);
  };
  const para = (text: string, opts: { size?: number; color?: any; maxW?: number } = {}) => {
    const size = opts.size ?? 10, color = opts.color ?? ink;
    const maxW = opts.maxW ?? (W - M * 2);
    for (const ln of wrap(text, font, size, maxW)) line(ln, { size, color, gap: 2 });
  };
  const sectionHeading = (label: string) => {
    y -= 8; ensure(16);
    line(label.toUpperCase(), { f: bold, size: 11, color: accentRgb, gap: 3 });
    // accent rule
    page.drawRectangle({ x: M, y: y + 2, width: W - M * 2, height: 1.2, color: accentRgb, opacity: 0.5 });
    y -= 6;
  };

  // ---- Header: name + title + contact line ----
  line(doc.personal.name, { f: bold, size: 22, gap: 2 });
  line(doc.personal.title, { size: 12.5, color: accentRgb, gap: 6 });
  const contact = [doc.personal.email, doc.personal.phone, doc.personal.location, doc.personal.website]
    .map(s => sanitize(s)).filter(Boolean).join('   |   ');
  if (contact) line(contact, { size: 9.5, color: muted, gap: 4 });

  // ---- Summary ----
  if (doc.personal.summary.trim()) { sectionHeading('Summary'); para(doc.personal.summary); }

  // ---- Experience ----
  if (doc.experience.length) {
    sectionHeading('Experience');
    for (const e of doc.experience) {
      ensure(28);
      const left = sanitize(e.title || '');
      const right = [e.startDate, e.endDate].map(sanitize).filter(Boolean).join(' — ');
      y -= 11.5;
      page.drawText(left, { x: M, y, size: 11.5, font: bold, color: ink });
      if (right) {
        const rw = font.widthOfTextAtSize(right, 9.5);
        page.drawText(right, { x: W - M - rw, y, size: 9.5, font, color: muted });
      }
      y -= 4;
      if (e.company) line(e.company, { size: 10, color: accentRgb, gap: 3 });
      for (const bullet of (e.desc || '').split('\n')) {
        if (!bullet.trim()) continue;
        const text = bullet.replace(/^[•\-\*]\s*/, '');
        const wrapped = wrap('• ' + text, font, 9.8, W - M * 2 - 10);
        wrapped.forEach((ln, i) => line(i === 0 ? ln : '   ' + ln, { size: 9.8, gap: 1.5, x: M + 4 }));
      }
      y -= 5;
    }
  }

  // ---- Education ----
  if (doc.education.length) {
    sectionHeading('Education');
    for (const ed of doc.education) {
      ensure(22);
      y -= 11;
      page.drawText(sanitize(ed.degree || ''), { x: M, y, size: 11, font: bold, color: ink });
      const right = [ed.startDate, ed.endDate].map(sanitize).filter(Boolean).join(' — ');
      if (right) { const rw = font.widthOfTextAtSize(right, 9.5); page.drawText(right, { x: W - M - rw, y, size: 9.5, font, color: muted }); }
      y -= 4;
      const sub = [ed.school, ed.gpa ? `GPA ${ed.gpa}` : ''].map(sanitize).filter(Boolean).join('   •   ');
      if (sub) line(sub, { size: 9.8, color: muted, gap: 4 });
    }
  }

  // ---- Skills (comma list — ATS-friendly, keyword-parseable) ----
  if (doc.skills.length) {
    sectionHeading('Skills');
    para(doc.skills.map(s => sanitize(s.name)).filter(Boolean).join(' • '), { size: 10 });
  }

  // Brand footer for free users (no-op for Pro) — mirrors buildPdf().
  try {
    const { stampPdfFooter } = await import('@/engines/pdf');
    await stampPdfFooter(pdf);
  } catch { /* never block export */ }

  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

// ---- ATS lint: a quick on-device score so the tool ACTIVELY helps, not just
// exports. Pure heuristics, no model. Returns 0-100 + concrete issues. ----

export interface AtsIssue { level: 'error' | 'warn' | 'tip'; msg: string }
export interface AtsReport { score: number; issues: AtsIssue[] }

const ACTION_VERBS = ['led','built','designed','launched','shipped','grew','reduced','increased','managed','created','drove','owned','delivered','improved','scaled','established','redesigned','automated'];

export function lintResume(doc: ResumeDoc): AtsReport {
  const issues: AtsIssue[] = [];
  let score = 100;
  const p = doc.personal;
  if (!p.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) { issues.push({ level: 'error', msg: 'Add a valid email — parsers key on it.' }); score -= 15; }
  if (!p.phone) { issues.push({ level: 'warn', msg: 'Add a phone number.' }); score -= 6; }
  if (!p.name?.trim()) { issues.push({ level: 'error', msg: 'Add your name.' }); score -= 15; }
  if (!doc.experience.length) { issues.push({ level: 'error', msg: 'Add at least one experience entry.' }); score -= 20; }
  if (!doc.skills.length) { issues.push({ level: 'warn', msg: 'Add a Skills section — ATS keyword-matches it.' }); score -= 10; }
  if ((p.summary || '').split(/\s+/).length < 12) { issues.push({ level: 'tip', msg: 'A 1–2 line summary helps recruiters scan.' }); score -= 4; }
  // Quantification + action verbs in bullets.
  const bullets = doc.experience.flatMap(e => (e.desc || '').split('\n')).filter(b => b.trim());
  const quantified = bullets.filter(b => /\d/.test(b)).length;
  if (bullets.length && quantified / bullets.length < 0.4) { issues.push({ level: 'tip', msg: 'Quantify more bullets (numbers, %, scale) — recruiters favor metrics.' }); score -= 6; }
  const verbStarts = bullets.filter(b => ACTION_VERBS.includes(b.replace(/^[•\-\*]\s*/, '').trim().split(/\s+/)[0]?.toLowerCase())).length;
  if (bullets.length && verbStarts / bullets.length < 0.4) { issues.push({ level: 'tip', msg: 'Start bullets with action verbs (Led, Built, Shipped…).' }); score -= 5; }
  return { score: Math.max(0, Math.min(100, score)), issues };
}
