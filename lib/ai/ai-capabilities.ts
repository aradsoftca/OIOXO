/**
 * Xonvert AI — AI abilities as first-class capabilities.
 *
 * The engine fix: the AI's own abilities (translate, summarize) used to be
 * bolted onto routing as one-off regex branches — a new branch per ability,
 * forever (whack-a-mole). Instead they're now registry entries indexed by the
 * SAME ranker that routes the 323 tools. So the one routing/planning engine
 * places them in chains and single requests alike, and adding an ability is a
 * manifest here, not a code branch elsewhere.
 *
 * They carry the `text` category (text→text) so file-medium filtering treats
 * them sensibly. Their runners live in the executor (ai-translate/ai-summarize).
 */

import type { ToolManifest } from '@/lib/registry/types';

export const AI_CAP_MANIFESTS: ToolManifest[] = [
  {
    id: 'ai-translate', name: 'Translate Text', blurb: 'Translate text into another language',
    category: 'text', tile: 'M', icon: 'Languages', compute: 'local',
    accepts: ['text/plain'], produces: ['text/plain'],
    keywords: ['translate', 'translation', 'translate to', 'language', 'localize', 'say in',
      'spanish', 'french', 'german', 'arabic', 'chinese', 'japanese', 'italian', 'portuguese',
      'russian', 'hindi', 'korean', 'turkish', 'dutch', 'polish', 'persian'],
  },
  {
    id: 'ai-summarize', name: 'Summarize Text', blurb: 'Summarize text into a short version',
    category: 'text', tile: 'M', icon: 'FileText', compute: 'local',
    accepts: ['text/plain'], produces: ['text/plain'],
    keywords: ['summarize', 'summarise', 'summary', 'tldr', 'tl;dr', 'key points', 'the gist',
      'condense', 'shorten', 'brief', 'overview', 'recap', 'main points'],
  },
];
