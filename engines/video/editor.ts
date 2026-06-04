/**
 * Video Studio engine — a multi-clip timeline assembled in ONE ffmpeg pass.
 *
 * Each clip is trimmed, optionally sped up/slowed, scaled+letterboxed to a
 * common frame, then all are concatenated — built as a single filter_complex
 * graph so we never have to persist intermediate files across ffmpeg calls.
 * Browser-side (ffmpeg.wasm), no server.
 */

export interface Clip {
  file: File;
  /** Trim window in seconds. */
  start: number;
  end: number;
  /** Playback speed (0.5–2.0; audio uses atempo which is bounded to that range). */
  speed: number;
  /** Per-clip volume multiplier (1 = unchanged). */
  volume?: number;
  /** Per-clip colour grade (UI scale: brightness/saturation 0–200/300, 100 = normal; contrast 0–200). */
  brightness?: number;
  contrast?: number;
  saturation?: number;
}

export interface ConcatOptions {
  width: number;
  height: number;
  fps?: number;
  /** Drop audio entirely — robust when some clips have no audio track. */
  mute?: boolean;
  /** 'contain' = letterbox (default); 'cover' = fill the frame, cropping overflow. */
  fit?: 'contain' | 'cover';
  /** Optional title overlay (a pre-rendered transparent PNG). */
  titlePng?: Blob;
  /** Title vertical position. */
  titlePos?: 'top' | 'center' | 'bottom';
  /** Optional background-music track mixed under the clips' audio. */
  music?: Blob;
  /** Music level 0..1 (default 0.5). */
  musicVolume?: number;
  /** Crossfade between clips. 'none' (default) keeps the proven concat path. */
  transition?: 'none' | 'fade' | 'slide' | 'wipe';
  /** Crossfade duration in seconds (default 0.5). */
  transDur?: number;
  /** Timed text/image overlays (pre-rendered transparent PNGs) drawn over the timeline. */
  overlays?: { png: Blob; pos: 'top' | 'center' | 'bottom'; start?: number; end?: number }[];
  /** Fade the final audio in at the start and out at the end. */
  audioFade?: boolean;
  onProgress?: (r: number) => void;
}

/** Clamp atempo to ffmpeg's supported 0.5–2.0 (chainable, but we keep it simple). */
function tempo(speed: number): number {
  return Math.min(2, Math.max(0.5, speed || 1));
}

export async function concatClips(clips: Clip[], opts: ConcatOptions): Promise<Blob> {
  const { runFfmpegMulti, extOf } = await import('@/engines/ffmpeg');
  const usable = clips.filter((c) => c.end > c.start);
  if (!usable.length) throw new Error('Add at least one clip with a trim range.');

  const W = opts.width % 2 ? opts.width - 1 : opts.width;
  const H = opts.height % 2 ? opts.height - 1 : opts.height;
  const fps = opts.fps ?? 30;
  const mute = !!opts.mute;
  const scaleVf = opts.fit === 'cover'
    ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`;

  const inputs: { name: string; data: Blob }[] = usable.map((c, i) => ({ name: `c${i}.${extOf(c.file.name) || 'mp4'}`, data: c.file }));
  if (opts.titlePng) inputs.push({ name: 'title.png', data: opts.titlePng });
  (opts.overlays ?? []).forEach((o, k) => inputs.push({ name: `ov${k}.png`, data: o.png }));
  if (opts.music) inputs.push({ name: 'music.mp3', data: opts.music });

  const args = (names: string[], o: string): string[] => {
    const parts: string[] = [];
    const n = usable.length;
    const td = Math.max(0.2, opts.transDur ?? 0.5);
    const useX = !!opts.transition && opts.transition !== 'none' && n > 1;
    const xtype = opts.transition === 'slide' ? 'slideleft' : opts.transition === 'wipe' ? 'wiperight' : 'fade';
    const durs: number[] = [];

    usable.forEach((c, i) => {
      const sp = c.speed || 1;
      const vpts = (1 / sp).toFixed(4);
      durs.push((c.end - c.start) / sp);
      const eb = ((c.brightness ?? 100) - 100) / 100, ec = (c.contrast ?? 100) / 100, es = (c.saturation ?? 100) / 100;
      const eq = (eb !== 0 || ec !== 1 || es !== 1) ? `,eq=brightness=${eb.toFixed(2)}:contrast=${ec.toFixed(2)}:saturation=${es.toFixed(2)}` : '';
      // video: trim → reset PTS → speed → scale to common frame → grade → fps
      parts.push(
        `[${i}:v]trim=start=${c.start.toFixed(2)}:end=${c.end.toFixed(2)},setpts=(PTS-STARTPTS)*${vpts},` +
        `${scaleVf}${eq},setsar=1,fps=${fps},format=yuv420p[v${i}]`,
      );
      if (!mute) {
        parts.push(
          `[${i}:a]atrim=start=${c.start.toFixed(2)}:end=${c.end.toFixed(2)},asetpts=PTS-STARTPTS,atempo=${tempo(sp).toFixed(3)},volume=${(c.volume ?? 1).toFixed(2)},aresample=44100[a${i}]`,
        );
      }
    });

    // ---- assemble the timeline: crossfade chain (xfade) or straight concat ----
    let vlabel: string;
    let alabel: string | null = null;
    if (useX) {
      let acc = '[v0]'; let accDur = durs[0];
      for (let i = 1; i < n; i++) {
        const off = Math.max(0, accDur - td).toFixed(3);
        parts.push(`${acc}[v${i}]xfade=transition=${xtype}:duration=${td}:offset=${off}[vx${i}]`);
        acc = `[vx${i}]`; accDur = accDur + durs[i] - td;
      }
      vlabel = acc;
      if (!mute) {
        let aacc = '[a0]';
        for (let i = 1; i < n; i++) { parts.push(`${aacc}[a${i}]acrossfade=d=${td}[ax${i}]`); aacc = `[ax${i}]`; }
        alabel = aacc;
      }
    } else {
      const labels: string[] = [];
      for (let i = 0; i < n; i++) labels.push(`[v${i}]${mute ? '' : `[a${i}]`}`);
      parts.push(`${labels.join('')}concat=n=${n}:v=1:a=${mute ? 0 : 1}${mute ? '[vc]' : '[vc][ac]'}`);
      vlabel = '[vc]'; if (!mute) alabel = '[ac]';
    }

    // ---- title overlay ----
    let vmap = vlabel;
    if (opts.titlePng) {
      const y = opts.titlePos === 'center' ? '(H-h)/2' : opts.titlePos === 'bottom' ? 'H-h-H*0.06' : 'H*0.06';
      parts.push(`${vlabel}[${n}:v]overlay=(W-w)/2:${y}[vtitle]`); vmap = '[vtitle]';
    }

    // ---- timed caption / image overlays ----
    const ovBase = n + (opts.titlePng ? 1 : 0);
    (opts.overlays ?? []).forEach((o, k) => {
      const y = o.pos === 'center' ? '(H-h)/2' : o.pos === 'bottom' ? 'H-h-H*0.06' : 'H*0.06';
      const en = (o.start != null || o.end != null) ? `:enable='between(t,${(o.start ?? 0).toFixed(2)},${(o.end ?? 1e7).toFixed(2)})'` : '';
      parts.push(`${vmap}[${ovBase + k}:v]overlay=(W-w)/2:${y}${en}[vov${k}]`); vmap = `[vov${k}]`;
    });

    // ---- background music + audio fade ----
    const musicIdx = ovBase + (opts.overlays?.length ?? 0);
    let amap: string | null = mute ? null : alabel;
    let shortest = false;
    if (opts.music) {
      const mv = (opts.musicVolume ?? 0.5).toFixed(2);
      if (!amap) { parts.push(`[${musicIdx}:a]volume=${mv}[amus]`); amap = '[amus]'; shortest = true; }
      else { parts.push(`[${musicIdx}:a]volume=${mv}[mus]`); parts.push(`${amap}[mus]amix=inputs=2:duration=first:dropout_transition=0[amix]`); amap = '[amix]'; }
    }
    if (opts.audioFade && amap) {
      const total = durs.reduce((a, b) => a + b, 0) - (useX ? (n - 1) * td : 0);
      const st = Math.max(0, total - 0.6).toFixed(2);
      parts.push(`${amap}afade=t=in:st=0:d=0.5,afade=t=out:st=${st}:d=0.6[afd]`); amap = '[afd]';
    }

    return [
      ...names.flatMap((nm) => ['-i', nm]),
      '-filter_complex', parts.join(';'),
      '-map', vmap, ...(amap ? ['-map', amap] : []),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
      ...(amap ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an']),
      ...(shortest ? ['-shortest'] : []),
      '-movflags', '+faststart', o,
    ];
  };

  return runFfmpegMulti({ inputs, outputName: 'out.mp4', args, mimeType: 'video/mp4', onProgress: opts.onProgress });
}
