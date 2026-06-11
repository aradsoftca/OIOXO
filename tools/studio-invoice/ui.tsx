'use client';

import * as React from 'react';
import { Plus, Trash2, Download, Upload, Palette } from 'lucide-react';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'studio-invoice';

/* ── types ── */
interface LineItem { id: string; description: string; quantity: number; unitPrice: number; }

interface InvoiceData {
  template: 'clean' | 'modern' | 'bold';
  accentColor: string;
  logo: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  fromCompany: string;
  fromAddress: string;
  fromEmail: string;
  toCompany: string;
  toAddress: string;
  toEmail: string;
  lineItems: LineItem[];
  discountType: 'percentage' | 'flat';
  discountValue: number;
  taxRate: number;
  currency: string;
  paymentTerms: string;
  notes: string;
}

const CURRENCIES: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹', CAD: 'C$', AUD: 'A$' };
const ACCENT_PRESETS = ['#2563eb', '#7c3aed', '#059669', '#dc2626', '#d97706', '#0891b2', '#db2777', '#4f46e5'];
function uid() { return Math.random().toString(36).slice(2, 9); }
function today() { return new Date().toISOString().slice(0, 10); }
function in30() { return new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10); }

export default function Tool() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const previewRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = React.useState(false);
  const [tab, setTab] = React.useState<'details' | 'items' | 'extras'>('details');
  const { guard, gate } = useUsageGate('studio-invoice');

  const [d, setD] = React.useState<InvoiceData>({
    template: 'clean', accentColor: '#2563eb', logo: null,
    invoiceNumber: 'INV-0042', invoiceDate: today(), dueDate: in30(),
    fromCompany: 'Acme Design Co.', fromAddress: '350 Fifth Avenue, Suite 4200\nNew York, NY 10118', fromEmail: 'billing@acmedesign.co',
    toCompany: 'Riverside Technologies', toAddress: '88 Harbourfront Walk\nSingapore 098585', toEmail: 'accounts@riverside.tech',
    lineItems: [
      { id: uid(), description: 'Brand Identity Design — Logo, color palette, typography', quantity: 1, unitPrice: 4500 },
      { id: uid(), description: 'Marketing Website — 8 pages, responsive, CMS', quantity: 1, unitPrice: 8200 },
      { id: uid(), description: 'UI/UX Consultation — Strategy sessions & wireframes', quantity: 12, unitPrice: 175 },
    ],
    discountType: 'percentage', discountValue: 5, taxRate: 8.875,
    currency: 'USD', paymentTerms: 'Net 30',
    notes: 'Payment via bank transfer. Account details on file.\nLate payments subject to 1.5% monthly interest.',
  });

  const sym = CURRENCIES[d.currency] ?? '$';
  const fmt = (n: number) => `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const subtotal = d.lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const discountAmt = d.discountType === 'percentage' ? subtotal * (d.discountValue / 100) : d.discountValue;
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * (d.taxRate / 100);
  const total = afterDiscount + taxAmt;

  const up = <K extends keyof InvoiceData>(k: K, v: InvoiceData[K]) => setD(p => ({ ...p, [k]: v }));
  const updateItem = (id: string, f: keyof LineItem, v: string | number) =>
    setD(p => ({ ...p, lineItems: p.lineItems.map(i => i.id === id ? { ...i, [f]: v } : i) }));

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => up('logo', reader.result as string);
    reader.readAsDataURL(file);
  };

  const exportPDF = async () => {
    if (!previewRef.current) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, []);
    if (!ok) return;
    if (!(await guard())) return;
    setExporting(true);
    try {
      // Real-text PDF (pdf-lib) — was html2canvas→addImage, an image PDF that
      // accounting systems can't parse and have to re-key by hand. Now a real
      // line-item table with selectable figures and the subtotal/tax/total math.
      const { buildInvoicePdf } = await import('@/lib/studios');
      const blob = await buildInvoicePdf({
        accentColor: d.accentColor, logo: d.logo,
        invoiceNumber: d.invoiceNumber, invoiceDate: d.invoiceDate, dueDate: d.dueDate,
        fromCompany: d.fromCompany, fromAddress: d.fromAddress, fromEmail: d.fromEmail,
        toCompany: d.toCompany, toAddress: d.toAddress, toEmail: d.toEmail,
        lineItems: d.lineItems.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
        discountType: d.discountType, discountValue: d.discountValue, taxRate: d.taxRate,
        currencySymbol: CURRENCIES[d.currency] ?? '$',
        paymentTerms: d.paymentTerms, notes: d.notes,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${d.invoiceNumber || 'invoice'}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { /* noop */ } finally { setExporting(false); }
  };

  const cls = (base: string, active: boolean) =>
    `${base} ${active ? 'bg-[var(--color-cat-generator)] text-white' : 'bg-transparent text-[var(--color-fg-muted)] hover:bg-black/5'}`;

  return (
    <div className="space-y-4">
      {gate}
      {policyGate.element}
      {/* toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1">
          {(['clean', 'modern', 'bold'] as const).map(t => (
            <button key={t} onClick={() => up('template', t)}
              className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors rounded ${d.template === t ? 'bg-[var(--color-cat-generator)] text-white' : 'text-[var(--color-fg-muted)] hover:bg-black/5'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {ACCENT_PRESETS.slice(0, 5).map(c => (
              <button key={c} onClick={() => up('accentColor', c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${d.accentColor === c ? 'border-[var(--color-fg)] scale-110' : 'border-transparent'}`}
                style={{ background: c }} />
            ))}
          </div>
          <button onClick={exportPDF} disabled={exporting}
            className="flex items-center gap-2 bg-[var(--color-cat-generator)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* controls tabs */}
      <div className="flex gap-1 border-b border-black/[0.08] pb-0">
        {(['details', 'items', 'extras'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${tab === t ? 'border-[var(--color-cat-generator)] text-[var(--color-fg)]' : 'border-transparent text-[var(--color-fg-muted)]'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Logo</label>
            <div onClick={() => fileRef.current?.click()} className="cursor-pointer border border-dashed border-black/[0.08] p-3 text-center rounded">
              {d.logo ? (
                <div className="relative inline-block">
                  <img src={d.logo} alt="Logo" className="max-h-10 object-contain" />
                  <button onClick={e => { e.stopPropagation(); up('logo', null); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">×</button>
                </div>
              ) : <Upload className="w-5 h-5 mx-auto text-[var(--color-fg-muted)]" />}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
            </div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Invoice #</label>
            <input value={d.invoiceNumber} onChange={e => up('invoiceNumber', e.target.value)} className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Date</label><input type="date" value={d.invoiceDate} onChange={e => up('invoiceDate', e.target.value)} className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" /></div>
              <div><label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Due</label><input type="date" value={d.dueDate} onChange={e => up('dueDate', e.target.value)} className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Currency</label>
                <select value={d.currency} onChange={e => up('currency', e.target.value)} className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none">
                  {Object.keys(CURRENCIES).map(c => <option key={c} value={c}>{c} ({CURRENCIES[c]})</option>)}
                </select>
              </div>
              <div><label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Terms</label>
                <input value={d.paymentTerms} onChange={e => up('paymentTerms', e.target.value)} className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">From</label>
            <input value={d.fromCompany} onChange={e => up('fromCompany', e.target.value)} placeholder="Company" className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
            <textarea value={d.fromAddress} onChange={e => up('fromAddress', e.target.value)} rows={2} className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none resize-none" />
            <input value={d.fromEmail} onChange={e => up('fromEmail', e.target.value)} placeholder="Email" className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)] mt-2 block">Bill To</label>
            <input value={d.toCompany} onChange={e => up('toCompany', e.target.value)} placeholder="Client" className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
            <textarea value={d.toAddress} onChange={e => up('toAddress', e.target.value)} rows={2} className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none resize-none" />
            <input value={d.toEmail} onChange={e => up('toEmail', e.target.value)} placeholder="Email" className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
          </div>
        </div>
      )}

      {tab === 'items' && (
        <div className="space-y-2">
          {d.lineItems.map((item, i) => (
            <div key={item.id} className="flex gap-2 items-start border border-black/[0.06] p-2 rounded">
              <input value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} placeholder="Description" className="flex-1 border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
              <input type="number" value={item.quantity} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value) || 0)} className="w-16 border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none text-right" />
              <input type="number" value={item.unitPrice} onChange={e => updateItem(item.id, 'unitPrice', Number(e.target.value) || 0)} className="w-24 border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none text-right" />
              <span className="w-24 py-1.5 text-[13px] font-mono text-right">{fmt(item.quantity * item.unitPrice)}</span>
              <button onClick={() => setD(p => ({ ...p, lineItems: p.lineItems.filter(x => x.id !== item.id) }))} className="text-[var(--color-fg-subtle)] hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={() => setD(p => ({ ...p, lineItems: [...p.lineItems, { id: uid(), description: '', quantity: 1, unitPrice: 0 }] }))}
            className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]">
            <Plus className="h-3 w-3" /> Add line
          </button>
        </div>
      )}

      {tab === 'extras' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Discount</label>
              <div className="flex gap-1">
                <input type="number" value={d.discountValue} onChange={e => up('discountValue', Number(e.target.value) || 0)} className="flex-1 border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
                <select value={d.discountType} onChange={e => up('discountType', e.target.value as 'percentage' | 'flat')} className="w-12 border border-black/[0.08] bg-transparent text-[12px] outline-none">
                  <option value="percentage">%</option>
                  <option value="flat">{sym}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Tax %</label>
              <input type="number" value={d.taxRate} onChange={e => up('taxRate', Number(e.target.value) || 0)} className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">Notes</label>
            <textarea value={d.notes} onChange={e => up('notes', e.target.value)} rows={3} className="w-full border border-black/[0.08] bg-transparent px-2 py-1.5 text-[13px] outline-none resize-none" />
          </div>
          <div className="text-[13px] space-y-1">
            <div className="flex justify-between"><span className="text-[var(--color-fg-muted)]">Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
            {d.discountValue > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span className="font-mono">−{fmt(discountAmt)}</span></div>}
            {d.taxRate > 0 && <div className="flex justify-between"><span className="text-[var(--color-fg-muted)]">Tax ({d.taxRate}%)</span><span className="font-mono">{fmt(taxAmt)}</span></div>}
            <div className="flex justify-between border-t border-black/[0.15] pt-2 text-[16px] font-bold"><span>Total</span><span className="font-mono">{fmt(total)}</span></div>
          </div>
        </div>
      )}

      {/* ── Preview ── (the invoice is a fixed paper layout; on a narrow phone its
          line-item table is a few px wider than the column, so let the paper scroll
          horizontally within this wrapper instead of pushing the whole page. The
          previewRef stays the inner paper so html2canvas export is unaffected.) */}
      <div className="overflow-x-auto">
      <div ref={previewRef} className="border border-black/[0.08] bg-white shadow-sm" style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#1a1a1a' }}>
        {d.template === 'clean' && (
          <div className="p-8 md:p-10">
            <div className="flex items-start justify-between gap-4 mb-6 pb-4" style={{ borderBottom: `2px solid ${d.accentColor}` }}>
              <div>{d.logo && <img src={d.logo} alt="" className="max-h-12 mb-2 object-contain" />}<h2 className="text-2xl font-bold" style={{ color: d.accentColor }}>INVOICE</h2></div>
              <div className="text-right text-sm"><div className="font-bold text-lg" style={{ color: d.accentColor }}>{d.invoiceNumber}</div><div className="text-gray-500 text-xs">Issued: {d.invoiceDate}</div><div className="text-gray-500 text-xs">Due: {d.dueDate}</div></div>
            </div>
            <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
              <div><div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: d.accentColor }}>From</div><div className="font-semibold">{d.fromCompany}</div><div className="text-xs text-gray-500 whitespace-pre-line">{d.fromAddress}</div><div className="text-xs text-gray-500">{d.fromEmail}</div></div>
              <div><div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: d.accentColor }}>Bill To</div><div className="font-semibold">{d.toCompany}</div><div className="text-xs text-gray-500 whitespace-pre-line">{d.toAddress}</div><div className="text-xs text-gray-500">{d.toEmail}</div></div>
            </div>
            <table className="w-full text-sm mb-4"><thead><tr style={{ background: `${d.accentColor}10` }}><th className="text-left py-2 px-3 text-xs font-bold uppercase" style={{ color: d.accentColor }}>Description</th><th className="text-center py-2 px-3 text-xs font-bold uppercase w-16" style={{ color: d.accentColor }}>Qty</th><th className="text-right py-2 px-3 text-xs font-bold uppercase w-24" style={{ color: d.accentColor }}>Price</th><th className="text-right py-2 px-3 text-xs font-bold uppercase w-24" style={{ color: d.accentColor }}>Total</th></tr></thead><tbody>
              {d.lineItems.map((item, i) => (<tr key={item.id} className={i % 2 === 1 ? 'bg-gray-50' : ''} style={{ borderBottom: '1px solid #eee' }}><td className="py-2 px-3">{item.description}</td><td className="py-2 px-3 text-center">{item.quantity}</td><td className="py-2 px-3 text-right font-mono">{fmt(item.unitPrice)}</td><td className="py-2 px-3 text-right font-mono font-semibold">{fmt(item.quantity * item.unitPrice)}</td></tr>))}
            </tbody></table>
            <div className="flex justify-end"><div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
              {d.discountValue > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span className="font-mono">−{fmt(discountAmt)}</span></div>}
              {d.taxRate > 0 && <div className="flex justify-between"><span className="text-gray-500">Tax ({d.taxRate}%)</span><span className="font-mono">{fmt(taxAmt)}</span></div>}
              <div className="flex justify-between pt-2 text-lg font-bold" style={{ borderTop: `2px solid ${d.accentColor}`, color: d.accentColor }}><span>Total Due</span><span className="font-mono">{fmt(total)}</span></div>
            </div></div>
            {d.notes && <div className="mt-6 pt-3 border-t border-gray-200"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Notes</div><div className="text-xs text-gray-500 whitespace-pre-line">{d.notes}</div></div>}
          </div>
        )}

        {d.template === 'modern' && (
          <div className="flex min-h-[600px]">
            <div className="w-[180px] shrink-0 p-5 text-white" style={{ background: `linear-gradient(180deg, ${d.accentColor}, ${d.accentColor}dd)` }}>
              {d.logo && <div className="mb-4 p-1.5 bg-white/20 rounded inline-block"><img src={d.logo} alt="" className="max-h-8 object-contain" /></div>}
              <div className="space-y-4 text-xs">
                <div><div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/60 mb-0.5">From</div><div className="font-semibold text-sm">{d.fromCompany}</div><div className="text-white/70 whitespace-pre-line mt-0.5">{d.fromAddress}</div><div className="text-white/70">{d.fromEmail}</div></div>
                <div><div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/60 mb-0.5">Bill To</div><div className="font-semibold text-sm">{d.toCompany}</div><div className="text-white/70 whitespace-pre-line mt-0.5">{d.toAddress}</div><div className="text-white/70">{d.toEmail}</div></div>
                <div className="pt-3 border-t border-white/20"><div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/60 mb-0.5">Total Due</div><div className="text-xl font-bold">{fmt(total)}</div></div>
              </div>
            </div>
            <div className="flex-1 p-6">
              <h2 className="text-2xl font-black mb-1" style={{ color: d.accentColor }}>INVOICE</h2>
              <div className="text-sm text-gray-400 mb-4">{d.invoiceNumber} · Due {d.dueDate}</div>
              <table className="w-full text-sm mb-4"><thead><tr style={{ borderBottom: `2px solid ${d.accentColor}` }}><th className="text-left py-1.5 text-xs font-bold uppercase text-gray-400">Description</th><th className="text-center py-1.5 text-xs font-bold uppercase text-gray-400 w-12">Qty</th><th className="text-right py-1.5 text-xs font-bold uppercase text-gray-400 w-20">Price</th><th className="text-right py-1.5 text-xs font-bold uppercase text-gray-400 w-20">Total</th></tr></thead><tbody>
                {d.lineItems.map(item => (<tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}><td className="py-2">{item.description}</td><td className="py-2 text-center">{item.quantity}</td><td className="py-2 text-right font-mono">{fmt(item.unitPrice)}</td><td className="py-2 text-right font-mono font-semibold">{fmt(item.quantity * item.unitPrice)}</td></tr>))}
              </tbody></table>
              <div className="flex justify-end"><div className="w-56 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
                {d.discountValue > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span className="font-mono">−{fmt(discountAmt)}</span></div>}
                {d.taxRate > 0 && <div className="flex justify-between"><span className="text-gray-400">Tax</span><span className="font-mono">{fmt(taxAmt)}</span></div>}
                <div className="flex justify-between pt-2 font-bold" style={{ borderTop: `2px solid ${d.accentColor}`, color: d.accentColor }}><span>Total</span><span className="font-mono">{fmt(total)}</span></div>
              </div></div>
              {d.notes && <div className="mt-4 pt-3 border-t border-gray-100"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-0.5">Notes</div><div className="text-xs text-gray-500 whitespace-pre-line">{d.notes}</div></div>}
            </div>
          </div>
        )}

        {d.template === 'bold' && (
          <div>
            <div className="px-8 py-6 text-white" style={{ background: `linear-gradient(135deg, ${d.accentColor}, #1a1a2e)` }}>
              <div className="flex items-start justify-between gap-4">
                <div>{d.logo && <img src={d.logo} alt="" className="max-h-10 object-contain brightness-0 invert mb-2" />}<h2 className="text-3xl font-black tracking-tighter">INVOICE</h2><div className="text-white/60 text-sm">{d.invoiceNumber}</div></div>
                <div className="text-right"><div className="text-2xl font-black">{fmt(total)}</div><div className="text-white/60 text-xs">Due {d.dueDate}</div></div>
              </div>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="p-3 rounded bg-gray-50"><div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: d.accentColor }}>From</div><div className="text-sm font-semibold">{d.fromCompany}</div><div className="text-xs text-gray-500 whitespace-pre-line">{d.fromAddress}</div><div className="text-xs text-gray-500">{d.fromEmail}</div></div>
                <div className="p-3 rounded bg-gray-50"><div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: d.accentColor }}>Bill To</div><div className="text-sm font-semibold">{d.toCompany}</div><div className="text-xs text-gray-500 whitespace-pre-line">{d.toAddress}</div><div className="text-xs text-gray-500">{d.toEmail}</div></div>
              </div>
              <table className="w-full text-sm mb-4"><thead><tr style={{ background: d.accentColor }} className="text-white"><th className="text-left py-2.5 px-3 text-xs font-bold uppercase rounded-l">Description</th><th className="text-center py-2.5 px-3 text-xs font-bold uppercase w-14">Qty</th><th className="text-right py-2.5 px-3 text-xs font-bold uppercase w-20">Price</th><th className="text-right py-2.5 px-3 text-xs font-bold uppercase w-20 rounded-r">Total</th></tr></thead><tbody>
                {d.lineItems.map((item, i) => (<tr key={item.id} className={i % 2 === 0 ? '' : 'bg-gray-50'} style={{ borderBottom: '1px solid #eee' }}><td className="py-2.5 px-3">{item.description}</td><td className="py-2.5 px-3 text-center">{item.quantity}</td><td className="py-2.5 px-3 text-right font-mono">{fmt(item.unitPrice)}</td><td className="py-2.5 px-3 text-right font-mono font-bold">{fmt(item.quantity * item.unitPrice)}</td></tr>))}
              </tbody></table>
              <div className="flex justify-end"><div className="w-64 rounded overflow-hidden border border-gray-200">
                <div className="flex justify-between px-3 py-1.5 bg-gray-50 text-sm"><span className="text-gray-500">Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
                {d.discountValue > 0 && <div className="flex justify-between px-3 py-1.5 text-sm text-red-600"><span>Discount</span><span className="font-mono">−{fmt(discountAmt)}</span></div>}
                {d.taxRate > 0 && <div className="flex justify-between px-3 py-1.5 bg-gray-50 text-sm"><span className="text-gray-500">Tax</span><span className="font-mono">{fmt(taxAmt)}</span></div>}
                <div className="flex justify-between px-3 py-2.5 text-white font-bold" style={{ background: d.accentColor }}><span>Total Due</span><span className="font-mono">{fmt(total)}</span></div>
              </div></div>
              {d.notes && <div className="mt-6 pt-3 border-t border-gray-200"><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">Notes</div><div className="text-xs text-gray-500 whitespace-pre-line">{d.notes}</div></div>}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
