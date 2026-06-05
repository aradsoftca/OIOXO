/**
 * Query rewriter — normalizes incoming queries BEFORE classification or
 * resolution so downstream stages don't have to handle whitespace,
 * punctuation, filler words, capitalisation, or common misspellings.
 *
 * Pipeline (each step is idempotent + side-effect-free):
 *   1. trim + collapse internal whitespace
 *   2. strip trailing punctuation (?, !, .)
 *   3. detect script / language for downstream multilingual handling
 *   4. strip leading filler ("please", "could you", "i want to", …)
 *   5. spell-correct individual tokens against the catalog keyword index
 *      when the user is within edit-distance 1 of a known token (≥4 chars)
 *
 * Exposes window.oioxoRewriter = { rewrite, detectLanguage, levenshtein }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoRewriter) return;

  const FILLER_PREFIX = /^(?:please\s+|kindly\s+|could\s+you\s+|can\s+you\s+|i\s+(?:want|need|would\s+like)\s+to\s+|help\s+me\s+(?:to\s+)?|how\s+(?:do\s+i\s+|can\s+i\s+)|let'?s\s+|just\s+|quickly\s+|hey\s+|hi\s+|hello\s+|um\s+|uh\s+)+/i;

  // Words the spell-corrector must never touch. The catalog index also
  // contains many of these tokens (because tool keywords mention them) but
  // catalog popularity isn't enough to decide a correction is wanted —
  // e.g. "what" → "chat" would be technically valid edit-distance-1 but
  // semantically wrong. The list covers:
  //   - WH question words
  //   - common conjunctions / determiners / prepositions
  //   - chain splitters (then, and, after) that the planner needs intact
  //   - common nouns / verbs that frequently look near a tool token
  //   - file-format extensions (so "mp4" never gets "corrected" to a slug)
  const NO_CORRECT = new Set([
    'what','when','where','why','how','who','whom','whose','which',
    'this','that','these','those','here','there',
    'the','then','than','though','through','thought',
    'and','but','or','nor','if','as','at','by','for','from','in','into','of','on','off','out','over','to','up','with','without',
    'is','are','was','were','be','been','being','am','i','you','he','she','they','it','we','me','him','her','them','us','my','your','his','their','our','its','mine','yours',
    'a','an','any','some','no','not','none','all','each','every','few','many','more','most','less','least','other','same','such','only','own','than',
    'after','before','since','until','during','about','above','below','under',
    'best','better','top','great','good','bad','worst','small','big','large','high','low','new','old','first','last','next',
    'video','videos','audio','sound','image','images','photo','photos','picture','pictures','file','files','document','documents','text','word','book','songs','song','music','clip','clips',
    'do','does','did','done','have','has','had','will','would','should','could','may','might','must','can','cant','wont','dont','shouldnt','couldnt',
    'make','made','take','took','give','gave','get','got','put','find','found','need','needed','want','wanted','use','used','like','liked','want',
    'add','added','remove','keep','show','tell','say','said','know','knew','think','thought','seem','look','looked','see','saw',
    'today','tomorrow','yesterday','now','later','soon','always','never','often','sometimes','always',
    'really','very','quite','rather','almost','about','just','also','too','still','already','again','back','once','twice','around','near','close','far',
    // Common abbreviations + tool-adjacent words people type
    'calc','calculator','calculation','calculations','compute','min','max','avg','mean','median','sum','total',
    // Units the user might mention (don't correct these to file/etc.)
    'miles','mile','feet','foot','inches','inch','yards','yard','meters','metre','metres','km','kilometer','kilometers','cm','mm','meter',
    'kg','kilogram','kilograms','lbs','pound','pounds','oz','ounce','ounces','gram','grams','tonne','tonnes','ton','tons',
    'usd','eur','gbp','jpy','cad','aud','chf','cny','inr','krw',
    // Conjugation / common tool verbs the planner/operations need intact
    'maker','editor','editors','creator','generator','viewer','converter','reader','writer','player','recorder','uploader','downloader',
    'meme','memes','avatar','poster','sticker','thumbnail','collage','invoice','resume',
    'crypto','bitcoin','ethereum','currency','price','prices','rate','rates',
    'weather','temperature','forecast',
    'lyrics','recipe','book','books','holiday','holidays',
    'name','names','address','phone','email','time','date','year',
    // file-format extensions: never correct these
    'mp3','mp4','avi','mov','mkv','webm','flv','wmv','m4v','mpg','mpeg',
    'wav','flac','aac','ogg','m4a','aiff',
    'jpg','jpeg','png','webp','gif','bmp','tiff','svg','heic','heif','avif',
    'pdf','docx','doc','txt','rtf','odt','epub','mobi','html','md',
    'json','xml','csv','yaml','yml','tsv',
    'zip','rar','tar','gz',
    'ttf','otf','woff',
    // Number words (spell-correct kept misreading these as catalog tokens).
    'zero','one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen',
    'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand','million','billion',
    'half','third','quarter','double','triple','dozen',
    // Math + natural-math vocabulary — without these "divided" → "divide",
    // "root" → "loot", "five" → "live" etc.
    'plus','minus','times','divided','multiplied','squared','cubed','power','mod','modulo',
    'square','root','cube','log','exp','sin','cos','tan','percent','percentage','over','of',
    'equal','equals','equation','formula','sum','difference','product','quotient','remainder',
    // Common English verbs / nouns spell-correct was over-zealous on.
    'help','helping','helped','please','kindly','really','very','just','some','any',
    'much','many','little','enough','few','several','quite','rather',
    'open','close','start','stop','begin','end','run','set','pick','choose','select',
    'send','sent','receive','share','shared','save','saved','load','copy','move','delete',
    'paste','print','scan','play','pause','record','recorded','export','import','update',
    'lossless','lossy','quality','size','width','height','length','depth','aspect','ratio',
    'background','foreground','transparent','color','colour','colors','colours',
    'channel','alpha','beta','gamma','delta','epsilon',
    'page','pages','frame','frames','layer','layers','slide','slides','track','tracks',
    // Time / date words
    'minute','minutes','hour','hours','second','seconds','day','days','week','weeks','month','months',
    'morning','evening','night','noon','midnight','tonight',
    'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
    'january','february','march','april','may','june','july','august','september','october','november','december',
    // Country / region words
    'argentina','japan','japanese','china','chinese','korea','korean','germany','german','france','french',
    'spain','spanish','italy','italian','russia','russian','india','indian','brazil','brazilian',
    'mexico','mexican','egypt','iran','iraq','israel','turkey','turkish','greek','greece','poland','polish',
    // Tech / format jargon
    'cmyk','rgb','hsl','hex','rgba','hsla','srgb','p3','rec709','rec2020',
    'h264','h265','hevc','av1','vp8','vp9','aac','opus','flac',
    'utc','gmt','pst','est','cst','mst','pdt','edt','jst','ist',
    'ssd','hdd','usb','hdmi','dpi','ppi','fps','bps','kbps','mbps','gbps',
    'wifi','ethernet','bluetooth','nfc','airplay',
    // Common adjectives
    'fast','slow','quick','easy','hard','simple','complex','complicated',
    'better','worse','more','less','same','different','similar',
  ]);

  // Cached token index built lazily from the catalog the first time
  // rewrite(query, catalog) is called with a non-null catalog. Subsequent
  // calls reuse it until the catalog version changes.
  let tokenIndex = null; // { version, set: Set<string>, popular: Map<token,count> }

  function buildTokenIndex(catalog){
    if (tokenIndex && tokenIndex.version === catalog.version) return tokenIndex;
    const set = new Set();
    const popular = new Map();
    for (const t of catalog.tools || []){
      const bag = [];
      bag.push(...(t.keywords || []));
      if (t.name) bag.push(t.name.toLowerCase());
      if (t.slug) bag.push(t.slug.replace(/-/g, ' '));
      if (t.appType) bag.push(t.appType);
      if (t.formatIn) bag.push(t.formatIn);
      if (t.formatOut) bag.push(t.formatOut);
      for (const op of (t.operations || [])) bag.push(op);
      for (const phrase of bag){
        for (const tok of String(phrase || '').toLowerCase().split(/\s+/)){
          if (tok.length < 3) continue;
          if (!/^[a-z0-9'\-]+$/.test(tok)) continue;
          set.add(tok);
          popular.set(tok, (popular.get(tok) || 0) + 1);
        }
      }
    }
    tokenIndex = { version: catalog.version, set, popular };
    return tokenIndex;
  }

  function detectLanguage(text){
    if (!text) return 'en';
    if (/[一-鿿]/.test(text)) return 'zh';
    if (/[぀-ヿ]/.test(text)) return 'ja';
    if (/[가-힯]/.test(text)) return 'ko';
    if (/[؀-ۿ]/.test(text)) return 'ar';
    if (/[Ѐ-ӿ]/.test(text)) return 'ru';
    if (/[ऀ-ॿ]/.test(text)) return 'hi';
    if (/[àâçéèêëîïôœùûüÿæ]/i.test(text)) return 'fr';
    if (/[äöüß]/i.test(text)) return 'de';
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
    if (/[áàâãéêíóôõú]/i.test(text)) return 'pt';
    return 'en';
  }

  /** Levenshtein edit distance, capped at `max` for early exit. */
  function levenshtein(a, b, max){
    a = String(a || ''); b = String(b || '');
    if (a === b) return 0;
    if (!a.length || !b.length) return Math.max(a.length, b.length);
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++){
      const curr = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++){
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        const v = Math.min(curr[j-1] + 1, prev[j] + 1, prev[j-1] + cost);
        curr[j] = v;
        if (v < best) best = v;
      }
      if (best > max) return max + 1;
      prev = curr;
    }
    return prev[b.length];
  }

  /** Find the best spell-correction in the token index. Returns the
   *  candidate or null. Conservative — only swaps when:
   *   - input token is ≥4 chars
   *   - candidate is within edit distance 1
   *   - candidate has higher popularity than the input (preventing the
   *     correction from demoting a less-common-but-valid token) */
  function correctToken(tok, index){
    if (!index || tok.length < 4) return null;
    if (index.set.has(tok)) return null; // already valid
    if (NO_CORRECT.has(tok)) return null; // common English / file ext — never auto-correct
    let best = null, bestDist = 2;
    for (const cand of index.set){
      if (cand === tok) continue;
      // Quick reject: length difference > 1 cannot be edit distance 1.
      if (Math.abs(cand.length - tok.length) > 1) continue;
      // We intentionally allow plural ↔ singular candidates here — the
      // common-noun stop list above already protects words like "editors",
      // "memes", "thumbnails" from being touched, while leaving real typos
      // such as "compres" → "compress" (which looks like a plural swap to
      // a naive rule but is actually a doubled-consonant edit) repairable.
      const d = levenshtein(tok, cand, 1);
      if (d < bestDist){
        bestDist = d;
        best = cand;
        if (d === 0) break;
      }
    }
    if (!best) return null;
    // Require the candidate has at least one catalog occurrence. The stop
    // list above already rejects common English / file-extension tokens, so
    // simply requiring "the correction exists in the catalog at all" is the
    // right floor — overly tight popularity thresholds caused real typos
    // like "compres" → "compress" to be left uncorrected.
    const popCandidate = index.popular.get(best) || 0;
    if (popCandidate < 1) return null;
    return best;
  }

  /** Run the full rewrite pipeline. Always returns an object — `rewritten`
   *  is what downstream stages should consume; `original` is what the user
   *  typed; the rest is metadata for telemetry / UX hints. */
  function rewrite(rawQ, catalog){
    const original = String(rawQ == null ? '' : rawQ);
    if (!original) {
      return { original, rewritten: '', language: 'en', corrections: [], stripped: false };
    }
    let q = original;
    // 1. Trim + collapse internal whitespace.
    q = q.trim().replace(/\s+/g, ' ');
    // 2. Strip trailing punctuation (but keep "?" for question classification).
    let trailingQuestion = false;
    if (/\?\s*$/.test(q)){ trailingQuestion = true; q = q.replace(/\?\s*$/, '').trim(); }
    q = q.replace(/[!.]+\s*$/, '').trim();
    // 3. Detect language BEFORE we strip filler (which is English-shaped).
    let language = detectLanguage(q);
    // 3b. Multilingual lexicon — try always (its detector catches Latin
    //     queries that lack diacritics, e.g. "comprimir pdf" / "pdf
    //     komprimieren"). Maps common verbs / nouns to English so the
    //     catalog matcher works without the translate skill loaded.
    let translation = null;
    if (window.oioxoMultilingual && typeof window.oioxoMultilingual.translate === 'function'){
      try {
        const t = window.oioxoMultilingual.translate(q);
        if (t && t.translated){
          translation = t;
          q = t.english;
          // After lexicon translation, the rest of the pipeline can run
          // as English (filler-strip + spell-correct).
          language = 'en';
        } else if (t && t.lang && t.lang !== 'en'){
          language = t.lang;
        }
      } catch {}
    }
    // 4. Strip leading filler if English.
    let stripped = false;
    if (language === 'en'){
      const m = q.match(FILLER_PREFIX);
      if (m){ q = q.slice(m[0].length).trim(); stripped = true; }
    }
    // 5. Spell-correct against catalog keyword index — only for English
    //    queries and only when we have a catalog to learn from. Limited to
    //    edit distance 1 per token to avoid changing intent.
    const corrections = [];
    if (catalog && language === 'en'){
      const index = buildTokenIndex(catalog);
      const tokens = q.split(' ');
      const out = [];
      for (const tok of tokens){
        // Strip leading/trailing punctuation but preserve case for output.
        const clean = tok.replace(/[^a-z0-9'\-]/gi, '').toLowerCase();
        if (!clean){ out.push(tok); continue; }
        const corrected = correctToken(clean, index);
        if (corrected && corrected !== clean){
          corrections.push({ from: clean, to: corrected });
          out.push(tok.replace(new RegExp(clean, 'i'), corrected));
        } else {
          out.push(tok);
        }
      }
      q = out.join(' ');
    }
    return {
      original,
      rewritten: q,
      language,
      corrections,
      stripped,
      hadQuestionMark: trailingQuestion,
      translation,
    };
  }

  window.oioxoRewriter = { rewrite, detectLanguage, levenshtein };
})();
