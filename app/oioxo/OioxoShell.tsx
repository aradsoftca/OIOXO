'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, Sparkles, Code2, Image as ImageIcon, Video, Lock, Menu, X, ChevronDown } from 'lucide-react';
import { TileIcon } from '@/components/tiles/TileIcon';
import { TOOLS } from '@/lib/registry';
import { CATEGORIES, type Category, type ToolManifest } from '@/lib/registry/types';
import OioxoChat from './OioxoChat';
import CodeAgent from './CodeAgent';
import SkillPanel from './SkillPanel';

type Tab = 'ai' | 'code' | 'image' | 'video';

const TABS: { id: Tab; label: string; icon: React.ReactNode; gated: boolean }[] = [
  { id: 'ai', label: 'AI', icon: <Sparkles className="h-4 w-4" />, gated: false },
  { id: 'code', label: 'Code', icon: <Code2 className="h-4 w-4" />, gated: true },
  { id: 'image', label: 'Image', icon: <ImageIcon className="h-4 w-4" />, gated: true },
  { id: 'video', label: 'Video', icon: <Video className="h-4 w-4" />, gated: true },
];

const CAT_ORDER = Object.keys(CATEGORIES) as Category[];

// Flagship P2P + on-device apps (top of the rail) — short labels for the cube.
const APPS: { href: string; name: string; icon: string }[] = [
  { href: '/send', name: 'Send', icon: 'send' },
  { href: '/call', name: 'Call', icon: 'video' },
  { href: '/chat', name: 'Chat', icon: 'message-square' },
  { href: '/clipboard', name: 'Clipboard', icon: 'clipboard-copy' },
  { href: '/watch', name: 'Screen', icon: 'monitor-play' },
  { href: '/board', name: 'Board', icon: 'pencil' },
  { href: '/note', name: 'Note', icon: 'lock' },
  { href: '/summarize', name: 'Summarize', icon: 'file-text' },
  { href: '/viewer', name: 'Viewer', icon: 'eye' },
];

export default function OioxoShell() {
  const [tab, setTab] = React.useState<Tab>('ai');
  const [query, setQuery] = React.useState('');
  const [railOpen, setRailOpen] = React.useState(false);
  const [openCats, setOpenCats] = React.useState<Set<Category>>(() => new Set([CAT_ORDER[0]]));
  const toggleCat = (c: Category) =>
    setOpenCats((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  const q = query.trim().toLowerCase();
  const filtered: ToolManifest[] = React.useMemo(() => {
    if (!q) return [];
    return TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.blurb.toLowerCase().includes(q) ||
        (t.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
    ).slice(0, 60);
  }, [q]);

  const grouped = React.useMemo(
    () =>
      CAT_ORDER.map((cat) => ({ cat, tools: TOOLS.filter((t) => t.category === cat) })).filter(
        (g) => g.tools.length > 0,
      ),
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-zinc-900">
      {/* ---- top bar ---- */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 lg:hidden"
            aria-label="Toggle tools"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/oioxo-logo.png" alt="oioxo" className="h-5 w-auto" />
          <span className="hidden text-xs font-medium text-zinc-400 sm:inline">all-in-one ai</span>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition sm:px-3.5',
                  active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
                {t.gated && <Lock className="h-3 w-3 opacity-60" aria-label="downloadable skill" />}
              </button>
            );
          })}
        </nav>

        <Link
          href="/"
          className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-700 lg:inline"
        >
          xonvert ↗
        </Link>
      </header>

      {/* ---- body ---- */}
      <div className="relative flex min-h-0 flex-1">
        {/* backdrop for mobile drawer */}
        {railOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/20 lg:hidden"
            onClick={() => setRailOpen(false)}
            aria-hidden
          />
        )}

        {/* left rail: tool cubes (static on desktop, drawer on mobile) */}
        <aside
          className={[
            'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-zinc-200 bg-white transition-transform duration-200',
            'lg:static lg:z-auto lg:w-60 lg:translate-x-0',
            railOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:shadow-none',
          ].join(' ')}
        >
          <div className="flex items-center gap-2 p-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools"
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-8 pr-7 text-sm placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setRailOpen(false)}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 lg:hidden"
              aria-label="Close tools"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {q ? (
              <CubeGrid tools={filtered} empty="No tools match." onNav={() => setRailOpen(false)} />
            ) : (
              <>
                {/* ---- Apps (flagship) ---- */}
                <h3 className="mb-1.5 mt-1 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Apps
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {APPS.map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      onClick={() => setRailOpen(false)}
                      title={a.name}
                      className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-2 transition hover:-translate-y-0.5 hover:border-[#E2B24A]/70 hover:shadow-sm"
                    >
                      <TileIcon name={a.icon} size={20} strokeWidth={1.75} className="text-zinc-700 transition group-hover:text-[#bb8e2e]" />
                      <span className="w-full truncate text-center text-[10px] font-medium leading-tight text-zinc-500">{a.name}</span>
                    </Link>
                  ))}
                </div>

                {/* ---- Tools (cascade by category) ---- */}
                <h3 className="mb-1 mt-5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Tools
                </h3>
                {grouped.map(({ cat, tools }) => {
                  const open = openCats.has(cat);
                  return (
                    <section key={cat} className="border-b border-zinc-100">
                      <button
                        type="button"
                        onClick={() => toggleCat(cat)}
                        className="flex w-full items-center justify-between py-2 pr-0.5 text-left text-[13px] font-semibold text-zinc-700 transition hover:text-zinc-900"
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: `var(${CATEGORIES[cat].colorVar})` }} />
                          {CATEGORIES[cat].name}
                          <span className="text-[11px] font-normal text-zinc-400">{tools.length}</span>
                        </span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div className="oio-fade pb-3">
                          <CubeGrid tools={tools} onNav={() => setRailOpen(false)} />
                        </div>
                      )}
                    </section>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* center: active tab */}
        <main className="flex min-w-0 flex-1 flex-col">
          {tab === 'ai' && <OioxoChat onOpenCode={() => setTab('code')} />}
          {tab === 'code' && <CodeAgent />}
          {tab === 'image' && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SkillPanel skillId="image" />
            </div>
          )}
          {tab === 'video' && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SkillPanel skillId="video" />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/** Light tool cube grid for the rail. */
function CubeGrid({ tools, empty, onNav }: { tools: ToolManifest[]; empty?: string; onNav?: () => void }) {
  if (tools.length === 0) {
    return empty ? <p className="px-1 py-6 text-center text-sm text-zinc-400">{empty}</p> : null;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {tools.map((t) => (
        <Link
          key={t.id}
          href={`/tools/${t.id}`}
          onClick={onNav}
          title={`${t.name} — ${t.blurb}`}
          className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-2 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm"
        >
          <TileIcon name={t.icon} size={20} strokeWidth={1.75} className="text-zinc-700 group-hover:text-zinc-900" />
          <span className="w-full truncate text-center text-[10px] font-medium leading-tight text-zinc-500">
            {t.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
