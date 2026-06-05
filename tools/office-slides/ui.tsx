'use client';

import * as React from 'react';
import {
  Loader2, Download, Save, Upload, Undo2, Redo2, Plus, Trash2, Copy,
  Play, X, FileText, Image as ImageIcon, Type as TypeIcon, Square,
  Circle as CircleIcon, Palette, ChevronUp, ChevronDown,
  Eye, EyeOff, Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  MousePointer2, Triangle, ArrowRight, MessageSquare, Presentation, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'office-slides';
import {
  StudioShell, StudioTopBar, StudioBody, StudioSidebar, StudioPanel,
  StudioButton, StudioSlider, StudioStatusBar,
  UndoStack, newProject, saveProject, listProjects, loadProject,
  type StudioProject, downloadBlob, safeFilename, useShortcuts,
  extractPalette,
  exportPptx, type PptxData,
  AnimationPanel, computeElementState, toCssTransform, totalAnimationDuration,
  type AnimationConfig, type ElementAnimation,
  CommentsModel, CommentsThread, CommentsBadge, CommentsOverviewPanel,
  type Comment, type CommentAnchor, pickPeerColor,
  parseBulletsToNodes, smartArtToSvg, SMART_ART_LAYOUTS, type SmartArtLayout,
  HelpButton, useRegisterShortcuts,
  pushToast, SharedDialog, EmptyState,
} from '@/lib/studios';

type Tool = 'select' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'image';

interface Element {
  id: string;
  kind: 'text' | 'rect' | 'ellipse' | 'image' | 'arrow';
  x: number; y: number; w: number; h: number;
  rotation: number;
  text?: string;
  font?: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: CanvasTextAlign;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  imageData?: string;
  animations?: AnimationConfig;
}

interface Slide {
  id: string;
  background: string;
  elements: Element[];
  notes: string;
  layout?: string;
  section?: string;
}

interface Theme {
  id: string;
  name: string;
  background: string;
  textColor: string;
  accent: string;
  font: string;
}

interface DocState {
  name: string;
  slides: Slide[];
  selectedSlideId: string;
  selectedElementId: string | null;
  theme: Theme;
  width: number;
  height: number;
}

const THEMES: Theme[] = [
  { id: 'dark', name: 'Dark Pro', background: '#0c0d10', textColor: '#f4f4f5', accent: '#22d3ee', font: 'Inter, system-ui, sans-serif' },
  { id: 'light', name: 'Clean Light', background: '#ffffff', textColor: '#0c0d10', accent: '#0ea5e9', font: 'Inter, system-ui, sans-serif' },
  { id: 'mono', name: 'Mono', background: '#fafaf9', textColor: '#1c1917', accent: '#000000', font: 'Georgia, serif' },
  { id: 'sunset', name: 'Sunset', background: '#1a1424', textColor: '#fef3c7', accent: '#fb923c', font: 'Inter, system-ui, sans-serif' },
  { id: 'mint', name: 'Mint', background: '#ecfdf5', textColor: '#064e3b', accent: '#10b981', font: 'Inter, system-ui, sans-serif' },
  { id: 'corp', name: 'Corporate', background: '#1e3a8a', textColor: '#ffffff', accent: '#fbbf24', font: 'Helvetica, Arial, sans-serif' },
];

const LAYOUTS = [
  { id: 'title', name: 'Title slide' },
  { id: 'title-content', name: 'Title + content' },
  { id: 'two-content', name: 'Two columns' },
  { id: 'section', name: 'Section header' },
  { id: 'big-quote', name: 'Big quote' },
  { id: 'image-caption', name: 'Image + caption' },
  { id: 'blank', name: 'Blank' },
];

let _id = 0;
const nid = () => `e${++_id}`;

const newSlide = (theme: Theme, layout = 'blank'): Slide => {
  const elements: Element[] = [];
  if (layout === 'title') {
    elements.push({ id: nid(), kind: 'text', x: 80, y: 240, w: 1120, h: 140, rotation: 0, text: 'Presentation title', size: 64, color: theme.textColor, font: theme.font, bold: true, align: 'left' });
    elements.push({ id: nid(), kind: 'text', x: 80, y: 380, w: 1120, h: 60, rotation: 0, text: 'Subtitle goes here', size: 28, color: theme.accent, font: theme.font, align: 'left' });
  } else if (layout === 'title-content') {
    elements.push({ id: nid(), kind: 'text', x: 80, y: 60, w: 1120, h: 90, rotation: 0, text: 'Slide title', size: 44, color: theme.textColor, font: theme.font, bold: true, align: 'left' });
    elements.push({ id: nid(), kind: 'text', x: 80, y: 180, w: 1120, h: 480, rotation: 0, text: '• First point\n• Second point\n• Third point', size: 28, color: theme.textColor, font: theme.font, align: 'left' });
  } else if (layout === 'two-content') {
    elements.push({ id: nid(), kind: 'text', x: 80, y: 60, w: 1120, h: 90, rotation: 0, text: 'Two columns', size: 44, color: theme.textColor, font: theme.font, bold: true, align: 'left' });
    elements.push({ id: nid(), kind: 'text', x: 80, y: 180, w: 540, h: 480, rotation: 0, text: 'Left column\n\n• Point\n• Point', size: 24, color: theme.textColor, font: theme.font, align: 'left' });
    elements.push({ id: nid(), kind: 'text', x: 660, y: 180, w: 540, h: 480, rotation: 0, text: 'Right column\n\n• Point\n• Point', size: 24, color: theme.textColor, font: theme.font, align: 'left' });
  } else if (layout === 'section') {
    elements.push({ id: nid(), kind: 'text', x: 80, y: 280, w: 1120, h: 160, rotation: 0, text: 'Section heading', size: 72, color: theme.accent, font: theme.font, bold: true, align: 'center' });
  } else if (layout === 'big-quote') {
    elements.push({ id: nid(), kind: 'text', x: 120, y: 220, w: 1040, h: 240, rotation: 0, text: '"A great quote that says everything in one sentence."', size: 52, color: theme.textColor, font: theme.font, italic: true, align: 'center' });
    elements.push({ id: nid(), kind: 'text', x: 120, y: 480, w: 1040, h: 60, rotation: 0, text: '— Attribution', size: 22, color: theme.accent, font: theme.font, align: 'center' });
  } else if (layout === 'image-caption') {
    elements.push({ id: nid(), kind: 'rect', x: 80, y: 60, w: 720, h: 540, rotation: 0, fill: '#222', stroke: '#444', strokeWidth: 1 });
    elements.push({ id: nid(), kind: 'text', x: 80, y: 620, w: 720, h: 40, rotation: 0, text: 'Image caption', size: 20, color: theme.accent, font: theme.font, align: 'left' });
    elements.push({ id: nid(), kind: 'text', x: 840, y: 60, w: 360, h: 600, rotation: 0, text: 'Heading\n\nSupporting text goes here. Describe what the audience is looking at.', size: 24, color: theme.textColor, font: theme.font, align: 'left' });
  }
  return { id: nid(), background: theme.background, elements, notes: '', layout };
};

const NEW_DOC = (): DocState => {
  const theme = THEMES[0];
  const first = newSlide(theme, 'title');
  return {
    name: 'Untitled',
    slides: [first],
    selectedSlideId: first.id,
    selectedElementId: null,
    theme,
    width: 1280,
    height: 720,
  };
};

const cloneDoc = (d: DocState): DocState => ({
  ...d,
  slides: d.slides.map(s => ({ ...s, elements: s.elements.map(e => ({ ...e })) })),
  theme: { ...d.theme },
});

export default function OfficeSlidesPro() {
  const { guard, gate } = useUsageGate('office-slides'); // own meter — was borrowing 'image' and draining the user's image quota
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [doc, setDoc] = React.useState<DocState>(() => NEW_DOC());
  const stack = React.useRef(new UndoStack<DocState>(80));
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => { stack.current.reset(cloneDoc(doc), 'init'); }, []);

  const commit = React.useCallback((label: string, next: DocState) => {
    setDoc(next);
    stack.current.push(label, cloneDoc(next));
    force();
  }, []);

  const undo = () => { const p = stack.current.undo(cloneDoc(doc)); if (p) { setDoc(p); force(); } };
  const redo = () => { const p = stack.current.redo(); if (p) { setDoc(p); force(); } };

  const [tool, setTool] = React.useState<Tool>('select');
  const [busy, setBusy] = React.useState('');
  const [toast, setToast] = React.useState('');
  const [presentMode, setPresentMode] = React.useState(false);
  const [presentIdx, setPresentIdx] = React.useState(0);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [exportDialog, setExportDialog] = React.useState(false);
  const [layoutDialog, setLayoutDialog] = React.useState(false);
  const [exportFmt, setExportFmt] = React.useState<'pdf' | 'png' | 'pptx'>('pptx');
  const [savedList, setSavedList] = React.useState<StudioProject[]>([]);
  const [showNotes, setShowNotes] = React.useState(false);
  const commentsModel = React.useRef<CommentsModel>(new CommentsModel());
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [showCommentsPanel, setShowCommentsPanel] = React.useState(false);
  const [commentAuthor, setCommentAuthor] = React.useState('Me');
  const commentColor = React.useMemo(() => pickPeerColor(commentAuthor), [commentAuthor]);

  React.useEffect(() => {
    return commentsModel.current.onChange(s => setComments([...s.comments]));
  }, []);

  const [smartArtDialog, setSmartArtDialog] = React.useState(false);

  const sections = React.useMemo(() => {
    const groups = new Map<string, Slide[]>();
    for (const s of doc.slides) {
      const sec = s.section ?? '';
      if (!groups.has(sec)) groups.set(sec, []);
      groups.get(sec)!.push(s);
    }
    return Array.from(groups.entries());
  }, [doc.slides]);

  const renameSection = (oldName: string, newName: string) => {
    const next = cloneDoc(doc);
    for (const s of next.slides) {
      if ((s.section ?? '') === oldName) s.section = newName || undefined;
    }
    commit('rename section', next);
  };

  const addToSection = (slideId: string, sectionName: string) => {
    const next = cloneDoc(doc);
    const s = next.slides.find(x => x.id === slideId);
    if (s) s.section = sectionName || undefined;
    commit('set section', next);
  };

  const [slidesWelcomed, setSlidesWelcomed] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setSlidesWelcomed(sessionStorage.getItem('slides-studio-welcomed') === '1');
  }, []);
  const dismissSlidesWelcome = React.useCallback(() => {
    setSlidesWelcomed(true);
    try { sessionStorage.setItem('slides-studio-welcomed', '1'); } catch {}
  }, []);
  const slidesLooksUntouched = doc.name === 'Untitled' && doc.slides.length === 1;

  const insertSmartArt = (layout: SmartArtLayout, bulletText: string) => {
    const nodes = parseBulletsToNodes(bulletText);
    if (!nodes.length) { toastFor('Enter bullet text first'); return; }
    const w = doc.width - 160;
    const h = 400;
    const svg = smartArtToSvg({
      layout, nodes,
      width: w, height: h,
      accent: doc.theme.accent,
      textColor: '#ffffff',
      fontFamily: doc.theme.font,
    });
    const data = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    const next = cloneDoc(doc);
    const s = next.slides.find(x => x.id === doc.selectedSlideId)!;
    const el: Element = { id: nid(), kind: 'image', x: 80, y: 180, w, h, rotation: 0, imageData: data };
    s.elements.push(el);
    next.selectedElementId = el.id;
    commit('smart art', next);
    setSmartArtDialog(false);
    toastFor(`Inserted ${layout} SmartArt`);
  };
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const dragState = React.useRef<null | { mode: 'move' | 'resize'; corner?: string; id: string; ox: number; oy: number; ex: number; ey: number; ew: number; eh: number }>(null);

  const toastFor = (m: string) => { pushToast(m); };

  const slide = doc.slides.find(s => s.id === doc.selectedSlideId) ?? doc.slides[0];
  const elem = slide.elements.find(e => e.id === doc.selectedElementId) ?? null;

  const updateSlide = (id: string, mut: (s: Slide) => void, label = 'slide') => {
    const next = cloneDoc(doc);
    const s = next.slides.find(x => x.id === id);
    if (s) mut(s);
    commit(label, next);
  };

  const updateElement = (sid: string, eid: string, mut: (e: Element) => void, label = 'element') => {
    const next = cloneDoc(doc);
    const s = next.slides.find(x => x.id === sid);
    const e = s?.elements.find(x => x.id === eid);
    if (e) mut(e);
    commit(label, next);
  };

  const addSlide = (layout = 'blank') => {
    const next = cloneDoc(doc);
    const s = newSlide(next.theme, layout);
    next.slides.push(s);
    next.selectedSlideId = s.id;
    next.selectedElementId = null;
    commit('add slide', next);
  };

  const removeSlide = (id: string) => {
    if (doc.slides.length <= 1) return;
    const next = cloneDoc(doc);
    next.slides = next.slides.filter(s => s.id !== id);
    if (next.selectedSlideId === id) next.selectedSlideId = next.slides[0].id;
    commit('remove slide', next);
  };

  const duplicateSlide = (id: string) => {
    const next = cloneDoc(doc);
    const i = next.slides.findIndex(s => s.id === id);
    if (i < 0) return;
    const orig = next.slides[i];
    const copy: Slide = { ...orig, id: nid(), elements: orig.elements.map(e => ({ ...e, id: nid() })) };
    next.slides.splice(i + 1, 0, copy);
    next.selectedSlideId = copy.id;
    commit('duplicate slide', next);
  };

  const moveSlide = (id: string, dir: -1 | 1) => {
    const next = cloneDoc(doc);
    const i = next.slides.findIndex(s => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= next.slides.length) return;
    [next.slides[i], next.slides[j]] = [next.slides[j], next.slides[i]];
    commit('reorder', next);
  };

  const applyTheme = (t: Theme) => {
    const next = cloneDoc(doc);
    next.theme = t;
    for (const s of next.slides) {
      s.background = t.background;
      for (const e of s.elements) {
        if (e.kind === 'text' && e.color !== t.accent) e.color = t.textColor;
        if (e.font && e.font !== t.font) e.font = t.font;
      }
    }
    commit('theme', next);
  };

  const addElement = (kind: Element['kind'], x = 200, y = 200) => {
    const next = cloneDoc(doc);
    const s = next.slides.find(x => x.id === doc.selectedSlideId)!;
    let el: Element;
    if (kind === 'text') {
      el = { id: nid(), kind: 'text', x, y, w: 360, h: 60, rotation: 0, text: 'New text', size: 28, color: doc.theme.textColor, font: doc.theme.font, align: 'left' };
    } else if (kind === 'rect') {
      el = { id: nid(), kind: 'rect', x, y, w: 320, h: 200, rotation: 0, fill: doc.theme.accent, stroke: 'transparent', strokeWidth: 0 };
    } else if (kind === 'ellipse') {
      el = { id: nid(), kind: 'ellipse', x, y, w: 240, h: 240, rotation: 0, fill: doc.theme.accent, stroke: 'transparent', strokeWidth: 0 };
    } else if (kind === 'arrow') {
      el = { id: nid(), kind: 'arrow', x, y, w: 300, h: 4, rotation: 0, fill: doc.theme.textColor, strokeWidth: 4 };
    } else {
      el = { id: nid(), kind: 'image', x, y, w: 360, h: 240, rotation: 0 };
    }
    s.elements.push(el);
    next.selectedElementId = el.id;
    commit(`add ${kind}`, next);
  };

  const addImage = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const data = await new Promise<string>((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.readAsDataURL(f);
      });
      const next = cloneDoc(doc);
      const s = next.slides.find(x => x.id === doc.selectedSlideId)!;
      const el: Element = { id: nid(), kind: 'image', x: 200, y: 200, w: 480, h: 320, rotation: 0, imageData: data };
      s.elements.push(el);
      next.selectedElementId = el.id;
      commit('add image', next);
    };
    input.click();
  };

  const themeFromCurrentImage = () => {
    const s = doc.slides.find(x => x.id === doc.selectedSlideId);
    if (!s) return;
    const imgEl = s.elements.find(e => e.kind === 'image' && e.imageData);
    if (!imgEl || !imgEl.imageData) { toastFor('Add an image first'); return; }
    setBusy('Reading colors…');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const palette = extractPalette(c, 6);
      if (palette.length < 3) { setBusy(''); toastFor('Image too uniform'); return; }
      const background = palette[palette.length - 1];
      const textColor = isDark(background) ? '#ffffff' : '#0c0d10';
      const accent = palette[0];
      const newTheme: Theme = { id: 'custom-' + Date.now(), name: 'From image', background, textColor, accent, font: doc.theme.font };
      applyTheme(newTheme);
      setBusy('');
      toastFor('Theme generated from image');
    };
    img.onerror = () => { setBusy(''); toastFor('Could not read image'); };
    img.src = imgEl.imageData;
  };

  const autoAlign = (which: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'distribute-h' | 'distribute-v') => {
    const s = doc.slides.find(x => x.id === doc.selectedSlideId);
    if (!s || s.elements.length < 2) return;
    const next = cloneDoc(doc);
    const slide = next.slides.find(x => x.id === doc.selectedSlideId)!;
    const els = slide.elements;
    if (which === 'left') { const m = Math.min(...els.map(e => e.x)); for (const e of els) e.x = m; }
    else if (which === 'right') { const m = Math.max(...els.map(e => e.x + e.w)); for (const e of els) e.x = m - e.w; }
    else if (which === 'center-h') { const cx = next.width / 2; for (const e of els) e.x = cx - e.w / 2; }
    else if (which === 'top') { const m = Math.min(...els.map(e => e.y)); for (const e of els) e.y = m; }
    else if (which === 'bottom') { const m = Math.max(...els.map(e => e.y + e.h)); for (const e of els) e.y = m - e.h; }
    else if (which === 'center-v') { const cy = next.height / 2; for (const e of els) e.y = cy - e.h / 2; }
    else if (which === 'distribute-h') {
      const sorted = [...els].sort((a, b) => a.x - b.x);
      if (sorted.length < 3) return;
      const total = sorted[sorted.length - 1].x - sorted[0].x;
      const step = total / (sorted.length - 1);
      for (let i = 0; i < sorted.length; i++) sorted[i].x = sorted[0].x + i * step;
    } else if (which === 'distribute-v') {
      const sorted = [...els].sort((a, b) => a.y - b.y);
      if (sorted.length < 3) return;
      const total = sorted[sorted.length - 1].y - sorted[0].y;
      const step = total / (sorted.length - 1);
      for (let i = 0; i < sorted.length; i++) sorted[i].y = sorted[0].y + i * step;
    }
    commit(`align ${which}`, next);
  };

  const removeElement = () => {
    if (!doc.selectedElementId) return;
    const next = cloneDoc(doc);
    const s = next.slides.find(x => x.id === doc.selectedSlideId)!;
    s.elements = s.elements.filter(e => e.id !== doc.selectedElementId);
    next.selectedElementId = null;
    commit('delete element', next);
  };

  const duplicateElement = () => {
    if (!doc.selectedElementId) return;
    const next = cloneDoc(doc);
    const s = next.slides.find(x => x.id === doc.selectedSlideId)!;
    const e = s.elements.find(x => x.id === doc.selectedElementId);
    if (!e) return;
    const copy = { ...e, id: nid(), x: e.x + 20, y: e.y + 20 };
    s.elements.push(copy);
    next.selectedElementId = copy.id;
    commit('duplicate element', next);
  };

  const onStagePointerDown = (e: React.PointerEvent) => {
    if (tool === 'select') {
      const target = e.target as HTMLElement;
      if (target === stageRef.current || target.dataset.role === 'bg') {
        setDoc(d => ({ ...d, selectedElementId: null }));
      }
      return;
    }
    const rect = stageRef.current!.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * doc.width;
    const sy = ((e.clientY - rect.top) / rect.height) * doc.height;
    if (tool === 'text') addElement('text', sx, sy);
    else if (tool === 'rect') addElement('rect', sx, sy);
    else if (tool === 'ellipse') addElement('ellipse', sx, sy);
    else if (tool === 'arrow') addElement('arrow', sx, sy);
    else if (tool === 'image') addImage();
    setTool('select');
  };

  const startMove = (e: React.PointerEvent, el: Element) => {
    e.stopPropagation();
    setDoc(d => ({ ...d, selectedElementId: el.id }));
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    const rect = stageRef.current!.getBoundingClientRect();
    dragState.current = {
      mode: 'move', id: el.id,
      ox: e.clientX, oy: e.clientY,
      ex: el.x, ey: el.y, ew: el.w, eh: el.h,
    };
  };
  const startResize = (e: React.PointerEvent, el: Element, corner: string) => {
    e.stopPropagation();
    setDoc(d => ({ ...d, selectedElementId: el.id }));
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    dragState.current = {
      mode: 'resize', corner, id: el.id,
      ox: e.clientX, oy: e.clientY,
      ex: el.x, ey: el.y, ew: el.w, eh: el.h,
    };
  };
  const onMoveDrag = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    const rect = stageRef.current!.getBoundingClientRect();
    const scaleX = doc.width / rect.width;
    const scaleY = doc.height / rect.height;
    const dx = (e.clientX - d.ox) * scaleX;
    const dy = (e.clientY - d.oy) * scaleY;
    setDoc(prev => {
      const next = cloneDoc(prev);
      const s = next.slides.find(x => x.id === prev.selectedSlideId)!;
      const el = s.elements.find(x => x.id === d.id);
      if (!el) return prev;
      if (d.mode === 'move') { el.x = d.ex + dx; el.y = d.ey + dy; }
      else if (d.mode === 'resize') {
        if (d.corner?.includes('e')) el.w = Math.max(20, d.ew + dx);
        if (d.corner?.includes('w')) { el.w = Math.max(20, d.ew - dx); el.x = d.ex + dx; }
        if (d.corner?.includes('s')) el.h = Math.max(20, d.eh + dy);
        if (d.corner?.includes('n')) { el.h = Math.max(20, d.eh - dy); el.y = d.ey + dy; }
      }
      return next;
    });
  };
  const endDrag = () => {
    if (dragState.current) {
      stack.current.push(dragState.current.mode, cloneDoc(doc));
      dragState.current = null;
    }
    setDragging(false);
  };

  const exportNow = async () => {
    const slidesHit = checkLever(POLICY_KEY, 'pages', doc.slides.length, isPro);
    if (slidesHit) { policyGate.fire(slidesHit); return; }
    if (!(await guard())) return;
    setBusy('Rendering…');
    setExportDialog(false);
    try {
      if (exportFmt === 'pptx') {
        const pptxData: PptxData = {
          name: doc.name,
          width: doc.width,
          height: doc.height,
          slides: doc.slides.map(s => ({
            background: s.background,
            texts: s.elements.filter(e => e.kind === 'text').map(e => ({
              x: e.x, y: e.y, w: e.w, h: e.h,
              text: e.text ?? '', size: e.size ?? 28,
              color: e.color ?? '#000000', bold: !!e.bold,
              align: (e.align === 'center' || e.align === 'right' ? e.align : 'left') as 'left' | 'center' | 'right',
            })),
            shapes: s.elements.filter(e => e.kind === 'rect' || e.kind === 'ellipse').map(e => ({
              kind: e.kind as 'rect' | 'ellipse',
              x: e.x, y: e.y, w: e.w, h: e.h,
              fill: e.fill ?? '#000000',
            })),
          })),
        };
        const blob = await exportPptx(pptxData);
        downloadBlob(blob, `${safeFilename(doc.name)}.pptx`);
      } else if (exportFmt === 'png') {
        const blob = await renderSlideToPng(slide, doc);
        downloadBlob(blob, `${safeFilename(doc.name)}-${doc.slides.findIndex(s => s.id === slide.id) + 1}.png`);
      } else {
        const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
        const { watermarkOnSync, WM_DOMAIN } = await import('@/lib/watermark/config');
        const pdf = await PDFDocument.create();
        const wm = watermarkOnSync();
        const font = wm ? await pdf.embedFont(StandardFonts.Helvetica) : null;
        if (wm) {
          // Document metadata brand (visible in Acrobat → Properties).
          pdf.setCreator(WM_DOMAIN);
          pdf.setProducer(WM_DOMAIN);
          pdf.setAuthor(WM_DOMAIN);
          pdf.setSubject(`Made with ${WM_DOMAIN}`);
          pdf.setKeywords([WM_DOMAIN, `made-with-${WM_DOMAIN}`]);
        }
        for (const s of doc.slides) {
          const blob = await renderSlideToPng(s, doc);
          const bytes = await blob.arrayBuffer();
          const img = await pdf.embedPng(bytes);
          const page = pdf.addPage([doc.width, doc.height]);
          page.drawImage(img, { x: 0, y: 0, width: doc.width, height: doc.height });
          if (wm && font) {
            const m = Math.max(8, doc.height * 0.025);
            page.drawText(WM_DOMAIN, {
              x: m, y: m, size: 9, font, color: rgb(0.59, 0.59, 0.59),
            });
          }
        }
        const out = await pdf.save();
        downloadBlob(new Blob([new Uint8Array(out)], { type: 'application/pdf' }), `${safeFilename(doc.name)}.pdf`);
      }
      toastFor('Exported');
    } catch (e) {
      toastFor((e as Error).message || 'Export failed');
    } finally { setBusy(''); }
  };

  const saveCurrent = async () => {
    setBusy('Saving…');
    try {
      const proj = newProject('office', doc.name, { kind: 'slides', doc });
      await saveProject(proj);
      toastFor('Saved');
    } finally { setBusy(''); }
  };
  const openSaved = async () => {
    const list = await listProjects('office');
    setSavedList(list.filter(p => (p.state as any)?.kind === 'slides'));
    setOpenDialog(true);
  };
  const loadFromLibrary = async (id: string) => {
    setBusy('Opening…');
    try {
      const p = await loadProject<{ kind: 'slides'; doc: DocState }>(id);
      if (!p) return;
      setDoc(p.state.doc);
      stack.current.reset(cloneDoc(p.state.doc), 'open');
      setOpenDialog(false);
    } finally { setBusy(''); }
  };

  useRegisterShortcuts([
    {
      label: 'File',
      items: [
        { combo: 'mod+n', description: 'New slide' },
        { combo: 'mod+s', description: 'Save' },
        { combo: 'mod+e', description: 'Export' },
        { combo: 'mod+o', description: 'Open library' },
        { combo: 'mod+z', description: 'Undo' },
        { combo: 'mod+shift+z', description: 'Redo' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { combo: 'mod+d', description: 'Duplicate element' },
        { combo: 'delete', description: 'Delete element' },
      ],
    },
    {
      label: 'Tools',
      items: [
        { combo: 'v', description: 'Select' },
        { combo: 't', description: 'Text' },
        { combo: 'r', description: 'Rectangle' },
        { combo: 'o', description: 'Ellipse' },
      ],
    },
    {
      label: 'Presentation',
      items: [
        { combo: 'f5', description: 'Start presentation' },
        { combo: 'esc', description: 'Exit presentation' },
        { combo: 'arrows', description: 'Navigate slides during present mode' },
      ],
    },
  ]);

  useShortcuts([
    { combo: 'mod+z', handler: undo },
    { combo: 'mod+shift+z', handler: redo },
    { combo: 'mod+s', handler: () => { void saveCurrent(); } },
    { combo: 'mod+e', handler: () => setExportDialog(true) },
    { combo: 'mod+o', handler: () => { void openSaved(); } },
    { combo: 'mod+n', handler: () => addSlide('blank') },
    { combo: 'mod+d', handler: () => duplicateElement() },
    { combo: 'delete', handler: removeElement },
    { combo: 'backspace', handler: removeElement },
    { combo: 'f5', handler: () => { setPresentIdx(doc.slides.findIndex(s => s.id === doc.selectedSlideId)); setPresentMode(true); } },
    { combo: 't', handler: () => setTool('text') },
    { combo: 'r', handler: () => setTool('rect') },
    { combo: 'o', handler: () => setTool('ellipse') },
    { combo: 'v', handler: () => setTool('select') },
  ]);

  React.useEffect(() => {
    if (!presentMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMode(false);
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        setPresentIdx(i => Math.min(doc.slides.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPresentIdx(i => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentMode, doc.slides.length]);

  if (presentMode) {
    const cur = doc.slides[presentIdx] ?? doc.slides[0];
    return (
      <PresentMode
        slide={cur}
        doc={doc}
        idx={presentIdx}
        total={doc.slides.length}
        onExit={() => setPresentMode(false)}
      />
    );
  }

  return (
    <StudioShell>
      {policyGate.element}
      <StudioTopBar
        title="Slides Studio Pro"
        left={
          <>
            <StudioButton variant="ghost" size="sm" onClick={() => setLayoutDialog(true)}><Plus className="h-3.5 w-3.5" /> Slide</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={() => setSmartArtDialog(true)}><Sparkles className="h-3.5 w-3.5" /> SmartArt</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={openSaved}><FileText className="h-3.5 w-3.5" /> Library</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={saveCurrent}><Save className="h-3.5 w-3.5" /> Save</StudioButton>
            <StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)}><Download className="h-3.5 w-3.5" /> Export</StudioButton>
            <button onClick={() => { setPresentIdx(doc.slides.findIndex(s => s.id === doc.selectedSlideId)); setPresentMode(true); }} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-500/90 px-2.5 text-xs font-medium text-zinc-900 hover:bg-emerald-400">
              <Play className="h-3 w-3" /> Present
            </button>
            <span className="ml-2 h-5 w-px bg-white/10" />
            <input value={doc.name} onChange={e => setDoc(d => ({ ...d, name: e.target.value }))} className="h-7 w-40 rounded border border-transparent bg-transparent px-2 text-sm text-zinc-200 outline-none hover:border-white/10 focus:border-cyan-400/50" />
          </>
        }
        right={
          <>
            <button onClick={() => setShowCommentsPanel(s => !s)} className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium', showCommentsPanel ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-300 hover:bg-white/5')} title="Comments">
              <MessageSquare className="h-3.5 w-3.5" />
              <CommentsBadge count={comments.filter(c => !c.resolved).length} />
            </button>
            <StudioButton variant="ghost" size="sm" onClick={() => setShowNotes(s => !s)} title="Speaker notes"><Presentation className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={undo} disabled={!stack.current.canUndo()}><Undo2 className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={redo} disabled={!stack.current.canRedo()}><Redo2 className="h-3.5 w-3.5" /></StudioButton>
            <HelpButton />
          </>
        }
      />

      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/5 bg-[#0f1115] px-3 text-xs">
        {([['select', MousePointer2, 'Select'], ['text', TypeIcon, 'Text (T)'], ['rect', Square, 'Rectangle (R)'], ['ellipse', CircleIcon, 'Ellipse (O)'], ['arrow', ArrowRight, 'Arrow'], ['image', ImageIcon, 'Image']] as const).map(([t, Icon, label]) => (
          <button key={t} onClick={() => { if (t === 'image') addImage(); else setTool(t); }} title={label} className={cn('grid h-7 w-7 place-items-center rounded', tool === t ? 'bg-cyan-500 text-zinc-900' : 'text-zinc-300 hover:bg-white/5')}>
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" />
        {elem && (
          <>
            <Tb onClick={() => updateElement(slide.id, elem.id, e => { e.bold = !e.bold; })} title="Bold" active={elem.bold}><Bold className="h-3.5 w-3.5" /></Tb>
            <Tb onClick={() => updateElement(slide.id, elem.id, e => { e.italic = !e.italic; })} title="Italic" active={elem.italic}><Italic className="h-3.5 w-3.5" /></Tb>
            <Tb onClick={() => updateElement(slide.id, elem.id, e => { e.align = 'left'; })} title="Left" active={elem.align === 'left'}><AlignLeft className="h-3.5 w-3.5" /></Tb>
            <Tb onClick={() => updateElement(slide.id, elem.id, e => { e.align = 'center'; })} title="Center" active={elem.align === 'center'}><AlignCenter className="h-3.5 w-3.5" /></Tb>
            <Tb onClick={() => updateElement(slide.id, elem.id, e => { e.align = 'right'; })} title="Right" active={elem.align === 'right'}><AlignRight className="h-3.5 w-3.5" /></Tb>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <button onClick={duplicateElement} title="Duplicate" className="grid h-7 w-7 place-items-center rounded text-zinc-300 hover:bg-white/5"><Copy className="h-3.5 w-3.5" /></button>
            <button onClick={removeElement} title="Delete" className="grid h-7 w-7 place-items-center rounded text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={themeFromCurrentImage} title="Generate theme from image colors" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-cyan-300 hover:bg-white/5">
            <Sparkles className="h-3 w-3" /> Theme from image
          </button>
          <span className="text-zinc-500">Theme</span>
          {THEMES.map(t => (
            <button key={t.id} onClick={() => applyTheme(t)} title={t.name} className={cn('h-5 w-5 rounded-full border', doc.theme.id === t.id ? 'border-cyan-400 ring-1 ring-cyan-400/30' : 'border-white/10')}
              style={{ background: `linear-gradient(135deg, ${t.background} 50%, ${t.accent} 50%)` }} />
          ))}
        </div>
      </div>

      <StudioBody>
        <StudioSidebar side="left" width={180}>
          {sections.length > 1 && (
            <StudioPanel title="Sections" defaultOpen>
              <div className="space-y-1">
                {sections.map(([name, slides]) => (
                  <div key={name || 'untitled'} className="rounded bg-white/[.02] p-1.5">
                    <input
                      value={name}
                      onChange={e => renameSection(name, e.target.value)}
                      placeholder="(no section)"
                      className="w-full rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-0.5 text-[10px] text-zinc-200"
                    />
                    <div className="mt-0.5 text-[9px] text-zinc-500">{slides.length} slide{slides.length === 1 ? '' : 's'}</div>
                  </div>
                ))}
              </div>
            </StudioPanel>
          )}
          <StudioPanel title={`Slides · ${doc.slides.length}`}>
            <div className="space-y-1">
              {doc.slides.map((s, i) => (
                <div key={s.id}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '0 100px' } as React.CSSProperties}
                  className={cn(
                  'group relative cursor-pointer overflow-hidden rounded border bg-white',
                  s.id === doc.selectedSlideId ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-white/10 hover:border-white/30',
                )}
                  onClick={() => setDoc(d => ({ ...d, selectedSlideId: s.id, selectedElementId: null }))}
                >
                  <div className="relative" style={{ aspectRatio: `${doc.width}/${doc.height}` }}>
                    <SlidePreview slide={s} doc={doc} />
                  </div>
                  <div className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[9px] font-bold text-white">{i + 1}</div>
                  <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Mini onClick={(e) => { e.stopPropagation(); moveSlide(s.id, -1); }}><ChevronUp className="h-2.5 w-2.5" /></Mini>
                    <Mini onClick={(e) => { e.stopPropagation(); moveSlide(s.id, 1); }}><ChevronDown className="h-2.5 w-2.5" /></Mini>
                    <Mini onClick={(e) => { e.stopPropagation(); duplicateSlide(s.id); }}><Copy className="h-2.5 w-2.5" /></Mini>
                    <Mini onClick={(e) => { e.stopPropagation(); removeSlide(s.id); }} danger><Trash2 className="h-2.5 w-2.5" /></Mini>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setLayoutDialog(true)} className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-dashed border-white/10 py-2 text-xs text-zinc-400 hover:bg-white/5"><Plus className="h-3 w-3" /> New slide</button>
          </StudioPanel>
        </StudioSidebar>

        <div className="relative flex flex-1 min-w-0 flex-col bg-[#0a0b0e]">
          {!slidesWelcomed && slidesLooksUntouched && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0b0e]/95 backdrop-blur-sm">
              <EmptyState
                icon={<Presentation className="h-7 w-7" />}
                title="Start your deck"
                description="Pick a layout, choose a theme, and add 24 element animations. Present-mode plays animations in real time."
                actions={[
                  { label: 'Choose slide layout', description: '7 layouts: title, content, sections, quote...', icon: <Plus className="h-4 w-4" />, onClick: () => { dismissSlidesWelcome(); setLayoutDialog(true); }, primary: true },
                  { label: 'Insert SmartArt diagram', description: '6 layouts auto-generated from your bullets', icon: <Sparkles className="h-4 w-4" />, onClick: () => { dismissSlidesWelcome(); setSmartArtDialog(true); } },
                  { label: 'Open from Library', description: 'Continue a saved deck', icon: <FileText className="h-4 w-4" />, onClick: () => { dismissSlidesWelcome(); void openSaved(); } },
                  { label: 'Start with blank slide', description: 'Just give me the canvas', icon: <MousePointer2 className="h-4 w-4" />, onClick: dismissSlidesWelcome },
                ]}
                hints={[
                  { label: '24 entrance/emphasis/exit animations', description: 'Fade, slide, zoom, spin, bounce, flash, shake...' },
                  { label: 'Sections + comments per element', description: 'Organize and review' },
                  { label: '6 SmartArt layouts', description: 'Process, cycle, hierarchy, venn, pyramid, list' },
                ]}
              />
            </div>
          )}
          <div className="flex flex-1 items-center justify-center p-6">
            <div
              ref={stageRef}
              data-role="bg"
              onPointerDown={onStagePointerDown}
              onPointerMove={onMoveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative max-h-full w-full shadow-2xl"
              style={{ aspectRatio: `${doc.width}/${doc.height}`, maxWidth: '100%', background: slide.background, cursor: tool === 'select' ? 'default' : 'crosshair' }}
            >
              <SlideCanvas
                slide={slide}
                doc={doc}
                interactive
                selectedId={doc.selectedElementId}
                onSelectElement={(id) => setDoc(d => ({ ...d, selectedElementId: id }))}
                onStartMove={startMove}
                onStartResize={startResize}
                onEditText={(id, text) => updateElement(slide.id, id, e => { e.text = text; }, 'text edit')}
              />
            </div>
          </div>
          {showNotes && (
            <div className="border-t border-white/5 bg-[#0f1115] p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Speaker notes</div>
              <textarea
                value={slide.notes}
                onChange={e => updateSlide(slide.id, s => { s.notes = e.target.value; }, 'notes')}
                rows={3}
                className="w-full rounded border border-white/10 bg-[#0a0b0e] p-2 text-xs text-zinc-100 outline-none focus:border-cyan-400/50"
                placeholder="Notes only you see during the presentation…"
              />
            </div>
          )}
        </div>

        <StudioSidebar width={260}>
          {elem ? (
            <>
              <ElementInspector
                element={elem}
                theme={doc.theme}
                onChange={(mut) => updateElement(slide.id, elem.id, mut, 'inspector')}
              />
              <AnimationPanel
                value={elem.animations ?? {}}
                onChange={(next) => updateElement(slide.id, elem.id, (e) => { e.animations = next; }, 'animations')}
                title="Animations"
              />
            </>
          ) : (
            <StudioPanel title="Slide">
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs text-zinc-400">Background</div>
                  <input type="color" value={slide.background.startsWith('#') ? slide.background : '#000000'} onChange={e => updateSlide(slide.id, s => { s.background = e.target.value; }, 'bg')} className="h-8 w-full rounded border border-white/10" />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <StudioButton size="sm" variant="soft" onClick={() => addElement('text')}>+ Text</StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={() => addElement('rect')}>+ Rect</StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={() => addElement('ellipse')}>+ Ellipse</StudioButton>
                  <StudioButton size="sm" variant="soft" onClick={addImage}>+ Image</StudioButton>
                </div>
              </div>
            </StudioPanel>
          )}
        </StudioSidebar>
      </StudioBody>

      <StudioStatusBar>
        <span>{doc.slides.length} slides</span>
        <span>{slide.elements.length} elements</span>
        {elem && <span className="text-cyan-300">{elem.kind}</span>}
        <span className="ml-auto">{doc.width}×{doc.height} · {doc.theme.name}</span>
      </StudioStatusBar>

      {busy && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 rounded-md bg-black/80 px-4 py-2 text-sm text-white backdrop-blur">
          <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> {busy}
        </div>
      )}
      {toast && <div className="pointer-events-none fixed bottom-12 left-1/2 -translate-x-1/2 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-lg">{toast}</div>}
      {gate}

      {showCommentsPanel && (
        <div className="fixed right-0 top-[88px] bottom-0 z-40 flex w-80 flex-col border-l border-white/10 bg-[#0f1115] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <div className="text-xs font-semibold text-zinc-100">Comments</div>
            <button onClick={() => setShowCommentsPanel(false)} className="rounded p-1 text-zinc-400 hover:bg-white/5"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="border-b border-white/5 px-3 py-2 text-[10px] text-zinc-400">
            Author: <input value={commentAuthor} onChange={e => setCommentAuthor(e.target.value)} className="ml-1 rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-0.5 text-zinc-100" />
          </div>
          {elem && (
            <div className="border-b border-white/5 p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Selected element</div>
              <CommentsThread
                anchor={{ kind: 'element', slideId: slide.id, elementId: elem.id }}
                comments={commentsModel.current.threadFor({ kind: 'element', slideId: slide.id, elementId: elem.id })}
                currentUser={commentAuthor}
                currentColor={commentColor}
                onAdd={(text) => commentsModel.current.add({ kind: 'element', slideId: slide.id, elementId: elem.id }, commentAuthor, commentColor, text)}
                onReply={(parentId, text) => commentsModel.current.reply(parentId, commentAuthor, commentColor, text)}
                onResolve={(id) => commentsModel.current.resolve(id, true)}
                onUnresolve={(id) => commentsModel.current.resolve(id, false)}
                onDelete={(id) => commentsModel.current.remove(id)}
                onEdit={(id, text) => commentsModel.current.editText(id, text)}
              />
            </div>
          )}
          <div className="flex-1 min-h-0">
            <CommentsOverviewPanel
              comments={comments}
              currentUser={commentAuthor}
              currentColor={commentColor}
              onJumpTo={(anchor) => {
                if (anchor.kind === 'element') {
                  setDoc(d => ({ ...d, selectedSlideId: anchor.slideId, selectedElementId: anchor.elementId }));
                }
              }}
              onResolve={(id) => commentsModel.current.resolve(id, true)}
              onUnresolve={(id) => commentsModel.current.resolve(id, false)}
              onDelete={(id) => commentsModel.current.remove(id)}
              onReply={(parentId, text) => commentsModel.current.reply(parentId, commentAuthor, commentColor, text)}
              onEdit={(id, text) => commentsModel.current.editText(id, text)}
            />
          </div>
        </div>
      )}
      {layoutDialog && (
        <Dialog title="New slide layout" onCancel={() => setLayoutDialog(false)} onConfirm={() => setLayoutDialog(false)} confirmLabel="Close">
          <div className="grid grid-cols-2 gap-2">
            {LAYOUTS.map(L => (
              <button key={L.id} onClick={() => { addSlide(L.id); setLayoutDialog(false); }} className="rounded border border-white/10 bg-white/[.02] p-3 text-xs text-zinc-200 hover:bg-white/5 hover:border-cyan-400/40">
                <div className="font-medium">{L.name}</div>
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {smartArtDialog && (
        <SmartArtDialog onCancel={() => setSmartArtDialog(false)} onInsert={insertSmartArt} />
      )}
      {exportDialog && (
        <Dialog title="Export" onCancel={() => setExportDialog(false)} onConfirm={exportNow} confirmLabel="Download">
          <div>
            <div className="mb-1 text-xs text-zinc-400">Format</div>
            <div className="grid grid-cols-3 gap-1">
              {(['pptx', 'pdf', 'png'] as const).map(f => (
                <button key={f} onClick={() => setExportFmt(f)} className={cn('rounded px-3 py-1.5 text-xs uppercase', exportFmt === f ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>
                  {f}<span className="block text-[9px] normal-case opacity-70">{f === 'pdf' ? 'all slides' : f === 'png' ? 'current' : 'PowerPoint'}</span>
                </button>
              ))}
            </div>
          </div>
        </Dialog>
      )}
      {openDialog && (
        <Dialog title="Library" onCancel={() => setOpenDialog(false)} onConfirm={() => setOpenDialog(false)} confirmLabel="Close">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {savedList.length === 0 && <div className="rounded bg-white/5 p-4 text-center text-xs text-zinc-400">No saved decks</div>}
            {savedList.map(p => (
              <button key={p.id} onClick={() => loadFromLibrary(p.id)} className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
                <Presentation className="h-3.5 w-3.5 text-zinc-400" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-zinc-500">{new Date(p.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </StudioShell>
  );
}

function SlideCanvas({ slide, doc, interactive, selectedId, onSelectElement, onStartMove, onStartResize, onEditText }: {
  slide: Slide; doc: DocState; interactive: boolean;
  selectedId?: string | null;
  onSelectElement?: (id: string) => void;
  onStartMove?: (e: React.PointerEvent, el: Element) => void;
  onStartResize?: (e: React.PointerEvent, el: Element, corner: string) => void;
  onEditText?: (id: string, text: string) => void;
}) {
  const [editing, setEditing] = React.useState<string | null>(null);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: slide.background }}>
      <svg viewBox={`0 0 ${doc.width} ${doc.height}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        {slide.elements.map(el => {
          const transform = `rotate(${el.rotation} ${el.x + el.w / 2} ${el.y + el.h / 2})`;
          if (el.kind === 'rect') {
            return <rect key={el.id} x={el.x} y={el.y} width={el.w} height={el.h} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth ?? 0} transform={transform} />;
          }
          if (el.kind === 'ellipse') {
            return <ellipse key={el.id} cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={el.w / 2} ry={el.h / 2} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth ?? 0} transform={transform} />;
          }
          if (el.kind === 'arrow') {
            const y = el.y + el.h / 2;
            return (
              <g key={el.id} transform={transform}>
                <line x1={el.x} y1={y} x2={el.x + el.w - 20} y2={y} stroke={el.fill} strokeWidth={el.strokeWidth ?? 4} strokeLinecap="round" />
                <polygon points={`${el.x + el.w},${y} ${el.x + el.w - 22},${y - 12} ${el.x + el.w - 22},${y + 12}`} fill={el.fill} />
              </g>
            );
          }
          if (el.kind === 'image') {
            if (!el.imageData) return <rect key={el.id} x={el.x} y={el.y} width={el.w} height={el.h} fill="#1f2024" stroke="#3f3f46" strokeDasharray="6,6" transform={transform} />;
            return <image key={el.id} href={el.imageData} x={el.x} y={el.y} width={el.w} height={el.h} preserveAspectRatio="xMidYMid slice" transform={transform} />;
          }
          if (el.kind === 'text') {
            const lines = (el.text ?? '').split('\n');
            const lh = (el.size ?? 28) * 1.25;
            const totalH = lines.length * lh;
            const yBase = el.y + (el.h - totalH) / 2 + lh * 0.78;
            const xBase = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
            const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
            return (
              <g key={el.id} transform={transform}>
                {lines.map((ln, i) => (
                  <text key={i} x={xBase} y={yBase + i * lh} fontSize={el.size} fontFamily={el.font} fill={el.color}
                    fontWeight={el.bold ? 700 : 400} fontStyle={el.italic ? 'italic' : 'normal'} textAnchor={anchor}>
                    {ln}
                  </text>
                ))}
              </g>
            );
          }
          return null;
        })}
      </svg>
      {interactive && slide.elements.map(el => {
        const sel = el.id === selectedId;
        const rect = stageRect();
        return (
          <div
            key={el.id}
            data-el={el.id}
            onPointerDown={(e) => onStartMove?.(e, el)}
            onDoubleClick={() => el.kind === 'text' && setEditing(el.id)}
            className={cn('absolute', sel && 'outline outline-2 outline-cyan-400')}
            style={{
              left: `${(el.x / doc.width) * 100}%`, top: `${(el.y / doc.height) * 100}%`,
              width: `${(el.w / doc.width) * 100}%`, height: `${(el.h / doc.height) * 100}%`,
              cursor: 'move',
            }}
          >
            {editing === el.id && el.kind === 'text' && (
              <textarea
                autoFocus
                value={el.text ?? ''}
                onChange={e => onEditText?.(el.id, e.target.value)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
                className="absolute inset-0 resize-none border-2 border-cyan-400 bg-black/40 p-2 outline-none"
                style={{ color: el.color, fontFamily: el.font, fontSize: `${(el.size ?? 28) * 0.6}px`, fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? 'italic' : 'normal', textAlign: el.align }}
              />
            )}
            {sel && ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].map(c => (
              <div
                key={c}
                onPointerDown={(e) => onStartResize?.(e, el, c)}
                className="absolute h-2.5 w-2.5 rounded-full border-2 border-cyan-400 bg-white"
                style={getHandleStyle(c)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function stageRect() { return null; }

function SmartArtDialog({ onCancel, onInsert }: { onCancel: () => void; onInsert: (layout: SmartArtLayout, text: string) => void }) {
  const [layout, setLayout] = React.useState<SmartArtLayout>('process');
  const [text, setText] = React.useState('Step One\nStep Two\nStep Three\nStep Four');
  return (
    <Dialog title="Insert SmartArt" onCancel={onCancel} onConfirm={() => onInsert(layout, text)} confirmLabel="Insert">
      <div className="space-y-3 text-xs">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-400">Layout</div>
          <div className="grid grid-cols-3 gap-1">
            {SMART_ART_LAYOUTS.map(l => (
              <button key={l.id} onClick={() => setLayout(l.id)} title={l.description}
                className={cn('rounded px-2 py-2 text-left text-[10px]', layout === l.id ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>
                <div className="font-medium">{l.label}</div>
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <div className="mb-1 text-zinc-400">Bullet text (one item per line)</div>
          <textarea
            value={text} onChange={e => setText(e.target.value)} rows={6}
            placeholder="Step One&#10;Step Two&#10;Step Three"
            className="w-full rounded border border-white/10 bg-[#0a0b0e] p-1.5 text-xs text-zinc-100"
          />
        </label>
      </div>
    </Dialog>
  );
}

function PresentMode({ slide, doc, idx, total, onExit }: { slide: Slide; doc: DocState; idx: number; total: number; onExit: () => void }) {
  const [slideTime, setSlideTime] = React.useState(0);
  const tickStart = React.useRef(performance.now() / 1000);
  React.useEffect(() => {
    tickStart.current = performance.now() / 1000;
    setSlideTime(0);
    let raf = 0;
    const loop = () => {
      const t = performance.now() / 1000 - tickStart.current;
      setSlideTime(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [slide.id]);

  const slideDur = Math.max(8, ...slide.elements.map(e => e.animations ? totalAnimationDuration(e.animations) + 2 : 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black" onClick={onExit}>
      <div className="relative" style={{ aspectRatio: `${doc.width}/${doc.height}`, width: '90vw', maxHeight: '90vh' }}>
        <AnimatedSlideCanvas slide={slide} doc={doc} slideTime={slideTime} slideDur={slideDur} />
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-xs text-white">
        {idx + 1} / {total} · ESC to exit · {slideTime.toFixed(1)}s
      </div>
    </div>
  );
}

function AnimatedSlideCanvas({ slide, doc, slideTime, slideDur }: { slide: Slide; doc: DocState; slideTime: number; slideDur: number }) {
  const frame = { w: doc.width, h: doc.height };
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: slide.background }}>
      <svg viewBox={`0 0 ${doc.width} ${doc.height}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        {slide.elements.map(el => {
          const state = computeElementState(el.animations, slideTime, slideDur, frame);
          const cx = el.x + el.w / 2;
          const cy = el.y + el.h / 2;
          const transform = `translate(${state.translateX} ${state.translateY}) rotate(${el.rotation + state.rotate} ${cx} ${cy}) scale(${state.scale}) translate(${cx * (1 / state.scale - 1)} ${cy * (1 / state.scale - 1)})`;
          const opacity = state.opacity;
          if (el.kind === 'rect') return <rect key={el.id} x={el.x} y={el.y} width={el.w} height={el.h} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth ?? 0} transform={transform} opacity={opacity} />;
          if (el.kind === 'ellipse') return <ellipse key={el.id} cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={el.w / 2} ry={el.h / 2} fill={el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth ?? 0} transform={transform} opacity={opacity} />;
          if (el.kind === 'arrow') {
            const y = el.y + el.h / 2;
            return (
              <g key={el.id} transform={transform} opacity={opacity}>
                <line x1={el.x} y1={y} x2={el.x + el.w - 20} y2={y} stroke={el.fill} strokeWidth={el.strokeWidth ?? 4} strokeLinecap="round" />
                <polygon points={`${el.x + el.w},${y} ${el.x + el.w - 22},${y - 12} ${el.x + el.w - 22},${y + 12}`} fill={el.fill} />
              </g>
            );
          }
          if (el.kind === 'image' && el.imageData) {
            return <image key={el.id} href={el.imageData} x={el.x} y={el.y} width={el.w} height={el.h} preserveAspectRatio="xMidYMid slice" transform={transform} opacity={opacity} />;
          }
          if (el.kind === 'text') {
            const lines = (el.text ?? '').split('\n');
            const lh = (el.size ?? 28) * 1.25;
            const totalH = lines.length * lh;
            const yBase = el.y + (el.h - totalH) / 2 + lh * 0.78;
            const xBase = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
            const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
            return (
              <g key={el.id} transform={transform} opacity={opacity}>
                {lines.map((ln, i) => (
                  <text key={i} x={xBase} y={yBase + i * lh} fontSize={el.size} fontFamily={el.font} fill={el.color}
                    fontWeight={el.bold ? 700 : 400} fontStyle={el.italic ? 'italic' : 'normal'} textAnchor={anchor}>
                    {ln}
                  </text>
                ))}
              </g>
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
}

function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
}

function getHandleStyle(corner: string): React.CSSProperties {
  const m = '-5px';
  const styles: Record<string, React.CSSProperties> = {
    nw: { left: m, top: m, cursor: 'nwse-resize' },
    ne: { right: m, top: m, cursor: 'nesw-resize' },
    sw: { left: m, bottom: m, cursor: 'nesw-resize' },
    se: { right: m, bottom: m, cursor: 'nwse-resize' },
    n: { left: '50%', top: m, marginLeft: -5, cursor: 'ns-resize' },
    s: { left: '50%', bottom: m, marginLeft: -5, cursor: 'ns-resize' },
    e: { right: m, top: '50%', marginTop: -5, cursor: 'ew-resize' },
    w: { left: m, top: '50%', marginTop: -5, cursor: 'ew-resize' },
  };
  return styles[corner] ?? {};
}

function SlidePreview({ slide, doc }: { slide: Slide; doc: DocState }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: slide.background }}>
      <svg viewBox={`0 0 ${doc.width} ${doc.height}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        {slide.elements.map(el => {
          if (el.kind === 'rect') return <rect key={el.id} x={el.x} y={el.y} width={el.w} height={el.h} fill={el.fill} />;
          if (el.kind === 'ellipse') return <ellipse key={el.id} cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={el.w / 2} ry={el.h / 2} fill={el.fill} />;
          if (el.kind === 'image' && el.imageData) return <image key={el.id} href={el.imageData} x={el.x} y={el.y} width={el.w} height={el.h} preserveAspectRatio="xMidYMid slice" />;
          if (el.kind === 'text') {
            return <text key={el.id} x={el.x} y={el.y + (el.size ?? 28)} fontSize={el.size} fontFamily={el.font} fill={el.color} fontWeight={el.bold ? 700 : 400}>{(el.text ?? '').slice(0, 80)}</text>;
          }
          return null;
        })}
      </svg>
    </div>
  );
}

function ElementInspector({ element, theme, onChange }: { element: Element; theme: Theme; onChange: (mut: (e: Element) => void) => void }) {
  return (
    <StudioPanel title={element.kind === 'text' ? 'Text' : element.kind === 'rect' ? 'Rectangle' : element.kind === 'ellipse' ? 'Ellipse' : element.kind === 'image' ? 'Image' : 'Element'}>
      <div className="space-y-3">
        {element.kind === 'text' && (
          <>
            <div>
              <div className="mb-1 text-xs text-zinc-400">Text</div>
              <textarea value={element.text ?? ''} onChange={e => onChange(el => { el.text = e.target.value; })} rows={3} className="w-full rounded border border-white/10 bg-[#0a0b0e] p-1.5 text-xs text-zinc-100" />
            </div>
            <StudioSlider label="Size" value={element.size ?? 28} min={10} max={120} onChange={v => onChange(el => { el.size = v; })} suffix="px" />
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span>Color</span>
              <input type="color" value={element.color ?? '#ffffff'} onChange={e => onChange(el => { el.color = e.target.value; })} className="h-6 w-10 rounded border border-white/10" />
            </div>
          </>
        )}
        {(element.kind === 'rect' || element.kind === 'ellipse' || element.kind === 'arrow') && (
          <>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span>Fill</span>
              <input type="color" value={element.fill ?? '#000000'} onChange={e => onChange(el => { el.fill = e.target.value; })} className="h-6 w-10 rounded border border-white/10" />
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span>Stroke</span>
              <input type="color" value={element.stroke ?? '#000000'} onChange={e => onChange(el => { el.stroke = e.target.value; })} className="h-6 w-10 rounded border border-white/10" />
              <input type="number" value={element.strokeWidth ?? 0} onChange={e => onChange(el => { el.strokeWidth = +e.target.value; })} className="h-6 w-14 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-xs" />
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Mini2 label="X" value={Math.round(element.x)} onChange={v => onChange(el => { el.x = v; })} />
          <Mini2 label="Y" value={Math.round(element.y)} onChange={v => onChange(el => { el.y = v; })} />
          <Mini2 label="W" value={Math.round(element.w)} onChange={v => onChange(el => { el.w = v; })} />
          <Mini2 label="H" value={Math.round(element.h)} onChange={v => onChange(el => { el.h = v; })} />
        </div>
        <StudioSlider label="Rotation" value={element.rotation} min={-180} max={180} onChange={v => onChange(el => { el.rotation = v; })} suffix="°" />
      </div>
    </StudioPanel>
  );
}

function Mini2({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
      <span className="w-4">{label}</span>
      <input type="number" value={value} onChange={e => onChange(+e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-1 text-right" />
    </label>
  );
}

function Mini({ children, onClick, danger }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; danger?: boolean }) {
  return <button onClick={onClick} className={cn('grid h-4 w-4 place-items-center rounded bg-black/60', danger ? 'text-rose-300 hover:bg-rose-500/60' : 'text-white hover:bg-black/80')}>{children}</button>;
}

const Tb = ({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) => (
  <button onClick={onClick} title={title} className={cn('grid h-7 w-7 place-items-center rounded', active ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5')}>{children}</button>
);

async function renderSlideToPng(slide: Slide, doc: DocState): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = doc.width; c.height = doc.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = slide.background;
  ctx.fillRect(0, 0, c.width, c.height);
  for (const el of slide.elements) {
    ctx.save();
    ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-(el.x + el.w / 2), -(el.y + el.h / 2));
    if (el.kind === 'rect') {
      ctx.fillStyle = el.fill ?? '#000';
      ctx.fillRect(el.x, el.y, el.w, el.h);
      if ((el.strokeWidth ?? 0) > 0) {
        ctx.strokeStyle = el.stroke ?? '#000';
        ctx.lineWidth = el.strokeWidth ?? 0;
        ctx.strokeRect(el.x, el.y, el.w, el.h);
      }
    } else if (el.kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = el.fill ?? '#000'; ctx.fill();
      if ((el.strokeWidth ?? 0) > 0) { ctx.strokeStyle = el.stroke ?? '#000'; ctx.lineWidth = el.strokeWidth ?? 0; ctx.stroke(); }
    } else if (el.kind === 'arrow') {
      const y = el.y + el.h / 2;
      ctx.strokeStyle = el.fill ?? '#fff';
      ctx.lineWidth = el.strokeWidth ?? 4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(el.x, y); ctx.lineTo(el.x + el.w - 20, y); ctx.stroke();
      ctx.fillStyle = el.fill ?? '#fff';
      ctx.beginPath(); ctx.moveTo(el.x + el.w, y); ctx.lineTo(el.x + el.w - 22, y - 12); ctx.lineTo(el.x + el.w - 22, y + 12); ctx.closePath(); ctx.fill();
    } else if (el.kind === 'image' && el.imageData) {
      const img = new Image();
      img.src = el.imageData;
      await new Promise(r => { if (img.complete) r(null); else img.onload = () => r(null); });
      ctx.drawImage(img, el.x, el.y, el.w, el.h);
    } else if (el.kind === 'text') {
      ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? 700 : 400} ${el.size}px ${el.font}`;
      ctx.fillStyle = el.color ?? '#000';
      ctx.textAlign = (el.align ?? 'left') as CanvasTextAlign;
      ctx.textBaseline = 'top';
      const lines = (el.text ?? '').split('\n');
      const lh = (el.size ?? 28) * 1.25;
      const totalH = lines.length * lh;
      const yBase = el.y + Math.max(0, (el.h - totalH) / 2);
      const xBase = el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x;
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], xBase, yBase + i * lh);
    }
    ctx.restore();
  }
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not render slide')), 'image/png'));
}

function Dialog({ title, children, onCancel, onConfirm, confirmLabel = 'OK' }: { title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width="md">{children}</SharedDialog>;
}
