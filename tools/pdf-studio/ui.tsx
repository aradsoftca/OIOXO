'use client';

import * as React from 'react';
import {
  Loader2, Download, Plus, Trash2, RotateCw, Copy, ChevronLeft, ChevronRight,
  Type as TypeIcon, SquareDashed, Image as ImageIcon, Hash, FileText, Highlighter,
  PenTool, Eraser, Minus, Circle as CircleIcon, Save, Upload, Undo2, Redo2, X,
  MousePointer2, Signature, FileSignature, Sparkles, Shield, ScanText, MessageSquare,
  Droplets, Scissors, FileCheck2, FileType2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { BRAND_DOMAIN } from '@/lib/brand';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'pdf-studio';
import { rasterizePdf } from '@/engines/pdf/rasterize';
import { buildPdf, formatBates, type PageRef, type Annotation } from '@/engines/pdf/studio';
import {
  StudioShell, StudioTopBar, StudioBody, StudioToolDock, StudioToolButton,
  StudioPanel, StudioSidebar, StudioCanvasArea, StudioStatusBar,
  StudioButton, StudioSlider, StudioDivider,
  UndoStack, newProject, saveProject, listProjects, loadProject,
  type StudioProject, downloadBlob, safeFilename,
  useShortcuts, formatCombo, blankCanvas,
  deskewCanvas, findPii,
  ocrCanvas, OCR_LANGUAGES, type OcrResult,
  usePinchPan, useRafThrottle,
  CommentsModel, CommentsThread, CommentsBadge, CommentsOverviewPanel,
  type Comment, type CommentAnchor, pickPeerColor,
  applyWatermarkToPdf, splitPdf, pdfToDocx, makeSearchablePdf,
  applyFormFieldsToPdf, type PdfFormField, type PdfWatermark,
  HelpButton, useRegisterShortcuts, DesktopOnly, MobileOnly,
  EmptyState, pushToast,
  SharedDialog,
} from '@/lib/studios';

type Tool = 'select' | 'text' | 'draw' | 'sign' | 'highlight' | 'line' | 'ellipse' | 'rect' | 'whiteout' | 'image' | 'field' | 'edit-text';
interface RasterPage { canvas: HTMLCanvasElement; w: number; h: number }
interface DocState {
  name: string;
  pages: PageRef[];
  annotations: Record<string, Annotation[]>;
  selectedId: string | null;
  pageNumbers: boolean;
  watermarkText: string;
  watermarkEnabled: boolean;
  /** Bates numbering (legal discovery stamp) — undefined = off. */
  bates?: { prefix: string; suffix: string; start: number; digits: number; position: 'bl' | 'br' | 'tl' | 'tr' };
}
const cloneDoc = (d: DocState): DocState => ({
  ...d,
  pages: d.pages.map(p => ({ ...p })),
  annotations: Object.fromEntries(Object.entries(d.annotations).map(([k, v]) => [k, v.map(a => ({ ...a }))])),
});
const NEW_DOC = (): DocState => ({
  name: 'Untitled', pages: [], annotations: {}, selectedId: null,
  pageNumbers: false, watermarkText: '', watermarkEnabled: false,
});

let _sid = 0, _pid = 0;
const ptsToStr = (pts: number[]) => { let s = ''; for (let k = 0; k < pts.length; k += 2) s += `${(pts[k] * 100).toFixed(2)},${(pts[k + 1] * 100).toFixed(2)} `; return s.trim(); };

// ── Autosave / crash-recovery ────────────────────────────────────────────────
// Weaponizes the rivals' #1 complaint ("where did my contract go / lost my
// work"). We snapshot the EDITING LAYER (page structure, annotations,
// redactions, signatures, form fields, name) to localStorage on a debounce.
// The original PDF bytes + rasters are intentionally NOT stored (too big, same
// tradeoff as the Library save) — on restore we rehydrate the edits and ask the
// user to re-add the source PDF to render, exactly like the existing Library
// flow but automatic and zero-click.
const RECOVERY_KEY = 'xon-pdf-studio:recovery';
const RECOVERY_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const ab2b64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
};
const b642ab = (b64: string): ArrayBuffer => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

interface RecoverySnapshot {
  t: number;
  name: string;
  doc: DocState;
  formFields: PdfFormField[];
  signaturePng: string | null;
  sourceMeta: { sid: string; name: string; pageCount: number }[];
}

// JSON-safe encode: image/signature byte buffers → base64 strings.
const serializeRecovery = (
  doc: DocState, formFields: PdfFormField[], signaturePng: ArrayBuffer | null,
  sourceMeta: { sid: string; name: string; pageCount: number }[],
): string => {
  const enc = cloneDoc(doc);
  for (const list of Object.values(enc.annotations)) {
    for (const a of list) {
      if (a.kind === 'image' && a.bytes instanceof ArrayBuffer) (a as any).bytes = { __ab: ab2b64(a.bytes) };
    }
  }
  const snap: RecoverySnapshot = {
    t: Date.now(), name: doc.name, doc: enc, formFields,
    signaturePng: signaturePng ? ab2b64(signaturePng) : null, sourceMeta,
  };
  return JSON.stringify(snap);
};

const deserializeRecovery = (raw: string): { doc: DocState; formFields: PdfFormField[]; signaturePng: ArrayBuffer | null; meta: RecoverySnapshot } | null => {
  try {
    const snap = JSON.parse(raw) as RecoverySnapshot;
    if (!snap || typeof snap.t !== 'number' || !snap.doc) return null;
    const doc = snap.doc;
    for (const list of Object.values(doc.annotations)) {
      for (const a of list) {
        if (a.kind === 'image' && (a as any).bytes?.__ab) (a as any).bytes = b642ab((a as any).bytes.__ab);
      }
    }
    return {
      doc,
      formFields: snap.formFields ?? [],
      signaturePng: snap.signaturePng ? b642ab(snap.signaturePng) : null,
      meta: snap,
    };
  } catch { return null; }
};

const TOOLS: { tool: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { tool: 'select', label: 'Select', key: 'v', icon: <MousePointer2 className="h-4 w-4" /> },
  { tool: 'text', label: 'Text', key: 't', icon: <TypeIcon className="h-4 w-4" /> },
  { tool: 'draw', label: 'Draw', key: 'd', icon: <PenTool className="h-4 w-4" /> },
  { tool: 'sign', label: 'Signature', key: 's', icon: <FileSignature className="h-4 w-4" /> },
  { tool: 'highlight', label: 'Highlight', key: 'h', icon: <Highlighter className="h-4 w-4" /> },
  { tool: 'line', label: 'Line', key: 'l', icon: <Minus className="h-4 w-4" /> },
  { tool: 'ellipse', label: 'Ellipse', key: 'o', icon: <CircleIcon className="h-4 w-4" /> },
  { tool: 'rect', label: 'Rect / Redact', key: 'r', icon: <SquareDashed className="h-4 w-4" /> },
  { tool: 'whiteout', label: 'Whiteout', key: 'e', icon: <Eraser className="h-4 w-4" /> },
  { tool: 'image', label: 'Image', key: 'i', icon: <ImageIcon className="h-4 w-4" /> },
  { tool: 'field', label: 'Form field (fillable)', key: 'f', icon: <SquareDashed className="h-4 w-4" /> },
  { tool: 'edit-text', label: 'Edit existing text', key: 'x', icon: <TypeIcon className="h-4 w-4" /> },
];

export default function PdfStudioPro() {
  const { guard, gate } = useUsageGate('pdf');
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [doc, setDoc] = React.useState<DocState>(() => NEW_DOC());
  const stack = React.useRef(new UndoStack<DocState>(80));
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { stack.current.reset(cloneDoc(doc), 'init'); }, []);

  const [sources, setSources] = React.useState<Record<string, ArrayBuffer>>({});
  const [raster, setRaster] = React.useState<Record<string, RasterPage[]>>({});

  // Latest-doc ref so builders that fire several times before React re-renders
  // (e.g. opening multiple PDFs in one `for…await` loop) stack instead of
  // clobbering each other. Synced from every doc mutation below.
  const docRef = React.useRef<DocState>(doc);
  React.useEffect(() => { docRef.current = doc; }, [doc]);

  const commit = React.useCallback((label: string, next: DocState) => {
    docRef.current = next;
    setDoc(next);
    stack.current.push(label, cloneDoc(next));
    force();
  }, []);

  const undo = () => { const p = stack.current.undo(cloneDoc(docRef.current)); if (p) { docRef.current = p; setDoc(p); force(); } };
  const redo = () => { const p = stack.current.redo(); if (p) { docRef.current = p; setDoc(p); force(); } };

  const [compressLevel, setCompressLevel] = React.useState<'none' | 'lossless' | 'light' | 'balanced' | 'strong'>('none');
  const [pdfPassword, setPdfPassword] = React.useState('');
  const [tool, setTool] = React.useState<Tool>('text');
  const [textColor, setTextColor] = React.useState('#000000');
  const [textSize, setTextSize] = React.useState(16);
  // Which kind of fillable form field the Field tool drops. The export
  // (applyInteractiveFormFields) already supports all three as real AcroForm
  // widgets; the UI previously only ever created text fields.
  const [fieldKind, setFieldKind] = React.useState<'text' | 'checkbox' | 'signature'>('text');
  const [penWidth, setPenWidth] = React.useState(3);
  const [livePts, setLivePts] = React.useState<number[]>([]);
  const moving = React.useRef<{ pageId: string; idx: number; offX: number; offY: number } | null>(null);
  // Resize a placed box/image/signature by a corner handle (normalized geometry).
  const resizing = React.useRef<{ pageId: string; idx: number; corner: string; nx: number; ny: number; nw: number; nh: number; ox: number; oy: number } | null>(null);
  // Which annotation on the current page is selected (for handles). −1 = none.
  const [selAnnoIdx, setSelAnnoIdx] = React.useState(-1);
  const drawing = React.useRef<number[] | null>(null);
  const dragRect = React.useRef<{ nx: number; ny: number } | null>(null);
  const pendingImgPos = React.useRef<{ nx: number; ny: number } | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const imgToPdfRef = React.useRef<HTMLInputElement | null>(null);
  const imgRef = React.useRef<HTMLInputElement | null>(null);
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const editorWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [editorZoom, setEditorZoom] = React.useState(1);
  const [editorPan, setEditorPan] = React.useState({ x: 0, y: 0 });
  usePinchPan({ ref: editorWrapRef, zoom: editorZoom, pan: editorPan, setZoom: setEditorZoom, setPan: setEditorPan, minZoom: 0.3, maxZoom: 5 });

  const [busy, setBusy] = React.useState('');
  // Password prompt for opening an encrypted PDF: holds the file awaiting unlock.
  const [pwPrompt, setPwPrompt] = React.useState<{ file: File; error?: boolean } | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [toast, setToast] = React.useState('');
  const [exportDialog, setExportDialog] = React.useState(false);
  const [batesDialog, setBatesDialog] = React.useState(false);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [signDialog, setSignDialog] = React.useState(false);
  const [savedList, setSavedList] = React.useState<StudioProject[]>([]);
  const [signaturePng, setSignaturePng] = React.useState<ArrayBuffer | null>(null);
  const commentsModel = React.useRef<CommentsModel>(new CommentsModel());
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [showCommentsPanel, setShowCommentsPanel] = React.useState(false);
  const [commentAuthor, setCommentAuthor] = React.useState('Me');
  const commentColor = React.useMemo(() => pickPeerColor(commentAuthor), [commentAuthor]);

  React.useEffect(() => {
    return commentsModel.current.onChange(s => setComments([...s.comments]));
  }, []);

  const [watermarkDialog, setWatermarkDialog] = React.useState(false);
  const [splitDialog, setSplitDialog] = React.useState(false);
  const [extractDialog, setExtractDialog] = React.useState(false);
  const [formFields, setFormFields] = React.useState<PdfFormField[]>([]);

  // Crash-recovery: amber banner if a fresh unsaved snapshot exists on mount.
  const [recovery, setRecovery] = React.useState<{ doc: DocState; formFields: PdfFormField[]; signaturePng: ArrayBuffer | null; meta: RecoverySnapshot } | null>(null);
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const restoring = React.useRef(false);

  // Smart-guide lines drawn live while dragging an object (center/edge snap).
  const [guides, setGuides] = React.useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  // Inline text editor (replaces window.prompt for the Text tool) — a real
  // caret on the page, live preview, no modal round-trip.
  // Inline page text editor. When `replace` is set, this is editing an EXISTING
  // PDF text run (Foxit-style click-to-edit): commit whites-out the original box
  // and stamps the new text at the matched position/size. When `replace` is
  // undefined, it's adding fresh text at the click point.
  const [textEdit, setTextEdit] = React.useState<{
    nx: number; ny: number; value: string;
    screenSize?: number; // on-screen px size for the caret overlay (matched to the run)
    replace?: { nx: number; ny: number; nw: number; nh: number; sizePx: number };
    // When set, we're editing a text ANNOTATION we added in-studio (edit in
    // place) rather than a source PDF run — commit updates that annotation.
    annoIdx?: number;
  } | null>(null);

  // On mount: surface a fresh (<7d) recovery snapshot, if any. Skipped once the
  // user already has pages open (they're mid-session, not recovering).
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (!raw) return;
      const parsed = deserializeRecovery(raw);
      if (!parsed) { localStorage.removeItem(RECOVERY_KEY); return; }
      if (Date.now() - parsed.meta.t > RECOVERY_MAX_AGE) { localStorage.removeItem(RECOVERY_KEY); return; }
      if (!parsed.doc.pages.length) return;
      setRecovery(parsed);
    } catch { /* ignore */ }
  }, []);

  // 2s-debounced autosave of the editing layer to localStorage. Only fires once
  // there's real work to lose, and never overwrites the banner mid-restore.
  React.useEffect(() => {
    if (restoring.current) return;
    if (!doc.pages.length) return;
    setSaveState('saving');
    const id = setTimeout(() => {
      try {
        const meta = Object.entries(raster).map(([sid, pages]) => ({
          sid, name: doc.name, pageCount: pages.length,
        }));
        localStorage.setItem(RECOVERY_KEY, serializeRecovery(doc, formFields, signaturePng, meta));
        setSaveState('saved');
      } catch {
        // Quota or private-mode failure — fail silent, don't nag.
        setSaveState('idle');
      }
    }, 2000);
    return () => clearTimeout(id);
  }, [doc, formFields, signaturePng, sources, raster]);

  const restoreRecovery = () => {
    if (!recovery) return;
    restoring.current = true;
    setDoc(recovery.doc);
    setFormFields(recovery.formFields);
    if (recovery.signaturePng) setSignaturePng(recovery.signaturePng);
    stack.current.reset(cloneDoc(recovery.doc), 'recovered');
    setRecovery(null);
    force();
    toastFor('Session restored — re-add the source PDF to render pages');
    // Allow autosave to resume on the next real edit.
    setTimeout(() => { restoring.current = false; }, 0);
  };

  const dismissRecovery = () => {
    try { localStorage.removeItem(RECOVERY_KEY); } catch {}
    setRecovery(null);
  };

  // Clipboard paste: drop a copied screenshot/image straight onto the current
  // page (centered), or open a pasted PDF — the Acrobat/Sejda flow where you
  // grab a screenshot and paste it in, no file picker. Ignored while typing.
  const pasteImageOnPage = React.useCallback(async (file: File) => {
    const cur = doc.pages.find(p => p.id === doc.selectedId);
    if (!cur) { toastFor('Select a page first, then paste'); return; }
    const bytes = await file.arrayBuffer();
    const next = cloneDoc(doc);
    // Center-ish it; the user can drag/snap from there.
    next.annotations[cur.id] = [
      ...(next.annotations[cur.id] ?? []),
      { kind: 'image', nx: 0.35, ny: 0.35, nw: 0.3, nh: 0.3, bytes, png: /png$/i.test(file.type) },
    ];
    commit('paste image', next);
    toastFor('Image pasted — drag to position');
  }, [doc, commit]);

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return; // let normal paste happen
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind !== 'file') continue;
        const f = it.getAsFile();
        if (!f) continue;
        if (f.type === 'application/pdf') { e.preventDefault(); void addPdf(f); return; }
        if (f.type.startsWith('image/')) { e.preventDefault(); void pasteImageOnPage(f); return; }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pasteImageOnPage]);

  const buildSourceBytes = async (): Promise<ArrayBuffer | null> => {
    if (!doc.pages.length) return null;
    const blob = await buildPdf({ sources, pages: doc.pages, annotations: doc.annotations, pageNumbers: doc.pageNumbers, bates: doc.bates });
    return await blob.arrayBuffer();
  };

  const applyWatermark = async (watermark: PdfWatermark) => {
    if (!(await guard())) return;
    setBusy('Applying watermark…');
    try {
      const src = await buildSourceBytes();
      if (!src) return;
      const wm = await applyWatermarkToPdf(src, watermark);
      downloadBlob(wm, `${safeFilename(doc.name)}-watermark.pdf`);
      toastFor('Watermark applied');
      setWatermarkDialog(false);
    } catch (e) {
      toastFor((e as Error).message || 'Watermark failed');
    } finally { setBusy(''); }
  };

  const runSplit = async (ranges: Array<{ from: number; to: number; name?: string }>) => {
    if (!(await guard())) return;
    setBusy('Splitting…');
    try {
      const src = await buildSourceBytes();
      if (!src) return;
      const results = await splitPdf(src, ranges);
      for (const r of results) downloadBlob(r.blob, r.name);
      toastFor(`Split into ${results.length} files`);
      setSplitDialog(false);
    } catch (e) {
      toastFor((e as Error).message || 'Split failed');
    } finally { setBusy(''); }
  };

  // Extract pages (Acrobat "Extract"): build a NEW PDF containing only the
  // chosen 1-based page indices, in the order given. Reuses the normal export
  // path with a filtered doc.pages subset so annotations/redactions/page-numbers
  // carry through exactly as on export.
  const runExtract = async (indices: number[]) => {
    if (!doc.pages.length) return;
    const subset = indices.map(n => doc.pages[n - 1]).filter(Boolean);
    if (!subset.length) { toastFor('No valid pages in that range'); return; }
    if (!(await guard())) return;
    setBusy('Extracting pages…');
    try {
      const blob = await buildPdf({ sources, pages: subset, annotations: doc.annotations, pageNumbers: doc.pageNumbers, bates: doc.bates });
      downloadBlob(blob, `${safeFilename(doc.name)}-extracted.pdf`);
      toastFor(`Extracted ${subset.length} page${subset.length === 1 ? '' : 's'}`);
      setExtractDialog(false);
    } catch (e) {
      toastFor((e as Error).message || 'Extract failed');
    } finally { setBusy(''); }
  };

  const exportAsDocx = async () => {
    if (!(await guard())) return;
    setBusy('Converting to Word…');
    try {
      const src = await buildSourceBytes();
      if (!src) return;
      const blob = await pdfToDocx(src, doc.name);
      downloadBlob(blob, `${safeFilename(doc.name)}.docx`);
      toastFor('Exported to Word');
    } catch (e) {
      toastFor((e as Error).message || 'Conversion failed');
    } finally { setBusy(''); }
  };

  const exportSearchable = async () => {
    if (!(await guard())) return;
    setBusy('Running OCR + building searchable PDF…');
    setProgress(0);
    try {
      const src = await buildSourceBytes();
      if (!src) return;
      const blob = await makeSearchablePdf(src, (page, total) => {
        setBusy(`OCR page ${page}/${total}…`);
        setProgress(Math.round((page / total) * 100));
      });
      downloadBlob(blob, `${safeFilename(doc.name)}-searchable.pdf`);
      toastFor('Searchable PDF saved');
    } catch (e) {
      toastFor((e as Error).message || 'Searchable PDF failed');
    } finally { setBusy(''); setProgress(0); }
  };

  const toastFor = (m: string) => { pushToast(m); };

  const selPage = doc.pages.find(p => p.id === doc.selectedId) ?? null;
  const selRaster = selPage ? raster[selPage.srcId]?.[selPage.srcIndex] : null;

  const addPdf = async (file: File, overrideBytes?: ArrayBuffer) => {
    setRecovery(null); // opening a real PDF supersedes the recover-last-session offer
    // Opening a PDF to view / organize it is FREE — like every PDF tool, the
    // credit is charged on the OUTPUT (export / split / OCR / convert), not on
    // loading a file. Gating import burned a free user's credit just to look at
    // their PDF and blocked the editor when the usage API was unreachable.
    setBusy('Reading PDF…');
    setProgress(0);
    try {
      const bytes = overrideBytes ?? await file.arrayBuffer();
      const sid = `s${++_sid}`;
      const rp = await rasterizePdf(bytes.slice(0), {
        maxEdge: 1200,
        onProgress: (p) => { setProgress(Math.round((p.page / p.pageCount) * 100)); setBusy(`Rendering page ${p.page}/${p.pageCount}…`); },
      });
      const pagesR: RasterPage[] = rp.map(r => ({ canvas: r.canvas, w: r.width, h: r.height }));
      setSources(s => ({ ...s, [sid]: bytes }));
      setRaster(r => ({ ...r, [sid]: pagesR }));
      // Latest doc (not the render closure) so opening several PDFs in a row
      // appends them all instead of keeping only the last.
      const next = cloneDoc(docRef.current);
      const added: PageRef[] = pagesR.map((_, i) => ({ id: `p${++_pid}`, srcId: sid, srcIndex: i, rotation: 0 }));
      next.pages = [...next.pages, ...added];
      if (!next.selectedId && added.length) next.selectedId = added[0].id;
      if (!next.name || next.name === 'Untitled') next.name = file.name.replace(/\.pdf$/i, '');
      commit('add pdf', next);
    } catch (e) {
      // pdf.js throws PasswordException for encrypted PDFs — offer to unlock it
      // instead of a dead-end error (the audit's "can't decrypt" gap).
      const name = (e as any)?.name; // eslint-disable-line @typescript-eslint/no-explicit-any
      const msg = String((e as Error)?.message || e).toLowerCase();
      if (name === 'PasswordException' || /password|encrypt/.test(msg)) {
        setPwPrompt({ file });
      } else {
        toastFor('Could not open this PDF');
      }
    } finally {
      setBusy(''); setProgress(0);
    }
  };

  // Unlock an encrypted PDF: decrypt the bytes with the password, then open the
  // decrypted result through the normal flow.
  const unlockPdf = async (password: string) => {
    if (!pwPrompt) return;
    setBusy('Unlocking…');
    try {
      const bytes = await pwPrompt.file.arrayBuffer();
      const { decryptPdf } = await import('@/lib/studios');
      const decrypted = await decryptPdf(bytes, password);
      const file = pwPrompt.file;
      setPwPrompt(null);
      await addPdf(file, decrypted);
      toastFor('Unlocked');
    } catch (e) {
      if ((e as Error).message === 'wrong-password') { setPwPrompt(p => p ? { ...p, error: true } : p); toastFor('Wrong password — try again'); }
      else { setPwPrompt(null); toastFor('Could not unlock this PDF'); }
    } finally {
      setBusy('');
    }
  };

  // Images → PDF: combine the picked images into one PDF (one image per page),
  // then load it into the studio so the user can reorder/annotate/export it.
  const buildPdfFromImages = async (files: File[]) => {
    if (!files.length) return;
    setBusy('Building PDF from images…'); setProgress(0);
    try {
      const inputs = [];
      for (const f of files) inputs.push({ bytes: await f.arrayBuffer(), type: f.type, name: f.name });
      const { imagesToPdf } = await import('@/lib/studios');
      const blob = await imagesToPdf(inputs, { pageSize: 'fit', orientation: 'auto', onProgress: (d, total) => setProgress(Math.round((d / total) * 100)) });
      // Load the freshly built PDF into the editor (reuse the PDF open path).
      const file = new File([blob], 'images.pdf', { type: 'application/pdf' });
      await addPdf(file);
      toastFor(`Made a ${files.length}-page PDF from your images`);
    } catch (e) {
      toastFor((e as Error).message || 'Could not build PDF from those images');
    } finally {
      setBusy(''); setProgress(0);
    }
  };

  const rotatePage = (id: string) => {
    const next = cloneDoc(doc);
    const p = next.pages.find(x => x.id === id);
    if (p) p.rotation = (p.rotation + 90) % 360;
    commit('rotate', next);
  };
  const deletePage = (id: string) => {
    const next = cloneDoc(doc);
    next.pages = next.pages.filter(p => p.id !== id);
    delete next.annotations[id];
    if (next.selectedId === id) next.selectedId = next.pages[0]?.id ?? null;
    commit('delete', next);
  };
  const duplicatePage = (id: string) => {
    const next = cloneDoc(doc);
    const i = next.pages.findIndex(p => p.id === id);
    if (i < 0) return;
    const copy = { ...next.pages[i], id: `p${++_pid}` };
    next.pages.splice(i + 1, 0, copy);
    commit('duplicate', next);
  };
  const movePage = (id: string, dir: -1 | 1) => {
    const next = cloneDoc(doc);
    const i = next.pages.findIndex(p => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= next.pages.length) return;
    [next.pages[i], next.pages[j]] = [next.pages[j], next.pages[i]];
    commit('reorder', next);
  };

  const addAnno = (pageId: string, a: Annotation) => {
    const next = cloneDoc(doc);
    next.annotations[pageId] = [...(next.annotations[pageId] ?? []), a];
    commit('annotate', next);
  };
  const delAnno = (pageId: string, idx: number) => {
    const next = cloneDoc(doc);
    next.annotations[pageId] = (next.annotations[pageId] ?? []).filter((_, i) => i !== idx);
    commit('remove anno', next);
  };

  const commitTextEdit = () => {
    const te = textEdit;
    setTextEdit(null);
    if (!te || !selPage) return;
    const text = te.value;
    if (te.annoIdx != null) {
      // Editing in-studio-added text in place: update the annotation, or remove
      // it if cleared. One undo step.
      const next = cloneDoc(doc);
      const list = [...(next.annotations[selPage.id] ?? [])];
      const cur = list[te.annoIdx];
      if (cur && cur.kind === 'text') {
        if (text.trim()) list[te.annoIdx] = { ...cur, text: text.trim() };
        else list.splice(te.annoIdx, 1);
        next.annotations[selPage.id] = list;
        commit('edit text', next);
      }
      return;
    }
    if (te.replace) {
      // Editing an EXISTING PDF text run: nothing changed → no-op; otherwise
      // whiteout the original run and stamp the edited text at the same spot,
      // font-size matched. One undo step covers both.
      const r = te.replace;
      const next = cloneDoc(doc);
      const list = next.annotations[selPage.id] ?? [];
      list.push({ kind: 'rect', nx: r.nx, ny: r.ny, nw: r.nw, nh: r.nh, color: '#ffffff', opacity: 1, redact: true });
      if (text.trim()) list.push({ kind: 'text', nx: r.nx, ny: r.ny + r.nh * 0.2, text, size: r.sizePx, color: '#000000' });
      next.annotations[selPage.id] = list;
      commit('edit text', next);
      return;
    }
    if (!text.trim()) return;
    addAnno(selPage.id, { kind: 'text', nx: te.nx, ny: te.ny, text: text.trim(), size: textSize, color: textColor });
  };

  const norm = (e: React.PointerEvent) => {
    const r = editorRef.current!.getBoundingClientRect();
    return { nx: (e.clientX - r.left) / r.width, ny: (e.clientY - r.top) / r.height };
  };

  const onEditorDown = (e: React.PointerEvent) => {
    if (!selPage) return;
    // Pressing the canvas background (not an annotation, which stops propagation)
    // deselects the current annotation so its handles disappear.
    setSelAnnoIdx(-1);
    const p = norm(e);
    if (tool === 'text') {
      // Inline caret on the page — live preview, no modal round-trip. Commits on
      // Enter / blur; Esc cancels (handled by the overlay editor).
      setTextEdit({ nx: p.nx, ny: p.ny, value: '' });
    } else if (tool === 'edit-text') {
      void editTextAt(p.nx, p.ny);
    } else if (['rect', 'highlight', 'line', 'ellipse', 'whiteout', 'field'].includes(tool)) {
      dragRect.current = p;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else if (tool === 'draw') {
      drawing.current = [p.nx, p.ny];
      setLivePts([p.nx, p.ny]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else if (tool === 'sign') {
      if (!signaturePng) { setSignDialog(true); return; }
      addAnno(selPage.id, { kind: 'image', nx: p.nx, ny: p.ny, nw: 0.2, nh: 0.08, bytes: signaturePng, png: true });
    } else if (tool === 'image') {
      pendingImgPos.current = p;
      imgRef.current?.click();
    }
  };

  const startMoveAnno = (e: React.PointerEvent, idx: number, a: Annotation) => {
    if (!selPage || a.kind === 'draw') return;
    e.stopPropagation();
    setSelAnnoIdx(idx); // select → show resize handles
    const p = norm(e);
    moving.current = { pageId: selPage.id, idx, offX: p.nx - (a as any).nx, offY: p.ny - (a as any).ny };
  };
  // Resize a box/image/signature annotation by dragging a corner handle. The
  // opposite corner stays anchored (normalized 0..1 page coords).
  const startResizeAnno = (e: React.PointerEvent, idx: number, a: Annotation, corner: string) => {
    if (!selPage || !('nw' in (a as any))) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const an = a as any;
    resizing.current = { pageId: selPage.id, idx, corner, nx: an.nx, ny: an.ny, nw: an.nw, nh: an.nh, ox: norm(e).nx, oy: norm(e).ny };
  };

  const onEditorMove = (e: React.PointerEvent) => {
    if (drawing.current) {
      const p = norm(e);
      drawing.current.push(p.nx, p.ny);
      setLivePts(drawing.current.slice());
      return;
    }
    if (resizing.current) {
      const r = resizing.current;
      const p = norm(e);
      const cl01 = (v: number) => Math.max(0, Math.min(1, v));
      let nx = r.nx, ny = r.ny, nw = r.nw, nh = r.nh;
      const MIN = 0.02;
      // east/west edges move the right/left side; north/south move bottom/top.
      if (r.corner.includes('e')) nw = Math.max(MIN, cl01(p.nx) - r.nx);
      if (r.corner.includes('w')) { const right = r.nx + r.nw; nx = Math.min(cl01(p.nx), right - MIN); nw = right - nx; }
      if (r.corner.includes('s')) nh = Math.max(MIN, cl01(p.ny) - r.ny);
      if (r.corner.includes('n')) { const bottom = r.ny + r.nh; ny = Math.min(cl01(p.ny), bottom - MIN); nh = bottom - ny; }
      setDoc(d => ({
        ...d,
        annotations: {
          ...d.annotations,
          [r.pageId]: (d.annotations[r.pageId] ?? []).map((an, j) => j === r.idx ? { ...an, nx, ny, nw, nh } as Annotation : an),
        },
      }));
      return;
    }
    if (!moving.current) return;
    const p = norm(e);
    const { pageId, idx, offX, offY } = moving.current;
    const cl = (v: number) => Math.max(0, Math.min(1, v));
    let nx = cl(p.nx - offX), ny = cl(p.ny - offY);

    // Smart snapping: align the object's left/center/right and top/middle/bottom
    // to the page's edges + center. Snaps within a small threshold and surfaces
    // a visible guide line so the gesture reads as deliberate (Sejda/Acrobat).
    const moved = (doc.annotations[pageId] ?? [])[idx] as any;
    const w = moved?.nw ?? 0, h = moved?.nh ?? 0;
    const SNAP = 0.012; // ~1.2% of the page
    const TARGETS = [0, 0.5, 1];
    const vGuides: number[] = [], hGuides: number[] = [];
    // Horizontal position (x): test left edge, center, right edge.
    for (const tgt of TARGETS) {
      if (Math.abs(nx - tgt) < SNAP) { nx = tgt; vGuides.push(tgt); break; }
      if (w && Math.abs(nx + w / 2 - tgt) < SNAP) { nx = tgt - w / 2; vGuides.push(tgt); break; }
      if (w && Math.abs(nx + w - tgt) < SNAP) { nx = tgt - w; vGuides.push(tgt); break; }
    }
    for (const tgt of TARGETS) {
      if (Math.abs(ny - tgt) < SNAP) { ny = tgt; hGuides.push(tgt); break; }
      if (h && Math.abs(ny + h / 2 - tgt) < SNAP) { ny = tgt - h / 2; hGuides.push(tgt); break; }
      if (h && Math.abs(ny + h - tgt) < SNAP) { ny = tgt - h; hGuides.push(tgt); break; }
    }
    setGuides({ v: vGuides, h: hGuides });

    setDoc(d => ({
      ...d,
      annotations: {
        ...d.annotations,
        [pageId]: (d.annotations[pageId] ?? []).map((an, j) => j === idx ? { ...an, nx, ny } as Annotation : an),
      },
    }));
  };

  const onEditorUp = (e: React.PointerEvent) => {
    if (resizing.current) {
      stack.current.push('resize anno', cloneDoc(doc));
      resizing.current = null;
      return;
    }
    if (drawing.current) {
      if (selPage && drawing.current.length >= 4) {
        addAnno(selPage.id, { kind: 'draw', pts: drawing.current, color: textColor, width: penWidth });
      }
      drawing.current = null;
      setLivePts([]);
      return;
    }
    if (moving.current) {
      stack.current.push('move anno', cloneDoc(doc));
      moving.current = null;
      setGuides({ v: [], h: [] });
      return;
    }
    if (dragRect.current && selPage) {
      const s = dragRect.current;
      const en = norm(e);
      if (tool === 'line') {
        if (Math.abs(en.nx - s.nx) > 0.01 || Math.abs(en.ny - s.ny) > 0.01) {
          addAnno(selPage.id, { kind: 'line', nx: s.nx, ny: s.ny, nx2: en.nx, ny2: en.ny, color: textColor, width: 2 });
        }
      } else {
        const nx = Math.min(s.nx, en.nx), ny = Math.min(s.ny, en.ny);
        const nw = Math.abs(en.nx - s.nx), nh = Math.abs(en.ny - s.ny);
        if (nw > 0.01 && nh > 0.01) {
          if (tool === 'highlight') addAnno(selPage.id, { kind: 'rect', nx, ny, nw, nh, color: '#ffeb3b', opacity: 0.4 });
          // whiteout & redact DESTROY the content underneath: redact:true makes
          // buildPdf rasterize+flatten the page so the original text/vectors
          // are physically gone — not just painted over (extractable).
          else if (tool === 'whiteout') addAnno(selPage.id, { kind: 'rect', nx, ny, nw, nh, color: '#ffffff', opacity: 1, redact: true });
          else if (tool === 'ellipse') addAnno(selPage.id, { kind: 'ellipse', nx, ny, nw, nh, color: textColor, width: 2 });
          else if (tool === 'rect') addAnno(selPage.id, { kind: 'rect', nx, ny, nw, nh, color: '#000000', opacity: 1, redact: true });
          else if (tool === 'field') {
            // Real fillable form field, bound to this page (1-based pageId). The
            // kind (text/checkbox/signature) is chosen in the toolbar.
            const pageNum = doc.pages.findIndex(p => p.id === selPage.id) + 1;
            const label = fieldKind === 'checkbox' ? 'Check' : fieldKind === 'signature' ? 'Sign here' : 'Field';
            setFormFields(fs => [...fs, { id: `f${Date.now().toString(36)}`, pageId: `p${pageNum}`, kind: fieldKind, nx, ny, nw, nh, label }]);
          }
        }
      }
    }
    dragRect.current = null;
  };

  const onImageFile = async (file: File) => {
    if (!selPage || !pendingImgPos.current) return;
    const p = pendingImgPos.current;
    addAnno(selPage.id, {
      kind: 'image', nx: p.nx, ny: p.ny, nw: 0.3, nh: 0.3,
      bytes: await file.arrayBuffer(), png: /png$/i.test(file.type),
    });
  };

  const [ocrDialog, setOcrDialog] = React.useState<OcrResult | null>(null);
  const [ocrLang, setOcrLang] = React.useState('eng');

  const runOcr = async () => {
    if (!selPage || !selRaster) { toastFor('Open a page first'); return; }
    if (!(await guard())) return;
    setBusy('Loading OCR…');
    setProgress(0);
    try {
      const result = await ocrCanvas(selRaster.canvas, ocrLang, (status, ratio) => {
        setBusy(status || 'Recognizing…');
        setProgress(Math.round(ratio * 100));
      });
      setOcrDialog(result);
      toastFor(`Found ${result.words.length} words`);
    } catch (e) {
      toastFor((e as Error).message || 'OCR failed');
    } finally { setBusy(''); setProgress(0); }
  };

  const runAutoDeskew = async () => {
    if (!selPage || !selRaster) { toastFor('Open a page first'); return; }
    setBusy('Auto-deskewing…');
    try {
      const { angle, canvas } = deskewCanvas(selRaster.canvas);
      if (Math.abs(angle) < 0.3) { toastFor('Page already straight'); return; }
      const ras = { ...raster };
      const arr = (ras[selPage.srcId] ?? []).slice();
      arr[selPage.srcIndex] = { canvas, w: canvas.width, h: canvas.height };
      ras[selPage.srcId] = arr;
      setRaster(ras);
      toastFor(`Rotated by ${angle.toFixed(1)}°`);
    } finally { setBusy(''); }
  };

  // Scan ONE pdf.js page for PII, returning redaction-rect annotations (in the
  // page's normalized space). Shared by single-page + whole-document redaction.
  const scanPageForPii = async (page: any): Promise<Annotation[]> => {
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const list: Annotation[] = [];

    // Build ONE joined string for the page, remembering which source item +
      // local offset every character came from. pdf.js fragments text into many
      // items, so an SSN / phone / email can straddle two items — scanning each
      // item alone misses those (the live "Smart Redact found nothing" bug). We
      // scan the joined text, then map each global match span back to the
      // covering item(s) and box each item's covered sub-range.
      const items = content.items as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
      let joined = '';
      const map: ({ item: any; localStart: number } | null)[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (let it = 0; it < items.length; it++) {
        const item = items[it];
        const s = item.str ?? '';
        for (let k = 0; k < s.length; k++) map.push({ item, localStart: k });
        joined += s;
        // Separate items with a space (mapped to null so we never box it). Many
        // pdf.js items already carry hasEOL/trailing space, but gluing
        // "Email:john@x.com" onto the previous token kills the \b word-boundary
        // and merges two fields into one unmatchable blob — so a phone+email+SSN
        // line yielded a single match. The separator restores the boundaries.
        if (it < items.length - 1 && !/\s$/.test(s)) { joined += ' '; map.push(null); }
      }
      const boxFor = (item: any, locStart: number, locEnd: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const str = item.str ?? '';
        const [, , , d, e, f] = item.transform as number[];
        const charW = (item.width || 1) / Math.max(1, str.length);
        const h = Math.abs(d || item.height || 12);
        const x = e + locStart * charW;
        const w = Math.max(1, (locEnd - locStart)) * charW;
        list.push({
          kind: 'rect',
          nx: x / viewport.width,
          ny: 1 - (f + h) / viewport.height,
          nw: w / viewport.width,
          nh: (h * 1.4) / viewport.height,
          color: '#000000', opacity: 1, redact: true,
        });
      };
      for (const hit of findPii(joined)) {
        // Walk the matched character span and emit a box per source item the
        // span covers (a single match may span >1 item). map[i] is null at the
        // injected inter-item separators — skip those.
        let i = hit.start;
        while (i < hit.end && i < map.length) {
          const entry = map[i];
          if (!entry) { i++; continue; }
          const item = entry.item;
          const runStart = entry.localStart;
          let j = i;
          while (j + 1 < hit.end && j + 1 < map.length && map[j + 1] && map[j + 1]!.item === item) j++;
          boxFor(item, runStart, map[j]!.localStart + 1);
          i = j + 1;
        }
      }
    return list;
  };

  // Smart Redact the CURRENT page (default) or the WHOLE document. Whole-doc mode
  // groups source PDFs (one pdf.js doc per source) so a multi-source project is
  // covered too — the audit's "single-page only" compliance gap.
  const runSmartRedact = async (scope: 'page' | 'document' = 'page') => {
    if (!selPage) { toastFor('Open a page first'); return; }
    setBusy(scope === 'document' ? 'Scanning all pages for sensitive info…' : 'Scanning for sensitive info…');
    try {
      const pdfjsLib: any = await import('pdfjs-dist'); // eslint-disable-line @typescript-eslint/no-explicit-any
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; } catch {}
      const next = cloneDoc(doc);
      let added = 0;
      const targets = scope === 'document' ? doc.pages : [selPage];
      // Cache one pdf.js doc per source so we don't re-parse for every page.
      const docCache = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
      const getDoc = async (srcId: string) => {
        if (docCache.has(srcId)) return docCache.get(srcId);
        const d = await pdfjsLib.getDocument({ data: sources[srcId].slice(0) }).promise;
        docCache.set(srcId, d); return d;
      };
      for (let pi = 0; pi < targets.length; pi++) {
        const pg = targets[pi];
        if (!sources[pg.srcId]) continue;
        if (scope === 'document') setProgress(Math.round(((pi + 1) / targets.length) * 100));
        const pdfDoc = await getDoc(pg.srcId);
        const page = await pdfDoc.getPage(pg.srcIndex + 1);
        const hits = await scanPageForPii(page);
        if (hits.length) {
          next.annotations[pg.id] = [...(next.annotations[pg.id] ?? []), ...hits];
          added += hits.length;
        }
      }
      if (added) commit('smart redact', next);
      if (added) toastFor(`🛡️ Found & marked ${added} sensitive item${added === 1 ? '' : 's'}${scope === 'document' ? ` across ${targets.length} pages` : ''} — Export flattens them permanently`);
      else toastFor(`No emails, phones, SSNs or card numbers detected${scope === 'document' ? ' in the document' : ' on this page'}`);
    } catch (e) {
      toastFor('Could not scan');
    } finally { setBusy(''); setProgress(0); }
  };

  // Edit existing PDF text: find the text run nearest the click, let the user
  // rewrite it; on save we whiteout (destructively remove) the original run and
  // draw the replacement text in its place, font-size-matched. Pragmatic, exact
  // approach (no full reflow) that genuinely fixes typos in an existing PDF.
  const editTextAt = async (cnx: number, cny: number) => {
    if (!selPage) return;
    // First: did they click text we ADDED in-studio? Edit that annotation in
    // place (no whiteout/restamp — it's our own editable text). Closes the gap
    // where edit-text only touched original source runs.
    {
      const list = doc.annotations[selPage.id] ?? [];
      const editorH = editorRef.current?.getBoundingClientRect().height ?? 720;
      for (let i = list.length - 1; i >= 0; i--) {
        const a = list[i] as any;
        if (a.kind !== 'text') continue;
        const nh = (a.size / editorH) * 1.4;
        const nw = Math.max(0.05, (a.text.length * a.size * 0.5) / (editorRef.current?.getBoundingClientRect().width ?? 510));
        const top = a.ny - nh; // anno ny is the text baseline-ish; box sits above
        if (cnx >= a.nx - 0.01 && cnx <= a.nx + nw && cny >= top - 0.01 && cny <= a.ny + 0.01) {
          setTextEdit({ nx: a.nx, ny: top, value: a.text, screenSize: Math.max(8, Math.round(a.size)), annoIdx: i });
          return;
        }
      }
    }
    const bytes = sources[selPage.srcId];
    if (!bytes) return;
    setBusy('Reading text…');
    try {
      // Namespace import — pdfjs-dist has no `default` export (see the Smart Redact
      // fix above). The old `{ default: pdfjsLib }` was undefined → getDocument threw.
      const pdfjsLib: any = await import('pdfjs-dist');
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'; } catch {}
      const pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const page = await pdfDoc.getPage(selPage.srcIndex + 1);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      // Find the text item whose box contains (or is nearest) the click.
      let best: any = null, bestD = Infinity;
      for (const it of content.items as any[]) {
        if (!it.str?.trim()) continue;
        const [, , , d, e, f] = it.transform as number[];
        const h = Math.abs(d || it.height || 12);
        const nx = e / vp.width, ny = 1 - (f + h) / vp.height, nw = it.width / vp.width, nh = h * 1.4 / vp.height;
        const inside = cnx >= nx && cnx <= nx + nw && cny >= ny && cny <= ny + nh;
        const dist = Math.hypot(cnx - (nx + nw / 2), cny - (ny + nh / 2));
        // A direct hit (click is inside the run's box) is distance 0 — set bestD
        // so the proximity guard below accepts it. Bug was: inside-match left
        // bestD=Infinity, so the `bestD > 0.06` guard rejected the exact word the
        // user clicked → edit-text silently did nothing.
        if (inside) { best = { it, nx, ny, nw, nh, h }; bestD = 0; break; }
        if (dist < bestD) { bestD = dist; best = { it, nx, ny, nw, nh, h }; }
      }
      if (!best || bestD > 0.06) { toastFor('No text found here — click directly on a word'); return; }
      // Foxit-style: drop a LIVE inline caret right on top of the existing run,
      // pre-filled with its text and matched to its size — the user edits in
      // place (type, Enter/blur to commit, Esc to cancel). commitTextEdit() does
      // the whiteout + restamp. No modal, no prompt — the page text feels live.
      const sizePx = Math.max(8, Math.round(best.h));
      // Map the run's display height (page-normalized) into the on-screen editor
      // px size so the caret text visually matches what's underneath.
      const screenSize = Math.max(8, Math.round(best.nh * (editorRef.current?.getBoundingClientRect().height ?? 720)));
      setTextEdit({
        nx: best.nx, ny: best.ny, value: best.it.str, screenSize,
        replace: { nx: best.nx, ny: best.ny, nw: best.nw, nh: best.nh, sizePx },
      });
    } catch { toastFor('Could not edit this page’s text'); }
    finally { setBusy(''); }
  };

  const exportPdf = async () => {
    if (!doc.pages.length) return;
    const pagesHit = checkLever(POLICY_KEY, 'pages', doc.pages.length, isPro);
    if (pagesHit) { policyGate.fire(pagesHit); return; }
    if (!(await guard())) return;
    const hasRedaction = Object.values(doc.annotations).some(list => list.some(a => a.kind === 'rect' && a.redact));
    setBusy(hasRedaction ? 'Building PDF — flattening redacted pages…' : 'Building PDF…');
    setProgress(hasRedaction ? 0 : 50);
    try {
      let blob = await buildPdf({
        sources, pages: doc.pages, annotations: doc.annotations, pageNumbers: doc.pageNumbers,
        onProgress: hasRedaction ? (r) => setProgress(Math.round(r * 100)) : undefined,
      });
      let note = 'Exported';
      // Add REAL fillable AcroForm fields (recipient can type/check them in any
      // PDF reader). Skipped if compressing, since compression rasterizes pages.
      if (formFields.length && compressLevel === 'none') {
        const { applyInteractiveFormFields } = await import('@/lib/studios');
        blob = await applyInteractiveFormFields(await blob.arrayBuffer(), formFields);
        note = `Exported with ${formFields.length} fillable field${formFields.length === 1 ? '' : 's'}`;
      }
      if (compressLevel !== 'none') {
        setBusy('Reducing file size…'); setProgress(0);
        const { compressPdf } = await import('@/lib/studios');
        const buf = await blob.arrayBuffer();
        const { blob: smaller, ratio } = await compressPdf(buf, compressLevel, (p, t) => setProgress(Math.round((p / t) * 100)));
        blob = smaller;
        note = ratio < 1 ? `Exported — ${Math.round((1 - ratio) * 100)}% smaller` : 'Exported (already optimized)';
      }
      // When the page content was redacted, also SANITIZE the file so nothing
      // leaks out of band: clear Info/XMP metadata, drop embedded JavaScript and
      // attached files, and force a full (non-incremental) rewrite so no prior
      // revision survives. Redaction removes the visible content; this removes
      // the invisible copies. Runs before encryption so the wrapper is the last
      // thing applied.
      if (hasRedaction) {
        setBusy('Sanitizing — removing hidden metadata…');
        const { sanitizePdf } = await import('@/engines/pdf');
        const clean = await sanitizePdf(await blob.arrayBuffer());
        blob = new Blob([clean.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
        note = note.replace('Exported', 'Exported (redacted & sanitized)');
      }
      // Real AES password protection (last, so it wraps the finished file).
      if (pdfPassword.trim()) {
        const { encryptPdf } = await import('@/lib/studios');
        blob = await encryptPdf(await blob.arrayBuffer(), pdfPassword.trim());
        note = note.replace('Exported', 'Exported (password-protected)');
      }
      downloadBlob(blob, `${safeFilename(doc.name)}.pdf`);
      // Work is committed to disk — clear the crash-recovery snapshot so it
      // doesn't resurface as a stale "unsaved session" next visit.
      try { localStorage.removeItem(RECOVERY_KEY); } catch {}
      setSaveState('idle');
      toastFor(note);
      setExportDialog(false);
    } catch (e) {
      toastFor((e as Error).message || 'Export failed');
    } finally {
      setBusy(''); setProgress(0);
    }
  };

  // Export every page as a PNG, zipped. Builds the edited PDF first so
  // annotations/redactions are baked into the images.
  const exportImages = async () => {
    if (!doc.pages.length) return;
    if (!(await guard())) return;
    setBusy('Rendering pages to images…'); setProgress(0);
    try {
      const blob = await buildPdf({ sources, pages: doc.pages, annotations: doc.annotations, pageNumbers: doc.pageNumbers, bates: doc.bates });
      const { rasterizePdf } = await import('@/engines/pdf/rasterize');
      const rasters = await rasterizePdf(await blob.arrayBuffer(), { maxEdge: 2000, onProgress: (p) => setProgress(Math.round((p.page / p.pageCount) * 90)) });
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (let i = 0; i < rasters.length; i++) {
        const png: Blob = await new Promise((res, rej) => rasters[i].canvas.toBlob(b => b ? res(b) : rej(new Error('encode failed')), 'image/png'));
        zip.file(`${safeFilename(doc.name)}-${String(i + 1).padStart(3, '0')}.png`, png);
      }
      setProgress(95);
      const out = await zip.generateAsync({ type: 'blob' });
      downloadBlob(out, `${safeFilename(doc.name)}-images.zip`);
      toastFor(`Exported ${rasters.length} page image${rasters.length === 1 ? '' : 's'}`);
      setExportDialog(false);
    } catch (e) {
      toastFor((e as Error).message || 'Image export failed');
    } finally { setBusy(''); setProgress(0); }
  };

  const saveCurrent = async () => {
    setBusy('Saving…');
    try {
      const proj = newProject('pdf', doc.name, { doc, sourceIds: Object.keys(sources) });
      await saveProject(proj);
      toastFor('Saved (re-import PDFs to reopen)');
    } finally { setBusy(''); }
  };

  const openSaved = async () => {
    const list = await listProjects('pdf');
    setSavedList(list);
    setOpenDialog(true);
  };

  const loadFromLibrary = async (id: string) => {
    setBusy('Opening…');
    try {
      const p = await loadProject<{ doc: DocState; sourceIds: string[] }>(id);
      if (!p) return;
      setDoc(p.state.doc);
      stack.current.reset(cloneDoc(p.state.doc), 'open');
      toastFor('Re-import source PDFs to render');
      setOpenDialog(false);
    } finally { setBusy(''); }
  };

  useRegisterShortcuts([
    {
      label: 'Tools',
      items: TOOLS.map(t => ({ combo: t.key, description: t.label })),
    },
    {
      label: 'Pages',
      items: [
        { combo: 'left', description: 'Move page left' },
        { combo: 'right', description: 'Move page right' },
        { combo: 'delete', description: 'Delete page' },
      ],
    },
    {
      label: 'File',
      items: [
        { combo: 'mod+s', description: 'Save' },
        { combo: 'mod+e', description: 'Export PDF' },
        { combo: 'mod+o', description: 'Open library' },
        { combo: 'mod+z', description: 'Undo' },
        { combo: 'mod+shift+z', description: 'Redo' },
      ],
    },
  ]);

  useShortcuts([
    ...TOOLS.map(t => ({ combo: t.key, handler: () => setTool(t.tool), description: t.label })),
    { combo: 'mod+z', handler: undo },
    { combo: 'mod+shift+z', handler: redo },
    { combo: 'mod+s', handler: () => { void saveCurrent(); } },
    { combo: 'mod+e', handler: () => setExportDialog(true) },
    { combo: 'mod+o', handler: () => { void openSaved(); } },
    { combo: 'delete', handler: () => doc.selectedId && deletePage(doc.selectedId) },
    { combo: 'left', handler: () => doc.selectedId && movePage(doc.selectedId, -1) },
    { combo: 'right', handler: () => doc.selectedId && movePage(doc.selectedId, 1) },
  ]);

  if (!doc.pages.length) {
    return (
      <StudioShell>
        <StudioTopBar title="PDF Studio Pro" left={
          <>
            {/* Hidden image picker for the Images → PDF action (start screen + here). */}
            <input ref={imgToPdfRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { const fs = e.target.files; if (fs) await buildPdfFromImages(Array.from(fs)); e.target.value = ''; }} />
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <Upload className="h-3.5 w-3.5" /> Open
              <input ref={fileRef} type="file" accept="application/pdf" multiple className="hidden" onChange={async (e) => { const fs = e.target.files; if (fs) for (const f of Array.from(fs)) await addPdf(f); e.target.value = ''; }} />
            </label>
            <StudioButton variant="ghost" size="sm" onClick={openSaved}><FileText className="h-3.5 w-3.5" /> Library</StudioButton>
          </>
        } />
        {recovery && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
            <Save className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">
              Recovered an unsaved session{recovery.meta?.name ? <> — <span className="font-semibold">{recovery.meta.name}</span></> : null}
              {' '}({new Date(recovery.meta.t).toLocaleString()}). Restore your edits?
            </span>
            <button onClick={restoreRecovery} className="rounded bg-amber-400 px-2.5 py-1 font-medium text-amber-950 hover:bg-amber-300">Restore</button>
            <button onClick={dismissRecovery} className="rounded px-2 py-1 text-amber-200/80 hover:bg-white/5">Dismiss</button>
          </div>
        )}
        <div
          onDrop={async (e) => { e.preventDefault(); const fs = e.dataTransfer.files; if (fs) for (const f of Array.from(fs)) await addPdf(f); }}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-1 flex-col bg-[#0a0b0e]"
        >
          <EmptyState
            icon={<FileText className="h-7 w-7" />}
            title={busy || 'Open a PDF to start editing'}
            description="Drop a PDF anywhere on this screen, or pick one below. Everything happens on your device — nothing uploads."
            actions={[
              { label: 'Open PDF', description: 'Pick one or more files', icon: <Upload className="h-4 w-4" />, onClick: () => fileRef.current?.click(), primary: true },
              { label: 'Images → PDF', description: 'Combine photos/scans into one PDF', icon: <ImageIcon className="h-4 w-4" />, onClick: () => imgToPdfRef.current?.click() },
              { label: 'Open from Library', description: 'Continue a saved project', icon: <FileText className="h-4 w-4" />, onClick: openSaved },
            ]}
            hints={[
              { label: 'Organize, annotate, sign', description: 'Reorder pages, draw, type, redact, e-sign' },
              { label: 'OCR + Smart Redact', description: 'Auto-find emails, phones, SSNs — auto-cover them' },
              { label: 'Convert', description: 'Make searchable, export to Word, split, watermark' },
            ]}
          />
        </div>
        {gate}
        {openDialog && <OpenDialog items={savedList} onCancel={() => setOpenDialog(false)} onPick={loadFromLibrary} />}
        {pwPrompt && <PasswordPromptDialog fileName={pwPrompt.file.name} error={pwPrompt.error} busy={!!busy} onCancel={() => setPwPrompt(null)} onUnlock={unlockPdf} />}
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      {policyGate.element}
      <StudioTopBar
        title="PDF Studio Pro"
        left={
          <>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <Upload className="h-3.5 w-3.5" /> Add PDF
              <input type="file" accept="application/pdf" multiple className="hidden" onChange={async (e) => { const fs = e.target.files; if (fs) for (const f of Array.from(fs)) await addPdf(f); e.target.value = ''; }} />
            </label>
            <StudioButton variant="ghost" size="sm" onClick={openSaved}><FileText className="h-3.5 w-3.5" /> Library</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={saveCurrent}><Save className="h-3.5 w-3.5" /> Save</StudioButton>
            {/* On mobile Export is pinned in the always-visible right cluster instead —
                in this horizontally-scrolling left strip it drifts out of reach. */}
            <DesktopOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)}><Download className="h-3.5 w-3.5" /> Export</StudioButton></DesktopOnly>
            <span className="ml-2 h-5 w-px bg-white/10" />
            <input value={doc.name} onChange={e => setDoc(d => ({ ...d, name: e.target.value }))} className="h-7 w-40 rounded border border-transparent bg-transparent px-2 text-sm text-zinc-200 outline-none hover:border-white/10 focus:border-cyan-400/50" />
          </>
        }
        right={
          <>
            <button onClick={() => setShowCommentsPanel(s => !s)} className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium', showCommentsPanel ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-300 hover:bg-white/5')} title="Comments">
              <MessageSquare className="h-3.5 w-3.5" />
              <CommentsBadge count={comments.filter(c => !c.resolved).length} />
            </button>
            <StudioButton variant="ghost" size="sm" onClick={undo} disabled={!stack.current.canUndo()}><Undo2 className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={redo} disabled={!stack.current.canRedo()}><Redo2 className="h-3.5 w-3.5" /></StudioButton>
            {/* Keyboard-shortcut help is meaningless on touch; its slot goes to Export. */}
            <DesktopOnly><HelpButton /></DesktopOnly>
            <MobileOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)} title="Export"><Download className="h-3.5 w-3.5" /></StudioButton></MobileOnly>
          </>
        }
      />

      {recovery && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
          <Save className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Recovered an unsaved session{recovery.meta?.name ? <> — <span className="font-semibold">{recovery.meta.name}</span></> : null}
            {' '}({new Date(recovery.meta.t).toLocaleString()}). Restore your edits?
          </span>
          <button onClick={restoreRecovery} className="rounded bg-amber-400 px-2.5 py-1 font-medium text-amber-950 hover:bg-amber-300">Restore</button>
          <button onClick={dismissRecovery} className="rounded px-2 py-1 text-amber-200/80 hover:bg-white/5">Dismiss</button>
        </div>
      )}

      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/5 bg-[#0f1115] px-3 text-xs text-zinc-300">
        <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="h-6 w-8 rounded border border-white/10" title="Color" />
        {tool === 'text' && (
          <>
            <span className="text-zinc-500">Size</span>
            <input type="range" min={8} max={64} value={textSize} onChange={e => setTextSize(+e.target.value)} className="w-24" />
            <span className="tabular-nums">{textSize}</span>
          </>
        )}
        {tool === 'draw' && (
          <>
            <span className="text-zinc-500">Pen</span>
            <input type="range" min={1} max={10} value={penWidth} onChange={e => setPenWidth(+e.target.value)} className="w-24" />
            <span className="tabular-nums">{penWidth}</span>
          </>
        )}
        {tool === 'sign' && (
          <StudioButton size="sm" variant="soft" onClick={() => setSignDialog(true)}>{signaturePng ? 'Change signature' : 'Create signature…'}</StudioButton>
        )}
        {tool === 'field' && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-zinc-500">Field</span>
            {(['text', 'checkbox', 'signature'] as const).map(k => (
              <button key={k} onClick={() => setFieldKind(k)} className={cn('rounded px-2 py-1 text-xs capitalize', fieldKind === k ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}>{k}</button>
            ))}
          </div>
        )}
        <div className={cn('ml-auto flex items-center gap-1 transition-opacity', doc.pages.length === 0 && 'pointer-events-none opacity-40')}>
          <StudioButton size="sm" variant="soft" onClick={() => setWatermarkDialog(true)} title="Apply watermark to all pages"><Droplets className="h-3 w-3" /> Watermark</StudioButton>
          <StudioButton size="sm" variant="soft" onClick={() => setSplitDialog(true)} title="Split into multiple PDFs"><Scissors className="h-3 w-3" /> Split</StudioButton>
          <StudioButton size="sm" variant="soft" onClick={() => setExtractDialog(true)} title="Extract a page range as a new PDF"><FileText className="h-3 w-3" /> Extract</StudioButton>
          <StudioButton size="sm" variant="soft" onClick={() => void exportAsDocx()} title="Export as Word"><FileType2 className="h-3 w-3" /> Word</StudioButton>
          <StudioButton size="sm" variant="soft" onClick={() => void exportSearchable()} title="OCR then build searchable PDF"><FileCheck2 className="h-3 w-3" /> Searchable</StudioButton>
          <StudioButton size="sm" variant="soft" onClick={() => void runOcr()} title="Read text from this scanned page"><ScanText className="h-3 w-3" /> OCR</StudioButton>
          <select value={ocrLang} onChange={e => setOcrLang(e.target.value)} className="h-7 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-xs text-zinc-100" title="OCR language">
            {OCR_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <StudioButton size="sm" variant="soft" onClick={() => void runSmartRedact('page')} title="Find emails, phones, SSNs on THIS page and redact them"><Shield className="h-3 w-3" /> Smart Redact</StudioButton>
          {doc.pages.length > 1 && <StudioButton size="sm" variant="soft" onClick={() => void runSmartRedact('document')} title="Scan ALL pages for emails, phones, SSNs, cards and redact them">All pages</StudioButton>}
          <StudioButton size="sm" variant="soft" onClick={() => void runAutoDeskew()} title="Straighten a tilted scan"><Sparkles className="h-3 w-3" /> Deskew</StudioButton>
          <label className="ml-2 flex items-center gap-1.5">
            <input type="checkbox" checked={doc.pageNumbers} onChange={e => commit('page nums', { ...cloneDoc(doc), pageNumbers: e.target.checked })} />
            <Hash className="h-3 w-3" /> Page numbers
          </label>
          <StudioButton size="sm" variant={doc.bates ? 'primary' : 'soft'} onClick={() => setBatesDialog(true)} title="Bates numbering — sequential legal-discovery stamp (PREFIX000042SUFFIX) on every page"><Hash className="h-3 w-3" /> Bates{doc.bates ? ' ✓' : ''}</StudioButton>
        </div>
      </div>

      <StudioBody>
        <StudioToolDock>
          {TOOLS.map(t => (
            <StudioToolButton key={t.tool} active={tool === t.tool} label={t.label} hint={formatCombo(t.key)} onClick={() => setTool(t.tool)}>
              {t.icon}
            </StudioToolButton>
          ))}
        </StudioToolDock>

        <StudioSidebar side="left" width={200} label="Pages" autoOpen={false}>
          <StudioPanel title={`Pages · ${doc.pages.length}`}>
            <div className="grid max-h-[70vh] grid-cols-2 gap-1.5 overflow-y-auto">
              {doc.pages.map((p, i) => {
                const rp = raster[p.srcId]?.[p.srcIndex];
                return (
                  <div
                    key={p.id}
                    onClick={() => setDoc(d => ({ ...d, selectedId: p.id }))}
                    style={{ contentVisibility: 'auto', containIntrinsicSize: '0 120px' } as React.CSSProperties}
                    className={cn('group relative cursor-pointer overflow-hidden rounded border bg-white', doc.selectedId === p.id ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-white/10 hover:border-white/30')}
                  >
                    <div className="grid aspect-[3/4] place-items-center" style={{ transform: `rotate(${p.rotation}deg)` }}>
                      {rp ? <PreviewCanvas canvas={rp.canvas} /> : <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
                    </div>
                    <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[9px] font-bold text-white">{i + 1}</div>
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-0.5 bg-black/70 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <IconBtn title="Move left" onClick={() => movePage(p.id, -1)}><ChevronLeft className="h-3 w-3" /></IconBtn>
                      <IconBtn title="Rotate" onClick={() => rotatePage(p.id)}><RotateCw className="h-3 w-3" /></IconBtn>
                      <IconBtn title="Duplicate" onClick={() => duplicatePage(p.id)}><Copy className="h-3 w-3" /></IconBtn>
                      <IconBtn title="Delete" onClick={() => deletePage(p.id)}><Trash2 className="h-3 w-3" /></IconBtn>
                      <IconBtn title="Move right" onClick={() => movePage(p.id, 1)}><ChevronRight className="h-3 w-3" /></IconBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          </StudioPanel>
        </StudioSidebar>

        <StudioCanvasArea className="flex items-center justify-center p-6 touch-none">
          {selRaster && selPage ? (
            <div ref={editorWrapRef} className="flex max-h-full max-w-full items-center justify-center" style={{ transform: `translate(${editorPan.x}px,${editorPan.y}px) scale(${editorZoom})`, transformOrigin: 'center center' }}>
            <div
              ref={editorRef}
              className="relative max-h-full max-w-full shadow-2xl"
              style={{ touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair', transform: `rotate(${selPage.rotation}deg)` }}
              onPointerDown={onEditorDown}
              onPointerMove={onEditorMove}
              onPointerUp={onEditorUp}
            >
              <PreviewCanvas canvas={selRaster.canvas} max={720} />
              {(doc.annotations[selPage.id] ?? []).map((a, i) => {
                if (a.kind === 'text') return (
                  <span key={i} onPointerDown={(e) => startMoveAnno(e, i, a)} onDoubleClick={() => delAnno(selPage.id, i)}
                    className="absolute whitespace-nowrap cursor-move"
                    style={{ left: `${a.nx * 100}%`, top: `${a.ny * 100}%`, color: a.color, fontSize: a.size, fontWeight: 600, lineHeight: 1 }}>
                    {a.text}
                  </span>
                );
                if (a.kind === 'rect') return (
                  <div key={i} onPointerDown={(e) => startMoveAnno(e, i, a)} onDoubleClick={() => delAnno(selPage.id, i)}
                    title={a.redact ? 'Redaction — content underneath is permanently removed on export' : undefined}
                    className={cn('absolute cursor-move', a.redact && 'outline outline-1 outline-rose-500/70', selAnnoIdx === i && 'outline outline-2 outline-cyan-400')}
                    style={{ left: `${a.nx * 100}%`, top: `${a.ny * 100}%`, width: `${a.nw * 100}%`, height: `${a.nh * 100}%`, background: a.color, opacity: a.opacity ?? 1 }}>
                    {selAnnoIdx === i && <AnnoResizeHandles onStart={(c, e) => startResizeAnno(e, i, a, c)} />}
                  </div>
                );
                if (a.kind === 'image') return (
                  <div key={i} onPointerDown={(e) => startMoveAnno(e, i, a)} onDoubleClick={() => delAnno(selPage.id, i)}
                    className={cn('absolute cursor-move border border-dashed border-cyan-400/60', selAnnoIdx === i && 'outline outline-2 outline-cyan-400')}
                    style={{ left: `${a.nx * 100}%`, top: `${a.ny * 100}%`, width: `${a.nw * 100}%`, height: `${a.nh * 100}%`, background: 'rgba(34,211,238,.05)' }}>
                    {selAnnoIdx === i && <AnnoResizeHandles onStart={(c, e) => startResizeAnno(e, i, a, c)} />}
                  </div>
                );
                return null;
              })}
              <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {(doc.annotations[selPage.id] ?? []).map((a, i) => {
                  if (a.kind === 'draw') return <polyline key={`d${i}`} points={ptsToStr(a.pts)} fill="none" stroke={a.color} strokeWidth={a.width} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />;
                  if (a.kind === 'line') return <line key={`l${i}`} x1={a.nx * 100} y1={a.ny * 100} x2={a.nx2 * 100} y2={a.ny2 * 100} stroke={a.color} strokeWidth={a.width} vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
                  if (a.kind === 'ellipse') return <ellipse key={`e${i}`} cx={(a.nx + a.nw / 2) * 100} cy={(a.ny + a.nh / 2) * 100} rx={(a.nw / 2) * 100} ry={(a.nh / 2) * 100} fill="none" stroke={a.color} strokeWidth={a.width} vectorEffect="non-scaling-stroke" />;
                  return null;
                })}
                {livePts.length > 2 && <polyline points={ptsToStr(livePts)} fill="none" stroke={textColor} strokeWidth={penWidth} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />}
                {/* Smart-guide lines while dragging an object (center/edge snap). */}
                {guides.v.map((x, i) => <line key={`gv${i}`} x1={x * 100} y1={0} x2={x * 100} y2={100} stroke="#22d3ee" strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />)}
                {guides.h.map((y, i) => <line key={`gh${i}`} x1={0} y1={y * 100} x2={100} y2={y * 100} stroke="#22d3ee" strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />)}
              </svg>
              {/* Inline text editor — live caret on the page (replaces window.prompt). */}
              {textEdit && (
                <input
                  autoFocus
                  value={textEdit.value}
                  onChange={(e) => setTextEdit(te => te ? { ...te, value: e.target.value } : te)}
                  onBlur={commitTextEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitTextEdit(); }
                    else if (e.key === 'Escape') { e.preventDefault(); setTextEdit(null); }
                    e.stopPropagation();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  placeholder="Type…"
                  className="absolute z-10 min-w-[60px] whitespace-nowrap rounded-sm bg-white px-0.5 outline outline-2 outline-cyan-400"
                  style={{
                    left: `${textEdit.nx * 100}%`, top: `${textEdit.ny * 100}%`,
                    // Editing existing text → black on solid white at the run's
                    // matched size (mirrors the whiteout+restamp output); new text
                    // → the current tool color/size.
                    color: textEdit.replace ? '#000000' : textColor,
                    fontSize: textEdit.screenSize ?? textSize,
                    fontWeight: textEdit.replace ? 400 : 600,
                    lineHeight: 1.1, caretColor: '#06b6d4',
                  }}
                />
              )}
              {/* Fillable form-field overlays for THIS page (1-based pageId). */}
              {(() => { const pageNum = doc.pages.findIndex(p => p.id === selPage.id) + 1; return formFields.filter(f => f.pageId === `p${pageNum}`).map((f) => (
                <div key={f.id}
                  onDoubleClick={() => setFormFields(fs => fs.filter(x => x.id !== f.id))}
                  title="Fillable form field — double-click to remove"
                  className="absolute flex items-center justify-start border-2 border-dashed border-cyan-500 bg-cyan-400/10 px-1 text-[10px] text-cyan-700"
                  style={{ left: `${f.nx * 100}%`, top: `${f.ny * 100}%`, width: `${f.nw * 100}%`, height: `${f.nh * 100}%` }}>
                  {f.label}
                </div>
              )); })()}
            </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Select a page from the sidebar</div>
          )}
        </StudioCanvasArea>
      </StudioBody>

      <StudioStatusBar>
        <span>{doc.pages.length} pages</span>
        <span>{Object.values(doc.annotations).reduce((s, a) => s + a.length, 0)} annotations</span>
        <span className="flex items-center gap-1 text-zinc-500" title="Your edits are auto-saved on this device for crash recovery">
          {saveState === 'saving'
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
            : saveState === 'saved'
              ? <><FileCheck2 className="h-3 w-3 text-emerald-400/80" /> Auto-saved</>
              : <>Auto-save on</>}
        </span>
        <span className="ml-auto">{tool}</span>
      </StudioStatusBar>

      {busy && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 rounded-md bg-black/80 px-4 py-2 text-sm text-white backdrop-blur">
          <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> {busy}
          {progress > 0 && <div className="mt-1 h-1 w-48 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} /></div>}
        </div>
      )}
      {toast && <div className="pointer-events-none fixed bottom-12 left-1/2 -translate-x-1/2 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-lg">{toast}</div>}
      {gate}

      <input ref={imgRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImageFile(f); e.target.value = ''; }} />

      {batesDialog && (
        <BatesDialog
          initial={doc.bates ?? { prefix: '', suffix: '', start: 1, digits: 6, position: 'br' }}
          enabled={!!doc.bates}
          onCancel={() => setBatesDialog(false)}
          onApply={(b) => { commit('bates', { ...cloneDoc(doc), bates: b }); setBatesDialog(false); toastFor(b ? 'Bates numbering on — stamped on export' : 'Bates numbering off'); }}
        />
      )}
      {exportDialog && (
        <Dialog title="Export PDF" onCancel={() => setExportDialog(false)} onConfirm={exportPdf} confirmLabel="Download">
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={doc.pageNumbers} onChange={e => commit('page nums', { ...cloneDoc(doc), pageNumbers: e.target.checked })} />
            Add page numbers
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
            <span>Reduce file size</span>
            <select value={compressLevel} onChange={e => setCompressLevel(e.target.value as typeof compressLevel)} className="rounded border border-white/10 bg-[#0a0b0e] px-2 py-1 text-xs text-zinc-100">
              <option value="none">Off</option>
              <option value="lossless">Lossless — keep selectable text</option>
              <option value="light">Light — flatten to image</option>
              <option value="balanced">Balanced — flatten to image</option>
              <option value="strong">Strong — smallest, flatten to image</option>
            </select>
          </label>
          {compressLevel === 'lossless' && <div className="rounded bg-emerald-500/10 p-2 text-[11px] text-emerald-200">Re-packs the document without rasterizing — text stays selectable/searchable. Modest savings; best for text PDFs.</div>}
          {compressLevel !== 'none' && compressLevel !== 'lossless' && <div className="rounded bg-amber-500/10 p-2 text-[11px] text-amber-200">Flattens pages to images — selectable text is lost. Best for scans/photos. We keep the original if it’s already smaller.</div>}
          {formFields.length > 0 && compressLevel === 'none' && <div className="rounded bg-cyan-500/10 p-2 text-[11px] text-cyan-200">{formFields.length} fillable form field{formFields.length === 1 ? '' : 's'} will be added — recipients can type into them in any PDF reader.</div>}
          <label className="flex items-center justify-between gap-2 text-xs text-zinc-300">
            <span>Password (AES)</span>
            <input type="password" value={pdfPassword} onChange={e => setPdfPassword(e.target.value)} placeholder="leave blank for none" className="w-44 rounded border border-white/10 bg-[#0a0b0e] px-2 py-1 text-xs text-zinc-100" />
          </label>
          {pdfPassword.trim() && <div className="rounded bg-cyan-500/10 p-2 text-[11px] text-cyan-200">Real AES encryption — the file can't be opened without this password. Don't lose it; it can't be recovered.</div>}
          <div className="rounded bg-emerald-500/10 p-2 text-xs text-emerald-200">Redacted pages are flattened to an image so the hidden text is permanently removed — not just covered. Other pages keep their selectable vector text.</div>
          {!isPro && (
            <div className="flex items-center justify-between gap-2 rounded bg-white/5 p-2 text-[11px] text-zinc-400">
              <span>Free exports include a small “Made with {BRAND_DOMAIN}” footer.</span>
              <a href="/pricing" className="shrink-0 font-medium text-cyan-300 hover:underline">Upgrade to remove</a>
            </div>
          )}
          <button type="button" onClick={() => void exportImages()} className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">Or export every page as PNG images (.zip)</button>
        </Dialog>
      )}
      {openDialog && <OpenDialog items={savedList} onCancel={() => setOpenDialog(false)} onPick={loadFromLibrary} />}
      {pwPrompt && <PasswordPromptDialog fileName={pwPrompt.file.name} error={pwPrompt.error} busy={!!busy} onCancel={() => setPwPrompt(null)} onUnlock={unlockPdf} />}
      {showCommentsPanel && selPage && (
        <div className="fixed right-0 top-[88px] bottom-0 z-40 flex w-80 flex-col border-l border-white/10 bg-[#0f1115] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <div className="text-xs font-semibold text-zinc-100">Comments</div>
            <button onClick={() => setShowCommentsPanel(false)} className="rounded p-1 text-zinc-400 hover:bg-white/5"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="border-b border-white/5 px-3 py-2 text-[10px] text-zinc-400">
            Author: <input value={commentAuthor} onChange={e => setCommentAuthor(e.target.value)} className="ml-1 rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-0.5 text-zinc-100" />
          </div>
          <div className="border-b border-white/5 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Page {doc.pages.findIndex(p => p.id === selPage.id) + 1}</div>
            <CommentsThread
              anchor={{ kind: 'page-rect', pageId: selPage.id, nx: 0, ny: 0, nw: 1, nh: 1 }}
              comments={commentsModel.current.threadFor({ kind: 'page-rect', pageId: selPage.id, nx: 0, ny: 0, nw: 1, nh: 1 })}
              currentUser={commentAuthor}
              currentColor={commentColor}
              onAdd={(text) => commentsModel.current.add({ kind: 'page-rect', pageId: selPage.id, nx: 0, ny: 0, nw: 1, nh: 1 }, commentAuthor, commentColor, text)}
              onReply={(parentId, text) => commentsModel.current.reply(parentId, commentAuthor, commentColor, text)}
              onResolve={(id) => commentsModel.current.resolve(id, true)}
              onUnresolve={(id) => commentsModel.current.resolve(id, false)}
              onDelete={(id) => commentsModel.current.remove(id)}
              onEdit={(id, text) => commentsModel.current.editText(id, text)}
            />
          </div>
          <div className="flex-1 min-h-0">
            <CommentsOverviewPanel
              comments={comments}
              currentUser={commentAuthor}
              currentColor={commentColor}
              onJumpTo={(anchor) => {
                if (anchor.kind === 'page-rect') setDoc(d => ({ ...d, selectedId: anchor.pageId }));
              }}
              onResolve={(id) => commentsModel.current.resolve(id, true)}
              onUnresolve={(id) => commentsModel.current.resolve(id, false)}
              onDelete={(id) => commentsModel.current.remove(id)}
              onReply={(parentId, text) => commentsModel.current.reply(parentId, commentAuthor, commentColor, text)}
              onEdit={(id, text) => commentsModel.current.editText(id, text)}
            />
          </div>
        </div>
      )}
      {watermarkDialog && (
        <WatermarkDialog onCancel={() => setWatermarkDialog(false)} onApply={(w) => void applyWatermark(w)} />
      )}
      {splitDialog && (
        <SplitDialog totalPages={doc.pages.length} onCancel={() => setSplitDialog(false)} onSplit={(r) => void runSplit(r)} />
      )}
      {extractDialog && (
        <ExtractDialog totalPages={doc.pages.length} onCancel={() => setExtractDialog(false)} onExtract={(idx) => void runExtract(idx)} />
      )}
      {ocrDialog && (
        <Dialog title={`Extracted text · ${ocrDialog.words.length} words`} wide onCancel={() => setOcrDialog(null)} onConfirm={() => {
          navigator.clipboard?.writeText(ocrDialog.text);
          toastFor('Copied to clipboard');
          setOcrDialog(null);
        }} confirmLabel="Copy all">
          <div className="max-h-96 overflow-y-auto rounded border border-white/10 bg-[#0a0b0e] p-3 text-xs whitespace-pre-wrap text-zinc-200">
            {ocrDialog.text || <span className="text-zinc-500">No text detected</span>}
          </div>
        </Dialog>
      )}
      {signDialog && (
        <SignatureDialog onCancel={() => setSignDialog(false)} onSave={(bytes) => { setSignaturePng(bytes); setSignDialog(false); setTool('sign'); toastFor('Signature ready — click anywhere on the page'); }} />
      )}
    </StudioShell>
  );
}

function WatermarkDialog({ onCancel, onApply }: { onCancel: () => void; onApply: (w: PdfWatermark) => void }) {
  const [text, setText] = React.useState('DRAFT');
  const [color, setColor] = React.useState('#888888');
  const [opacity, setOpacity] = React.useState(0.4);
  const [fontSize, setFontSize] = React.useState(72);
  const [rotation, setRotation] = React.useState(-30);
  const [position, setPosition] = React.useState<PdfWatermark['position']>('center');
  return (
    <Dialog title="Apply watermark" onCancel={onCancel} onConfirm={() => onApply({ text, color, opacity, fontSize, rotation, position })} confirmLabel="Apply">
      <div className="space-y-3 text-xs">
        <label className="block">
          <div className="mb-1 text-zinc-400">Text</div>
          <input value={text} onChange={e => setText(e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100" />
        </label>
        <div className="flex items-center gap-2">
          <label className="text-zinc-400">Color</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-6 w-8 rounded border border-white/10" />
          <label className="text-zinc-400 ml-3">Opacity</label>
          <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} className="flex-1" />
          <span className="w-8 tabular-nums">{Math.round(opacity * 100)}%</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="mb-1 text-zinc-400">Font size</div>
            <input type="number" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value) || 72)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100" />
          </label>
          <label className="block">
            <div className="mb-1 text-zinc-400">Rotation (°)</div>
            <input type="number" value={rotation} onChange={e => setRotation(parseInt(e.target.value) || 0)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100" />
          </label>
        </div>
        <label className="block">
          <div className="mb-1 text-zinc-400">Position</div>
          <select value={position} onChange={e => setPosition(e.target.value as PdfWatermark['position'])} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100">
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="top-right">Top right</option>
            <option value="bottom-right">Bottom right</option>
          </select>
        </label>
      </div>
    </Dialog>
  );
}

function SplitDialog({ totalPages, onCancel, onSplit }: { totalPages: number; onCancel: () => void; onSplit: (r: Array<{ from: number; to: number; name?: string }>) => void }) {
  const [mode, setMode] = React.useState<'every' | 'ranges'>('every');
  const [chunkSize, setChunkSize] = React.useState(1);
  const [rangesText, setRangesText] = React.useState('1-3, 4-6, 7-10');

  const handle = () => {
    if (mode === 'every') {
      const ranges: Array<{ from: number; to: number; name?: string }> = [];
      for (let i = 1; i <= totalPages; i += chunkSize) {
        const to = Math.min(totalPages, i + chunkSize - 1);
        ranges.push({ from: i, to, name: `pages_${i}-${to}.pdf` });
      }
      onSplit(ranges);
    } else {
      const parts = rangesText.split(',').map(s => s.trim()).filter(Boolean);
      const ranges: Array<{ from: number; to: number; name?: string }> = [];
      for (const p of parts) {
        const m = /^(\d+)\s*-\s*(\d+)$/.exec(p);
        if (m) ranges.push({ from: parseInt(m[1]), to: parseInt(m[2]) });
        else {
          const n = parseInt(p);
          if (!isNaN(n)) ranges.push({ from: n, to: n });
        }
      }
      onSplit(ranges);
    }
  };

  return (
    <Dialog title="Split PDF" onCancel={onCancel} onConfirm={handle} confirmLabel="Split & download">
      <div className="space-y-3 text-xs">
        <div className="flex gap-1">
          <button onClick={() => setMode('every')} className={cn('flex-1 rounded px-2 py-1.5', mode === 'every' ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>Every N pages</button>
          <button onClick={() => setMode('ranges')} className={cn('flex-1 rounded px-2 py-1.5', mode === 'ranges' ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>Custom ranges</button>
        </div>
        {mode === 'every' ? (
          <label className="block">
            <div className="mb-1 text-zinc-400">Pages per file</div>
            <input type="number" min={1} max={totalPages} value={chunkSize} onChange={e => setChunkSize(Math.max(1, parseInt(e.target.value) || 1))} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100" />
            <div className="mt-1 text-[10px] text-zinc-500">Will produce {Math.ceil(totalPages / chunkSize)} file(s)</div>
          </label>
        ) : (
          <label className="block">
            <div className="mb-1 text-zinc-400">Ranges (e.g. "1-3, 5-8, 10")</div>
            <textarea value={rangesText} onChange={e => setRangesText(e.target.value)} rows={2} className="w-full rounded border border-white/10 bg-[#0a0b0e] p-1.5 font-mono text-zinc-100" />
          </label>
        )}
        <div className="rounded bg-amber-500/10 p-2 text-amber-200">Total pages: {totalPages}</div>
      </div>
    </Dialog>
  );
}

// Acrobat-style "Extract pages": pick a 1-based page range / list ("2-4, 7")
// and download a NEW PDF containing only those pages (in the order typed).
function ExtractDialog({ totalPages, onCancel, onExtract }: { totalPages: number; onCancel: () => void; onExtract: (indices: number[]) => void }) {
  const [rangeText, setRangeText] = React.useState(`1-${totalPages}`);

  // Parse "2-4, 7" → [2,3,4,7], clamped to 1..totalPages, de-duped, order preserved.
  const parse = (txt: string): number[] => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const part of txt.split(',').map(s => s.trim()).filter(Boolean)) {
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
      if (m) {
        let a = parseInt(m[1]), b = parseInt(m[2]);
        if (a > b) [a, b] = [b, a];
        for (let n = a; n <= b; n++) if (n >= 1 && n <= totalPages && !seen.has(n)) { seen.add(n); out.push(n); }
      } else {
        const n = parseInt(part);
        if (!isNaN(n) && n >= 1 && n <= totalPages && !seen.has(n)) { seen.add(n); out.push(n); }
      }
    }
    return out;
  };

  const indices = parse(rangeText);

  return (
    <Dialog title="Extract pages" onCancel={onCancel} onConfirm={() => onExtract(indices)} confirmLabel="Extract & download">
      <div className="space-y-3 text-xs">
        <label className="block">
          <div className="mb-1 text-zinc-400">Pages to extract (e.g. "2-4" or "1, 3, 5-8")</div>
          <input value={rangeText} onChange={e => setRangeText(e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 font-mono text-zinc-100" />
        </label>
        <div className="rounded bg-amber-500/10 p-2 text-amber-200">
          {indices.length ? `Will extract ${indices.length} page${indices.length === 1 ? '' : 's'} of ${totalPages}` : `Enter a valid range (1–${totalPages})`}
        </div>
      </div>
    </Dialog>
  );
}

function PreviewCanvas({ canvas, max = 720 }: { canvas: HTMLCanvasElement; max?: number }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const dst = ref.current;
    if (!dst) return;
    const scale = Math.min(max / canvas.width, max / canvas.height);
    dst.width = Math.round(canvas.width * scale);
    dst.height = Math.round(canvas.height * scale);
    const ctx = dst.getContext('2d')!;
    ctx.clearRect(0, 0, dst.width, dst.height);
    ctx.drawImage(canvas, 0, 0, dst.width, dst.height);
  }, [canvas, max]);
  return <canvas ref={ref} className="block max-h-full max-w-full" />;
}

/** Four corner resize handles for a selected box/image/signature annotation.
 *  Each calls onStart(corner, event) → the studio's startResizeAnno. */
function AnnoResizeHandles({ onStart }: { onStart: (corner: string, e: React.PointerEvent) => void }) {
  // Each corner anchored at a page %, then translated by −50% so the dot centers
  // exactly on the box corner.
  const corners: { c: string; left: string; top: string; cur: string }[] = [
    { c: 'nw', left: '0%', top: '0%', cur: 'nwse-resize' },
    { c: 'ne', left: '100%', top: '0%', cur: 'nesw-resize' },
    { c: 'sw', left: '0%', top: '100%', cur: 'nesw-resize' },
    { c: 'se', left: '100%', top: '100%', cur: 'nwse-resize' },
  ];
  return (
    <>
      {corners.map(({ c, left, top, cur }) => (
        <div
          key={c}
          onPointerDown={(e) => onStart(c, e)}
          className="absolute z-10 h-2.5 w-2.5 rounded-full border-2 border-cyan-400 bg-white [touch-action:none] [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5"
          style={{ left, top, transform: 'translate(-50%, -50%)', cursor: cur }}
        />
      ))}
    </>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return <button title={title} onClick={(e) => { e.stopPropagation(); onClick(); }} className="grid h-5 w-5 place-items-center rounded text-zinc-300 hover:bg-white/10 hover:text-white">{children}</button>;
}

type BatesCfg = { prefix: string; suffix: string; start: number; digits: number; position: 'bl' | 'br' | 'tl' | 'tr' };
function BatesDialog({ initial, enabled, onCancel, onApply }: { initial: BatesCfg; enabled: boolean; onCancel: () => void; onApply: (b: BatesCfg | undefined) => void }) {
  const [cfg, setCfg] = React.useState<BatesCfg>(initial);
  const set = (p: Partial<BatesCfg>) => setCfg(c => ({ ...c, ...p }));
  const preview = formatBates(cfg.start, cfg);
  const POSITIONS: { id: BatesCfg['position']; label: string }[] = [
    { id: 'bl', label: 'Bottom-left' }, { id: 'br', label: 'Bottom-right' }, { id: 'tl', label: 'Top-left' }, { id: 'tr', label: 'Top-right' },
  ];
  return (
    <Dialog title="Bates numbering" onCancel={onCancel} onConfirm={() => onApply(cfg)} confirmLabel="Apply">
      <div className="space-y-3 text-xs">
        <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-center font-mono text-sm text-cyan-100">{preview}</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-zinc-400">Prefix</span>
            <input value={cfg.prefix} onChange={e => set({ prefix: e.target.value })} placeholder="e.g. ABC-" className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-zinc-100 outline-none focus:border-cyan-500/60" /></label>
          <label className="space-y-1"><span className="text-zinc-400">Suffix</span>
            <input value={cfg.suffix} onChange={e => set({ suffix: e.target.value })} placeholder="optional" className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-zinc-100 outline-none focus:border-cyan-500/60" /></label>
          <label className="space-y-1"><span className="text-zinc-400">Start number</span>
            <input type="number" min={0} value={cfg.start} onChange={e => set({ start: Math.max(0, parseInt(e.target.value) || 0) })} className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-zinc-100 outline-none focus:border-cyan-500/60" /></label>
          <label className="space-y-1"><span className="text-zinc-400">Digits</span>
            <input type="number" min={1} max={12} value={cfg.digits} onChange={e => set({ digits: Math.max(1, Math.min(12, parseInt(e.target.value) || 6)) })} className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-zinc-100 outline-none focus:border-cyan-500/60" /></label>
        </div>
        <label className="space-y-1 block"><span className="text-zinc-400">Position</span>
          <div className="grid grid-cols-4 gap-1">
            {POSITIONS.map(p => (
              <button key={p.id} onClick={() => set({ position: p.id })} className={cn('rounded px-2 py-1.5 text-[11px]', cfg.position === p.id ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300 hover:bg-white/10')}>{p.label}</button>
            ))}
          </div>
        </label>
        {enabled && <button onClick={() => onApply(undefined)} className="w-full rounded bg-white/5 px-2 py-1.5 text-zinc-300 hover:bg-white/10">Turn off Bates numbering</button>}
        <p className="text-[10px] text-zinc-500">Bates numbers are stamped on every page on export — the standard for legal discovery & evidence.</p>
      </div>
    </Dialog>
  );
}

function PasswordPromptDialog({ fileName, error, busy, onCancel, onUnlock }: { fileName: string; error?: boolean; busy: boolean; onCancel: () => void; onUnlock: (pw: string) => void }) {
  const [pw, setPw] = React.useState('');
  return (
    <Dialog title="Locked PDF" onCancel={onCancel} onConfirm={() => pw && onUnlock(pw)} confirmLabel={busy ? 'Unlocking…' : 'Unlock'}>
      <div className="space-y-2">
        <div className="text-xs text-zinc-400"><span className="font-medium text-zinc-200">{fileName}</span> is password-protected. Enter its password to open it — decryption happens on your device.</div>
        <input
          autoFocus type="password" value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && pw) onUnlock(pw); }}
          placeholder="PDF password"
          className="h-9 w-full rounded border border-white/10 bg-[#0a0b0e] px-2 text-sm text-zinc-100"
        />
        {error && <div className="rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">Wrong password — try again.</div>}
      </div>
    </Dialog>
  );
}

function OpenDialog({ items, onCancel, onPick }: { items: StudioProject[]; onCancel: () => void; onPick: (id: string) => void }) {
  return (
    <Dialog title="Library" onCancel={onCancel} onConfirm={onCancel} confirmLabel="Close">
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {items.length === 0 && <div className="rounded bg-white/5 p-4 text-center text-xs text-zinc-400">No saved projects</div>}
        {items.map(p => (
          <button key={p.id} onClick={() => onPick(p.id)} className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            <span className="flex-1 truncate">{p.name}</span>
            <span className="text-zinc-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function SignatureDialog({ onCancel, onSave }: { onCancel: () => void; onSave: (bytes: ArrayBuffer) => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const last = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    const c = canvasRef.current!;
    c.width = 480; c.height = 160;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const onDown: React.PointerEventHandler = (e) => {
    drawing.current = true;
    const r = canvasRef.current!.getBoundingClientRect();
    last.current = { x: ((e.clientX - r.left) / r.width) * canvasRef.current!.width, y: ((e.clientY - r.top) / r.height) * canvasRef.current!.height };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove: React.PointerEventHandler = (e) => {
    if (!drawing.current || !last.current) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * canvasRef.current!.width;
    const y = ((e.clientY - r.top) / r.height) * canvasRef.current!.height;
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    last.current = { x, y };
  };
  const onUp = () => { drawing.current = false; last.current = null; };

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
  };

  const save = async () => {
    const c = canvasRef.current!;
    const trimmed = trimToContent(c) ?? c;
    const blob: Blob = await new Promise((res, rej) => trimmed.toBlob(b => b ? res(b) : rej(new Error('Could not capture signature')), 'image/png'));
    onSave(await blob.arrayBuffer());
  };

  return (
    <Dialog title="Sign here" onCancel={onCancel} onConfirm={save} confirmLabel="Use signature" wide>
      <div className="space-y-2">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className="block w-full rounded border border-white/10 bg-white touch-none"
          style={{ aspectRatio: '3/1' }}
        />
        <div className="flex justify-end">
          <button onClick={clear} className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/5"><Eraser className="mr-1 inline h-3 w-3" /> Clear</button>
        </div>
      </div>
    </Dialog>
  );
}

function trimToContent(c: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = c.width, h = c.height;
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = 0, maxY = 0, has = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const r = img[o], g = img[o + 1], b = img[o + 2];
    if (r < 200 || g < 200 || b < 200) {
      has = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!has) return null;
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w, maxX + pad); maxY = Math.min(h, maxY + pad);
  const out = blankCanvas(maxX - minX, maxY - minY);
  const octx = out.getContext('2d')!;
  octx.drawImage(c, minX, minY, maxX - minX, maxY - minY, 0, 0, out.width, out.height);
  return out;
}

function Dialog({ title, children, onCancel, onConfirm, confirmLabel = 'OK', wide }: { title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string; wide?: boolean }) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width={wide ? 'lg' : 'sm'}>{children}</SharedDialog>;
}
