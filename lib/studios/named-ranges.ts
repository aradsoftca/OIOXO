export interface NamedRange {
  name: string;
  sheetId: string;
  ref: string;
  comment?: string;
}

export class NamedRangesModel {
  private ranges = new Map<string, NamedRange>();
  private listeners: Array<(ranges: NamedRange[]) => void> = [];

  getAll(): NamedRange[] { return Array.from(this.ranges.values()); }
  get(name: string): NamedRange | undefined { return this.ranges.get(name.toUpperCase()); }
  has(name: string): boolean { return this.ranges.has(name.toUpperCase()); }

  setAll(ranges: NamedRange[]): void {
    this.ranges.clear();
    for (const r of ranges) this.ranges.set(r.name.toUpperCase(), r);
    this.notify();
  }

  add(range: NamedRange): boolean {
    const key = range.name.toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(range.name)) return false;
    if (this.ranges.has(key)) return false;
    this.ranges.set(key, range);
    this.notify();
    return true;
  }

  update(name: string, mut: (r: NamedRange) => void): void {
    const r = this.ranges.get(name.toUpperCase());
    if (!r) return;
    mut(r);
    this.notify();
  }

  remove(name: string): boolean {
    const ok = this.ranges.delete(name.toUpperCase());
    if (ok) this.notify();
    return ok;
  }

  onChange(fn: (ranges: NamedRange[]) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify() {
    const all = this.getAll();
    for (const l of this.listeners) l(all);
  }

  resolveInFormula(formula: string): string {
    if (!this.ranges.size) return formula;
    let result = formula;
    for (const r of this.ranges.values()) {
      // Escape the name before injecting into a regex. add() validates the
      // pattern, but setAll() and project-load paths don't — a saved project
      // with a `.*` named range would otherwise rewrite the whole formula.
      const safe = r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${safe}\\b`, 'gi');
      result = result.replace(re, r.ref);
    }
    return result;
  }
}

export interface DataValidation {
  kind: 'list' | 'number' | 'date' | 'text-length' | 'custom';
  list?: string[];
  range?: string;
  min?: number;
  max?: number;
  message?: string;
  showError: boolean;
  allowBlank: boolean;
}

export interface DataValidationRule {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
  validation: DataValidation;
}

export class DataValidationModel {
  private rules: DataValidationRule[] = [];
  private listeners: Array<(rules: DataValidationRule[]) => void> = [];

  getAll(): DataValidationRule[] { return [...this.rules]; }

  forCell(r: number, c: number): DataValidation | null {
    for (const rule of this.rules) {
      if (r >= rule.r0 && r <= rule.r1 && c >= rule.c0 && c <= rule.c1) return rule.validation;
    }
    return null;
  }

  add(rule: DataValidationRule): void {
    this.rules.push(rule);
    this.notify();
  }

  remove(index: number): void {
    this.rules.splice(index, 1);
    this.notify();
  }

  setAll(rules: DataValidationRule[]): void {
    this.rules = rules;
    this.notify();
  }

  onChange(fn: (rules: DataValidationRule[]) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private notify() {
    for (const l of this.listeners) l([...this.rules]);
  }

  validate(value: any, validation: DataValidation): { ok: boolean; message?: string } {
    const s = String(value ?? '').trim();
    if (s === '' && validation.allowBlank) return { ok: true };
    switch (validation.kind) {
      case 'list': {
        const list = validation.list ?? [];
        if (!list.length) return { ok: true };
        if (!list.includes(s)) return { ok: false, message: validation.message ?? `Must be one of: ${list.join(', ')}` };
        return { ok: true };
      }
      case 'number': {
        const n = parseFloat(s);
        if (isNaN(n)) return { ok: false, message: validation.message ?? 'Must be a number' };
        if (validation.min != null && n < validation.min) return { ok: false, message: `Must be ≥ ${validation.min}` };
        if (validation.max != null && n > validation.max) return { ok: false, message: `Must be ≤ ${validation.max}` };
        return { ok: true };
      }
      case 'date': {
        const d = Date.parse(s);
        if (isNaN(d)) return { ok: false, message: validation.message ?? 'Must be a date' };
        return { ok: true };
      }
      case 'text-length': {
        if (validation.min != null && s.length < validation.min) return { ok: false, message: `Min ${validation.min} chars` };
        if (validation.max != null && s.length > validation.max) return { ok: false, message: `Max ${validation.max} chars` };
        return { ok: true };
      }
      default:
        return { ok: true };
    }
  }
}
