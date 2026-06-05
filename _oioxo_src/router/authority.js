/**
 * Domain authority — static, curated list of high-trust / low-trust
 * source classes used to weight web results. Pure on-device, ~5KB.
 *
 *   score(url) → multiplier in [0.4, 1.5]
 *
 * The list is not exhaustive — most domains fall through to 1.0 (neutral).
 * High-authority: wiki/scholar/.gov/.edu and named primary sources.
 * Low-authority: known content farms + thin SEO sites + mirror spam.
 *
 * Exposes window.oioxoAuthority = { score, bucket, hostOf }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoAuthority) return;

  const HIGH = new Set([
    // Primary references — Wikimedia family (multilingual)
    'wikipedia.org','en.wikipedia.org','simple.wikipedia.org','de.wikipedia.org',
    'fr.wikipedia.org','es.wikipedia.org','it.wikipedia.org','ja.wikipedia.org',
    'zh.wikipedia.org','ru.wikipedia.org','pt.wikipedia.org','ar.wikipedia.org',
    'nl.wikipedia.org','pl.wikipedia.org','sv.wikipedia.org','fa.wikipedia.org',
    'ko.wikipedia.org','tr.wikipedia.org','vi.wikipedia.org','id.wikipedia.org',
    'th.wikipedia.org','hi.wikipedia.org','cs.wikipedia.org','el.wikipedia.org',
    'he.wikipedia.org','uk.wikipedia.org','ro.wikipedia.org','hu.wikipedia.org',
    'da.wikipedia.org','fi.wikipedia.org','no.wikipedia.org','bg.wikipedia.org',
    'wikidata.org','wiktionary.org','en.wiktionary.org','wikimedia.org',
    'commons.wikimedia.org','wikibooks.org','wikisource.org','wikiquote.org',
    'wikiversity.org','wikivoyage.org','species.wikimedia.org','mediawiki.org',
    // Academic — publishers + databases
    'scholar.google.com','arxiv.org','biorxiv.org','medrxiv.org','chemrxiv.org',
    'crossref.org','openalex.org','semanticscholar.org','researchgate.net',
    'nature.com','science.org','sciencedirect.com','springer.com','link.springer.com',
    'wiley.com','onlinelibrary.wiley.com','tandfonline.com','sagepub.com',
    'cambridge.org','oup.com','jstor.org','plos.org','plosone.org','frontiersin.org',
    'mdpi.com','bmj.com','thelancet.com','nejm.org','cell.com','pnas.org',
    'pubmed.ncbi.nlm.nih.gov','ncbi.nlm.nih.gov','europepmc.org','doaj.org',
    'orcid.org','zenodo.org','figshare.com','osf.io','protocols.io',
    'royalsocietypublishing.org','iop.org','iopscience.iop.org','aps.org',
    'journals.aps.org','acs.org','pubs.acs.org','rsc.org','pubs.rsc.org',
    'ams.org','ieee.org','ieeexplore.ieee.org','acm.org','dl.acm.org',
    'asme.org','aiaa.org','aip.org','pubs.aip.org',
    // Government — US
    'nasa.gov','noaa.gov','nih.gov','cdc.gov','fda.gov','ed.gov','energy.gov',
    'usgs.gov','epa.gov','nist.gov','nsf.gov','dot.gov','faa.gov','ftc.gov',
    'sec.gov','irs.gov','treasury.gov','state.gov','defense.gov','justice.gov',
    'whitehouse.gov','congress.gov','senate.gov','house.gov','supremecourt.gov',
    'gao.gov','cbo.gov','bls.gov','census.gov','federalreserve.gov',
    'usda.gov','va.gov','ssa.gov','medicare.gov','medicaid.gov','cms.gov',
    'weather.gov','ready.gov','fema.gov','dhs.gov','tsa.gov','cbp.gov',
    'archives.gov','loc.gov','nps.gov','nrcs.usda.gov','fs.usda.gov',
    'lanl.gov','llnl.gov','ornl.gov','anl.gov','bnl.gov','fnal.gov','slac.stanford.edu',
    // Government — international
    'who.int','un.org','unesco.org','unicef.org','undp.org','unhcr.org',
    'worldbank.org','imf.org','oecd.org','wto.org','wipo.int','itu.int',
    'europa.eu','ec.europa.eu','europarl.europa.eu','consilium.europa.eu',
    'eea.europa.eu','efsa.europa.eu','ema.europa.eu','ecdc.europa.eu',
    'eurostat.ec.europa.eu','gov.uk','data.gov.uk','nhs.uk','ons.gov.uk',
    'parliament.uk','bankofengland.co.uk','metoffice.gov.uk',
    'canada.ca','statcan.gc.ca','gc.ca','government.nl','rivm.nl',
    'gouv.fr','service-public.fr','insee.fr','ameli.fr','data.gouv.fr',
    'bund.de','bundesregierung.de','destatis.de','rki.de','dwd.de',
    'australia.gov.au','abs.gov.au','health.gov.au','bom.gov.au',
    'govt.nz','stats.govt.nz','japan.go.jp','stat.go.jp','jma.go.jp',
    'gov.cn','stats.gov.cn','gov.kr','kostat.go.kr','gov.in','rbi.org.in',
    'gov.br','ibge.gov.br','gob.mx','inegi.org.mx','gob.es','ine.es',
    'gov.za','statssa.gov.za','gov.sg','singstat.gov.sg',
    // Standards bodies
    'ietf.org','w3.org','iso.org','iec.ch','itu.int','ieee.org','ietf.org',
    'iana.org','icann.org','rfc-editor.org','oasis-open.org','ecma-international.org',
    'whatwg.org','khronos.org','openid.net','oauth.net','jcp.org',
    // Quality news — global
    'bbc.com','bbc.co.uk','reuters.com','apnews.com','npr.org','pbs.org',
    'dw.com','dw.de','france24.com','rfi.fr','aljazeera.com','aljazeera.net',
    'cbc.ca','radio-canada.ca','abc.net.au','rnz.co.nz','rte.ie',
    'guardian.co.uk','theguardian.com','ft.com','wsj.com','nytimes.com',
    'washingtonpost.com','latimes.com','bostonglobe.com','chicagotribune.com',
    'theatlantic.com','newyorker.com','economist.com','propublica.org',
    'politico.com','politico.eu','axios.com','bloomberg.com','cnbc.com',
    'lemonde.fr','lefigaro.fr','liberation.fr','sueddeutsche.de','faz.net',
    'zeit.de','spiegel.de','elpais.com','elmundo.es','corriere.it',
    'repubblica.it','nrc.nl','volkskrant.nl','asahi.com','nhk.or.jp',
    'mainichi.jp','xinhuanet.com','chinadaily.com.cn','scmp.com',
    'straitstimes.com','channelnewsasia.com','thehindu.com','indianexpress.com',
    'haaretz.com','timesofisrael.com','jpost.com',
    // Tech canonical — docs
    'developer.mozilla.org','docs.python.org','docs.python-requests.org',
    'docs.djangoproject.com','docs.djangoproject.org','docs.scipy.org',
    'numpy.org','pandas.pydata.org','scikit-learn.org','pytorch.org',
    'tensorflow.org','keras.io','huggingface.co','jupyter.org',
    'developer.apple.com','developer.android.com','docs.microsoft.com',
    'learn.microsoft.com','docs.aws.amazon.com','cloud.google.com',
    'firebase.google.com','docs.oracle.com','docs.docker.com','docs.kubernetes.io',
    'kubernetes.io','helm.sh','docs.ansible.com','docs.terraform.io',
    'docs.gitlab.com','docs.github.com','docs.npmjs.com','nodejs.org',
    'reactjs.org','react.dev','vuejs.org','angular.io','svelte.dev',
    'nextjs.org','nuxtjs.org','remix.run','gatsbyjs.com',
    'rust-lang.org','doc.rust-lang.org','crates.io','golang.org','go.dev',
    'pkg.go.dev','ruby-lang.org','rubyonrails.org','guides.rubyonrails.org',
    'php.net','laravel.com','symfony.com','docs.symfony.com',
    'docs.swift.org','swift.org','kotlinlang.org','scala-lang.org',
    'haskell.org','elixir-lang.org','hexdocs.pm','clojure.org','julialang.org',
    'docs.julialang.org','postgresql.org','mysql.com','dev.mysql.com',
    'mariadb.org','redis.io','mongodb.com','docs.mongodb.com',
    'sqlite.org','elastic.co','www.elastic.co','grafana.com','prometheus.io',
    'kernel.org','www.kernel.org','gnu.org','www.gnu.org','fsf.org',
    'apache.org','httpd.apache.org','nginx.org','nginx.com',
    'github.com','gitlab.com','bitbucket.org','sourceforge.net','codeberg.org',
    // Reference + culture
    'britannica.com','plato.stanford.edu','iep.utm.edu','merriam-webster.com',
    'dictionary.com','thesaurus.com','oxforddictionaries.com','collinsdictionary.com',
    'longman.com','ldoceonline.com','larousse.fr','dwds.de','duden.de',
    'treccani.it','rae.es','dle.rae.es','cnrtl.fr',
    'archive.org','openlibrary.org','gutenberg.org','hathitrust.org',
    'jstor.org','europeana.eu','dpla.northeastern.edu','dp.la',
    'imslp.org','musicbrainz.org','allmusic.com','rateyourmusic.com',
    'metmuseum.org','moma.org','tate.org.uk','britishmuseum.org',
    'louvre.fr','nationalgallery.org.uk','si.edu','smithsonianmag.com',
    // Health/Medicine specifics
    'mayoclinic.org','clevelandclinic.org','hopkinsmedicine.org','medlineplus.gov',
    'cdc.gov','nih.gov','cancer.gov','heart.org','diabetes.org','lung.org',
    'aafp.org','acs.org','asco.org','aap.org','acog.org','rheumatology.org',
    'uptodate.com','medscape.com','drugs.com','rxlist.com','dailymed.nlm.nih.gov',
    'cochranelibrary.com','cochrane.org',
    // Finance/Economics
    'federalreserve.gov','treasury.gov','sec.gov','finra.org','imf.org',
    'oecd.org','worldbank.org','ecb.europa.eu','bis.org','ssa.gov',
    'investor.gov','consumerfinance.gov',
    // Geo/Maps/Travel
    'openstreetmap.org','geonames.org','natural-earth-vector.github.io',
    'usgs.gov','noaa.gov','nasa.gov','esa.int',
    // Sports primary
    'olympic.org','olympics.com','fifa.com','uefa.com','nba.com',
    'nfl.com','mlb.com','nhl.com','formula1.com','atptour.com','wtatennis.com',
    // Programming Q&A (community-vetted)
    'stackoverflow.com','superuser.com','serverfault.com','askubuntu.com',
    'unix.stackexchange.com','stackexchange.com','math.stackexchange.com',
    'physics.stackexchange.com','cs.stackexchange.com','english.stackexchange.com',
    // Misc canonical
    'creativecommons.org','opensource.org','sciencedaily.com',
    'phys.org','livescience.com','space.com','quantamagazine.org',
    'arstechnica.com','wired.com','technologyreview.com',
  ]);

  const MEDIUM_HIGH_SUFFIXES = ['.gov','.edu','.mil','.int','.ac.uk','.edu.au','.ac.nz','.edu.cn','.ac.jp','.edu.sg','.ac.in','.edu.br'];

  const LOW = new Set([
    // Known content-mill / mirror domains
    'answers.com','wikihow.com','ehow.com','ezinearticles.com','articlesbase.com',
    'examiner.com','associatedcontent.com','squidoo.com','hubpages.com',
    'buzzle.com','helium.com','suite101.com','triond.com','infobarrel.com',
    'sooperarticles.com','articlesfactory.com','goarticles.com','isnare.com',
    'allexperts.com','wisegeek.com','about.com','life123.com','familyeducation.com',
    'yahoo.com','yahoo.net','aol.com','msn.com',
    'pinterest.com','quora.com',
    // Walled / paywalled mirrors with limited free content
    'scribd.com','academia.edu','coursehero.com','chegg.com','studocu.com',
    // Spam mirror clones
    'w3schools.in','tutorialspoint.com',
  ]);

  const LOW_SUFFIXES = ['.click','.top','.xyz','.tk','.ml','.ga','.cf','.gq','.work','.party','.review','.science','.country','.kim'];

  function hostOf(url){
    if (!url) return '';
    try {
      return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      const m = String(url).match(/^(?:https?:\/\/)?([^\/?#]+)/i);
      return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
    }
  }

  function bucket(url){
    const host = hostOf(url);
    if (!host) return 'unknown';
    if (HIGH.has(host)) return 'high';
    for (const suf of MEDIUM_HIGH_SUFFIXES) if (host.endsWith(suf)) return 'high';
    if (LOW.has(host)) return 'low';
    for (const suf of LOW_SUFFIXES) if (host.endsWith(suf)) return 'low';
    return 'neutral';
  }

  function score(url){
    const b = bucket(url);
    if (b === 'high') return 1.5;
    if (b === 'low') return 0.4;
    return 1.0;
  }

  window.oioxoAuthority = { score, bucket, hostOf, HIGH, LOW };
})();
