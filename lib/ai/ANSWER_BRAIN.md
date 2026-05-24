# oioxo Answer Brain — spec

The single source of truth for the oioxo answer system. Both tracks build against
this:

- **Track A — code** (`lib/ai/*`, `lib/oioxo/*`): the deterministic search +
  analyze + conversation machinery. Ships without a GPU.
- **Track B — training** (`scripts/*` on the arad RTX 3070): the tiny specialist
  models distilled from a strong teacher. Same model sizes — better weights.

Status legend: ✅ done · 🟡 in progress · ⬜ todo.

---

## 0. The thesis

Frontier chat models bake *world knowledge* into huge weights, so they go stale
and cost a fortune to run. We do the opposite: **knowledge lives in live search,
features live in tools, and the model only holds timeless SKILL** — understanding,
voice, judgment, and writing. A team of *tiny specialists* (tens of MB each) wrapped
around live search and media beats a frontier model exactly where it is blind:

> **fresh · cited · multimodal · private · genuinely good to talk to.**

We do **not** claim to beat frontier at pure reasoning or long-form creative
generation — those route to tools or to an honest limit.

### "One time train, always useful"

We only ever train the **timeless layer**. Everything volatile is **data**, so it
never forces a retrain.

| Trained ONCE (durable) | Kept as DATA (always fresh) |
|---|---|
| Understanding (intent · shape · what's wanted) | Facts / prices / news → **search** |
| Conversation & persona (how to talk) | Tool list & capabilities → **capability graph** |
| Writing shapes (answer from a brief) | Locale · time · history → **runtime context** |
| When to search vs. talk | Images / videos / maps → **media search** |
| Verification (does the answer follow?) | The user's own files → **the moment** |

Retrain only for a *better voice* or a *new shape* — never for the world changing.
The encoder→graph indirection means **new tools need no retrain**.

---

## 1. The reframe: SHAPE × STYLE

A request varies on two independent axes:

- **Shape** — what the answer must *do*. A small finite set (below).
- **Style** — how it's delivered: length, tone, format, language, persona.

**Style never changes which data you gather — only how you write it up.** So a
million phrasings collapse to a finite set of shapes + write-time parameters. This
is what makes "handle anything" tractable and kills the need for a regex catalog.

### Answer shapes

Each shape = one (search recipe → analyze recipe → write recipe). This is the
*curriculum*, not a runtime `switch`.

| # | Shape | Example | Gather | Analyze | vs frontier |
|---|---|---|---|---|---|
| 1 | **fact** | capital of Japan | 1 query | extract the value | tie (cited) |
| 2 | **define / explain** | what is photosynthesis | 1–2 | condense | tie |
| 3 | **why / causal** | why did Rome fall | facets | connect across sources | tie |
| 4 | **howto / steps** | how to cook rice | 1 | pull ordered steps | tie |
| 5 | **compare / decide** | mazda 3 vs camry | both + head-to-head | weigh, contrast | **win** |
| 6 | **opinion / judge** | is sushi good; rice ok for diabetics | evidence + sentiment | balance → stance | **win** |
| 7 | **recommend / best / rank** | best goal of Ronaldo; best laptop | candidates | rank + reasons | **win** |
| 8 | **live / current** | btc price, scores, weather | live | extract + timestamp | **WIN** |
| 9 | **list / enumerate** | types of X | 1–2 | dedupe items | tie |
| 10 | **transform given text** | summarize this | — | — | tie (trained) |
| 11 | **creative from nothing** | write a poem | — | — | lose → short riffs only |
| 12 | **compute / reason** | math, logic, code | maybe method | — | lose → route to tool |
| 13 | **conversational** | chit-chat, follow-up, emotional | maybe | use history | n/a → persona |

### Style modifiers (write-time parameters, never branches)

length (`tldr`…`detailed`) · format (prose / bullets / table) · register (ELI5 /
casual / formal) · language (any; translate path) · persona override ("like a
pirate"). Default persona is always on (§4).

---

## 2. Conversation is first-class — search is a *move inside* a conversation

A real assistant reads the room every turn and picks a **move**, using the
conversation so far — it does not classify-and-dump.

```
"i want to go back to school"  → MOVE: talk      → warm encouragement, no search
"i need money for school"      → MOVE: offer→search → acknowledge, then look up
                                                      funding where the user is, weave it
```

### The per-turn move policy

Run on **every** message with `{message, history, context}`:

| Move | When | Behaviour |
|---|---|---|
| `talk` | emotional / personal / opinion-about-itself / chit-chat | persona reply, no search |
| `clarify` | underspecified, one missing piece blocks a good answer | ask **one** good question |
| `offer` | a need is implied but not a direct question | acknowledge + proactively offer to look it up (**localize**) |
| `answer` | a real question (shapes 1–9) | full search → analyze → write, in voice |
| `tool` | an action we have a tool/app for | route, conversationally |
| `limit` | out of scope / unsafe | honest, kind (safety gate owns crisis/medical) |

Requirements the old engine lacked:
- **Multi-turn context** — history carries the topic forward ("money for *school*").
- **Proactivity** — offer the search; don't wait to be asked.
- **Localization** — use runtime locale for "in your area"-type needs.

---

## 3. Pipeline

```
ANY request (any style, any language, typos, run-ons) + history + ctx
                          │
   ┌──────────────────────▼───────────────────────┐
   │ TIER-1  ENCODER  (tiny, fast, always-on)      │  trained — replaces regex
   │  → {intent, shape, move, subject, queries[],  │
   │     parts[], media-need, style}               │
   └──────────────────────┬───────────────────────┘
        talk/clarify/offer │ answer            tool/app
        ┌──────────────────┴─────────┐         (capability graph)
        ▼                            ▼
   persona reply              SEARCH (code, the art): read many sources, strip ads
   (writer, no search)        MEDIA  (code): images / video transcripts / widgets
                              ANALYZE (code + rerank head): rank by relevance, pull
                                claims, detect consensus → a tight BRIEF
                                       │ brief + shape + style + persona
                              ┌────────▼─────────┐
                              │ TIER-2  WRITER    │  trained on shapes 1–10 + persona
                              │  good modern answer
                              └────────┬─────────┘
                              NLI VERIFIER: entailed by brief? else cited digest
```

---

## 4. Persona (trained into the writer, every shape)

Voice: **clear · warm · confident-but-humble · lightly witty · always polite.**
Because style is a write-time parameter, the *same* voice rides on a fact, a
comparison, or a pep talk, and still honors explicit style overrides.

- **Creative *delivery*** (a sharp opener, a clean analogy, a charming nudge) is
  trainable and within a 135M's reach — lean into it hard.
- **Creative *generation* from nothing** (a full poem/story) stays weak — short
  riffs only.
- **Humor is calibrated**: light, contextual, and **never** on a serious, grief,
  or medical turn (safety gate guards those first).

---

## 5. Multimodal — show & transcribe, don't "see"

We do **not** ship a vision model (it kills the 90mb story). We train the encoder
to know **when visuals help** and phrase media queries; the media search itself is
code.

- **Images** (`image-search.ts`): "what does X look like", side-by-side for
  comparisons, diagrams for explanations.
- **Video — the frontier-beater**: find a relevant video, **pull its
  transcript/captions (text!), answer from it, cite with a timestamp, embed the
  player.** A text frontier model can't watch a video; we can read what's said.
- **Light data widgets** (code): weather card, price spark-line, map.
- **Honest boundary**: we *show* and *transcribe* media; we don't understand
  pixels — say so when asked.

---

## 6. The team of tiny specialists

| Specialist | Size target | Learns (durable) | Track |
|---|---|---|---|
| **Encoder** (Tier-1) | ~50MB | intent · shape · move · subject · queries · multipart · media-need · style | B |
| **Reranker / claim-extractor** | tiny / head | (question, passage) → relevance + answer span | B (later) |
| **NLI verifier** | tiny | (brief, answer) → entailed? (replaces word-overlap gate) | B (later) |
| **Writer** (Tier-2) | 67–135MB | shapes 1–10 from a brief · persona · short conversational turns · creative delivery · style-conditioning | B |

Everything volatile (facts, tools, locale, media) is **data**, fed at runtime.

---

## 7. Track A — code plan (`lib/ai`, `lib/oioxo`)

1. ⬜ **ANALYZE / brief builder** — `lib/ai/brief.ts`: take gathered passages +
   the question, rerank by relevance, pull answer-bearing sentences, dedupe,
   diversity-cap, group per-entity for compare → a tight `Brief`. Deterministic;
   the rerank head (Track B) slots in later behind the same interface.
2. 🟡 **No-parrot fallback** — when the writer can't compose, present the brief as
   a clean multi-source digest, never a single SERP listing. (started in
   `oioxo-engine.ts`: `digestEvidence` / `cleanPassage`)
3. ⬜ **Conversation move-policy** — `lib/ai/converse.ts`: deterministic floor for
   the per-turn move using `{message, history}`; the encoder (Track B) refines it.
   Thread `history` through `respond()` and `OioxoChat`.
4. ⬜ **Shape + persona-aware synthesis** — writer prompts per shape, persona
   baked into the instruction; degrade gracefully until writer8 lands.
5. ⬜ **Multimodal** — `lib/ai/video.ts`: transcript fetch + cite/embed;
   media-need flag from the encoder/floor; weave into the answer.
6. ⬜ **Personalization ctx** — pass `{locale, tz}` + device KB into the pipeline.

## 8. Track B — training plan (`scripts/*` on arad)

arad: `ssh -i C:/Users/honar/.ssh/id_desktop arad@10.0.0.217`, workdir
`C:\science\brain`, RTX 3070 8GB, cmd.exe remote shell, `PYTHONUTF8=1` for trl.

1. ⬜ **Writer dataset v2** — extend `gen_synth_data.py`: beyond summary/article,
   generate **answer-from-brief** and **decide/compare-from-brief** for shapes
   1–9, plus **short conversational turns**, all in the persona voice, from
   multi-source notes with a synthesized question. Teacher = Qwen2.5-7B-Instruct
   4-bit.
2. ⬜ **Conversation dataset** — multi-turn dialogues exhibiting the
   talk→offer→search-and-weave flow, empathy, persona. Varied, **not** memorized.
3. ⬜ **Encoder dataset + trainer** — `(message, history) → {intent, shape, move,
   subject, queries, parts, media-need, style}`; diverse phrasings per shape.
4. ⬜ **Train + eval** — `train_writer.py` → `writer8`; encoder trainer; judge
   tuned-vs-base on held-out adversarial prompts.
5. ⬜ **Export + serve** — ONNX, quantize to q4 (~67MB) / int8, package for
   transformers.js (`onnx/` + tokenizer), host on R2, verify in-browser.

## 9. Reliability contract (applies to every trained piece)

A deterministic **floor** always produces a usable result with no model; the model
only ever **refines** the floor; junk model output falls back to the floor. So the
cold / WASM / offline path is never worse than today. (Same contract as
`goal.ts`.)
