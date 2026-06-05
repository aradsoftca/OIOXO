/**
 * Trivia card — uses Open Trivia Database (CORS-clean, free, no key) for
 * "random trivia", "fun fact", "quiz me".
 *
 *   https://opentdb.com/api.php?amount=1
 *
 * Also ships a small bundled static set of ~30 facts so the user gets
 * SOMETHING even when offline.
 *
 * Exposes window.oioxoTriviacard = { tryCard, parsePattern, fetchOne }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoTriviacard) return;

  const BUDGET_MS = 700;

  const PATTERNS = [
    /^(?:random\s+)?trivia$/i,
    /^fun\s+fact$/i,
    /^quiz\s+me$/i,
    /^did\s+you\s+know$/i,
    /^random\s+fact$/i,
    /^interesting\s+fact$/i,
  ];

  // Tiny offline fallback — public-domain facts.
  const FALLBACK = [
    { q: 'How many bones are in the adult human body?', a: '206' },
    { q: 'What is the largest ocean on Earth?', a: 'Pacific' },
    { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci' },
    { q: 'What planet is known as the Red Planet?', a: 'Mars' },
    { q: 'What is the speed of light?', a: '299,792 km/s' },
    { q: 'In what year did humans first land on the Moon?', a: '1969' },
    { q: 'What is the smallest country in the world?', a: 'Vatican City' },
    { q: 'How many continents are there?', a: '7' },
    { q: 'What gas do plants breathe in?', a: 'Carbon dioxide' },
    { q: 'Who wrote Hamlet?', a: 'William Shakespeare' },
    { q: 'What is the longest river in the world?', a: 'Nile (or Amazon, debated)' },
    { q: 'What is the tallest mountain on Earth?', a: 'Mount Everest' },
    { q: 'What is the chemical symbol for gold?', a: 'Au' },
    { q: 'How many sides does a hexagon have?', a: '6' },
    { q: 'What animal lays the largest egg?', a: 'Ostrich' },
    { q: 'How many time zones are there in Russia?', a: '11' },
    { q: 'What is the largest desert in the world?', a: 'Antarctic' },
    { q: 'Who developed the theory of relativity?', a: 'Albert Einstein' },
    { q: 'What is the boiling point of water in Celsius?', a: '100' },
    { q: 'How many keys are on a standard piano?', a: '88' },
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS) if (p.test(s)) return { random: true };
    return null;
  }

  function decodeHtml(s){
    return String(s || '')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&eacute;/g, 'é').replace(/&aacute;/g, 'á').replace(/&oacute;/g, 'ó');
  }

  async function fetchOne(){
    if (typeof fetch === 'undefined') return null;
    try {
      const url = 'https://opentdb.com/api.php?amount=1&type=multiple';
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.results || !r.results[0]) return null;
      const t = r.results[0];
      const choices = t.incorrect_answers.concat([t.correct_answer]).map(decodeHtml);
      // Shuffle.
      for (let i = choices.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
      return {
        question: decodeHtml(t.question),
        answer: decodeHtml(t.correct_answer),
        category: t.category,
        difficulty: t.difficulty,
        choices,
      };
    } catch { return null; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    let trivia = await fetchOne();
    if (!trivia){
      const item = FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
      trivia = { question: item.q, answer: item.a, category: 'General', difficulty: 'easy', choices: [item.a] };
    }
    return {
      kind: 'trivia',
      title: trivia.category + ' · ' + trivia.difficulty,
      subtitle: '',
      icon: '🎲',
      confidence: 0.8,
      formatted: trivia.question,
      answer: trivia.answer,
      choices: trivia.choices,
      summary: trivia.category,
      citation: { source: 'open trivia db', url: 'https://opentdb.com/' },
      inputType: 'none',
    };
  }

  window.oioxoTriviacard = { tryCard, parsePattern, fetchOne, FALLBACK };
})();
