/**
 * Xonvert AI — inline subtitle transforms.
 *
 * Pure SRT/VTT operations: pull the dialogue as plain text, clean inline tags,
 * shift timings, or rescale for an FPS change. Input is the subtitle text (the
 * user pastes it or attaches an .srt/.vtt), so these share the text-op runner's
 * operand extraction. Pure / DOM-free and Node-testable.
 */

import { parse, write, shift, scale, stripTags, toPlainText } from '@/engines/subtitle';

export interface SubtitleOp { verb: string; run: (input: string, message: string) => string }

/** Seconds to shift; "earlier/back" makes it negative; "ms" scales down. */
function parseShiftSec(msg: string): number {
  const m = msg.match(/(-?\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?)?/i);
  let sec = m ? parseFloat(m[1]) : 0;
  if (m && /^ms|millisecond/i.test(m[2] ?? '')) sec /= 1000;
  if (sec > 0 && /\b(earlier|back|behind|sooner)\b/i.test(msg)) sec = -sec;
  return sec;
}
/** FPS conversion factor from "24 to 25 fps" → source/target. */
function parseFpsFactor(msg: string): number {
  const m = msg.match(/(\d+(?:\.\d+)?)\s*(?:fps)?\s*(?:to|→|->|into)\s*(\d+(?:\.\d+)?)/i);
  if (m) { const a = parseFloat(m[1]), b = parseFloat(m[2]); if (a > 0 && b > 0) return a / b; }
  return 1;
}

export const SUBTITLE_OPS: Record<string, SubtitleOp> = {
  'subtitle-to-plain-text': { verb: 'strip the timings to plain text', run: (srt) => toPlainText(parse(srt)) || '(no dialogue found)' },
  'subtitle-cleaner': { verb: 'clean the formatting', run: (srt) => write(parse(srt).map((c) => ({ ...c, text: stripTags(c.text) }))) },
  'subtitle-timing-shifter': { verb: 'shift the timing', run: (srt, msg) => write(shift(parse(srt), parseShiftSec(msg))) },
  'subtitle-fps-converter': { verb: 'convert the frame rate', run: (srt, msg) => write(scale(parse(srt), parseFpsFactor(msg))) },
};

export function subtitleOpFor(id: string): SubtitleOp | undefined {
  return SUBTITLE_OPS[id];
}
export const SUBTITLE_IDS = Object.keys(SUBTITLE_OPS);
