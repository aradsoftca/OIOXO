/**
 * Knowledge cards — when the entity extractor identifies a strong entity
 * (location, country, person, topic, etc.), we surface a knowledge panel
 * powered by existing oioxo skills WITHOUT requiring the conductor LLM:
 *
 *   location  → weather + air-quality + astronomy (sunrise/sunset/moon)
 *   country   → country-profile (flag, capital, currency, population)
 *   person    → wikipedia-pageviews trend + book-lookup (if name resembles)
 *   topic     → wikipedia-pageviews 60-day interest curve
 *
 * The knowledge layer doesn't replace tool intents — it COMPLEMENTS them
 * when a query has an entity worth annotating. The SERP envelope grows a
 * `knowledge: [...]` array of cards the renderer can show as side panels.
 *
 * Exposes window.oioxoKnowledge = { enrich, summarize }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoKnowledge) return;

  // --- subject inference helpers ------------------------------------------

  /** A small curated list of countries — used to recognise "is this a
   *  country query" without making 200 separate fetches. */
  const COUNTRY_TOKENS = new Set([
    'us','usa','united states','america','uk','britain','united kingdom','canada','mexico',
    'germany','france','italy','spain','portugal','netherlands','belgium','sweden','norway',
    'finland','denmark','poland','greece','russia','ukraine','turkey','china','japan','korea',
    'india','indonesia','thailand','vietnam','singapore','malaysia','philippines','australia',
    'new zealand','brazil','argentina','chile','colombia','egypt','nigeria','kenya',
    'south africa','israel','saudi arabia','iran','iraq','pakistan',
  ]);

  function inferSubject(query, entities){
    const q = (query || '').toLowerCase().trim();
    if (!q) return null;
    // Country gets the strongest signal — if the query IS a country name
    // (single phrase that matches), the knowledge layer prioritises it.
    if (COUNTRY_TOKENS.has(q)) return { kind: 'country', value: q };
    // If entities show a location AND a topic word, it's a location query.
    if (entities && entities.locations && entities.locations.length){
      return { kind: 'location', value: entities.locations[0].value };
    }
    // Wikipedia-shaped topic: 1-3 capitalised words, no operation verb.
    const tokens = (query || '').trim().split(/\s+/);
    if (tokens.length >= 1 && tokens.length <= 4){
      const cap = tokens.filter((t) => /^[A-Z][a-z]/.test(t)).length;
      if (cap === tokens.length && /^[A-Z]/.test(tokens[0])) return { kind: 'topic', value: query };
    }
    return null;
  }

  // --- skill calls --------------------------------------------------------

  async function tryWeather(city){
    const skill = window.oioxoSkills && window.oioxoSkills.weather;
    if (!skill) return null;
    try { return await skill.getWeather(city); } catch { return null; }
  }
  async function tryAir(city){
    const skill = window.oioxoSkills && window.oioxoSkills.airquality;
    if (!skill) return null;
    try { return await skill.getAirQuality(city); } catch { return null; }
  }
  async function tryAstro(city){
    const skill = window.oioxoSkills && window.oioxoSkills.astro;
    if (!skill) return null;
    try { return await skill.getAstro(city); } catch { return null; }
  }
  async function tryCountry(name){
    const skill = window.oioxoSkills && window.oioxoSkills.country;
    if (!skill) return null;
    try { return await skill.getCountry(name); } catch { return null; }
  }
  async function tryPageviews(topic){
    const skill = window.oioxoSkills && window.oioxoSkills.pageviews;
    if (!skill) return null;
    try { return await skill.getPageviews(topic); } catch { return null; }
  }

  // --- card assembly ------------------------------------------------------

  function locationCard(subject, weather, air, astro){
    return {
      kind: 'knowledge',
      subject,
      panels: [
        weather ? { type: 'weather', value: weather } : null,
        air ?     { type: 'air', value: air } : null,
        astro ?   { type: 'astro', value: astro } : null,
      ].filter(Boolean),
    };
  }
  function countryCard(subject, profile){
    return {
      kind: 'knowledge',
      subject,
      panels: profile ? [{ type: 'country', value: profile }] : [],
    };
  }
  function topicCard(subject, pageviews){
    return {
      kind: 'knowledge',
      subject,
      panels: pageviews ? [{ type: 'pageviews', value: pageviews }] : [],
    };
  }

  /** Enrich a SERP envelope with knowledge panels. Async (skills do net I/O).
   *  Caps total wall-clock at ~1.2s so the SERP doesn't hang waiting on a
   *  slow API. */
  async function enrich(envelope, catalog){
    if (!envelope) return null;
    const subject = inferSubject(envelope.rewritten || envelope.original, envelope.entities);
    if (!subject) return null;
    const TIMEOUT_MS = 1200;
    const stopAt = Date.now() + TIMEOUT_MS;
    function within(p){
      return Promise.race([
        p,
        new Promise((res) => setTimeout(() => res(null), Math.max(50, stopAt - Date.now()))),
      ]);
    }
    if (subject.kind === 'country'){
      const profile = await within(tryCountry(subject.value));
      return countryCard(subject, profile);
    }
    if (subject.kind === 'location'){
      const [weather, air, astro] = await Promise.all([
        within(tryWeather(subject.value)),
        within(tryAir(subject.value)),
        within(tryAstro(subject.value)),
      ]);
      const card = locationCard(subject, weather, air, astro);
      return card.panels.length ? card : null;
    }
    if (subject.kind === 'topic'){
      const pv = await within(tryPageviews(subject.value));
      const card = topicCard(subject, pv);
      return card.panels.length ? card : null;
    }
    return null;
  }

  /** Build a short text summary suitable for voice mode. The SERP can pass
   *  this to oioxoVoice.speak() so the user hears the knowledge. */
  function summarize(knowledge){
    if (!knowledge || !knowledge.panels || !knowledge.panels.length) return '';
    const subj = knowledge.subject && knowledge.subject.value;
    const parts = [];
    for (const p of knowledge.panels){
      if (p.type === 'weather' && p.value && p.value.cur){
        parts.push('Weather in ' + subj + ': ' + Math.round(p.value.cur.temperature_2m) + ' degrees Celsius');
      } else if (p.type === 'air' && p.value && p.value.cur){
        parts.push('Air quality index ' + Math.round(p.value.cur.european_aqi || 0));
      } else if (p.type === 'astro' && p.value){
        const t = (iso) => iso ? iso.slice(11, 16) : null;
        if (p.value.sunrise) parts.push('Sunrise ' + t(p.value.sunrise) + ', sunset ' + t(p.value.sunset));
      } else if (p.type === 'country' && p.value){
        parts.push(subj + ': capital ' + p.value.capital + ', population ' + p.value.population);
      } else if (p.type === 'pageviews' && p.value){
        parts.push(p.value.title + ' has ' + p.value.last + ' views on Wikipedia yesterday');
      }
    }
    return parts.join('. ');
  }

  window.oioxoKnowledge = { enrich, summarize, inferSubject };
})();
