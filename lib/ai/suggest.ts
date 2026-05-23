/**
 * Xonvert AI — proactive suggestions.
 *
 * Two kinds of "the AI just knows":
 *  - `actionsForMedium`: drop any file and we instantly surface the most useful
 *    things we can do with *that* kind of file — grouped, named, linked. This is
 *    what makes the assistant feel like it has truly mastered the catalog: it
 *    doesn't wait to be asked, it offers.
 *  - `nextStepsFor`: after a job finishes, offer the obvious follow-ups for the
 *    file we just produced ("compress it", "convert to JPG", "send it") as one-
 *    tap phrases the user can run without thinking about which tool that is.
 *
 * Curated for quality but validated against the live registry, so a renamed or
 * removed tool silently drops out instead of dead-linking. Pure / DOM-free.
 */

import { docById } from './tool-index';

export type SuggestMedium = 'image' | 'audio' | 'video' | 'pdf' | 'doc' | 'text';

export interface SuggestedAction { name: string; href: string; blurb: string }
export interface SuggestionGroup { title: string; actions: SuggestedAction[] }

// The headline actions per medium, in the order most people want them. Ids are
// resolved against the registry; unknown ids are skipped.
const BY_MEDIUM: Record<SuggestMedium, { title: string; ids: string[] }[]> = {
  image: [
    { title: 'Edit', ids: ['image-remove-bg', 'image-upscale', 'image-crop', 'image-rotate', 'image-object-remove', 'image-add-text'] },
    { title: 'Optimize', ids: ['image-compress', 'image-resize', 'image-convert-format', 'image-remove-metadata'] },
    { title: 'Style', ids: ['image-grayscale', 'image-vintage', 'image-watermark', 'image-border'] },
  ],
  audio: [
    { title: 'Edit', ids: ['audio-trim', 'audio-volume', 'audio-speed', 'audio-merge', 'audio-vocal-remover'] },
    { title: 'Clean up', ids: ['audio-normalize', 'audio-remove-noise', 'audio-remove-silence'] },
    { title: 'Convert & read', ids: ['audio-convert-format', 'audio-compress', 'audio-to-text'] },
  ],
  video: [
    { title: 'Edit', ids: ['video-trim', 'video-crop', 'video-reframe', 'video-merge', 'video-add-text'] },
    { title: 'Optimize', ids: ['video-compress', 'video-convert-format', 'video-resize', 'video-mute'] },
    { title: 'Extract', ids: ['video-to-gif', 'video-extract-audio', 'video-extract-frames'] },
  ],
  pdf: [
    { title: 'Pages', ids: ['pdf-merge', 'pdf-split', 'pdf-delete-pages', 'pdf-extract-pages', 'pdf-reorder', 'pdf-rotate'] },
    { title: 'Optimize & secure', ids: ['pdf-compress', 'pdf-protect', 'pdf-unlock', 'pdf-sign'] },
    { title: 'Read & mark', ids: ['pdf-to-text', 'pdf-ocr', 'pdf-page-numbers', 'pdf-watermark'] },
  ],
  doc: [
    { title: 'Convert', ids: ['doc-convert', 'sheet-convert', 'slides-convert'] },
    { title: 'Then, as a PDF', ids: ['pdf-merge', 'pdf-delete-pages', 'pdf-page-numbers', 'pdf-protect'] },
  ],
  text: [
    { title: 'Transform', ids: ['text-find-replace', 'text-lowercase', 'text-camel-case', 'text-add-prefix'] },
    { title: 'Extract & analyze', ids: ['text-extract-urls', 'text-extract-emails', 'text-keyword-density', 'text-readability'] },
    { title: 'Encode', ids: ['text-base64', 'text-html-encode'] },
  ],
};

function resolve(ids: string[]): SuggestedAction[] {
  const out: SuggestedAction[] = [];
  for (const id of ids) {
    const d = docById(id);
    if (d) out.push({ name: d.name, href: d.href, blurb: d.blurb });
  }
  return out;
}

/** Grouped, ready-to-show actions for a file of this medium. */
export function actionsForMedium(medium: SuggestMedium): SuggestionGroup[] {
  return (BY_MEDIUM[medium] ?? [])
    .map((g) => ({ title: g.title, actions: resolve(g.ids) }))
    .filter((g) => g.actions.length > 0);
}

/** A flat, friendly headline list (first action of each group) for one line. */
export function topActionsForMedium(medium: SuggestMedium, n = 4): SuggestedAction[] {
  const flat = actionsForMedium(medium).flatMap((g) => g.actions);
  const seen = new Set<string>();
  const out: SuggestedAction[] = [];
  for (const a of flat) { if (seen.has(a.href)) continue; seen.add(a.href); out.push(a); if (out.length >= n) break; }
  return out;
}

// Follow-up phrases the user can run after we hand back a file of this medium.
// Each is a natural-language command the assistant already handles, so tapping
// it just re-runs the pipeline on the produced file.
const NEXT_STEPS: Record<SuggestMedium, string[]> = {
  image: ['compress it', 'convert to JPG', 'remove the background', 'send it'],
  audio: ['normalize it', 'convert to MP3', 'trim it', 'send it'],
  video: ['compress it', 'convert to a GIF', 'extract the audio', 'send it'],
  pdf: ['compress it', 'add page numbers', 'password-protect it', 'send it'],
  doc: ['convert it to PDF', 'send it'],
  text: ['copy it', 'send it'],
};

export function nextStepsFor(medium: SuggestMedium | null): string[] {
  return medium ? (NEXT_STEPS[medium] ?? ['send it']) : ['send it'];
}
