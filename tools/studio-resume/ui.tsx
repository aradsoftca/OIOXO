'use client';

/**
 * Resume Studio — oioxo / newxonvert version
 * Simplified standalone component for the ToolFrame wrapper.
 * Full version lives at app/studios/resume/page.tsx in the main xonvert codebase.
 */

import { useState, useRef, useCallback } from 'react';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { enforcePolicy } from '@/lib/limits/server-check';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'studio-resume';

/* ─── Types ─── */
type Experience = { id: string; title: string; company: string; startDate: string; endDate: string; desc: string };
type Education  = { id: string; degree: string; school: string; startDate: string; endDate: string; gpa: string };
type Skill      = { id: string; name: string; level: number };

const uid = () => Math.random().toString(36).slice(2, 10);

/* ─── Component ─── */
export default function ResumeStudioUI() {
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [personal, setPersonal] = useState({
    name: 'Alexandra Chen', title: 'Senior Product Designer',
    email: 'alexandra.chen@email.com', phone: '+1 (415) 555-0198',
    location: 'San Francisco, CA', website: 'alexchen.design',
    summary: 'Award-winning product designer with 8+ years of experience crafting intuitive digital experiences for Fortune 500 companies.',
  });
  const [accentColor, setAccentColor] = useState('#4f46e5');
  const [experience, setExperience] = useState<Experience[]>([
    { id: uid(), title: 'Senior Product Designer', company: 'Stripe', startDate: 'Jan 2021', endDate: 'Present', desc: '• Redesigned the merchant dashboard serving 3.5M businesses globally\n• Established and maintained the Sail design system (200+ components)' },
    { id: uid(), title: 'Product Designer', company: 'Figma', startDate: 'Mar 2018', endDate: 'Dec 2020', desc: '• Designed collaborative editing features used by 4M+ designers' },
  ]);
  const [education, setEducation] = useState<Education[]>([
    { id: uid(), degree: 'B.F.A. Interaction Design', school: 'California College of the Arts', startDate: '2012', endDate: '2016', gpa: '3.9' },
  ]);
  const [skills, setSkills] = useState<Skill[]>([
    { id: uid(), name: 'Figma', level: 5 }, { id: uid(), name: 'Design Systems', level: 5 },
    { id: uid(), name: 'Prototyping', level: 4 }, { id: uid(), name: 'User Research', level: 4 },
  ]);

  const resumeRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const { guard, gate } = useUsageGate('studio-resume');

  const updateP = (f: string, v: string) => setPersonal(p => ({ ...p, [f]: v }));

  const exportPdf = useCallback(async () => {
    if (!resumeRef.current) return;
    const ok = await enforcePolicy(POLICY_KEY, isPro, policyGate.fire, [
      { type: 'format', format: 'pdf' },
    ]);
    if (!ok) return;
    if (!(await guard())) return;
    setIsExporting(true);
    try {
      // Real-text PDF (pdf-lib) — was html2canvas→addImage, which produced an
      // IMAGE PDF with no selectable text that fails every ATS parser. Now the
      // resume is laid out as embedded-font text runs: parseable, selectable,
      // and a fraction of the size.
      const { buildResumePdf } = await import('@/lib/studios');
      const blob = await buildResumePdf({ personal, experience, education, skills, accentColor });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Resume_${personal.name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      // Previously silently swallowed — user clicked Export, nothing
      // happened, no error message. Surface it so the failure is visible.
      setExportError((e as Error).message || 'Could not export the resume.');
    } finally {
      setIsExporting(false);
    }
  }, [personal, experience, education, skills, accentColor, isPro, policyGate.fire, guard]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, minHeight: 600 }}>
      {gate}
      {policyGate.element}
      {/* Editor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input placeholder="Full Name" value={personal.name} onChange={e => updateP('name', e.target.value)} style={inputStyle} />
          <input placeholder="Title" value={personal.title} onChange={e => updateP('title', e.target.value)} style={inputStyle} />
          <input placeholder="Email" value={personal.email} onChange={e => updateP('email', e.target.value)} style={inputStyle} />
          <input placeholder="Phone" value={personal.phone} onChange={e => updateP('phone', e.target.value)} style={inputStyle} />
          <input placeholder="Location" value={personal.location} onChange={e => updateP('location', e.target.value)} style={inputStyle} />
          <input placeholder="Website" value={personal.website} onChange={e => updateP('website', e.target.value)} style={inputStyle} />
        </div>
        <textarea placeholder="Summary" value={personal.summary} onChange={e => updateP('summary', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>Accent:</label>
          <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} style={{ width: 32, height: 32, cursor: 'pointer', border: 'none', borderRadius: 6 }} />
        </div>

        {/* Experience */}
        <h3 style={sectionTitleStyle}>Experience</h3>
        {experience.map(exp => (
          <div key={exp.id} style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input placeholder="Title" value={exp.title} onChange={e => setExperience(x => x.map(i => i.id === exp.id ? { ...i, title: e.target.value } : i))} style={inputStyle} />
              <input placeholder="Company" value={exp.company} onChange={e => setExperience(x => x.map(i => i.id === exp.id ? { ...i, company: e.target.value } : i))} style={inputStyle} />
              <input placeholder="Start" value={exp.startDate} onChange={e => setExperience(x => x.map(i => i.id === exp.id ? { ...i, startDate: e.target.value } : i))} style={inputStyle} />
              <input placeholder="End" value={exp.endDate} onChange={e => setExperience(x => x.map(i => i.id === exp.id ? { ...i, endDate: e.target.value } : i))} style={inputStyle} />
            </div>
            <textarea placeholder="Description" value={exp.desc} onChange={e => setExperience(x => x.map(i => i.id === exp.id ? { ...i, desc: e.target.value } : i))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            <button onClick={() => setExperience(x => x.filter(i => i.id !== exp.id))} style={deleteBtnStyle}>Remove</button>
          </div>
        ))}
        <button onClick={() => setExperience(e => [...e, { id: uid(), title: '', company: '', startDate: '', endDate: '', desc: '' }])} style={addBtnStyle}>+ Add Experience</button>

        <button onClick={exportPdf} disabled={isExporting} style={{ ...addBtnStyle, background: accentColor, color: '#fff', fontWeight: 600 }}>
          {isExporting ? 'Exporting...' : '⬇ Download PDF'}
        </button>
        {exportError && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 12 }}>
            {exportError}
          </div>
        )}
      </div>

      {/* Preview */}
      <div style={{ background: '#f3f4f6', borderRadius: 12, padding: 20, overflow: 'auto' }}>
        <div ref={resumeRef} style={{ background: '#fff', padding: 40, fontFamily: '"Inter", sans-serif', fontSize: 12, color: '#1f2937', minHeight: 800 }}>
          <div style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, color: '#fff', padding: '28px 32px', marginBottom: 24, borderRadius: 8 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>{personal.name}</h1>
            <h2 style={{ fontSize: 14, opacity: 0.9, fontWeight: 400 }}>{personal.title}</h2>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, opacity: 0.85, flexWrap: 'wrap' }}>
              {personal.email && <span>{personal.email}</span>}
              {personal.phone && <span>{personal.phone}</span>}
              {personal.location && <span>{personal.location}</span>}
              {personal.website && <span>{personal.website}</span>}
            </div>
          </div>
          {personal.summary && <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>{personal.summary}</p>}
          {experience.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentColor, borderBottom: `2px solid ${accentColor}`, paddingBottom: 4, marginBottom: 12 }}>Experience</h3>
              {experience.map(exp => (
                <div key={exp.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{exp.title}</span>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{exp.startDate} — {exp.endDate}</span>
                  </div>
                  <div style={{ color: accentColor, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{exp.company}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{exp.desc}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {education.length > 0 && (
              <div>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentColor, borderBottom: `2px solid ${accentColor}`, paddingBottom: 4, marginBottom: 12 }}>Education</h3>
                {education.map(edu => (
                  <div key={edu.id} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 11 }}>{edu.degree}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{edu.school} • {edu.startDate}–{edu.endDate}</div>
                  </div>
                ))}
              </div>
            )}
            {skills.length > 0 && (
              <div>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentColor, borderBottom: `2px solid ${accentColor}`, paddingBottom: 4, marginBottom: 12 }}>Skills</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {skills.map(s => (
                    <span key={s.id} style={{ fontSize: 10, padding: '2px 8px', background: '#f3f4f6', borderRadius: 4 }}>{s.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Inline styles ─── */
const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const cardStyle: React.CSSProperties = { padding: 12, border: '1px solid #f3f4f6', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6, background: '#fafafa' };
const sectionTitleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#374151', marginTop: 8 };
const addBtnStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: '1px dashed #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#6b7280' };
const deleteBtnStyle: React.CSSProperties = { alignSelf: 'flex-end', padding: '2px 8px', fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' };
