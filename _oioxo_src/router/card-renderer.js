/**
 * oioxo card renderer — given a resolved intent + catalog tool, returns the
 * HTML for the result card. Picks the right inline UX based on inputType:
 *
 *   file  — drop-zone + file picker → handoff via sessionStorage → tool page
 *   text  — textarea + "Process in tool →"
 *   url   — URL input + "Process URL →"
 *   none  — just metadata + deep-link
 *
 * Special-cases:
 *   apps         — app-card style with icon + tagline
 *   conversion   — format-pair chips (from → to), file drop zone
 *   studio       — visual placeholder + file drop
 *   specific     — preserves the migrated provider behavior
 *
 * Attaches as window.oioxoCardRenderer = { render({ intent, catalog, esc }) }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoCardRenderer) return;

  const DEFAULT_ESC = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // ---- handoff (file pre-fill) --------------------------------------

  // Generate a unique handoff id. The card stores the dropped file in
  // sessionStorage under this id (as { name, type, size, dataUrl, params }),
  // then redirects to the tool page with ?oioxoHandoff=<id>.
  function handoffId(){
    return 'oh' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function installHandoffHandler(){
    if (window.__oioxoHandoffWired) return;
    window.__oioxoHandoffWired = true;
    // Clean stale entries on first install so accumulated cruft from earlier
    // sessions doesn't trip the quota on the first handoff.
    cleanStaleHandoffs();
    document.addEventListener('change', (e) => {
      const tgt = e.target;
      if (!tgt || !tgt.dataset || !tgt.dataset.oioxoHandoff) return;
      const url = tgt.dataset.oioxoHandoff;
      let params = {}; try { params = tgt.dataset.oioxoParams ? JSON.parse(tgt.dataset.oioxoParams) : {}; } catch {}
      const file = tgt.files && tgt.files[0];
      if (!file) return;
      const zone = tgt.closest('[data-oioxo-dropzone]');
      handoffAndGo(file, url, params, zone || tgt.parentElement);
    });
    document.addEventListener('dragover', (e) => {
      const zone = e.target.closest && e.target.closest('[data-oioxo-dropzone]');
      if (!zone) return;
      e.preventDefault();
      zone.classList.add('oioxo-dragover');
      zone.setAttribute('aria-dropeffect', 'copy');
    });
    document.addEventListener('dragleave', (e) => {
      const zone = e.target.closest && e.target.closest('[data-oioxo-dropzone]');
      if (zone) { zone.classList.remove('oioxo-dragover'); zone.removeAttribute('aria-dropeffect'); }
    });
    document.addEventListener('drop', (e) => {
      const zone = e.target.closest && e.target.closest('[data-oioxo-dropzone]');
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove('oioxo-dragover');
      zone.removeAttribute('aria-dropeffect');
      const url = zone.dataset.oioxoDropzone;
      let params = {}; try { params = zone.dataset.oioxoParams ? JSON.parse(zone.dataset.oioxoParams) : {}; } catch {}
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handoffAndGo(file, url, params, zone);
    });
    // Keyboard: allow Enter / Space on a focused dropzone to open the
    // hidden file picker, matching native button affordance.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const zone = e.target.closest && e.target.closest('[data-oioxo-dropzone]');
      if (!zone) return;
      const input = zone.querySelector('input[type="file"]');
      if (!input) return;
      e.preventDefault();
      input.click();
    });
  }

  // Validation knobs for handoff. data URLs in sessionStorage are subject to
  // browser quotas (~5MB on most engines); be conservative here so a too-big
  // file is rejected up front instead of failing mid-encode.
  const HANDOFF_MAX_BYTES = 4_000_000; // 4 MB after base64 encoding overhead
  const HANDOFF_STALE_MS  = 30 * 60 * 1000; // 30 min

  /** Remove any oioxo-handoff-* entries older than HANDOFF_STALE_MS so heavy
   *  use of the search engine doesn't fill up sessionStorage. */
  function cleanStaleHandoffs(){
    try {
      const cutoff = Date.now() - HANDOFF_STALE_MS;
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith('oioxo-handoff-')) keys.push(k);
      }
      for (const k of keys) {
        try {
          const j = JSON.parse(sessionStorage.getItem(k));
          if (j && (!j.ts || j.ts < cutoff)) sessionStorage.removeItem(k);
        } catch {
          sessionStorage.removeItem(k);
        }
      }
    } catch {}
  }

  function showInlineError(targetEl, message){
    if (!targetEl) return;
    let err = targetEl.querySelector('.oioxo-handoff-err');
    if (!err) {
      err = document.createElement('div');
      err.className = 'oioxo-handoff-err';
      err.setAttribute('role', 'alert');
      err.style.cssText = 'margin-top:6px;padding:6px 9px;font-size:11px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:4px';
      targetEl.appendChild(err);
    }
    err.textContent = message;
    setTimeout(() => { try { err.remove(); } catch {} }, 4000);
  }

  function handoffAndGo(file, toolUrl, params, targetEl){
    if (!file || typeof file !== 'object'){
      showInlineError(targetEl, 'No file received.'); return;
    }
    if (file.size > HANDOFF_MAX_BYTES){
      showInlineError(targetEl, 'File too large for inline preview (max ' + Math.round(HANDOFF_MAX_BYTES/1e6) + ' MB). Open the full tool to upload it there.');
      return;
    }
    cleanStaleHandoffs();
    const id = handoffId();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        sessionStorage.setItem('oioxo-handoff-' + id, JSON.stringify({
          name: file.name, type: file.type, size: file.size,
          dataUrl: reader.result, params,
          ts: Date.now(),
        }));
      } catch (e) {
        showInlineError(targetEl, 'Could not stash the file (browser storage full?). Try opening the full tool directly.');
        return;
      }
      const qs = new URLSearchParams(Object.assign({ oioxoHandoff: id }, params));
      window.location.href = toolUrl + (toolUrl.indexOf('?') >= 0 ? '&' : '?') + qs.toString();
    };
    reader.onerror = () => showInlineError(targetEl, 'Failed to read the file.');
    reader.readAsDataURL(file);
  }

  // ---- card pieces --------------------------------------------------

  function chipBadge(label){
    return `<span style="font-size:9px;background:var(--accent);color:var(--ink);padding:2px 7px;border-radius:8px;font-weight:700">${label}</span>`;
  }

  /** Render a small confidence chip — "Best match" (≥0.9) / "Likely" (≥0.75) /
   *  "Possibly" (<0.75). Surfaces uncertainty to the user instead of hiding it. */
  function confidenceChip(c){
    if (typeof c !== 'number') return '';
    if (c >= 0.95) return `<span style="font-size:9px;color:#16a34a;font-weight:700;letter-spacing:.3px">● BEST MATCH</span>`;
    if (c >= 0.85) return `<span style="font-size:9px;color:#65a30d;font-weight:700;letter-spacing:.3px">● LIKELY</span>`;
    if (c >= 0.70) return `<span style="font-size:9px;color:#ca8a04;font-weight:700;letter-spacing:.3px">● PROBABLE</span>`;
    return `<span style="font-size:9px;color:#a16207;font-weight:700;letter-spacing:.3px">● POSSIBLY</span>`;
  }

  /** "Did you mean: A · B · C?" row built from `intent.alternatives`. */
  function alternativesRow(alts, origin){
    if (!Array.isArray(alts) || !alts.length) return '';
    const links = alts.slice(0, 3).map((a) =>
      `<a href="${origin}${DEFAULT_ESC(a.url)}" target="_blank" rel="noopener" style="color:var(--muted);text-decoration:underline">${DEFAULT_ESC(a.name)}</a>`
    ).join(' · ');
    return `<div style="margin-top:8px;font-size:10px;color:var(--muted)">Did you mean: ${links}</div>`;
  }

  function openButton(url, label){
    return `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:7px 14px;font-size:12px;font-weight:700;background:var(--ink);color:var(--bg);border-radius:4px;text-decoration:none">${label || 'Open full tool →'}</a>`;
  }

  function fileDropZone(toolUrl, params, accept, hint){
    const acceptAttr = accept ? ' accept="' + accept + '"' : '';
    const paramsJson = JSON.stringify(params || {}).replace(/"/g, '&quot;');
    return `<label data-oioxo-dropzone="${toolUrl}" data-oioxo-params="${paramsJson}" role="button" tabindex="0" aria-label="Upload a file to open the tool with it pre-loaded" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:18px 16px;border:2px dashed var(--border);border-radius:8px;background:var(--surface);cursor:pointer;text-align:center;margin:8px 0;transition:border-color .15s,background .15s,box-shadow .15s;outline:none;position:relative">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--ink)">Drop a file or click to upload</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${hint || 'Opens the tool with your file pre-loaded'}</div>
      </div>
      <input type="file" data-oioxo-handoff="${toolUrl}" data-oioxo-params="${paramsJson}"${acceptAttr} aria-hidden="true" tabindex="-1" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none">
    </label>`;
  }

  function dragoverStyle(){
    if (window.__oioxoHandoffStyle) return '';
    window.__oioxoHandoffStyle = true;
    return `<style>
.oioxo-dragover{border-color:var(--accent)!important;background:rgba(226,178,74,.08)!important;box-shadow:0 0 0 3px rgba(226,178,74,.18)}
[data-oioxo-dropzone]:focus-visible{border-color:var(--accent)!important;box-shadow:0 0 0 3px rgba(226,178,74,.24)}
</style>`;
  }

  // ---- intent-specific renderers ------------------------------------

  function renderApp(intent, esc){
    const t = intent.tool;
    const link = 'https://oioxo.com' + t.url;
    return `${dragoverStyle()}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">${esc(intent.icon || t.icon || '✦')} ${esc(t.name)}</span>
      ${chipBadge('OIOXO APP')}
      ${confidenceChip(intent.confidence)}
    </div>
    <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:10px">
      <div style="font-size:48px;line-height:1;flex-shrink:0" aria-hidden="true">${esc(t.icon || '✦')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:16px;font-weight:800;color:var(--ink);line-height:1.2">${esc(t.name)}</div>
        ${t.description ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;line-height:1.4">${esc(t.description)}</div>` : ''}
      </div>
    </div>
    <a href="${esc(link)}" target="_blank" rel="noopener" aria-label="Open ${esc(t.name)} app" style="display:inline-block;padding:8px 18px;font-size:13px;font-weight:700;background:var(--accent);color:var(--ink);border-radius:5px;text-decoration:none">Open ${esc(t.name)} →</a>
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Lives at oioxo.com${esc(t.url)}</div>`;
  }

  function renderStudio(intent, esc){
    const t = intent.tool;
    const origin = 'https://oioxo.com';
    const link = origin + t.url;
    return `${dragoverStyle()}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">🎨 ${esc(t.name)} studio</span>
      ${chipBadge('OIOXO STUDIO')}
      ${confidenceChip(intent.confidence)}
    </div>
    ${intent.summary ? `<div style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:10px">${esc(intent.summary)}</div>` : ''}
    ${fileDropZone(link, {}, '', 'Drop a starting image, or open the studio fresh')}
    ${openButton(link, 'Open ' + t.name + ' studio →')}
    ${alternativesRow(intent.alternatives, origin)}
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">oioxo.com${esc(t.url)}</div>`;
  }

  function renderConversion(intent, esc){
    const t = intent.tool;
    const origin = 'https://oioxo.com';
    const link = origin + t.url;
    const from = (intent.formatIn || '').toUpperCase();
    const to = (intent.formatOut || '').toUpperCase();
    const group = intent.formatGroup;
    const accept = group ? ('.' + (intent.formatIn || '')) : '';
    const params = { from: intent.formatIn || '', to: intent.formatOut || '' };
    const isFallback = intent.kind === 'conversion-fallback';
    return `${dragoverStyle()}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">${esc(intent.icon || '↔')} ${esc(from)} → ${esc(to)}</span>
      ${chipBadge(isFallback ? 'CLOSEST MATCH' : 'OIOXO CONVERT')}
      ${confidenceChip(intent.confidence)}
    </div>
    ${isFallback ? `<div style="font-size:12px;color:var(--muted);margin-bottom:8px">${esc(intent.summary || ('No exact ' + from + '→' + to + ' tool — these are the closest related tools we have.'))}</div>` : ''}
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
      <span style="display:inline-block;padding:6px 14px;background:var(--surface);border-radius:6px;font-weight:800;font-size:14px;color:var(--ink)">${esc(from)}</span>
      <span style="color:var(--muted);font-size:18px" aria-hidden="true">→</span>
      <span style="display:inline-block;padding:6px 14px;background:var(--accent);border-radius:6px;font-weight:800;font-size:14px;color:var(--ink)">${esc(to)}</span>
      <span style="font-size:11px;color:var(--muted);margin-left:auto">${esc(t.name)}</span>
    </div>
    ${isFallback ? '' : fileDropZone(link, params, accept, 'Drop a ' + esc(from) + ' file to convert')}
    ${openButton(link + '?from=' + encodeURIComponent(intent.formatIn || '') + '&to=' + encodeURIComponent(intent.formatOut || ''))}
    ${alternativesRow(intent.alternatives, origin)}
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">${isFallback ? 'Approximate match · open the tool to confirm it fits your job' : 'Same engine as oioxo.com' + esc(t.url)}</div>`;
  }

  function renderOperation(intent, esc){
    const t = intent.tool;
    const origin = 'https://oioxo.com';
    const link = origin + t.url;
    return `${dragoverStyle()}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">${esc(intent.icon || '🛠')} ${esc(intent.title)}</span>
      ${chipBadge('OIOXO TOOL')}
      ${confidenceChip(intent.confidence)}
    </div>
    <div style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:8px"><b>${esc(t.name)}</b>${intent.verb ? ' ' + esc(intent.verb) + 's your ' + esc(intent.target) : ''}. Drop a file below to open the tool with it pre-loaded.</div>
    ${fileDropZone(link, {}, '', 'Drop your ' + esc(intent.target || 'file'))}
    ${openButton(link)}
    ${alternativesRow(intent.alternatives, origin)}
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Same engine as oioxo.com${esc(t.url)}</div>`;
  }

  function renderText(intent, esc){
    const t = intent.tool;
    const origin = 'https://oioxo.com';
    const link = origin + t.url;
    return `${dragoverStyle()}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">${esc(intent.icon || '◆')} ${esc(intent.title || t.name)}</span>
      ${chipBadge('OIOXO TOOL')}
      ${confidenceChip(intent.confidence)}
    </div>
    ${intent.summary ? `<div style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:8px">${esc(intent.summary)}</div>` : `<div style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:8px">${esc(t.name)} — paste text in the tool to process.</div>`}
    ${openButton(link)}
    ${alternativesRow(intent.alternatives, origin)}
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Lives at oioxo.com${esc(t.url)}</div>`;
  }

  function renderUrl(intent, esc){
    const t = intent.tool;
    const origin = 'https://oioxo.com';
    const link = origin + t.url;
    return `${dragoverStyle()}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">${esc(intent.icon || '🔗')} ${esc(intent.title || t.name)}</span>
      ${chipBadge('OIOXO TOOL')}
      ${confidenceChip(intent.confidence)}
    </div>
    <div style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:8px">${esc(t.name)} — provide a URL in the tool.</div>
    ${openButton(link)}
    ${alternativesRow(intent.alternatives, origin)}
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Lives at oioxo.com${esc(t.url)}</div>`;
  }

  function renderNone(intent, esc){
    const t = intent.tool;
    const origin = 'https://oioxo.com';
    const link = origin + t.url;
    return `${dragoverStyle()}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">${esc(intent.icon || '◆')} ${esc(intent.title || t.name)}</span>
      ${chipBadge('OIOXO TOOL')}
      ${confidenceChip(intent.confidence)}
    </div>
    <div style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:10px">${esc(intent.summary || (t.name + ' — open the full tool to run.'))}</div>
    ${openButton(link)}
    ${alternativesRow(intent.alternatives, origin)}
    <div style="margin-top:6px;font-size:10px;color:var(--muted)">Lives at oioxo.com${esc(t.url)}</div>`;
  }

  // ---- instant-answer renderers (round-5 card kinds) ----------------

  /** Compute / time / finance / definition / news / translate / world-clock /
   *  disambiguation / ai-answer — all share a "no tool object, just inline
   *  data" shape. We render the formatted value front-and-centre with the
   *  citation source on its own line. */
  function renderInstantAnswer(intent, esc, lang){
    const icon = esc(intent.icon || '◆');
    const title = esc(intent.title || intent.kind);

    // Body varies by kind.
    let body = '';
    if (intent.kind === 'compute-math' || intent.kind === 'compute-units' ||
        intent.kind === 'compute-currency' || intent.kind === 'compute-date'){
      const value = intent.formatted != null ? intent.formatted : intent.result;
      body = `<div style="font-size:28px;font-weight:600;line-height:1.2;color:var(--ink);margin-bottom:6px">${esc(value)}</div>`;
    } else if (intent.kind === 'time'){
      body = `<div style="font-size:22px;font-weight:600;line-height:1.2;color:var(--ink);margin-bottom:6px">${esc(intent.formatted)}</div>`;
      if (intent.offset) body += `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">${esc(intent.offset)} · ${esc(intent.tz || '')}</div>`;
    } else if (intent.kind === 'world-clock'){
      const rows = (intent.zones || []).map((z) => `<tr><td style="padding:2px 8px 2px 0;font-size:11px;color:var(--muted)">${esc(z.tz)}</td><td style="padding:2px 0;font-size:13px;color:var(--ink)">${esc(z.formatted)}</td></tr>`).join('');
      body = `<table style="border-collapse:collapse;font-size:13px;margin-bottom:6px">${rows}</table>`;
    } else if (intent.kind === 'definition'){
      const senses = (intent.senses || []).map((s) => `<div style="margin-bottom:6px"><span style="font-size:11px;color:var(--muted);font-style:italic">${esc(s.partOfSpeech || '')}</span><ul style="margin:4px 0 0 18px;padding:0">${(s.definitions || []).map((d) => `<li style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:2px">${esc(d.text)}</li>`).join('')}</ul></div>`).join('');
      body = senses;
    } else if (intent.kind === 'translate'){
      body = `<div style="font-size:18px;font-weight:500;line-height:1.3;color:var(--ink);margin-bottom:4px">${esc(intent.formatted)}</div><div style="font-size:11px;color:var(--muted);margin-bottom:6px">${esc(intent.sourceText)} → ${esc(intent.targetName || intent.targetLang)}</div>`;
    } else if (intent.kind === 'finance'){
      const change = intent.change24h != null
        ? `<span style="color:${intent.change24h >= 0 ? 'var(--ok,#5d6)' : 'var(--err,#e66)'}">${intent.change24h >= 0 ? '+' : ''}${(intent.change24h).toFixed(2)}%</span>`
        : '';
      body = `<div style="font-size:24px;font-weight:600;line-height:1.2;color:var(--ink);margin-bottom:4px">${esc(intent.formatted)} ${change}</div><div style="font-size:11px;color:var(--muted);margin-bottom:6px">${esc(intent.summary || '')}</div>`;
    } else if (intent.kind === 'news'){
      const headlines = (intent.headlines || []).slice(0, 5).map((h) => `<li style="font-size:13px;line-height:1.4;margin-bottom:6px"><a href="${esc(h.url || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--ink);text-decoration:none">${esc(h.title)}</a> <span style="font-size:10px;color:var(--muted)">${esc(h.source)}</span></li>`).join('');
      body = `<ul style="margin:0 0 6px;padding:0 0 0 18px">${headlines}</ul>`;
    } else if (intent.kind === 'ai-answer'){
      body = `<div style="font-size:13px;line-height:1.6;color:var(--ink);margin-bottom:6px">${esc(intent.answer)}</div>`;
      if (intent.citations && intent.citations.length){
        const cites = intent.citations.map((c) => `<a href="${esc(c.url || '#')}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--muted);text-decoration:none;margin-right:8px">[${c.n}] ${esc(c.source || '')}</a>`).join('');
        body += `<div style="margin-top:4px">${cites}</div>`;
      }
    } else if (intent.kind === 'disambiguation'){
      const senses = (intent.senses || []).map((s) => `<li style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:4px"><strong>${esc(s.label)}</strong>${s.examples ? ` — ${s.examples.map((e) => esc(e.name)).join(', ')}` : ''}</li>`).join('');
      body = `<ul style="margin:0 0 6px;padding:0 0 0 18px">${senses}</ul>`;
    } else if (intent.kind === 'fact'){
      const thumb = intent.thumbnail ? `<img src="${esc(intent.thumbnail)}" alt="" style="float:right;max-width:96px;max-height:96px;margin:0 0 6px 8px;border-radius:4px">` : '';
      const sub = intent.subtitle ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px;font-style:italic">${esc(intent.subtitle)}</div>` : '';
      body = `${thumb}${sub}<div style="font-size:13px;line-height:1.55;color:var(--ink);margin-bottom:6px">${esc(intent.formatted)}</div><div style="clear:both"></div>`;
    } else if (intent.kind === 'numparse'){
      let preview = '';
      if (intent.colorPreview){
        preview = `<span style="display:inline-block;width:24px;height:24px;border-radius:4px;background:${esc(intent.colorPreview)};border:1px solid var(--muted);vertical-align:middle;margin-right:8px"></span>`;
      }
      body = `<div style="font-size:18px;font-weight:500;line-height:1.3;color:var(--ink);margin-bottom:4px">${preview}<code style="font-family:monospace;font-size:16px">${esc(intent.formatted)}</code></div><div style="font-size:11px;color:var(--muted);margin-bottom:6px">${esc(intent.summary || '')}</div>`;
    } else if (intent.kind === 'search'){
      body = `<div style="font-size:13px;line-height:1.55;color:var(--muted);margin-bottom:6px;font-style:italic">${esc(intent.summary || 'No exact tool match — see web results below.')}</div>`;
    } else if (intent.kind === 'images'){
      const tiles = (intent.images || []).slice(0, 6).map((im) => `<a href="${esc(im.page)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 4px 4px 0;text-decoration:none"><img src="${esc(im.thumb)}" alt="${esc(im.title)}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid var(--muted)"></a>`).join('');
      body = `<div style="margin-bottom:6px">${tiles}</div>`;
    } else if (intent.kind === 'map'){
      const coord = `<code style="font-family:monospace;font-size:11px;color:var(--muted)">${esc(intent.formatted)}</code>`;
      const embed = intent.embedUrl ? `<div style="margin-bottom:6px"><iframe src="${esc(intent.embedUrl)}" style="width:100%;max-width:480px;height:200px;border:1px solid var(--muted);border-radius:4px" loading="lazy"></iframe></div>` : '';
      const sub = intent.subtitle ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">${esc(intent.subtitle)}</div>` : '';
      body = `${sub}${embed}${coord}`;
    } else if (intent.kind === 'books'){
      const items = (intent.books || []).map((b) => `<li style="font-size:13px;margin-bottom:6px"><a href="${esc(b.page)}" target="_blank" rel="noopener noreferrer" style="color:var(--ink);text-decoration:none"><strong>${esc(b.title)}</strong></a>${b.authors && b.authors.length ? ' — ' + esc(b.authors.slice(0,2).join(', ')) : ''}${b.year ? ' (' + b.year + ')' : ''}</li>`).join('');
      body = `<ul style="margin:0 0 6px;padding:0 0 0 18px">${items}</ul>`;
    } else if (intent.kind === 'academic'){
      const items = (intent.papers || []).map((p) => `<li style="font-size:13px;line-height:1.4;margin-bottom:8px"><a href="${esc(p.url || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--ink);text-decoration:none"><strong>${esc(p.title)}</strong></a>${p.authors && p.authors.length ? '<br><span style="font-size:11px;color:var(--muted)">' + esc(p.authors.slice(0,3).join(', ')) + (p.journal ? ' · ' + esc(p.journal) : '') + (p.year ? ' (' + p.year + ')' : '') + '</span>' : ''}</li>`).join('');
      body = `<ul style="margin:0 0 6px;padding:0 0 0 18px">${items}</ul>`;
    } else if (intent.kind === 'recipe'){
      const thumb = intent.thumb ? `<img src="${esc(intent.thumb)}" alt="" style="float:right;width:120px;height:120px;object-fit:cover;border-radius:4px;margin:0 0 6px 8px">` : '';
      const ing = (intent.ingredients || []).slice(0, 8).map((i) => `<li>${esc(i.measure)} ${esc(i.name)}</li>`).join('');
      body = `${thumb}<div style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:6px">${esc(intent.formatted || '')}</div><ul style="font-size:12px;margin:4px 0;padding:0 0 0 18px">${ing}</ul><div style="clear:both"></div>`;
    } else if (intent.kind === 'lyrics'){
      body = `<pre style="font-family:inherit;font-size:13px;line-height:1.5;color:var(--ink);margin:0 0 6px;white-space:pre-wrap;max-height:200px;overflow:auto">${esc(intent.formatted)}</pre>`;
    } else if (intent.kind === 'sports'){
      const badge = intent.team && intent.team.badge ? `<img src="${esc(intent.team.badge)}" alt="" style="float:right;width:64px;height:64px;object-fit:contain;margin-left:8px">` : '';
      const events = (intent.recent || []).map((e) => `<li style="font-size:12px;margin-bottom:4px"><span style="color:var(--muted)">${esc(e.date || '')}</span> · ${esc(e.home)} ${e.homeScore != null ? e.homeScore + '–' + e.awayScore : 'vs'} ${esc(e.away)}</li>`).join('');
      body = `${badge}<ul style="margin:0 0 6px;padding:0 0 0 18px">${events}</ul><div style="clear:both"></div>`;
    } else if (intent.kind === 'flight'){
      const status = intent.onGround ? 'On ground' : (intent.altitudeFt ? intent.altitudeFt.toLocaleString() + ' ft · ' + intent.speedKts + ' kts' : 'Airborne');
      body = `<div style="font-size:18px;font-weight:500;line-height:1.3;color:var(--ink);margin-bottom:4px">${esc(status)}</div><div style="font-size:11px;color:var(--muted)">${esc(intent.summary || '')}</div>`;
    } else if (intent.kind === 'trivia'){
      const choices = (intent.choices || []).map((c) => `<li style="font-size:13px;margin-bottom:4px;color:var(--ink)">${esc(c)}</li>`).join('');
      body = `<div style="font-size:14px;line-height:1.5;color:var(--ink);margin-bottom:8px"><strong>${esc(intent.formatted)}</strong></div><ol style="margin:0 0 6px;padding:0 0 0 18px">${choices}</ol><div style="font-size:11px;color:var(--muted)">Answer hidden — try /show-answer to reveal</div>`;
    } else if (intent.kind === 'stack'){
      const items = (intent.questions || []).map((q) => `<li style="font-size:13px;margin-bottom:6px"><a href="${esc(q.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--ink);text-decoration:none"><strong>${esc(q.title)}</strong></a> <span style="font-size:11px;color:var(--muted)">↑${q.score} · ${q.answers}A${q.accepted?' ✓':''}</span></li>`).join('');
      body = `<ul style="margin:0 0 6px;padding:0 0 0 18px">${items}</ul>`;
    } else if (intent.kind === 'hn'){
      const items = (intent.stories || []).map((s) => `<li style="font-size:13px;margin-bottom:6px"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--ink);text-decoration:none"><strong>${esc(s.title)}</strong></a> <span style="font-size:11px;color:var(--muted)">${s.points}↑ · ${s.comments}💬</span></li>`).join('');
      body = `<ul style="margin:0 0 6px;padding:0 0 0 18px">${items}</ul>`;
    } else if (intent.kind === 'tv'){
      const img = intent.image ? `<img src="${esc(intent.image)}" alt="" style="float:right;width:100px;height:140px;object-fit:cover;border-radius:4px;margin:0 0 6px 8px">` : '';
      const meta = `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">${esc(intent.subtitle || '')}${intent.rating ? ' · ★ ' + fmtNum(intent.rating, lang) : ''}${intent.runtime ? ' · ' + fmtNum(intent.runtime, lang) + 'min' : ''}</div>`;
      body = `${img}${meta}<div style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:6px">${esc(intent.formatted || '')}</div><div style="clear:both"></div>`;
    } else if (intent.kind === 'food'){
      const img = intent.image ? `<img src="${esc(intent.image)}" alt="" style="float:right;width:80px;height:80px;object-fit:cover;border-radius:4px;margin:0 0 6px 8px">` : '';
      const nutri = intent.nutriscore ? `<span style="display:inline-block;padding:2px 6px;background:var(--card-bg,#1a1a1c);border-radius:3px;font-size:11px;font-weight:600;margin-right:4px">Nutri-Score ${esc(intent.nutriscore)}</span>` : '';
      const per = intent.per100g || {};
      const macros = `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">${per.energy_kcal ? fmtNum(Math.round(per.energy_kcal), lang)+' kcal' : ''}${per.fat != null ? ' · F ' + fmtNum(Math.round(per.fat), lang) + 'g' : ''}${per.carbs != null ? ' · C ' + fmtNum(Math.round(per.carbs), lang) + 'g' : ''}${per.protein != null ? ' · P ' + fmtNum(Math.round(per.protein), lang) + 'g' : ''}</div>`;
      body = `${img}${nutri}${macros}<div style="font-size:12px;line-height:1.45;color:var(--ink);margin-bottom:6px">${esc(intent.formatted || '')}</div><div style="clear:both"></div>`;
    } else if (intent.kind === 'isbn'){
      const cover = intent.cover ? `<img src="${esc(intent.cover)}" alt="" style="float:right;width:80px;max-height:120px;object-fit:cover;border-radius:4px;margin:0 0 6px 8px">` : '';
      body = `${cover}<div style="font-size:11px;color:var(--muted);margin-bottom:4px">${esc(intent.subtitle || '')}</div><div style="font-size:11px;color:var(--muted)">ISBN ${esc(intent.isbn)}${intent.summary ? ' · ' + esc(intent.summary) : ''}</div><div style="clear:both"></div>`;
    } else if (intent.kind === 'doi'){
      const journal = intent.journal ? `<span style="color:var(--muted)">${esc(intent.journal)}</span>` : '';
      body = `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">${esc(intent.subtitle || '')}</div>${journal ? '<div style="font-size:11px;margin-bottom:4px">'+journal+'</div>':''}<div style="font-size:12px;line-height:1.5;color:var(--ink);margin-bottom:6px">${esc(intent.formatted || '').slice(0,300)}</div><div style="font-size:11px;color:var(--muted)"><code>${esc(intent.doi || '')}</code></div>`;
    } else if (intent.kind === 'apod'){
      const img = intent.image ? `<div style="margin-bottom:6px"><img src="${esc(intent.image)}" alt="" style="width:100%;max-width:480px;border-radius:4px"></div>` : '';
      const dateLine = intent.date ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">${esc(fmtDate(intent.date, lang))}</div>` : '';
      body = `${img}${dateLine}<div style="font-size:13px;line-height:1.55;color:var(--ink);margin-bottom:6px">${esc(intent.formatted || '')}</div>`;
    } else if (intent.kind === 'wayback'){
      body = `<div style="font-size:14px;color:var(--ink);margin-bottom:6px"><a href="${esc(intent.archiveUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--ink)">${esc(intent.formatted || 'Open archive')}</a></div>`;
    } else if (intent.kind === 'compare'){
      const col = (side) => side ? `<td style="vertical-align:top;padding:8px;width:50%"><strong>${esc(side.title)}</strong>${side.subtitle ? '<br><span style="color:var(--muted);font-size:11px">'+esc(side.subtitle)+'</span>':''}<div style="font-size:12px;line-height:1.5;margin-top:4px">${esc((side.extract || '').slice(0,260))}</div></td>` : '<td></td>';
      body = `<table style="width:100%;border-collapse:collapse"><tr>${col(intent.left)}${col(intent.right)}</tr></table>`;
    } else if (intent.kind === 'clarify'){
      const opts = (intent.options || []).map((o) => `<li style="font-size:13px;margin-bottom:6px"><a href="${esc(o.url || '#')}" style="color:var(--ink);text-decoration:none">${esc(o.name)} <span style="color:var(--muted);font-size:11px">${esc(o.category || '')}</span></a></li>`).join('');
      body = `<ul style="margin:0 0 6px;padding:0 0 0 18px">${opts}</ul>`;
    } else if (intent.kind === 'capabilities'){
      const sections = (intent.sections || []).map((sec) => {
        const items = (sec.items || []).map((it) => `<button data-oioxo-query="${esc(it.sample)}" style="display:inline-block;margin:2px 4px 2px 0;padding:3px 8px;font-size:12px;background:var(--card-bg,#1a1a1c);color:var(--ink);border:1px solid var(--muted);border-radius:4px;cursor:pointer">${esc(it.sample)}</button>`).join('');
        return `<div style="margin-bottom:8px"><div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px">${esc(sec.icon)} ${esc(sec.title)}</div>${items}</div>`;
      }).join('');
      body = sections;
    } else {
      body = `<div style="font-size:13px;line-height:1.5;color:var(--ink);margin-bottom:6px">${esc(intent.summary || intent.formatted || '')}</div>`;
    }

    const citation = intent.citation
      ? `<div style="font-size:10px;color:var(--muted);margin-top:4px">Source: <a href="${esc(intent.citation.url || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--muted)">${esc(intent.citation.source)}</a></div>`
      : '';

    return `${dragoverStyle()}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;color:var(--muted)">${icon} ${title}</span>
      ${chipBadge('OIOXO ANSWER')}
      ${confidenceChip(intent.confidence)}
    </div>
    ${body}
    ${citation}`;
  }

  // ---- public API ---------------------------------------------------

  const INSTANT_KINDS = new Set([
    'compute-math', 'compute-units', 'compute-currency', 'compute-date',
    'time', 'world-clock',
    'definition', 'translate',
    'finance', 'news',
    'ai-answer', 'disambiguation',
    'fact', 'numparse', 'search',
    'images', 'map', 'books', 'academic', 'recipe',
    'lyrics', 'sports', 'flight', 'trivia', 'capabilities',
    'stack', 'hn', 'tv', 'food', 'isbn', 'doi', 'apod', 'wayback', 'compare', 'clarify',
  ]);

  function fmtNum(v, lang){
    const I = window.oioxoI18nRender;
    if (I && typeof v === 'number') return I.number(v, lang || 'en');
    return String(v);
  }
  function fmtDate(d, lang){
    const I = window.oioxoI18nRender;
    if (I && d) return I.date(d, lang || 'en');
    return String(d || '');
  }

  function render({ intent, esc, language }){
    installHandoffHandler();
    esc = esc || DEFAULT_ESC;
    if (!intent) return '';
    // Pick up language from the intent if caller didn't pass it. The SERP
    // attaches envelope.language to context — renderers that read it here
    // get RTL wrapping for free.
    const lang = language || (intent && intent.lang) || null;
    const inner = renderInner(intent, esc);
    if (lang && window.oioxoRtl && window.oioxoRtl.isRTL(lang)){
      return window.oioxoRtl.wrap(inner, lang);
    }
    return inner;
  }

  function renderInner(intent, esc){
    if (!intent) return '';
    // Instant-answer cards never have a `tool` object.
    if (INSTANT_KINDS.has(intent.kind)) return renderInstantAnswer(intent, esc, intent.lang || null);
    if (!intent.tool) return '';
    switch (intent.kind) {
      case 'app':                 return renderApp(intent, esc);
      case 'studio':              return renderStudio(intent, esc);
      case 'conversion':          return renderConversion(intent, esc);
      case 'conversion-fallback': return renderConversion(intent, esc);
      case 'operation':           return renderOperation(intent, esc);
      case 'catalog':
      case 'specific':
      default:
        switch (intent.inputType) {
          case 'file':  return renderOperation(intent, esc);
          case 'text':  return renderText(intent, esc);
          case 'url':   return renderUrl(intent, esc);
          case 'mixed': return renderText(intent, esc);
          case 'none':
          default:      return renderNone(intent, esc);
        }
    }
  }

  window.oioxoCardRenderer = { render, installHandoffHandler, renderInstantAnswer, INSTANT_KINDS };
})();
