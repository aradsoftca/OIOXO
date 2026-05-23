# Xonvert AI — Intent & Routing Audit + Plan

_Audit date: 2026-05-22 · Branch: `feat/ai-brain-search-translate` · Scope: `/ai` assistant + homepage panel_

The user's complaint: **"it does not respond like a real AI — unrelated answers, unrelated tools, can not do that, the system is confused and dumb."** This document audits *why*, then proposes a phased fix. The model is **not** the problem; the layers around it are.

---

## 1. How the system decides what to do today

`AiApp.process()` → `routeAndAct()` is a **linear chain of ~20 heuristic gates**, "first match wins":

```
undo/redo → "and send it" chain → [translate retry] →
routeAndAct:
  0.5 what-can-I-do → 1 convert → 1.5 CONVERT_PHRASE → 2 quick-skill →
  2.5 help → 2.6 capability-Q → 2.65 calc/game/time/finance/math →
  2.7 gen(uuid/pw) → 2.71 css → 2.715 seo → 2.72 game-name →
  3 generative(calc/qr/palette/poster/art/svg) → 3.35 contact →
  3.4 doc-QA → 3.45 general-question→web-search → 3.5 recipe →
  3.6 app → 3.7 multi-step plan → 4 tool-routing(323) → late web-search
→ fallback: funReply → chat model
```

Each gate decides **locally** "is this mine?" with its own regex/threshold, acts, and returns. There is **no step that first asks "what does the user actually want?"** Intent is an accident of which gate fires first.

---

## 2. Root causes (architectural, not cosmetic)

### RC-1 — No absolute relevance; routing can't say "none of us"
`retrieval.ts:confidence()` is **purely relative**: top score ≥ 0.15 + margin vs. second place → `confident`. The lexical ranker **always** returns something. So:
- *"can you tell bitcoin price right now?"* → "right now" matches **World Clock** ≥ floor → `confident` → wrong tool.
- *"i need to know best game 2026"* → "game" matches **eDPI Calculator** → wrong tool.

There is no notion of *"does this query relate to any tool's domain at all?"* → the system **cannot decline**.

### RC-2 — No global intent layer
20 independent gates, no shared budget. `CAPABILITY_Q` (`/can you…/`) fires on *"can you tell bitcoin price"* and hijacks it into tool-suggestion before web-search is ever considered. Gates that should be mutually-exclusive aren't coordinated.

### RC-3 — No conversation memory for Q&A
Rich **file** memory exists (`lastFileRef`, undo/redo, `lastJobRef`) but **no `lastTopic`/`lastAnswer`**. So *"tell me more"* → `cleanQuery` strips `"tell me "` → searches the literal word **"more"** → "Richard More." Every question is context-free. This is the #1 reason it doesn't "feel like an AI."

### RC-4 — Non-Latin text is routed before translation
First `routeAndAct` pass runs on the **raw foreign string**. Persian *"convert PDF to Word"* → lexical noise weakly matches `audio-tempo` → "pick an audio file and change the tempo" → returns `true`, so the translate-retry (which would hit `CONVERT_PHRASE` → /convert) **never runs**.

### RC-5 — Weak search query cleaning
*"do you know how ww1 started?"* → no `LEAD` pattern strips `"do you know"`; `ww1` not expanded to "World War I" → Wikipedia `generator=search` matches a noisy article. Bare ambiguous names (*"who is dario"*) return a name-etymology stub instead of disambiguating the likely person.

### RC-6 — Dishonest media generation
*"make image about dario"* → abstract art / "Download SVG." The system claims to "make an image about X" when it can only render abstract patterns. Pretends a capability it lacks.

---

## 3. Decision policy the AI *should* follow

When a request arrives, classify intent, then apply the **first** rule that fits:

| Situation | Behavior |
|---|---|
| Maps to a tool **and** can run inline with the input present | **Do it inline** in chat |
| Maps to a real tool but needs the file / a visual editor | **Open/suggest that tool**, file staged, say why |
| Answerable question (fact via search, definition, math) | **Answer**, cited / shown |
| Chit-chat / persona | **Converse** (model) |
| Answerable from the **open web** (live data, recent events, anything searchable) | **Search + read it** via the tiered engine (§5b), extractive + cited |
| Genuinely unsupported (real photos of a subject, pure opinion with no source) | **Decline honestly + suggest the closest real capability.** Never invent a tool match. |

The missing piece is the **classifier + relevance floor** that selects the right row — today every row collapses into "force a tool or draw something."

### 3b. The general web-answer breakthrough (validated 2026-05-22)

The earlier limit — "a browser can't read the open web because of CORS" — has a clean, fully-browser-side solution: **Jina Reader** (`r.jina.ai`, Apache-2.0, free, anonymous, **CORS-enabled** — verified it reflects `access-control-allow-origin`). Jina fetches any page server-side and hands it back to the browser with CORS headers, defeating CORS for *any* URL — including a search-results page.

- **Search**: `r.jina.ai/https://html.duckduckgo.com/html/?q=<query>` → result links + instant-answer blurb (verified: "who is dario amodei" → correct Anthropic-CEO answer). DuckDuckGo HTML works; Google 429s as a bot, so don't use it.
- **Read**: `r.jina.ai/https://<url>` → clean markdown of any page (incl. **any GitHub repo/file/issue** → "read all GitHub works").
- **No per-topic wiring** — one general search→read→extract flow answers a million conditions.
- **Escape hatch**: Jina Reader is self-hostable (same API) on Iceland — change one hostname, zero code change — if rate limits or independence ever demand it.
- **Honest caveat**: Tier 2 routes the *question text + result URLs* through Jina/DuckDuckGo servers (files never leave). Not the pure on-device privacy of Tier 1, so it's used only when Tier 1 can't answer. Anonymous limit ~20 req/min per user IP (fine per-browser).

---

## 4. Workstreams

### A. Intent gate (the spine) — `lib/ai/intent.ts`
A pure `classifyIntent(text, ctx)` → `task | capability-q | factual-q | follow-up | chitchat | unsupported | ambiguous`, run at the top of `process()`. It **gates** the existing handlers (doesn't replace them), so we keep all working behavior but stop gates from firing on the wrong intent family. Unit-testable in Node.

### B. Relevance floor + honest decline — `retrieval.ts`, `router.ts`, new `lib/ai/decline.ts`
- Add an **absolute** relevance signal (min score + query/tool keyword overlap), separate from the relative margin. Off-domain queries → `weak` → no tool suggestion.
- `decline.ts`: recognize unsupported families (live crypto/stock prices, live news, "best/recommend" opinions, "generate a photo of X") → a smart, honest one-liner **plus** the closest real capability ("I can't fetch live prices — here's the web search / a finance tool").

### C. Conversation memory for Q&A — `AiApp.tsx` + `search.ts`
Track `lastTopic` / `lastAnswerEntity`. Detect follow-ups (*"tell me more", "why", "and?", "what about…", "go on"*, bare pronouns) and continue the **previous topic** (Wikipedia `morelike` / next section / the resolved entity) instead of searching literal words.

### D. Translate-first for non-Latin — `process()`
If `looksNonLatin(text)`, translate to English **before** the first routing pass; never route raw foreign tokens through the lexical ranker. Latin keeps the current English fast-path.

### E. Tiered browser-only answer engine — `search.ts` + new `lib/ai/web-read.ts`
Make the answer engine **general** while staying browser-side, in tiers (stop at the first that answers):
- **Tier 0** — semantic cache (exists): instant, offline.
- **Tier 1** — on-device CORS facts (Wikipedia/Wikidata/Open-Meteo/dictionary, extend): fast, fully private, no third party. Handles the bulk of "who/what/when".
- **Tier 2** — **Jina Reader open-web (NEW)**: `web-read.ts` does search (`r.jina.ai`→DuckDuckGo-HTML, parse links+blurb) → read top results (`r.jina.ai`→markdown) → on-device extractive answer + citations + cache. General; no per-topic code.
- **Tier 3** — honest decline (rare).

Also: stronger `cleanQuery` (strip "do you know / i want to know / can you tell me"), abbreviation expansion (ww1→World War I), disambiguation-first for bare ambiguous names. Self-host escape: swap `r.jina.ai` host for an Iceland-hosted Reader, no code change.

### F. Honest media generation — `ai-magic.ts` / `routeAndAct`
"make an image **of/about** <subject>" → recognize subject-photo intent → offer what we truly do (poster/thumbnail bearing that text, OG image, placeholder, QR), stated honestly. Keep abstract-art only for explicit "abstract/wallpaper/pattern" asks.

---

## 5. Sequencing & validation

1. **B + A** — kills absurd matches; biggest "less dumb" win.
2. **C** — biggest "feels like a real AI" win (conversational follow-ups).
3. **D** — fixes multilingual (small, high-impact).
4. **E** — search quality.
5. **F** — honest media polish.

**Validation (no deploy until green):**
- Extend `lib/ai/eval/corpus.ts` with every failing transcript case + multilingual + "should decline" cases.
- New intent-classification eval set; run `npm run ai:eval`, `ai:verify`, `ai:coverage`.
- Manual browser QA for conversational follow-ups + non-Latin (DOM/translate-bound, not Node-verifiable).

**Risks & mitigations:**
- *Raising the relevance floor may decline things it currently handles* → measure eval corpus before/after; tune threshold against it, don't guess.
- *Follow-up detection could hijack a genuine new query* → require explicit follow-up cues + a short context window; bare topic-words still search fresh.

---

## 6. The 5 transcript bugs → which workstream fixes each

| Transcript failure | Root cause | Fixed by |
|---|---|---|
| "tell me more" → Richard More | RC-3 | C |
| "bitcoin price right now" → World Clock | RC-1, RC-2 | A, B |
| "best game 2026" → eDPI Calculator | RC-1 | B |
| Persian "PDF→Word" → audio tempo | RC-4 | D |
| "do you know how ww1 started" → tank officer | RC-5 | E |
| "make image about dario" → abstract art | RC-6 | F |
| "who is dario" → name etymology | RC-5 | E |
