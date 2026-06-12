'use client';

// Reusable, studio-agnostic template gallery. Same full-screen look as the
// video studio's gallery (category sidebar + thumbnail grid + "Use this
// template"), but driven by a generic item shape so EVERY studio can mount it.
//
// A studio passes already-rendered thumbnail data URLs (each studio knows how
// to render its own preview — image renders the recipe, others can use a
// gradient SVG), plus the category list. Picking an item calls onPick(id).

import * as React from 'react';
import { LayoutTemplate, X, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface GalleryItem {
  id: string;
  name: string;
  /** Category id this item belongs to (must match one of `categories`). */
  category: string;
  description: string;
  /** Rendered preview as a data URL (PNG/SVG). */
  thumb: string;
  /** Small badge shown top-right of the thumb, e.g. "1:1", "16:9", "1080×1080". */
  badge?: string;
  /** Optional meta chips shown under the description, e.g. ["3 layers", "logo"]. */
  meta?: string[];
}

export interface GalleryCategory {
  id: string;        // 'all' or a category id
  label: string;
}

export function TemplateGallery({
  title = 'Templates',
  items,
  categories,
  activeCategory,
  onCategory,
  onPick,
  onClose,
  accent = 'cyan',
}: {
  title?: string;
  items: GalleryItem[];
  categories: GalleryCategory[];
  activeCategory: string;
  onCategory: (id: string) => void;
  onPick: (id: string) => void;
  onClose: () => void;
  accent?: 'cyan' | 'violet' | 'emerald';
}) {
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();

  // A non-empty search spans ALL categories (Clipchamp-style — you don't have
  // to be in the right tab to find a template); an empty search respects the
  // active category tab.
  const visible = items.filter(t => {
    if (q) return (t.name + ' ' + t.description + ' ' + t.category).toLowerCase().includes(q);
    return activeCategory === 'all' || t.category === activeCategory;
  });
  const countFor = (id: string) => (id === 'all' ? items.length : items.filter(t => t.category === id).length);

  const accentText = accent === 'violet' ? 'text-violet-300' : accent === 'emerald' ? 'text-emerald-300' : 'text-cyan-300';
  const accentActive = accent === 'violet' ? 'bg-violet-500/15 text-violet-200' : accent === 'emerald' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-cyan-500/15 text-cyan-200';
  const accentHover = accent === 'violet' ? 'hover:border-violet-400/50' : accent === 'emerald' ? 'hover:border-emerald-400/50' : 'hover:border-cyan-400/50';
  const accentFoot = accent === 'violet' ? 'text-violet-300 group-hover:bg-violet-500/10' : accent === 'emerald' ? 'text-emerald-300 group-hover:bg-emerald-500/10' : 'text-cyan-300 group-hover:bg-cyan-500/10';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0b0e]/95 backdrop-blur">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-[#0f1115] px-4">
        <div className="flex items-center gap-2">
          <LayoutTemplate className={cn('h-4 w-4', accentText)} />
          <span className="text-sm font-semibold text-zinc-100">{title}</span>
          <span className="text-xs text-zinc-500">{visible.length} ready-to-use</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search templates…"
              autoFocus
              className="h-7 w-44 rounded-md border border-white/10 bg-white/[.03] pl-7 pr-6 text-xs text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-white/25"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200" aria-label="Clear search">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button onClick={onClose} className="rounded p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-44 shrink-0 overflow-y-auto border-r border-white/5 bg-[#0f1115] p-2">
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => { setQuery(''); onCategory(c.id); }}
              className={cn(
                'flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm',
                !q && activeCategory === c.id ? accentActive : 'text-zinc-300 hover:bg-white/5',
              )}
            >
              <span>{c.label}</span>
              <span className="text-[10px] text-zinc-500">{countFor(c.id)}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {visible.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              {q ? `No templates match “${query.trim()}”.` : 'No templates in this category yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map(t => (
                <button
                  key={t.id}
                  onClick={() => onPick(t.id)}
                  className={cn('group flex flex-col overflow-hidden rounded-lg border border-white/10 bg-white/[.02] text-left transition hover:bg-white/5', accentHover)}
                >
                  <div
                    className="relative h-36 w-full bg-[#15171c]"
                    style={{ backgroundImage: `url("${t.thumb}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
                  >
                    {t.badge && (
                      <div className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">{t.badge}</div>
                    )}
                  </div>
                  <div className="flex-1 p-3">
                    <div className="text-sm font-semibold text-zinc-100">{t.name}</div>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{t.description}</p>
                    {t.meta && t.meta.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                        {t.meta.map((m, i) => <span key={i}>{i > 0 && '· '}{m}</span>)}
                      </div>
                    )}
                  </div>
                  <div className={cn('border-t border-white/5 px-3 py-2 text-center text-xs font-medium transition', accentFoot)}>
                    Use this template →
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
