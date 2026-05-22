'use client';
import * as React from 'react';
import { Plus, X, Printer } from 'lucide-react';

interface LineItem { description: string; quantity: number; rate: number }

export default function Tool() {
  const [number, setNumber] = React.useState('INV-001');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [due, setDue] = React.useState(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [from, setFrom] = React.useState('Your Company\n123 Main St\nCity, ZIP\ncontact@yourco.com');
  const [to, setTo] = React.useState('Client Name\nClient Address\nCity, ZIP');
  const [items, setItems] = React.useState<LineItem[]>([
    { description: 'Design work', quantity: 10, rate: 80 },
    { description: 'Implementation', quantity: 20, rate: 95 },
  ]);
  const [taxRate, setTaxRate] = React.useState(0);
  const [currency, setCurrency] = React.useState('USD');
  const [notes, setNotes] = React.useState('Thanks for your business.');

  const subtotal = items.reduce((s, i) => s + i.quantity * i.rate, 0);
  const tax = subtotal * taxRate / 100;
  const total = subtotal + tax;
  const fmt = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-canvas { padding: 0; box-shadow: none; border: 0; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <input value={number} onChange={(e) => setNumber(e.target.value)} className="border border-black/[0.08] bg-transparent px-2 py-1.5 font-mono text-[13px] outline-none" />
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} className="w-20 border border-black/[0.08] bg-transparent px-2 py-1.5 font-mono text-[13px] outline-none" maxLength={3} />
          <label className="flex items-center gap-1 border border-black/[0.08] px-2 py-1.5 text-[12px]">
            <span className="text-[var(--color-fg-muted)]">Tax</span>
            <input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} className="w-12 bg-transparent text-right font-mono text-[13px] outline-none" />
            <span className="text-[var(--color-fg-muted)]">%</span>
          </label>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-[var(--color-cat-generator)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110"
        >
          <Printer className="h-3.5 w-3.5" /> Print / save PDF
        </button>
      </div>

      <div className="print-canvas border border-black/[0.08] bg-white p-8 text-[var(--color-fg)] shadow-sm md:p-12">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Invoice</div>
            <div className="mt-1 font-mono text-[26px] font-bold tracking-tight">{number}</div>
          </div>
          <div className="text-right text-[12px] text-[var(--color-fg-muted)]">
            <div>Issued <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent font-mono text-[13px] outline-none" /></div>
            <div>Due <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="bg-transparent font-mono text-[13px] outline-none" /></div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">From</div>
            <textarea value={from} onChange={(e) => setFrom(e.target.value)} rows={4} className="mt-1 w-full resize-none bg-transparent text-[13px] outline-none" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Bill to</div>
            <textarea value={to} onChange={(e) => setTo(e.target.value)} rows={4} className="mt-1 w-full resize-none bg-transparent text-[13px] outline-none" />
          </div>
        </div>

        <table className="mt-8 w-full text-left">
          <thead>
            <tr className="border-b border-black/[0.1] text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
              <th className="py-2">Description</th>
              <th className="w-20 py-2 text-right">Qty</th>
              <th className="w-28 py-2 text-right">Rate</th>
              <th className="w-28 py-2 text-right">Amount</th>
              <th className="no-print w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-black/[0.05]">
                <td className="py-2"><input value={it.description} onChange={(e) => setItems((xs) => xs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} className="w-full bg-transparent text-[13px] outline-none" /></td>
                <td className="py-2 text-right"><input type="number" value={it.quantity} onChange={(e) => setItems((xs) => xs.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x))} className="w-full bg-transparent text-right font-mono text-[13px] outline-none" /></td>
                <td className="py-2 text-right"><input type="number" value={it.rate} onChange={(e) => setItems((xs) => xs.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) || 0 } : x))} className="w-full bg-transparent text-right font-mono text-[13px] outline-none" /></td>
                <td className="py-2 text-right font-mono text-[13px]">{fmt(it.quantity * it.rate)}</td>
                <td className="no-print py-2 text-right">
                  <button type="button" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          type="button"
          onClick={() => setItems((xs) => [...xs, { description: '', quantity: 1, rate: 0 }])}
          className="no-print mt-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          <Plus className="h-3 w-3" /> Add line
        </button>

        <div className="mt-8 flex justify-end">
          <div className="w-72 space-y-1 text-[13px]">
            <div className="flex justify-between"><span className="text-[var(--color-fg-muted)]">Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
            {taxRate > 0 && <div className="flex justify-between"><span className="text-[var(--color-fg-muted)]">Tax ({taxRate}%)</span><span className="font-mono">{fmt(tax)}</span></div>}
            <div className="flex justify-between border-t border-black/[0.15] pt-2 text-[16px] font-bold"><span>Total</span><span className="font-mono">{fmt(total)}</span></div>
          </div>
        </div>

        <div className="mt-8">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Notes</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full resize-none bg-transparent text-[12px] text-[var(--color-fg-muted)] outline-none" />
        </div>
      </div>
    </div>
  );
}
