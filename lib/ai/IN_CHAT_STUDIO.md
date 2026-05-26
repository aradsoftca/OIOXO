# oioxo In-Chat Studio — edit media inside the conversation

The big jump: bring **editing into the chat** (like the newest assistants). When a
user uploads an image/video/PDF — or clicks one already in the conversation — they can
edit it right there, by **asking** or by **hand**. This is massive work; this doc is
the design + the honest feasibility line so we build the right things in the right
order.

> We do NOT ship a generative image/video model (too big, off-mission). Instead we
> (a) drive the **300+ media tools we already have** from natural language, (b) give a
> **lightweight manual editor** for anything without a light web solution, and (c)
> **trick** generation by *finding + filtering real media* and *assembling* it.

---

## 1. The two paths (per the owner)

Every edit request resolves to one of two paths — the conductor decides:

1. **ASK → do it** (NL request, when a *light web-based* solution exists): "remove the
   background", "make it black and white", "crop the top", "rotate left", "blur the
   plate", "add this text". → route to the matching tool (we have it), apply to the
   in-chat media, show the result inline, keep it editable (chain more edits).
2. **MANUAL editor** (when there is no light solution, or the user wants control): open
   an in-chat **canvas editor** — a small Photoshop/Premiere — where they crop, draw,
   filter, add text/layers, trim, and **save** back into the chat.

The rule: **if a light client-side solution exists, just do it from the request; else
offer the manual editor (or honestly decline the impossible).** Never pretend.

---

## 2. Feasibility line — light web vs needs-ML (be honest)

| Media | LIGHT (do from request, client-side) | NEEDS ML / heavy → manual editor or decline |
|---|---|---|
| **Image** | crop · resize · rotate · flip · brightness/contrast/saturation · grayscale/sepia · blur/sharpen · invert · color tint · add text/watermark/border · compress · format convert · **remove background** (we have it) · pixelate region | face swap/change · object removal ("remove the 3rd person") · generative fill/expand · detail upscaling · style transfer |
| **Video** | trim/cut · crop · rotate · speed · mute · extract audio/frames · add text/watermark/audio · format convert · **slideshow + Ken-Burns zoom** | generative video · object removal · face edits |
| **PDF** | merge/split · reorder/rotate/delete pages · add page numbers/watermark/text box · extract text/images · compress | re-flow / deep content re-layout |
| **Text** | rewrite/proofread/tone/shorten/expand/format/translate (the writer) | — |

The right-column items are the honest limits — manual editor (user does it by hand) or
"I can't do that automatically." No fake results.

---

## 3. Image "generation" by trick — find → filter → refine

We can't generate, but most "make me an image of X" needs are satisfiable by **finding
real images and letting the user narrow**:

```
"a picture of a red sports car"  → search the net, return a grid of real photos
"the 2nd one but blue"           → re-search / filter to blue, return refined grid
"crop that one to a square"      → now it's an EDIT (path 1) on the chosen image
```

Conversational image-search: gather → present → **refine on the next turn** (carry the
subject + the refinement). It is honest (real photos, cited), and it flows straight into
the editor once a candidate is chosen. (Builds on `image-search.findImages`.)

---

## 4. Video by trick — images + motion, not a model

A genuine "make a video about X" without a video model: **gather/pick images → assemble
a slideshow with pan/zoom (Ken Burns) + transitions + optional caption/voice**. Encode
client-side (ffmpeg.wasm / WebCodecs — already in scope). Plus the manual video editor
(trim/zoom/text) when the user uploads their own clip. Frontier-honest: we *compose*
video from real stills and effects, we don't hallucinate frames.

---

## 5. Build phases (massive — sequence matters)

1. **Image quick-edit inline** (highest value, mostly already have tools): make an
   in-chat image **clickable** → quick-action bar (crop/rotate/bg-remove/filters/text)
   that runs the existing tools and re-renders the result inline; NL request → same
   tools via the conductor. Chain edits. *Reuses the 300+ tools; the new work is the
   inline surface + the click target.*
2. **Manual image editor** — a canvas component (crop, filters, brightness/contrast,
   text/draw layers, undo, save-to-chat) for everything not one-click.
3. **Image-search refine loop** — conversational find→filter→refine; hand a chosen
   image to the editor.
4. **Video** — slideshow+Ken-Burns from images; then the manual video editor
   (trim/zoom/text/audio) via ffmpeg.wasm/WebCodecs.
5. **PDF / text in-chat editing** — page ops + inline text edits.

Each phase: the conductor (BRAIN_PLAN.md §3.5) routes the NL request to a tool or the
editor; the editor saves back into the conversation as a new, re-editable artifact.

---

## 6. Why this fits the mission

- **No big models** — light client-side ops + our existing encrypted tool workers +
  search/assemble tricks. The one trained piece is the *conductor* deciding which path.
- **Private** — editing runs on the user's device; nothing uploaded.
- **Honest** — we do the light things instantly, offer a manual editor for the rest, and
  never fake an ML result we can't produce. (See [[feedback_secret_tech]]: describe the
  function, not the tech.)

Relates to BRAIN_PLAN.md (the conductor routes edit-requests), the existing media tool
registry, and the ffmpeg.wasm/WebCodecs roadmap.
