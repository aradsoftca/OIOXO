/**
 * oioxo runtime mirror of lib/skills/wordrel.ts. Exposes
 * window.oioxoSkills.wordrel = { lookup, MODES }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.oioxoSkills = window.oioxoSkills || {};
  if (window.oioxoSkills.wordrel) return;

  const LABEL = {
    rhy:['Rhymes with','🎵'], syn:['Synonyms of','↔'], ant:['Antonyms of','⇄'],
    ml:['Words like','🔁'], sp_start:['Starting with','⤴'], sp_end:['Ending with','⤵'],
    sp_contain:['Containing','◇'], hom:['Homophones of','〰'], ana:['Anagrams of','🔀'],
  };
  const MODES = Object.keys(LABEL);

  function sortedLetters(s){ return s.toLowerCase().split('').sort().join(''); }

  async function lookup(mode, word, opts){
    const w = (word || '').trim().toLowerCase();
    if (!w || w.length > 30) return null;
    const limit = Math.max(1, Math.min(50, (opts && opts.limit) || 20));
    let url;
    switch (mode){
      case 'rhy': url = 'https://api.datamuse.com/words?rel_rhy=' + w + '&max=' + limit; break;
      case 'syn': url = 'https://api.datamuse.com/words?rel_syn=' + w + '&max=' + limit; break;
      case 'ant': url = 'https://api.datamuse.com/words?rel_ant=' + w + '&max=' + limit; break;
      case 'ml':  url = 'https://api.datamuse.com/words?ml=' + w + '&max=' + limit; break;
      case 'sp_start':   url = 'https://api.datamuse.com/words?sp=' + w + '*&max=' + limit; break;
      case 'sp_end':     url = 'https://api.datamuse.com/words?sp=*' + w + '&max=' + limit; break;
      case 'sp_contain': url = 'https://api.datamuse.com/words?sp=*' + w + '*&max=' + limit; break;
      case 'hom': url = 'https://api.datamuse.com/words?rel_hom=' + w + '&max=' + Math.min(10, limit); break;
      case 'ana': url = 'https://api.datamuse.com/words?sp=' + '?'.repeat(w.length) + '&max=500'; break;
      default: return null;
    }
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) return null;
      let words = arr.map(x => x.word).filter(x => x && x.toLowerCase() !== w);
      if (mode === 'ana'){
        const target = sortedLetters(w);
        words = words.filter(x => sortedLetters(x) === target).slice(0, limit);
      } else {
        words = words.slice(0, limit);
      }
      if (!words.length) return null;
      const [label, icon] = LABEL[mode];
      return { mode, word: w, label: label + ' ' + w, icon, words };
    } catch { return null; }
  }
  window.oioxoSkills.wordrel = { lookup, MODES };
})();
