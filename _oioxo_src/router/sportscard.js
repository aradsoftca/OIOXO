/**
 * Sports card — uses TheSportsDB (CORS-clean, free public key '3') for
 * "[team] score", "[team] vs [team]", "[league] standings".
 *
 *   https://www.thesportsdb.com/api/v1/json/3/
 *
 * The numeric key '3' is the free public key documented on TheSportsDB.
 * It's NOT a private credential — it's the shared community key for
 * all public clients.
 *
 * Exposes window.oioxoSportscard = { tryCard, parsePattern }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoSportscard) return;

  const BUDGET_MS = 900;
  const cache = new Map();
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const PUBLIC_KEY = '3'; // free, documented public key — not a credential

  const PATTERNS = [
    /^(.+?)\s+(?:score|scores|result|results)$/i,
    /^(.+?)\s+vs\s+(.+?)$/i,
    /^(.+?)\s+(?:standings|table|league)$/i,
    /^score\s+(.+?)$/i,
    /^(?:nba|nfl|mlb|nhl|premier league|la liga|champions league)\s+(.+?)$/i,
    /^(.+?)\s+(?:fixtures?|schedule)$/i,
  ];

  function parsePattern(q){
    if (!q) return null;
    const s = String(q).trim();
    for (const p of PATTERNS){
      const m = s.match(p);
      if (m && m[1] && m[1].length >= 2){
        const team = m[1].trim();
        if (team.length > 60) continue;
        return { team, opponent: m[2] && m[2].trim() };
      }
    }
    return null;
  }

  async function searchTeam(team){
    if (typeof fetch === 'undefined') return null;
    const key = team.toLowerCase();
    const c = cache.get(key);
    if (c && Date.now() - c.ts < CACHE_TTL_MS) return c.result;
    try {
      const url = 'https://www.thesportsdb.com/api/v1/json/' + PUBLIC_KEY +
        '/searchteams.php?t=' + encodeURIComponent(team);
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.teams || !r.teams[0]) return null;
      const t = r.teams[0];
      const result = {
        id: t.idTeam,
        name: t.strTeam,
        sport: t.strSport,
        league: t.strLeague,
        country: t.strCountry,
        badge: t.strTeamBadge,
        stadium: t.strStadium,
        formed: t.intFormedYear,
        description: t.strDescriptionEN ? t.strDescriptionEN.slice(0, 250) : '',
        website: t.strWebsite ? 'https://' + t.strWebsite.replace(/^https?:\/\//, '') : null,
      };
      cache.set(key, { result, ts: Date.now() });
      return result;
    } catch { return null; }
  }

  async function lastEvents(teamId){
    if (typeof fetch === 'undefined' || !teamId) return [];
    try {
      const url = 'https://www.thesportsdb.com/api/v1/json/' + PUBLIC_KEY +
        '/eventslast.php?id=' + teamId;
      const r = await Promise.race([
        fetch(url).then((r) => r.ok ? r.json() : null),
        new Promise((res) => setTimeout(() => res(null), BUDGET_MS)),
      ]);
      if (!r || !r.results) return [];
      return r.results.slice(0, 3).map((e) => ({
        date: e.dateEvent,
        league: e.strLeague,
        home: e.strHomeTeam,
        away: e.strAwayTeam,
        homeScore: e.intHomeScore,
        awayScore: e.intAwayScore,
        venue: e.strVenue,
      }));
    } catch { return []; }
  }

  async function tryCard(query){
    const p = parsePattern(query);
    if (!p) return null;
    const team = await searchTeam(p.team);
    if (!team) return null;
    const recent = await lastEvents(team.id);
    return {
      kind: 'sports',
      title: team.name,
      subtitle: team.sport + (team.league ? ' · ' + team.league : ''),
      icon: '⚽',
      confidence: 0.86,
      team,
      recent,
      summary: recent.length ? (recent.length + ' recent result' + (recent.length === 1 ? '' : 's')) : team.country,
      citation: { source: 'thesportsdb', url: 'https://www.thesportsdb.com/team/' + team.id },
      inputType: 'none',
    };
  }

  window.oioxoSportscard = { tryCard, parsePattern, searchTeam, lastEvents };
})();
