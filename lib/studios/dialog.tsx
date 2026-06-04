'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface DialogProps {
  open?: boolean;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmKind?: 'primary' | 'danger';
  confirmDisabled?: boolean;
  hideFooter?: boolean;
  scrollable?: boolean;
  closeOnBackdrop?: boolean;
}

const WIDTHS = {
  sm: 'w-[360px]',
  md: 'w-[460px]',
  lg: 'w-[600px]',
  xl: 'w-[820px]',
  full: 'w-[92vw]',
};

export function SharedDialog({
  open = true,
  title, description, icon, children,
  width = 'md',
  onClose, onConfirm,
  confirmLabel = 'OK', cancelLabel = 'Cancel',
  confirmKind = 'primary',
  confirmDisabled = false,
  hideFooter = false,
  scrollable = true,
  closeOnBackdrop = true,
}: DialogProps) {
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => { cancelAnimationFrame(id); setEntered(false); };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onConfirm && !confirmDisabled) {
        e.preventDefault(); onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onConfirm, confirmDisabled]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-150',
        entered ? 'opacity-100' : 'opacity-0',
      )}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={cn(
          'flex max-h-[88vh] flex-col rounded-xl border border-white/10 bg-[#0f1115] shadow-2xl transition-all duration-200',
          WIDTHS[width],
          entered ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[.98] opacity-0',
        )}
      >
        {title && (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/5 px-5 py-3">
            <div className="flex items-start gap-3 min-w-0">
              {icon && <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-cyan-500/15 text-cyan-300">{icon}</div>}
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
                {description && <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{description}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className={cn('px-5 py-4', scrollable && 'overflow-y-auto')}>
          {children}
        </div>
        {!hideFooter && onConfirm && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-white/5 bg-white/[.02] px-5 py-3">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-white/5 hover:text-zinc-200">
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={confirmDisabled}
              className={cn(
                'rounded-md px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                confirmKind === 'danger'
                  ? 'bg-rose-500 text-white hover:bg-rose-400'
                  : 'bg-cyan-500 text-zinc-900 hover:bg-cyan-400',
              )}
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  kind = 'primary', icon, onConfirm, onClose,
}: {
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: 'primary' | 'danger';
  icon?: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <SharedDialog
      title={title}
      icon={icon}
      width="sm"
      onClose={onClose}
      onConfirm={() => { onConfirm(); onClose(); }}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      confirmKind={kind}
    >
      <div className="text-xs leading-relaxed text-zinc-300">{message}</div>
    </SharedDialog>
  );
}

export function PromptDialog({
  title, label, placeholder, defaultValue = '', onSubmit, onClose,
}: {
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <SharedDialog
      title={title}
      width="sm"
      onClose={onClose}
      onConfirm={() => { onSubmit(value); onClose(); }}
      confirmDisabled={!value.trim()}
    >
      {label && <div className="mb-1 text-xs text-zinc-400">{label}</div>}
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-cyan-400/50"
      />
    </SharedDialog>
  );
}
