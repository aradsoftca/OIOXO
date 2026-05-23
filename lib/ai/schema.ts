/**
 * Xonvert AI — typed tool schema (Task Brain, layer 1).
 *
 * For the brain to COMPOSE tools ("make an image with my loan calculation on
 * it"), it must know each tool's types: what it needs in, what it puts out, and
 * which named parameters it requires. That typing is what makes composition
 * decidable — tool B can follow tool A iff A's output type fits one of B's
 * slots. We don't hand-author 323 schemas: most are DERIVED from the registry
 * (accepts/produces MIME + category), with precise OVERRIDES only for the tools
 * that carry real parameters or take part in cross-type composition.
 *
 * Pure / DOM-free / Node-testable.
 */

import { docById, type IndexDoc } from './tool-index';

// The value types that flow between tools. `data`/`number`/`text` are the
// "computed result" types a calculator or lookup produces; the rest are media.
export type ValueType =
  | 'image' | 'audio' | 'video' | 'pdf' | 'doc' | 'text' | 'number' | 'color' | 'data' | 'none';

export type SlotType =
  | 'number' | 'integer' | 'percent' | 'currency' | 'years' | 'text' | 'color'
  | 'dimensions' | 'duration' | 'enum'
  | 'file-image' | 'file-audio' | 'file-video' | 'file-pdf' | 'file-doc' | 'file-text';

export interface Slot {
  name: string;
  type: SlotType;
  required?: boolean;
  /** The crisp question to ask when this slot is missing and has no default. */
  question?: string;
  /** Tappable answer chips for the question (re-runnable phrases or values). */
  options?: { label: string; value: string }[];
  /** If set, this slot can be FILLED by an upstream tool whose output is this
   *  ValueType — that's how a calc result flows into an image's text slot. */
  from?: ValueType;
  default?: string | number;
}

export interface ToolSchema {
  id: string;
  consumes: ValueType[];   // input media it accepts (empty = needs no file)
  produces: ValueType;     // its output type
  slots: Slot[];           // typed parameters
}

// MIME → ValueType.
function mimeType(mimes: string[]): ValueType | null {
  const a = mimes.join(' ');
  if (/image\//.test(a)) return 'image';
  if (/audio\//.test(a)) return 'audio';
  if (/video\//.test(a)) return 'video';
  if (/pdf/.test(a)) return 'pdf';
  if (/word|opendocument|rtf|msword|officedocument\.word/.test(a)) return 'doc';
  if (/text|json|csv|xml|html/.test(a)) return 'text';
  return null;
}

// Categories whose tools compute a value rather than transform a file.
const COMPUTE_CATS = new Set(['calculator', 'finance', 'time']);

function deriveProduces(doc: IndexDoc): ValueType {
  const p = mimeType(doc.produces);
  if (p) return p;
  if (COMPUTE_CATS.has(doc.category)) return 'number';
  if (doc.category === 'generator') return /qr|poster|barcode|placeholder|og|avatar|pattern/.test(doc.id) ? 'image' : 'text';
  return 'data';
}

function deriveConsumes(doc: IndexDoc): ValueType[] {
  const c = mimeType(doc.accepts);
  return c ? [c] : [];
}

// Reusable slot definitions for the composition-critical tools.
const TEXT_CONTENT = (q: string): Slot => ({ name: 'text', type: 'text', required: true, question: q, from: 'text' });
const LOAN_SLOTS: Slot[] = [
  { name: 'amount', type: 'currency', required: true, question: 'What’s the loan amount?', options: [{ label: '$100,000', value: '100000' }, { label: '$300,000', value: '300000' }, { label: '$500,000', value: '500000' }] },
  { name: 'rate', type: 'percent', required: true, question: 'What’s the interest rate?', options: [{ label: '4%', value: '4' }, { label: '6%', value: '6' }, { label: '7.5%', value: '7.5' }] },
  { name: 'years', type: 'years', required: true, question: 'Over how many years?', options: [{ label: '15 years', value: '15' }, { label: '25 years', value: '25' }, { label: '30 years', value: '30' }] },
];

/**
 * Explicit schemas for tools that carry real parameters or compose across types.
 * Everything else is derived. Keep this focused on the tools the planner needs
 * to reason about precisely; the long tail is fine on defaults.
 */
const OVERRIDES: Record<string, Partial<ToolSchema>> = {
  // Finance — produce a TEXT result that can flow into a renderer.
  'finance-mortgage': { consumes: [], produces: 'text', slots: LOAN_SLOTS },
  'finance-investment': { consumes: [], produces: 'text', slots: [
    { name: 'amount', type: 'currency', required: true, question: 'How much are you investing?' },
    { name: 'rate', type: 'percent', required: true, question: 'At what annual return %?' },
    { name: 'years', type: 'years', required: true, question: 'For how many years?' },
  ] },
  'finance-savings': { consumes: [], produces: 'text', slots: [
    { name: 'amount', type: 'currency', required: true, question: 'How much will you save each month?' },
    { name: 'rate', type: 'percent', required: true, question: 'At what annual rate %?' },
    { name: 'years', type: 'years', required: true, question: 'For how many years?' },
  ] },
  // Text-onto-image: consumes an image + a TEXT content slot a producer can fill.
  'image-add-text': { consumes: ['image'], produces: 'image', slots: [TEXT_CONTENT('What text should I put on the image?')] },
  'image-watermark': { consumes: ['image'], produces: 'image', slots: [TEXT_CONTENT('What should the watermark say?')] },
  'gen-qr-code': { consumes: [], produces: 'image', slots: [{ name: 'text', type: 'text', required: true, question: 'What link or text should the QR encode?', from: 'text' }] },
  'pdf-watermark': { consumes: ['pdf'], produces: 'pdf', slots: [TEXT_CONTENT('What should the watermark say?')] },
  'image-resize': { consumes: ['image'], produces: 'image', slots: [{ name: 'size', type: 'dimensions', required: true, question: 'What size would you like?', options: [
    { label: '800px wide', value: '800 wide' }, { label: '1280×720', value: '1280x720' }, { label: 'Half size', value: '50%' }, { label: 'Thumbnail', value: '320 wide' },
  ] }] },
  'audio-trim': { consumes: ['audio'], produces: 'audio', slots: [{ name: 'duration', type: 'duration', required: true, question: 'How much should I keep?', options: [
    { label: 'First 10s', value: 'first 10 seconds' }, { label: 'First 30s', value: 'first 30 seconds' }, { label: 'Last 10s', value: 'last 10 seconds' },
  ] }] },
};

/**
 * Synthetic capabilities the brain can compose INTO that aren't standalone
 * registry tools — they're inline generators the executor already has
 * (composePoster makes a titled graphic from text; the text→PDF engine makes a
 * document). Giving them schemas lets a producer's result flow into them.
 */
const SYNTHETIC: Record<string, ToolSchema & { name: string }> = {
  'render-poster': { id: 'render-poster', name: 'Image maker', consumes: [], produces: 'image', slots: [TEXT_CONTENT('What should the image say?')] },
  'render-pdf': { id: 'render-pdf', name: 'PDF maker', consumes: [], produces: 'pdf', slots: [TEXT_CONTENT('What should the PDF say?')] },
};

/** The typed schema for a tool — synthetic, or override merged over derived. */
export function toolSchema(id: string): ToolSchema | null {
  if (SYNTHETIC[id]) return SYNTHETIC[id];
  const doc = docById(id);
  if (!doc) return null;
  const base: ToolSchema = { id, consumes: deriveConsumes(doc), produces: deriveProduces(doc), slots: [] };
  const ov = OVERRIDES[id];
  return ov ? { ...base, ...ov, id } : base;
}

/** Display name for a tool or synthetic capability. */
export function toolName(id: string): string {
  if (SYNTHETIC[id]) return SYNTHETIC[id].name;
  return docById(id)?.name ?? id;
}

/** Tools that PRODUCE a text/number result usable as content elsewhere. */
export function isProducer(id: string): boolean {
  const s = toolSchema(id);
  return !!s && s.consumes.length === 0 && (s.produces === 'text' || s.produces === 'number');
}

/** Does a tool have a TEXT content slot an upstream result can fill? */
export function textContentSlot(id: string): Slot | null {
  const s = toolSchema(id);
  return s?.slots.find((sl) => sl.type === 'text' && sl.from === 'text') ?? null;
}
