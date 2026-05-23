/**
 * Xonvert AI — intent gate.
 *
 * The pipeline used to be ~20 first-match-wins gates, each guessing "is this
 * mine?" in isolation — so "can you tell bitcoin price" got grabbed by the
 * capability-question gate (→ a random tool), and "best game 2026" fell through
 * to tool routing (→ eDPI Calculator). The fix is to decide the *family* of the
 * request ONCE, up front, and let it gate the existing handlers.
 *
 * Pure / DOM-free / Node-testable. It classifies; it doesn't execute.
 */

import { ACTION_RE, QUESTION_RE } from './route-intents';
import { detectAnswerType } from './extract';

export type Intent =
  | 'task'          // wants a job done (file present, action verb, format, tool noun)
  | 'capability'    // "can you / how do I …" ABOUT a tool action → answer from catalog
  | 'question'      // factual / informational / opinion → answer engine (search)
  | 'followup'      // "tell me more", "why", "go on" → continue the previous topic
  | 'media-subject' // "draw/make an image OF <subject>" — can't generate real depictions
  | 'chitchat';     // greetings, persona, thanks, jokes — converse

export interface IntentCtx {
  /** A file is attached or staged this turn. */
  hasFile?: boolean;
  /** There's a previous answer/topic to follow up on (for "tell me more"). */
  hasTopic?: boolean;
}

// Short continuations that only make sense against a previous answer.
const FOLLOWUP_RE = /^\s*(tell me more|more( details| info| about (it|that|this))?|go on|continue|and\??|and then\??|so\??|why( is that| though)?|how come|how so|really\??|what else|anything else|say more|explain( that| it| more)?|elaborate|expand( on (it|that))?|keep going|next)\s*[?.!]*\s*$/i;

// Greetings, persona, social niceties — never a tool request or a web lookup.
const CHITCHAT_RE = /^\s*(hi|hii+|hey+|hello|yo|sup|howdy|greetings|good (morning|afternoon|evening)|thanks?|thank you|thx|ty|cheers|ok|okay|cool|nice|great|lol|haha|bye|goodbye|see ya)\b|(\b(who|what) are you\b|\byour name\b|\bwho made you\b|\bhow are you\b|\bare you (a )?(real|human|ai|robot|bot)\b|\bdo you (like|love|feel|think|believe)\b|\btell me a (joke|story|poem)\b|\bsing\b)/i;

// "make/draw a picture OF/ABOUT <subject>" — a request for a real depiction we
// cannot produce. Excludes the abstract/generative art and graphic tools we DO
// offer (wallpaper, pattern, qr, thumbnail, poster, og image, favicon, meme…).
const MEDIA_VERB = /\b(make|create|draw|generate|paint|design|render|produce|give me|want|need|show me|find( me)?|get me|looking for|i'?d like)\b/i;
const MEDIA_NOUN = /\b(image|picture|pic|photo|photograph|drawing|illustration|portrait|painting|artwork|art)\b/i;
const MEDIA_OF = /\b(of|about|showing|depicting|featuring|with)\s+\S/i;
const MEDIA_OK = /\b(abstract|wallpaper|pattern|gradient|texture|qr|thumbnail|poster|banner|og|open[- ]?graph|favicon|icon|logo|meme|collage|placeholder|avatar|background|geometric)\b/i;

// Opinion / recommendation / live-feed phrasings that no tool answers and that
// the answer engine should field ("best game 2026", "latest news", "should I…").
const OPINION_RE = /\b(best|top|worst|greatest|favou?rite|recommend|recommendation|should i|worth (it|buying)|vs\.?|versus|compared? to|latest|newest|recent|news|trending|popular|review)\b/i;

// Live-data topics ("bitcoin price", "apple stock", "weather") — questions for
// the answer engine, even without a leading question word. Excludes anything
// with a tool action (handled by the `!action` guard at the call site).
const LIVE_RE = /\b(price|stock|stocks|shares?|crypto|bitcoin|ethereum|dogecoin|exchange rate|forecast|score|scores|standings|news|headlines)\b/i;

// "can you / could you / how do I / is there a tool for …" — a question ABOUT
// what the assistant can do. Only a *capability* question when paired with a
// tool action; "can you tell me the bitcoin price" is a factual question.
const CAPABILITY_PREFIX = /\b(can (you|i)|could you|are you able|do you (have|support|offer)|is there (a|an|any|some)?\s*(tool|way|feature|option)|how (do|can|would|to) (i|you)|how to)\b/i;

/** Does the text name a concrete tool action / format / medium to operate on? */
export function hasToolAction(text: string): boolean {
  return ACTION_RE.test(text);
}

/**
 * Classify the request's family. Order matters: the most specific, least
 * reversible interpretations win first.
 */
export function classifyIntent(text: string, ctx: IntentCtx = {}): Intent {
  const t = text.trim();
  if (!t) return ctx.hasFile ? 'task' : 'chitchat';

  // 1) Following up on a previous answer ("tell me more", "why?").
  if (ctx.hasTopic && FOLLOWUP_RE.test(t)) return 'followup';

  // 2) Social / persona — but not if it also clearly asks for a job.
  if (CHITCHAT_RE.test(t) && !hasToolAction(t)) return 'chitchat';

  // 3) A request for a real depiction of a subject — which we can't generate.
  if (MEDIA_VERB.test(t) && MEDIA_NOUN.test(t) && MEDIA_OF.test(t) && !MEDIA_OK.test(t)) {
    return 'media-subject';
  }

  // 4) A file in hand almost always means "do something with this".
  if (ctx.hasFile) return 'task';

  const action = hasToolAction(t);

  // 4.5) A recipe is always a look-up question, even though "make/bake/cook" are
  //      action verbs ("how do i make sourdough bread" is a recipe, not a tool
  //      job). Recipe detection is specific enough not to catch tool requests.
  if (detectAnswerType(t) === 'recipe') return 'question';

  // 5) Capability question — about a tool action, not a fact.
  if (CAPABILITY_PREFIX.test(t) && action) return 'capability';

  // 6) Factual / informational / opinion question with no tool action → answer.
  //    Covers "what is X", "who is X", "can you tell me X", "best X 2026",
  //    "latest news", "i want to know …". Requires a POSITIVE question signal —
  //    a bare imperative like "uppercase this: hello" has neither an ACTION_RE
  //    verb nor a question word, and must NOT be mistaken for a question (it's a
  //    job the tool router handles).
  // A recipe / code request often has no question word ("cupcake recipe",
  // "python read a file") — but it's still something to look up and present.
  const at = detectAnswerType(t);
  const infoType = at === 'recipe' || at === 'code' || at === 'howto';

  const asksSomething =
    QUESTION_RE.test(t) ||
    OPINION_RE.test(t) ||
    LIVE_RE.test(t) ||
    infoType ||
    /\b(i (want|need|would like) to know|i'?m curious|tell me|do you know|any idea|what about)\b/i.test(t);
  if (asksSomething && !action) return 'question';

  // 7) Default: let the tool router decide (it's strong at this). If it finds
  //    nothing, the caller's factual-fallback still answers a bare topic
  //    ("eiffel tower height"). Defaulting to 'question' here would wrongly
  //    preempt tool routing for verbs not in ACTION_RE (reverse/sort/slugify…).
  return 'task';
}
