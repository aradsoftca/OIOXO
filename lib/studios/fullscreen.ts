// Single source of truth for which tools are "full app takeover" studios.
//
// These heavy editors (timeline / canvas / multi-panel) should OWN the whole
// viewport like a real desktop app (CapCut, Photopea, Premiere) — no site
// header, strips, or footer pushing the editor down, no marketing scroll
// sharing the screen. Both the route (app/tools/[slug]/page.tsx, which renders
// them in <StudioFrame>) and the global chrome (AppShell, which hides itself
// for these routes) read this list so they can never drift apart.

export const FULLSCREEN_STUDIO_IDS = new Set<string>([
  'video-studio',
  'image-studio',
  'pdf-studio',
  'office-studio',
  'office-docs',
  'office-slides',
  'audio-voice-studio',
  'audio-music-studio',
  'subtitle-studio',
]);

/** True for `/tools/<fullscreen-studio>` paths. */
export function isFullscreenStudioPath(pathname: string): boolean {
  const m = /^\/tools\/([^/?#]+)/.exec(pathname || '');
  return !!m && FULLSCREEN_STUDIO_IDS.has(m[1]);
}
