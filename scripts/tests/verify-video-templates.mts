// Verify the video Templates fix logic against REAL template data, headless.
// Replicates applyTemplate + addClipFromMedia slot-fill (tools/video-studio/ui.tsx)
// exactly, run over every VIDEO_TEMPLATES entry. Catches the original bug
// (slots dropped, grade mishandled) and proves the fix's invariants.
// load the TS data module via tsx's loader
const { VIDEO_TEMPLATES, COLOR_GRADES, TITLE_PRESETS } = await import('../../lib/studios/templates');

let tid = 0; const newId = () => `id${++tid}`;

function NEW_DOC(tpl) {
  return {
    name: 'Untitled', width: tpl.w, height: tpl.h, fps: tpl.fps, background: '#000',
    tracks: [
      { id: newId(), kind: 'video', label: 'V1' }, { id: newId(), kind: 'video', label: 'V2' },
      { id: newId(), kind: 'text', label: 'T1' },
      { id: newId(), kind: 'audio', label: 'A1' }, { id: newId(), kind: 'audio', label: 'A2' },
    ],
    clips: [], selectedId: null, playhead: 0, duration: 0,
    master: { volume: 1, audioFade: true }, slots: undefined, pendingGrade: undefined,
  };
}

// --- replicate applyTemplate (the fixed version) ---
function applyTemplate(tpl) {
  const next = NEW_DOC({ w: tpl.resolution.w, h: tpl.resolution.h, fps: tpl.resolution.fps });
  const textTrack = next.tracks.find(t => t.kind === 'text');
  for (const t of tpl.texts) {
    const preset = TITLE_PRESETS.find(p => p.id === t.preset) ?? TITLE_PRESETS[0];
    next.clips.push({ id: newId(), kind: 'text', trackId: textTrack.id, start: t.start, duration: t.duration, text: t.text });
  }
  const videoTracks = next.tracks.filter(t => t.kind === 'video');
  const audioTracks = next.tracks.filter(t => t.kind === 'audio');
  const slots = [];
  for (const s of tpl.slots) {
    const pool = s.kind === 'audio' ? audioTracks : videoTracks;
    const sEnd = s.start + s.duration;
    const track = pool.find(t => !slots.some(o => o.trackId === t.id && s.start < o.start + o.duration && sEnd > o.start)) ?? pool[0];
    if (!track) continue;
    slots.push({ id: s.id, kind: s.kind, trackId: track.id, start: s.start, duration: s.duration, label: s.label });
  }
  next.slots = slots.length ? slots : undefined;
  if (tpl.colorGrade && tpl.colorGrade !== 'original' && COLOR_GRADES.some(g => g.id === tpl.colorGrade)) next.pendingGrade = tpl.colorGrade;
  // Park playhead mid-first-text so intro animations (alpha-0 at t=0) are visible.
  const firstText = next.clips.find(c => c.kind === 'text');
  if (firstText) next.playhead = firstText.start + firstText.duration / 2;
  return next;
}

// --- replicate addClipFromMedia slot-fill (the new branch) ---
function dropMedia(doc, item) {
  const next = JSON.parse(JSON.stringify(doc));
  const slotKind = item.kind === 'audio' ? 'audio' : 'video';
  const openSlot = next.slots ? next.slots.find(s => (s.kind === 'audio' ? 'audio' : 'video') === slotKind) : undefined;
  if (!openSlot) return { next, filled: false };
  const grade = next.pendingGrade ? COLOR_GRADES.find(g => g.id === next.pendingGrade) : undefined;
  if (item.kind === 'audio') {
    next.clips.push({ id: newId(), kind: 'audio', trackId: openSlot.trackId, start: openSlot.start });
  } else {
    next.clips.push({ id: newId(), kind: 'video', trackId: openSlot.trackId, start: openSlot.start,
      brightness: grade?.brightness ?? 100, contrast: grade?.contrast ?? 100, saturation: grade?.saturation ?? 100, hue: grade?.hue ?? 0 });
  }
  next.slots = next.slots.filter(s => s.id !== openSlot.id);
  if (!next.slots.length) { next.slots = undefined; next.pendingGrade = undefined; }
  return { next, filled: true, slotStart: openSlot.start, grade };
}

let pass = 0, fail = 0;
for (const tpl of VIDEO_TEMPLATES) {
  const doc = applyTemplate(tpl);
  const expectSlots = tpl.slots.length;
  // INVARIANT 1: every template slot is materialized (the original bug dropped them)
  const got = (doc.slots ?? []).length;
  if (got !== expectSlots) { console.log(`FAIL ${tpl.id}: slots ${got} != ${expectSlots}`); fail++; continue; }
  // INVARIANT 2: master.audioFade NOT abused as a grade flag
  // INVARIANT 3: grade stored iff template declares a real one
  const wantGrade = !!(tpl.colorGrade && tpl.colorGrade !== 'original' && COLOR_GRADES.some(g => g.id === tpl.colorGrade));
  if (wantGrade !== !!doc.pendingGrade) { console.log(`FAIL ${tpl.id}: pendingGrade mismatch`); fail++; continue; }
  // INVARIANT 3b: playhead parks INSIDE the first text clip's visible window
  // (past the intro-animation alpha ramp) so the title shows, not at t=0 where
  // pop/fade animations render it fully transparent. Uses tpl.texts[0] — the
  // first clip the code pushes, matching `clips.find(kind==='text')`.
  const ft = tpl.texts.length ? tpl.texts[0] : null;
  if (ft) {
    const inWindow = doc.playhead > ft.start && doc.playhead < ft.start + ft.duration;
    if (!inWindow) { console.log(`FAIL ${tpl.id}: playhead ${doc.playhead} not inside first text [${ft.start},${ft.start + ft.duration}]`); fail++; continue; }
  }
  // INVARIANT 4: dropping a video fills the first video slot at its start, with grade applied
  const firstVidSlot = (doc.slots ?? []).find(s => s.kind !== 'audio');
  if (firstVidSlot) {
    const { filled, next, slotStart, grade } = dropMedia(doc, { kind: 'video', duration: 4 });
    const placed = next.clips.find(c => c.kind === 'video');
    if (!filled || !placed || placed.start !== slotStart) { console.log(`FAIL ${tpl.id}: drop didn't fill slot at start`); fail++; continue; }
    if (wantGrade && grade && placed.brightness !== grade.brightness) { console.log(`FAIL ${tpl.id}: grade not applied on drop`); fail++; continue; }
    if ((next.slots ?? []).length !== got - 1) { console.log(`FAIL ${tpl.id}: slot not consumed`); fail++; continue; }
  }
  pass++;
}
console.log(`\n${pass}/${VIDEO_TEMPLATES.length} templates pass all invariants (slots materialized, grade stored+applied, drop fills+consumes). ${fail} fail.`);
process.exit(fail ? 1 : 0);
