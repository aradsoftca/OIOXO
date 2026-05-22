# Self-hosted GeoIP databases

`net-ip-lookup` and the geolocation in `net-my-ip` read **local** `.mmdb`
databases — no third-party API. [`lib/geoip.ts`](../../lib/geoip.ts) auto-detects
the files in this folder (or `$GEOIP_DIR`) by name: any `*city*.mmdb` is used for
location, any `*asn*.mmdb` for the network/ASN. If neither exists the routes
return HTTP 503 with a clear message; the other network tools keep working.

## Recommended source — DB-IP Lite (free, no signup)

CC-BY 4.0, refreshed monthly, mmdb-compatible. **Attribution to DB-IP is shown
in the tool UI — keep it.** Download the current month's files:

```sh
cd data/geoip
curl -L -o dbip-city-lite.mmdb.gz https://download.db-ip.com/free/dbip-city-lite-$(date +%Y-%m).mmdb.gz
curl -L -o dbip-asn-lite.mmdb.gz  https://download.db-ip.com/free/dbip-asn-lite-$(date +%Y-%m).mmdb.gz
gunzip -f dbip-city-lite.mmdb.gz dbip-asn-lite.mmdb.gz
```

Add a monthly cron to refresh (the URL date rolls over each month).

## Alternative — MaxMind GeoLite2 (free account / license key)

Slightly higher accuracy. Download `GeoLite2-City.mmdb` + `GeoLite2-ASN.mmdb`
(manually or via `geoipupdate`) into this folder — the loader picks them up the
same way.

The `.mmdb` files are git-ignored; each server downloads its own copy.
