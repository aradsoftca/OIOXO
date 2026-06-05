/**
 * Phishing / malware heuristic — static, on-device URL safety check.
 * Flags suspicious URLs without sending them to any external service.
 *
 *   isSuspicious(url) → boolean
 *   why(url)           → array of reasons
 *
 * Heuristics:
 *   - Punycode / IDN homograph
 *   - Known-bad TLDs (.click, .top, .xyz when used in spam)
 *   - URL shorteners (could mask redirect)
 *   - Long random-looking subdomains
 *   - Numeric-only hosts
 *   - Login-like phrases combined with non-canonical host
 *
 * Exposes window.oioxoPhishing = { isSuspicious, why, hostOf }.
 */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.oioxoPhishing) return;

  const BAD_TLDS = new Set(['click','top','xyz','tk','ml','ga','cf','gq','su','cn-test']);
  const SHORTENERS = new Set([
    'bit.ly','t.co','goo.gl','tinyurl.com','ow.ly','is.gd','buff.ly','adf.ly','soo.gd',
    'rebrand.ly','cutt.ly','shorturl.at','rb.gy','tiny.cc','y2u.be',
  ]);

  function hostOf(url){
    if (!url) return '';
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
    catch {
      const m = String(url).match(/^(?:https?:\/\/)?([^\/?#]+)/i);
      return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
    }
  }

  function why(url){
    const reasons = [];
    const host = hostOf(url);
    if (!host) return reasons;
    // Punycode IDN
    if (host.includes('xn--')) reasons.push('idn-homograph-risk');
    // Long random-looking subdomain
    const parts = host.split('.');
    if (parts.some((p) => p.length > 30 && !/^[a-z]+$/.test(p))) reasons.push('random-subdomain');
    // Numeric host
    if (/^[\d.]+$/.test(host)) reasons.push('numeric-host');
    // Bad TLD
    const tld = parts[parts.length - 1];
    if (BAD_TLDS.has(tld)) reasons.push('spam-tld');
    // URL shortener (could mask malicious redirect)
    if (SHORTENERS.has(host)) reasons.push('shortener');
    // Login-shaped path on non-canonical host
    if (/\/(?:login|signin|verify|account|update|secure)\b/i.test(url) && !/^(?:google|microsoft|apple|amazon|paypal)\./.test(host)){
      // Not necessarily bad but worth a flag.
      reasons.push('login-on-non-canonical');
    }
    return reasons;
  }

  function isSuspicious(url){
    const reasons = why(url);
    // Don't flag for login-on-non-canonical alone.
    return reasons.filter((r) => r !== 'login-on-non-canonical').length > 0;
  }

  window.oioxoPhishing = { isSuspicious, why, hostOf };
})();
