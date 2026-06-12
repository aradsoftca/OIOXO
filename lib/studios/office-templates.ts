// Office Studio templates — ready-made spreadsheets (invoice, budget, tracker…).
//
// Office stores its project as the raw DocState (a list of Sheets, each a map
// of "row_col" → {raw, style}). A template is therefore just a pre-filled
// Sheet recipe that we expand into a DocState — the same shape loadProject
// returns — so applying a template reuses the existing open path. Offline, no
// server, no model.

export type OfficeTemplateCategory = 'finance' | 'planning' | 'tracking' | 'education' | 'business';

interface CellStyleLike {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  bg?: string;
  format?: 'general' | 'number' | 'percent' | 'currency' | 'date' | 'text';
  decimals?: number;
}

/** One authored cell at (r,c). */
export interface CellSpec {
  r: number; c: number;
  raw: string;
  style?: CellStyleLike;
}

export interface OfficeTemplate {
  id: string;
  name: string;
  category: OfficeTemplateCategory;
  description: string;
  cols: number;
  rows: number;
  /** Optional per-column widths (column index → px). */
  colWidths?: Record<number, number>;
  cells: CellSpec[];
}

// Style shorthands.
const HEAD: CellStyleLike = { bold: true, color: '#ffffff', bg: '#1e3a5f', align: 'center' };
const TITLE: CellStyleLike = { bold: true, color: '#0f172a' };
const LABEL: CellStyleLike = { bold: true, color: '#334155' };
const MONEY: CellStyleLike = { format: 'currency', align: 'right' };
const PCT: CellStyleLike = { format: 'percent', align: 'right' };
const TOTAL: CellStyleLike = { bold: true, bg: '#e2e8f0', format: 'currency', align: 'right' };
const MUTED: CellStyleLike = { color: '#64748b' };

/** Helper to build a header row of labels with the HEAD style. */
function header(row: number, labels: string[], startCol = 0): CellSpec[] {
  return labels.map((raw, i) => ({ r: row, c: startCol + i, raw, style: HEAD }));
}

export const OFFICE_TEMPLATES: OfficeTemplate[] = [
  // ── FINANCE ─────────────────────────────────────────────────────────────────
  {
    id: 'invoice', name: 'Invoice', category: 'finance',
    description: 'Professional invoice with auto-calculated totals.',
    cols: 6, rows: 30, colWidths: { 0: 60, 1: 220, 2: 90, 3: 100, 4: 110, 5: 110 },
    cells: [
      { r: 0, c: 0, raw: 'INVOICE', style: { bold: true, color: '#1e3a5f' } },
      { r: 1, c: 0, raw: 'Your Company Name', style: TITLE },
      { r: 2, c: 0, raw: 'your@email.com · (555) 000-0000', style: MUTED },
      { r: 4, c: 0, raw: 'Bill To:', style: LABEL },
      { r: 4, c: 3, raw: 'Invoice #', style: LABEL }, { r: 4, c: 4, raw: '0001' },
      { r: 5, c: 0, raw: 'Client Name' },
      { r: 5, c: 3, raw: 'Date', style: LABEL }, { r: 5, c: 4, raw: '2026-06-12' },
      { r: 6, c: 0, raw: 'Client Address' },
      { r: 6, c: 3, raw: 'Due', style: LABEL }, { r: 6, c: 4, raw: '2026-07-12' },
      ...header(8, ['#', 'Description', 'Qty', 'Unit Price', 'Tax %', 'Amount']),
      { r: 9, c: 0, raw: '1' }, { r: 9, c: 1, raw: 'Service or product' }, { r: 9, c: 2, raw: '1' }, { r: 9, c: 3, raw: '100', style: MONEY }, { r: 9, c: 4, raw: '0.1', style: PCT }, { r: 9, c: 5, raw: '=C10*D10*(1+E10)', style: MONEY },
      { r: 10, c: 0, raw: '2' }, { r: 10, c: 1, raw: 'Another item' }, { r: 10, c: 2, raw: '2' }, { r: 10, c: 3, raw: '50', style: MONEY }, { r: 10, c: 4, raw: '0.1', style: PCT }, { r: 10, c: 5, raw: '=C11*D11*(1+E11)', style: MONEY },
      { r: 12, c: 4, raw: 'Subtotal', style: LABEL }, { r: 12, c: 5, raw: '=SUM(F10:F11)', style: MONEY },
      { r: 13, c: 4, raw: 'Total Due', style: LABEL }, { r: 13, c: 5, raw: '=SUM(F10:F11)', style: TOTAL },
      { r: 15, c: 0, raw: 'Thank you for your business!', style: MUTED },
    ],
  },
  {
    id: 'monthly-budget', name: 'Monthly Budget', category: 'finance',
    description: 'Income vs. expenses with remaining balance.',
    cols: 4, rows: 30, colWidths: { 0: 200, 1: 120, 2: 120, 3: 120 },
    cells: [
      { r: 0, c: 0, raw: 'Monthly Budget', style: { bold: true, color: '#1e3a5f' } },
      ...header(2, ['Category', 'Budgeted', 'Actual', 'Difference']),
      { r: 3, c: 0, raw: 'Income', style: LABEL },
      { r: 4, c: 0, raw: 'Salary' }, { r: 4, c: 1, raw: '4000', style: MONEY }, { r: 4, c: 2, raw: '4000', style: MONEY }, { r: 4, c: 3, raw: '=C5-B5', style: MONEY },
      { r: 5, c: 0, raw: 'Side income' }, { r: 5, c: 1, raw: '500', style: MONEY }, { r: 5, c: 2, raw: '600', style: MONEY }, { r: 5, c: 3, raw: '=C6-B6', style: MONEY },
      { r: 7, c: 0, raw: 'Expenses', style: LABEL },
      { r: 8, c: 0, raw: 'Rent' }, { r: 8, c: 1, raw: '1500', style: MONEY }, { r: 8, c: 2, raw: '1500', style: MONEY }, { r: 8, c: 3, raw: '=B9-C9', style: MONEY },
      { r: 9, c: 0, raw: 'Groceries' }, { r: 9, c: 1, raw: '500', style: MONEY }, { r: 9, c: 2, raw: '480', style: MONEY }, { r: 9, c: 3, raw: '=B10-C10', style: MONEY },
      { r: 10, c: 0, raw: 'Transport' }, { r: 10, c: 1, raw: '200', style: MONEY }, { r: 10, c: 2, raw: '220', style: MONEY }, { r: 10, c: 3, raw: '=B11-C11', style: MONEY },
      { r: 11, c: 0, raw: 'Entertainment' }, { r: 11, c: 1, raw: '300', style: MONEY }, { r: 11, c: 2, raw: '250', style: MONEY }, { r: 11, c: 3, raw: '=B12-C12', style: MONEY },
      { r: 13, c: 0, raw: 'Net Balance', style: LABEL }, { r: 13, c: 2, raw: '=(C5+C6)-SUM(C9:C12)', style: TOTAL },
    ],
  },
  {
    id: 'expense-report', name: 'Expense Report', category: 'finance',
    description: 'Itemized expenses for reimbursement.',
    cols: 5, rows: 30, colWidths: { 0: 110, 1: 220, 2: 130, 3: 110, 4: 110 },
    cells: [
      { r: 0, c: 0, raw: 'Expense Report', style: { bold: true, color: '#1e3a5f' } },
      { r: 1, c: 0, raw: 'Employee: ____   Period: ____', style: MUTED },
      ...header(3, ['Date', 'Description', 'Category', 'Amount', 'Billable']),
      { r: 4, c: 0, raw: '2026-06-01' }, { r: 4, c: 1, raw: 'Flight' }, { r: 4, c: 2, raw: 'Travel' }, { r: 4, c: 3, raw: '320', style: MONEY }, { r: 4, c: 4, raw: 'Yes' },
      { r: 5, c: 0, raw: '2026-06-02' }, { r: 5, c: 1, raw: 'Hotel' }, { r: 5, c: 2, raw: 'Lodging' }, { r: 5, c: 3, raw: '180', style: MONEY }, { r: 5, c: 4, raw: 'Yes' },
      { r: 6, c: 0, raw: '2026-06-02' }, { r: 6, c: 1, raw: 'Dinner' }, { r: 6, c: 2, raw: 'Meals' }, { r: 6, c: 3, raw: '45', style: MONEY }, { r: 6, c: 4, raw: 'No' },
      { r: 8, c: 2, raw: 'Total', style: LABEL }, { r: 8, c: 3, raw: '=SUM(D5:D7)', style: TOTAL },
    ],
  },

  // ── PLANNING ──────────────────────────────────────────────────────────────
  {
    id: 'weekly-schedule', name: 'Weekly Schedule', category: 'planning',
    description: 'Time-blocked planner, Monday–Sunday.',
    cols: 8, rows: 16, colWidths: { 0: 90 },
    cells: [
      { r: 0, c: 0, raw: 'Weekly Schedule', style: { bold: true, color: '#1e3a5f' } },
      ...header(1, ['Time', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
      ...['8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map((t, i) => ({ r: 2 + i, c: 0, raw: t, style: LABEL })),
    ],
  },
  {
    id: 'project-plan', name: 'Project Plan', category: 'planning',
    description: 'Tasks, owners, dates, and status.',
    cols: 6, rows: 30, colWidths: { 0: 240, 1: 120, 2: 110, 3: 110, 4: 100, 5: 120 },
    cells: [
      { r: 0, c: 0, raw: 'Project Plan', style: { bold: true, color: '#1e3a5f' } },
      ...header(2, ['Task', 'Owner', 'Start', 'Due', 'Status', '% Complete']),
      { r: 3, c: 0, raw: 'Define scope' }, { r: 3, c: 1, raw: 'Alex' }, { r: 3, c: 2, raw: '2026-06-01' }, { r: 3, c: 3, raw: '2026-06-05' }, { r: 3, c: 4, raw: 'Done' }, { r: 3, c: 5, raw: '1', style: PCT },
      { r: 4, c: 0, raw: 'Design' }, { r: 4, c: 1, raw: 'Sam' }, { r: 4, c: 2, raw: '2026-06-06' }, { r: 4, c: 3, raw: '2026-06-15' }, { r: 4, c: 4, raw: 'In progress' }, { r: 4, c: 5, raw: '0.6', style: PCT },
      { r: 5, c: 0, raw: 'Build' }, { r: 5, c: 1, raw: 'Jordan' }, { r: 5, c: 2, raw: '2026-06-16' }, { r: 5, c: 3, raw: '2026-07-10' }, { r: 5, c: 4, raw: 'Not started' }, { r: 5, c: 5, raw: '0', style: PCT },
      { r: 6, c: 0, raw: 'Test & ship' }, { r: 6, c: 1, raw: 'Team' }, { r: 6, c: 2, raw: '2026-07-11' }, { r: 6, c: 3, raw: '2026-07-20' }, { r: 6, c: 4, raw: 'Not started' }, { r: 6, c: 5, raw: '0', style: PCT },
      { r: 8, c: 0, raw: 'Overall', style: LABEL }, { r: 8, c: 5, raw: '=AVERAGE(F4:F7)', style: { bold: true, bg: '#e2e8f0', format: 'percent', align: 'right' } },
    ],
  },
  {
    id: 'meal-planner', name: 'Meal Planner', category: 'planning',
    description: 'A week of meals + a shopping column.',
    cols: 5, rows: 12, colWidths: { 0: 100 },
    cells: [
      { r: 0, c: 0, raw: 'Meal Planner', style: { bold: true, color: '#1e3a5f' } },
      ...header(1, ['Day', 'Breakfast', 'Lunch', 'Dinner', 'Notes']),
      ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ r: 2 + i, c: 0, raw: d, style: LABEL })),
    ],
  },

  // ── TRACKING ────────────────────────────────────────────────────────────────
  {
    id: 'habit-tracker', name: 'Habit Tracker', category: 'tracking',
    description: 'Tick off daily habits across the month.',
    cols: 9, rows: 14, colWidths: { 0: 160 },
    cells: [
      { r: 0, c: 0, raw: 'Habit Tracker', style: { bold: true, color: '#1e3a5f' } },
      ...header(1, ['Habit', 'M', 'T', 'W', 'T', 'F', 'S', 'S', 'Streak']),
      { r: 2, c: 0, raw: 'Drink water' },
      { r: 3, c: 0, raw: 'Exercise' },
      { r: 4, c: 0, raw: 'Read 20 min' },
      { r: 5, c: 0, raw: 'No sugar' },
      { r: 6, c: 0, raw: 'Sleep by 11' },
    ],
  },
  {
    id: 'inventory', name: 'Inventory Tracker', category: 'tracking',
    description: 'Stock levels with reorder flags.',
    cols: 6, rows: 30, colWidths: { 0: 80, 1: 220, 2: 90, 3: 90, 4: 100, 5: 120 },
    cells: [
      { r: 0, c: 0, raw: 'Inventory', style: { bold: true, color: '#1e3a5f' } },
      ...header(2, ['SKU', 'Item', 'In Stock', 'Reorder At', 'Unit Cost', 'Stock Value']),
      { r: 3, c: 0, raw: 'A-001' }, { r: 3, c: 1, raw: 'Widget' }, { r: 3, c: 2, raw: '120' }, { r: 3, c: 3, raw: '50' }, { r: 3, c: 4, raw: '2.5', style: MONEY }, { r: 3, c: 5, raw: '=C4*E4', style: MONEY },
      { r: 4, c: 0, raw: 'A-002' }, { r: 4, c: 1, raw: 'Gadget' }, { r: 4, c: 2, raw: '30' }, { r: 4, c: 3, raw: '40' }, { r: 4, c: 4, raw: '8', style: MONEY }, { r: 4, c: 5, raw: '=C5*E5', style: MONEY },
      { r: 6, c: 4, raw: 'Total Value', style: LABEL }, { r: 6, c: 5, raw: '=SUM(F4:F5)', style: TOTAL },
    ],
  },
  {
    id: 'savings-goal', name: 'Savings Goal Tracker', category: 'tracking',
    description: 'Track contributions toward a target.',
    cols: 4, rows: 20, colWidths: { 0: 120, 1: 140, 2: 140, 3: 120 },
    cells: [
      { r: 0, c: 0, raw: 'Savings Goal', style: { bold: true, color: '#1e3a5f' } },
      { r: 1, c: 0, raw: 'Target', style: LABEL }, { r: 1, c: 1, raw: '5000', style: MONEY },
      ...header(3, ['Date', 'Contribution', 'Running Total', '% of Goal']),
      { r: 4, c: 0, raw: '2026-06-01' }, { r: 4, c: 1, raw: '500', style: MONEY }, { r: 4, c: 2, raw: '=B5', style: MONEY }, { r: 4, c: 3, raw: '=C5/$B$2', style: PCT },
      { r: 5, c: 0, raw: '2026-07-01' }, { r: 5, c: 1, raw: '500', style: MONEY }, { r: 5, c: 2, raw: '=C5+B6', style: MONEY }, { r: 5, c: 3, raw: '=C6/$B$2', style: PCT },
    ],
  },

  // ── EDUCATION ────────────────────────────────────────────────────────────────
  {
    id: 'grade-book', name: 'Grade Book', category: 'education',
    description: 'Student scores with automatic averages.',
    cols: 6, rows: 30, colWidths: { 0: 180 },
    cells: [
      { r: 0, c: 0, raw: 'Grade Book', style: { bold: true, color: '#1e3a5f' } },
      ...header(2, ['Student', 'Quiz 1', 'Quiz 2', 'Midterm', 'Final', 'Average']),
      { r: 3, c: 0, raw: 'Student A' }, { r: 3, c: 1, raw: '88' }, { r: 3, c: 2, raw: '92' }, { r: 3, c: 3, raw: '85' }, { r: 3, c: 4, raw: '90' }, { r: 3, c: 5, raw: '=AVERAGE(B4:E4)', style: { bold: true, align: 'right' } },
      { r: 4, c: 0, raw: 'Student B' }, { r: 4, c: 1, raw: '76' }, { r: 4, c: 2, raw: '81' }, { r: 4, c: 3, raw: '79' }, { r: 4, c: 4, raw: '84' }, { r: 4, c: 5, raw: '=AVERAGE(B5:E5)', style: { bold: true, align: 'right' } },
      { r: 6, c: 0, raw: 'Class average', style: LABEL }, { r: 6, c: 5, raw: '=AVERAGE(F4:F5)', style: { bold: true, bg: '#e2e8f0', align: 'right' } },
    ],
  },
  {
    id: 'attendance', name: 'Attendance Sheet', category: 'education',
    description: 'Daily attendance with present count.',
    cols: 8, rows: 30, colWidths: { 0: 180 },
    cells: [
      { r: 0, c: 0, raw: 'Attendance', style: { bold: true, color: '#1e3a5f' } },
      ...header(2, ['Name', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Present', '%']),
      { r: 3, c: 0, raw: 'Student A' },
      { r: 4, c: 0, raw: 'Student B' },
      { r: 5, c: 0, raw: 'Student C' },
    ],
  },

  // ── BUSINESS ─────────────────────────────────────────────────────────────────
  {
    id: 'sales-tracker', name: 'Sales Tracker', category: 'business',
    description: 'Monthly sales by rep with totals.',
    cols: 5, rows: 30, colWidths: { 0: 160, 1: 120, 2: 120, 3: 120, 4: 120 },
    cells: [
      { r: 0, c: 0, raw: 'Sales Tracker', style: { bold: true, color: '#1e3a5f' } },
      ...header(2, ['Rep', 'Q1', 'Q2', 'Q3', 'Q4']),
      { r: 3, c: 0, raw: 'Alex' }, { r: 3, c: 1, raw: '12000', style: MONEY }, { r: 3, c: 2, raw: '15000', style: MONEY }, { r: 3, c: 3, raw: '13000', style: MONEY }, { r: 3, c: 4, raw: '18000', style: MONEY },
      { r: 4, c: 0, raw: 'Sam' }, { r: 4, c: 1, raw: '9000', style: MONEY }, { r: 4, c: 2, raw: '11000', style: MONEY }, { r: 4, c: 3, raw: '14000', style: MONEY }, { r: 4, c: 4, raw: '16000', style: MONEY },
      { r: 6, c: 0, raw: 'Total', style: LABEL }, { r: 6, c: 1, raw: '=SUM(B4:B5)', style: TOTAL }, { r: 6, c: 2, raw: '=SUM(C4:C5)', style: TOTAL }, { r: 6, c: 3, raw: '=SUM(D4:D5)', style: TOTAL }, { r: 6, c: 4, raw: '=SUM(E4:E5)', style: TOTAL },
    ],
  },
  {
    id: 'kpi-dashboard', name: 'KPI Dashboard', category: 'business',
    description: 'Track key metrics vs. target.',
    cols: 4, rows: 20, colWidths: { 0: 220, 1: 120, 2: 120, 3: 120 },
    cells: [
      { r: 0, c: 0, raw: 'KPI Dashboard', style: { bold: true, color: '#1e3a5f' } },
      ...header(2, ['Metric', 'Target', 'Actual', '% to Target']),
      { r: 3, c: 0, raw: 'Revenue' }, { r: 3, c: 1, raw: '100000', style: MONEY }, { r: 3, c: 2, raw: '92000', style: MONEY }, { r: 3, c: 3, raw: '=C4/B4', style: PCT },
      { r: 4, c: 0, raw: 'New customers' }, { r: 4, c: 1, raw: '200' }, { r: 4, c: 2, raw: '175' }, { r: 4, c: 3, raw: '=C5/B5', style: PCT },
      { r: 5, c: 0, raw: 'Churn rate' }, { r: 5, c: 1, raw: '0.05', style: PCT }, { r: 5, c: 2, raw: '0.04', style: PCT }, { r: 5, c: 3, raw: '=B6/C6', style: PCT },
    ],
  },
];

export function officeTemplatesByCategory(cat: OfficeTemplateCategory | 'all'): OfficeTemplate[] {
  return cat === 'all' ? OFFICE_TEMPLATES : OFFICE_TEMPLATES.filter(t => t.category === cat);
}

export const OFFICE_TEMPLATE_CATEGORIES: { id: OfficeTemplateCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'finance', label: 'Finance' },
  { id: 'planning', label: 'Planning' },
  { id: 'tracking', label: 'Tracking' },
  { id: 'education', label: 'Education' },
  { id: 'business', label: 'Business' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Materialize → DocState (the exact shape Office's loadProject returns).
// ─────────────────────────────────────────────────────────────────────────────

export interface OfficeDocLike {
  name: string;
  sheets: {
    id: string; name: string;
    cells: Record<string, { raw: string; style?: CellStyleLike }>;
    cols: number; rows: number;
    colWidths: Record<number, number>;
    rowHeights: Record<number, number>;
  }[];
  activeSheetId: string;
  selection: { r: number; c: number; r2: number; c2: number };
  locale: string;
  currency: string;
}

let _oid = 0;
function osid() { return `os${++_oid}_${Math.random().toString(36).slice(2, 5)}`; }

export function materializeOfficeTemplate(t: OfficeTemplate, locale = 'en-US', currency = 'USD'): OfficeDocLike {
  const cells: Record<string, { raw: string; style?: CellStyleLike }> = {};
  for (const cell of t.cells) {
    cells[`${cell.r}_${cell.c}`] = { raw: cell.raw, style: cell.style };
  }
  const sheetId = osid();
  return {
    name: t.name,
    sheets: [{
      id: sheetId, name: t.name,
      cells,
      cols: t.cols, rows: t.rows,
      colWidths: { ...(t.colWidths || {}) },
      rowHeights: {},
    }],
    activeSheetId: sheetId,
    selection: { r: 0, c: 0, r2: 0, c2: 0 },
    locale, currency,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail: a small spreadsheet preview (header band + a few zebra rows).
// ─────────────────────────────────────────────────────────────────────────────

export function renderOfficeThumb(t: OfficeTemplate, w = 360, h = 220): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.dataset.nowm = '1';
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);

  // Find the bounding region of authored cells to scale the preview grid.
  let maxR = 0, maxC = 0;
  for (const cell of t.cells) { maxR = Math.max(maxR, cell.r); maxC = Math.max(maxC, cell.c); }
  const showR = Math.min(maxR + 1, 9);
  const showC = Math.min(maxC + 1, 6);
  const padX = 12, padY = 12;
  const gridW = w - padX * 2, gridH = h - padY * 2;
  const cw = gridW / Math.max(1, showC);
  const ch = gridH / Math.max(1, showR);

  const byPos = new Map(t.cells.map(cell => [`${cell.r}_${cell.c}`, cell]));

  for (let r = 0; r < showR; r++) {
    for (let cc = 0; cc < showC; cc++) {
      const x = padX + cc * cw, y = padY + r * ch;
      const cell = byPos.get(`${r}_${cc}`);
      const bg = cell?.style?.bg;
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, cw, ch); }
      else if (r % 2 === 1) { ctx.fillStyle = '#f1f5f9'; ctx.fillRect(x, y, cw, ch); }
      // grid lines
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.strokeRect(x, y, cw, ch);
      // text
      if (cell && cell.raw) {
        const isHead = cell.style?.bg === '#1e3a5f';
        ctx.fillStyle = cell.style?.color || (isHead ? '#ffffff' : '#0f172a');
        ctx.font = `${cell.style?.bold ? '700' : '400'} ${Math.min(11, ch * 0.5)}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        const align = cell.style?.align || 'left';
        ctx.textAlign = align;
        const tx = align === 'center' ? x + cw / 2 : align === 'right' ? x + cw - 4 : x + 4;
        let label = cell.raw.startsWith('=') ? '∑' : cell.raw;
        // clip label to cell width
        while (label.length > 1 && ctx.measureText(label).width > cw - 6) label = label.slice(0, -1);
        ctx.fillText(label, tx, y + ch / 2);
      }
    }
  }
  return c.toDataURL('image/png');
}
