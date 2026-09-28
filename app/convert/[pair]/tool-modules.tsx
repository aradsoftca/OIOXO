'use client';
/** Client-side loader for the pair page's tool (see app/tools/[slug]/tool-modules.tsx:
 *  next/dynamic from a Server Component is not code-split). */
import dynamic from 'next/dynamic';

const loading = () => <div className="h-96 animate-pulse bg-[var(--color-surface-1)]" />;

const ToolModules: Record<string, ReturnType<typeof dynamic>> = {
  'image-convert-format': dynamic(() => import('@/tools/image-convert-format/ui'), { loading }),
  'audio-convert-format': dynamic(() => import('@/tools/audio-convert-format/ui'), { loading }),
  'video-to-gif':         dynamic(() => import('@/tools/video-to-gif/ui'),         { loading }),
  'video-gif-to-video':   dynamic(() => import('@/tools/video-gif-to-video/ui'),   { loading }),
  'image-heic-convert':   dynamic(() => import('@/tools/image-heic-convert/ui'),   { loading }),
  'video-extract-audio':  dynamic(() => import('@/tools/video-extract-audio/ui'),  { loading }),
  'video-convert-format': dynamic(() => import('@/tools/video-convert-format/ui'), { loading }),
  'images-to-video':      dynamic(() => import('@/tools/images-to-video/ui'),      { loading }),
  'pdf-to-images':        dynamic(() => import('@/tools/pdf-to-images/ui'),        { loading }),
  'images-to-pdf':        dynamic(() => import('@/tools/images-to-pdf/ui'),        { loading }),
  'pdf-to-text':          dynamic(() => import('@/tools/pdf-to-text/ui'),          { loading }),
  'image-ocr':            dynamic(() => import('@/tools/image-ocr/ui'),            { loading }),
  'audio-to-text':        dynamic(() => import('@/tools/audio-to-text/ui'),        { loading }),
  'model-3d-convert':     dynamic(() => import('@/tools/model-3d-convert/ui'),     { loading }),
  'cad-convert':          dynamic(() => import('@/tools/cad-convert/ui'),          { loading }),
  'convert-anything':     dynamic(() => import('@/tools/convert-anything/ui'),     { loading }),
};

export function PairToolUI({ id }: { id: string }) {
  const ToolUI = ToolModules[id];
  return ToolUI ? <ToolUI /> : null;
}
export const PAIR_TOOL_IDS = Object.keys(ToolModules);
