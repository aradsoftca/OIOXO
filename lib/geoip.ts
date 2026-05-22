/**
 * Self-hosted GeoIP — reads .mmdb files from local disk. No third-party API:
 * the whole database ships with the server.
 *
 * Works with either free, mmdb-format source (auto-detected by filename):
 *   - DB-IP Lite      (no signup, CC-BY): dbip-city-lite-*.mmdb / dbip-asn-lite-*.mmdb
 *   - MaxMind GeoLite2 (free account):     GeoLite2-City.mmdb   / GeoLite2-ASN.mmdb
 *
 * Drop the files in $GEOIP_DIR (default <project>/data/geoip) — see the README
 * there. Readers are opened once and cached for the life of the process.
 */

import path from 'path';
import { promises as fs } from 'fs';
import type { Reader, CityResponse, AsnResponse } from 'maxmind';

const DIR = process.env.GEOIP_DIR || path.join(process.cwd(), 'data', 'geoip');

let cityReader: Reader<CityResponse> | null = null;
let asnReader: Reader<AsnResponse> | null = null;
let loaded = false;

/** Newest .mmdb in DIR whose name matches re, or null. */
async function findDb(re: RegExp): Promise<string | null> {
  let files: string[];
  try { files = await fs.readdir(DIR); } catch { return null; }
  const matches = files.filter((f) => f.toLowerCase().endsWith('.mmdb') && re.test(f.toLowerCase())).sort();
  return matches.length ? path.join(DIR, matches[matches.length - 1]) : null;
}

/** Returns true if at least the City database is available. */
export async function geoipReady(): Promise<boolean> {
  await load();
  return cityReader !== null;
}

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const maxmind = await import('maxmind');
  const cityPath = await findDb(/city/);
  const asnPath = await findDb(/asn/);
  if (cityPath) cityReader = await maxmind.open<CityResponse>(cityPath);
  if (asnPath) asnReader = await maxmind.open<AsnResponse>(asnPath);
}

export interface GeoResult {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  postal?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  asn?: number;
  org?: string;
}

/** Look an IP up in the local databases. Throws if no DB is installed. */
export async function geoLookup(ip: string): Promise<GeoResult> {
  await load();
  if (!cityReader && !asnReader) {
    throw new Error('GeoIP database not installed on this server.');
  }
  const out: GeoResult = { ip };

  const c = cityReader?.get(ip);
  if (c) {
    out.city = c.city?.names?.en;
    out.region = c.subdivisions?.[0]?.names?.en;
    out.country = c.country?.names?.en;
    out.countryCode = c.country?.iso_code;
    out.postal = c.postal?.code;
    out.latitude = c.location?.latitude;
    out.longitude = c.location?.longitude;
    out.timezone = c.location?.time_zone;
  }

  const a = asnReader?.get(ip);
  if (a) {
    out.asn = a.autonomous_system_number;
    out.org = a.autonomous_system_organization;
  }

  return out;
}
