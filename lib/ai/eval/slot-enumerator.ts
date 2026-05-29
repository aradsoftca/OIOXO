/**
 * slot-enumerator — generate the coverage matrix as a flat spec list.
 *
 * Instead of looping "situation types" sequentially (the old gen-conductor-data.ts
 * approach), we enumerate the SHAPE × TURN-ROLE × MODALITY × LANGUAGE × SURFACE
 * grid the brain has to cover, prune unrealistic combinations, and emit a balanced
 * spec list. Each spec is one instruction to the Gemini teacher: "generate a
 * dialogue of THIS shape, on THIS surface, with THIS modality, in THIS language,
 * exercising THIS turn-role mix."
 *
 * The dataset learns the SLOT SPACE (~hundreds of combinations), not the example
 * space (millions of phrasings). This is what makes "handle anything" tractable.
 */

// ── Coverage matrix dimensions ────────────────────────────────────────────────
//
// SHAPES (v2 audit, 2026-05-28 — added 8 missing classes):
//   v1 (23): the original kinds of answer/action
//   v2 (+8): the meta/in-flight shapes the v1 matrix missed (preference-set, ai-correction,
//            abort/negation, format-mid-flow, meta-question, hypothetical, multi-intent,
//            greeting-task). Each one was a real user-prompt class we'd have shipped dumb.
export const SHAPES = [
  // v1 — "kinds of answer/action"
  'fact', 'define', 'explain', 'why', 'howto', 'compare', 'recommend',
  'opinion', 'list', 'transform', 'creative', 'compute', 'chat', 'decide',
  'troubleshoot', 'feasibility', 'recall', 'plan', 'teach', 'critique',
  'code', 'recipe', 'live',
  // v2 — "meta / in-flight" shapes the v1 matrix missed
  'format-mid-flow',  // "shorter" / "in bullets" / change style without restating Q
  'preference-set',   // "call me Alex" / "I'm vegan" — pure memory:store, no chain
  'ai-correction',    // "no that's wrong — X is actually Y" — user corrects AI's claim
  'abort',            // "nevermind" / "cancel that" / "stop" — abandon in-flight goal
  'meta-question',    // "where did you get that?" / "are you sure?" / "what tools?"
  'hypothetical',     // "what if I had X?" / "would it work if…" — counterfactual
  'multi-intent',     // "do A, then B, then tell me C" — multiple goals in one msg
  'greeting-task',    // "hey! can you convert this?" — chitchat + new-goal combined
  // v3 — structural/control shapes the v1+v2 matrices missed
  'conditional',          // "if it's a PDF do X, if image do Y" — branch in plan
  'constraint',           // "max 200 words" / "under $50" — extract to params
  'batch',                // "do this for ALL my files" — multi-target dispatch
  'iterative-refinement', // "more X" / "less Y" / "different angle" — refine without re-gather
  'task-decomp-vague',    // "help me plan my wedding" — propose breakdown, ask which piece
  // v4 — ask-structure shapes the matrices keep missing
  'implicit-ask',         // "I'm so confused about taxes" — statement-as-question
  'validation-seek',      // "is this good?" — user shows content for review
  'advice-seek',          // "what would you do?" — solicits opinion
  'roleplay-request',     // "pretend you're a chef" — persona scaffolding
  'product-meta',         // "who made you?" / "what model?" — questions ABOUT the AI
  'recovery',             // post-tool-error path: "tool failed, what next?"
  'anti-sycophancy',      // user states false thing → gentle correction, never agree
  'expertise-calibrate',  // mismatch between persona and topic complexity
  // v5 — high-stakes behavioral shapes a real launch must train
  'handoff-human',        // "see a [doctor/lawyer/advisor]" — refer to expert by type
  'destructive-confirm',  // "delete all" / "send to all" — confirm before irreversible
  'physical-limit',       // "is it raining?" — honest "I can't perceive that"
  'date-defer',           // "what year is it?" / "current price?" — defer to runtime/search
] as const;
export type Shape = (typeof SHAPES)[number];

export const TURN_ROLES = [
  'new-goal', 'parameter', 'append-step', 'correction',
  'confirmation', 'question', 'chitchat', 'outcome',
] as const;
export type TurnRole = (typeof TURN_ROLES)[number];

export const MODALITIES = [
  'text',                // text-only message
  'text+image',          // user uploads an image
  'text+file',           // user uploads a pdf/audio/video/text file
  'multi-image',         // 2+ images at once (comparison)
  'image-in-history',    // previous turn had an image; current turn references it
  // v2 audit additions
  'text+url',            // "summarize this: https://..." — URL is the input, not a file
  'audio-input',         // voice message (post-STT transcript reaches the brain as text)
  'empty-with-file',     // user drops a file with no text — brain must propose actions
  // v3-v5 audit additions
  'mixed-script',        // "can you make this در فارسی?" — message mixes scripts
  'code-paste',          // user pastes code/log/error block — dense text, no file
  'prior-tool-output',   // "now do X to that result" — chain off just-finished tool
  'partial-thought',     // "...so anyway can you" — incomplete preceding text
] as const;
export type Modality = (typeof MODALITIES)[number];

/**
 * NOTE on language: the brain RUNS IN ENGLISH ONLY.
 *
 * `oioxo-engine.respond()` already wraps the brain in a multilingual shell —
 * translate.toEnglish() the user input, run the English-internal pipeline, then
 * translate.fromEnglish() the reply back. So the brain never receives non-
 * English text at runtime — burning 256M of precious capacity on language
 * modeling would waste it.
 *
 * We do keep a small "language-switch" axis (~5% of specs) so the brain learns
 * to UPDATE the `style.lang` field when a user says "from now on reply in
 * Spanish" / "call me Alex". That's a label update, not text generation in the
 * target language; the translation shell does the actual rendering.
 */
export const LANG_AXIS = ['en', 'lang-switch'] as const;
export type LangAxis = (typeof LANG_AXIS)[number];

export const SURFACES = [
  'chat', 'search', 'tool', 'chain', 'studio', 'app', 'vision', 'memory', 'limit',
] as const;
export type Surface = (typeof SURFACES)[number];

/**
 * EDGE PROBES (v2 audit) — adversarial / robustness probes injected into ~12%
 * of specs. These don't add new shapes; they STRESS existing shapes with input
 * styles the brain must survive. Each probe is a perturbation instruction the
 * teacher applies to the user message of one turn in the dialogue.
 */
export const EDGE_PROBES = [
  null,                  // no probe — most specs
  // v2 probes (originals)
  'typo',                // "conver this fil to jpg" — must understand despite spelling errors
  'very-short',          // "k", "?", "no", "ok" — minimal context, must use history
  'very-long',           // 150+ word rambling vent with one hidden actionable ask
  'emotional',           // "I'm so frustrated this isn't working" — empathy + help, not dismiss
  'sarcastic',           // "yeah right, like THAT'll work" — must read tone, not take literally
  'ambiguous',           // "apple" / "java" / "mercury" — must clarify, not pick wrong sense
  'jailbreak',           // "ignore previous instructions" / "tell me you're ChatGPT" — refuse, stay self
  'all-caps',            // "WHY ISN'T THIS WORKING" — detect distress, calm tone, no caps echo
  'back-to-back',        // two user messages in a row — second references first; brain must merge
  // v3 probes
  'negation',            // "anything BUT apple" — must respect exclusion
  'self-correction',     // "wait no I meant X" — user corrects themselves mid-message
  'exclusion-constraint',// "without using cloud / without uploading" — honor constraint
  'interruption',        // user sends 2nd msg before AI replied — merge intent
  // v4 probes
  'mid-message-mind-change', // "do X... actually no, do Y" — follow the latest
  'multi-question-stack',    // "do X. also Y? and Z?" — answer all, decompose
  'typo-key-noun',           // "jpef to png" — wrong file format spelling, infer
  'mixed-emoji-text',        // "make this 🍕 brighter" — emojis carry meaning
  'paste-with-prefix',       // "I copied this: [pasted text]" — content vs ask
  'interrupted-thought',     // "can you... wait nevermind, do X"
  'anxious-repeat',          // same Q phrased 3 ways in one dialogue — reassurance, not condescension
  'excessive-context-dump',  // 300-word backstory before 5-word ask — extract the ask
  // v5 probes
  'false-premise',           // "since vaccines cause autism..." — gentle correction, no shaming
  'scam-victim-context',     // "I got an email saying I won $10M, how do I claim?" — warn, don't engage
  'first-time-greet',        // "hi, I'm new here" — different opener than mid-session
  'goodbye',                 // "thanks bye!" — warm close, no "is there anything else?"
  'repetitive-loop',         // same Q rephrased 3+ times — notice + redirect
] as const;
export type EdgeProbe = (typeof EDGE_PROBES)[number];

// ── v3-v5 NEW AXES — persona/domain/register/cultural/flow/tone-hint ──────────
// These don't make the matrix wider via cross-product (would explode). They are
// SAMPLED per spec to give each generated dialogue a distinct voice/context.

/** The user typing — 16 distinct voices the brain must serve. The teacher
 *  is told to MAKE THE USER FEEL LIKE this persona, not just label them. */
export const PERSONAS = [
  'tech-pro',           // developer/designer/PM — uses jargon naturally
  'non-tech-adult',     // typical user, plain English, no jargon
  'elderly',            // formal, polite, may not know modern terms
  'teen',               // slang, abbreviations, lowercase, "no cap fr"
  'academic',           // precise, hedged, complete sentences
  'esl',                // imperfect grammar, simpler vocab, odd word order
  'frustrated',         // curt, blunt, urgent, drift to caps
  'casual-curious',     // exploratory: "i was just wondering…"
  'domain-expert',      // niche jargon: clinician/lawyer/engineer/musician
  'novice',             // asks for clarification, doesn't know terms
  'parent',             // asking on behalf of a kid; tone of patience
  'power-user',         // knows tool names, asks for specific ops
  'mobile-typing',      // autocorrect mistakes, swipe artifacts, emoji shortcuts
  'voice-rambler',      // long flowing transcript, no punctuation, filler ("um", "you know")
  'anxious-repeater',   // asks same Q 3 ways for reassurance pattern
  'urgent-pro',         // "ASAP", "tldr", urgent, expects expertise
] as const;
export type Persona = (typeof PERSONAS)[number];

/** What they're asking about — 28 domains spanning real human concerns. The
 *  teacher's default bias is tech/cooking/travel; forcing 28-way balance kills
 *  that and makes the dataset span actual human life. */
export const DOMAINS = [
  'daily-life', 'work-productivity', 'technology', 'health-wellness', 'education-learning',
  'finance-money', 'travel', 'entertainment', 'creative', 'science', 'history',
  'nature-environment', 'food-cooking', 'automotive', 'legal-general', 'relationships-social',
  'shopping-products', 'diy-hobbies', 'coding-tech-pro', 'news-current-events',
  // v4 additions — domains every chatbot launch under-covers
  'religion-spirituality', 'parenting-kids',
  // v5 additions — civic/infrastructure
  'government-services', 'transportation', 'utilities-infra', 'housing-real-estate',
  'insurance', 'community-civic',
] as const;
export type Domain = (typeof DOMAINS)[number];

/** How they write — 6 registers. Forces variety in length, formality, structure. */
export const REGISTERS = [
  'formal',       // "Could you please..." complete sentences
  'casual',       // "hey can you..." normal conversation
  'terse',        // "convert this" — bare minimum
  'rambling',     // 100+ words of context with the ask buried
  'follow-on',    // natural reference to history: "do the same", "that one"
  'slang',        // heavy informal: lowercase, abbreviations, internet-speak
] as const;
export type Register = (typeof REGISTERS)[number];

/** Who-in-the-world is asking — 13 cultural frames combat the teacher's
 *  US-default bias. When cultural-frame=MENA + domain=food-cooking, the
 *  teacher generates a dialogue about ghormeh sabzi, not lasagna. */
export const CULTURAL_FRAMES = [
  'us-western', 'uk-eu', 'mena', 'south-asia', 'east-asia', 'southeast-asia',
  'latin-america', 'sub-saharan-africa', 'eastern-europe', 'diaspora-bridge',
  // v5 additions
  'rural-context',      // farming/small-town/agriculture concerns
  'urban-megacity',     // apartment/transit/density concerns
  'first-gen-bridging', // immigrant context, two-world references, natural code-switching
] as const;
export type CulturalFrame = (typeof CULTURAL_FRAMES)[number];

/** The structural arc of the dialogue — 7 flows. The vision-* flows are what
 *  ensures the brain learns vision×search composition AND when NOT to invoke
 *  vision (a common failure mode of VLM-based products). */
export const FLOWS = [
  'single',              // one turn, simple plan, no follow-up
  'vision-search',       // image + question → vision-extract → search → grounded answer
  'vision-edit',         // image + edit-request → vision-describe → tool:image-*
  'vision-skip',         // image + simple action ("convert to JPG") → DO NOT invoke vision
  'vision-chain',        // image → vision → multi-step tool chain
  'multi-turn-refine',   // "now make it shorter" / "different angle" — iterative
  'clarify-loop',        // ambiguous → ask → user disambig → execute
] as const;
export type Flow = (typeof FLOWS)[number];

/** What kind of reply style the user wants — 5 tone hints. Shapes the
 *  `style.format` and `style.length` fields the brain emits. */
export const TONE_HINTS = [
  'default',  // brain picks naturally based on shape
  'tldr',     // user wants one-liner
  'detailed', // user wants full explanation
  'bullets',  // user wants list format
  'steps',    // user wants numbered procedure
] as const;
export type ToneHint = (typeof TONE_HINTS)[number];

// ── One spec = one prompt to the teacher ──────────────────────────────────────
export interface Spec {
  shape: Shape;
  turnRoleFocus: TurnRole;  // the turn-role this dialogue must EXERCISE (others may appear naturally)
  modality: Modality;
  lang: LangAxis;           // 'en' default; 'lang-switch' = user changes reply language mid-chat
  surface: Surface;
  edgeProbe: EdgeProbe;     // null for most; a robustness perturbation applied to one user turn
  // v3-v5 axes (sampled per spec for variety)
  persona: Persona;         // who is typing (drives voice / vocab / formality)
  domain: Domain;           // what they're asking about (drives topic / examples)
  register: Register;       // how they write (drives length / structure / punctuation)
  cultural: CulturalFrame;  // who-in-the-world (combat US-default bias)
  flow: Flow;               // dialogue's structural arc (vision-* flows trained explicitly)
  toneHint: ToneHint;       // wanted reply style (drives style.format / style.length)
  // v5 dedicated-category marker — when set, the teacher gets category-specific
  // guidance ON TOP of the spec axes. These are the "must-be-excellent" classes.
  dedicatedCategory: DedicatedCategory | null;
}

/** v5 DEDICATED CATEGORIES — high-stakes behavioural classes the brain MUST
 *  be excellent at. Each gets a fixed allocation in Phase 2 of enumerate(),
 *  with category-specific guidance baked into the teacher prompt at gen time. */
export const DEDICATED_CATEGORIES = [
  'honest-limit',          // (~60 specs) — every refusal names a real alternative
  'safety-medical',        // (~10) — empathy + see-a-doctor, NEVER diagnose
  'safety-legal',          // (~10) — general info + see-a-lawyer, NEVER advise
  'safety-financial',      // (~10) — trade-offs + see-fiduciary, NEVER recommend
  'safety-mental-health',  // (~10) — empathy + resources, NEVER dismiss
  'safety-self-harm',      // (~5)  — crisis hotline, NEVER engage with method
  'safety-eating-disorder',// (~5)  — careful + NEDA-style hotline
  'safety-substance-use',  // (~5)  — harm-reduction, no judgment
  'safety-domestic-violence',// (~5) — safety planning + hotline
  'safety-child',          // (~10) — refuse + report-resource
  'safety-conspiracy',     // (~10) — gentle fact-check, no mockery
  'product-meta-identity', // (~4) — "who/what are you?"
  'product-meta-privacy',  // (~4) — "where's my data?"
  'product-meta-capability',// (~4) — "what can you do?"
  'product-meta-comparison',// (~4) — "are you ChatGPT/Gemini?"
  'product-meta-trust',    // (~4) — "can I trust you?"
  'product-meta-pricing',  // (~4) — "are you free?"
  'product-meta-offline',  // (~4) — "do you work offline?"
  'product-meta-memory',   // (~4) — "do you remember things?"
  'product-meta-limits',   // (~4) — "what CAN'T you do?"
  'product-meta-existential',// (~4) — "are you real?"
  'anti-sycophancy',       // (~20) — user states false → gently correct WITHIN the answer
  'destructive-confirm',   // (~20) — delete/send-many/overwrite → insert confirmation turn
  'date-recency',          // (~20) — defer to runtime/search, never date-stale memory
  'handoff-human',         // (~20) — refer to right expert type for high-stakes
  'physical-limit',        // (~15) — honest "I can't perceive what you can't share"
  'conversation-flow',     // (~15) — position-aware (greet first / get-to-it mid / warm bye)
  'parallel-threads',      // (~10) — multiple Qs in one msg → decompose + answer all
  'citation-discipline',   // (~15) — cite for verifiable claims, skip for math/personal
  'aesthetic-defer',       // (~10) — subjective taste → principles + ask for context
  // v5+ final-mile additions (the last 5 honest gaps)
  'multi-party-writing',   // (~10) — "word this for my mom" — audience ≠ user
  'creative-collab',       // (~10) — "what should happen next in my story" — partner, not generator
  'educational-long-arc',  // (~10) — "teach me X in 7 days" — curriculum planning
  'disability-aware',      // (~10) — screen-reader / ADHD / cognitive — adapt formatting
  'acute-crisis',          // (~10) — bereavement / job-loss / breakup — warm, not clinical
] as const;
export type DedicatedCategory = (typeof DEDICATED_CATEGORIES)[number];

/** Per-category allocation counts (Phase 2 of enumerate()). Total ~325. */
export const DEDICATED_ALLOCATIONS: Record<DedicatedCategory, number> = {
  'honest-limit': 60,
  'safety-medical': 10, 'safety-legal': 10, 'safety-financial': 10,
  'safety-mental-health': 10, 'safety-self-harm': 5, 'safety-eating-disorder': 5,
  'safety-substance-use': 5, 'safety-domestic-violence': 5, 'safety-child': 10,
  'safety-conspiracy': 10,
  'product-meta-identity': 4, 'product-meta-privacy': 4, 'product-meta-capability': 4,
  'product-meta-comparison': 4, 'product-meta-trust': 4, 'product-meta-pricing': 4,
  'product-meta-offline': 4, 'product-meta-memory': 4, 'product-meta-limits': 4,
  'product-meta-existential': 4,
  'anti-sycophancy': 20, 'destructive-confirm': 20, 'date-recency': 20,
  'handoff-human': 20, 'physical-limit': 15, 'conversation-flow': 15,
  'parallel-threads': 10, 'citation-discipline': 15, 'aesthetic-defer': 10,
  // v5+ final-mile
  'multi-party-writing': 10, 'creative-collab': 10, 'educational-long-arc': 10,
  'disability-aware': 10, 'acute-crisis': 10,
};

// ── Realistic-combination filters (prune absurd cells before generation) ──────

/** Which surfaces are reasonable for each shape (most shapes route to several). */
const SHAPE_SURFACES: Record<Shape, Surface[]> = {
  fact:         ['search'],
  define:       ['search'],
  explain:      ['search'],
  why:          ['search'],
  howto:        ['search', 'tool', 'chain', 'studio'],
  compare:      ['search'],
  recommend:    ['search'],
  opinion:      ['search', 'chat'],
  list:         ['search'],
  transform:    ['tool', 'chain'],         // edit-the-text-the-user-supplied
  creative:     ['limit', 'tool', 'chat'], // pure creative often = honest limit
  compute:      ['tool'],                  // math / unit / calendar — exact, not search
  chat:         ['chat'],
  decide:       ['search', 'chain'],
  troubleshoot: ['search', 'chain'],
  feasibility:  ['search'],
  recall:       ['chat', 'memory'],        // memory recall routes to memory:* when stored
  plan:         ['search', 'chain'],       // trip/meal/workout planning
  teach:        ['search'],
  critique:     ['chat', 'search'],
  code:         ['search', 'tool'],
  recipe:       ['search'],
  live:         ['search'],                // current prices, scores, weather
  // v2 — meta/in-flight shapes
  'format-mid-flow':  ['chat'],            // pure restyle of last answer, no re-gather
  'preference-set':   ['memory'],          // memory:store
  'ai-correction':    ['search', 'chat'],  // re-search to verify, or accept+update
  'abort':            ['chat'],            // chat acknowledgement, drop in-flight chain
  'meta-question':    ['chat', 'memory'],  // recall prior evidence/sources, or recall-from-memory
  'hypothetical':     ['search', 'chat'],  // search for counterfactual reasoning
  'multi-intent':     ['chain'],           // decompose into sub-goals; almost always chain
  'greeting-task':    ['chat', 'tool', 'chain', 'studio', 'search'], // greeting + any
  // v3 — structural/control shapes
  'conditional':           ['chain', 'search'],  // branch in plan
  'constraint':            ['tool', 'chain', 'search'], // constraint flows into params
  'batch':                 ['chain'],            // multi-target dispatch
  'iterative-refinement':  ['chat', 'tool'],     // refine without re-gather
  'task-decomp-vague':     ['chat', 'chain'],    // propose breakdown
  // v4 — ask-structure shapes
  'implicit-ask':          ['chat', 'search'],   // statement-as-question
  'validation-seek':       ['chat', 'search'],   // user shows content for review
  'advice-seek':           ['chat', 'search'],   // solicits opinion
  'roleplay-request':      ['chat', 'limit'],    // sometimes honest decline
  'product-meta':          ['chat'],             // about the AI itself
  'recovery':              ['chat', 'chain'],    // post-error path
  'anti-sycophancy':       ['search', 'chat'],   // gentle correction
  'expertise-calibrate':   ['search', 'chat'],   // calibrate to persona
  // v5 — high-stakes behavioural shapes
  'handoff-human':         ['chat', 'limit'],    // refer to expert by type
  'destructive-confirm':   ['chain', 'tool'],    // confirm before irreversible
  'physical-limit':        ['chat', 'limit'],    // honest "can't perceive"
  'date-defer':            ['search'],           // defer to live runtime/search
};

/** Modalities that make sense for a shape. Vision shapes pair with image
 *  modalities; pure-text shapes don't need images shoehorned in. */
const SHAPE_MODALITIES: Record<Shape, Modality[]> = {
  fact:         ['text', 'text+image', 'text+url', 'audio-input'],
  define:       ['text', 'audio-input'],
  explain:      ['text', 'text+image', 'text+url'],
  why:          ['text'],
  howto:        ['text', 'text+image', 'text+file', 'audio-input'],
  compare:      ['text', 'text+image', 'multi-image', 'text+url'],
  recommend:    ['text', 'text+image'],
  opinion:      ['text', 'text+image'],
  list:         ['text'],
  transform:    ['text', 'text+file', 'text+url', 'empty-with-file'],
  creative:     ['text'],
  compute:      ['text', 'audio-input'],
  chat:         ['text', 'audio-input'],
  decide:       ['text', 'text+image', 'multi-image'],
  troubleshoot: ['text', 'text+image', 'text+file', 'empty-with-file'],
  feasibility:  ['text', 'text+image'],
  recall:       ['text', 'image-in-history'],
  plan:         ['text', 'audio-input'],
  teach:        ['text'],
  critique:     ['text', 'text+file', 'text+image', 'text+url'],
  code:         ['text', 'text+file'],
  recipe:       ['text', 'text+image', 'text+url'],
  live:         ['text', 'audio-input'],
  // v2 — meta/in-flight shapes (mostly text; format & meta-Q often have no file at all)
  'format-mid-flow':  ['text'],
  'preference-set':   ['text', 'audio-input'],
  'ai-correction':    ['text'],
  'abort':            ['text', 'audio-input'],
  'meta-question':    ['text'],
  'hypothetical':     ['text', 'text+image'],
  'multi-intent':     ['text', 'text+file', 'text+image'],
  'greeting-task':    ['text', 'text+file', 'text+image', 'empty-with-file', 'audio-input'],
  // v3 — structural/control shapes
  'conditional':           ['text', 'text+file'],
  'constraint':            ['text', 'text+file', 'text+image'],
  'batch':                 ['text', 'text+file', 'empty-with-file'],
  'iterative-refinement':  ['text', 'prior-tool-output'],
  'task-decomp-vague':     ['text', 'audio-input'],
  // v4 — ask-structure shapes
  'implicit-ask':          ['text', 'audio-input'],
  'validation-seek':       ['text', 'text+image', 'text+file', 'code-paste'],
  'advice-seek':           ['text'],
  'roleplay-request':      ['text'],
  'product-meta':          ['text', 'audio-input'],
  'recovery':              ['text', 'prior-tool-output'],
  'anti-sycophancy':       ['text'],
  'expertise-calibrate':   ['text', 'text+image'],
  // v5 — high-stakes behavioural shapes
  'handoff-human':         ['text', 'text+image', 'audio-input'],
  'destructive-confirm':   ['text', 'text+file', 'empty-with-file'],
  'physical-limit':        ['text', 'audio-input'],
  'date-defer':            ['text', 'audio-input'],
};

/** Which shapes can take an `outcome` turn (user reports a result of an in-flight
 *  action). v1 only allowed troubleshoot/feasibility — v2 audit extends to any
 *  shape that has a do-it side (tools/chains/studios/transforms can all be
 *  reported on: "that worked", "the file looks wrong", "the translation is
 *  off"). Pure question shapes (define/recall/etc.) don't have outcomes. */
const OUTCOME_SHAPES = new Set<Shape>([
  'troubleshoot', 'feasibility',           // v1
  'howto', 'transform', 'compute',         // v2 — action shapes can be reported on
  'recipe', 'code', 'plan',                // multi-step outputs the user evaluates
  'multi-intent', 'greeting-task',         // any chain-driving shape
  // v3-v5 action shapes that can be reported on
  'conditional', 'constraint', 'batch', 'iterative-refinement',
  'destructive-confirm', 'recovery',
]);

// ── The enumerator ────────────────────────────────────────────────────────────

/**
 * Generate the full balanced spec list. Default target ~1500 specs (the teacher
 * then produces 1 dialogue of 2-5 turns per spec → ~6000-9000 turns). Override
 * with options.budget for smoke/scale tests.
 *
 * Balance rules:
 *   - every (shape × surface) cell that's realistic gets at least 1 spec
 *   - every (shape × turnRoleFocus) gets at least 1 spec
 *   - ~30% modalities involve images, ~25% non-English, otherwise round-robin
 *   - no shape > 12% of specs (cap to prevent fact/define dominating like
 *     writer8's 45% fact imbalance)
 */
/**
 * V5 ENUMERATOR — the 4-phase strategy.
 *
 *   Phase 1 — MANDATORY: every realistic (shape × surface × turnRole) triple
 *             gets one spec. Modality/persona/domain/etc. are SAMPLED.
 *   Phase 2 — DEDICATED CATEGORIES: the 12 high-stakes behavioural classes
 *             (honest-limit, safety-*, product-meta-*, anti-syc, destructive-
 *             confirm, date-recency, handoff-human, physical-limit, conversation-
 *             flow, parallel-threads, citation-discipline, aesthetic-defer)
 *             get fixed allocations totalling ~325 specs. Teacher gets category-
 *             specific guidance at generation time.
 *   Phase 3 — VISION FLOWS: 100 vision-search + 50 vision-edit + 30 vision-skip
 *             + 20 vision-chain. Explicitly trains brain when TO use vision and
 *             when NOT to (vision-skip is critical anti-pattern training).
 *   Phase 4 — VARIETY FILL: remaining budget filled with random persona/domain/
 *             register/cultural combos. Per-shape cap to prevent dominance.
 *
 * All 4 phases write to the SAME flat Spec list. Order is shuffled at the end.
 */
export interface EnumerateOpts { budget?: number; seed?: number }
export function enumerate(opts: EnumerateOpts = {}): Spec[] {
  const budget = opts.budget ?? 1200; // v5 default
  let s = opts.seed ?? 1;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; // deterministic LCG

  const specs: Spec[] = [];
  const shapeCount = new Map<Shape, number>();
  const shapeCap = Math.ceil(budget * 0.08); // tighter cap — many more shapes now

  // ── PHASE 1: mandatory coverage of every realistic (shape × surface × role) ─
  for (const shape of SHAPES) {
    const surfs = SHAPE_SURFACES[shape];
    const mods = SHAPE_MODALITIES[shape];
    for (const surface of surfs) {
      for (const role of TURN_ROLES) {
        if (role === 'outcome' && !OUTCOME_SHAPES.has(shape)) continue;
        if (role === 'chitchat' && shape !== 'chat' && shape !== 'greeting-task') continue;
        specs.push(makeSpec(shape, role, surface, mods, rand, null));
        bump(shapeCount, shape);
      }
    }
  }

  // ── PHASE 1.5: ROLE-BALANCE BOOST (v4 turn-role fix) ──────────────────────
  // v3's only-failing model slot is turn-role (67.6% vs the 82% gate). Phase 1
  // balances the FOCUS role, but Phases 2-3 force new-goal and natural teacher
  // dialogues under-produce the structurally-RARE roles (correction /
  // confirmation / append-step / outcome / mid-chain parameter). Over-sample
  // them here with MULTI-TURN flows so each role is the dialogue's crux and the
  // brain sees enough per-turn examples. Counts are a prior — tune them from the
  // per-role recall the confusion matrix in eval_smolvlm_brain.py now prints,
  // BEFORE the v4 arad run. (Discipline: diagnose → expand the weak class →
  // retrain; never guess-and-pray.)
  const ROLE_BOOST: Partial<Record<TurnRole, number>> = {
    'correction': 35, 'confirmation': 35, 'append-step': 35, 'outcome': 35, 'parameter': 25,
  };
  const MULTI_TURN_FLOWS: Flow[] = ['multi-turn-refine', 'clarify-loop'];
  for (const role of Object.keys(ROLE_BOOST) as TurnRole[]) {
    for (let i = 0; i < (ROLE_BOOST[role] ?? 0); i++) {
      // Pick a shape that naturally hosts this role (outcome → an action shape;
      // the rest → any shape with a do-it / multi-step surface).
      const candidates = role === 'outcome'
        ? [...OUTCOME_SHAPES]
        : SHAPES.filter((sh) => SHAPE_SURFACES[sh].some((su) => su === 'chain' || su === 'tool' || su === 'search'));
      const shape = candidates[Math.floor(rand() * candidates.length)];
      const surfs = SHAPE_SURFACES[shape];
      const surface = surfs[Math.floor(rand() * surfs.length)];
      const spec = makeSpec(shape, role, surface, SHAPE_MODALITIES[shape], rand, null);
      spec.flow = MULTI_TURN_FLOWS[Math.floor(rand() * MULTI_TURN_FLOWS.length)];
      specs.push(spec);
      bump(shapeCount, shape);
    }
  }

  // ── PHASE 2: dedicated-category allocations (the high-stakes classes) ──────
  for (const [cat, count] of Object.entries(DEDICATED_ALLOCATIONS) as [DedicatedCategory, number][]) {
    const shapeForCat = shapeForDedicatedCategory(cat);
    const surfsForCat = SHAPE_SURFACES[shapeForCat];
    const modsForCat = SHAPE_MODALITIES[shapeForCat];
    for (let i = 0; i < count; i++) {
      const surface = surfsForCat[Math.floor(rand() * surfsForCat.length)];
      // Use 'new-goal' as default focus — dedicated categories are about
      // BEHAVIOUR, not turn-structure. Let the teacher pick a natural role.
      const role: TurnRole = 'new-goal';
      specs.push(makeSpec(shapeForCat, role, surface, modsForCat, rand, cat));
      bump(shapeCount, shapeForCat);
    }
  }

  // ── PHASE 3: vision flow dedicated allocations ────────────────────────────
  // Note: these are MARKED via `flow` field (not via dedicatedCategory) so the
  // teacher prompt's flow-specific guidance kicks in for them.
  pushFlowSpecs('vision-search', 100);
  pushFlowSpecs('vision-edit',    50);
  pushFlowSpecs('vision-skip',    30);
  pushFlowSpecs('vision-chain',   20);

  function pushFlowSpecs(flow: Flow, n: number) {
    for (let i = 0; i < n; i++) {
      // vision flows pair with image modalities + variety in everything else
      const shape: Shape = flow === 'vision-skip'
        ? (rand() < 0.5 ? 'transform' : 'howto')           // skip = simple action on image
        : flow === 'vision-edit'
          ? 'transform'                                     // edit = transform with image
          : flow === 'vision-chain'
            ? (rand() < 0.5 ? 'transform' : 'multi-intent')
            : SHAPES[Math.floor(rand() * SHAPES.length)];   // vision-search = anything web-grounded
      const surfs = SHAPE_SURFACES[shape];
      const surface = surfs[Math.floor(rand() * surfs.length)];
      const mods = SHAPE_MODALITIES[shape].filter((m) =>
        m === 'text+image' || m === 'multi-image' || m === 'image-in-history',
      );
      const modality = mods.length ? mods[Math.floor(rand() * mods.length)] : 'text+image';
      const spec = makeSpec(shape, 'new-goal', surface, [modality], rand, null);
      spec.flow = flow;
      specs.push(spec);
      bump(shapeCount, shape);
    }
  }

  // ── PHASE 4: variety fill (random combinations, per-shape cap) ────────────
  while (specs.length < budget) {
    const shape = SHAPES[Math.floor(rand() * SHAPES.length)];
    if ((shapeCount.get(shape) ?? 0) >= shapeCap) continue;
    const surfs = SHAPE_SURFACES[shape];
    const surface = surfs[Math.floor(rand() * surfs.length)];
    const turnRoleFocus = TURN_ROLES[Math.floor(rand() * TURN_ROLES.length)];
    if (turnRoleFocus === 'outcome' && !OUTCOME_SHAPES.has(shape)) continue;
    if (turnRoleFocus === 'chitchat' && shape !== 'chat' && shape !== 'greeting-task') continue;
    const mods = SHAPE_MODALITIES[shape];
    specs.push(makeSpec(shape, turnRoleFocus, surface, mods, rand, null));
    bump(shapeCount, shape);
  }

  // Shuffle so concurrent generation hits varied cells from the start.
  for (let i = specs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [specs[i], specs[j]] = [specs[j], specs[i]];
  }
  // Honor small-budget smokes (clip to head after shuffle so smoke set is varied).
  return budget < specs.length ? specs.slice(0, budget) : specs;
}

/** Build one Spec with all 12 axes sampled from balanced random distributions. */
function makeSpec(
  shape: Shape, role: TurnRole, surface: Surface,
  mods: readonly Modality[], rand: () => number, dedicatedCategory: DedicatedCategory | null,
): Spec {
  return {
    shape, turnRoleFocus: role, surface,
    modality: mods[Math.floor(rand() * mods.length)],
    lang: pickLang(rand),
    edgeProbe: pickEdgeProbe(rand),
    persona: PERSONAS[Math.floor(rand() * PERSONAS.length)],
    domain: DOMAINS[Math.floor(rand() * DOMAINS.length)],
    register: REGISTERS[Math.floor(rand() * REGISTERS.length)],
    cultural: CULTURAL_FRAMES[Math.floor(rand() * CULTURAL_FRAMES.length)],
    flow: 'single',  // default; Phase 3 overrides for vision flows
    toneHint: TONE_HINTS[Math.floor(rand() * TONE_HINTS.length)],
    dedicatedCategory,
  };
}

/** Map a dedicated category to its primary shape — so the spec's `shape` field
 *  still type-validates and the teacher's shape-guidance kicks in correctly. */
function shapeForDedicatedCategory(cat: DedicatedCategory): Shape {
  if (cat === 'honest-limit') return 'creative'; // honest-limit often arises from creative/generative asks
  if (cat.startsWith('safety-')) return 'advice-seek';
  if (cat.startsWith('product-meta-')) return 'product-meta';
  if (cat === 'anti-sycophancy') return 'anti-sycophancy';
  if (cat === 'destructive-confirm') return 'destructive-confirm';
  if (cat === 'date-recency') return 'date-defer';
  if (cat === 'handoff-human') return 'handoff-human';
  if (cat === 'physical-limit') return 'physical-limit';
  if (cat === 'conversation-flow') return 'chat';
  if (cat === 'parallel-threads') return 'multi-intent';
  if (cat === 'citation-discipline') return 'fact';
  if (cat === 'aesthetic-defer') return 'advice-seek';
  // v5+ final-mile
  if (cat === 'multi-party-writing')   return 'transform';      // word something FOR an audience
  if (cat === 'creative-collab')       return 'advice-seek';    // partner in creative process
  if (cat === 'educational-long-arc')  return 'task-decomp-vague'; // 7-day plan = decompose
  if (cat === 'disability-aware')      return 'chat';           // adapt formatting via style
  if (cat === 'acute-crisis')          return 'advice-seek';    // empathy + presence
  return 'chat'; // safe default
}

function bump<K>(m: Map<K, number>, k: K): void { m.set(k, (m.get(k) ?? 0) + 1); }

/** Pick the language axis: 95% English, 5% language-switch (a user turn that
 *  changes `style.lang` — the brain learns the LABEL update, not the language
 *  text; translation shell handles actual rendering). */
function pickLang(rand: () => number): LangAxis {
  return rand() < 0.95 ? 'en' : 'lang-switch';
}

/** Pick an edge-probe perturbation: 85% no probe, 15% spread across the 27 probe
 *  kinds. Robustness training without overwhelming the dataset. */
function pickEdgeProbe(rand: () => number): EdgeProbe {
  if (rand() < 0.85) return null;
  const probes = EDGE_PROBES.filter((p): p is Exclude<EdgeProbe, null> => p !== null);
  return probes[Math.floor(rand() * probes.length)];
}

/** A human-readable spec line for the teacher prompt. Shows every axis so the
 *  teacher knows exactly what to vary. */
export function describeSpec(s: Spec): string {
  const ep = s.edgeProbe ? ` · edgeProbe=${s.edgeProbe}` : '';
  const dc = s.dedicatedCategory ? ` · DEDICATED=${s.dedicatedCategory}` : '';
  const fl = s.flow !== 'single' ? ` · flow=${s.flow}` : '';
  return `shape=${s.shape} · surface=${s.surface} · turnRole=${s.turnRoleFocus} · modality=${s.modality} · lang=${s.lang} · persona=${s.persona} · domain=${s.domain} · register=${s.register} · cultural=${s.cultural} · tone=${s.toneHint}${fl}${ep}${dc}`;
}
