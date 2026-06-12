'use client';

import * as React from 'react';
import {
  Loader2, Download, Upload, Save, Undo2, Redo2, Plus, Trash2, X,
  FileText, Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Type as TypeIcon, Hash, Percent, DollarSign, Calendar, Palette,
  ArrowDownAZ, Filter, ChartBar, Sigma, Sparkles, AlertTriangle, Wand2,
  PieChart, BarChart3, LineChart as LineIcon, Table2, MessageSquare,
  TrendingUp, Tag, Lock as LockIcon, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'office-studio';
import {
  StudioShell, StudioTopBar, StudioBody, StudioStatusBar,
  StudioButton,
  UndoStack, newProject, saveProject, listProjects, loadProject,
  type StudioProject, downloadBlob, safeFilename, useShortcuts,
  findOutliers, detectColumnType, smartFill,
  callFormula, FORMULA_NAMES,
  importXlsx, exportXlsx, type XlsxWorkbookData,
  LOCALES, formatNumber as i18nFormatNumber, formatCurrency as i18nFormatCurrency, formatDate as i18nFormatDate, defaultCurrencyFor,
  buildPivot, pivotToCells, type PivotConfig, type Agg,
  renderChart, type ChartConfig, type ChartType,
  evalCondFormat, PRESET_RULES, type CondFormatRange, type CondRule,
  CommentsModel, CommentsThread, CommentsBadge, CommentsOverviewPanel,
  type Comment, type CommentAnchor, pickPeerColor,
  renderSparkline, parseSparkValues, type SparkType,
  NamedRangesModel, DataValidationModel, type NamedRange, type DataValidation, type DataValidationRule,
  HelpButton, useRegisterShortcuts, DesktopOnly, MobileOnly,
  pushToast, SharedDialog, EmptyState,
} from '@/lib/studios';

interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  bg?: string;
  format?: 'general' | 'number' | 'percent' | 'currency' | 'date' | 'text';
  decimals?: number;
}

interface Cell {
  raw: string;
  style?: CellStyle;
}

interface SheetChart {
  id: string;
  config: ChartConfig;
  x: number; y: number; w: number; h: number;
}

interface Sheet {
  id: string;
  name: string;
  cells: Record<string, Cell>;
  cols: number;
  rows: number;
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  condFormats?: CondFormatRange[];
  charts?: SheetChart[];
}

interface FreezePanes {
  rows: number;
  cols: number;
}

interface DocState {
  name: string;
  sheets: Sheet[];
  activeSheetId: string;
  selection: { r: number; c: number; r2: number; c2: number };
  locale: string;
  currency: string;
  freeze?: Record<string, FreezePanes>;
}

let _id = 0;
const nid = () => `s${++_id}`;

const newSheet = (name = 'Sheet 1', cols = 26, rows = 100): Sheet => ({
  id: nid(), name, cells: {}, cols, rows, colWidths: {}, rowHeights: {},
});

const NEW_DOC = (): DocState => {
  const s = newSheet();
  const fallbackLocale = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US';
  return { name: 'Untitled', sheets: [s], activeSheetId: s.id, selection: { r: 0, c: 0, r2: 0, c2: 0 }, locale: fallbackLocale, currency: defaultCurrencyFor(fallbackLocale) };
};

const cloneDoc = (d: DocState): DocState => ({
  ...d,
  sheets: d.sheets.map(s => ({ ...s, cells: { ...s.cells }, colWidths: { ...s.colWidths }, rowHeights: { ...s.rowHeights } })),
  selection: { ...d.selection },
});

function colToLetter(c: number): string {
  let s = '';
  c++;
  while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
function letterToCol(s: string): number {
  let c = 0;
  for (const ch of s.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
}
function cellKey(r: number, c: number): string { return `${r}_${c}`; }
function refToRC(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.trim().toUpperCase());
  if (!m) return null;
  return { c: letterToCol(m[1]), r: parseInt(m[2], 10) - 1 };
}

interface EvalContext {
  sheet: Sheet;
  visiting: Set<string>;
  allSheets?: Sheet[];
}

function parseSheetRef(s: string): { sheet: string; ref: string } | null {
  const m = /^([A-Za-z_][\w ]*?)!([A-Z]+\d+(?::[A-Z]+\d+)?)$/.exec(s);
  if (!m) return null;
  return { sheet: m[1], ref: m[2] };
}

function getNum(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,$%]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

function evalCell(r: number, c: number, ctx: EvalContext): any {
  const key = cellKey(r, c);
  if (ctx.visiting.has(key)) return '#CIRC';
  const cell = ctx.sheet.cells[key];
  if (!cell || cell.raw === '') return '';
  const raw = cell.raw;
  if (!raw.startsWith('=')) {
    if (/^-?\d+(\.\d+)?$/.test(raw)) return parseFloat(raw);
    return raw;
  }
  ctx.visiting.add(key);
  try {
    return evalExpr(raw.slice(1), ctx);
  } catch {
    return '#ERR';
  } finally {
    ctx.visiting.delete(key);
  }
}

function evalExpr(expr: string, ctx: EvalContext): any {
  const tokens = tokenize(expr);
  const ast = parse(tokens);
  return evalNode(ast, ctx);
}

type Token = { kind: 'num'; val: number } | { kind: 'str'; val: string } | { kind: 'ref'; val: string } | { kind: 'func'; val: string } | { kind: 'op'; val: string } | { kind: 'lparen' } | { kind: 'rparen' } | { kind: 'comma' } | { kind: 'colon' };

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '(') { out.push({ kind: 'lparen' }); i++; continue; }
    if (ch === ')') { out.push({ kind: 'rparen' }); i++; continue; }
    if (ch === ',') { out.push({ kind: 'comma' }); i++; continue; }
    if (ch === ':') { out.push({ kind: 'colon' }); i++; continue; }
    if ('+-*/^%&'.includes(ch)) { out.push({ kind: 'op', val: ch }); i++; continue; }
    if (ch === '<' || ch === '>' || ch === '=' || ch === '!') {
      if (s[i + 1] === '=') { out.push({ kind: 'op', val: ch + '=' }); i += 2; continue; }
      if (ch === '<' && s[i + 1] === '>') { out.push({ kind: 'op', val: '<>' }); i += 2; continue; }
      out.push({ kind: 'op', val: ch }); i++; continue;
    }
    if (ch === '"') {
      let s2 = ''; i++;
      while (i < s.length && s[i] !== '"') { s2 += s[i]; i++; }
      i++; out.push({ kind: 'str', val: s2 }); continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = ''; while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
      out.push({ kind: 'num', val: parseFloat(num) }); continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let id = ''; while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) { id += s[i]; i++; }
      if (s[i] === '(') { out.push({ kind: 'func', val: id.toUpperCase() }); continue; }
      if (/^[A-Z]+\d+$/i.test(id)) { out.push({ kind: 'ref', val: id }); continue; }
      if (id.toUpperCase() === 'TRUE') { out.push({ kind: 'num', val: 1 }); continue; }
      if (id.toUpperCase() === 'FALSE') { out.push({ kind: 'num', val: 0 }); continue; }
      out.push({ kind: 'str', val: id });
      continue;
    }
    i++;
  }
  return out;
}

type Node =
  | { kind: 'num'; val: number }
  | { kind: 'str'; val: string }
  | { kind: 'ref'; val: string }
  | { kind: 'range'; a: string; b: string }
  | { kind: 'bin'; op: string; l: Node; r: Node }
  | { kind: 'unary'; op: string; v: Node }
  | { kind: 'call'; name: string; args: Node[] };

let _p = 0;
let _toks: Token[] = [];
function peek(): Token | undefined { return _toks[_p]; }
function consume(): Token | undefined { return _toks[_p++]; }

function parse(tokens: Token[]): Node {
  _toks = tokens; _p = 0;
  return parseExpr();
}

function parseExpr(): Node { return parseCompare(); }

function parseCompare(): Node {
  let l = parseAddSub();
  while (peek()?.kind === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes((peek() as any).val)) {
    const op = (consume() as any).val;
    const r = parseAddSub();
    l = { kind: 'bin', op, l, r };
  }
  return l;
}

function parseAddSub(): Node {
  let l = parseMulDiv();
  while (peek()?.kind === 'op' && ['+', '-', '&'].includes((peek() as any).val)) {
    const op = (consume() as any).val;
    const r = parseMulDiv();
    l = { kind: 'bin', op, l, r };
  }
  return l;
}

function parseMulDiv(): Node {
  let l = parsePow();
  while (peek()?.kind === 'op' && ['*', '/'].includes((peek() as any).val)) {
    const op = (consume() as any).val;
    const r = parsePow();
    l = { kind: 'bin', op, l, r };
  }
  return l;
}

function parsePow(): Node {
  let l = parseUnary();
  while (peek()?.kind === 'op' && (peek() as any).val === '^') {
    consume();
    const r = parseUnary();
    l = { kind: 'bin', op: '^', l, r };
  }
  return l;
}

function parseUnary(): Node {
  const t = peek();
  if (t?.kind === 'op' && (t.val === '+' || t.val === '-')) {
    consume();
    return { kind: 'unary', op: t.val, v: parseUnary() };
  }
  return parseAtom();
}

function parseAtom(): Node {
  const t = consume();
  if (!t) throw new Error('eof');
  if (t.kind === 'num') return { kind: 'num', val: t.val };
  if (t.kind === 'str') return { kind: 'str', val: t.val };
  if (t.kind === 'ref') {
    if (peek()?.kind === 'colon') { consume(); const b = consume()!; return { kind: 'range', a: t.val, b: (b as any).val }; }
    return { kind: 'ref', val: t.val };
  }
  if (t.kind === 'lparen') {
    const e = parseExpr();
    consume();
    return e;
  }
  if (t.kind === 'func') {
    consume();
    const args: Node[] = [];
    if (peek()?.kind !== 'rparen') {
      args.push(parseExpr());
      while (peek()?.kind === 'comma') { consume(); args.push(parseExpr()); }
    }
    consume();
    return { kind: 'call', name: t.val, args };
  }
  throw new Error('unexpected');
}

function expandRange(a: string, b: string, ctx: EvalContext): any[] {
  const pa = refToRC(a), pb = refToRC(b);
  if (!pa || !pb) return [];
  const r0 = Math.min(pa.r, pb.r), r1 = Math.max(pa.r, pb.r);
  const c0 = Math.min(pa.c, pb.c), c1 = Math.max(pa.c, pb.c);
  const out: any[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(evalCell(r, c, ctx));
  return out;
}

function evalNode(n: Node, ctx: EvalContext): any {
  if (n.kind === 'num') return n.val;
  if (n.kind === 'str') return n.val;
  if (n.kind === 'ref') {
    const sheetRef = parseSheetRef(n.val);
    if (sheetRef) {
      const target = ctx.allSheets?.find(s => s.name === sheetRef.sheet);
      if (target) {
        const p = refToRC(sheetRef.ref);
        if (!p) return '#REF';
        const otherCtx: EvalContext = { sheet: target, visiting: ctx.visiting, allSheets: ctx.allSheets };
        return evalCell(p.r, p.c, otherCtx);
      }
      return '#REF';
    }
    const p = refToRC(n.val);
    return p ? evalCell(p.r, p.c, ctx) : '#REF';
  }
  if (n.kind === 'range') return expandRange(n.a, n.b, ctx);
  if (n.kind === 'unary') {
    const v = getNum(evalNode(n.v, ctx));
    return n.op === '-' ? -v : v;
  }
  if (n.kind === 'bin') {
    const l = evalNode(n.l, ctx);
    const r = evalNode(n.r, ctx);
    if (n.op === '&') return String(l) + String(r);
    const ln = getNum(l), rn = getNum(r);
    switch (n.op) {
      case '+': return ln + rn;
      case '-': return ln - rn;
      case '*': return ln * rn;
      case '/': return rn === 0 ? '#DIV0' : ln / rn;
      case '^': return Math.pow(ln, rn);
      case '=': return l === r || ln === rn ? 1 : 0;
      case '<>': return l === r || ln === rn ? 0 : 1;
      case '<': return ln < rn ? 1 : 0;
      case '>': return ln > rn ? 1 : 0;
      case '<=': return ln <= rn ? 1 : 0;
      case '>=': return ln >= rn ? 1 : 0;
    }
  }
  if (n.kind === 'call') {
    const args = n.args.map(a => a.kind === 'range' ? expandRange(a.a, a.b, ctx) : evalNode(a, ctx));
    return callFunc(n.name, args, ctx);
  }
  return '';
}

function flatNums(arr: any[]): number[] {
  const out: number[] = [];
  const walk = (v: any) => { if (Array.isArray(v)) for (const x of v) walk(x); else if (v !== '' && v != null && !isNaN(getNum(v))) out.push(getNum(v)); };
  for (const v of arr) walk(v);
  return out;
}

function callFunc(name: string, args: any[], _ctx: EvalContext): any {
  return callFormula(name, args);
}

function formatValue(v: any, style?: CellStyle, locale = 'en-US', currency = 'USD'): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string' && (v.startsWith('#') && v.length < 8)) return v;
  const fmt = style?.format ?? 'general';
  const dec = style?.decimals ?? 2;
  if (typeof v === 'number') {
    if (fmt === 'percent') return i18nFormatNumber(v, locale, { style: 'percent', minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (fmt === 'currency') return i18nFormatCurrency(v, locale, currency);
    if (fmt === 'date') return i18nFormatDate(new Date((v - 25569) * 86400000), locale, { dateStyle: 'medium' });
    if (fmt === 'number') return i18nFormatNumber(v, locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (Number.isInteger(v)) return i18nFormatNumber(v, locale);
    return i18nFormatNumber(v, locale, { maximumFractionDigits: 10 });
  }
  if (Array.isArray(v)) return v.map(x => formatValue(x, undefined, locale, currency)).join(', ');
  return String(v);
}

// ── Fill-series intelligence ────────────────────────────────────────────────
// Given the source cells (raw strings) the user selected before grabbing the
// fill handle, produce `count` extrapolated values. Mirrors the Sheets
// autofill: numeric step (1,2,3 / 10,20,30), date step, weekday/month names,
// "Item 1, Item 2" suffix counting, otherwise copy/cycle.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function _nameSeries(raw: string, names: string[]): { idx: number; cap: boolean; abbr: boolean } | null {
  const t = raw.trim();
  const low = t.toLowerCase();
  for (const n of names) {
    if (low === n) return { idx: names.indexOf(n), cap: t[0] === t[0]?.toUpperCase(), abbr: false };
    if (low === n.slice(0, 3)) return { idx: names.indexOf(n), cap: t[0] === t[0]?.toUpperCase(), abbr: true };
  }
  return null;
}
function _emitName(idx: number, names: string[], cap: boolean, abbr: boolean): string {
  let n = names[((idx % names.length) + names.length) % names.length];
  if (abbr) n = n.slice(0, 3);
  return cap ? n[0].toUpperCase() + n.slice(1) : n;
}

function detectFillSeries(source: string[], count: number, reverse = false): string[] {
  const out: string[] = [];
  const dir = reverse ? -1 : 1;
  const nonEmpty = source.filter(s => s.trim() !== '');
  if (nonEmpty.length === 0) return new Array(count).fill('');

  // Pure numbers → arithmetic step (default +1, or inferred from last two)
  const nums = source.map(s => (/^-?\d+(\.\d+)?$/.test(s.trim()) ? parseFloat(s.trim()) : NaN));
  if (nums.every(n => !isNaN(n)) && source.every(s => s.trim() !== '')) {
    const step = nums.length >= 2 ? nums[nums.length - 1] - nums[nums.length - 2] : 1;
    let v = reverse ? nums[0] : nums[nums.length - 1];
    for (let i = 0; i < count; i++) { v += step * dir; out.push(_fmtNum(v)); }
    return out;
  }

  // Month / weekday names
  const lastRaw = reverse ? source.find(s => s.trim() !== '')! : [...source].reverse().find(s => s.trim() !== '')!;
  for (const names of [MONTHS, DAYS]) {
    const m = _nameSeries(lastRaw, names);
    if (m) {
      let idx = m.idx;
      for (let i = 0; i < count; i++) { idx += dir; out.push(_emitName(idx, names, m.cap, m.abbr)); }
      return out;
    }
  }

  // Dates (ISO/parseable) → +1 day step. Checked BEFORE the prefix-number
  // branch so "2024-01-30" extends as a date, not by bumping "30".
  const isDateLike = (s: string) => /^\d{4}-\d{1,2}-\d{1,2}/.test(s.trim()) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s.trim());
  if (source.every(s => s.trim() !== '' && isDateLike(s))) {
    const dParsed = source.map(s => Date.parse(s.trim()));
    if (dParsed.every(d => !isNaN(d))) {
      const DAYMS = 86400000;
      const stepDays = dParsed.length >= 2 ? Math.round((dParsed[dParsed.length - 1] - dParsed[dParsed.length - 2]) / DAYMS) || 1 : 1;
      let t = reverse ? dParsed[0] : dParsed[dParsed.length - 1];
      for (let i = 0; i < count; i++) { t += stepDays * DAYMS * dir; out.push(new Date(t).toISOString().slice(0, 10)); }
      return out;
    }
  }

  // "Prefix <n>" suffix counting (Item 1, Item 2 / Q1, Q2)
  const sm = /^(.*?)(-?\d+)(\D*)$/.exec(lastRaw.trim());
  if (sm) {
    const prefix = sm[1], suffix = sm[3];
    let n = parseInt(sm[2], 10);
    // step from two trailing numeric tails if available
    let step = 1;
    const tails = source.filter(s => s.trim() !== '').map(s => { const mm = /^(.*?)(-?\d+)(\D*)$/.exec(s.trim()); return mm ? parseInt(mm[2], 10) : NaN; }).filter(x => !isNaN(x));
    if (tails.length >= 2) step = tails[tails.length - 1] - tails[tails.length - 2] || 1;
    for (let i = 0; i < count; i++) { n += step * dir; out.push(`${prefix}${n}${suffix}`); }
    return out;
  }

  // Fallback: cycle/copy the source pattern
  for (let i = 0; i < count; i++) out.push(source[i % source.length] ?? source[source.length - 1] ?? '');
  return out;
}
function _fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1e10) / 1e10);
}

// Offset relative references in a formula when copied to a new origin.
function offsetFormula(raw: string, dR: number, dC: number): string {
  if (!raw.startsWith('=')) return raw;
  return raw.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (m, dollarC, colL, dollarR, rowN) => {
    let c = letterToCol(colL);
    let r = parseInt(rowN, 10) - 1;
    if (!dollarC) c += dC;
    if (!dollarR) r += dR;
    if (c < 0 || r < 0) return m;
    return `${dollarC}${colToLetter(c)}${dollarR}${r + 1}`;
  });
}

export default function OfficeStudioPro() {
  const { guard, gate } = useUsageGate('office-studio'); // real gated key — 'text' is ungated, so the daily cap was never firing (revenue leak)
  const isPro = useIsPro();
  const policyGate = usePolicyGate();

  const maxSheetRows = () => Math.max(0, ...doc.sheets.map(s => Object.keys(s.cells).reduce((m, k) => Math.max(m, parseInt(k.replace(/[A-Z]+/g, '')) || 0), 0)));
  const checkSheetsPolicy = () => {
    const rowsHit = checkLever(POLICY_KEY, 'rows', maxSheetRows(), isPro);
    if (rowsHit) { policyGate.fire(rowsHit); return false; }
    const sheetsHit = checkLever(POLICY_KEY, 'tracks', doc.sheets.length, isPro);
    if (sheetsHit) { policyGate.fire(sheetsHit); return false; }
    return true;
  };

  const [doc, setDoc] = React.useState<DocState>(() => NEW_DOC());
  const stack = React.useRef(new UndoStack<DocState>(80));
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { stack.current.reset(cloneDoc(doc), 'init'); }, []);

  const commit = React.useCallback((label: string, next: DocState) => {
    setDoc(next);
    stack.current.push(label, cloneDoc(next));
    force();
  }, []);

  const undo = () => { const p = stack.current.undo(cloneDoc(doc)); if (p) { setDoc(p); force(); } };
  const redo = () => { const p = stack.current.redo(); if (p) { setDoc(p); force(); } };

  const sheet = doc.sheets.find(s => s.id === doc.activeSheetId) ?? doc.sheets[0];

  const evaluated = React.useMemo(() => {
    const out: Record<string, any> = {};
    const ctx: EvalContext = { sheet, visiting: new Set(), allSheets: doc.sheets };
    for (const [k, cell] of Object.entries(sheet.cells)) {
      if (!cell.raw) continue;
      const [rs, cs] = k.split('_');
      out[k] = evalCell(+rs, +cs, ctx);
    }
    return out;
  }, [sheet.cells, sheet.id, doc.sheets]);

  const [editor, setEditor] = React.useState<{ r: number; c: number; value: string } | null>(null);
  const [formulaBar, setFormulaBar] = React.useState('');
  const [busy, setBusy] = React.useState('');
  const [toast, setToast] = React.useState('');
  const [openDialog, setOpenDialog] = React.useState(false);
  const [exportDialog, setExportDialog] = React.useState(false);
  const [exportFmt, setExportFmt] = React.useState<'csv' | 'tsv' | 'json'>('csv');
  const [savedList, setSavedList] = React.useState<StudioProject[]>([]);

  // Crash-recovery: 2s-debounced snapshot of the working doc to localStorage,
  // and an amber "Recovered an unsaved session" banner if a fresh one exists on
  // mount. Weaponizes the rival's #1 complaint ("lost my work / network errors
  // blocking files"). serialize/deserialize reuse the same plain-JSON shape the
  // Library save path already uses (newProject('office', doc.name, doc)).
  const RECOVERY_KEY = 'office-studio:recovery';
  const [recovery, setRecovery] = React.useState<{ doc: DocState; ts: number } | null>(null);
  const lastSnapshot = React.useRef('');
  const recoveryDismissed = React.useRef(false);

  // Autofill ("fill handle") drag state + post-fill options chip.
  const [fillDrag, setFillDrag] = React.useState<{ toR: number; toC: number } | null>(null);
  const [fillChip, setFillChip] = React.useState<{ r0: number; c0: number; r1: number; c1: number; srcR0: number; srcC0: number; srcR1: number; srcC1: number; mode: 'series' | 'copy' | 'format' } | null>(null);

  const sel = doc.selection;
  const selCell = sheet.cells[cellKey(sel.r, sel.c)];
  // Sync the formula bar with the selected cell. Includes `selCell?.raw` in
  // the dep list so typing into a cell updates the formula bar; previously
  // only selection changes triggered an update, so the formula bar showed a
  // stale value while the user edited.
  React.useEffect(() => { setFormulaBar(selCell?.raw ?? ''); }, [sel.r, sel.c, sel.r2, sel.c2, sheet.id, selCell?.raw]);

  const toastFor = (m: string) => { pushToast(m); };

  const setCellRaw = (r: number, c: number, raw: string) => {
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    const key = cellKey(r, c);
    if (!raw) delete sh.cells[key];
    else sh.cells[key] = { ...(sh.cells[key] ?? {}), raw };
    commit('cell', next);
  };

  const updateStyle = (mut: (s: CellStyle) => void) => {
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    const r0 = Math.min(sel.r, sel.r2), r1 = Math.max(sel.r, sel.r2);
    const c0 = Math.min(sel.c, sel.c2), c1 = Math.max(sel.c, sel.c2);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = cellKey(r, c);
      const cell = sh.cells[k] ?? { raw: '' };
      const newStyle: CellStyle = { ...(cell.style ?? {}) };
      mut(newStyle);
      sh.cells[k] = { ...cell, style: newStyle };
    }
    commit('style', next);
  };

  // ── Crash recovery: check for a snapshot once on mount ────────────────────
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(RECOVERY_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as { doc: DocState; ts: number };
      const fresh = Date.now() - snap.ts < 7 * 24 * 3600 * 1000; // <7d
      const hasContent = snap.doc?.sheets?.some(s => Object.keys(s.cells ?? {}).length > 0);
      if (fresh && hasContent) setRecovery(snap);
      else window.localStorage.removeItem(RECOVERY_KEY);
    } catch { /* corrupt snapshot — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced (2s) autosave of the working doc. Skips the untouched blank doc so
  // we never resurrect an empty session.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasContent = doc.sheets.some(s => Object.keys(s.cells).length > 0);
    if (!hasContent) return;
    const t = window.setTimeout(() => {
      try {
        const payload = JSON.stringify({ doc, ts: Date.now() });
        if (payload === lastSnapshot.current) return;
        lastSnapshot.current = payload;
        window.localStorage.setItem(RECOVERY_KEY, payload);
      } catch { /* quota — ignore */ }
    }, 2000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const restoreRecovery = () => {
    if (!recovery) return;
    const restored = cloneDoc(recovery.doc);
    setDoc(restored);
    stack.current.reset(cloneDoc(restored), 'restore');
    setRecovery(null);
    force();
    toastFor('Session restored');
  };
  const dismissRecovery = () => {
    recoveryDismissed.current = true;
    setRecovery(null);
    try { window.localStorage.removeItem(RECOVERY_KEY); } catch {}
  };

  // ── OS clipboard: copy / cut / paste tabular data ─────────────────────────
  const selectionAsTsv = (cut = false): { tsv: string; next?: DocState } => {
    const rr0 = Math.min(sel.r, sel.r2), rr1 = Math.max(sel.r, sel.r2);
    const cc0 = Math.min(sel.c, sel.c2), cc1 = Math.max(sel.c, sel.c2);
    const lines: string[] = [];
    const next = cut ? cloneDoc(doc) : undefined;
    const sh = next?.sheets.find(s => s.id === sheet.id);
    for (let r = rr0; r <= rr1; r++) {
      const row: string[] = [];
      for (let c = cc0; c <= cc1; c++) {
        row.push(sheet.cells[cellKey(r, c)]?.raw ?? '');
        if (sh) delete sh.cells[cellKey(r, c)];
      }
      lines.push(row.join('\t'));
    }
    return { tsv: lines.join('\n'), next };
  };

  const writeClipboard = (text: string) => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
  };

  const copySelection = () => { const { tsv } = selectionAsTsv(false); writeClipboard(tsv); toastFor('Copied'); };
  const cutSelection = () => {
    const { tsv, next } = selectionAsTsv(true);
    writeClipboard(tsv);
    if (next) commit('cut', next);
    toastFor('Cut');
  };

  const pasteTsvAt = (text: string, baseR: number, baseC: number) => {
    if (!text) return;
    // Detect TSV vs CSV; tab is the spreadsheet-interop default.
    const sep = text.includes('\t') ? '\t' : (text.includes(',') && !/^[^,\n]*$/.test(text) ? ',' : '\t');
    const rows = sep === ',' ? parseCSV(text, ',') : text.replace(/\r/g, '').split('\n').map(l => l.split('\t'));
    while (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();
    if (!rows.length) return;
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    let maxR = baseR, maxC = baseC;
    for (let i = 0; i < rows.length; i++) {
      for (let j = 0; j < rows[i].length; j++) {
        const r = baseR + i, c = baseC + j;
        const v = rows[i][j];
        if (v === '' || v == null) { delete sh.cells[cellKey(r, c)]; continue; }
        sh.cells[cellKey(r, c)] = { ...(sh.cells[cellKey(r, c)] ?? {}), raw: v };
        if (r > maxR) maxR = r; if (c > maxC) maxC = c;
      }
    }
    sh.rows = Math.max(sh.rows, maxR + 5);
    sh.cols = Math.max(sh.cols, maxC + 2);
    next.selection = { r: baseR, c: baseC, r2: maxR, c2: maxC };
    commit('paste', next);
    toastFor(`Pasted ${rows.length}×${rows[0]?.length ?? 0}`);
  };

  // ── Fill operations ───────────────────────────────────────────────────────
  // Build the source matrix the user selected, then extend it `count` rows
  // (down) or cols (right) using series intelligence; preserves styles.
  const applyFill = React.useCallback((
    srcR0: number, srcC0: number, srcR1: number, srcC1: number,
    toR: number, toC: number, mode: 'series' | 'copy' | 'format',
  ) => {
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    const down = toR > srcR1;
    const right = toC > srcC1;
    if (!down && !right) return;
    // Formulas always extend by offsetting their relative references — both in
    // copy and series mode — never by naively bumping a digit.
    const isFormulaCol = (vals: string[]) => vals.some(v => v.startsWith('='));
    if (down) {
      for (let c = srcC0; c <= srcC1; c++) {
        const colSrc: string[] = [];
        for (let r = srcR0; r <= srcR1; r++) colSrc.push(sh.cells[cellKey(r, c)]?.raw ?? '');
        const formulaSrc = isFormulaCol(colSrc);
        const count = toR - srcR1;
        const filled = mode === 'series' && !formulaSrc ? detectFillSeries(colSrc, count) : null;
        for (let i = 1; i <= count; i++) {
          const r = srcR1 + i;
          const srcRowIdx = srcR0 + ((i - 1) % colSrc.length);
          const srcCell = sh.cells[cellKey(srcRowIdx, c)];
          const style = srcCell?.style ? { ...srcCell.style } : undefined;
          if (mode === 'format') { if (style) sh.cells[cellKey(r, c)] = { ...(sh.cells[cellKey(r, c)] ?? { raw: '' }), style }; continue; }
          let raw = filled ? filled[i - 1] : (colSrc[(i - 1) % colSrc.length] ?? '');
          if (raw.startsWith('=')) raw = offsetFormula(raw, r - srcRowIdx, 0);
          if (raw === '') delete sh.cells[cellKey(r, c)];
          else sh.cells[cellKey(r, c)] = { raw, style };
        }
      }
    } else {
      for (let r = srcR0; r <= srcR1; r++) {
        const rowSrc: string[] = [];
        for (let c = srcC0; c <= srcC1; c++) rowSrc.push(sh.cells[cellKey(r, c)]?.raw ?? '');
        const formulaSrc = isFormulaCol(rowSrc);
        const count = toC - srcC1;
        const filled = mode === 'series' && !formulaSrc ? detectFillSeries(rowSrc, count) : null;
        for (let i = 1; i <= count; i++) {
          const c = srcC1 + i;
          const srcColIdx = srcC0 + ((i - 1) % rowSrc.length);
          const srcCell = sh.cells[cellKey(r, srcColIdx)];
          const style = srcCell?.style ? { ...srcCell.style } : undefined;
          if (mode === 'format') { if (style) sh.cells[cellKey(r, c)] = { ...(sh.cells[cellKey(r, c)] ?? { raw: '' }), style }; continue; }
          let raw = filled ? filled[i - 1] : (rowSrc[(i - 1) % rowSrc.length] ?? '');
          if (raw.startsWith('=')) raw = offsetFormula(raw, 0, c - srcColIdx);
          if (raw === '') delete sh.cells[cellKey(r, c)];
          else sh.cells[cellKey(r, c)] = { raw, style };
        }
      }
    }
    next.selection = { r: srcR0, c: srcC0, r2: toR, c2: toC };
    commit('fill', next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, sheet.id]);

  // Drop the fill handle: commit the fill and show the autofill-options chip.
  const commitFillDrag = (toR: number, toC: number) => {
    const sr0 = Math.min(sel.r, sel.r2), sr1 = Math.max(sel.r, sel.r2);
    const sc0 = Math.min(sel.c, sel.c2), sc1 = Math.max(sel.c, sel.c2);
    const down = toR > sr1, right = toC > sc1;
    if (!down && !right) { setFillDrag(null); return; }
    // Constrain to a single axis (whichever the user dragged further).
    const tR = down ? toR : sr1;
    const tC = right && !down ? toC : sc1;
    applyFill(sr0, sc0, sr1, sc1, tR, tC, 'series');
    setFillChip({ r0: sr0, c0: sc0, r1: down ? tR : sr1, c1: right && !down ? tC : sc1, srcR0: sr0, srcC0: sc0, srcR1: sr1, srcC1: sc1, mode: 'series' });
    setFillDrag(null);
  };

  // Double-click the handle: fill down to the extent of the adjacent column.
  const fillDownToData = () => {
    const sr0 = Math.min(sel.r, sel.r2), sr1 = Math.max(sel.r, sel.r2);
    const sc0 = Math.min(sel.c, sel.c2), sc1 = Math.max(sel.c, sel.c2);
    // probe the column just left of the selection (or right if at col 0)
    const probe = sc0 > 0 ? sc0 - 1 : sc1 + 1;
    let end = sr1;
    for (let r = sr1 + 1; r < sheet.rows; r++) {
      if ((sheet.cells[cellKey(r, probe)]?.raw ?? '') === '') break;
      end = r;
    }
    if (end <= sr1) { toastFor('No adjacent data to fill into'); return; }
    applyFill(sr0, sc0, sr1, sc1, end, sc1, 'series');
    setFillChip({ r0: sr0, c0: sc0, r1: end, c1: sc1, srcR0: sr0, srcC0: sc0, srcR1: sr1, srcC1: sc1, mode: 'series' });
  };

  const changeFillMode = (mode: 'series' | 'copy' | 'format') => {
    if (!fillChip) return;
    applyFill(fillChip.srcR0, fillChip.srcC0, fillChip.srcR1, fillChip.srcC1, fillChip.r1, fillChip.c1, mode);
    setFillChip({ ...fillChip, mode });
  };

  // Ctrl+D / Ctrl+R / Ctrl+Enter fills.
  const fillDownShortcut = () => {
    const sr0 = Math.min(sel.r, sel.r2), sr1 = Math.max(sel.r, sel.r2);
    const sc0 = Math.min(sel.c, sel.c2), sc1 = Math.max(sel.c, sel.c2);
    if (sr1 <= sr0) { toastFor('Select a range spanning multiple rows'); return; }
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    for (let c = sc0; c <= sc1; c++) {
      const top = sh.cells[cellKey(sr0, c)];
      for (let r = sr0 + 1; r <= sr1; r++) {
        if (!top) { delete sh.cells[cellKey(r, c)]; continue; }
        const raw = top.raw.startsWith('=') ? offsetFormula(top.raw, r - sr0, 0) : top.raw;
        sh.cells[cellKey(r, c)] = { raw, style: top.style ? { ...top.style } : undefined };
      }
    }
    commit('fill down', next);
  };
  const fillRightShortcut = () => {
    const sr0 = Math.min(sel.r, sel.r2), sr1 = Math.max(sel.r, sel.r2);
    const sc0 = Math.min(sel.c, sel.c2), sc1 = Math.max(sel.c, sel.c2);
    if (sc1 <= sc0) { toastFor('Select a range spanning multiple columns'); return; }
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    for (let r = sr0; r <= sr1; r++) {
      const left = sh.cells[cellKey(r, sc0)];
      for (let c = sc0 + 1; c <= sc1; c++) {
        if (!left) { delete sh.cells[cellKey(r, c)]; continue; }
        const raw = left.raw.startsWith('=') ? offsetFormula(left.raw, 0, c - sc0) : left.raw;
        sh.cells[cellKey(r, c)] = { raw, style: left.style ? { ...left.style } : undefined };
      }
    }
    commit('fill right', next);
  };

  const beginEdit = (r: number, c: number, prefill?: string) => {
    const cur = sheet.cells[cellKey(r, c)]?.raw ?? '';
    setEditor({ r, c, value: prefill ?? cur });
  };

  // Returns true if the value was committed, false if a validation rule with
  // showError rejected it (the editor is kept open so the user can fix it).
  const commitEdit = (): boolean => {
    if (!editor) return true;
    // Enforce data-validation rules on entry (was: rules were built in the
    // dialog but never checked, so the feature did nothing). showError=true
    // rejects the entry and keeps the editor open; showError=false warns but
    // still writes. Blank entries are allowed through so a cell can be cleared.
    const rule = dataValidationModel.current.forCell(editor.r, editor.c);
    if (rule && String(editor.value ?? '').trim() !== '') {
      const res = dataValidationModel.current.validate(editor.value, rule);
      if (!res.ok) {
        const msg = res.message ?? rule.message ?? 'Value does not meet the validation rule';
        if (rule.showError) {
          setValidationError(msg);
          window.setTimeout(() => setValidationError(null), 3500);
          return false; // reject — keep the editor open so the user can fix it
        }
        // warn-only: surface the message but allow the value through
        setValidationError(`Warning: ${msg}`);
        window.setTimeout(() => setValidationError(null), 3500);
      }
    }
    setCellRaw(editor.r, editor.c, editor.value);
    setEditor(null);
    return true;
  };

  const moveSelection = (dr: number, dc: number, extend = false) => {
    if (editor && !commitEdit()) return; // rejected by validation — stay put
    setDoc(d => {
      const sh = d.sheets.find(s => s.id === d.activeSheetId)!;
      const r = Math.max(0, Math.min(sh.rows - 1, d.selection.r + dr));
      const c = Math.max(0, Math.min(sh.cols - 1, d.selection.c + dc));
      return { ...d, selection: extend ? { ...d.selection, r2: r, c2: c } : { r, c, r2: r, c2: c } };
    });
  };

  const selectCell = (r: number, c: number, extend = false) => {
    if (editor && !commitEdit()) return; // rejected by validation — stay put
    setDoc(d => extend ? { ...d, selection: { ...d.selection, r2: r, c2: c } } : { ...d, selection: { r, c, r2: r, c2: c } });
  };

  // Ctrl+Arrow: rocket to the edge of the contiguous data block in a direction
  // (Sheets/Excel parity). From inside data → jump to last filled cell before a
  // gap; from a gap → jump to the next filled cell.
  const jumpToEdge = (dr: number, dc: number, extend = false) => {
    if (editor && !commitEdit()) return; // rejected by validation — stay put
    const sh = sheet;
    const filled = (r: number, c: number) => (sh.cells[cellKey(r, c)]?.raw ?? '') !== '';
    let r = extend ? sel.r2 : sel.r;
    let c = extend ? sel.c2 : sel.c;
    const inData = filled(r + dr, c + dc);
    const maxR = sh.rows - 1, maxC = sh.cols - 1;
    if (inData) {
      // walk while next cell is filled; stop at the last filled before a gap
      while (r + dr >= 0 && r + dr <= maxR && c + dc >= 0 && c + dc <= maxC && filled(r + dr, c + dc)) { r += dr; c += dc; }
    } else {
      // skip the gap to the next filled cell (or sheet edge)
      let moved = false;
      while (r + dr >= 0 && r + dr <= maxR && c + dc >= 0 && c + dc <= maxC) { r += dr; c += dc; moved = true; if (filled(r, c)) break; }
      if (!moved) return;
    }
    setDoc(d => extend ? { ...d, selection: { ...d.selection, r2: r, c2: c } } : { ...d, selection: { r, c, r2: r, c2: c } });
  };

  const addSheet = () => {
    const next = cloneDoc(doc);
    const s = newSheet(`Sheet ${next.sheets.length + 1}`);
    next.sheets.push(s);
    next.activeSheetId = s.id;
    commit('add sheet', next);
  };
  const removeSheet = (id: string) => {
    if (doc.sheets.length <= 1) return;
    const next = cloneDoc(doc);
    next.sheets = next.sheets.filter(s => s.id !== id);
    if (next.activeSheetId === id) next.activeSheetId = next.sheets[0].id;
    commit('remove sheet', next);
  };

  const importXlsxFile = async (file: File) => {
    setRecovery(null); // opening a real workbook supersedes the recover-last-session offer
    // Opening a workbook is FREE (like Excel/Sheets) — the credit is charged on
    // Export, not on loading a file to view/edit it.
    setBusy('Opening .xlsx…');
    try {
      const wb = await importXlsx(file);
      const next: DocState = {
        ...cloneDoc(doc),
        name: wb.name,
        sheets: wb.sheets.map(s => ({ id: nid(), name: s.name.slice(0, 31), cells: s.cells, cols: s.cols, rows: s.rows, colWidths: {}, rowHeights: {} })),
      };
      next.activeSheetId = next.sheets[0]?.id ?? doc.activeSheetId;
      commit('import xlsx', next);
      toastFor(`Opened ${wb.sheets.length} sheet${wb.sheets.length === 1 ? '' : 's'}`);
    } catch (e) {
      toastFor((e as Error).message || 'Could not open file');
    } finally { setBusy(''); }
  };

  const exportXlsxFile = async () => {
    if (!checkSheetsPolicy()) return;
    if (!(await guard())) return;
    setBusy('Saving .xlsx…');
    try {
      const wb: XlsxWorkbookData = {
        name: doc.name,
        sheets: doc.sheets.map(s => ({
          name: s.name,
          cells: Object.fromEntries(Object.entries(s.cells).map(([k, c]) => [k, { raw: c.raw }])),
          cols: s.cols, rows: s.rows,
        })),
      };
      const blob = await exportXlsx(wb);
      downloadBlob(blob, `${safeFilename(doc.name)}.xlsx`);
      toastFor('Saved .xlsx');
    } catch (e) {
      toastFor((e as Error).message || 'Save failed');
    } finally { setBusy(''); }
  };

  const importCsv = async (file: File) => {
    setRecovery(null); // importing a real CSV supersedes the recover-last-session offer
    // Importing CSV is FREE — the credit is charged on Export.
    setBusy('Importing…');
    try {
      const text = await file.text();
      const tab = text.includes('\t') && !text.includes(',');
      const rows = parseCSV(text, tab ? '\t' : ',');
      const next = cloneDoc(doc);
      const sh = next.sheets.find(s => s.id === sheet.id)!;
      sh.cells = {};
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
        const v = rows[r][c]?.trim();
        if (v) sh.cells[cellKey(r, c)] = { raw: v };
      }
      sh.rows = Math.max(sh.rows, rows.length + 5);
      sh.cols = Math.max(sh.cols, Math.max(...rows.map(r => r.length)) + 2);
      commit('import csv', next);
      toastFor(`Imported ${rows.length} rows`);
    } catch (e) {
      toastFor((e as Error).message || 'Import failed');
    } finally { setBusy(''); }
  };

  const exportNow = () => {
    if (!checkSheetsPolicy()) return;
    if (exportFmt === 'json') {
      const data = doc.sheets.map(s => {
        const out: Record<string, any> = { name: s.name, cells: {} };
        for (const [k, cell] of Object.entries(s.cells)) {
          const [r, c] = k.split('_').map(Number);
          const ref = colToLetter(c) + (r + 1);
          out.cells[ref] = { raw: cell.raw, value: evaluated[k] ?? '' };
        }
        return out;
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `${safeFilename(doc.name)}.json`);
    } else {
      const sep = exportFmt === 'tsv' ? '\t' : ',';
      let maxR = 0, maxC = 0;
      for (const k of Object.keys(sheet.cells)) {
        const [r, c] = k.split('_').map(Number);
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
      const rows: string[][] = [];
      for (let r = 0; r <= maxR; r++) {
        const row: string[] = [];
        for (let c = 0; c <= maxC; c++) {
          const v = formatValue(evaluated[cellKey(r, c)] ?? sheet.cells[cellKey(r, c)]?.raw ?? '', sheet.cells[cellKey(r, c)]?.style);
          row.push(csvEscape(v, sep));
        }
        rows.push(row);
      }
      const blob = new Blob([rows.map(r => r.join(sep)).join('\n')], { type: 'text/csv' });
      downloadBlob(blob, `${safeFilename(doc.name)}.${exportFmt}`);
    }
    toastFor('Exported');
    setExportDialog(false);
  };

  const saveCurrent = async () => {
    setBusy('Saving…');
    try {
      const proj = newProject('office', doc.name, doc);
      await saveProject(proj);
      toastFor('Saved');
    } finally { setBusy(''); }
  };

  const openSaved = async () => {
    const list = await listProjects('office');
    setSavedList(list);
    setOpenDialog(true);
  };

  const loadFromLibrary = async (id: string) => {
    setBusy('Opening…');
    try {
      const p = await loadProject<DocState>(id);
      if (!p) return;
      setDoc(p.state);
      stack.current.reset(cloneDoc(p.state), 'open');
      setOpenDialog(false);
    } finally { setBusy(''); }
  };

  useRegisterShortcuts([
    {
      label: 'File',
      items: [
        { combo: 'mod+s', description: 'Save' },
        { combo: 'mod+e', description: 'Export' },
        { combo: 'mod+o', description: 'Open library' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { combo: 'mod+z', description: 'Undo' },
        { combo: 'mod+shift+z', description: 'Redo' },
        { combo: 'mod+c', description: 'Copy' },
        { combo: 'mod+x', description: 'Cut' },
        { combo: 'mod+v', description: 'Paste (splits tabular data into cells)' },
        { combo: 'mod+d', description: 'Fill down' },
        { combo: 'mod+r', description: 'Fill right' },
        { combo: 'mod+enter', description: 'Fill selection' },
        { combo: 'enter', description: 'Edit current cell' },
        { combo: 'delete', description: 'Clear selection' },
      ],
    },
    {
      label: 'Format',
      items: [
        { combo: 'mod+b', description: 'Bold' },
        { combo: 'mod+i', description: 'Italic' },
      ],
    },
    {
      label: 'Navigation',
      items: [
        { combo: 'arrows', description: 'Move selection' },
        { combo: 'shift+arrows', description: 'Extend selection' },
        { combo: 'mod+arrows', description: 'Jump to data edge' },
        { combo: 'mod+shift+arrows', description: 'Extend to data edge' },
        { combo: 'tab', description: 'Next cell' },
        { combo: 'enter', description: 'Edit / commit' },
      ],
    },
  ]);

  useShortcuts([
    { combo: 'mod+z', handler: undo },
    { combo: 'mod+shift+z', handler: redo },
    { combo: 'mod+s', handler: () => { void saveCurrent(); } },
    { combo: 'mod+e', handler: () => setExportDialog(true) },
    { combo: 'mod+o', handler: () => { void openSaved(); } },
    { combo: 'mod+b', handler: () => updateStyle(s => { s.bold = !s.bold; }) },
    { combo: 'mod+i', handler: () => updateStyle(s => { s.italic = !s.italic; }) },
  ]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editor) return;
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl+D / Ctrl+R fills, Ctrl+Enter fill-selection
      if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); fillDownShortcut(); return; }
      if (mod && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); fillRightShortcut(); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); fillDownShortcut(); return; }
      // Ctrl+Arrow → data-edge jump (Ctrl+Shift+Arrow extends)
      if (mod && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.key === 'ArrowUp' ? [-1, 0] : e.key === 'ArrowDown' ? [1, 0] : e.key === 'ArrowLeft' ? [0, -1] : [0, 1];
        jumpToEdge(d[0], d[1], e.shiftKey);
        return;
      }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1, 0, e.shiftKey); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1, 0, e.shiftKey); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveSelection(0, -1, e.shiftKey); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveSelection(0, 1, e.shiftKey); }
      else if (e.key === 'Home') { e.preventDefault(); selectCell(mod ? 0 : sel.r, 0, e.shiftKey); }
      else if (e.key === 'End') { e.preventDefault(); jumpToEdge(0, 1, e.shiftKey); }
      else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); beginEdit(sel.r, sel.c); }
      else if (e.key === 'Tab') { e.preventDefault(); moveSelection(0, e.shiftKey ? -1 : 1); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const next = cloneDoc(doc);
        const sh = next.sheets.find(s => s.id === sheet.id)!;
        const r0 = Math.min(sel.r, sel.r2), r1 = Math.max(sel.r, sel.r2);
        const c0 = Math.min(sel.c, sel.c2), c1 = Math.max(sel.c, sel.c2);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) delete sh.cells[cellKey(r, c)];
        commit('clear', next);
      }
      else if (mod && (e.key === 'c' || e.key === 'C')) { /* handled by copy listener */ }
      else if (mod && (e.key === 'x' || e.key === 'X')) { /* handled by cut listener */ }
      else if (mod && (e.key === 'v' || e.key === 'V')) { /* handled by paste listener */ }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        beginEdit(sel.r, sel.c, e.key);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doc, sheet, sel.r, sel.c, sel.r2, sel.c2]);

  // OS-clipboard listeners. Run on the document so a paste from Excel/Sheets
  // lands in the grid; ignore while the user types in an input/textarea/editor.
  React.useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onCopy = (e: ClipboardEvent) => {
      if (editor || isTyping(e.target)) return;
      const { tsv } = selectionAsTsv(false);
      if (e.clipboardData) { e.clipboardData.setData('text/plain', tsv); e.preventDefault(); toastFor('Copied'); }
    };
    const onCut = (e: ClipboardEvent) => {
      if (editor || isTyping(e.target)) return;
      const { tsv, next } = selectionAsTsv(true);
      if (e.clipboardData) { e.clipboardData.setData('text/plain', tsv); e.preventDefault(); if (next) commit('cut', next); toastFor('Cut'); }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (editor || isTyping(e.target)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      e.preventDefault();
      pasteTsvAt(text, sel.r, sel.c);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, doc, sheet, sel.r, sel.c, sel.r2, sel.c2]);

  const r0 = Math.min(sel.r, sel.r2), r1 = Math.max(sel.r, sel.r2);
  const c0 = Math.min(sel.c, sel.c2), c1 = Math.max(sel.c, sel.c2);

  const selectionValues = React.useMemo(() => {
    const out: any[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const v = evaluated[cellKey(r, c)] ?? sheet.cells[cellKey(r, c)]?.raw ?? '';
      out.push(v);
    }
    return out;
  }, [r0, c0, r1, c1, evaluated, sheet.cells]);

  const selectionType = React.useMemo(() => detectColumnType(selectionValues), [selectionValues]);

  const selectionSummary = React.useMemo(() => {
    if (r0 === r1 && c0 === c1) return '';
    const vals: number[] = [];
    let count = 0;
    for (const v of selectionValues) {
      if (v !== '') count++;
      const n = getNum(v);
      if (!isNaN(n) && v !== '') vals.push(n);
    }
    if (!vals.length) return `Count: ${count} · Type: ${selectionType}`;
    const sum = vals.reduce((s, n) => s + n, 0);
    return `Sum: ${sum.toFixed(2)} · Avg: ${(sum / vals.length).toFixed(2)} · Count: ${count} · ${selectionType}`;
  }, [selectionValues, selectionType, r0, c0, r1, c1]);

  const markOutliers = () => {
    if (r0 === r1 && c0 === c1) { toastFor('Select a range first'); return; }
    const idx = findOutliers(selectionValues);
    if (!idx.length) { toastFor('No outliers found'); return; }
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    const w = c1 - c0 + 1;
    for (const i of idx) {
      const r = r0 + Math.floor(i / w);
      const c = c0 + (i % w);
      const k = cellKey(r, c);
      sh.cells[k] = { ...(sh.cells[k] ?? { raw: '' }), style: { ...(sh.cells[k]?.style ?? {}), bg: '#fef08a', color: '#7c2d12' } };
    }
    commit('mark outliers', next);
    toastFor(`Highlighted ${idx.length} outlier${idx.length === 1 ? '' : 's'}`);
  };

  const [pivotDialog, setPivotDialog] = React.useState(false);
  const [chartDialog, setChartDialog] = React.useState(false);
  const [condDialog, setCondDialog] = React.useState(false);
  const commentsModel = React.useRef<CommentsModel>(new CommentsModel());
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [showCommentsPanel, setShowCommentsPanel] = React.useState(false);
  const [commentCellAnchor, setCommentCellAnchor] = React.useState<CommentAnchor | null>(null);
  const [commentAuthor, setCommentAuthor] = React.useState('Me');
  const commentColor = React.useMemo(() => pickPeerColor(commentAuthor), [commentAuthor]);

  const namedRangesModel = React.useRef<NamedRangesModel>(new NamedRangesModel());
  const [namedRanges, setNamedRanges] = React.useState<NamedRange[]>([]);
  const [showNamedRangesDialog, setShowNamedRangesDialog] = React.useState(false);
  const dataValidationModel = React.useRef<DataValidationModel>(new DataValidationModel());
  const [dvRules, setDvRules] = React.useState<DataValidationRule[]>([]);
  const [showDvDialog, setShowDvDialog] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    return namedRangesModel.current.onChange(setNamedRanges);
  }, []);
  React.useEffect(() => {
    return dataValidationModel.current.onChange(setDvRules);
  }, []);

  const [sheetsWelcomed, setSheetsWelcomed] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setSheetsWelcomed(sessionStorage.getItem('sheets-studio-welcomed') === '1');
  }, []);
  const dismissSheetsWelcome = React.useCallback(() => {
    setSheetsWelcomed(true);
    try { sessionStorage.setItem('sheets-studio-welcomed', '1'); } catch {}
  }, []);

  React.useEffect(() => {
    return commentsModel.current.onChange(s => setComments([...s.comments]));
  }, []);

  const addComment = (anchor: CommentAnchor, text: string) => {
    commentsModel.current.add(anchor, commentAuthor, commentColor, text);
  };
  const replyComment = (parentId: string, text: string) => {
    commentsModel.current.reply(parentId, commentAuthor, commentColor, text);
  };
  const cellComments = (r: number, c: number) => {
    return commentsModel.current.threadFor({ kind: 'cell', sheetId: sheet.id, r, c });
  };

  const makePivot = (rowCol: number, valueCol: number, agg: Agg, byCol?: number) => {
    if (r0 === r1 && c0 === c1) { toastFor('Select the data range first'); return; }
    const w = c1 - c0 + 1;
    const rows: any[][] = [];
    const headers: string[] = [];
    for (let c = c0; c <= c1; c++) {
      const headerCell = sheet.cells[cellKey(r0, c)];
      headers.push(headerCell?.raw ?? colToLetter(c));
    }
    for (let r = r0 + 1; r <= r1; r++) {
      const row: any[] = [];
      for (let c = c0; c <= c1; c++) row.push(evaluated[cellKey(r, c)] ?? sheet.cells[cellKey(r, c)]?.raw ?? '');
      rows.push(row);
    }
    const config: PivotConfig = {
      rows: [rowCol],
      cols: byCol != null ? [byCol] : [],
      values: [{ col: valueCol, agg }],
    };
    const pivot = buildPivot(rows, headers, config);
    const layout = pivotToCells(pivot, config);
    const next = cloneDoc(doc);
    const newSheet = { id: nid(), name: `Pivot ${next.sheets.length + 1}`, cells: layout.cells, cols: Math.max(layout.cols, 26), rows: Math.max(layout.rows, 30), colWidths: {}, rowHeights: {} };
    next.sheets.push(newSheet);
    next.activeSheetId = newSheet.id;
    commit('pivot table', next);
    setPivotDialog(false);
    toastFor('Pivot table created in new sheet');
  };

  const makeChart = (type: ChartType, title: string) => {
    if (r0 === r1 || c0 === c1) { toastFor('Select a data range with headers'); return; }
    const labels: string[] = [];
    for (let r = r0 + 1; r <= r1; r++) labels.push(String(sheet.cells[cellKey(r, c0)]?.raw ?? r + 1));
    const series: { name: string; values: number[] }[] = [];
    for (let c = c0 + 1; c <= c1; c++) {
      const name = String(sheet.cells[cellKey(r0, c)]?.raw ?? colToLetter(c));
      const values: number[] = [];
      for (let r = r0 + 1; r <= r1; r++) values.push(getNum(evaluated[cellKey(r, c)] ?? sheet.cells[cellKey(r, c)]?.raw ?? 0));
      series.push({ name, values });
    }
    const config: ChartConfig = { type, title, labels, series, showLegend: true, showGrid: true };
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    sh.charts = [...(sh.charts ?? []), { id: nid(), config, x: 60 + (sh.charts?.length ?? 0) * 30, y: 60 + (sh.charts?.length ?? 0) * 30, w: 520, h: 320 }];
    commit('chart', next);
    setChartDialog(false);
    toastFor('Chart created');
  };

  const applyCondFormat = (rule: CondRule) => {
    if (r0 === r1 && c0 === c1) { toastFor('Select a range first'); return; }
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    sh.condFormats = [...(sh.condFormats ?? []), { r0, c0, r1, c1, rules: [rule] }];
    commit('cond format', next);
    setCondDialog(false);
    toastFor('Format applied');
  };

  const clearChart = (chartId: string) => {
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    sh.charts = (sh.charts ?? []).filter(c => c.id !== chartId);
    commit('remove chart', next);
  };

  const freezePanes = (r: number, c: number) => {
    const next = cloneDoc(doc);
    next.freeze = { ...(next.freeze ?? {}) };
    if (next.freeze[sheet.id] && next.freeze[sheet.id].rows === r && next.freeze[sheet.id].cols === c) {
      delete next.freeze[sheet.id];
      toastFor('Freeze cleared');
    } else {
      next.freeze[sheet.id] = { rows: r, cols: c };
      toastFor(`Freeze: ${r} row${r === 1 ? '' : 's'}, ${c} col${c === 1 ? '' : 's'}`);
    }
    commit('freeze', next);
  };

  const insertSparkline = () => {
    if (r0 === r1 && c0 === c1) { toastFor('Select a range of numbers first'); return; }
    const values: number[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const v = evaluated[cellKey(r, c)] ?? sheet.cells[cellKey(r, c)]?.raw ?? '';
      const n = getNum(v);
      if (!isNaN(n)) values.push(n);
    }
    if (!values.length) { toastFor('No numeric values'); return; }
    const targetR = r1 + 1;
    const targetC = c0;
    if (targetR >= sheet.rows) { toastFor('Add more rows below'); return; }
    const formula = `=SPARK(${colToLetter(c0)}${r0 + 1}:${colToLetter(c1)}${r1 + 1},"line")`;
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    sh.cells[cellKey(targetR, targetC)] = { raw: formula };
    commit('sparkline', next);
    toastFor(`Sparkline inserted at ${colToLetter(targetC)}${targetR + 1}`);
  };

  const runSmartFill = () => {
    if (sel.r >= sheet.rows - 2) { toastFor('Need more rows below'); return; }
    const sourceCol = sel.c;
    const exampleRows: number[] = [];
    for (let r = 0; r < sel.r; r++) {
      const v = sheet.cells[cellKey(r, sourceCol)]?.raw;
      if (v && String(v).trim()) exampleRows.push(r);
    }
    if (exampleRows.length < 1) { toastFor('Add at least one example in the column'); return; }
    const examples = exampleRows.map(r => String(sheet.cells[cellKey(r, sourceCol)]?.raw ?? ''));
    const targets = exampleRows.map(r => String(sheet.cells[cellKey(r, Math.max(0, sourceCol - 1))]?.raw ?? ''));
    const filled = smartFill(examples, targets);
    if (filled[0] !== examples[0]) { toastFor('Could not detect a pattern'); return; }
    const next = cloneDoc(doc);
    const sh = next.sheets.find(s => s.id === sheet.id)!;
    let added = 0;
    for (let r = sel.r; r < sheet.rows; r++) {
      const target = String(sh.cells[cellKey(r, Math.max(0, sourceCol - 1))]?.raw ?? '');
      if (!target) continue;
      const inferred = smartFill(examples, [target])[0];
      if (inferred && inferred !== target) {
        sh.cells[cellKey(r, sourceCol)] = { raw: inferred };
        added++;
      }
    }
    commit('smart fill', next);
    toastFor(added ? `Smart-filled ${added} rows` : 'No fillable rows');
  };

  return (
    <StudioShell>
      {policyGate.element}
      <StudioTopBar
        title="Office Studio Pro"
        left={
          <>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <Upload className="h-3.5 w-3.5" /> Open
              <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" className="hidden" onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (/\.(xlsx|xls)$/i.test(f.name)) importXlsxFile(f);
                else importCsv(f);
              }} />
            </label>
            <StudioButton variant="soft" size="sm" onClick={() => void exportXlsxFile()} title="Save as Excel"><Download className="h-3.5 w-3.5" /> .xlsx</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={openSaved}><FileText className="h-3.5 w-3.5" /> Library</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={saveCurrent}><Save className="h-3.5 w-3.5" /> Save</StudioButton>
            {/* On mobile Export is pinned in the always-visible right cluster instead. */}
            <DesktopOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)}><Download className="h-3.5 w-3.5" /> Export</StudioButton></DesktopOnly>
            <span className="ml-2 h-5 w-px bg-white/10" />
            <input value={doc.name} onChange={e => setDoc(d => ({ ...d, name: e.target.value }))} className="h-7 w-40 rounded border border-transparent bg-transparent px-2 text-sm text-zinc-200 outline-none hover:border-white/10 focus:border-cyan-400/50" />
          </>
        }
        right={
          <>
            <button onClick={() => setShowCommentsPanel(s => !s)} className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium', showCommentsPanel ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-300 hover:bg-white/5')} title="Comments panel">
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

      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/5 bg-[#0f1115] px-3 text-xs">
        <button onClick={() => updateStyle(s => { s.bold = !s.bold; })} title="Bold (Ctrl+B)" className={cn('rounded p-1.5 hover:bg-white/5', selCell?.style?.bold && 'bg-white/10')}><Bold className="h-3.5 w-3.5" /></button>
        <button onClick={() => updateStyle(s => { s.italic = !s.italic; })} title="Italic (Ctrl+I)" className={cn('rounded p-1.5 hover:bg-white/5', selCell?.style?.italic && 'bg-white/10')}><Italic className="h-3.5 w-3.5" /></button>
        <span className="h-4 w-px bg-white/10" />
        <button onClick={() => updateStyle(s => { s.align = 'left'; })} title="Left" className={cn('rounded p-1.5 hover:bg-white/5', selCell?.style?.align === 'left' && 'bg-white/10')}><AlignLeft className="h-3.5 w-3.5" /></button>
        <button onClick={() => updateStyle(s => { s.align = 'center'; })} title="Center" className={cn('rounded p-1.5 hover:bg-white/5', selCell?.style?.align === 'center' && 'bg-white/10')}><AlignCenter className="h-3.5 w-3.5" /></button>
        <button onClick={() => updateStyle(s => { s.align = 'right'; })} title="Right" className={cn('rounded p-1.5 hover:bg-white/5', selCell?.style?.align === 'right' && 'bg-white/10')}><AlignRight className="h-3.5 w-3.5" /></button>
        <span className="h-4 w-px bg-white/10" />
        <button onClick={() => updateStyle(s => { s.format = 'number'; })} title="Number" className="rounded p-1.5 hover:bg-white/5"><Hash className="h-3.5 w-3.5" /></button>
        <button onClick={() => updateStyle(s => { s.format = 'percent'; })} title="Percent" className="rounded p-1.5 hover:bg-white/5"><Percent className="h-3.5 w-3.5" /></button>
        <button onClick={() => updateStyle(s => { s.format = 'currency'; })} title="Currency" className="rounded p-1.5 hover:bg-white/5"><DollarSign className="h-3.5 w-3.5" /></button>
        <button onClick={() => updateStyle(s => { s.format = 'date'; })} title="Date" className="rounded p-1.5 hover:bg-white/5"><Calendar className="h-3.5 w-3.5" /></button>
        <span className="h-4 w-px bg-white/10" />
        <input type="color" onChange={e => updateStyle(s => { s.color = e.target.value; })} className="h-6 w-6 cursor-pointer rounded border border-white/10" title="Text color" />
        <input type="color" onChange={e => updateStyle(s => { s.bg = e.target.value; })} className="h-6 w-6 cursor-pointer rounded border border-white/10" title="Background" />
        <span className="h-4 w-px bg-white/10" />
        <button onClick={() => setCellRaw(sel.r, sel.c, `=SUM(${colToLetter(c0)}${r0 + 1}:${colToLetter(c1)}${r1 + 1})`)} title="Insert SUM" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5"><Sigma className="h-3 w-3" /> SUM</button>
        <button onClick={markOutliers} title="Highlight statistical outliers in selection" className="flex items-center gap-1 rounded px-2 py-1 text-amber-300 hover:bg-white/5"><AlertTriangle className="h-3 w-3" /> Outliers</button>
        <button onClick={runSmartFill} title="Detect pattern from filled cells and fill rest" className="flex items-center gap-1 rounded px-2 py-1 text-cyan-300 hover:bg-white/5"><Wand2 className="h-3 w-3" /> Smart fill</button>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <button onClick={() => setShowNamedRangesDialog(true)} title="Named ranges" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5"><Tag className="h-3 w-3" /> Names</button>
        <button onClick={() => setShowDvDialog(true)} title="Data validation" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5"><ShieldCheck className="h-3 w-3" /> Validate</button>
        <button onClick={() => freezePanes(sel.r, sel.c)} title="Freeze panes at selection" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5"><LockIcon className="h-3 w-3" /> Freeze</button>
        <button onClick={() => insertSparkline()} title="Insert sparkline from selected range" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5"><TrendingUp className="h-3 w-3" /> Spark</button>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <button onClick={() => setPivotDialog(true)} title="Create pivot table" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5"><Table2 className="h-3 w-3" /> Pivot</button>
        <button onClick={() => setChartDialog(true)} title="Insert chart" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5"><BarChart3 className="h-3 w-3" /> Chart</button>
        <button onClick={() => setCondDialog(true)} title="Conditional formatting" className="flex items-center gap-1 rounded px-2 py-1 text-zinc-300 hover:bg-white/5"><Palette className="h-3 w-3" /> Format</button>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <select value={doc.locale} onChange={e => commit('locale', { ...cloneDoc(doc), locale: e.target.value, currency: defaultCurrencyFor(e.target.value) })} className="h-7 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-xs text-zinc-100" title="Locale (number/date/currency formatting)">
          {LOCALES.map(l => <option key={l.code} value={l.code}>{l.nativeName} ({l.code})</option>)}
        </select>
        <div className="ml-2 flex flex-1 items-center gap-2">
          <span className="rounded bg-white/5 px-2 py-1 font-mono text-[11px] text-zinc-300">{colToLetter(sel.c)}{sel.r + 1}</span>
          <span className="text-zinc-500">fx</span>
          <input
            value={formulaBar}
            onChange={e => setFormulaBar(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { setCellRaw(sel.r, sel.c, formulaBar); moveSelection(1, 0); }
              if (e.key === 'Escape') setFormulaBar(selCell?.raw ?? '');
            }}
            className="flex-1 rounded border border-white/10 bg-[#0a0b0e] px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-400/50"
          />
        </div>
      </div>

      <StudioBody>
        <div className="relative flex flex-1 min-w-0 flex-col bg-[#0a0b0e]">
          {recovery && !recoveryDismissed.current && (
            <div className="z-30 flex shrink-0 items-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="flex-1">
                Recovered an unsaved session from {timeAgo(recovery.ts)}
                {(() => { const n = recovery.doc.sheets.reduce((a, s) => a + Object.keys(s.cells).length, 0); return n ? <span className="text-amber-300/70"> · {n} cells</span> : null; })()}
              </span>
              <button onClick={restoreRecovery} className="rounded bg-amber-400/90 px-2.5 py-1 font-medium text-amber-950 hover:bg-amber-300">Restore</button>
              <button onClick={dismissRecovery} className="rounded px-2 py-1 text-amber-200/80 hover:bg-amber-400/10">Dismiss</button>
            </div>
          )}
          {!sheetsWelcomed && doc.name === 'Untitled' && doc.sheets.length === 1 && Object.keys(doc.sheets[0].cells).length === 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0b0e]/95 backdrop-blur-sm">
              <EmptyState
                icon={<Table2 className="h-7 w-7" />}
                title="Start your spreadsheet"
                description="Open an Excel file, paste data, or just type into the grid. 140 formulas, pivot tables and 6 chart types are ready when you are."
                actions={[
                  { label: 'Open .xlsx or CSV', description: 'Round-trips Excel files with formulas', icon: <Upload className="h-4 w-4" />, onClick: () => { dismissSheetsWelcome(); document.querySelector<HTMLInputElement>('input[type=file]')?.click(); }, primary: true },
                  { label: 'Open from Library', description: 'Continue a saved workbook', icon: <FileText className="h-4 w-4" />, onClick: () => { dismissSheetsWelcome(); void openSaved(); } },
                  { label: 'Start blank', description: 'Just give me the grid', icon: <Hash className="h-4 w-4" />, onClick: dismissSheetsWelcome },
                ]}
                hints={[
                  { label: 'Try =SUM, =VLOOKUP, =FILTER', description: '140 formulas across math, lookup, financial, statistical' },
                  { label: 'Pivot + Chart + Sparkline buttons', description: 'On the toolbar above the cells' },
                  { label: 'Press ?', description: 'See every keyboard shortcut' },
                ]}
              />
            </div>
          )}
          <Grid
            sheet={sheet}
            evaluated={evaluated}
            selection={doc.selection}
            editor={editor}
            locale={doc.locale}
            currency={doc.currency}
            commentedCells={React.useMemo(() => {
              const s = new Set<string>();
              for (const cm of comments) {
                if (cm.anchor.kind === 'cell' && cm.anchor.sheetId === sheet.id && !cm.resolved) {
                  s.add(`${cm.anchor.r}_${cm.anchor.c}`);
                }
              }
              return s;
            }, [comments, sheet.id])}
            onSelect={selectCell}
            onBeginEdit={beginEdit}
            onEditChange={(v) => setEditor(e => e ? { ...e, value: v } : null)}
            onEditCommit={(dr, dc) => { if (commitEdit() && (dr || dc)) moveSelection(dr, dc); }}
            onEditCancel={() => setEditor(null)}
            fillDrag={fillDrag}
            onFillDragMove={(r, c) => { setFillChip(null); setFillDrag({ toR: r, toC: c }); }}
            onFillDragEnd={commitFillDrag}
            onFillDragCancel={() => setFillDrag(null)}
            onFillDoubleClick={() => { setFillChip(null); fillDownToData(); }}
            onResizeCol={(c, w) => { const next = cloneDoc(doc); const sh = next.sheets.find(s => s.id === sheet.id)!; sh.colWidths = { ...sh.colWidths, [c]: Math.max(40, Math.round(w)) }; commit('resize col', next); }}
            onAutofitCol={(c, w) => { const next = cloneDoc(doc); const sh = next.sheets.find(s => s.id === sheet.id)!; sh.colWidths = { ...sh.colWidths, [c]: Math.max(40, Math.round(w)) }; commit('autofit col', next); }}
          />
          <div className="flex h-8 shrink-0 items-center gap-1 border-t border-white/5 bg-[#0f1115] px-3">
            {doc.sheets.map(s => (
              <div key={s.id} className={cn('group flex items-center gap-1 rounded-t px-3 py-1', s.id === doc.activeSheetId ? 'bg-[#0a0b0e] text-cyan-300' : 'text-zinc-400 hover:bg-white/5')}>
                <button onClick={() => commit('switch sheet', { ...cloneDoc(doc), activeSheetId: s.id })} className="text-xs">{s.name}</button>
                <button onClick={() => removeSheet(s.id)} className="opacity-0 group-hover:opacity-100 text-rose-300 hover:text-rose-200"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <button onClick={addSheet} className="rounded p-1 text-zinc-400 hover:bg-white/5"><Plus className="h-3 w-3" /></button>
          </div>
        </div>
      </StudioBody>

      <StudioStatusBar>
        <span>{Object.keys(sheet.cells).length} cells</span>
        <span>{doc.sheets.length} sheet{doc.sheets.length === 1 ? '' : 's'}</span>
        {selectionSummary && <span className="text-cyan-300">{selectionSummary}</span>}
        <span className="ml-auto">{colToLetter(sel.c)}{sel.r + 1}</span>
      </StudioStatusBar>

      {busy && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 rounded-md bg-black/80 px-4 py-2 text-sm text-white backdrop-blur">
          <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> {busy}
        </div>
      )}
      {toast && <div className="pointer-events-none fixed bottom-12 left-1/2 -translate-x-1/2 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-lg">{toast}</div>}

      {/* Post-fill "Autofill options" chip (Sheets parity): switch the just-
          applied fill between Copy / Fill series / Fill formatting only. */}
      {fillChip && (
        <div className="fixed bottom-14 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-white/10 bg-[#111317] p-1 text-[11px] shadow-2xl">
          <span className="px-2 text-zinc-500">Autofill</span>
          {([['series', 'Fill series'], ['copy', 'Copy cells'], ['format', 'Formatting only']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => changeFillMode(m)}
              className={cn('rounded px-2 py-1 font-medium', fillChip.mode === m ? 'bg-cyan-500 text-zinc-900' : 'text-zinc-300 hover:bg-white/10')}
            >{label}</button>
          ))}
          <button onClick={() => setFillChip(null)} className="ml-1 rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"><X className="h-3 w-3" /></button>
        </div>
      )}
      {gate}

      {sheet.charts && sheet.charts.length > 0 && (
        <ChartOverlay charts={sheet.charts} onRemove={clearChart} />
      )}
      {showCommentsPanel && (
        <div className="fixed right-0 top-[88px] bottom-0 z-40 flex w-80 flex-col border-l border-white/10 bg-[#0f1115] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <div className="text-xs font-semibold text-zinc-100">Comments</div>
            <button onClick={() => setShowCommentsPanel(false)} className="rounded p-1 text-zinc-400 hover:bg-white/5"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="border-b border-white/5 px-3 py-2 text-[10px] text-zinc-400">
            Author: <input value={commentAuthor} onChange={e => setCommentAuthor(e.target.value)} className="ml-1 rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-0.5 text-zinc-100" />
            <div className="mt-1 text-[10px] leading-snug text-zinc-500">Comments are saved with this workbook on your device — they’re not synced live to other people.</div>
          </div>
          <div className="border-b border-white/5 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Selected cell: {colToLetter(sel.c)}{sel.r + 1}</div>
            <CommentsThread
              anchor={{ kind: 'cell', sheetId: sheet.id, r: sel.r, c: sel.c }}
              comments={cellComments(sel.r, sel.c)}
              currentUser={commentAuthor}
              currentColor={commentColor}
              onAdd={(text) => addComment({ kind: 'cell', sheetId: sheet.id, r: sel.r, c: sel.c }, text)}
              onReply={replyComment}
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
                if (anchor.kind === 'cell') {
                  selectCell(anchor.r, anchor.c);
                }
              }}
              onResolve={(id) => commentsModel.current.resolve(id, true)}
              onUnresolve={(id) => commentsModel.current.resolve(id, false)}
              onDelete={(id) => commentsModel.current.remove(id)}
              onReply={replyComment}
              onEdit={(id, text) => commentsModel.current.editText(id, text)}
            />
          </div>
        </div>
      )}
      {showNamedRangesDialog && (
        <NamedRangesDialog
          ranges={namedRanges}
          currentRef={`${colToLetter(c0)}${r0 + 1}:${colToLetter(c1)}${r1 + 1}`}
          currentSheetId={sheet.id}
          onClose={() => setShowNamedRangesDialog(false)}
          onAdd={(name, ref) => namedRangesModel.current.add({ name, sheetId: sheet.id, ref })}
          onRemove={(name) => namedRangesModel.current.remove(name)}
        />
      )}
      {showDvDialog && (
        <DataValidationDialog
          range={{ r0, c0, r1, c1 }}
          onClose={() => setShowDvDialog(false)}
          onApply={(validation) => {
            dataValidationModel.current.add({ r0, c0, r1, c1, validation });
            toastFor('Validation rule added');
            setShowDvDialog(false);
          }}
        />
      )}
      {validationError && (
        <div className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-md bg-rose-500/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
          {validationError}
        </div>
      )}
      {pivotDialog && (
        <PivotDialog
          headers={(() => { const h: string[] = []; for (let c = c0; c <= c1; c++) h.push(String(sheet.cells[cellKey(r0, c)]?.raw ?? colToLetter(c))); return h; })()}
          onCancel={() => setPivotDialog(false)}
          onCreate={makePivot}
        />
      )}
      {chartDialog && (
        <ChartDialog
          headerRange={`${colToLetter(c0)}${r0 + 1}:${colToLetter(c1)}${r1 + 1}`}
          onCancel={() => setChartDialog(false)}
          onCreate={(type, title) => makeChart(type, title)}
        />
      )}
      {condDialog && (
        <CondDialog
          onCancel={() => setCondDialog(false)}
          onApply={applyCondFormat}
        />
      )}
      {exportDialog && (
        <Dialog title="Export" onCancel={() => setExportDialog(false)} onConfirm={exportNow} confirmLabel="Download">
          <div>
            <div className="mb-1 text-xs text-zinc-400">Format</div>
            <div className="flex gap-1">
              {(['csv', 'tsv', 'json'] as const).map(f => (
                <button key={f} onClick={() => setExportFmt(f)} className={cn('flex-1 rounded px-3 py-1.5 text-xs uppercase', exportFmt === f ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{f}</button>
              ))}
            </div>
          </div>
        </Dialog>
      )}
      {openDialog && (
        <Dialog title="Library" onCancel={() => setOpenDialog(false)} onConfirm={() => setOpenDialog(false)} confirmLabel="Close">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {savedList.length === 0 && <div className="rounded bg-white/5 p-4 text-center text-xs text-zinc-400">No saved projects</div>}
            {savedList.map(p => (
              <button key={p.id} onClick={() => loadFromLibrary(p.id)} className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
                <FileText className="h-3.5 w-3.5 text-zinc-400" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-zinc-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </StudioShell>
  );
}

function Grid({ sheet, evaluated, selection, editor, locale, currency, commentedCells, onSelect, onBeginEdit, onEditChange, onEditCommit, onEditCancel, fillDrag, onFillDragMove, onFillDragEnd, onFillDragCancel, onFillDoubleClick, onResizeCol, onAutofitCol }: {
  sheet: Sheet;
  evaluated: Record<string, any>;
  selection: { r: number; c: number; r2: number; c2: number };
  editor: { r: number; c: number; value: string } | null;
  locale: string;
  currency: string;
  commentedCells: Set<string>;
  onSelect: (r: number, c: number, extend?: boolean) => void;
  onBeginEdit: (r: number, c: number) => void;
  onEditChange: (v: string) => void;
  onEditCommit: (dr: number, dc: number) => void;
  onEditCancel: () => void;
  fillDrag: { toR: number; toC: number } | null;
  onFillDragMove: (r: number, c: number) => void;
  onFillDragEnd: (r: number, c: number) => void;
  onFillDragCancel: () => void;
  onFillDoubleClick: () => void;
  onResizeCol: (c: number, w: number) => void;
  onAutofitCol: (c: number, w: number) => void;
}) {
  const headerW = 48;
  const cellH = 24;
  const dragging = React.useRef(false);
  const filling = React.useRef(false);
  const r0 = Math.min(selection.r, selection.r2), r1 = Math.max(selection.r, selection.r2);
  const c0 = Math.min(selection.c, selection.c2), c1 = Math.max(selection.c, selection.c2);

  // Live column-resize: drag the right border of a column header. Shows a width
  // tooltip; double-click autofits to the widest visible content in the column.
  const [resize, setResize] = React.useState<{ c: number; startX: number; startW: number; w: number } | null>(null);

  const baseColW = (c: number) => sheet.colWidths[c] ?? 96;
  const colW = (c: number) => (resize && resize.c === c ? resize.w : baseColW(c));
  const rowH = (r: number) => sheet.rowHeights[r] ?? cellH;

  React.useEffect(() => {
    if (!resize) return;
    const onMove = (e: PointerEvent) => {
      const w = Math.max(40, resize.startW + (e.clientX - resize.startX));
      setResize(r => r ? { ...r, w } : r);
    };
    const onUp = () => { onResizeCol(resize.c, resize.w); setResize(null); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize?.c, resize?.startX, resize?.startW]);

  const autofitCol = (c: number) => {
    let max = 56;
    for (let r = 0; r < sheet.rows; r++) {
      const cell = sheet.cells[cellKey(r, c)];
      if (!cell) continue;
      const txt = formatValue(evaluated[cellKey(r, c)] ?? cell.raw ?? '', cell.style, locale, currency);
      const w = txt.length * 7.2 + 16 + (cell.style?.bold ? txt.length * 0.6 : 0);
      if (w > max) max = w;
    }
    onAutofitCol(c, Math.min(max, 480));
  };

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportH, setViewportH] = React.useState(600);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportH(el.clientHeight);
    onResize();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []);

  const rowOffset = (r: number) => r * cellH;
  const totalH = sheet.rows * cellH;
  const overscan = 8;
  const firstVisible = Math.max(0, Math.floor(scrollTop / cellH) - overscan);
  const lastVisible = Math.min(sheet.rows, Math.ceil((scrollTop + viewportH) / cellH) + overscan);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = selection.r * cellH;
    if (target < el.scrollTop + 30) el.scrollTop = Math.max(0, target - 30);
    else if (target > el.scrollTop + el.clientHeight - cellH - 30) el.scrollTop = target - el.clientHeight + cellH + 30;
  }, [selection.r]);

  // Ghost-preview range while dragging the fill handle (constrained to one axis,
  // matching the commit logic). A dashed band shows what will be extended.
  let ghost: { r0: number; c0: number; r1: number; c1: number } | null = null;
  if (fillDrag) {
    const down = fillDrag.toR > r1;
    const right = fillDrag.toC > c1 && !down;
    if (down) ghost = { r0, c0, r1: fillDrag.toR, c1 };
    else if (right) ghost = { r0, c0, r1, c1: fillDrag.toC };
  }
  const inGhost = (r: number, c: number) => !!ghost && r >= ghost.r0 && r <= ghost.r1 && c >= ghost.c0 && c <= ghost.c1 && !(r >= r0 && r <= r1 && c >= c0 && c <= c1);

  return (
    <div
      ref={scrollerRef}
      className="relative flex-1 overflow-auto"
      onPointerUp={() => {
        if (filling.current && fillDrag) onFillDragEnd(fillDrag.toR, fillDrag.toC);
        else if (filling.current) onFillDragCancel();
        filling.current = false;
        dragging.current = false;
      }}
    >
      <div style={{ position: 'sticky', top: 0, left: 0, zIndex: 30 }} className="flex border-b border-white/10 bg-[#0f1115]">
        <div style={{ width: headerW, height: cellH }} className="sticky left-0 z-30 shrink-0 border-r border-white/10 bg-[#0f1115]" />
        {Array.from({ length: sheet.cols }, (_, c) => (
          <div key={c} style={{ width: colW(c), height: cellH, position: 'relative' }} className={cn(
            'group shrink-0 border-r border-white/10 px-1 text-center text-[10px] font-medium leading-[24px]',
            c >= c0 && c <= c1 ? 'bg-cyan-500/20 text-cyan-200' : 'bg-[#0f1115] text-zinc-500',
          )}>
            {colToLetter(c)}
            {/* resize grip on the right border */}
            <div
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setResize({ c, startX: e.clientX, startW: colW(c), w: colW(c) }); }}
              onDoubleClick={(e) => { e.stopPropagation(); autofitCol(c); }}
              title="Drag to resize · double-click to autofit"
              className="absolute right-0 top-0 z-10 h-full w-1.5 translate-x-1/2 cursor-col-resize hover:bg-cyan-400/60"
            />
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', height: totalH }}>
        {Array.from({ length: Math.max(0, lastVisible - firstVisible) }, (_, i) => {
          const r = firstVisible + i;
          return (
            <div key={r} style={{ position: 'absolute', top: rowOffset(r), left: 0, height: rowH(r), display: 'flex' }}>
              <div style={{ width: headerW }} className={cn(
                'sticky left-0 z-20 shrink-0 border-b border-r border-white/10 text-center text-[10px] font-medium leading-[24px]',
                r >= r0 && r <= r1 ? 'bg-cyan-500/20 text-cyan-200' : 'bg-[#0f1115] text-zinc-500',
              )}>
                {r + 1}
              </div>
              {Array.from({ length: sheet.cols }, (_, c) => {
                const cell = sheet.cells[cellKey(r, c)];
                const inSel = r >= r0 && r <= r1 && c >= c0 && c <= c1;
                const isCursor = r === selection.r && c === selection.c;
                const isEditing = editor?.r === r && editor?.c === c;
                const v = evaluated[cellKey(r, c)] ?? cell?.raw ?? '';
                const display = formatValue(v, cell?.style, locale, currency);
                const condRange = (sheet.condFormats ?? []).find(cf => r >= cf.r0 && r <= cf.r1 && c >= cf.c0 && c <= cf.c1);
                let condFmt: ReturnType<typeof evalCondFormat> = {};
                if (condRange) {
                  const all: any[] = [];
                  for (let rr = condRange.r0; rr <= condRange.r1; rr++) for (let cc = condRange.c0; cc <= condRange.c1; cc++) {
                    all.push(evaluated[cellKey(rr, cc)] ?? sheet.cells[cellKey(rr, cc)]?.raw ?? '');
                  }
                  condFmt = evalCondFormat(v, condRange, all);
                }
                const ghosted = inGhost(r, c);
                const isFillAnchor = r === r1 && c === c1; // bottom-right of selection
                return (
                  <div
                    key={c}
                    style={{
                      width: colW(c), height: rowH(r),
                      background: condFmt.bg ?? cell?.style?.bg ?? (inSel ? 'rgba(34,211,238,.08)' : ghosted ? 'rgba(34,211,238,.05)' : undefined),
                      color: condFmt.color ?? cell?.style?.color,
                      fontWeight: cell?.style?.bold ? 700 : undefined,
                      fontStyle: cell?.style?.italic ? 'italic' : undefined,
                      textAlign: cell?.style?.align ?? (typeof v === 'number' ? 'right' : 'left'),
                      position: 'relative',
                      boxShadow: ghosted ? 'inset 0 0 0 1px rgba(34,211,238,.4)' : undefined,
                    }}
                    className={cn(
                      'shrink-0 overflow-hidden border-b border-r border-white/10 px-1.5 text-[12px] leading-[24px] whitespace-nowrap',
                      isCursor && 'ring-2 ring-cyan-400 ring-inset z-10',
                    )}
                    onPointerDown={(e) => { if (filling.current) return; dragging.current = true; onSelect(r, c, e.shiftKey); }}
                    onPointerEnter={() => { if (filling.current) onFillDragMove(r, c); else if (dragging.current) onSelect(r, c, true); }}
                    onDoubleClick={() => onBeginEdit(r, c)}
                  >
                    {condFmt.bar && (
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${condFmt.bar.pct * 100}%`, background: condFmt.bar.color, opacity: 0.4 }} />
                    )}
                    {commentedCells.has(`${r}_${c}`) && (
                      <div style={{ position: 'absolute', right: 0, top: 0, width: 0, height: 0, borderTop: '6px solid #fbbf24', borderLeft: '6px solid transparent', zIndex: 5 }} />
                    )}
                    {isFillAnchor && !isEditing && (
                      <div
                        title="Drag to fill series · double-click to fill down"
                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); filling.current = true; dragging.current = false; (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); }}
                        onDoubleClick={(e) => { e.stopPropagation(); onFillDoubleClick(); }}
                        style={{ position: 'absolute', right: -3, bottom: -3, width: 7, height: 7, zIndex: 20 }}
                        className="cursor-crosshair rounded-[1px] border border-[#0a0b0e] bg-cyan-400"
                      />
                    )}
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editor.value}
                        onChange={e => onEditChange(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); onEditCommit(e.shiftKey ? -1 : 1, 0); }
                          else if (e.key === 'Tab') { e.preventDefault(); onEditCommit(0, e.shiftKey ? -1 : 1); }
                          else if (e.key === 'Escape') onEditCancel();
                        }}
                        onBlur={() => onEditCommit(0, 0)}
                        className="-mx-1.5 -my-0 h-full w-[calc(100%+.75rem)] border-2 border-cyan-400 bg-[#0a0b0e] px-1.5 outline-none text-zinc-100"
                      />
                    ) : isSparkCell(cell?.raw) ? (
                      <SparklineRender raw={cell!.raw} sheet={sheet} evaluated={evaluated} />
                    ) : (
                      <span className={cn('relative', cell?.raw?.startsWith('=') && 'text-zinc-200', String(v).startsWith('#') && String(v).length < 7 && 'text-rose-400')}>
                        {condFmt.icon && <span className="mr-1">{condFmt.icon}</span>}
                        {display}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {resize && (
        <div className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 rounded-md bg-black/85 px-2.5 py-1 text-[11px] font-medium text-cyan-200 shadow-lg backdrop-blur">
          {colToLetter(resize.c)} · {Math.round(resize.w)}px
        </div>
      )}
    </div>
  );
}

function NamedRangesDialog({ ranges, currentRef, currentSheetId, onClose, onAdd, onRemove }: {
  ranges: NamedRange[];
  currentRef: string;
  currentSheetId: string;
  onClose: () => void;
  onAdd: (name: string, ref: string) => void;
  onRemove: (name: string) => void;
}) {
  const [name, setName] = React.useState('');
  const [ref, setRef] = React.useState(currentRef);
  return (
    <Dialog title="Named Ranges" onCancel={onClose} onConfirm={onClose} confirmLabel="Close">
      <div className="space-y-3">
        <div className="space-y-2">
          {ranges.length === 0 && <div className="rounded bg-white/5 p-2 text-[10px] text-zinc-500">No named ranges yet</div>}
          {ranges.map(r => (
            <div key={r.name} className="flex items-center gap-2 rounded border border-white/10 bg-white/[.02] p-2 text-xs">
              <code className="rounded bg-cyan-500/20 px-2 py-0.5 text-cyan-200">{r.name}</code>
              <span className="text-zinc-400">→</span>
              <code className="flex-1 text-zinc-300">{r.ref}</code>
              <button onClick={() => onRemove(r.name)} className="rounded p-1 text-rose-300 hover:bg-rose-500/20"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 pt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-400">Add new</div>
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={e => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} placeholder="MY_RANGE" className="rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs text-zinc-100" />
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder="A1:B10" className="rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs text-zinc-100" />
          </div>
          <button
            onClick={() => { if (name && ref) { onAdd(name, ref); setName(''); } }}
            disabled={!name || !ref}
            className="mt-2 rounded bg-cyan-500 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-cyan-400 disabled:opacity-40"
          >Add named range</button>
        </div>
      </div>
    </Dialog>
  );
}

function DataValidationDialog({ range, onClose, onApply }: {
  range: { r0: number; c0: number; r1: number; c1: number };
  onClose: () => void;
  onApply: (v: DataValidation) => void;
}) {
  const [kind, setKind] = React.useState<'list' | 'number' | 'date' | 'text-length'>('list');
  const [listText, setListText] = React.useState('');
  const [min, setMin] = React.useState('');
  const [max, setMax] = React.useState('');
  const [allowBlank, setAllowBlank] = React.useState(true);
  const [message, setMessage] = React.useState('');

  const handle = () => {
    const v: DataValidation = {
      kind,
      list: kind === 'list' ? listText.split(/[,\n]/).map(s => s.trim()).filter(Boolean) : undefined,
      min: min ? parseFloat(min) : undefined,
      max: max ? parseFloat(max) : undefined,
      message: message || undefined,
      showError: true,
      allowBlank,
    };
    onApply(v);
  };

  return (
    <Dialog title={`Data validation for ${colToLetter(range.c0)}${range.r0 + 1}:${colToLetter(range.c1)}${range.r1 + 1}`} onCancel={onClose} onConfirm={handle} confirmLabel="Apply">
      <div className="space-y-3 text-xs">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-400">Type</div>
          <div className="grid grid-cols-4 gap-1">
            {(['list', 'number', 'date', 'text-length'] as const).map(k => (
              <button key={k} onClick={() => setKind(k)} className={cn('rounded px-2 py-1 text-[10px]', kind === k ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{k}</button>
            ))}
          </div>
        </div>
        {kind === 'list' && (
          <label className="block">
            <div className="mb-1 text-zinc-400">Allowed values (comma or newline)</div>
            <textarea rows={3} value={listText} onChange={e => setListText(e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] p-1.5 text-xs text-zinc-100" placeholder="Yes,No,Maybe" />
          </label>
        )}
        {(kind === 'number' || kind === 'text-length') && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><div className="mb-1 text-zinc-400">Min</div><input value={min} onChange={e => setMin(e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs text-zinc-100" /></label>
            <label className="block"><div className="mb-1 text-zinc-400">Max</div><input value={max} onChange={e => setMax(e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs text-zinc-100" /></label>
          </div>
        )}
        <label className="block">
          <div className="mb-1 text-zinc-400">Error message (optional)</div>
          <input value={message} onChange={e => setMessage(e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-xs text-zinc-100" />
        </label>
        <label className="flex items-center gap-2 text-zinc-300">
          <input type="checkbox" checked={allowBlank} onChange={e => setAllowBlank(e.target.checked)} /> Allow blank
        </label>
      </div>
    </Dialog>
  );
}

function ChartOverlay({ charts, onRemove }: { charts: SheetChart[]; onRemove: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed right-6 top-32 z-30 flex flex-col gap-3">
      {charts.map(c => <ChartCard key={c.id} chart={c} onRemove={() => onRemove(c.id)} />)}
    </div>
  );
}

function ChartCard({ chart, onRemove }: { chart: SheetChart; onRemove: () => void }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    if (ref.current) renderChart(ref.current, { ...chart.config, width: chart.w, height: chart.h });
  }, [chart.config, chart.w, chart.h]);
  return (
    <div className="pointer-events-auto relative rounded-lg border border-white/10 bg-[#111317] shadow-2xl">
      <button onClick={onRemove} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-black/40 text-zinc-300 hover:bg-rose-500/30 hover:text-white">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      <canvas ref={ref} style={{ width: chart.w, height: chart.h }} />
    </div>
  );
}

function PivotDialog({ headers, onCancel, onCreate }: { headers: string[]; onCancel: () => void; onCreate: (rowCol: number, valueCol: number, agg: Agg, byCol?: number) => void }) {
  const [rowCol, setRowCol] = React.useState(0);
  const [valueCol, setValueCol] = React.useState(Math.min(1, headers.length - 1));
  const [byCol, setByCol] = React.useState<number | -1>(-1);
  const [agg, setAgg] = React.useState<Agg>('sum');
  return (
    <Dialog title="Create pivot table" onCancel={onCancel} onConfirm={() => onCreate(rowCol, valueCol, agg, byCol >= 0 ? byCol : undefined)} confirmLabel="Create">
      <div className="space-y-2 text-xs">
        <label className="block">
          <div className="mb-0.5 text-zinc-400">Rows (group by):</div>
          <select value={rowCol} onChange={e => setRowCol(+e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100">
            {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="mb-0.5 text-zinc-400">Columns (optional split):</div>
          <select value={byCol} onChange={e => setByCol(+e.target.value as any)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100">
            <option value={-1}>(none)</option>
            {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="mb-0.5 text-zinc-400">Values:</div>
          <select value={valueCol} onChange={e => setValueCol(+e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100">
            {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
          </select>
        </label>
        <label className="block">
          <div className="mb-0.5 text-zinc-400">Aggregate:</div>
          <select value={agg} onChange={e => setAgg(e.target.value as Agg)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100">
            {(['sum', 'count', 'avg', 'min', 'max', 'median', 'stdev'] as Agg[]).map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}
          </select>
        </label>
      </div>
    </Dialog>
  );
}

function ChartDialog({ headerRange, onCancel, onCreate }: { headerRange: string; onCancel: () => void; onCreate: (type: ChartType, title: string) => void }) {
  const [type, setType] = React.useState<ChartType>('bar');
  const [title, setTitle] = React.useState('Chart');
  return (
    <Dialog title="Insert chart" onCancel={onCancel} onConfirm={() => onCreate(type, title)} confirmLabel="Insert">
      <div className="space-y-3 text-xs">
        <div>
          <div className="mb-1 text-zinc-400">Data range: <span className="text-cyan-300">{headerRange}</span></div>
          <div className="text-[10px] text-zinc-500">First row = labels for X-axis. First column = category labels. Remaining columns = series.</div>
        </div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Chart title" className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100" />
        <div>
          <div className="mb-1 text-zinc-400">Chart type:</div>
          <div className="grid grid-cols-3 gap-1">
            {(['bar', 'line', 'area', 'pie', 'donut', 'scatter'] as ChartType[]).map(t => (
              <button key={t} onClick={() => setType(t)} className={cn('rounded px-2 py-2 text-xs', type === t ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{t}</button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function CondDialog({ onCancel, onApply }: { onCancel: () => void; onApply: (rule: CondRule) => void }) {
  return (
    <Dialog title="Conditional formatting" onCancel={onCancel} onConfirm={onCancel} confirmLabel="Close">
      <div className="space-y-1.5">
        <div className="text-xs text-zinc-400">Apply preset to current selection:</div>
        {PRESET_RULES.map(p => (
          <button key={p.name} onClick={() => onApply(p.rules[0])} className="block w-full rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
            {p.name}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function isSparkCell(raw: string | undefined): boolean {
  return !!raw && /^=SPARK\(/i.test(raw);
}

function SparklineRender({ raw, sheet, evaluated }: { raw: string; sheet: Sheet; evaluated: Record<string, any> }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const m = /^=SPARK\(\s*([A-Z]+\d+:[A-Z]+\d+)\s*(?:,\s*"([^"]+)")?\s*\)$/i.exec(raw);
    if (!m) return;
    const rangeRef = m[1];
    const type = (m[2] as SparkType) || 'line';
    const colon = rangeRef.indexOf(':');
    const a = rangeRef.slice(0, colon);
    const b = rangeRef.slice(colon + 1);
    const pa = parseRef(a);
    const pb = parseRef(b);
    if (!pa || !pb) return;
    const r0 = Math.min(pa.r, pb.r);
    const r1 = Math.max(pa.r, pb.r);
    const c0 = Math.min(pa.c, pb.c);
    const c1 = Math.max(pa.c, pb.c);
    const values: number[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const v = evaluated[`${r}_${c}`] ?? sheet.cells[`${r}_${c}`]?.raw ?? '';
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,$%\s]/g, ''));
      if (!isNaN(n)) values.push(n);
    }
    renderSparkline(c, { type, values, color: '#22d3ee', width: c.clientWidth || 80, height: 22 });
  }, [raw, sheet, evaluated]);
  return <canvas ref={ref} className="block h-5 w-full" />;
}

function parseRef(s: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)(\d+)$/i.exec(s.trim().toUpperCase());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { c: c - 1, r: parseInt(m[2], 10) - 1 };
}

function parseCSV(text: string, sep = ','): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
      else if (ch !== '\r') cur += ch;
    }
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out;
}

function csvEscape(v: string, sep: string): string {
  if (v.includes(sep) || v.includes('\n') || v.includes('"')) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'moments ago';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function Dialog({ title, children, onCancel, onConfirm, confirmLabel = 'OK' }: { title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width="sm">{children}</SharedDialog>;
}
