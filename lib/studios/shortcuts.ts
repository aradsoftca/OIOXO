import * as React from 'react';

export interface ShortcutBinding {
  combo: string;
  description?: string;
  handler: (e: KeyboardEvent) => void;
  scope?: 'global' | 'canvas';
}

const norm = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (!['control', 'meta', 'shift', 'alt'].includes(k)) parts.push(k);
  return parts.join('+');
};

const matches = (combo: string, e: KeyboardEvent): boolean => {
  return norm(e) === combo.toLowerCase().replace(/\s/g, '');
};

export function useShortcuts(bindings: ShortcutBinding[], opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const bRef = React.useRef(bindings);
  bRef.current = bindings;
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
      for (const b of bRef.current) {
        if (matches(b.combo, e)) {
          if (editable && b.combo !== 'mod+s' && b.combo !== 'mod+z' && b.combo !== 'mod+shift+z' && b.combo !== 'mod+y') continue;
          e.preventDefault();
          b.handler(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey, { capture: false });
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export const isMac = (): boolean => typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const formatCombo = (combo: string): string => {
  const mod = isMac() ? '⌘' : 'Ctrl';
  return combo
    .replace(/\bmod\b/g, mod)
    .replace(/\bshift\b/g, isMac() ? '⇧' : 'Shift')
    .replace(/\balt\b/g, isMac() ? '⌥' : 'Alt')
    .replace(/\+/g, isMac() ? '' : '+')
    .toUpperCase();
};
