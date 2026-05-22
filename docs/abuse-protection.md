# Abuse protection runbook

Layered defense against API abuse, scraping, and bots. The app-level pieces are
already in the codebase; the edge pieces below are set up on your accounts.

## What's already in the code

- **Origin lock** (`middleware.ts`) — every `/api/*` request from another origin
  is rejected `403`. Exempt: payment webhooks, NextAuth callbacks.
- **Per-IP rate limit** (`middleware.ts`) — `240 req/min/IP` across `/api/*`.
  Exempt: `/api/signal`, `/api/turn` (P2P polling), webhooks, auth. In-memory
  per PM2 instance; resets on deploy. This is the *backstop* — Cloudflare is the
  real volume shield.
- **Proof-of-Work gate** (`lib/pow.ts`, `app/api/pow/route.ts`, `middleware.ts`)
  — the costly endpoints (`/api/net/*`, `/api/seo/*`, `/api/speedtest`,
  `/api/fx`, `/api/gpu`) require a short-lived PoW token. The client solves a
  hash puzzle once (~tens of ms, via `powFetch` in `lib/pow-client.ts`), caches
  the 30-min token, and reuses it. The server only verifies HMACs (microseconds,
  no DB). **Difficulty auto-ramps per IP**, so floods get exponentially harder
  while real users stay instant. Callers already wired: the AI skills and every
  `net-*` / `seo-*` tool.
- **SSRF + host validation + own rate limit** for network tools (`lib/net-guard.ts`).
- `clientIp()` already prefers `cf-connecting-ip`, so it reads the true client
  IP once Cloudflare is in front.

### Required: set `POW_SECRET` in production

Both the PoW route (Node) and the middleware (Edge) read `process.env.POW_SECRET`
and **must see the same value**. Set it in the Iceland runtime env (e.g.
`ecosystem.config.js` `env`, or `.env`). Without it they fall back to a known
insecure default (a warning is logged) — fine for local dev, not for prod.

```
POW_SECRET=<long random string, e.g. `openssl rand -hex 32`>
```

## Edge layer — Cloudflare (free tier is enough)

1. **Add the zone**: add `xonvert.com` to Cloudflare, switch nameservers, set the
   record for `new.xonvert.com` to **Proxied** (orange cloud).
2. **SSL/TLS**: mode **Full (strict)**. Caddy on Iceland already serves valid
   certs, so this just works. (Or install a Cloudflare Origin cert.)
3. **Bot defense**: Security → Bots → enable **Bot Fight Mode**. Settings →
   Security → **Browser Integrity Check** on, Security Level *Medium*.
4. **Rate limiting rule** (1 free rule): match `URI Path starts with /api/`,
   action **Block**, threshold e.g. `100 req / 1 min` per IP. (Coarser than the
   app limit, but it stops floods *before* they reach Iceland.)
5. **WAF**: enable the free Managed Ruleset + Cloudflare's known-bad rules.
6. **Caching**: leave `/api/*` uncached; let static assets cache normally.

## Lock the origin to Cloudflare (critical — or the limits are bypassable)

Without this, an attacker hits Iceland's IP directly, skips Cloudflare, and can
spoof `X-Forwarded-For`. Two options:

- **Firewall** (simplest): allow inbound `:80/:443` only from
  [Cloudflare's IP ranges](https://www.cloudflare.com/ips/); drop everything else.
- **Or Cloudflare Tunnel**: run `cloudflared` on Iceland, close public 80/443
  entirely. Strongest, no origin IP exposed.

Then in the Caddyfile, trust Cloudflare so client IPs are accurate and not
spoofable:

```caddy
new.xonvert.com {
    # Only trust forwarded headers from Cloudflare's ranges.
    trusted_proxies static <paste Cloudflare IPv4/IPv6 CIDRs>
    reverse_proxy localhost:3000 {
        header_up X-Real-IP {http.request.header.CF-Connecting-IP}
    }
}
```

## Optional next step — Turnstile on sensitive forms

For signup / contact / support (account creation + email abuse), add a
**Cloudflare Turnstile** widget and verify the token server-side in the route
handler. This blocks scripted account/spam abuse without a password puzzle for
real users. (Not wired up yet — say the word and I'll add the verify step.)

## What this does NOT do

None of this hides client-side code (impossible for a web app). It makes
*abuse* expensive and *scraping* hard. Code-copy protection is the separate
watermark + LICENSE + Terms layer.
