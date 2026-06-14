'use client';

import * as React from 'react';
import {
  Loader2, Download, Save, Upload, Undo2, Redo2, FileText, Search,
  Bold, Italic, Underline, Strikethrough, Subscript, Superscript, Code, Quote, Link as LinkIcon,
  List, ListOrdered, ListChecks, Heading1, Heading2, Heading3, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Table as TableIcon, Image as ImageIcon, X, Type as TypeIcon, Palette, Highlighter,
  Indent, Outdent, Eraser, Eye, EyeOff, Sparkles, Wand2, Languages, Users, Share2,
  History, Check, X as XIcon, Volume2, MicVocal, Sigma, BookOpen,
  Clock, Calendar, Minus, CornerDownLeft, RotateCcw, Pilcrow, MessageSquare,
  SeparatorHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUsageGate } from '@/components/usage/use-usage-gate';
import { checkLever } from '@/lib/limits/policy';
import { usePolicyGate } from '@/components/limits/PolicyGate';
import { useIsPro } from '@/lib/limits/use-is-pro';

const POLICY_KEY = 'office-docs';
const RECOVERY_KEY = 'docs-studio-recovery-v1';
const RECOVERY_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

interface RecoverySnapshot { at: number; doc: DocState; }
import {
  StudioShell, StudioTopBar, StudioBody, StudioSidebar, StudioPanel,
  StudioButton, StudioStatusBar,
  newProject, saveProject, listProjects, loadProject,
  type StudioProject, downloadBlob, safeFilename, useShortcuts,
  extractiveSummarize, readabilityScore,
  importDocx, exportDocx,
  LOCALES, detectScript, directionForText, fontStackForText, langAttrFromLocale,
  CollabSession, makeHttpSignal, pickPeerColor, type CollabPeer,
  TrackChangesModel, htmlDiffMarkup, type DocChange,
  CommentsModel, type Comment as DocComment,
  extractTocFromHtml, buildTocHtml, readAloud, stopReadAloud, makeVoiceTyping, type VoiceTypingHandler,
  preloadKatex, renderEquationToHtml, EQUATION_TEMPLATES,
  HelpButton, useRegisterShortcuts, DesktopOnly, MobileOnly, isPhone,
  pushToast, SharedDialog, EmptyState,
} from '@/lib/studios';
import { sanitizeHtml } from '@/lib/safe-html';

interface DocState {
  name: string;
  html: string;
  font: string;
  fontSize: number;
  pageWidth: number;
  showOutline: boolean;
  locale: string;
  direction: 'auto' | 'ltr' | 'rtl';
  scriptFont: 'auto' | 'manual';
  /** Comment threads anchored to <span data-comment> markers in the HTML. */
  comments?: DocComment[];
}

const FONTS = [
  { v: 'Georgia, serif', label: 'Georgia' },
  { v: 'system-ui, sans-serif', label: 'System' },
  { v: 'Inter, sans-serif', label: 'Inter' },
  { v: '"Times New Roman", serif', label: 'Times' },
  { v: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { v: '"Courier New", monospace', label: 'Courier' },
];

const NEW_DOC = (): DocState => {
  const fallback = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US';
  return {
    name: 'Untitled',
    html: '<h1>Untitled</h1><p>Start writing here…</p>',
    font: 'Georgia, serif',
    fontSize: 16,
    pageWidth: 760,
    // Outline panel covers the page on a phone — start hidden there (tap the
    // Outline toggle to show it); docked open on desktop.
    showOutline: !isPhone(),
    locale: fallback,
    direction: 'auto',
    scriptFont: 'auto',
  };
};

export default function OfficeDocsPro() {
  const { guard, gate } = useUsageGate('text');
  const isPro = useIsPro();
  const policyGate = usePolicyGate();
  const [doc, setDoc] = React.useState<DocState>(() => NEW_DOC());
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const pageWrapRef = React.useRef<HTMLDivElement | null>(null);
  // Inline-image resize: the currently-selected <img> + its overlay box (in
  // page-wrapper coords). Google Docs lets you click an image and drag a corner;
  // contentEditable gives no handles, so we draw our own and set img width %.
  const [selImg, setSelImg] = React.useState<HTMLImageElement | null>(null);
  const [imgBox, setImgBox] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const imgResize = React.useRef<{ startX: number; startW: number; natRatio: number } | null>(null);
  const [busy, setBusy] = React.useState('');
  const [toast, setToast] = React.useState('');
  const [findOpen, setFindOpen] = React.useState(false);
  const [findText, setFindText] = React.useState('');
  const [replaceText, setReplaceText] = React.useState('');
  const [matchCount, setMatchCount] = React.useState(0);
  // Linear offset (into the editor's concatenated text) where the LAST match
  // ended — lets "Next" resume past the current hit and wrap around.
  const findCursor = React.useRef(0);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [exportDialog, setExportDialog] = React.useState(false);
  const [savedList, setSavedList] = React.useState<StudioProject[]>([]);
  const [exportFmt, setExportFmt] = React.useState<'md' | 'html' | 'pdf' | 'txt' | 'docx'>('docx');
  const [wordCount, setWordCount] = React.useState({ words: 0, chars: 0, paragraphs: 0, sentences: 0 });
  const [outline, setOutline] = React.useState<{ level: number; text: string; id: string }[]>([]);
  const [readability, setReadability] = React.useState<ReturnType<typeof readabilityScore> | null>(null);
  const [summaryDialog, setSummaryDialog] = React.useState<string[] | null>(null);
  const [collabDialog, setCollabDialog] = React.useState(false);
  const [collabPeers, setCollabPeers] = React.useState<CollabPeer[]>([]);
  const [collabRoom, setCollabRoom] = React.useState<string>('');
  const collabRef = React.useRef<CollabSession | null>(null);
  const collabSuppressBroadcast = React.useRef(false);

  const tcModel = React.useRef<TrackChangesModel>(new TrackChangesModel());
  const [tcChanges, setTcChanges] = React.useState<DocChange[]>([]);
  const [trackMode, setTrackMode] = React.useState(false);
  const [showTrackPanel, setShowTrackPanel] = React.useState(false);
  const [tcAuthor, setTcAuthor] = React.useState('Me');
  const tcColor = React.useMemo(() => pickPeerColor(tcAuthor), [tcAuthor]);
  const lastTrackedHtml = React.useRef<string>('');

  React.useEffect(() => {
    return tcModel.current.onChange(s => setTcChanges([...s.changes]));
  }, []);

  // ── Comments ──────────────────────────────────────────────────────────────
  // A comment anchors to a span of text wrapped in <span data-comment="id"> in the
  // HTML, so the anchor moves with the text and persists through save/reload. The
  // sidebar lists threads; click to scroll to the anchored text. Reuses the shared
  // CommentsModel (add/reply/resolve/remove). This makes the long-advertised
  // "Comments" feature real (it was claimed in the welcome dialog but never wired).
  const commentsModel = React.useRef<CommentsModel>(new CommentsModel());
  const [comments, setComments] = React.useState<DocComment[]>([]);
  const [showComments, setShowComments] = React.useState(false);
  const [activeCommentId, setActiveCommentId] = React.useState<string | null>(null);
  React.useEffect(() => {
    return commentsModel.current.onChange(s => {
      setComments([...s.comments]);
      // Mirror into the doc so save/recovery persist comments with the document.
      setDoc(d => ({ ...d, comments: s.comments }));
    });
  }, []);
  // Highlight the active comment's anchor in the editor.
  React.useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.querySelectorAll('[data-comment].cmt-active').forEach(n => n.classList.remove('cmt-active'));
    if (activeCommentId) el.querySelector(`[data-comment="${activeCommentId}"]`)?.classList.add('cmt-active');
  }, [activeCommentId, comments]);

  const recordChange = React.useCallback(() => {
    if (!trackMode) return;
    // Track the full HTML (not innerText) so an accepted/rejected change can
    // restore the exact formatted content, and so bold/italic/colour applied
    // while tracking isn't silently dropped from the change record.
    const cur = editorRef.current?.innerHTML ?? '';
    const prev = lastTrackedHtml.current;
    if (cur === prev) return;
    tcModel.current.record(['text'], 'set', prev, cur, tcAuthor, tcColor, 'edit');
    lastTrackedHtml.current = cur;
  }, [trackMode, tcAuthor, tcColor]);

  React.useEffect(() => {
    if (trackMode) lastTrackedHtml.current = editorRef.current?.innerHTML ?? '';
  }, [trackMode]);

  // Reject ACTUALLY reverts the document to the change's `before` HTML (the old
  // model only flipped a status flag and never touched the doc). Accept keeps the
  // current content. Applying a reject re-bases the tracked baseline so further
  // edits diff against the reverted state.
  const applyRejectedHtml = (html: string | null | undefined) => {
    if (html == null || !editorRef.current) return;
    editorRef.current.innerHTML = sanitizeHtml(String(html));
    setDoc(d => ({ ...d, html: String(html) }));
    lastTrackedHtml.current = String(html);
    refreshDerived();
    scheduleAutosave();
  };
  const rejectChange = (id: string) => {
    const ch = tcModel.current.reject(id);
    applyRejectedHtml(ch?.before);
  };
  const rejectAllChanges = () => {
    // Revert to the oldest change's `before` (the document before any tracked
    // edit), then mark all rejected.
    const first = tcChanges.find(c => c.status !== 'rejected');
    tcModel.current.rejectAll();
    if (first) applyRejectedHtml(first.before);
  };

  // Add a comment on the current selection: wrap the selected text in a marker
  // span carrying the comment id (so the anchor lives in the HTML and survives
  // edits/save), record the comment, and open the sidebar.
  const addCommentOnSelection = () => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) { toastFor('Select some text to comment on'); return; }
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) { toastFor('Select text inside the document'); return; }
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    try {
      const span = document.createElement('span');
      span.setAttribute('data-comment', id);
      span.className = 'doc-comment-anchor';
      // surroundContents throws if the range crosses element boundaries; fall back
      // to extract+insert which handles partial/multi-node selections.
      try { range.surroundContents(span); }
      catch { const frag = range.extractContents(); span.appendChild(frag); range.insertNode(span); }
      sel.removeAllRanges();
    } catch { toastFor('Could not anchor a comment there — try a simpler selection'); return; }
    // The model assigns its own comment id; adopt it onto the marker span so the
    // anchor and the comment share an id.
    const justAdded = commentsModel.current.add({ kind: 'text-range', start: 0, end: 0 }, tcAuthor, tcColor, '', undefined);
    const sp = el.querySelector(`[data-comment="${id}"]`);
    if (sp && justAdded) sp.setAttribute('data-comment', justAdded.id);
    setActiveCommentId(justAdded?.id ?? null);
    setShowComments(true);
    persistHtml();
  };

  const submitCommentText = (id: string, text: string) => {
    if (!text.trim()) return;
    commentsModel.current.editText(id, text.trim());
    persistHtml();
  };
  const replyToComment = (parentId: string, text: string) => {
    if (!text.trim()) return;
    commentsModel.current.reply(parentId, tcAuthor, tcColor, text.trim());
    persistHtml();
  };
  const resolveComment = (id: string) => {
    commentsModel.current.resolve(id, true);
    // Strip the anchor highlight from the HTML when resolved (keep the text).
    const el = editorRef.current;
    const sp = el?.querySelector(`[data-comment="${id}"]`);
    if (sp) { const parent = sp.parentNode; while (sp.firstChild) parent?.insertBefore(sp.firstChild, sp); parent?.removeChild(sp); }
    persistHtml();
  };
  const deleteComment = (id: string) => {
    commentsModel.current.remove(id);
    const el = editorRef.current;
    const sp = el?.querySelector(`[data-comment="${id}"]`);
    if (sp) { const parent = sp.parentNode; while (sp.firstChild) parent?.insertBefore(sp.firstChild, sp); parent?.removeChild(sp); }
    if (activeCommentId === id) setActiveCommentId(null);
    persistHtml();
  };
  const scrollToComment = (id: string) => {
    setActiveCommentId(id);
    const sp = editorRef.current?.querySelector(`[data-comment="${id}"]`);
    sp?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const [reading, setReading] = React.useState(false);
  // Distraction-free "Reading mode": hides the format ribbon + collab bar and
  // centres the page so the document reads like a printed sheet. Distinct from
  // `reading` above (Web-Speech read-aloud).
  const [readingMode, setReadingMode] = React.useState(false);
  const readPollRef = React.useRef<number | null>(null);
  React.useEffect(() => () => {
    if (readPollRef.current) clearInterval(readPollRef.current);
  }, []);
  const [voiceTyping, setVoiceTyping] = React.useState(false);
  const voiceTypingRef = React.useRef<VoiceTypingHandler | null>(null);
  const [equationDialog, setEquationDialog] = React.useState(false);
  const [symbolDialog, setSymbolDialog] = React.useState(false);

  // ── Autosave + crash recovery ───────────────────────────────────────────
  // Google Docs' silent auto-save is table stakes; its weakness is being
  // cloud-only/offline-weak. We auto-snapshot to localStorage so a tab crash,
  // reload, or accidental close never loses work — fully on-device.
  type SaveState = 'idle' | 'saving' | 'saved';
  const [saveState, setSaveState] = React.useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [recovery, setRecovery] = React.useState<RecoverySnapshot | null>(null);
  const recoveryDismissed = React.useRef(false);
  const autosaveTimer = React.useRef<number | null>(null);
  const dirtyRef = React.useRef(false);

  // Slash command menu (Smart Canvas analogue) + floating selection toolbar +
  // markdown-as-you-type chip.
  const [slash, setSlash] = React.useState<{ x: number; y: number; query: string } | null>(null);
  const [slashIndex, setSlashIndex] = React.useState(0);
  const slashRange = React.useRef<Range | null>(null);
  const [floatBar, setFloatBar] = React.useState<{ x: number; y: number } | null>(null);
  // True when the caret sits inside a <td>/<th> — gates the table-edit buttons.
  const [inTable, setInTable] = React.useState(false);
  const [mdAutoformat, setMdAutoformat] = React.useState(true);
  const [autoformatUndo, setAutoformatUndo] = React.useState<{ label: string } | null>(null);
  const autoformatUndoTimer = React.useRef<number | null>(null);

  const startReadAloud = () => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const text = (sel?.toString() ?? '').trim() || el.innerText;
    if (!text) { toastFor('Nothing to read'); return; }
    readAloud(text, { lang: langAttrFromLocale(doc.locale), rate: 1 });
    setReading(true);
    // Track the poll handle so unmount/stop clears it. Previously the
    // setInterval lived only in the closure of its own self-clearing tick,
    // so navigating away mid-read or starting a second read both left
    // dangling pollers updating state on an unmounted/stale component.
    if (readPollRef.current) clearInterval(readPollRef.current);
    readPollRef.current = window.setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        setReading(false);
        if (readPollRef.current) {
          clearInterval(readPollRef.current);
          readPollRef.current = null;
        }
      }
    }, 300);
  };

  const stopReading = () => {
    stopReadAloud();
    setReading(false);
    if (readPollRef.current) { clearInterval(readPollRef.current); readPollRef.current = null; }
  };

  const toggleVoiceTyping = () => {
    if (voiceTyping) {
      voiceTypingRef.current?.stop();
      voiceTypingRef.current = null;
      setVoiceTyping(false);
      return;
    }
    const handler = makeVoiceTyping({
      lang: doc.locale || 'en-US',
      onFinal: (text) => exec('insertText', text + ' '),
      onError: (e) => { toastFor(`Voice: ${e}`); setVoiceTyping(false); voiceTypingRef.current?.stop(); voiceTypingRef.current = null; },
    });
    if (!handler.isSupported) { toastFor('Voice typing not supported in this browser'); return; }
    voiceTypingRef.current = handler;
    handler.start();
    setVoiceTyping(true);
  };

  React.useEffect(() => () => {
    voiceTypingRef.current?.stop();
    stopReadAloud();
  }, []);

  const insertToc = () => {
    const el = editorRef.current;
    if (!el) return;
    const entries = extractTocFromHtml(el.innerHTML);
    if (!entries.length) { toastFor('Add some H1/H2/H3 headings first'); return; }
    const tocHtml = buildTocHtml(entries, { numbered: true, title: 'Table of Contents' });
    el.innerHTML = el.innerHTML.replace(/<div[^>]*data-toc[^>]*>[\s\S]*?<\/div>/g, '');
    const firstHeading = el.querySelector('h1, h2');
    if (firstHeading && firstHeading.parentNode) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = tocHtml;
      firstHeading.parentNode.insertBefore(wrapper.firstChild!, firstHeading);
    } else {
      exec('insertHTML', tocHtml);
    }
    persistHtml();
    toastFor(`Inserted TOC with ${entries.length} entries`);
  };

  // Task list / checklist. Each row is a real <input type=checkbox> marked
  // contenteditable=false so the caret never lands inside it; the editor click
  // handler toggles it (and reflects state to the `checked` attribute so it
  // survives save/load as HTML). A leading data-checklist wrapper lets us style
  // it and keep bullets/markers hidden.
  const insertChecklist = () => {
    const item = '<li style="display:flex;align-items:flex-start;gap:8px;margin:2px 0">'
      + '<input type="checkbox" contenteditable="false" style="margin-top:4px;cursor:pointer" />'
      + '<span>Task</span></li>';
    const html = `<ul data-checklist="1" style="list-style:none;padding-left:0;margin:0.4em 0">${item}${item}${item}</ul><p></p>`;
    exec('insertHTML', html);
    persistHtml();
    toastFor('Inserted checklist');
  };

  const insertEquation = async (latex: string, displayMode: boolean) => {
    if (!latex.trim()) return;
    const html = await renderEquationToHtml(latex, displayMode);
    const wrapper = displayMode
      ? `<div data-equation="${escapeHtml(latex)}" style="text-align:center;margin:0.6em 0;">${html}</div>`
      : `<span data-equation="${escapeHtml(latex)}">${html}</span>`;
    exec('insertHTML', wrapper + (displayMode ? '<p></p>' : ' '));
    setEquationDialog(false);
  };

  React.useEffect(() => { void preloadKatex(); }, []);

  const [docsWelcomed, setDocsWelcomed] = React.useState(true);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setDocsWelcomed(sessionStorage.getItem('docs-studio-welcomed') === '1');
  }, []);
  const dismissDocsWelcome = React.useCallback(() => {
    setDocsWelcomed(true);
    try { sessionStorage.setItem('docs-studio-welcomed', '1'); } catch {}
  }, []);
  const docsLooksUntouched = doc.name === 'Untitled' && doc.html === '<h1>Untitled</h1><p>Start writing here…</p>';

  const startCollab = (name: string, room: string) => {
    const id = (room || Math.random().toString(36).slice(2, 8)).toLowerCase();
    const session = new CollabSession(name || 'Anonymous', pickPeerColor(name || 'anon'));
    // Real cross-device signaling over the same-origin relay (the handshake
    // only — the document goes peer-to-peer). Previously BroadcastChannel, which
    // only connected tabs in the SAME browser on ONE machine, so the advertised
    // internet collaboration could not actually happen.
    session.attachSignal(makeHttpSignal(id, session.self.id));
    session.onPeers(setCollabPeers);
    const docCrdt = session.getDoc();
    // Seed the shared doc with our current FULL HTML (not innerText) so peers get
    // the formatted document, not a plain-text flattening. Uses the same kv LWW
    // mechanism office-studio (Sheets) collab uses — proven cross-device.
    const seedOp = docCrdt.set('html', editorRef.current?.innerHTML ?? doc.html);
    docCrdt.onUpdate((_state, op) => {
      if (!op || op.type !== 'set' || op.key !== 'html') return;
      if (op.author === session.self.id) {
        // Our own edit — broadcast it to peers.
        session.broadcastOp(op);
      } else if (editorRef.current && typeof op.value === 'string') {
        // A peer's edit — replace our editor with their sanitized HTML (guard the
        // broadcast loop so we don't echo it back as our own change).
        collabSuppressBroadcast.current = true;
        const sel = window.getSelection();
        const hadFocus = editorRef.current.contains(sel?.anchorNode ?? null);
        editorRef.current.innerHTML = sanitizeHtml(op.value);
        setDoc(d => ({ ...d, html: op.value as string }));
        refreshDerived();
        collabSuppressBroadcast.current = false;
        void hadFocus;
      }
    });
    session.broadcastOp(seedOp);
    session.announce();
    collabRef.current = session;
    setCollabRoom(id);
    setCollabDialog(false);
    toastFor(`Room: ${id} — share this code`);
  };

  const stopCollab = () => {
    collabRef.current?.close();
    collabRef.current = null;
    setCollabPeers([]);
    setCollabRoom('');
    toastFor('Collaboration ended');
  };

  React.useEffect(() => () => { collabRef.current?.close(); }, []);

  const toastFor = (m: string) => { pushToast(m); };

  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== doc.html) {
      // Defence-in-depth: a project saved before the import sanitiser was
      // added — or imported from a peer — could still carry inline event
      // handlers. Sanitise on mount so the editor never lights up scripts.
      editorRef.current.innerHTML = sanitizeHtml(doc.html);
    }
    refreshDerived();
  }, []);

  const refreshDerived = () => {
    const el = editorRef.current;
    if (!el) return;
    const txt = el.innerText || '';
    const words = txt.trim().length ? txt.trim().split(/\s+/).length : 0;
    const chars = txt.length;
    const paragraphs = el.querySelectorAll('p, h1, h2, h3, h4, li, blockquote').length;
    // Sentence count: split on terminal punctuation (. ! ? … and their
    // full-width CJK equivalents), ignoring empties from trailing marks.
    const sentences = txt.trim().length
      ? (txt.match(/[^.!?。！？…]+[.!?。！？…]*/g) ?? []).filter(s => s.trim().length).length
      : 0;
    setWordCount({ words, chars, paragraphs, sentences });
    const headings = Array.from(el.querySelectorAll('h1, h2, h3'));
    setOutline(headings.map((h, i) => {
      if (!h.id) h.id = `h-${i}`;
      const level = h.tagName === 'H1' ? 1 : h.tagName === 'H2' ? 2 : 3;
      return { level, text: h.textContent ?? '', id: h.id };
    }));
    if (txt.length > 30) setReadability(readabilityScore(txt));
    else setReadability(null);
  };

  const runSummarize = () => {
    const txt = editorRef.current?.innerText ?? '';
    if (txt.length < 100) { toastFor('Need more text to summarize'); return; }
    const summary = extractiveSummarize(txt, 5);
    setSummaryDialog(summary);
  };

  const insertSummary = (lines: string[]) => {
    exec('insertHTML', `<h2>Summary</h2>${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}`);
    setSummaryDialog(null);
  };

  const translateSelection = async () => {
    const sel = window.getSelection();
    const selText = sel?.toString();
    if (!selText) { toastFor('Select some text first'); return; }
    const targetLang = window.prompt('Translate to (e.g. es, fr, de, ja):', 'es');
    if (!targetLang) return;
    setBusy('Translating…');
    try {
      const W = window as any;
      let translator: any = null;
      if (W.translation?.createTranslator) translator = await W.translation.createTranslator({ sourceLanguage: 'en', targetLanguage: targetLang });
      else if (W.Translator?.create) translator = await W.Translator.create({ sourceLanguage: 'en', targetLanguage: targetLang });
      if (!translator) { toastFor('Browser translation unavailable'); return; }
      const translated = await translator.translate(selText);
      exec('insertText', translated);
      toastFor(`Translated to ${targetLang}`);
    } catch (e) {
      toastFor((e as Error).message || 'Translation failed');
    } finally { setBusy(''); }
  };

  // Serialize the live working document (editor HTML is the source of truth;
  // doc.html lags by a render). Used by both autosave and recovery.
  const serializeDoc = React.useCallback((): DocState => {
    const el = editorRef.current;
    return { ...doc, html: el ? el.innerHTML : doc.html };
  }, [doc]);

  const writeRecovery = React.useCallback(() => {
    try {
      const snap: RecoverySnapshot = { at: Date.now(), doc: serializeDoc() };
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(snap));
      setSaveState('saved');
      setLastSavedAt(snap.at);
    } catch { /* quota / private mode — never block typing */ }
  }, [serializeDoc]);

  const scheduleAutosave = React.useCallback(() => {
    dirtyRef.current = true;
    setSaveState('saving');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      writeRecovery();
      dirtyRef.current = false;
    }, 2000);
  }, [writeRecovery]);

  // Manual "Save now" — flush the pending debounce immediately rather than
  // waiting the 2s. Snapshots the live editor HTML, not the lagging doc.html.
  const saveNow = React.useCallback(() => {
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }
    writeRecovery();
    dirtyRef.current = false;
  }, [writeRecovery]);

  // Position the resize overlay over the selected image (page-wrapper coords).
  const syncImgBox = React.useCallback(() => {
    const img = selImg, wrap = pageWrapRef.current;
    if (!img || !wrap || !img.isConnected) { setImgBox(null); return; }
    const ir = img.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    setImgBox({ left: ir.left - wr.left, top: ir.top - wr.top, width: ir.width, height: ir.height });
  }, [selImg]);
  React.useEffect(() => { syncImgBox(); }, [selImg, syncImgBox]);
  // Keep the overlay glued to the image while the editor scrolls/relayouts.
  React.useEffect(() => {
    if (!selImg) return;
    const onScroll = () => syncImgBox();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
  }, [selImg, syncImgBox]);

  const startImgResize = (e: React.PointerEvent) => {
    if (!selImg) return;
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const r = selImg.getBoundingClientRect();
    imgResize.current = { startX: e.clientX, startW: r.width, natRatio: r.height / Math.max(1, r.width) };
    const onMove = (ev: PointerEvent) => {
      if (!imgResize.current || !selImg) return;
      const dw = ev.clientX - imgResize.current.startX;
      const newW = Math.max(32, imgResize.current.startW + dw);
      // Set an explicit pixel width but cap to the editor content width so it
      // never overflows the page; height follows via aspect-ratio (auto).
      const maxW = editorRef.current ? editorRef.current.clientWidth - 160 : newW;
      const w = Math.min(newW, maxW);
      selImg.style.width = `${Math.round(w)}px`;
      selImg.style.height = 'auto';
      syncImgBox();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      imgResize.current = null;
      persistHtml(); recordChange();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const persistHtml = React.useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setDoc(d => ({ ...d, html: el.innerHTML }));
    refreshDerived();
    scheduleAutosave();
    // Live collab: push the FULL HTML to peers (rich text, not innerText).
    // Skip when we're applying a peer's incoming edit (suppress flag) to avoid
    // an echo loop. kv-set LWW resolves concurrent edits deterministically.
    if (collabRef.current && !collabSuppressBroadcast.current) {
      const op = collabRef.current.getDoc().set('html', el.innerHTML);
      collabRef.current.broadcastOp(op);
    }
  }, [scheduleAutosave]);

  // Flush a pending autosave the moment the tab is hidden/closed so the very
  // last keystrokes survive a hard close (the 2s debounce might not fire).
  React.useEffect(() => {
    const flush = () => { if (dirtyRef.current) writeRecovery(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [writeRecovery]);

  // On mount, surface a fresh recovery snapshot if the doc is still untouched.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as RecoverySnapshot;
      if (!snap?.doc || typeof snap.at !== 'number') return;
      if (Date.now() - snap.at > RECOVERY_MAX_AGE) { localStorage.removeItem(RECOVERY_KEY); return; }
      // Don't bother offering an effectively-empty snapshot.
      const plain = (snap.doc.html || '').replace(/<[^>]*>/g, '').trim();
      if (plain.length < 12 || snap.doc.html === NEW_DOC().html) { localStorage.removeItem(RECOVERY_KEY); return; }
      setRecovery(snap);
    } catch { /* corrupt snapshot — ignore */ }
  }, []);

  const restoreRecovery = React.useCallback(() => {
    if (!recovery) return;
    setDoc(recovery.doc);
    commentsModel.current.setAll(recovery.doc.comments ?? []);
    if (editorRef.current) editorRef.current.innerHTML = sanitizeHtml(recovery.doc.html);
    refreshDerived();
    setRecovery(null);
    recoveryDismissed.current = true;
    toastFor('Session restored');
  }, [recovery]);

  const dismissRecovery = React.useCallback(() => {
    setRecovery(null);
    recoveryDismissed.current = true;
    try { localStorage.removeItem(RECOVERY_KEY); } catch {}
  }, []);

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    persistHtml();
  };

  const formatBlock = (tag: string) => exec('formatBlock', `<${tag}>`);

  // Insert a page break that is both visible on screen (dashed separator) and
  // honored by print/PDF export via CSS `page-break-before`. Trailing <p> keeps
  // the caret on a fresh editable line after the break.
  const insertPageBreak = () => exec(
    'insertHTML',
    '<div style="page-break-before:always;break-before:page;border-top:1px dashed #94a3b8;margin:16px 0;height:0" contenteditable="false" aria-label="Page break"></div><p></p>',
  );

  // Set line spacing on the paragraph(s) in the current selection (Google Docs
  // "Line spacing"). Walks from the selection up to the nearest block element
  // and sets its line-height; spans across multiple selected blocks.
  const setLineSpacing = (mult: number) => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    el.focus();
    const range = sel.getRangeAt(0);
    const blockOf = (node: Node | null): HTMLElement | null => {
      let n: Node | null = node;
      while (n && n !== el) {
        if (n.nodeType === 1 && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE)$/.test((n as HTMLElement).tagName)) return n as HTMLElement;
        n = n.parentNode;
      }
      return null;
    };
    const blocks = new Set<HTMLElement>();
    const start = blockOf(range.startContainer);
    const end = blockOf(range.endContainer);
    if (start) blocks.add(start);
    if (end) blocks.add(end);
    // include blocks between start and end
    if (start && end && start !== end) {
      let cur: Element | null = start;
      while (cur && cur !== end) { cur = cur.nextElementSibling; if (cur && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE)$/.test(cur.tagName)) blocks.add(cur as HTMLElement); }
    }
    // If selection is collapsed and no block found, wrap the whole editor.
    if (blocks.size === 0) { el.style.lineHeight = String(mult); }
    else blocks.forEach(b => { b.style.lineHeight = String(mult); });
    persistHtml(); recordChange();
  };

  // Apply a font family to the current selection (Google Docs font picker).
  // Wraps the selected text in <font face> via execCommand('fontName').
  const setSelectionFont = (family: string) => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { toastFor('Select some text first'); return; }
    el?.focus();
    document.execCommand('fontName', false, family);
    persistHtml(); recordChange();
  };

  // Apply a pixel font size to the current selection. execCommand('fontSize')
  // only accepts 1–7, so we tag the selection with size 7 then rewrite the
  // resulting <font size="7"> elements to the requested px value (the standard
  // contentEditable font-size workaround).
  const setSelectionFontSize = (px: number) => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.isCollapsed) { toastFor('Select some text first'); return; }
    el.focus();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');
    el.querySelectorAll('font[size="7"]').forEach(f => {
      f.removeAttribute('size');
      (f as HTMLElement).style.fontSize = `${px}px`;
    });
    persistHtml(); recordChange();
  };

  // Capitalization transforms for the current selection (Google Docs
  // Format > Text > Capitalization). Reads the selected text, transforms it,
  // and replaces the selection in place via insertText (keeps undo working).
  const transformCase = (mode: 'upper' | 'lower' | 'title') => {
    const el = editorRef.current;
    const sel = window.getSelection();
    const selText = sel?.toString() ?? '';
    if (!selText.trim()) { toastFor('Select some text first'); return; }
    el?.focus();
    let out: string;
    if (mode === 'upper') out = selText.toUpperCase();
    else if (mode === 'lower') out = selText.toLowerCase();
    else out = selText.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    document.execCommand('insertText', false, out);
    persistHtml(); recordChange();
  };

  // ── Clipboard smart paste ──────────────────────────────────────────────
  // Google Docs pastes images inline; we go further — paste an image from
  // anywhere (screenshot, browser, file manager) straight into the caret,
  // entirely on-device. A window-level listener so it works wherever the
  // caret is, but we bail while typing in our own dialog inputs.
  // Matches the (ungated) toolbar image-insert path — pasting an image is the
  // same on-device operation, just from the clipboard instead of a picker.
  const handlePasteImage = React.useCallback(async (file: File) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const url = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(file);
    });
    exec('insertHTML', `<img src="${url}" alt="" style="max-width:100%;margin:8px 0" />`);
    toastFor('Image pasted');
  }, []);

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable && t !== editorRef.current);
      // Only intercept when an image is present and we're not typing in a
      // form field (the editor itself is contentEditable, which is allowed).
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgItem = Array.from(items).find(i => i.type.startsWith('image/'));
      if (!imgItem || inField) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      void handlePasteImage(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handlePasteImage]);

  // ── Markdown-as-you-type autoformat (with undo chip) ───────────────────
  // A signature Google-Docs flow. Recognise "# ", "- ", "1. ", "> ", "``` "
  // at the start of a line and convert in place — under 50ms, fully undoable.
  const runMarkdownAutoformat = React.useCallback((): boolean => {
    if (!mdAutoformat) return false;
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.anchorNode) return false;
    const node = sel.anchorNode;
    const text = node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : '';
    const offset = sel.anchorOffset;
    const before = text.slice(0, offset);
    type Rule = { re: RegExp; block?: string; cmd?: string; label: string };
    const rules: Rule[] = [
      { re: /^#\s$/, block: 'h1', label: 'Heading 1' },
      { re: /^##\s$/, block: 'h2', label: 'Heading 2' },
      { re: /^###\s$/, block: 'h3', label: 'Heading 3' },
      { re: /^>\s$/, block: 'blockquote', label: 'Quote' },
      { re: /^[-*]\s$/, cmd: 'insertUnorderedList', label: 'Bullet list' },
      { re: /^1\.\s$/, cmd: 'insertOrderedList', label: 'Numbered list' },
    ];
    for (const rule of rules) {
      if (!rule.re.test(before)) continue;
      // Delete the markdown prefix the user just typed, then apply the block.
      const r = document.createRange();
      r.setStart(node, 0);
      r.setEnd(node, offset);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('delete');
      if (rule.block) formatBlock(rule.block);
      else if (rule.cmd) exec(rule.cmd);
      offerAutoformatUndo(rule.label);
      return true;
    }
    return false;
  }, [mdAutoformat]);

  const offerAutoformatUndo = (label: string) => {
    setAutoformatUndo({ label });
    if (autoformatUndoTimer.current) clearTimeout(autoformatUndoTimer.current);
    autoformatUndoTimer.current = window.setTimeout(() => setAutoformatUndo(null), 4000);
  };

  const revertAutoformat = () => {
    exec('undo');
    setAutoformatUndo(null);
    if (autoformatUndoTimer.current) clearTimeout(autoformatUndoTimer.current);
  };

  React.useEffect(() => () => {
    if (autoformatUndoTimer.current) clearTimeout(autoformatUndoTimer.current);
  }, []);

  // ── Slash command menu (Smart-Canvas analogue) ─────────────────────────
  const SLASH_COMMANDS = React.useMemo(() => ([
    { id: 'h1', label: 'Heading 1', hint: 'Large section title', icon: <Heading1 className="h-4 w-4" />, run: () => formatBlock('h1') },
    { id: 'h2', label: 'Heading 2', hint: 'Sub-section', icon: <Heading2 className="h-4 w-4" />, run: () => formatBlock('h2') },
    { id: 'h3', label: 'Heading 3', hint: 'Minor heading', icon: <Heading3 className="h-4 w-4" />, run: () => formatBlock('h3') },
    { id: 'p', label: 'Paragraph', hint: 'Body text', icon: <Pilcrow className="h-4 w-4" />, run: () => formatBlock('p') },
    { id: 'ul', label: 'Bullet list', hint: 'Unordered list', icon: <List className="h-4 w-4" />, run: () => exec('insertUnorderedList') },
    { id: 'ol', label: 'Numbered list', hint: 'Ordered list', icon: <ListOrdered className="h-4 w-4" />, run: () => exec('insertOrderedList') },
    { id: 'checklist', label: 'Checklist', hint: 'Task list with checkboxes', icon: <ListChecks className="h-4 w-4" />, run: () => insertChecklist() },
    { id: 'quote', label: 'Quote', hint: 'Block quote', icon: <Quote className="h-4 w-4" />, run: () => formatBlock('blockquote') },
    { id: 'code', label: 'Code block', hint: 'Monospace block', icon: <Code className="h-4 w-4" />, run: () => formatBlock('pre') },
    { id: 'table', label: 'Table', hint: 'Insert 3×3 table', icon: <TableIcon className="h-4 w-4" />, run: () => insertTable(3, 3) },
    { id: 'divider', label: 'Divider', hint: 'Horizontal rule', icon: <Minus className="h-4 w-4" />, run: () => exec('insertHorizontalRule') },
    { id: 'date', label: "Today's date", hint: new Date().toLocaleDateString(undefined, { dateStyle: 'long' } as any), icon: <Calendar className="h-4 w-4" />, run: () => exec('insertText', new Date().toLocaleDateString(undefined, { dateStyle: 'long' } as any)) },
    { id: 'equation', label: 'Equation', hint: 'LaTeX math', icon: <Sigma className="h-4 w-4" />, run: () => setEquationDialog(true) },
    { id: 'toc', label: 'Table of contents', hint: 'From your headings', icon: <BookOpen className="h-4 w-4" />, run: () => insertToc() },
    { id: 'image', label: 'Image', hint: 'Insert from file', icon: <ImageIcon className="h-4 w-4" />, run: () => insertImageBtn() },
  ]), []);

  const slashFiltered = React.useMemo(() => {
    if (!slash) return [];
    const q = slash.query.toLowerCase().trim();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.id.includes(q));
  }, [slash, SLASH_COMMANDS]);

  const openSlashAtCaret = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0).cloneRange();
    // Only fire at a word boundary so "/" inside a URL like http:// is left
    // alone — the menu is for fresh block insertion, mirroring Notion/Docs.
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = node.textContent ?? '';
      const prev = txt[range.startOffset - 2]; // char before the just-typed "/"
      if (prev && !/\s/.test(prev)) return;
    }
    slashRange.current = range;
    const rect = range.getBoundingClientRect();
    setSlash({ x: rect.left, y: rect.bottom, query: '' });
    setSlashIndex(0);
  };

  const closeSlash = () => { setSlash(null); slashRange.current = null; };

  // Remove the "/query" text the user typed before running the command.
  const consumeSlashText = () => {
    if (!slash) return;
    const sel = window.getSelection();
    const range = slashRange.current;
    if (!sel || !range) return;
    try {
      const node = range.startContainer;
      const end = range.startOffset;
      // length of "/" + query that we want to delete
      const len = slash.query.length + 1;
      const start = Math.max(0, end - len);
      const del = document.createRange();
      del.setStart(node, start);
      del.setEnd(node, end);
      sel.removeAllRanges();
      sel.addRange(del);
      document.execCommand('delete');
    } catch { /* selection drifted — just run the command at caret */ }
  };

  const runSlashCommand = (idx: number) => {
    const cmd = slashFiltered[idx];
    closeSlash();
    if (!cmd) return;
    consumeSlashText();
    cmd.run();
  };

  // ── Floating selection toolbar ─────────────────────────────────────────
  const updateFloatBar = React.useCallback(() => {
    const sel = window.getSelection();
    const el = editorRef.current;
    if (!sel || sel.isCollapsed || !sel.rangeCount || !el) { setFloatBar(null); return; }
    const anchor = sel.anchorNode;
    if (!anchor || !el.contains(anchor)) { setFloatBar(null); return; }
    const text = sel.toString().trim();
    if (!text) { setFloatBar(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { setFloatBar(null); return; }
    setFloatBar({ x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  React.useEffect(() => {
    const onSelChange = () => {
      // Track whether the caret is inside a table cell (gates table-edit buttons).
      const a = window.getSelection()?.anchorNode ?? null;
      const node = a && a.nodeType === 1 ? (a as Element) : a?.parentElement ?? null;
      const cell = node?.closest('td,th') ?? null;
      setInTable(!!cell && !!editorRef.current?.contains(cell));
      // Slash menu and float bar are mutually exclusive surfaces.
      if (slashRange.current) return;
      updateFloatBar();
    };
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, [updateFloatBar]);

  // Keydown on the editor: drive slash menu navigation + open trigger.
  const onEditorKeyDown = (e: React.KeyboardEvent) => {
    if (slash) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => Math.min(i + 1, slashFiltered.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); runSlashCommand(slashIndex); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return; }
      // Backspace past the "/" closes the menu; otherwise re-read query below.
    }
    if (e.key === '/' && !slash) {
      // Defer so the "/" is in the DOM; open menu anchored at the caret.
      setTimeout(openSlashAtCaret, 0);
    }
  };

  // After each input, refresh slash query text or run markdown autoformat.
  const onEditorInput = () => {
    // Markdown autoformat first (it may swallow the space the user typed).
    const consumed = runMarkdownAutoformat();
    if (consumed) { persistHtml(); recordChange(); setFloatBar(null); return; }
    if (slash) refreshSlashQuery();
    persistHtml();
    recordChange();
  };

  const refreshSlashQuery = () => {
    const sel = window.getSelection();
    const range = slashRange.current;
    if (!sel || !range || !sel.anchorNode) { return; }
    try {
      const node = range.startContainer;
      const slashStart = range.startOffset - 1; // position of the "/"
      const caret = sel.anchorOffset;
      const txt = node.textContent ?? '';
      if (slashStart < 0 || txt[slashStart] !== '/' || caret < range.startOffset) { closeSlash(); return; }
      const query = txt.slice(range.startOffset, caret);
      if (/\s/.test(query)) { closeSlash(); return; }
      setSlash(s => s ? { ...s, query } : s);
      setSlashIndex(0);
    } catch { closeSlash(); }
  };

  const insertTable = (rows: number, cols: number) => {
    let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0"><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const cell = r === 0 ? 'th' : 'td';
        html += `<${cell} style="border:1px solid #aaa;padding:6px 10px;min-width:60px">${r === 0 ? `Col ${c + 1}` : ''}</${cell}>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    exec('insertHTML', html);
  };

  // ── Table editing (Word/Docs parity) ──────────────────────────────────────
  // Resolve the <td>/<th> the caret currently sits in (null when not in a table).
  const caretCell = (): HTMLTableCellElement | null => {
    const a = window.getSelection()?.anchorNode ?? null;
    const node = a && a.nodeType === 1 ? (a as Element) : a?.parentElement ?? null;
    const cell = node?.closest('td,th') as HTMLTableCellElement | null;
    if (!cell || !editorRef.current?.contains(cell)) return null;
    return cell;
  };

  // Re-style a freshly created cell to match insertTable's look.
  const styleNewCell = (cell: HTMLTableCellElement) => {
    cell.style.border = '1px solid #aaa';
    cell.style.padding = '6px 10px';
    cell.style.minWidth = '60px';
  };

  const tableInsertRowBelow = () => {
    const cell = caretCell();
    const row = cell?.parentElement as HTMLTableRowElement | undefined;
    const table = cell?.closest('table') as HTMLTableElement | null;
    if (!cell || !row || !table) return;
    const newRow = table.insertRow(row.rowIndex + 1);
    for (let c = 0; c < row.cells.length; c++) styleNewCell(newRow.insertCell(c));
    persistHtml();
    recordChange();
  };

  const tableInsertColRight = () => {
    const cell = caretCell();
    const table = cell?.closest('table') as HTMLTableElement | null;
    if (!cell || !table) return;
    const at = cell.cellIndex + 1;
    for (let r = 0; r < table.rows.length; r++) {
      const tr = table.rows[r];
      styleNewCell(tr.insertCell(Math.min(at, tr.cells.length)));
    }
    persistHtml();
    recordChange();
  };

  const tableDeleteRow = () => {
    const cell = caretCell();
    const row = cell?.parentElement as HTMLTableRowElement | undefined;
    const table = cell?.closest('table') as HTMLTableElement | null;
    if (!cell || !row || !table) return;
    if (table.rows.length <= 1) table.remove(); // deleting the last row drops the table
    else table.deleteRow(row.rowIndex);
    setInTable(false);
    persistHtml();
    recordChange();
  };

  const tableDeleteCol = () => {
    const cell = caretCell();
    const table = cell?.closest('table') as HTMLTableElement | null;
    if (!cell || !table) return;
    const at = cell.cellIndex;
    if (table.rows[0]?.cells.length <= 1) { table.remove(); setInTable(false); }
    else for (let r = 0; r < table.rows.length; r++) {
      const tr = table.rows[r];
      if (at < tr.cells.length) tr.deleteCell(at);
    }
    persistHtml();
    recordChange();
  };

  const insertImage = async (file: File) => {
    const url = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(file);
    });
    exec('insertHTML', `<img src="${url}" alt="" style="max-width:100%;margin:8px 0" />`);
  };

  const insertLink = () => {
    const sel = window.getSelection();
    const selText = sel?.toString() ?? '';
    const url = window.prompt('Link URL:', 'https://');
    if (!url) return;
    if (selText) exec('createLink', url);
    else exec('insertHTML', `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  };

  const insertImageBtn = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => { if (input.files?.[0]) void insertImage(input.files[0]); };
    input.click();
  };

  const importFile = async (file: File) => {
    setRecovery(null); // opening a real document supersedes the recover-last-session offer
    // Opening a document is FREE (like Word/Docs) — the credit is on Export.
    setBusy('Importing…');
    try {
      let rawHtml: string;
      let name = file.name.replace(/\.[^.]+$/, '');
      if (/\.docx$/i.test(file.name)) {
        const r = await importDocx(file);
        rawHtml = r.html;
        name = r.name;
      } else {
        const text = await file.text();
        if (/\.md$/i.test(file.name) || file.type === 'text/markdown') rawHtml = markdownToHtml(text);
        else if (/\.html?$/i.test(file.name) || file.type === 'text/html') rawHtml = text;
        else rawHtml = text.split('\n').map(p => `<p>${escapeHtml(p) || '<br>'}</p>`).join('');
      }
      // Sanitize the imported HTML before it lands in the editor. mammoth,
      // markdownToHtml, and arbitrary user-uploaded .html are NOT XSS-safe
      // by default; a hostile shared file could otherwise execute scripts
      // inside the contentEditable surface.
      const html = sanitizeHtml(rawHtml);
      const next = { ...doc, html, name };
      setDoc(next);
      if (editorRef.current) editorRef.current.innerHTML = html;
      refreshDerived();
      toastFor('Imported');
    } catch (e) {
      toastFor((e as Error).message || 'Import failed');
    } finally { setBusy(''); }
  };

  const exportNow = async () => {
    const pageCount = Math.max(1, Math.ceil(doc.html.replace(/<[^>]*>/g, '').length / 2200));
    const pagesHit = checkLever(POLICY_KEY, 'pages', pageCount, isPro);
    if (pagesHit) { policyGate.fire(pagesHit); return; }
    if (!(await guard())) return;
    setBusy('Exporting…');
    setExportDialog(false);
    try {
      const el = editorRef.current;
      if (!el) return;
      const html = el.innerHTML;
      if (exportFmt === 'md') {
        const md = htmlToMarkdown(html);
        downloadBlob(new Blob([md], { type: 'text/markdown' }), `${safeFilename(doc.name)}.md`);
      } else if (exportFmt === 'html') {
        const full = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(doc.name)}</title>\n<style>body{font-family:${doc.font};max-width:${doc.pageWidth}px;margin:40px auto;padding:0 24px;line-height:1.6;color:#111}h1,h2,h3{margin-top:1.4em}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px}</style></head>\n<body>${html}</body></html>`;
        downloadBlob(new Blob([full], { type: 'text/html' }), `${safeFilename(doc.name)}.html`);
      } else if (exportFmt === 'txt') {
        const txt = el.innerText;
        downloadBlob(new Blob([txt], { type: 'text/plain' }), `${safeFilename(doc.name)}.txt`);
      } else if (exportFmt === 'docx' as any) {
        const blob = await exportDocx(html, doc.name);
        downloadBlob(blob, `${safeFilename(doc.name)}.docx`);
      } else {
        await exportPdf(html);
      }
      toastFor('Exported');
    } catch (e) {
      toastFor((e as Error).message || 'Export failed');
    } finally { setBusy(''); }
  };

  const exportPdf = async (html: string) => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    // Parse via DOMParser instead of `innerHTML =`. The editor surface is
    // contentEditable and users can paste arbitrary HTML; even after the
    // import sanitiser there's no guarantee a surviving `<img onerror>`
    // wouldn't fire during export. DOMParser builds an inert tree.
    const tmp = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
    const blocks = collectBlocks(tmp);
    const margin = 56;
    let page = pdf.addPage([595, 842]);
    let { width: W, height: H } = page.getSize();
    let cursor = H - margin;
    for (const b of blocks) {
      const size = b.kind === 'h1' ? 24 : b.kind === 'h2' ? 20 : b.kind === 'h3' ? 16 : 12;
      const f = b.kind === 'h1' || b.kind === 'h2' || b.kind === 'h3' ? fontBold : font;
      const lh = size * 1.45;
      const maxW = W - margin * 2;
      const lines = wrapText(b.text, f, size, maxW);
      for (const line of lines) {
        if (cursor - lh < margin) {
          page = pdf.addPage([595, 842]);
          ({ width: W, height: H } = page.getSize());
          cursor = H - margin;
        }
        page.drawText(line, { x: margin + (b.kind === 'li' ? 18 : 0), y: cursor, font: f, size, color: rgb(0, 0, 0) });
        cursor -= lh;
      }
      cursor -= size * 0.4;
    }
    // Brand the export for free users (no-op for Pro — setPdfWatermark(null) is
    // called at session start). This is a pdf-lib document, so use the engine's
    // pdf-lib footer stamper, not brandJsPdf (which is for jsPDF docs).
    try {
      const { stampPdfFooter } = await import('@/engines/pdf');
      await stampPdfFooter(pdf);
    } catch { /* never block the export on a footer */ }
    const bytes = await pdf.save();
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    downloadBlob(blob, `${safeFilename(doc.name)}.pdf`);
  };

  const saveCurrent = async () => {
    setBusy('Saving…');
    try {
      persistHtml();
      const proj = newProject('office', doc.name, doc);
      proj.kind = 'office' as any;
      await saveProject(proj);
      toastFor('Saved');
    } finally { setBusy(''); }
  };

  const openSaved = async () => {
    const list = await listProjects('office');
    setSavedList(list.filter(p => (p.state as any)?.html));
    setOpenDialog(true);
  };

  const loadFromLibrary = async (id: string) => {
    setBusy('Opening…');
    try {
      const p = await loadProject<DocState>(id);
      if (!p) return;
      setDoc(p.state);
      commentsModel.current.setAll(p.state.comments ?? []);
      if (editorRef.current) editorRef.current.innerHTML = sanitizeHtml(p.state.html);
      refreshDerived();
      setOpenDialog(false);
    } finally { setBusy(''); }
  };

  const findAndReplace = (replace: boolean) => {
    if (!findText) return;
    const el = editorRef.current;
    if (!el) return;
    if (replace) {
      // Replace ONLY inside text nodes — never on the raw innerHTML string, which
      // matched across tags/attributes and orphaned markup (e.g. a search term
      // appearing in a style attr or split across <b>…</b> got mangled). Walking
      // text nodes keeps all formatting intact. Case-insensitive, all matches.
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const needle = findText.toLowerCase();
      let count = 0;
      const nodes: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) nodes.push(n as Text);
      for (const tn of nodes) {
        const val = tn.nodeValue ?? '';
        const lower = val.toLowerCase();
        if (!lower.includes(needle)) continue;
        let result = '', i = 0;
        while (i < val.length) {
          if (lower.startsWith(needle, i)) { result += replaceText; i += findText.length; count++; }
          else { result += val[i]; i++; }
        }
        tn.nodeValue = result;
      }
      persistHtml();
      recordChange();
      setMatchCount(0);
      findCursor.current = 0;
      toastFor(count ? `Replaced ${count}` : 'Not found');
    } else {
      // "Find next" — walk text nodes building a linear offset, find the first
      // match starting at/after findCursor; wrap to the top if none remain.
      const needle = findText.toLowerCase();
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) nodes.push(n as Text);

      const locate = (from: number): { node: Text; idx: number; end: number } | null => {
        let base = 0;
        for (const tn of nodes) {
          const val = tn.nodeValue ?? '';
          const lower = val.toLowerCase();
          // search within this node from the appropriate local start
          const localStart = Math.max(0, from - base);
          if (localStart <= val.length) {
            const idx = lower.indexOf(needle, localStart);
            if (idx >= 0) return { node: tn, idx, end: base + idx + needle.length };
          }
          base += val.length;
        }
        return null;
      };

      let hit = locate(findCursor.current);
      if (!hit) hit = locate(0); // wrap around to the top
      if (!hit) { setMatchCount(0); toastFor('Not found'); return; }

      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      const r = document.createRange();
      r.setStart(hit.node, hit.idx);
      r.setEnd(hit.node, hit.idx + findText.length);
      sel?.addRange(r);
      (hit.node.parentElement as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      findCursor.current = hit.end;
    }
  };

  // Count case-insensitive occurrences of the find term across the editor's
  // text (used to show "N matches" live as the user types).
  const countMatches = (term: string): number => {
    const el = editorRef.current;
    if (!el || !term) return 0;
    const text = (el.innerText || '').toLowerCase();
    const needle = term.toLowerCase();
    let count = 0, i = text.indexOf(needle);
    while (i >= 0) { count++; i = text.indexOf(needle, i + needle.length); }
    return count;
  };

  // As the user edits the find box, recompute the match count and reset the
  // "next" cursor so the next search starts from the top.
  const onFindChange = (v: string) => {
    setFindText(v);
    findCursor.current = 0;
    setMatchCount(countMatches(v));
  };

  useRegisterShortcuts([
    {
      label: 'File',
      items: [
        { combo: 'mod+s', description: 'Save' },
        { combo: 'mod+e', description: 'Export' },
        { combo: 'mod+o', description: 'Open library' },
        { combo: 'mod+f', description: 'Find / Replace' },
      ],
    },
    {
      label: 'Format',
      items: [
        { combo: 'mod+b', description: 'Bold' },
        { combo: 'mod+i', description: 'Italic' },
        { combo: 'mod+u', description: 'Underline' },
        { combo: 'mod+k', description: 'Insert link' },
      ],
    },
    {
      label: 'Headings',
      items: [
        { combo: 'mod+1', description: 'Heading 1' },
        { combo: 'mod+2', description: 'Heading 2' },
        { combo: 'mod+3', description: 'Heading 3' },
        { combo: 'mod+0', description: 'Normal paragraph' },
      ],
    },
  ]);

  useShortcuts([
    { combo: 'mod+s', handler: () => { void saveCurrent(); } },
    { combo: 'mod+e', handler: () => setExportDialog(true) },
    { combo: 'mod+o', handler: () => { void openSaved(); } },
    { combo: 'mod+f', handler: () => setFindOpen(o => !o) },
    { combo: 'mod+b', handler: () => exec('bold') },
    { combo: 'mod+i', handler: () => exec('italic') },
    { combo: 'mod+u', handler: () => exec('underline') },
    { combo: 'mod+k', handler: insertLink },
    { combo: 'mod+1', handler: () => formatBlock('h1') },
    { combo: 'mod+2', handler: () => formatBlock('h2') },
    { combo: 'mod+3', handler: () => formatBlock('h3') },
    { combo: 'mod+0', handler: () => formatBlock('p') },
  ]);

  return (
    <StudioShell>
      {policyGate.element}
      <StudioTopBar
        title="Docs Studio Pro"
        left={
          <>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white">
              <Upload className="h-3.5 w-3.5" /> Import
              <input type="file" accept=".docx,.md,.html,.htm,.txt" className="hidden" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
            <StudioButton variant="ghost" size="sm" onClick={openSaved}><FileText className="h-3.5 w-3.5" /> Library</StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={saveCurrent}><Save className="h-3.5 w-3.5" /> Save</StudioButton>
            {/* On mobile Export is pinned in the always-visible right cluster instead. */}
            <DesktopOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)}><Download className="h-3.5 w-3.5" /> Export</StudioButton></DesktopOnly>
            <span className="ml-2 h-5 w-px bg-white/10" />
            <input value={doc.name} onChange={e => setDoc(d => ({ ...d, name: e.target.value }))} className="h-7 w-44 rounded border border-transparent bg-transparent px-2 text-sm text-zinc-200 outline-none hover:border-white/10 focus:border-cyan-400/50" />
            <AutosaveIndicator state={saveState} at={lastSavedAt} />
            <button
              onClick={saveNow}
              title="Save now — flush the auto-save immediately to this device"
              className="ml-1 inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            >
              <Save className="h-3 w-3" /> Save now
            </button>
          </>
        }
        right={
          <>
            {collabRoom ? (
              <button onClick={stopCollab} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-500/20 px-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30" title="Stop sharing">
                <Users className="h-3 w-3" /> {collabPeers.length + 1} · {collabRoom}
              </button>
            ) : (
              <StudioButton variant="ghost" size="sm" onClick={() => setCollabDialog(true)} title="Share for live collab"><Share2 className="h-3.5 w-3.5" /></StudioButton>
            )}
            <button
              onClick={() => setTrackMode(t => !t)}
              title={trackMode ? 'Track changes ON — every edit recorded' : 'Track changes OFF — click to enable'}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium', trackMode ? 'bg-amber-500/20 text-amber-200' : 'text-zinc-300 hover:bg-white/5')}
            >
              <History className="h-3.5 w-3.5" />
              {trackMode && <span className="rounded bg-amber-500 px-1 text-[9px] text-zinc-900">{tcChanges.filter(c => c.status === 'pending').length}</span>}
            </button>
            <StudioButton variant="ghost" size="sm" onClick={() => setShowTrackPanel(s => !s)} title="Review changes"><History className="h-3.5 w-3.5" /></StudioButton>
            <button onClick={addCommentOnSelection} title="Comment on the selected text (anchored, resolvable)" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-white/5"><MessageSquare className="h-3.5 w-3.5" /></button>
            <button onClick={() => setShowComments(s => !s)} title="Comments" className={cn('inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium', showComments ? 'bg-cyan-500/20 text-cyan-200' : 'text-zinc-300 hover:bg-white/5')}>
              <MessageSquare className="h-3.5 w-3.5" />
              {comments.filter(c => !c.parent && !c.resolved).length > 0 && <span className="rounded bg-cyan-500 px-1 text-[9px] text-zinc-900">{comments.filter(c => !c.parent && !c.resolved).length}</span>}
            </button>
            <button
              onClick={() => { setMdAutoformat(v => !v); toastFor(mdAutoformat ? 'Markdown autoformat off' : 'Markdown autoformat on'); }}
              title={mdAutoformat ? "Markdown shortcuts ON — type '# ', '- ', '> ' to format" : 'Markdown shortcuts OFF'}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium', mdAutoformat ? 'bg-cyan-500/15 text-cyan-200' : 'text-zinc-300 hover:bg-white/5')}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
            <StudioButton variant="ghost" size="sm" onClick={() => setFindOpen(o => !o)}><Search className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={() => exec('undo')}><Undo2 className="h-3.5 w-3.5" /></StudioButton>
            <StudioButton variant="ghost" size="sm" onClick={() => exec('redo')}><Redo2 className="h-3.5 w-3.5" /></StudioButton>
            <button
              onClick={() => setReadingMode(v => !v)}
              title={readingMode ? 'Exit reading mode' : 'Reading mode — hide toolbars for distraction-free reading'}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium', readingMode ? 'bg-cyan-500/20 text-cyan-200' : 'text-zinc-300 hover:bg-white/5')}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
            {/* Keyboard-shortcut help is meaningless on touch; its slot goes to Export. */}
            <DesktopOnly><HelpButton /></DesktopOnly>
            <MobileOnly><StudioButton variant="primary" size="sm" onClick={() => setExportDialog(true)} title="Export"><Download className="h-3.5 w-3.5" /></StudioButton></MobileOnly>
          </>
        }
      />
      {!readingMode && collabPeers.length > 0 && (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-white/5 bg-emerald-500/5 px-3 text-[11px]">
          <Users className="h-3 w-3 text-emerald-300" />
          <span className="text-zinc-400">Live with:</span>
          {collabPeers.filter(p => p.id !== collabRef.current?.self.id).map(p => (
            <span key={p.id} className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
              <span className="text-zinc-200">{p.name}</span>
            </span>
          ))}
        </div>
      )}

      {!readingMode && (
      <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/5 bg-[#0f1115] px-3 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:h-10 sm:overflow-visible">
        <select value={doc.locale} onChange={e => setDoc(d => ({ ...d, locale: e.target.value }))} className="h-9 shrink-0 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-xs sm:h-7" title="Document language (spell-check, direction, fonts)">
          {LOCALES.map(l => <option key={l.code} value={l.code}>{l.nativeName}</option>)}
        </select>
        <select value={doc.direction} onChange={e => setDoc(d => ({ ...d, direction: e.target.value as DocState['direction'] }))} className="h-7 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-xs" title="Text direction">
          <option value="auto">Auto dir</option>
          <option value="ltr">LTR</option>
          <option value="rtl">RTL</option>
        </select>
        <select value={doc.font} onChange={e => setDoc(d => ({ ...d, font: e.target.value, scriptFont: 'manual' }))} className="h-7 rounded border border-white/10 bg-[#0a0b0e] px-2 text-xs">
          {FONTS.map(f => <option key={f.v} value={f.v}>{f.label}</option>)}
        </select>
        <input type="number" min={10} max={36} value={doc.fontSize} onChange={e => setDoc(d => ({ ...d, fontSize: +e.target.value }))} className="h-7 w-14 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-right" />
        <Tb onClick={() => formatBlock('p')} title="Body"><span className="text-[11px]">P</span></Tb>
        <Tb onClick={() => formatBlock('h1')} title="H1"><Heading1 className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => formatBlock('h2')} title="H2"><Heading2 className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => formatBlock('h3')} title="H3"><Heading3 className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => formatBlock('blockquote')} title="Quote"><Quote className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => formatBlock('pre')} title="Code block"><Code className="h-3.5 w-3.5" /></Tb>
        <span className="mx-1 h-4 w-px bg-white/10" />
        {/* Selection font family (applies to highlighted text, not whole doc) */}
        <select
          onChange={e => { if (e.target.value) setSelectionFont(e.target.value); e.currentTarget.selectedIndex = 0; }}
          title="Font family (selected text)"
          className="h-7 shrink-0 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-[11px] text-zinc-200"
        >
          <option value="">Font</option>
          {FONTS.map(f => <option key={`sf-${f.v}`} value={f.v}>{f.label}</option>)}
        </select>
        {/* Selection font size in px (applies to highlighted text) */}
        <select
          onChange={e => { const v = parseInt(e.target.value, 10); if (v) setSelectionFontSize(v); e.currentTarget.selectedIndex = 0; }}
          title="Font size (selected text)"
          className="h-7 shrink-0 rounded border border-white/10 bg-[#0a0b0e] px-1.5 text-[11px] text-zinc-200"
        >
          <option value="">Size</option>
          {[10, 12, 14, 16, 18, 24, 36, 48].map(s => <option key={`fs-${s}`} value={s}>{s}</option>)}
        </select>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <Tb onClick={() => exec('bold')} title="Bold (Ctrl+B)"><Bold className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('italic')} title="Italic (Ctrl+I)"><Italic className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('underline')} title="Underline (Ctrl+U)"><Underline className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('strikeThrough')} title="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('subscript')} title="Subscript"><Subscript className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('superscript')} title="Superscript"><Superscript className="h-3.5 w-3.5" /></Tb>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <Tb onClick={() => exec('insertUnorderedList')} title="Bullet list"><List className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('insertOrderedList')} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={insertChecklist} title="Checklist (task list)"><ListChecks className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('outdent')} title="Outdent"><Outdent className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('indent')} title="Indent"><Indent className="h-3.5 w-3.5" /></Tb>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <Tb onClick={() => exec('insertHTML', '<hr/>')} title="Horizontal rule"><Minus className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => formatBlock('blockquote')} title="Blockquote"><Quote className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={insertPageBreak} title="Page break"><SeparatorHorizontal className="h-3.5 w-3.5" /></Tb>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <Tb onClick={() => exec('justifyLeft')} title="Left"><AlignLeft className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('justifyCenter')} title="Center"><AlignCenter className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('justifyRight')} title="Right"><AlignRight className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('justifyFull')} title="Justify"><AlignJustify className="h-3.5 w-3.5" /></Tb>
        <span className="mx-1 h-4 w-px bg-white/10" />
        {/* Line spacing (Google Docs parity) */}
        <select
          onChange={e => { const v = parseFloat(e.target.value); if (v) setLineSpacing(v); e.currentTarget.selectedIndex = 0; }}
          title="Line spacing"
          className="h-6 rounded border border-white/10 bg-[#0a0b0e] px-1 text-[11px] text-zinc-200"
        >
          <option value="">↕ Spacing</option>
          <option value="1">Single</option>
          <option value="1.15">1.15</option>
          <option value="1.5">1.5</option>
          <option value="2">Double</option>
          <option value="2.5">2.5</option>
        </select>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <Tb onClick={() => transformCase('upper')} title="UPPERCASE"><span className="text-[11px] font-semibold">AA</span></Tb>
        <Tb onClick={() => transformCase('lower')} title="lowercase"><span className="text-[11px] font-semibold">aa</span></Tb>
        <Tb onClick={() => transformCase('title')} title="Title Case"><span className="text-[11px] font-semibold">Aa</span></Tb>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <Tb onClick={() => exec('outdent')} title="Decrease indent"><Outdent className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('indent')} title="Increase indent"><Indent className="h-3.5 w-3.5" /></Tb>
        <span className="mx-1 h-4 w-px bg-white/10" />
        <input type="color" onChange={e => exec('foreColor', e.target.value)} className="h-6 w-6 cursor-pointer rounded border border-white/10" title="Text color" />
        {TEXT_SWATCHES.map(c => (
          <Swatch key={`fc-${c.hex}`} hex={c.hex} title={`Text: ${c.name}`} onClick={() => exec('foreColor', c.hex)} />
        ))}
        <input type="color" onChange={e => exec('hiliteColor', e.target.value)} className="h-6 w-6 cursor-pointer rounded border border-white/10" title="Highlight" />
        {HILITE_SWATCHES.map(c => (
          <Swatch key={`hl-${c.hex}`} hex={c.hex} title={`Highlight: ${c.name}`} onClick={() => exec('hiliteColor', c.hex)} />
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" />
        <Tb onClick={insertLink} title="Link (Ctrl+K)"><LinkIcon className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={insertImageBtn} title="Image"><ImageIcon className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => insertTable(3, 3)} title="Insert 3×3 table"><TableIcon className="h-3.5 w-3.5" /></Tb>
        {inTable && (
          <>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <Tb onClick={tableInsertRowBelow} title="Insert row below"><span className="text-[11px] font-semibold leading-none">+R</span></Tb>
            <Tb onClick={tableInsertColRight} title="Insert column right"><span className="text-[11px] font-semibold leading-none">+C</span></Tb>
            <Tb onClick={tableDeleteRow} title="Delete row"><span className="text-[11px] font-semibold leading-none">−R</span></Tb>
            <Tb onClick={tableDeleteCol} title="Delete column"><span className="text-[11px] font-semibold leading-none">−C</span></Tb>
            <span className="mx-1 h-4 w-px bg-white/10" />
          </>
        )}
        <Tb onClick={() => exec('removeFormat')} title="Clear formatting"><Eraser className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('insertText', new Date().toLocaleDateString())} title="Insert date"><Calendar className="h-3.5 w-3.5" /></Tb>
        <Tb onClick={() => exec('insertText', new Date().toLocaleTimeString())} title="Insert time"><Clock className="h-3.5 w-3.5" /></Tb>
        <div className="ml-auto flex items-center gap-1">
          <Tb onClick={() => setSymbolDialog(true)} title="Insert special character / symbol"><span className="text-[13px] font-semibold leading-none">Ω</span></Tb>
          <Tb onClick={() => setEquationDialog(true)} title="Insert equation (LaTeX)"><Sigma className="h-3.5 w-3.5" /></Tb>
          <Tb onClick={insertToc} title="Insert Table of Contents"><BookOpen className="h-3.5 w-3.5" /></Tb>
          <button onClick={reading ? stopReading : startReadAloud} title={reading ? 'Stop reading' : 'Read aloud'} className={cn('flex items-center gap-1 rounded px-2 py-1 text-xs', reading ? 'bg-cyan-500/20 text-cyan-200' : 'text-zinc-300 hover:bg-white/5')}>
            <Volume2 className="h-3 w-3" />
          </button>
          <button onClick={toggleVoiceTyping} title={voiceTyping ? 'Stop dictation' : 'Voice typing'} className={cn('flex items-center gap-1 rounded px-2 py-1 text-xs', voiceTyping ? 'bg-rose-500/20 text-rose-200 animate-pulse' : 'text-zinc-300 hover:bg-white/5')}>
            <MicVocal className="h-3 w-3" />
          </button>
          <button onClick={runSummarize} title="Extract key sentences as a summary" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-cyan-300 hover:bg-white/5"><Wand2 className="h-3 w-3" /> Summarize</button>
          <button onClick={() => void translateSelection()} title="Translate selected text" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-cyan-300 hover:bg-white/5"><Languages className="h-3 w-3" /> Translate</button>
          <Tb onClick={() => setDoc(d => ({ ...d, showOutline: !d.showOutline }))} title="Outline">{doc.showOutline ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</Tb>
        </div>
      </div>
      )}

      {/* Reading mode — a thin exit affordance replaces the hidden ribbon so the
          user always has a way back to the editor. */}
      {readingMode && (
        <div className="flex h-9 shrink-0 items-center justify-center gap-2 border-b border-white/5 bg-[#0f1115] px-3 text-[11px] text-zinc-500">
          <BookOpen className="h-3 w-3 text-cyan-300" /> Reading mode — toolbars hidden for distraction-free reading.
          <button onClick={() => setReadingMode(false)} className="rounded bg-white/10 px-2 py-0.5 text-zinc-200 hover:bg-white/15">Exit</button>
        </div>
      )}

      {findOpen && (
        <div className="flex items-center gap-2 border-b border-white/5 bg-[#111317] px-3 py-2 text-xs">
          <Search className="h-3.5 w-3.5 text-zinc-400" />
          <input autoFocus value={findText} onChange={e => onFindChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') findAndReplace(false); }} placeholder="Find" className="h-7 w-48 rounded border border-white/10 bg-[#0a0b0e] px-2" />
          {findText && <span className="tabular-nums text-zinc-400">{matchCount} {matchCount === 1 ? 'match' : 'matches'}</span>}
          <input value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="Replace" className="h-7 w-48 rounded border border-white/10 bg-[#0a0b0e] px-2" />
          <button onClick={() => findAndReplace(false)} className="rounded bg-white/10 px-3 py-1 hover:bg-white/15">Find</button>
          <button onClick={() => findAndReplace(false)} disabled={matchCount === 0} className="rounded bg-white/10 px-3 py-1 hover:bg-white/15 disabled:opacity-40">Next</button>
          <button onClick={() => findAndReplace(true)} className="rounded bg-cyan-500 px-3 py-1 text-zinc-900 hover:bg-cyan-400">Replace all</button>
          <button onClick={() => setFindOpen(false)} className="ml-auto rounded p-1 text-zinc-400 hover:bg-white/5"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {recovery && (
        <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
          <Clock className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="flex-1">
            Recovered an unsaved session from{' '}
            <span className="font-semibold">{relativeTime(recovery.at)}</span>
            {recovery.doc.name && recovery.doc.name !== 'Untitled' ? <> — “{recovery.doc.name}”</> : null}.
          </span>
          <button onClick={restoreRecovery} className="rounded bg-amber-400 px-3 py-1 font-semibold text-amber-950 hover:bg-amber-300">Restore</button>
          <button onClick={dismissRecovery} className="rounded px-2 py-1 text-amber-200/80 hover:bg-white/5">Dismiss</button>
        </div>
      )}

      <StudioBody>
        {!readingMode && doc.showOutline && (
          <StudioSidebar side="left" width={220}>
            <StudioPanel title="Outline">
              <div className="space-y-0.5">
                {outline.length === 0 && <div className="text-xs text-zinc-500">Use H1/H2/H3 in the document to build an outline.</div>}
                {outline.map((h, i) => (
                  <a key={i} href={`#${h.id}`} className="block truncate rounded px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"
                    style={{ paddingLeft: 8 + (h.level - 1) * 12 }}>
                    {h.text || '(empty heading)'}
                  </a>
                ))}
              </div>
            </StudioPanel>
          </StudioSidebar>
        )}

        <div className={cn('relative flex flex-1 min-w-0 flex-col items-center overflow-y-auto bg-[#0a0b0e]', readingMode ? 'py-16' : 'py-8')}>
          {!docsWelcomed && docsLooksUntouched && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0b0e]/95 backdrop-blur-sm">
              <EmptyState
                icon={<FileText className="h-7 w-7" />}
                title="Start your document"
                description="Open a Word file, paste from anywhere, or just start typing. Track changes, equations, collaboration are all here."
                actions={[
                  { label: 'Open .docx / .md / .txt', description: 'Round-trips Word with formatting', icon: <Upload className="h-4 w-4" />, onClick: () => { dismissDocsWelcome(); document.querySelector<HTMLInputElement>('input[type=file]')?.click(); }, primary: true },
                  { label: 'Open from Library', description: 'Continue a saved document', icon: <FileText className="h-4 w-4" />, onClick: () => { dismissDocsWelcome(); void openSaved(); } },
                  { label: 'Start writing', description: 'Use the blank canvas', icon: <Wand2 className="h-4 w-4" />, onClick: dismissDocsWelcome },
                ]}
                hints={[
                  { label: 'Track changes + Comments', description: 'Accept/reject edits + anchored, resolvable comment threads' },
                  { label: 'Equations + TOC + Read aloud', description: 'LaTeX equations, auto TOC, Web Speech' },
                  { label: 'Live collab via P2P', description: 'Share button — rich text syncs peer-to-peer, encrypted in transit' },
                ]}
              />
            </div>
          )}
          {/* Comment-anchor highlight: a soft yellow underline on commented text,
              brighter when its thread is active in the sidebar. */}
          <style>{`
            .prose-doc [data-comment]{ background: rgba(250,204,21,0.18); border-bottom: 2px solid rgba(250,204,21,0.5); border-radius:2px; cursor:pointer; }
            .prose-doc [data-comment].cmt-active{ background: rgba(250,204,21,0.4); }
          `}</style>
          <div
            ref={pageWrapRef}
            className="relative w-full bg-white shadow-2xl"
            style={{ maxWidth: doc.pageWidth, minHeight: '60vh' }}
          >
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck
              lang={langAttrFromLocale(doc.locale)}
              dir={doc.direction}
              onInput={onEditorInput}
              onKeyDown={onEditorKeyDown}
              onClick={(e) => {
                const tgtEl = e.target as Element;
                // Checklist checkbox: reflect its toggled state to the `checked`
                // attribute so it persists through save/load as HTML, then save.
                if (tgtEl?.tagName === 'INPUT' && (tgtEl as HTMLInputElement).type === 'checkbox') {
                  const box = tgtEl as HTMLInputElement;
                  // toggle happened in the DOM already; mirror to the attribute
                  requestAnimationFrame(() => {
                    if (box.checked) box.setAttribute('checked', '');
                    else box.removeAttribute('checked');
                    persistHtml(); recordChange();
                  });
                  return;
                }
                const sp = (e.target as Element)?.closest?.('[data-comment]');
                if (sp) { setActiveCommentId(sp.getAttribute('data-comment')); setShowComments(true); }
                // Click an inline image → select it for resizing; click elsewhere clears.
                const tgt = e.target as Element;
                if (tgt?.tagName === 'IMG') setSelImg(tgt as HTMLImageElement);
                else setSelImg(null);
              }}
              onBlur={() => { persistHtml(); recordChange(); }}
              className="prose-doc focus:outline-none"
              style={{
                fontFamily: doc.scriptFont === 'auto' ? `${fontStackForText(editorRef.current?.innerText ?? doc.html.replace(/<[^>]+>/g, ''))}` : doc.font,
                fontSize: doc.fontSize,
                color: '#111',
                padding: '64px 80px',
                minHeight: '60vh',
                lineHeight: 1.6,
              }}
            />
            {/* Inline-image resize overlay — outline + corner handles over the
                selected image. Dragging a corner sets the img width (Google Docs
                parity). pointer-events only on the handles so text stays editable. */}
            {imgBox && selImg && (
              <div className="pointer-events-none absolute z-20" style={{ left: imgBox.left, top: imgBox.top, width: imgBox.width, height: imgBox.height }}>
                <div className="absolute inset-0 outline outline-2 outline-cyan-500" />
                {([['nw', 0, 0], ['ne', 1, 0], ['sw', 0, 1], ['se', 1, 1]] as const).map(([c, fx, fy]) => (
                  <div
                    key={c}
                    onPointerDown={startImgResize}
                    className="pointer-events-auto absolute h-3 w-3 rounded-sm border-2 border-cyan-500 bg-white [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5"
                    style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, transform: 'translate(-50%,-50%)', cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                  />
                ))}
              </div>
            )}
          </div>
          <style jsx global>{`
            .prose-doc h1 { font-size: 2em; font-weight: 800; margin: 0.4em 0 0.3em; }
            .prose-doc h2 { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
            .prose-doc h3 { font-size: 1.2em; font-weight: 700; margin: 0.6em 0 0.3em; }
            .prose-doc p  { margin: 0 0 0.7em; }
            .prose-doc blockquote { margin: 1em 0; padding: 0.5em 1em; border-left: 3px solid #ccc; color: #555; font-style: italic; }
            .prose-doc pre { background: #f4f4f4; padding: 10px 14px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 0.92em; overflow-x: auto; }
            .prose-doc code { background: #f0f0f0; padding: 0 4px; border-radius: 2px; font-family: 'Courier New', monospace; font-size: 0.92em; }
            .prose-doc ul, .prose-doc ol { padding-left: 28px; margin: 0.5em 0 0.7em; }
            .prose-doc li { margin: 0.25em 0; }
            .prose-doc a { color: #1d6fd8; text-decoration: underline; }
            .prose-doc img { max-width: 100%; }
            .prose-doc table { border-collapse: collapse; width: 100%; margin: 1em 0; }
            .prose-doc th, .prose-doc td { border: 1px solid #aaa; padding: 6px 10px; }
            .prose-doc th { background: #f5f5f5; font-weight: 700; }
          `}</style>
        </div>
      </StudioBody>

      <StudioStatusBar>
        <span>{wordCount.words} words</span>
        <span>{wordCount.chars} characters</span>
        <span>{wordCount.paragraphs} blocks</span>
        <span title="Sentences detected in the document">{wordCount.sentences} sentences</span>
        {wordCount.sentences > 0 && (
          <span title="Average words per sentence">{Math.round(wordCount.words / wordCount.sentences)} words/sentence</span>
        )}
        {readability && (
          <span className={cn(
            readability.flesch >= 60 ? 'text-emerald-300' : readability.flesch >= 30 ? 'text-amber-300' : 'text-rose-300'
          )} title={`Flesch ${readability.flesch} · Grade ${readability.grade}`}>
            {readability.level}
          </span>
        )}
        <span className="ml-auto">~{Math.max(1, Math.ceil(wordCount.words / 200))} min read</span>
      </StudioStatusBar>

      {busy && (
        <div className="pointer-events-none fixed left-1/2 top-16 -translate-x-1/2 rounded-md bg-black/80 px-4 py-2 text-sm text-white backdrop-blur">
          <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" /> {busy}
        </div>
      )}
      {toast && <div className="pointer-events-none fixed bottom-12 left-1/2 -translate-x-1/2 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-lg">{toast}</div>}
      {gate}

      {/* Floating selection toolbar — appears above any text selection */}
      {floatBar && !slash && (
        <div
          className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-white/10 bg-[#15171c] p-1 shadow-2xl"
          style={{ left: floatBar.x, top: floatBar.y - 8 }}
          onMouseDown={e => e.preventDefault()}
        >
          <FloatBtn title="Bold" onClick={() => exec('bold')}><Bold className="h-3.5 w-3.5" /></FloatBtn>
          <FloatBtn title="Italic" onClick={() => exec('italic')}><Italic className="h-3.5 w-3.5" /></FloatBtn>
          <FloatBtn title="Underline" onClick={() => exec('underline')}><Underline className="h-3.5 w-3.5" /></FloatBtn>
          <FloatBtn title="Highlight" onClick={() => exec('hiliteColor', '#fff59d')}><Highlighter className="h-3.5 w-3.5" /></FloatBtn>
          <FloatBtn title="Link" onClick={insertLink}><LinkIcon className="h-3.5 w-3.5" /></FloatBtn>
          <span className="mx-0.5 h-4 w-px bg-white/10" />
          <FloatBtn title="Heading 2" onClick={() => formatBlock('h2')}><Heading2 className="h-3.5 w-3.5" /></FloatBtn>
          <FloatBtn title="Quote" onClick={() => formatBlock('blockquote')}><Quote className="h-3.5 w-3.5" /></FloatBtn>
        </div>
      )}

      {/* Slash command menu — anchored at the caret */}
      {slash && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={closeSlash} />
          <div
            className="fixed z-50 w-64 overflow-hidden rounded-lg border border-white/10 bg-[#15171c] shadow-2xl"
            style={{ left: Math.min(slash.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 272), top: slash.y + 6 }}
            onMouseDown={e => e.preventDefault()}
          >
            <div className="border-b border-white/5 px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
              {slash.query ? `Filter: ${slash.query}` : 'Insert'}
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {slashFiltered.length === 0 && <div className="px-3 py-3 text-xs text-zinc-500">No matching block</div>}
              {slashFiltered.map((c, i) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setSlashIndex(i)}
                  onClick={() => runSlashCommand(i)}
                  className={cn('flex w-full items-center gap-2.5 px-3 py-1.5 text-left', i === slashIndex ? 'bg-cyan-500/20 text-white' : 'text-zinc-200 hover:bg-white/5')}
                >
                  <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded', i === slashIndex ? 'bg-cyan-500/20 text-cyan-200' : 'bg-white/5 text-zinc-400')}>{c.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{c.label}</span>
                    <span className="block truncate text-[10px] text-zinc-500">{c.hint}</span>
                  </span>
                  {i === slashIndex && <CornerDownLeft className="h-3 w-3 shrink-0 text-zinc-500" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Markdown autoformat undo chip */}
      {autoformatUndo && (
        <div className="fixed bottom-12 left-4 z-50 flex items-center gap-2 rounded-md border border-white/10 bg-[#15171c] px-3 py-1.5 text-xs text-zinc-200 shadow-xl">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
          <span>{autoformatUndo.label}</span>
          <button onClick={revertAutoformat} className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[11px] font-medium hover:bg-white/15">
            <RotateCcw className="h-3 w-3" /> Undo
          </button>
        </div>
      )}

      {exportDialog && (
        <Dialog title="Export" onCancel={() => setExportDialog(false)} onConfirm={exportNow} confirmLabel="Download">
          <div>
            <div className="mb-1 text-xs text-zinc-400">Format</div>
            <div className="grid grid-cols-2 gap-1">
              {([['docx', 'Word (.docx)'], ['pdf', 'PDF'], ['md', 'Markdown'], ['html', 'HTML'], ['txt', 'Plain text']] as const).map(([f, lbl]) => (
                <button key={f} onClick={() => setExportFmt(f)} className={cn('rounded px-3 py-1.5 text-xs', exportFmt === f ? 'bg-cyan-500 text-zinc-900' : 'bg-white/5 text-zinc-300')}>{lbl}</button>
              ))}
            </div>
          </div>
        </Dialog>
      )}
      {showTrackPanel && (
        <div className="fixed right-0 top-[88px] bottom-0 z-40 flex w-80 flex-col border-l border-white/10 bg-[#0f1115] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100"><History className="h-3 w-3" /> Track Changes</div>
            <button onClick={() => setShowTrackPanel(false)} className="rounded p-1 text-zinc-400 hover:bg-white/5"><XIcon className="h-3.5 w-3.5" /></button>
          </div>
          <div className="border-b border-white/5 px-3 py-2 text-[10px] text-zinc-400">
            Author: <input value={tcAuthor} onChange={e => setTcAuthor(e.target.value)} className="ml-1 rounded border border-white/10 bg-[#0a0b0e] px-1.5 py-0.5 text-zinc-100" />
            <span className="h-2 w-2 ml-2 inline-block rounded-full" style={{ background: tcColor }} />
          </div>
          {trackMode ? (
            <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200">⚠ Track mode ON — every edit is recorded</div>
          ) : (
            <div className="border-b border-white/5 px-3 py-2 text-[10px] text-zinc-500">Click <History className="inline h-3 w-3" /> in toolbar to enable tracking</div>
          )}
          <div className="flex gap-1 border-b border-white/5 p-2">
            <button onClick={() => { tcModel.current.acceptAll(); }} className="flex-1 rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-medium text-emerald-200 hover:bg-emerald-500/30">Accept all</button>
            <button onClick={() => { rejectAllChanges(); }} className="flex-1 rounded bg-rose-500/20 px-2 py-1 text-[10px] font-medium text-rose-200 hover:bg-rose-500/30">Reject all</button>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
            {tcChanges.length === 0 && <div className="rounded border border-white/5 bg-white/[.02] p-4 text-center text-[11px] text-zinc-500">No changes recorded yet</div>}
            {tcChanges.slice().reverse().map(ch => (
              <div key={ch.id} className={cn('rounded border p-2', ch.status === 'pending' ? 'border-white/10 bg-white/[.03]' : ch.status === 'accepted' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5 opacity-60')}>
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: ch.authorColor }} />
                    <span className="font-medium text-zinc-200">{ch.author}</span>
                    <span className="text-zinc-500">{ch.label ?? ch.kind}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {ch.status === 'pending' && (
                      <>
                        <button onClick={() => tcModel.current.accept(ch.id)} className="rounded p-0.5 text-emerald-300 hover:bg-emerald-500/20" title="Accept (keep this edit)"><Check className="h-3 w-3" /></button>
                        <button onClick={() => rejectChange(ch.id)} className="rounded p-0.5 text-rose-300 hover:bg-rose-500/20" title="Reject (revert this edit)"><XIcon className="h-3 w-3" /></button>
                      </>
                    )}
                    {ch.status === 'accepted' && <span className="text-emerald-300 text-[10px]">accepted</span>}
                    {ch.status === 'rejected' && <span className="text-rose-300 text-[10px]">rejected</span>}
                  </div>
                </div>
                <div
                  className="mt-1 max-h-20 overflow-y-auto rounded bg-black/30 p-1.5 text-[11px] leading-snug"
                  dangerouslySetInnerHTML={{ __html: htmlDiffMarkup(String(ch.before ?? ''), String(ch.after ?? ''), ch.authorColor) }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {showComments && (
        <CommentsSidebar
          comments={comments}
          activeId={activeCommentId}
          author={tcAuthor}
          onClose={() => setShowComments(false)}
          onFocus={scrollToComment}
          onSubmit={submitCommentText}
          onReply={replyToComment}
          onResolve={resolveComment}
          onDelete={deleteComment}
        />
      )}
      {collabDialog && (
        <CollabDialog onCancel={() => setCollabDialog(false)} onStart={startCollab} />
      )}
      {equationDialog && (
        <EquationDialog onCancel={() => setEquationDialog(false)} onInsert={insertEquation} />
      )}

      {symbolDialog && (
        <SymbolDialog onCancel={() => setSymbolDialog(false)} onInsert={s => exec('insertText', s)} />
      )}
      {summaryDialog && (
        <Dialog title="Summary" onCancel={() => setSummaryDialog(null)} onConfirm={() => insertSummary(summaryDialog)} confirmLabel="Insert into doc">
          <div className="max-h-96 space-y-2 overflow-y-auto rounded bg-white/5 p-3 text-sm text-zinc-200">
            {summaryDialog.map((s, i) => <p key={i}>{s}</p>)}
          </div>
        </Dialog>
      )}
      {openDialog && (
        <Dialog title="Library" onCancel={() => setOpenDialog(false)} onConfirm={() => setOpenDialog(false)} confirmLabel="Close">
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {savedList.length === 0 && <div className="rounded bg-white/5 p-4 text-center text-xs text-zinc-400">No saved documents</div>}
            {savedList.map(p => (
              <button key={p.id} onClick={() => loadFromLibrary(p.id)} className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10">
                <FileText className="h-3.5 w-3.5 text-zinc-400" />
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

const Tb = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
  <button onClick={onClick} title={title} className="grid h-11 w-11 shrink-0 place-items-center rounded text-zinc-300 hover:bg-white/5 hover:text-white sm:h-7 sm:w-7">{children}</button>
);

const TEXT_SWATCHES = [
  { name: 'Black', hex: '#000000' },
  { name: 'Red', hex: '#e11d48' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Purple', hex: '#7c3aed' },
];

const HILITE_SWATCHES = [
  { name: 'Yellow', hex: '#fff59d' },
  { name: 'Green', hex: '#b9f6ca' },
  { name: 'Cyan', hex: '#b2ebf2' },
  { name: 'Pink', hex: '#f8bbd0' },
  { name: 'Orange', hex: '#ffe0b2' },
];

const Swatch = ({ hex, title, onClick }: { hex: string; title: string; onClick: () => void }) => (
  <button onMouseDown={e => e.preventDefault()} onClick={onClick} title={title} className="h-5 w-5 shrink-0 cursor-pointer rounded border border-white/10 hover:ring-1 hover:ring-white/40" style={{ backgroundColor: hex }} />
);

const FloatBtn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
  <button onMouseDown={e => e.preventDefault()} onClick={onClick} title={title} className="grid h-7 w-7 place-items-center rounded text-zinc-200 hover:bg-white/10 hover:text-white">{children}</button>
);

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'moments ago';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d <= 1 ? 'yesterday' : `${d} days ago`;
}

function AutosaveIndicator({ state, at }: { state: 'idle' | 'saving' | 'saved'; at: number | null }) {
  const [, force] = React.useState(0);
  // Re-render once a minute so "saved 2 min ago" stays honest.
  React.useEffect(() => {
    const t = setInterval(() => force(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  if (state === 'saving') {
    return (
      <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-zinc-500" title="Auto-saving on this device">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === 'saved' && at) {
    return (
      <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-emerald-400/80" title="Auto-saved to this device — works offline, nothing uploaded">
        <Check className="h-3 w-3" /> Saved {relativeTime(at)}
      </span>
    );
  }
  return (
    <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-zinc-600" title="Edits auto-save to this device">
      <Clock className="h-3 w-3" /> Auto-save on
    </span>
  );
}

function Dialog({ title, children, onCancel, onConfirm, confirmLabel = 'OK' }: { title: string; children: React.ReactNode; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  return <SharedDialog title={title} onClose={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} width="sm">{children}</SharedDialog>;
}

const SYMBOL_GROUPS: { label: string; chars: string[] }[] = [
  { label: 'Common', chars: ['©', '®', '™', '§', '¶', '†', '‡', '•', '–', '—', '…', '°', '′', '″', '«', '»'] },
  { label: 'Currency', chars: ['€', '£', '¥', '¢', '₹', '₽', '₿'] },
  { label: 'Math', chars: ['±', '×', '÷', '≤', '≥', '≠', '≈', '∞', '∑', '∏', '√', '∫', '∂', '∆', '∇', 'µ'] },
  { label: 'Arrows', chars: ['→', '←', '↑', '↓', '↔', '⇒', '⇐', '⇔'] },
  { label: 'Fractions', chars: ['½', '¼', '¾', '⅓', '⅔', '⅛'] },
  { label: 'Greek', chars: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'σ', 'φ', 'ψ', 'ω', 'Σ', 'Ω', 'Δ'] },
  { label: 'Marks & emoji', chars: ['✓', '✗', '★', '☆', '☑', '☐', '❤', '👍', '😀', '🔥', '⚠', '✏'] },
];

function SymbolDialog({ onCancel, onInsert }: { onCancel: () => void; onInsert: (symbol: string) => void }) {
  return (
    <SharedDialog title="Insert special character" onClose={onCancel} width="sm">
      <div className="space-y-3 text-xs">
        {SYMBOL_GROUPS.map(group => (
          <div key={group.label}>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-400">{group.label}</div>
            <div className="flex flex-wrap gap-1">
              {group.chars.map(ch => (
                <button
                  key={ch}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onInsert(ch)}
                  title={`Insert ${ch}`}
                  className="grid h-8 w-8 place-items-center rounded bg-white/5 text-[15px] text-zinc-100 hover:bg-cyan-500/20 hover:text-white"
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-[10px] text-zinc-500">Click a character to insert it at the cursor.</p>
      </div>
    </SharedDialog>
  );
}

function EquationDialog({ onCancel, onInsert }: { onCancel: () => void; onInsert: (latex: string, displayMode: boolean) => void }) {
  const [latex, setLatex] = React.useState('');
  const [displayMode, setDisplayMode] = React.useState(true);
  const [preview, setPreview] = React.useState('');
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const html = await renderEquationToHtml(latex || 'x^2', displayMode);
      if (!cancelled) setPreview(html);
    })();
    return () => { cancelled = true; };
  }, [latex, displayMode]);
  return (
    <Dialog title="Insert equation" onCancel={onCancel} onConfirm={() => onInsert(latex, displayMode)} confirmLabel="Insert">
      <div className="space-y-3 text-xs">
        <textarea
          autoFocus value={latex} onChange={e => setLatex(e.target.value)} rows={3}
          placeholder="LaTeX, e.g. \\frac{a}{b}"
          className="w-full rounded border border-white/10 bg-[#0a0b0e] p-1.5 font-mono text-xs text-zinc-100"
        />
        <label className="flex items-center gap-2 text-zinc-300">
          <input type="checkbox" checked={displayMode} onChange={e => setDisplayMode(e.target.checked)} /> Display mode (centered, large)
        </label>
        <div className="rounded border border-white/10 bg-white p-3 text-center" dangerouslySetInnerHTML={{ __html: preview }} />
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-400">Templates</div>
          <div className="grid grid-cols-2 gap-1">
            {EQUATION_TEMPLATES.map(t => (
              <button key={t.label} onClick={() => setLatex(t.latex)} className="rounded bg-white/5 px-2 py-1.5 text-left text-[10px] text-zinc-200 hover:bg-white/10">
                <div className="font-medium">{t.label}</div>
                <code className="text-[9px] text-zinc-500">{t.latex}</code>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function CommentsSidebar({ comments, activeId, author, onClose, onFocus, onSubmit, onReply, onResolve, onDelete }: {
  comments: DocComment[];
  activeId: string | null;
  author: string;
  onClose: () => void;
  onFocus: (id: string) => void;
  onSubmit: (id: string, text: string) => void;
  onReply: (parentId: string, text: string) => void;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showResolved, setShowResolved] = React.useState(false);
  const roots = comments.filter(c => !c.parent);
  const visible = roots.filter(c => showResolved || !c.resolved);
  const repliesOf = (id: string) => comments.filter(c => c.parent === id).sort((a, b) => a.ts - b.ts);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const setDraft = (k: string, v: string) => setDrafts(d => ({ ...d, [k]: v }));
  const fmtTime = (ts: number) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`; };
  return (
    <div className="fixed right-0 top-[88px] bottom-0 z-40 flex w-80 flex-col border-l border-white/10 bg-[#0f1115] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100"><MessageSquare className="h-3 w-3" /> Comments</div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowResolved(s => !s)} className={cn('rounded px-1.5 py-0.5 text-[10px]', showResolved ? 'bg-white/10 text-zinc-200' : 'text-zinc-500 hover:bg-white/5')}>{showResolved ? 'Hide resolved' : 'Show resolved'}</button>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-white/5"><XIcon className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {visible.length === 0 && <div className="rounded border border-white/5 bg-white/[.02] p-4 text-center text-[11px] text-zinc-500">No comments yet. Select text and click the comment button to add one.</div>}
        {visible.slice().sort((a, b) => b.ts - a.ts).map(c => {
          const replies = repliesOf(c.id);
          const isActive = c.id === activeId;
          return (
            <div key={c.id} className={cn('rounded border p-2', c.resolved ? 'border-emerald-500/20 bg-emerald-500/5 opacity-70' : isActive ? 'border-cyan-400/40 bg-cyan-500/5' : 'border-white/10 bg-white/[.03]')}>
              <div className="flex items-center justify-between text-[10px]">
                <button onClick={() => onFocus(c.id)} className="flex items-center gap-1.5 hover:underline">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.authorColor }} />
                  <span className="font-medium text-zinc-200">{c.author}</span>
                  <span className="text-zinc-500">{fmtTime(c.ts)}</span>
                </button>
                <div className="flex items-center gap-0.5">
                  {!c.resolved && <button onClick={() => onResolve(c.id)} title="Resolve" className="rounded p-0.5 text-emerald-300 hover:bg-emerald-500/20"><Check className="h-3 w-3" /></button>}
                  <button onClick={() => onDelete(c.id)} title="Delete" className="rounded p-0.5 text-rose-300 hover:bg-rose-500/20"><XIcon className="h-3 w-3" /></button>
                </div>
              </div>
              {/* Comment body: editable when empty (just created), else shown. */}
              {c.text ? (
                <div className="mt-1 whitespace-pre-wrap text-[12px] leading-snug text-zinc-200">{c.text}</div>
              ) : (
                <div className="mt-1 flex gap-1">
                  <input autoFocus placeholder="Write a comment…" value={drafts[c.id] ?? ''} onChange={e => setDraft(c.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onSubmit(c.id, drafts[c.id] ?? ''); setDraft(c.id, ''); } }} className="h-7 flex-1 rounded border border-white/10 bg-[#0a0b0e] px-2 text-[11px] text-zinc-100" />
                  <button onClick={() => { onSubmit(c.id, drafts[c.id] ?? ''); setDraft(c.id, ''); }} className="rounded bg-cyan-500 px-2 text-[11px] font-medium text-zinc-900">Post</button>
                </div>
              )}
              {replies.map(r => (
                <div key={r.id} className="mt-1.5 border-l-2 border-white/10 pl-2">
                  <div className="flex items-center gap-1.5 text-[10px]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: r.authorColor }} /><span className="font-medium text-zinc-300">{r.author}</span><span className="text-zinc-500">{fmtTime(r.ts)}</span></div>
                  <div className="whitespace-pre-wrap text-[11px] text-zinc-300">{r.text}</div>
                </div>
              ))}
              {c.text && !c.resolved && (
                <div className="mt-1.5 flex gap-1">
                  <input placeholder="Reply…" value={drafts['r' + c.id] ?? ''} onChange={e => setDraft('r' + c.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onReply(c.id, drafts['r' + c.id] ?? ''); setDraft('r' + c.id, ''); } }} className="h-6 flex-1 rounded border border-white/10 bg-[#0a0b0e] px-2 text-[11px] text-zinc-100" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/5 px-3 py-2 text-[10px] text-zinc-500">Commenting as <span className="text-zinc-300">{author}</span></div>
    </div>
  );
}

function CollabDialog({ onCancel, onStart }: { onCancel: () => void; onStart: (name: string, room: string) => void }) {
  const [name, setName] = React.useState('Me');
  const [room, setRoom] = React.useState('');
  return (
    <Dialog title="Live collaboration" onCancel={onCancel} onConfirm={() => onStart(name, room)} confirmLabel="Start">
      <div className="space-y-3 text-xs">
        <div className="rounded bg-emerald-500/10 p-2 text-emerald-200">
          Your document syncs peer-to-peer, encrypted in transit. Only the brief
          connection handshake uses a lightweight relay — the document itself
          never passes through a server.
        </div>
        <label className="block">
          <div className="mb-1 text-zinc-400">Your name:</div>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 text-zinc-100" />
        </label>
        <label className="block">
          <div className="mb-1 text-zinc-400">Room code (leave blank to host new):</div>
          <input value={room} onChange={e => setRoom(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="e.g. team-2026" className="w-full rounded border border-white/10 bg-[#0a0b0e] px-2 py-1.5 font-mono text-zinc-100" />
        </label>
      </div>
    </Dialog>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let inList = false, inOl = false, inPre = false;
  const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } if (inOl) { out.push('</ol>'); inOl = false; } };
  for (const ln of lines) {
    if (/^```/.test(ln)) {
      if (inPre) { out.push('</pre>'); inPre = false; } else { flushList(); out.push('<pre>'); inPre = true; }
      continue;
    }
    if (inPre) { out.push(escapeHtml(ln)); continue; }
    if (!ln.trim()) { flushList(); out.push(''); continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,3})\s+(.+)$/.exec(ln))) { flushList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if (/^[-*]\s+/.test(ln)) {
      if (!inList) { flushList(); out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(ln.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(ln)) {
      if (!inOl) { flushList(); out.push('<ol>'); inOl = true; }
      out.push(`<li>${inline(ln.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    if (/^>\s?/.test(ln)) { flushList(); out.push(`<blockquote>${inline(ln.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    flushList();
    out.push(`<p>${inline(ln)}</p>`);
  }
  if (inList) out.push('</ul>');
  if (inOl) out.push('</ol>');
  if (inPre) out.push('</pre>');
  return out.join('\n');
}
function inline(s: string): string {
  s = escapeHtml(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

function htmlToMarkdown(html: string): string {
  // DOMParser instead of `innerHTML =` so a `<img onerror>` in a pasted
  // editor doc doesn't fire during markdown export. Same reasoning as the
  // PDF export path above.
  const tmp = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const inner = Array.from(el.childNodes).map(walk).join('');
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1') return `\n# ${inner}\n\n`;
    if (tag === 'h2') return `\n## ${inner}\n\n`;
    if (tag === 'h3') return `\n### ${inner}\n\n`;
    if (tag === 'h4') return `\n#### ${inner}\n\n`;
    if (tag === 'p') return `${inner}\n\n`;
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${inner}**`;
    if (tag === 'em' || tag === 'i') return `*${inner}*`;
    if (tag === 'code') return `\`${inner}\``;
    if (tag === 'pre') return `\n\`\`\`\n${el.innerText}\n\`\`\`\n\n`;
    if (tag === 'blockquote') return `\n> ${inner.trim().replace(/\n/g, '\n> ')}\n\n`;
    if (tag === 'a') return `[${inner}](${(el as HTMLAnchorElement).href})`;
    if (tag === 'img') return `![${(el as HTMLImageElement).alt || ''}](${(el as HTMLImageElement).src})`;
    if (tag === 'ul') return '\n' + Array.from(el.children).map(li => `- ${walk(li).trim()}`).join('\n') + '\n\n';
    if (tag === 'ol') return '\n' + Array.from(el.children).map((li, i) => `${i + 1}. ${walk(li).trim()}`).join('\n') + '\n\n';
    if (tag === 'li') return inner;
    if (tag === 'table') return `\n${tableToMd(el as HTMLTableElement)}\n\n`;
    return inner;
  };
  return walk(tmp).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function tableToMd(t: HTMLTableElement): string {
  const rows: string[][] = [];
  for (const tr of Array.from(t.rows)) {
    const cells: string[] = [];
    for (const c of Array.from(tr.cells)) cells.push((c.textContent || '').trim());
    rows.push(cells);
  }
  if (!rows.length) return '';
  const cols = rows[0].length;
  const header = '| ' + rows[0].join(' | ') + ' |';
  const sep = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
  const body = rows.slice(1).map(r => '| ' + r.join(' | ') + ' |').join('\n');
  return [header, sep, body].filter(Boolean).join('\n');
}

function collectBlocks(root: HTMLElement): { kind: 'h1' | 'h2' | 'h3' | 'p' | 'li'; text: string }[] {
  const out: { kind: 'h1' | 'h2' | 'h3' | 'p' | 'li'; text: string }[] = [];
  for (const el of Array.from(root.querySelectorAll('h1, h2, h3, p, li, blockquote, pre'))) {
    const tag = el.tagName.toLowerCase();
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt) continue;
    if (tag === 'li') out.push({ kind: 'li', text: '• ' + txt });
    else if (tag === 'h1' || tag === 'h2' || tag === 'h3') out.push({ kind: tag as 'h1', text: txt });
    else out.push({ kind: 'p', text: txt });
  }
  return out;
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width <= maxWidth) cur = test;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
