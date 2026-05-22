'use client';
import * as React from 'react';
import { Printer } from 'lucide-react';

const DEFAULT = {
  name: 'Alex Carter',
  title: 'Senior Software Engineer',
  contact: 'alex@example.com  ·  +1 (555) 010-2090  ·  Lisbon, Portugal',
  summary: 'Engineer focused on durable systems, fast UI, and small teams.',
  experience: `Acme Co. — Senior Engineer  ·  2022–present
Led the migration from monolith to event-driven services. Cut cold-start latency 7×.

Acme Co. — Engineer  ·  2019–2022
Built the public API platform from zero, now serving 12k req/s peak.`,
  skills: 'TypeScript, Go, Postgres, OpenTelemetry, React, Tailwind, Docker, AWS, GCP',
  education: `Universidade de Lisboa  ·  BSc Computer Science  ·  2015–2019`,
};

export default function Tool() {
  const [data, setData] = React.useState(DEFAULT);

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .resume-page { box-shadow: none; border: 0; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-end">
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 bg-[var(--color-cat-generator)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110">
          <Printer className="h-3.5 w-3.5" /> Print / save PDF
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {/* Editor */}
        <div className="no-print space-y-3">
          {(['name', 'title', 'contact', 'summary', 'experience', 'skills', 'education'] as const).map((k) => (
            <label key={k} className="block border border-black/[0.08] bg-[var(--color-surface-1)] p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{k}</div>
              <textarea
                value={data[k]}
                onChange={(e) => setData((d) => ({ ...d, [k]: e.target.value }))}
                rows={k === 'experience' ? 8 : k === 'summary' || k === 'education' ? 3 : 1}
                className="mt-1 w-full resize-none bg-transparent text-[13px] text-[var(--color-fg)] outline-none"
              />
            </label>
          ))}
        </div>

        {/* Preview */}
        <div className="resume-page border border-black/[0.08] bg-white p-8 text-[var(--color-fg)] shadow-sm md:p-12">
          <div className="border-b border-black/[0.15] pb-4">
            <h1 className="text-[36px] font-bold leading-tight tracking-tight">{data.name}</h1>
            <div className="mt-1 text-[14px] uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">{data.title}</div>
            <div className="mt-2 text-[12px] text-[var(--color-fg-muted)]">{data.contact}</div>
          </div>

          {data.summary && (
            <section className="mt-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Summary</div>
              <p className="mt-2 text-[13px] leading-relaxed">{data.summary}</p>
            </section>
          )}

          {data.experience && (
            <section className="mt-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Experience</div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{data.experience}</pre>
            </section>
          )}

          {data.skills && (
            <section className="mt-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Skills</div>
              <p className="mt-2 text-[13px] leading-relaxed">{data.skills}</p>
            </section>
          )}

          {data.education && (
            <section className="mt-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-muted)]">Education</div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{data.education}</pre>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
