/**
 * Document engine — spreadsheets via SheetJS, Word docs via mammoth, all in
 * the browser. No server, no GPU.
 */

export type SheetTarget = 'csv' | 'xlsx' | 'html' | 'json';

export interface SheetInfo { sheetNames: string[] }

/** Read a spreadsheet (xlsx/xls/ods/csv/…) and list its sheet names. */
export async function readWorkbook(file: File) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return { XLSX, wb, sheetNames: wb.SheetNames as string[] };
}

export async function convertSheet(file: File, target: SheetTarget, sheetName?: string): Promise<{ blob: Blob; ext: string }> {
  const { XLSX, wb } = await readWorkbook(file);
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (target === 'csv') {
    return { blob: new Blob([XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv' }), ext: 'csv' };
  }
  if (target === 'html') {
    const body = XLSX.utils.sheet_to_html(ws);
    return { blob: new Blob([body], { type: 'text/html' }), ext: 'html' };
  }
  if (target === 'json') {
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
    return { blob: new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), ext: 'json' };
  }
  // xlsx (e.g. from a csv/ods input)
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), ext: 'xlsx' };
}

export async function docxToHtml(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  const buf = await file.arrayBuffer();
  const res = await (mammoth as { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }).convertToHtml({ arrayBuffer: buf });
  return res.value;
}

export async function docxToText(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  const buf = await file.arrayBuffer();
  const res = await (mammoth as { extractRawText: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }).extractRawText({ arrayBuffer: buf });
  return res.value;
}

/** Render an HTML string to a PDF Blob (rasterized, faithful layout). */
export async function htmlToPdf(html: string, title = 'document'): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;color:#000;padding:48px;font:14px/1.5 system-ui,Arial,sans-serif;';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    await pdf.html(holder, {
      autoPaging: 'text',
      margin: [24, 24, 24, 24],
      width: 547,        // A4 content width in pt (595 - 48 margins)
      windowWidth: 794,  // CSS px width of the source
      html2canvas: { scale: 0.72, useCORS: true, backgroundColor: '#ffffff' },
    });
    return pdf.output('blob');
  } finally {
    document.body.removeChild(holder);
  }
}

export async function docxToPdf(file: File): Promise<Blob> {
  const html = await docxToHtml(file);
  return htmlToPdf(html, file.name);
}
