/**
 * Real-text invoice PDF (pdf-lib) — replaces the html2canvas→jsPDF.addImage
 * rasterization that produced an IMAGE PDF (unparseable, re-keyed by every
 * accounting system, huge). This lays out the invoice as embedded-font text +
 * a real line-item table with the subtotal/discount/tax/total math shown, so
 * the figures are selectable and machine-readable. On-device, no server.
 */

export interface InvoiceLineItem { description: string; quantity: number; unitPrice: number }

export interface InvoicePdfData {
  accentColor: string;
  logo?: string | null; // data URL (png/jpg)
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  fromCompany: string; fromAddress: string; fromEmail: string;
  toCompany: string; toAddress: string; toEmail: string;
  lineItems: InvoiceLineItem[];
  discountType: 'percentage' | 'flat';
  discountValue: number;
  taxRate: number;
  currencySymbol: string;
  paymentTerms: string;
  notes: string;
}

const hexToRgb01 = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '#2563eb').trim());
  const n = m ? parseInt(m[1], 16) : 0x2563eb;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};
const sanitize = (s: string) => (s ?? '').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '');

export function computeInvoiceTotals(d: Pick<InvoicePdfData, 'lineItems' | 'discountType' | 'discountValue' | 'taxRate'>) {
  const subtotal = d.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discountAmt = d.discountType === 'percentage' ? subtotal * (d.discountValue / 100) : d.discountValue;
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * (d.taxRate / 100);
  const total = afterDiscount + taxAmt;
  return { subtotal, discountAmt, afterDiscount, taxAmt, total };
}

export async function buildInvoicePdf(d: InvoicePdfData): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const a = hexToRgb01(d.accentColor);
  const accent = rgb(a.r, a.g, a.b);
  const ink = rgb(0.1, 0.11, 0.13);
  const muted = rgb(0.42, 0.45, 0.5);
  const fmt = (n: number) => `${sanitize(d.currencySymbol)}${n.toFixed(2)}`;

  const W = 595.28, H = 841.89, M = 48;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (need: number) => { if (y - need < M + 40) { page = pdf.addPage([W, H]); y = H - M; } };

  // ---- Header: INVOICE + optional logo ----
  page.drawText('INVOICE', { x: M, y: y - 26, size: 26, font: bold, color: accent });
  if (d.logo) {
    try {
      const isPng = d.logo.startsWith('data:image/png');
      const bytes = Uint8Array.from(atob(d.logo.split(',')[1]), c => c.charCodeAt(0));
      const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const lw = 90, lh = (img.height / img.width) * lw;
      page.drawImage(img, { x: W - M - lw, y: y - lh, width: lw, height: Math.min(lh, 50) });
    } catch { /* skip bad logo */ }
  }
  y -= 36;
  const meta = [
    d.invoiceNumber ? `Invoice #: ${d.invoiceNumber}` : '',
    d.invoiceDate ? `Date: ${d.invoiceDate}` : '',
    d.dueDate ? `Due: ${d.dueDate}` : '',
  ].map(sanitize).filter(Boolean).join('     ');
  if (meta) { page.drawText(meta, { x: M, y, size: 9.5, font, color: muted }); y -= 18; }

  // ---- From / Bill To columns ----
  const colW = (W - M * 2 - 20) / 2;
  const drawParty = (label: string, lines: string[], x: number) => {
    let yy = y;
    page.drawText(label, { x, y: yy, size: 9, font: bold, color: accent }); yy -= 13;
    for (const ln of lines.map(sanitize).filter(Boolean)) {
      for (const w of wrap(ln, font, 9.5, colW)) { page.drawText(w, { x, y: yy, size: 9.5, font, color: ink }); yy -= 12; }
    }
    return yy;
  };
  const wrap = (text: string, f: any, size: number, maxW: number): string[] => {
    const words = sanitize(text).split(/\s+/); const out: string[] = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (f.widthOfTextAtSize(t, size) > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur); return out;
  };
  const yFrom = drawParty('FROM', [d.fromCompany, d.fromAddress, d.fromEmail], M);
  const yTo = drawParty('BILL TO', [d.toCompany, d.toAddress, d.toEmail], M + colW + 20);
  y = Math.min(yFrom, yTo) - 16;

  // ---- Line-item table ----
  const cols = { desc: M, qty: M + 300, unit: M + 360, amt: W - M };
  page.drawRectangle({ x: M, y: y - 4, width: W - M * 2, height: 20, color: accent, opacity: 0.12 });
  page.drawText('Description', { x: cols.desc + 4, y, size: 9, font: bold, color: ink });
  page.drawText('Qty', { x: cols.qty, y, size: 9, font: bold, color: ink });
  page.drawText('Unit', { x: cols.unit, y, size: 9, font: bold, color: ink });
  const amtHdrW = bold.widthOfTextAtSize('Amount', 9);
  page.drawText('Amount', { x: cols.amt - amtHdrW, y, size: 9, font: bold, color: ink });
  y -= 20;
  for (const item of d.lineItems) {
    ensure(20);
    const amount = item.quantity * item.unitPrice;
    const descLines = wrap(item.description || '', font, 9.5, 290);
    descLines.forEach((ln, i) => page.drawText(ln, { x: cols.desc + 4, y: y - i * 11, size: 9.5, font, color: ink }));
    page.drawText(String(item.quantity), { x: cols.qty, y, size: 9.5, font, color: ink });
    page.drawText(fmt(item.unitPrice), { x: cols.unit, y, size: 9.5, font, color: ink });
    const amtStr = fmt(amount);
    page.drawText(amtStr, { x: cols.amt - font.widthOfTextAtSize(amtStr, 9.5), y, size: 9.5, font: bold, color: ink });
    const rows = Math.max(1, descLines.length);
    y -= rows * 11 + 5;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.4, color: rgb(0.9, 0.9, 0.92) });
  }

  // ---- Totals (right-aligned) ----
  const t = computeInvoiceTotals(d);
  y -= 10;
  const totalRow = (label: string, val: string, opts: { bold?: boolean; color?: any; size?: number } = {}) => {
    ensure(16);
    const size = opts.size ?? 10, f = opts.bold ? bold : font, color = opts.color ?? ink;
    const lx = W - M - 200;
    page.drawText(label, { x: lx, y, size, font: f, color });
    page.drawText(val, { x: W - M - f.widthOfTextAtSize(val, size), y, size, font: f, color });
    y -= size + 5;
  };
  totalRow('Subtotal', fmt(t.subtotal));
  if (t.discountAmt) totalRow(`Discount${d.discountType === 'percentage' ? ` (${d.discountValue}%)` : ''}`, `-${fmt(t.discountAmt)}`, { color: muted });
  if (d.taxRate) totalRow(`Tax (${d.taxRate}%)`, fmt(t.taxAmt), { color: muted });
  page.drawLine({ start: { x: W - M - 200, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 1, color: accent });
  y -= 4;
  totalRow('Total Due', fmt(t.total), { bold: true, color: accent, size: 13 });

  // ---- Terms + notes ----
  y -= 14;
  const block = (label: string, text: string) => {
    if (!text.trim()) return;
    ensure(28);
    page.drawText(label, { x: M, y, size: 8.5, font: bold, color: accent }); y -= 12;
    for (const ln of wrap(text, font, 9, W - M * 2)) { ensure(12); page.drawText(ln, { x: M, y, size: 9, font, color: muted }); y -= 11; }
    y -= 6;
  };
  block('PAYMENT TERMS', d.paymentTerms);
  block('NOTES', d.notes);

  try { const { stampPdfFooter } = await import('@/engines/pdf'); await stampPdfFooter(pdf); } catch { /* */ }
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}
