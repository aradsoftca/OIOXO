// oioxo brain Web Worker — runs the 360M LLM's WASM inference OFF the main thread so it
// never contends with the main-thread embedder that ranks the search. The main thread
// does the ECDHE handshake + AES decrypt and primes CacheStorage ('transformers-cache');
// this worker just boots transformers.js against that primed cache (same origin-shared
// cache) and answers generate() requests, streaming tokens back. Module worker.
let pipe = null, mod = null;

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'load') {
      mod = await import(m.transformersUrl);
      mod.env.allowLocalModels = false;
      mod.env.allowRemoteModels = true;
      mod.env.useBrowserCache = true;                 // reads the cache the main thread primed
      mod.env.remoteHost = m.remoteHost;
      mod.env.remotePathTemplate = '{model}/resolve/{revision}/';
      // int8 (q8) on WASM — WebGPU has no int8 matmul (reads weights as fp32 → garbage).
      pipe = await mod.pipeline('text-generation', m.repo, { device: 'wasm', dtype: 'q8' });
      self.postMessage({ type: 'loaded' });
    } else if (m.type === 'generate') {
      if (!pipe) { self.postMessage({ type: 'done', id: m.id, text: '', error: 'not loaded' }); return; }
      let streamer = null;
      try {
        if (mod.TextStreamer && pipe.tokenizer) {
          streamer = new mod.TextStreamer(pipe.tokenizer, {
            skip_prompt: true, skip_special_tokens: true,
            callback_function: (chunk) => { if (!m.noStream) self.postMessage({ type: 'token', id: m.id, chunk }); },
          });
        }
      } catch (_) {}
      const opts = { max_new_tokens: m.maxTokens || 220, do_sample: false, return_full_text: false, streamer };
      if (m.noRepeat) opts.no_repeat_ngram_size = 3;
      const out = await pipe(m.input, opts);
      const raw = Array.isArray(out) ? (out[0] && out[0].generated_text || '') : (out && out.generated_text || '');
      const text = typeof raw === 'string' ? raw : (Array.isArray(raw) ? (raw[raw.length - 1] && raw[raw.length - 1].content || '') : '');
      self.postMessage({ type: 'done', id: m.id, text });
    }
  } catch (err) {
    self.postMessage({ type: m.type === 'load' ? 'loaderror' : 'done', id: m.id, text: '', error: String(err && err.message || err) });
  }
};
