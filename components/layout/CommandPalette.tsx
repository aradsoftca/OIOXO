'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import { TileIcon } from '@/components/tiles/TileIcon';
import { TOOLS } from '@/lib/registry';
import { CATEGORIES } from '@/lib/registry/types';
import { cn } from '@/lib/cn';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ query?: string }>).detail;
      if (detail?.query) setQuery(detail.query);
      onOpenChange(true);
    };
    window.addEventListener('xonvert:open-palette', onOpen);
    return () => window.removeEventListener('xonvert:open-palette', onOpen);
  }, [onOpenChange]);

  const go = (path: string) => {
    onOpenChange(false);
    router.push(path);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="glass fixed left-1/2 top-[16%] z-50 w-[min(680px,92vw)] -translate-x-1/2 overflow-hidden">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command label="Search tools" shouldFilter className="w-full">
            <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-3">
              <TileIcon name="search" size={16} className="text-[var(--color-fg-subtle)]" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search tools, formats, or describe a task"
                className="flex-1 bg-transparent text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
                autoFocus
              />
              <kbd className="border border-black/10 bg-black/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                ESC
              </kbd>
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-[var(--color-fg-subtle)]">
                No tools match — try a different search.
              </Command.Empty>

              <Command.Group heading="Tools" className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-subtle)] [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {TOOLS.map((t) => {
                  const cat = CATEGORIES[t.category];
                  return (
                    <Command.Item
                      key={t.id}
                      value={`${t.name} ${t.id} ${t.keywords?.join(' ') ?? ''}`}
                      onSelect={() => go(`/tools/${t.id}`)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13px] text-[var(--color-fg)]',
                        'data-[selected=true]:bg-black/[0.05]',
                      )}
                    >
                      <div
                        className="flex h-7 w-7 items-center justify-center"
                        style={{ background: `var(${cat.colorVar})` }}
                      >
                        <TileIcon name={t.icon} size={14} className="text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="truncate text-[11px] text-[var(--color-fg-muted)]">{t.blurb}</div>
                      </div>
                      <kbd className="border border-black/10 bg-black/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-fg-subtle)]">
                        ↵
                      </kbd>
                    </Command.Item>
                  );
                })}
              </Command.Group>

              <Command.Group heading="Categories" className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-fg-subtle)] [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {Object.values(CATEGORIES).map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`category ${c.name} ${c.blurb}`}
                    onSelect={() => go(`/tools?cat=${c.id}`)}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13px] text-[var(--color-fg)] data-[selected=true]:bg-black/[0.05]"
                  >
                    <div
                      className="h-7 w-7"
                      style={{ background: `var(${c.colorVar})` }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.name}</div>
                      <div className="truncate text-[11px] text-[var(--color-fg-muted)]">{c.blurb}</div>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
