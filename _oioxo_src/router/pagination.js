/**
 * Pagination helpers — extends serp.process() with offset/limit semantics
 * and a "more results" cursor.
 *
 *   nextPage(envelope) → calls serp.process again with next offset
 *   prevPage(envelope) → previous page
 *   pageInfo(envelope) → { offset, limit, hasMore, page }
 *
 * Exposes window.oioxoPagination = { nextPage, prevPage, pageInfo, DEFAULT_PAGE_SIZE }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoPagination) return;

  const DEFAULT_PAGE_SIZE = 8;

  function pageInfo(envelope){
    const offset = (envelope && envelope.offset) || 0;
    const limit = (envelope && envelope.limit) || DEFAULT_PAGE_SIZE;
    const total = (envelope && envelope.webResults && envelope.webResults.total) || 0;
    return {
      offset, limit, total,
      hasMore: total > offset + limit,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async function nextPage(envelope, catalog, opts){
    if (!window.oioxoSerp || !envelope) return null;
    const info = pageInfo(envelope);
    if (!info.hasMore) return null;
    return await window.oioxoSerp.process(
      envelope.original,
      catalog,
      Object.assign({}, opts || {}, { offset: info.offset + info.limit, limit: info.limit }),
    );
  }

  async function prevPage(envelope, catalog, opts){
    if (!window.oioxoSerp || !envelope) return null;
    const info = pageInfo(envelope);
    if (info.offset === 0) return null;
    return await window.oioxoSerp.process(
      envelope.original,
      catalog,
      Object.assign({}, opts || {}, { offset: Math.max(0, info.offset - info.limit), limit: info.limit }),
    );
  }

  window.oioxoPagination = { nextPage, prevPage, pageInfo, DEFAULT_PAGE_SIZE };
})();
