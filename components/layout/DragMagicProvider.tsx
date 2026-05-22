'use client';

import * as React from 'react';

/**
 * Listens for global drag events and toggles body[data-dragging] so that
 * tiles can shimmer (CSS handles the rest — see globals.css).
 */
export function DragMagicProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    let counter = 0;

    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      counter += 1;
      document.body.dataset.dragging = 'true';
    };

    const onLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      counter -= 1;
      if (counter <= 0) {
        counter = 0;
        delete document.body.dataset.dragging;
      }
    };

    const onDrop = () => {
      counter = 0;
      delete document.body.dataset.dragging;
    };

    const onDragOver = (e: DragEvent) => {
      // Allow drop only on tiles that opted in; prevent default file open elsewhere
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);

    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  }, []);

  return <>{children}</>;
}
