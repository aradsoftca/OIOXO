/**
 * RSS / Atom export — serialises bookmarks (saved searches) into a feed
 * that can be pasted into any reader. The feed contains the queries
 * themselves; subscribers re-run them locally.
 *
 *   atom()   → Atom 1.0 string
 *   rss20()  → RSS 2.0 string
 *   json()   → JSON Feed v1
 *
 * Exposes window.oioxoRssExport = { atom, rss20, json }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoRssExport) return;

  function gatherBookmarks(){
    return (window.oioxoBookmarks && window.oioxoBookmarks.list) ? window.oioxoBookmarks.list() : [];
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function base(){
    return (typeof location !== 'undefined') ? (location.origin) : 'https://oioxo.com';
  }

  function atom(){
    const items = gatherBookmarks();
    const updated = new Date().toISOString();
    return '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<feed xmlns="http://www.w3.org/2005/Atom">\n' +
      '  <title>oioxo saved searches</title>\n' +
      '  <id>' + esc(base()) + '/feed/saved</id>\n' +
      '  <updated>' + updated + '</updated>\n' +
      items.map((b) => {
        const url = base() + '/?q=' + encodeURIComponent(b.q || b.label || '');
        return '  <entry>\n' +
          '    <title>' + esc(b.label || b.q) + '</title>\n' +
          '    <id>' + esc(url) + '</id>\n' +
          '    <link href="' + esc(url) + '"/>\n' +
          '    <updated>' + new Date(b.createdAt || Date.now()).toISOString() + '</updated>\n' +
          '    <summary>Saved search: ' + esc(b.label || b.q) + '</summary>\n' +
          '  </entry>';
      }).join('\n') + '\n' +
      '</feed>\n';
  }

  function rss20(){
    const items = gatherBookmarks();
    return '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<rss version="2.0"><channel>\n' +
      '<title>oioxo saved searches</title>\n' +
      '<link>' + esc(base()) + '</link>\n' +
      '<description>Saved searches</description>\n' +
      items.map((b) => {
        const url = base() + '/?q=' + encodeURIComponent(b.q || b.label || '');
        return '<item>\n' +
          '  <title>' + esc(b.label || b.q) + '</title>\n' +
          '  <link>' + esc(url) + '</link>\n' +
          '  <pubDate>' + new Date(b.createdAt || Date.now()).toUTCString() + '</pubDate>\n' +
          '  <guid>' + esc(url) + '</guid>\n' +
          '</item>';
      }).join('\n') + '\n</channel></rss>\n';
  }

  function json(){
    const items = gatherBookmarks();
    return JSON.stringify({
      version: 'https://jsonfeed.org/version/1',
      title: 'oioxo saved searches',
      home_page_url: base(),
      items: items.map((b) => ({
        id: base() + '/?q=' + encodeURIComponent(b.q || b.label || ''),
        url: base() + '/?q=' + encodeURIComponent(b.q || b.label || ''),
        title: b.label || b.q,
        date_published: new Date(b.createdAt || Date.now()).toISOString(),
      })),
    }, null, 2);
  }

  window.oioxoRssExport = { atom, rss20, json };
})();
