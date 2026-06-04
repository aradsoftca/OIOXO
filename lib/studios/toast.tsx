'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  description?: string;
  duration: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  push: (message: string, options?: { kind?: ToastKind; duration?: number; description?: string; action?: Toast['action'] }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let globalPush: ((message: string, options?: any) => string) | null = null;

export function pushToast(message: string, options?: { kind?: ToastKind; duration?: number; description?: string }): string {
  if (globalPush) return globalPush(message, options);
  if (typeof window !== 'undefined') console.warn('Toast pushed before provider mounted:', message);
  return '';
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const push = React.useCallback((message: string, options: any = {}) => {
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const toast: Toast = {
      id,
      kind: options.kind ?? 'info',
      message,
      description: options.description,
      duration: options.duration ?? 3000,
      action: options.action,
    };
    setToasts(prev => [...prev, toast]);
    if (toast.duration > 0) {
      window.setTimeout(() => dismiss(id), toast.duration);
    }
    return id;
  }, [dismiss]);

  const clear = React.useCallback(() => setToasts([]), []);

  React.useEffect(() => {
    globalPush = push;
    return () => { globalPush = null; };
  }, [push]);

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss, clear }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    return {
      toasts: [],
      push: (msg, opts) => pushToast(msg, opts),
      dismiss: () => {},
      clear: () => {},
    };
  }
  return ctx;
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 px-3"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />)}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const colors = {
    info:    { bg: 'bg-zinc-800/95',   border: 'border-zinc-700/50',   icon: '💬', accent: 'text-zinc-200' },
    success: { bg: 'bg-emerald-500/95', border: 'border-emerald-400/50', icon: '✓',  accent: 'text-emerald-50' },
    warning: { bg: 'bg-amber-500/95',  border: 'border-amber-400/50',  icon: '⚠',  accent: 'text-amber-950' },
    error:   { bg: 'bg-rose-500/95',   border: 'border-rose-400/50',   icon: '✕',  accent: 'text-rose-50' },
  };
  const c = colors[toast.kind];
  return (
    <div
      className={cn(
        'pointer-events-auto flex min-w-[260px] max-w-[420px] items-start gap-2.5 rounded-lg border px-3 py-2 shadow-2xl backdrop-blur transition-all duration-200',
        c.bg, c.border, c.accent,
        entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
      role="status"
    >
      <span className="text-base leading-none mt-0.5">{c.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold leading-snug">{toast.message}</div>
        {toast.description && <div className="text-[11px] opacity-80 mt-0.5">{toast.description}</div>}
      </div>
      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); onDismiss(); }}
          className="rounded bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-black/30"
        >{toast.action.label}</button>
      )}
      <button onClick={onDismiss} className="rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}
